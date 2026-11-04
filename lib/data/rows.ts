import type { ReconcileCheck } from "@/lib/engine/reconcile";
import type { Commitment, Envelope, Txn } from "@/lib/engine/types";
import type {
  CommitmentRow,
  Database,
  EnvelopeRow,
  MonthPlanRow,
  ProfileRow,
  ReconcileCheckRow,
  TransactionRow,
} from "@/lib/supabase/database.types";
import type { PlanInput, Profile, ProfilePatch, StoredPlan, TxnPatch } from "./types";

type Insert<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Insert"];
type Update<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Update"];

// snake_case rows ↔ camelCase domain objects. user_id is filled by the column default (auth.uid()).

export const profileFromRow = (r: ProfileRow, email: string | null): Profile => ({
  displayName: r.display_name,
  email,
  currency: r.currency,
  locale: r.locale,
  timeZone: r.time_zone,
  theme: r.theme,
  defaultEnvelopeId: r.default_envelope_id ?? null,
});

export function profileToRow(p: ProfilePatch): Update<"profiles"> {
  const out: Update<"profiles"> = {};
  if (p.displayName !== undefined) out.display_name = p.displayName;
  if (p.currency !== undefined) out.currency = p.currency;
  if (p.locale !== undefined) out.locale = p.locale;
  if (p.timeZone !== undefined) out.time_zone = p.timeZone;
  if (p.theme !== undefined) out.theme = p.theme;
  if (p.defaultEnvelopeId !== undefined) out.default_envelope_id = p.defaultEnvelopeId;
  return out;
}

export const planFromRow = (r: MonthPlanRow): StoredPlan => ({
  id: r.id,
  month: r.month,
  openingBank: r.opening_bank,
  openingCash: r.opening_cash,
  balanceAt: r.balance_at,
  target: r.target,
  salary: r.salary_amount !== null && r.salary_date !== null ? { amount: r.salary_amount, date: r.salary_date } : null,
  weekStart: r.week_start,
  // Older rows (before the column existed) come back without it.
  unpaidBills: r.unpaid_bills ?? [],
  billFunds: r.bill_funds ?? {},
});

export function planToRow(p: Partial<PlanInput>): Update<"month_plans"> {
  const out: Update<"month_plans"> = {};
  if (p.month !== undefined) out.month = p.month;
  if (p.openingBank !== undefined) out.opening_bank = p.openingBank;
  if (p.openingCash !== undefined) out.opening_cash = p.openingCash;
  if (p.balanceAt !== undefined) out.balance_at = p.balanceAt;
  if (p.target !== undefined) out.target = p.target;
  if (p.salary !== undefined) {
    out.salary_amount = p.salary?.amount ?? null;
    out.salary_date = p.salary?.date ?? null;
  }
  if (p.weekStart !== undefined) out.week_start = p.weekStart;
  if (p.unpaidBills !== undefined) out.unpaid_bills = p.unpaidBills;
  if (p.billFunds !== undefined) out.bill_funds = p.billFunds;
  return out;
}

export const planToInsert = (p: PlanInput): Insert<"month_plans"> => ({
  month: p.month,
  opening_bank: p.openingBank,
  opening_cash: p.openingCash,
  balance_at: p.balanceAt,
  target: p.target,
  salary_amount: p.salary?.amount ?? null,
  salary_date: p.salary?.date ?? null,
  week_start: p.weekStart,
  unpaid_bills: p.unpaidBills ?? [],
  bill_funds: p.billFunds ?? {},
});

export const envelopeFromRow = (r: EnvelopeRow): Envelope => ({
  id: r.id,
  name: r.name,
  weeklyLimit: r.weekly_limit,
  locked: r.locked,
  leftover: r.leftover,
});

export const envelopeToRow = (e: Envelope, position: number): Insert<"envelopes"> => ({
  id: e.id,
  name: e.name,
  weekly_limit: e.weeklyLimit,
  locked: e.locked,
  leftover: e.leftover,
  position,
});

export const commitmentFromRow = (r: CommitmentRow): Commitment => ({
  id: r.id,
  name: r.name,
  amount: r.amount,
  frequency: r.frequency,
  nextDebit: r.next_debit,
});

export const commitmentToRow = (c: Commitment): Insert<"commitments"> => ({
  id: c.id,
  name: c.name,
  amount: c.amount,
  frequency: c.frequency,
  next_debit: c.nextDebit,
});

export const txnFromRow = (r: TransactionRow): Txn => ({
  id: r.id,
  wallet: r.wallet,
  amount: r.amount,
  direction: r.direction,
  kind: r.kind,
  merchant: r.merchant,
  envelopeId: r.envelope_id,
  commitmentId: r.commitment_id,
  occurredAt: r.occurred_at,
  source: r.source,
  status: r.status,
  upiRef: r.upi_ref,
  note: r.note,
  createdAt: r.created_at,
});

export const txnToRow = (t: Txn): Insert<"transactions"> => ({
  id: t.id,
  wallet: t.wallet,
  amount: t.amount,
  direction: t.direction,
  kind: t.kind,
  merchant: t.merchant,
  envelope_id: t.envelopeId,
  commitment_id: t.commitmentId,
  occurred_at: t.occurredAt,
  source: t.source,
  status: t.status,
  upi_ref: t.upiRef,
  note: t.note,
});

export function txnPatchToRow(p: TxnPatch): Update<"transactions"> {
  const out: Update<"transactions"> = {};
  if (p.amount !== undefined) out.amount = p.amount;
  if (p.merchant !== undefined) out.merchant = p.merchant;
  if (p.envelopeId !== undefined) out.envelope_id = p.envelopeId;
  if (p.commitmentId !== undefined) out.commitment_id = p.commitmentId;
  if (p.wallet !== undefined) out.wallet = p.wallet;
  if (p.note !== undefined) out.note = p.note;
  if (p.occurredAt !== undefined) out.occurred_at = p.occurredAt;
  if (p.direction !== undefined) out.direction = p.direction;
  return out;
}

export const checkFromRow = (r: ReconcileCheckRow): ReconcileCheck => ({
  date: r.date,
  computed: r.computed,
  actual: r.actual,
  resolution: r.resolution,
});

export const checkToRow = (c: ReconcileCheck): Insert<"reconcile_checks"> => ({ ...c });
