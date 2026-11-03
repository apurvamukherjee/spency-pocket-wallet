import { addDays, diffDays, monthStart, toLocalDate } from "./dates";
import { floorToUnit, unitOf } from "./money";
import {
  billFrom,
  commitmentDates,
  commitmentsInPlan,
  flexBudget,
  planWindow,
  salaryInPlan,
  spendable,
  weekAllocation,
  weeksCovering,
} from "./plan";
import { type Settlement, settleWeek, type SettlementStatus } from "./settle";
import type { Commitment, Envelope, ISODate, MonthPlan, Minor, Txn } from "./types";

export type SpencyData = {
  plan: MonthPlan;
  envelopes: Envelope[];
  commitments: Commitment[];
  txns: Txn[];
};

export type WeekReport = {
  start: ISODate;
  end: ISODate;
  /** Week has ended; leftover rules have been applied. */
  final: boolean;
  settlement: Settlement;
};

export type Summary = {
  today: ISODate;
  bank: Minor;
  cash: Minor;
  target: Minor;
  spendable: Minor;
  commitmentsTotal: Minor;
  commitmentsRemaining: Minor;
  salaryPending: Minor;
  flexBudget: Minor;
  /** May go negative when unplanned spends exceed the pool. */
  flexLeft: Minor;
  weeks: WeekReport[];
  current: WeekReport;
  /** Envelope money still unspent this week, after cover. */
  envelopeLeftThisWeek: Minor;
  daysLeftThisWeek: number;
  safeToday: Minor;
  projected: Minor;
  bonusSaved: Minor;
  status: SettlementStatus;
};

const confirmedAfter = (plan: MonthPlan, t: Txn) =>
  t.status === "confirmed" && Date.parse(t.occurredAt) > Date.parse(plan.balanceAt);

const signed = (t: Txn) => (t.direction === "credit" ? t.amount : -t.amount);

const inRange = (plan: MonthPlan, t: Txn, from: ISODate, to: ISODate) => {
  const d = toLocalDate(t.occurredAt, plan.timeZone);
  return d >= from && d <= to;
};

/** Opening balances + every confirmed txn after balanceAt. Transfers move money between wallets. */
export function walletBalances(plan: MonthPlan, txns: Txn[]): { bank: Minor; cash: Minor } {
  let bank = plan.openingBank;
  let cash = plan.openingCash;
  for (const t of txns) {
    if (!confirmedAfter(plan, t)) continue;
    const delta = signed(t);
    if (t.wallet === "bank") bank += delta;
    else cash += delta;
    if (t.kind === "transfer") {
      if (t.wallet === "bank") cash -= delta;
      else bank -= delta;
    }
  }
  return { bank, cash };
}

/** Net envelope spend in [from, to]; refunds (credits) reduce it. Both wallets count. */
export function envelopeSpend(plan: MonthPlan, txns: Txn[], envelopeId: string, from: ISODate, to: ISODate): Minor {
  return txns
    .filter((t) => confirmedAfter(plan, t) && t.kind === "expense" && t.envelopeId === envelopeId && inRange(plan, t, from, to))
    .reduce((sum, t) => sum - signed(t), 0);
}

/** Unplanned spends (no envelope, no commitment) and reconciliation adjustments draw on flex. */
export function flexSpend(plan: MonthPlan, txns: Txn[], from: ISODate, to: ISODate): Minor {
  return txns
    .filter(
      (t) =>
        confirmedAfter(plan, t) &&
        (t.kind === "expense" || t.kind === "adjustment") &&
        t.envelopeId === null &&
        t.commitmentId === null &&
        inRange(plan, t, from, to),
    )
    .reduce((sum, t) => sum - signed(t), 0);
}

export type BillStatus = {
  /** paid: a payment is logged this month · assumed_paid: went out before the starting balance · due · none: not this month. */
  state: "paid" | "assumed_paid" | "due" | "none";
  /** Still to go out this month. */
  due: Minor;
  /** Confirmed payments for this bill this month, so they can be undone. */
  paymentIds: string[];
};

export function billStatus(plan: MonthPlan, c: Commitment, txns: Txn[]): BillStatus {
  const { start, end } = planWindow(plan);
  const owed = c.amount * commitmentDates(c, billFrom(plan, c), end).length;
  const payments = txns.filter((t) => confirmedAfter(plan, t) && t.commitmentId === c.id && inRange(plan, t, start, end));
  const due = Math.max(0, owed - payments.reduce((s, t) => s - signed(t), 0));
  const before = start > monthStart(plan.month) ? commitmentDates(c, monthStart(plan.month), addDays(start, -1)).length > 0 : false;
  const assumed = before && !plan.unpaidBills?.includes(c.id);
  const state = due > 0 ? "due" : payments.length ? "paid" : assumed ? "assumed_paid" : "none";
  return { state, due, paymentIds: payments.map((t) => t.id) };
}

