import { type Category, categoryLabel, FLEX } from "@/lib/data/category";
import type { AppData } from "@/lib/data/types";
import { addDays } from "@/lib/engine/dates";
import { catchUp, type Summary } from "@/lib/engine/derive";
import { findDuplicate, type MerchantMemory, recallEnvelope } from "@/lib/engine/inbox";
import type { FormatMoney } from "@/lib/engine/money";
import { coverLine, describeSettlement, type SettlementStatus } from "@/lib/engine/settle";
import type { Commitment, Envelope, Minor, Txn, Wallet } from "@/lib/engine/types";

// Pure helpers behind the MCP tools: no I/O, so they're unit-tested like the engine.

export class ToolInputError extends Error {
  override name = "ToolInputError";
}

/** 249 · "249.50" · "1,249" · "₹249" → minor units, without floats. Rejects more decimals than the currency has. */
export function toMinor(value: number | string, unit: number): Minor {
  // Checked before stripping currency symbols, which would otherwise turn "-5" into "5".
  if (String(value).includes("-")) throw new ToolInputError("Amounts must be positive. Use direction \"credit\" for money coming in.");
  const text = (typeof value === "number" ? String(value) : value).replace(/[\s,]/g, "").replace(/^[^\d.]+/, "");
  const m = /^(\d{1,13})(?:\.(\d+))?$/.exec(text);
  if (!m) throw new ToolInputError(`"${value}" isn't an amount. Send a positive number like 249 or "249.50".`);
  const digits = Math.log10(unit);
  const frac = (m[2] ?? "").replace(/0+$/, "");
  if (frac.length > digits) throw new ToolInputError(`"${value}" has more decimal places than this currency allows (${digits}).`);
  const minor = Number(m[1]) * unit + Number(frac.padEnd(digits, "0") || "0");
  if (minor <= 0) throw new ToolInputError("Amounts must be greater than zero.");
  return minor;
}

/** For balances and targets, which can be zero or overdrawn: "-2000" → minus 2,000. Payment amounts use toMinor. */
export function toSignedMinor(value: number | string, unit: number): Minor {
  const text = String(value).trim();
  const negative = /^[-\u2212]/.test(text);
  const rest = negative ? text.slice(1) : text;
  // Zero is a valid balance (toMinor rejects it as a payment amount): digits present, and all of them zero.
  const plain = rest.replace(/[\s,]/g, "").replace(/^[^\d.]+/, "");
  if (/\d/.test(plain) && /^0*(?:\.0*)?$/.test(plain)) return 0;
  const v = toMinor(rest, unit);
  return negative ? -v : v;
}

export type CategoryMatch = Category & { via: "memory" | "bill" | "suggestion" | "default" };

/**
 * Merchant memory wins (the user taught it); then a bill whose name matches the merchant or suggestion; then
 * Claude's suggested envelope; otherwise the user's default envelope. Claude suggesting "Flex" is ignored:
 * only the user files things under Flex.
 */
export function resolveCategory(
  envelopes: Envelope[],
  memory: MerchantMemory,
  merchant: string,
  suggestion: string | undefined,
  opts: { bills: Commitment[]; fallback: string | null },
): CategoryMatch {
  const remembered = recallEnvelope(memory, merchant);
  if (remembered !== undefined && (remembered === null || envelopes.some((e) => e.id === remembered))) {
    return { envelopeId: remembered, commitmentId: null, via: "memory" };
  }
  const s = suggestion?.trim().toLowerCase();
  const m = merchant.trim().toLowerCase();
  const bill = opts.bills.find((c) => [s, m].includes(c.name.toLowerCase()));
  if (bill) return { envelopeId: null, commitmentId: bill.id, via: "bill" };
  if (s && s !== "flex") {
    const exact = envelopes.find((e) => e.name.toLowerCase() === s);
    const loose = exact ?? envelopes.find((e) => e.name.toLowerCase().includes(s) || s.includes(e.name.toLowerCase()));
    if (loose) return { envelopeId: loose.id, commitmentId: null, via: "suggestion" };
  }
  return { envelopeId: opts.fallback, commitmentId: null, via: "default" };
}

