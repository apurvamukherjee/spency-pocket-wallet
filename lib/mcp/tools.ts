import type { AuthInfo, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { fetchAppData, ok } from "@/lib/data/fetch";
import { enginePlan } from "@/lib/data/plan";
import * as rows from "@/lib/data/rows";
import type { AppData, PlanInput } from "@/lib/data/types";
import { addDays, dayInMonth, monthOf, toLocalDate, todayIn } from "@/lib/engine/dates";
import { billStatus, summarize } from "@/lib/engine/derive";
import { defaultEnvelopeId, normalizeMerchant } from "@/lib/engine/inbox";
import { categoryLabel } from "@/lib/data/category";
import { moneyFormatter, unitOf } from "@/lib/engine/money";
import { reconcileGap } from "@/lib/engine/reconcile";
import type { Commitment, Envelope, Txn } from "@/lib/engine/types";
import type { Supabase } from "@/lib/supabase/client";
import { supabaseAs } from "@/lib/supabase/token";
import {
  beforePlanNote,
  categoryByName,
  findEnvelope,
  planImport,
  summaryPayload,
  ToolInputError,
  toMinor,
  toSignedMinor,
  txnPayload,
} from "./logic";

export const INSTRUCTIONS = `Spency is the user's personal spending tracker. It helps them end each month on a balance they chose.

Logging payments from screenshots (UPI, card, bank or wallet apps):
1. Call get_summary first to learn the user's currency, envelope names and today's date.
2. For every payment in the screenshots extract: merchant (who was paid, cleaned up, e.g. "Swiggy" not "SWIGGY*BANGALORE"), amount, the date-time with time zone offset, the reference number (UPI ref / UTR / transaction ID) if visible, and whether money went out (debit) or came in (credit).
3. Call add_transactions once with all of them. Set suggested_category to the closest envelope or bill name from get_summary (a bill payment like rent or Netflix should use the bill's name). If nothing fits, leave suggested_category out: Spency files it under the user's default envelope (usually Small stuff). Never choose Flex yourself; the user marks Flex when they want it.
4. Everything you add is pending. Tell the user to confirm it in Spency's Inbox; nothing changes their balances until they do.

Past days and corrections: payments from earlier days go through add_transactions with their real date. To fix something already in Spency (wrong amount, category, date, or a payment that shouldn't be there), call list_transactions to find its id, then update_transaction or remove_transaction. Bills, envelopes and the month plan can be changed with update_commitment, remove_commitment, update_envelope, remove_envelope and update_plan. When the user says a bill has or hasn't gone out ("Netflix hasn't gone out yet", "rent is paid"), use set_bill_paid. Say what you're about to change and get a yes before removing anything or changing balances. Only the user can confirm pending payments, in the app.

Questions like "can I afford a 1,500 dinner?": call get_summary and compare with safe_to_spend_today (today's comfortable amount) and flex_left (room for unplanned spends). Be honest and kind; never guilt the user.

Amounts are in the user's currency in normal units (249.50), never in cents or paise.`;

const amount = z.union([z.number().positive(), z.string().min(1)]).describe("Amount in the user's currency, normal units, e.g. 249 or \"249.50\"");
/** Balances and targets can be zero or negative (an overdrawn account). */
const balance = z
  .union([z.number(), z.string().min(1)])
  .describe("Amount in the user's currency, normal units; may be zero or negative, e.g. -2000");
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

type Ctx = { http?: { authInfo?: AuthInfo } };
type Session = { sb: Supabase; data: AppData; unit: number; money: ReturnType<typeof moneyFormatter>; today: string };

class NotAuthenticatedError extends Error {
  override name = "NotAuthenticatedError";
}

async function open(ctx: Ctx): Promise<Session> {
  const auth = ctx.http?.authInfo;
  const userId = auth?.extra?.userId;
  if (!auth || typeof userId !== "string") throw new NotAuthenticatedError("No Spency account on this connection");
  const email = typeof auth.extra?.email === "string" ? auth.extra.email : null;
  const sb = supabaseAs(auth.token);
  const data = await fetchAppData(sb, { id: userId, email });
  const { currency, locale, timeZone } = data.profile;
  return { sb, data, unit: unitOf(currency), money: moneyFormatter({ currency, locale }), today: todayIn(timeZone) };
}

const text = (payload: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }] });
const failure = (message: string) => ({ content: [{ type: "text" as const, text: message }], isError: true });