export function commitmentsRemaining(plan: MonthPlan, cs: Commitment[], txns: Txn[]): Minor {
  return cs.reduce((sum, c) => sum + billStatus(plan, c, txns).due, 0);
}

/** End-of-day bank + cash from plan start to `today`, for the month chart. */
export function balanceSeries(plan: MonthPlan, txns: Txn[], today: ISODate): { date: ISODate; balance: Minor }[] {
  const win = planWindow(plan);
  const byDay = new Map<ISODate, Minor>();
  for (const t of txns) {
    if (!confirmedAfter(plan, t) || t.kind === "transfer") continue;
    const d = toLocalDate(t.occurredAt, plan.timeZone);
    byDay.set(d, (byDay.get(d) ?? 0) + signed(t));
  }
  const last = today > win.end ? win.end : today;
  const out: { date: ISODate; balance: Minor }[] = [];
  let balance = plan.openingBank + plan.openingCash;
  for (let d = win.start; d <= last; d = addDays(d, 1)) {
    balance += byDay.get(d) ?? 0;
    out.push({ date: d, balance });
  }
  return out;
}

/**
 * Rolls the month forward week by week from the plan start to `today`.
 * Weeks at the plan's edges are prorated (limit and counted spend) to the days inside the plan,
 * so budget from before the plan never leaks in as rollover or bonus.
 *
 * projected month-end = money now + pending salary − bills still due − envelope money still to
 * be spent − unused flex. With on-plan spending this equals the target exactly.
 */
export function summarize(data: SpencyData, today: ISODate): Summary {
  const { plan, envelopes, commitments, txns } = data;
  const win = planWindow(plan);
  const unit = unitOf(plan.currency);
  const day = today < win.start ? win.start : today > win.end ? win.end : today;

  const flexTotal = flexBudget(plan, envelopes, commitments);
  let flexLeft = flexTotal;
  let carry: Record<string, Minor> = {};
  let bonusSaved = 0;
  const weeks: WeekReport[] = [];

  for (const start of weeksCovering(win.start, day, plan.weekStart)) {
    const end = addDays(start, 6);
    const from = start < win.start ? win.start : start;
    const to = end > win.end ? win.end : end;
    const final = to < day;
    const upTo = final ? to : day;

    flexLeft -= flexSpend(plan, txns, from, upTo);
    const settlement = settleWeek(
      envelopes.map((e) => ({
        id: e.id,
        name: e.name,
        limit: weekAllocation(e.weeklyLimit, start, win.start, win.end, unit) + (carry[e.id] ?? 0),
        spent: envelopeSpend(plan, txns, e.id, from, upTo),
        locked: e.locked,
        leftover: e.leftover,
      })),
      flexLeft,
      unit,
    );
    flexLeft -= settlement.fromFlex;
    if (final) {
      flexLeft += settlement.toFlex;
      bonusSaved += settlement.toTarget;
      carry = settlement.rollover;
    }
    weeks.push({ start, end, final, settlement });
  }

  const current = weeks[weeks.length - 1];
  const envelopeLeftThisWeek = current.settlement.envelopes.reduce((s, e) => s + e.left, 0);
  const futureWeeks = weeksCovering(addDays(current.end, 1), win.end, plan.weekStart).reduce(
    (sum, w) => sum + envelopes.reduce((s, e) => s + weekAllocation(e.weeklyLimit, w, win.start, win.end, unit), 0),
    0,
  );

  const { bank, cash } = walletBalances(plan, txns);
  const salaryReceived = txns.some((t) => confirmedAfter(plan, t) && t.kind === "salary");
  const salaryPending = salaryReceived ? 0 : salaryInPlan(plan);
  const reserved = commitmentsRemaining(plan, commitments, txns);
  const projected =
    bank + cash + salaryPending - reserved - envelopeLeftThisWeek - futureWeeks - Math.max(0, flexLeft);

  const weekLastDay = current.end > win.end ? win.end : current.end;
  const daysLeftThisWeek = diffDays(day, weekLastDay) + 1;
  const daysLeftMonth = diffDays(day, win.end) + 1;
  const flexForWeek = Math.floor((Math.max(0, flexLeft) * daysLeftThisWeek) / daysLeftMonth);
  const safeToday = Math.max(0, floorToUnit(Math.floor((envelopeLeftThisWeek + flexForWeek) / daysLeftThisWeek), unit));

  return {
    today: day,
    bank,
    cash,
    target: plan.target,
    spendable: spendable(plan),
    commitmentsTotal: commitmentsInPlan(plan, commitments),
    commitmentsRemaining: reserved,
    salaryPending,
    flexBudget: flexTotal,
    flexLeft,
    weeks,
    current,
    envelopeLeftThisWeek,
    daysLeftThisWeek,
    safeToday,
    projected,
    bonusSaved,
    status: current.settlement.status,
  };
}