export function findEnvelope(envelopes: Envelope[], name: string): Envelope | undefined {
  const n = name.trim().toLowerCase();
  return envelopes.find((e) => e.name.toLowerCase() === n);
}

/** Exact envelope or bill name (any case), or "Flex" when the user asked for it; anything else is worth telling Claude about. */
export function categoryByName(envelopes: Envelope[], bills: Commitment[], name: string): Category {
  const n = name.trim().toLowerCase();
  if (n === "flex") return FLEX;
  const e = findEnvelope(envelopes, name);
  if (e) return { envelopeId: e.id, commitmentId: null };
  const b = bills.find((c) => c.name.toLowerCase() === n);
  if (b) return { envelopeId: null, commitmentId: b.id };
  throw new ToolInputError(`No envelope or bill called "${name}". Use one of: ${[...envelopes.map((x) => x.name), ...bills.map((c) => c.name), "Flex"].join(", ")}.`);
}

/** Payments dated before the plan's starting balance are already inside it, so they don't move any number. */
export function beforePlanNote(occurredAt: string, planStart: string | null): string | undefined {
  if (!planStart || Date.parse(occurredAt) > Date.parse(planStart)) return undefined;
  return `Dated before this month's plan started (${planStart.slice(0, 10)}), so it's on record but doesn't change balances: the starting balance already included it.`;
}

export type TxnInput = {
  amount: number | string;
  merchant: string;
  occurred_at?: string;
  reference?: string;
  wallet?: Wallet;
  direction?: "debit" | "credit";
  suggested_category?: string;
  note?: string;
};

export type ImportPlan = {
  add: { txn: Txn; via: CategoryMatch["via"] }[];
  skipped: { input: TxnInput; duplicateOf: Txn }[];
};

/**
 * Turns Claude's parsed payments into pending transactions, skipping duplicates of existing ones
 * (same reference, or same merchant + amount within 2 minutes) and of earlier items in the same batch.
 */
export function planImport(
  d: Pick<AppData, "envelopes" | "memory" | "txns" | "commitments"> & { defaultEnvelopeId: string | null },
  inputs: TxnInput[],
  unit: number,
  now: string,
  newId: () => string,
): ImportPlan {
  const seen = [...d.txns];
  const plan: ImportPlan = { add: [], skipped: [] };
  for (const input of inputs) {
    const merchant = input.merchant.trim();
    if (!merchant) throw new ToolInputError("Every payment needs a merchant name.");
    const when = input.occurred_at ? new Date(input.occurred_at) : new Date(now);
    if (Number.isNaN(when.getTime())) {
      throw new ToolInputError(`"${input.occurred_at}" isn't a date-time. Use ISO 8601, e.g. 2026-11-03T13:02:00+05:30.`);
    }
    const amount = toMinor(input.amount, unit);
    const reference = input.reference?.trim() || null;

    const duplicateOf = findDuplicate({ upiRef: reference, merchant, amount, occurredAt: when.toISOString() }, seen);
    if (duplicateOf) {
      plan.skipped.push({ input, duplicateOf });
      continue;
    }
    const credit = input.direction === "credit";
    const found = resolveCategory(d.envelopes, d.memory, merchant, input.suggested_category, {
      bills: d.commitments,
      fallback: d.defaultEnvelopeId,
    });
    // Money in from a merchant Spency knows (or one Claude filed under an envelope) is a refund: it goes back
    // into that envelope. Anything else, a salary or a friend paying back, is income and goes toward the target.
    const refund = credit && (found.via === "memory" || found.via === "suggestion");
    const category = credit && !refund ? { envelopeId: null, commitmentId: null, via: found.via } : found;
    const txn: Txn = {
      id: newId(),
      wallet: input.wallet ?? "bank",
      amount,
      direction: credit ? "credit" : "debit",
      kind: credit && !refund ? "income" : "expense",
      merchant,
      envelopeId: category.envelopeId,
      commitmentId: refund ? null : category.commitmentId,
      occurredAt: when.toISOString(),
      source: "claude",
      status: "pending",
      upiRef: reference,
      note: input.note?.trim() || null,
      createdAt: now,
    };
    plan.add.push({ txn, via: category.via });
    seen.push(txn);
  }
  return plan;
}