/** Input problems go back to Claude verbatim so it can fix the call; anything else is logged and summarized. */
function guard<A>(run: (args: A, s: Session) => Promise<unknown>) {
  return async (args: A, ctx: Ctx) => {
    try {
      return text(await run(args, await open(ctx)));
    } catch (e) {
      if (e instanceof ToolInputError) return failure(e.message);
      console.error("MCP tool failed", e);
      return failure("Spency couldn't complete that right now. Please try again in a moment.");
    }
  };
}

const fallbackEnvelope = (s: Session) => defaultEnvelopeId(s.data.envelopes, s.data.profile.defaultEnvelopeId);

function needsPlan(s: Session) {
  const { plan, profile } = s.data;
  if (!plan || plan.month !== monthOf(s.today)) {
    throw new ToolInputError("The user hasn't set up this month's plan yet. Ask them to open Spency once to set their balance and target.");
  }
  return summarize({ ...s.data, plan: enginePlan(plan, profile) }, s.today);
}

const withNote = (note: string | undefined) => (note ? { note_for_user: note } : {});

function findCommitment(cs: Commitment[], name: string): Commitment {
  const n = name.trim().toLowerCase();
  const c = cs.find((x) => x.name.toLowerCase() === n);
  if (!c) throw new ToolInputError(`No bill called "${name}". Existing: ${cs.map((x) => x.name).join(", ") || "none"}.`);
  return c;
}

/** Existing transactions that share a reference with the incoming batch, even if older than the loaded month. */
async function withReferenceMatches(s: Session, refs: string[]): Promise<Txn[]> {
  if (!refs.length) return s.data.txns;
  const res = await s.sb.from("transactions").select("*").in("upi_ref", refs).neq("status", "rejected");
  ok(res);
  const known = new Set(s.data.txns.map((t) => t.id));
  return [...s.data.txns, ...(res.data ?? []).map(rows.txnFromRow).filter((t) => !known.has(t.id))];
}

