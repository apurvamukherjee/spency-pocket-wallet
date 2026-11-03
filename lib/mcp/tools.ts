import type { AuthInfo, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { fetchAppData, ok } from "@/lib/data/fetch";
import { enginePlan } from "@/lib/data/plan";
import * as rows from "@/lib/data/rows";
import type { AppData } from "@/lib/data/types";
import { addDays, monthOf, toLocalDate, todayIn } from "@/lib/engine/dates";
import { summarize } from "@/lib/engine/derive";
import { moneyFormatter, unitOf } from "@/lib/engine/money";
import { reconcileGap } from "@/lib/engine/reconcile";
import type { Commitment, Envelope, Txn } from "@/lib/engine/types";
import type { Supabase } from "@/lib/supabase/client";
import { supabaseAs } from "@/lib/supabase/token";
import { categoryName, findEnvelope, planImport, summaryPayload, ToolInputError, toMinor, txnPayload } from "./logic";

export const INSTRUCTIONS = `Spency is the user's personal spending tracker. It helps them end each month on a balance they chose.

Logging payments from screenshots (UPI, card, bank or wallet apps):
1. Call get_summary first to learn the user's currency, envelope names and today's date.
2. For every payment in the screenshots extract: merchant (who was paid, cleaned up, e.g. "Swiggy" not "SWIGGY*BANGALORE"), amount, the date-time with time zone offset, the reference number (UPI ref / UTR / transaction ID) if visible, and whether money went out (debit) or came in (credit).
3. Call add_transactions once with all of them. Set suggested_category to the closest envelope name from get_summary, or "Flex" for one-off spends.
4. Everything you add is pending. Tell the user to confirm it in Spency's Inbox; nothing changes their balances until they do.

Questions like "can I afford a 1,500 dinner?": call get_summary and compare with safe_to_spend_today (today's comfortable amount) and flex_left (room for unplanned spends). Be honest and kind; never guilt the user.

Amounts are in the user's currency in normal units (249.50), never in cents or paise.`;

const amount = z.union([z.number().positive(), z.string().min(1)]).describe("Amount in the user's currency, normal units, e.g. 249 or \"249.50\"");
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

function needsPlan(s: Session) {
  const { plan, profile } = s.data;
  if (!plan || plan.month !== monthOf(s.today)) {
    throw new ToolInputError("The user hasn't set up this month's plan yet. Ask them to open Spency once to set their balance and target.");
  }
  return summarize({ ...s.data, plan: enginePlan(plan, profile) }, s.today);
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
      ...summaryPayload(needsPlan(s), s.data, s.money),
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
              direction: z.enum(["debit", "credit"]).optional().describe("debit = money out (default), credit = money in"),
              suggested_category: z.string().max(60).optional().describe("Closest envelope name from get_summary, or Flex"),
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
      const plan = planImport({ ...s.data, txns }, transactions, s.unit, new Date().toISOString(), () => crypto.randomUUID());
      if (plan.add.length) {
        const res = await s.sb.from("transactions").insert(plan.add.map(({ txn }) => rows.txnToRow(txn)));
        if (res.error?.code === "23505") throw new ToolInputError("One of these references was just added by another request. Call add_transactions again and it will be skipped.");
        ok(res);
      }
      return {
        added: plan.add.map(({ txn, via }) => ({
          ...txnPayload(txn, s.data.envelopes, s.money),
          category_from: { memory: "the user's merchant memory", suggestion: "your suggestion", flex: "no matching envelope, so Flex" }[via],
        })),
        skipped_as_duplicates: plan.skipped.map(({ input, duplicateOf }) => ({
          merchant: input.merchant,
          amount: input.amount,
          matches: txnPayload(duplicateOf, s.data.envelopes, s.money),
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
        .filter((t) => !wanted || categoryName(s.data.envelopes, t.envelopeId).toLowerCase() === wanted)
        .slice(0, args.limit ?? 50);
      return { count: list.length, transactions: list.map((t) => txnPayload(t, s.data.envelopes, s.money)) };
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
        return { added: txnPayload(t, s.data.envelopes, s.money), next_step: "Waiting in the Inbox to confirm." };
      }
      const plan = planImport(
        s.data,
        [{ amount: args.amount, merchant: args.merchant?.trim() || "Cash", wallet: "cash", suggested_category: args.suggested_category, occurred_at: args.occurred_at, note: args.note }],
        s.unit,
        now,
        () => crypto.randomUUID(),
      );
      if (!plan.add.length) return { skipped_as_duplicate: true };
      const t = plan.add[0].txn;
      ok(await s.sb.from("transactions").insert(rows.txnToRow(t)));
      return { added: txnPayload(t, s.data.envelopes, s.money), next_step: "Waiting in the Inbox to confirm." };
    }),
  );

  server.registerTool(
    "reconcile",
    {
      title: "Check the bank balance",
      description:
        "Compare the user's real bank balance with Spency's. Returns the difference so you can help find a missing payment. Does not change anything unless the balances match (then it records today's check).",
      inputSchema: z.object({ actual_bank_balance: amount.describe("What the user's bank app shows right now") }),
    },
    guard(async ({ actual_bank_balance }: { actual_bank_balance: number | string }, s) => {
      const summary = needsPlan(s);
      const actual = toMinor(actual_bank_balance, s.unit);
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