const STATUS_LABEL: Record<SettlementStatus, string> = {
  covered: "On track",
  managed: "Using flex",
  target_hit: "Below target",
};

/** The concrete way back to target, phrased for Claude to pass on kindly. Empty when on track. */
function catchUpPayload(s: Summary, unit: number, money: FormatMoney): { to_get_back_on_track?: string } {
  const c = catchUp(s, unit);
  if (!c) return {};
  return {
    to_get_back_on_track:
      c.kind === "per_day"
        ? `Spend about ${money(c.perDay)} a day less than planned for the rest of the month to end on ${money(s.target)}.`
        : `The gap can't close this month: even with no more spending the user ends ${money(c.shortBy)} short. Suggest a slightly lower target next month.`,
  };
}

/** What Claude needs to answer "can I afford this?" and to map screenshots to envelope names. */
export function summaryPayload(
  s: Summary,
  d: Pick<AppData, "envelopes" | "txns" | "commitments">,
  money: FormatMoney,
  /** Minor units per major unit of the plan currency (unitOf), for rounding the catch-up figure. */
  unit: number,
) {
  const settlement = s.current.settlement;
  return {
    date: s.today,
    // The plan's month may run payday to payday, so it can end on any day.
    month_ends: addDays(s.today, s.daysLeftMonth - 1),
    safe_to_spend_today: money(s.safeToday),
    this_week: {
      status: STATUS_LABEL[s.status],
      days_left: s.daysLeftThisWeek,
      envelope_money_left: money(s.envelopeLeftThisWeek),
      summary: describeSettlement(settlement, { live: !s.current.final, target: s.target, projected: s.projected, fmt: money }),
    },
    envelopes: settlement.envelopes.map((e) => ({
      name: e.name,
      weekly_limit: money(e.limit),
      spent_this_week: money(e.spent),
      ...(e.variance < 0 ? { over_by: money(-e.variance), covered: coverLine(settlement, e.id, money) } : { left: money(e.left) }),
      locked: e.locked,
    })),
    flex_left: money(Math.max(0, s.flexLeft)),
    bills_still_due_this_month: money(s.commitmentsRemaining),
    // Held in the bank for yearly bills that aren't due yet; not spendable, not part of the target.
    set_aside_for_yearly_bills: money(s.billSavings),
    projected_month_end: money(s.projected),
    target_month_end: money(s.target),
    on_track_for_target: s.projected >= s.target,
    ...catchUpPayload(s, unit, money),
    bonus_saved_this_month: money(s.bonusSaved),
    bank_balance: money(s.bank),
    cash_in_hand: money(s.cash),
    pending_in_inbox: d.txns.filter((t) => t.status === "pending").length,
    envelopes_to_file_under: d.envelopes.map((e) => e.name),
    bills_to_file_under: d.commitments.map((c) => c.name),
  };
}

export function txnPayload(t: Txn, envelopes: Envelope[], bills: Commitment[], money: FormatMoney) {
  return {
    id: t.id,
    merchant: t.merchant,
    amount: money(t.direction === "credit" ? t.amount : -t.amount),
    category: categoryLabel(envelopes, bills, t),
    wallet: t.wallet,
    occurred_at: t.occurredAt,
    status: t.status,
    ...(t.upiRef ? { reference: t.upiRef } : {}),
    ...(t.note ? { note: t.note } : {}),
  };
}