export function registerTools(server: McpServer) {
  server.registerTool(
    "get_summary",
    {
      title: "Get spending summary",
      description:
        "Today's safe-to-spend amount, this week's envelopes (spent, left, overspend and what covered it), flex left, bills still due, projected month-end vs target, and the user's envelope names. Call this first before adding transactions or answering affordability questions.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true },
    },
    guard(async (_args: Record<string, never>, s) => ({
      currency: s.data.profile.currency,
      ...summaryPayload(needsPlan(s), s.data, s.money, s.unit),
    })),
  );

  server.registerTool(
    "add_transactions",
    {
      title: "Add payments to the Inbox",
      description:
        "Send payments read from screenshots to the user's Spency Inbox as pending (the user confirms them in the app). Merchant memory is applied, and duplicates (same reference, or same merchant and amount within 2 minutes) are skipped and reported.",
      inputSchema: z.object({
        transactions: z
          .array(
            z.object({
              amount,
              merchant: z.string().min(1).max(120).describe("Who was paid (or who paid, for credits), cleaned up"),
              occurred_at: z.string().optional().describe("ISO 8601 date-time with offset, e.g. 2026-11-03T13:02:00+05:30. Defaults to now."),
              reference: z.string().max(64).optional().describe("UPI ref, UTR, or transaction ID if visible"),
              wallet: z.enum(["bank", "cash"]).optional().describe("Default bank (UPI, card and bank transfers are all bank)"),
              direction: z
                .enum(["debit", "credit"])
                .optional()
                .describe(
                  "debit = money out (default), credit = money in. For a refund, set suggested_category to the envelope the original spend was in, and it goes back there; other credits count as income.",
                ),
              suggested_category: z.string().max(60).optional().describe("Closest envelope or bill name from get_summary; leave out if nothing fits"),
              note: z.string().max(500).optional(),
            }),
          )
          .min(1)
          .max(50),
      }),
    },
    guard(async ({ transactions }: { transactions: Parameters<typeof planImport>[1] }, s) => {
      const refs = transactions.map((t) => t.reference?.trim()).filter((r): r is string => !!r);
      const txns = await withReferenceMatches(s, refs);
      const plan = planImport({ ...s.data, txns, defaultEnvelopeId: fallbackEnvelope(s) }, transactions, s.unit, new Date().toISOString(), () => crypto.randomUUID());
      if (plan.add.length) {
        const res = await s.sb.from("transactions").insert(plan.add.map(({ txn }) => rows.txnToRow(txn)));
        if (res.error?.code === "23505") throw new ToolInputError("One of these references was just added by another request. Call add_transactions again and it will be skipped.");
        ok(res);
      }
      return {
        added: plan.add.map(({ txn, via }) => ({
          ...txnPayload(txn, s.data.envelopes, s.data.commitments, s.money),
          ...withNote(beforePlanNote(txn.occurredAt, s.data.plan?.balanceAt ?? null)),
          category_from: {
            memory: "the user's merchant memory",
            bill: "a matching bill (counts as paying it this month)",
            suggestion: "your suggestion",
            default: "no match, so the user's default envelope",
          }[via],
        })),
        skipped_as_duplicates: plan.skipped.map(({ input, duplicateOf }) => ({
          merchant: input.merchant,
          amount: input.amount,
          matches: txnPayload(duplicateOf, s.data.envelopes, s.data.commitments, s.money),
        })),
        next_step: plan.add.length ? "Tell the user these are waiting in Spency's Inbox to confirm." : "Nothing new to add.",
      };
    }),
  );

  server.registerTool(
    "list_transactions",
    {
      title: "List transactions",
      description: "List the user's transactions, newest first. Filter by local date range (YYYY-MM-DD), status, or category (envelope name or Flex).",
      inputSchema: z.object({
        from: isoDate.optional(),
        to: isoDate.optional(),
        status: z.enum(["pending", "confirmed", "rejected"]).optional(),
        category: z.string().optional(),
        limit: z.number().int().min(1).max(200).optional(),
      }),
      annotations: { readOnlyHint: true },
    },
    guard(async (args: { from?: string; to?: string; status?: Txn["status"]; category?: string; limit?: number }, s) => {
      const tz = s.data.profile.timeZone;
      // Pad by a day each side in UTC, then filter on the user's local calendar day.
      let q = s.sb.from("transactions").select("*").order("occurred_at", { ascending: false }).limit(1000);
      if (args.from) q = q.gte("occurred_at", `${addDays(args.from, -1)}T00:00:00Z`);
      if (args.to) q = q.lte("occurred_at", `${addDays(args.to, 1)}T23:59:59Z`);
      if (args.status) q = q.eq("status", args.status);
      const res = await q;
      ok(res);
      const wanted = args.category?.trim().toLowerCase();
      const list = (res.data ?? [])
        .map(rows.txnFromRow)
        .filter((t) => {
          const d = toLocalDate(t.occurredAt, tz);
          return (!args.from || d >= args.from) && (!args.to || d <= args.to);
        })
        .filter((t) => !wanted || categoryLabel(s.data.envelopes, s.data.commitments, t).toLowerCase() === wanted)
        .slice(0, args.limit ?? 50);
      return { count: list.length, transactions: list.map((t) => txnPayload(t, s.data.envelopes, s.data.commitments, s.money)) };
    }),
  );

  server.registerTool(
    "update_envelope",
    {
      title: "Update or create an envelope",
      description:
        "Change an envelope's weekly limit, name, lock, or what happens to leftover money. If no envelope has this name and weekly_limit is given, a new envelope is created. Confirm with the user before changing their budget.",
      inputSchema: z.object({
        name: z.string().min(1).max(60).describe("Current envelope name"),
        new_name: z.string().min(1).max(60).optional(),
        weekly_limit: amount.optional(),
        locked: z.boolean().optional().describe("Locked envelopes keep their savings instead of covering others"),
        leftover: z.enum(["rollover", "to_flex", "to_target"]).optional().describe("Week-end leftovers: carry over, add to flex, or save toward the target"),
      }),
    },
    guard(async (args: { name: string; new_name?: string; weekly_limit?: number | string; locked?: boolean; leftover?: Envelope["leftover"] }, s) => {
      const current = findEnvelope(s.data.envelopes, args.name);
      if (!current && args.weekly_limit === undefined) {
        throw new ToolInputError(`No envelope called "${args.name}". Existing: ${s.data.envelopes.map((e) => e.name).join(", ") || "none"}. Pass weekly_limit to create it.`);
      }
      const next: Envelope = {
        id: current?.id ?? crypto.randomUUID(),
        name: args.new_name?.trim() || current?.name || args.name.trim(),
        weeklyLimit: args.weekly_limit !== undefined ? toMinor(args.weekly_limit, s.unit) : (current?.weeklyLimit ?? 0),
        locked: args.locked ?? current?.locked ?? false,
        leftover: args.leftover ?? current?.leftover ?? "rollover",
      };
      const position = current ? s.data.envelopes.indexOf(current) : s.data.envelopes.length;
      ok(await s.sb.from("envelopes").upsert(rows.envelopeToRow(next, position)));
      return { [current ? "updated" : "created"]: { ...next, weeklyLimit: s.money(next.weeklyLimit) } };
    }),
  );

  server.registerTool(
    "add_commitment",
    {
      title: "Add a recurring bill",
      description: "Add a fixed recurring debit (rent, subscription, loan EMI). Bills are set aside before envelopes and flex.",
      inputSchema: z.object({
        name: z.string().min(1).max(60),
        amount,
        frequency: z.enum(["weekly", "monthly", "yearly"]).optional().describe("Default monthly"),
        next_debit: isoDate.describe("Next date it will be charged"),
      }),
    },
    guard(async (args: { name: string; amount: number | string; frequency?: Commitment["frequency"]; next_debit: string }, s) => {
      const c: Commitment = {
        id: crypto.randomUUID(),
        name: args.name.trim(),
        amount: toMinor(args.amount, s.unit),
        frequency: args.frequency ?? "monthly",
        nextDebit: args.next_debit,
      };
      ok(await s.sb.from("commitments").insert(rows.commitmentToRow(c)));
      return { added: { ...c, amount: s.money(c.amount) } };
    }),
  );

  server.registerTool(
    "log_cash",
    {
      title: "Log cash",
      description:
        "Log a cash spend, or a cash withdrawal from the bank (which moves money to cash and isn't spending). Arrives pending in the Inbox like other payments.",
      inputSchema: z.object({
        amount,
        kind: z.enum(["spend", "withdrawal"]).optional().describe("Default spend"),
        merchant: z.string().max(120).optional(),
        suggested_category: z.string().max(60).optional(),
        occurred_at: z.string().optional(),
        note: z.string().max(500).optional(),
      }),
    },
    guard(async (args: { amount: number | string; kind?: "spend" | "withdrawal"; merchant?: string; suggested_category?: string; occurred_at?: string; note?: string }, s) => {
      const now = new Date().toISOString();
      if (args.kind === "withdrawal") {
        const when = args.occurred_at ? new Date(args.occurred_at) : new Date(now);
        if (Number.isNaN(when.getTime())) throw new ToolInputError(`"${args.occurred_at}" isn't a date-time.`);
        const t: Txn = {
          id: crypto.randomUUID(),
          wallet: "bank",
          amount: toMinor(args.amount, s.unit),
          direction: "debit",
          kind: "transfer",
          merchant: args.merchant?.trim() || "Cash withdrawal",
          envelopeId: null,
          commitmentId: null,
          occurredAt: when.toISOString(),
          source: "claude",
          status: "pending",
          upiRef: null,
          note: args.note?.trim() || null,
          createdAt: now,
        };
        ok(await s.sb.from("transactions").insert(rows.txnToRow(t)));
        return { added: txnPayload(t, s.data.envelopes, s.data.commitments, s.money), next_step: "Waiting in the Inbox to confirm." };
      }
      const plan = planImport(
        { ...s.data, defaultEnvelopeId: fallbackEnvelope(s) },
        [{ amount: args.amount, merchant: args.merchant?.trim() || "Cash", wallet: "cash", suggested_category: args.suggested_category, occurred_at: args.occurred_at, note: args.note }],
        s.unit,
        now,
        () => crypto.randomUUID(),
      );
      if (!plan.add.length) return { skipped_as_duplicate: true };
      const t = plan.add[0].txn;
      ok(await s.sb.from("transactions").insert(rows.txnToRow(t)));
      return { added: txnPayload(t, s.data.envelopes, s.data.commitments, s.money), next_step: "Waiting in the Inbox to confirm." };
    }),
  );

  server.registerTool(
    "update_transaction",
    {
      title: "Correct a payment",
      description:
        "Fix any payment, pending or confirmed, including past days: amount, merchant, category (envelope name or Flex), wallet, date-time, direction or note. Find the id with list_transactions first. Changing the category teaches merchant memory, like it does in the app. Tell the user what will change before calling.",
      inputSchema: z.object({
        id: z.string().uuid().describe("Transaction id from list_transactions"),
        amount: amount.optional(),
        merchant: z.string().min(1).max(120).optional(),
        category: z.string().max(60).optional().describe("Envelope or bill name; Flex only if the user asks"),
        wallet: z.enum(["bank", "cash"]).optional(),
        occurred_at: z.string().optional().describe("ISO 8601 with offset"),
        direction: z.enum(["debit", "credit"]).optional(),
        note: z.string().max(500).optional().describe("Empty string clears the note"),
      }),
      annotations: { idempotentHint: true },
    },
    guard(
      async (
        args: {
          id: string;
          amount?: number | string;
          merchant?: string;
          category?: string;
          wallet?: Txn["wallet"];
          occurred_at?: string;
          direction?: Txn["direction"];
          note?: string;
        },
        s,
      ) => {
        const found = await s.sb.from("transactions").select("*").eq("id", args.id).maybeSingle();
        ok(found);
        if (!found.data) throw new ToolInputError("No payment with that id. Call list_transactions to find it.");
        const before = rows.txnFromRow(found.data);
        const when = args.occurred_at !== undefined ? new Date(args.occurred_at) : null;
        if (when && Number.isNaN(when.getTime())) throw new ToolInputError(`"${args.occurred_at}" isn't a date-time.`);
        const patch = {
          ...(args.amount !== undefined ? { amount: toMinor(args.amount, s.unit) } : {}),
          ...(args.merchant !== undefined ? { merchant: args.merchant.trim() } : {}),
          ...(args.category !== undefined ? categoryByName(s.data.envelopes, s.data.commitments, args.category) : {}),
          ...(args.wallet !== undefined ? { wallet: args.wallet } : {}),
          ...(when ? { occurredAt: when.toISOString() } : {}),
          ...(args.direction !== undefined ? { direction: args.direction } : {}),
          ...(args.note !== undefined ? { note: args.note.trim() || null } : {}),
        };
        if (Object.keys(patch).length === 0) throw new ToolInputError("Nothing to change. Pass at least one field.");
        ok(await s.sb.from("transactions").update(rows.txnPatchToRow(patch)).eq("id", args.id));
        if (patch.envelopeId !== undefined && !patch.commitmentId && patch.envelopeId !== before.envelopeId) {
          ok(
            await s.sb
              .from("merchant_memory")
              .upsert({ merchant: normalizeMerchant(patch.merchant ?? before.merchant), envelope_id: patch.envelopeId }),
          );
        }
        const after: Txn = { ...before, ...patch };
        return {
          before: txnPayload(before, s.data.envelopes, s.data.commitments, s.money),
          after: txnPayload(after, s.data.envelopes, s.data.commitments, s.money),
          effect: after.status === "confirmed" ? "Balances and envelopes are updated." : "Still waiting in the Inbox for the user to confirm.",
          ...withNote(beforePlanNote(after.occurredAt, s.data.plan?.balanceAt ?? null)),
        };
      },
    ),
  );

  server.registerTool(
    "remove_transaction",
    {
      title: "Remove a payment",
      description:
        "Take a payment out of Spency (a duplicate, a mistake, a refunded order). Works for pending and confirmed payments, the same as Remove in the app. Ask the user first.",
      inputSchema: z.object({ id: z.string().uuid().describe("Transaction id from list_transactions") }),
      annotations: { destructiveHint: true, idempotentHint: true },
    },
    guard(async ({ id }: { id: string }, s) => {
      const res = await s.sb.from("transactions").update({ status: "rejected" }).eq("id", id).select("*").maybeSingle();
      ok(res);
      if (!res.data) throw new ToolInputError("No payment with that id. Call list_transactions to find it.");
      return { removed: txnPayload(rows.txnFromRow(res.data), s.data.envelopes, s.data.commitments, s.money), effect: "No longer counts toward any balance." };
    }),
  );

  server.registerTool(
    "update_commitment",
    {
      title: "Change a recurring bill",
      description: "Change a bill's name, amount, frequency or next debit date. Find it by its current name.",
      inputSchema: z.object({
        name: z.string().min(1).max(60).describe("Current bill name"),
        new_name: z.string().min(1).max(60).optional(),
        amount: amount.optional(),
        frequency: z.enum(["weekly", "monthly", "yearly"]).optional(),
        next_debit: isoDate.optional(),
      }),
      annotations: { idempotentHint: true },
    },
    guard(async (args: { name: string; new_name?: string; amount?: number | string; frequency?: Commitment["frequency"]; next_debit?: string }, s) => {
      const c = findCommitment(s.data.commitments, args.name);
      const next: Commitment = {
        ...c,
        name: args.new_name?.trim() || c.name,
        amount: args.amount !== undefined ? toMinor(args.amount, s.unit) : c.amount,
        frequency: args.frequency ?? c.frequency,
        nextDebit: args.next_debit ?? c.nextDebit,
      };
      ok(await s.sb.from("commitments").update(rows.commitmentToRow(next)).eq("id", c.id));
      return { updated: { ...next, amount: s.money(next.amount) } };
    }),
  );

  server.registerTool(
    "remove_commitment",
    {
      title: "Remove a recurring bill",
      description: "Stop tracking a bill. Past payments for it stay in the history. Ask the user first.",
      inputSchema: z.object({ name: z.string().min(1).max(60).describe("Current bill name") }),
      annotations: { destructiveHint: true },
    },
    guard(async ({ name }: { name: string }, s) => {
      const c = findCommitment(s.data.commitments, name);
      ok(await s.sb.from("commitments").delete().eq("id", c.id));
      return { removed: c.name };
    }),
  );

  server.registerTool(
    "remove_envelope",
    {
      title: "Remove an envelope",
      description: "Delete an envelope. Its past payments and merchant mappings move to Flex. Ask the user first.",
      inputSchema: z.object({ name: z.string().min(1).max(60).describe("Current envelope name") }),
      annotations: { destructiveHint: true },
    },
    guard(async ({ name }: { name: string }, s) => {
      const e = findEnvelope(s.data.envelopes, name);
      if (!e) throw new ToolInputError(`No envelope called "${name}". Existing: ${s.data.envelopes.map((x) => x.name).join(", ") || "none"}.`);
      ok(await s.sb.from("envelopes").delete().eq("id", e.id));
      return { removed: e.name, effect: "Its past payments now count as Flex." };
    }),
  );

  server.registerTool(
    "update_plan",
    {
      title: "Change this month's plan",
      description:
        "Change the month-end target, expected pay (amount and pay day of the month), week start, or reset the starting bank and cash balances to what the user has right now (that becomes the new starting point, as in Settings). Confirm with the user first.",
      inputSchema: z.object({
        target: balance.optional().describe("Balance the user wants at month end; negative to pay an overdraft down, e.g. \"-5000\""),
        salary_amount: amount.optional(),
        pay_day: z.number().int().min(1).max(31).optional().describe("Day of the month pay arrives"),
        remove_salary: z.boolean().optional(),
        week_start: z.enum(["monday", "sunday"]).optional(),
        bank_balance: balance.optional().describe("Real bank balance right now; negative if overdrawn"),
        cash_in_hand: z.union([z.number().min(0), z.string()]).optional().describe("Cash right now; 0 if none"),
      }),
    },
    guard(
      async (
        args: {
          target?: number | string;
          salary_amount?: number | string;
          pay_day?: number;
          remove_salary?: boolean;
          week_start?: "monday" | "sunday";
          bank_balance?: number | string;
          cash_in_hand?: number | string;
        },
        s,
      ) => {
        const now = needsPlan(s);
        const plan = s.data.plan;
        if (!plan) throw new ToolInputError("No plan for this month yet.");
        const patch: Partial<PlanInput> = {};
        if (args.target !== undefined) patch.target = toSignedMinor(args.target, s.unit);
        if (args.week_start) patch.weekStart = args.week_start === "monday" ? 1 : 0;
        if (args.remove_salary) patch.salary = null;
        else if (args.salary_amount !== undefined || args.pay_day !== undefined) {
          const salary = args.salary_amount !== undefined ? toMinor(args.salary_amount, s.unit) : plan.salary?.amount;
          const day = args.pay_day ?? (plan.salary ? +plan.salary.date.slice(8) : undefined);
          if (salary === undefined || day === undefined) throw new ToolInputError("Give both salary_amount and pay_day the first time.");
          patch.salary = { amount: salary, date: dayInMonth(plan.month, day) };
        }
        if (args.bank_balance !== undefined || args.cash_in_hand !== undefined) {
          patch.openingBank = args.bank_balance !== undefined ? toSignedMinor(args.bank_balance, s.unit) : now.bank;
          patch.openingCash =
            args.cash_in_hand === undefined ? now.cash : Number(args.cash_in_hand) === 0 ? 0 : toMinor(args.cash_in_hand, s.unit);
          patch.balanceAt = new Date().toISOString();
        }
        if (Object.keys(patch).length === 0) throw new ToolInputError("Nothing to change. Pass at least one field.");
        ok(await s.sb.from("month_plans").update(rows.planToRow(patch)).eq("id", plan.id));
        const after = summarize({ ...s.data, plan: enginePlan({ ...plan, ...patch }, s.data.profile) }, s.today);
        return {
          changed: Object.keys(patch),
          safe_to_spend_today: s.money(after.safeToday),
          projected_month_end: s.money(after.projected),
          target_month_end: s.money(after.target),
        };
      },
    ),
  );

  server.registerTool(
    "set_bill_paid",
    {
      title: "Mark a bill paid or not paid this month",
      description:
        "Tell Spency whether a bill has gone out this month. paid=false: a bill Spency assumed was paid is set aside again as not paid yet, or a logged payment for it is removed (ask the user first). paid=true: logs the payment as pending in the Inbox (the bill shows paid once the user confirms it); if the bill was marked not paid yet but actually went out before this month's plan started, pass paid_at with that earlier date and it's simply undone. Find bills by name from get_summary.",
      inputSchema: z.object({
        name: z.string().min(1).max(60).describe("Bill name"),
        paid: z.boolean(),
        amount: amount.optional().describe("Amount actually paid, if different from the bill"),
        paid_at: z.string().optional().describe("When it went out, ISO 8601 with offset; defaults to now"),
      }),
    },
    guard(async (args: { name: string; paid: boolean; amount?: number | string; paid_at?: string }, s) => {
      needsPlan(s);
      const stored = s.data.plan;
      if (!stored) throw new ToolInputError("No plan for this month yet.");
      const plan = enginePlan(stored, s.data.profile);
      const c = findCommitment(s.data.commitments, args.name);
      const status = billStatus(plan, c, s.data.txns);
      const unpaid = stored.unpaidBills ?? [];
      const setUnpaid = async (ids: string[]) => ok(await s.sb.from("month_plans").update({ unpaid_bills: ids }).eq("id", stored.id));

      if (!args.paid) {
        if (status.state === "due") return { bill: c.name, status: "Already not paid", still_due: s.money(status.due) };
        if (status.paymentIds.length) {
          ok(await s.sb.from("transactions").update({ status: "rejected" }).in("id", status.paymentIds));
          return { bill: c.name, status: "Due again", removed_payments: status.paymentIds.length };
        }
        if (status.state === "assumed_paid") {
          await setUnpaid([...unpaid, c.id]);
          return { bill: c.name, status: "Not paid yet", effect: `${s.money(c.amount)} is set aside again for it this month.` };
        }
        return { bill: c.name, status: "Not due this month", next_debit: c.nextDebit };
      }

      if (status.state === "paid" || status.state === "assumed_paid") return { bill: c.name, status: "Already paid this month" };
      if (status.state === "none") return { bill: c.name, status: "Not due this month", next_debit: c.nextDebit };
      const when = args.paid_at ? new Date(args.paid_at) : new Date();
      if (Number.isNaN(when.getTime())) throw new ToolInputError(`"${args.paid_at}" isn't a date-time.`);
      if (unpaid.includes(c.id) && status.paymentIds.length === 0 && when.getTime() <= Date.parse(stored.balanceAt)) {
        await setUnpaid(unpaid.filter((id) => id !== c.id));
        return { bill: c.name, status: "Paid before this month's plan", effect: "Back to done; the starting balance already included it." };
      }
      const t: Txn = {
        id: crypto.randomUUID(),
        wallet: "bank",
        amount: args.amount !== undefined ? toMinor(args.amount, s.unit) : status.due,
        direction: "debit",
        kind: "expense",
        merchant: c.name,
        envelopeId: null,
        commitmentId: c.id,
        occurredAt: when.toISOString(),
        source: "claude",
        status: "pending",
        upiRef: null,
        note: null,
        createdAt: new Date().toISOString(),
      };
      ok(await s.sb.from("transactions").insert(rows.txnToRow(t)));
      return {
        bill: c.name,
        status: "Payment waiting in the Inbox",
        payment: txnPayload(t, s.data.envelopes, s.data.commitments, s.money),
        next_step: "Tell the user to confirm it in Spency; the bill shows paid once they do.",
      };
    }),
  );

  server.registerTool(
    "reconcile",
    {
      title: "Check the bank balance",
      description:
        "Compare the user's real bank balance with Spency's. Returns the difference so you can help find a missing payment. Does not change anything unless the balances match (then it records today's check).",
      inputSchema: z.object({ actual_bank_balance: balance.describe("What the user's bank app shows right now; negative if overdrawn") }),
    },
    guard(async ({ actual_bank_balance }: { actual_bank_balance: number | string }, s) => {
      const summary = needsPlan(s);
      const actual = toSignedMinor(actual_bank_balance, s.unit);
      const gap = reconcileGap(summary.bank, actual);
      if (gap === 0) {
        ok(await s.sb.from("reconcile_checks").upsert(rows.checkToRow({ date: s.today, computed: summary.bank, actual, resolution: "matched" }), { onConflict: "user_id,date" }));
      }
      return {
        spency_bank_balance: s.money(summary.bank),
        actual_bank_balance: s.money(actual),
        difference: s.money(gap, { signed: true }),
        meaning:
          gap === 0
            ? "All square. Today's check is recorded."
            : gap < 0
              ? "The bank has less than Spency expects: probably a payment that hasn't been logged. Ask for recent screenshots."
              : "The bank has more than Spency expects: maybe a refund or credit that hasn't been logged.",
        suggested_merchant_hints: s.data.txns
          .filter((t) => t.status === "pending")
          .map((t) => `${t.merchant} ${s.money(t.amount)} is still pending in the Inbox`),
      };
    }),
  );
}
