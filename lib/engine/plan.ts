import { addDays, addMonths, overlapDays, type Period, periodContaining, periodOfKey, toLocalDate, weekStartOf } from "./dates";
import { unitOf } from "./money";
import type { Commitment, Envelope, ISODate, MonthPlan, Minor } from "./types";

/** The plan's whole month: a calendar month, or payday to payday. */
export function planPeriod(plan: Pick<MonthPlan, "month" | "startDay">): Period {
  return periodOfKey(plan.month, plan.startDay ?? 1);
}

/** Whether `today` falls in this plan's month; if not, it's time for a new plan. */
export function isCurrentPlan(plan: Pick<MonthPlan, "month" | "startDay">, today: ISODate): boolean {
  return periodContaining(today, plan.startDay ?? 1).key === plan.month;
}

/** The part of the month the plan covers: from the day balances were entered to the month's last day. */
export function planWindow(plan: MonthPlan): { start: ISODate; end: ISODate } {
  return { start: toLocalDate(plan.balanceAt, plan.timeZone), end: planPeriod(plan).end };
}

export function salaryInPlan(plan: MonthPlan): Minor {
  if (!plan.salary) return 0;
  const { start, end } = planWindow(plan);
  return plan.salary.date >= start && plan.salary.date <= end ? plan.salary.amount : 0;
}

/** Money already put aside for yearly bills when the plan started. */
export function fundsAtStart(plan: MonthPlan): Minor {
  return Object.values(plan.billFunds ?? {}).reduce((s, v) => s + v, 0);
}

/**
 * Spendable = current balance − target − yearly-bill savings already held (+ expected salary in the month).
 * Cash on hand is spendable too.
 */
export function spendable(plan: MonthPlan): Minor {
  return plan.openingBank + plan.openingCash - plan.target - fundsAtStart(plan) + salaryInPlan(plan);
}

export function commitmentDates(c: Commitment, from: ISODate, to: ISODate): ISODate[] {
  const step = (d: ISODate, n: number): ISODate =>
    c.frequency === "weekly"
      ? addDays(d, 7 * n)
      : addMonths(d, c.frequency === "monthly" ? n : 12 * n, +c.nextDebit.slice(8, 10));
  let first = c.nextDebit;
  // nextDebit may already be past this window's start (paid earlier this month), so walk back.
  for (let i = 1; ; i++) {
    const prev = step(c.nextDebit, -i);
    if (prev < from) break;
    first = prev;
  }
  const out: ISODate[] = [];
  for (let i = 0, d = first; d <= to; d = step(first, ++i)) if (d >= from) out.push(d);
  return out;
}

/** The bill whose next debit falls soonest on or after `today`, or null when none is due within a year. */
export function nextBill(cs: Commitment[], today: ISODate): { commitment: Commitment; date: ISODate } | null {
  let best: { commitment: Commitment; date: ISODate } | null = null;
  for (const commitment of cs) {
    const date = commitmentDates(commitment, today, addDays(today, 365))[0];
    if (date && (!best || date < best.date)) best = { commitment, date };
  }
  return best;
}

/** What a bill costs per month on average: weekly × 52 / 12, monthly as is, yearly / 12. */
export function monthlyEquivalent(c: Commitment): Minor {
  if (c.frequency === "weekly") return Math.round((c.amount * 52) / 12);
  if (c.frequency === "yearly") return Math.round(c.amount / 12);
  return c.amount;
}

/** Where a bill's dues are counted from: the plan start, or the 1st if the user said an earlier payment is still unpaid. */
export function billFrom(plan: MonthPlan, c: Commitment): ISODate {
  return plan.unpaidBills?.includes(c.id) ? planPeriod(plan).start : planWindow(plan).start;
}

/** Yearly bills are saved for monthly, so the month they fall due isn't hit with the whole amount. */
export const saveMonthly = (c: Commitment) => c.frequency === "yearly";

const monthIndex = (m: string) => +m.slice(0, 4) * 12 + +m.slice(5, 7);

export type BillFund = {
  /** Put aside before this plan started. */
  saved: Minor;
  /** Put aside this month; in the month it's due, whatever is still missing. */
  contribution: Minor;
  /** The next time it goes out, on or after the plan start. */
  dueDate: ISODate;
  dueThisMonth: boolean;
  /** The bill's amount for that payment. */
  goal: Minor;
};

/**
 * What a yearly bill sets aside this month: the shortfall spread evenly over the months left until it's due,
 * rounded up to a whole unit. Catching up is automatic: a late start or a skipped month raises the share.
 */
export function billFund(plan: MonthPlan, c: Commitment): BillFund {
  const { end } = planWindow(plan);
  const unit = unitOf(plan.currency);
  const from = billFrom(plan, c);
  const dueNow = commitmentDates(c, from, end);
  const dueDate = dueNow[0] ?? commitmentDates(c, from, addDays(end, 400))[0] ?? c.nextDebit;
  const saved = plan.billFunds?.[c.id] ?? 0;
  const goal = c.amount * Math.max(1, dueNow.length);
  const missing = Math.max(0, goal - saved);
  // Plan months between now and the due date, counting both (period keys are months, so they subtract cleanly).
  const months = Math.max(1, monthIndex(periodContaining(dueDate, plan.startDay ?? 1).key) - monthIndex(plan.month) + 1);
  const contribution = dueNow.length ? missing : Math.min(missing, Math.ceil(missing / months / unit) * unit);
  return { saved, contribution, dueDate, dueThisMonth: dueNow.length > 0, goal };
}

/** Money this month's plan sets aside for bills: what's due, plus this month's share of yearly bills. */
export function commitmentsInPlan(plan: MonthPlan, cs: Commitment[]): Minor {
  const { end } = planWindow(plan);
  return cs.reduce(
    (sum, c) => sum + (saveMonthly(c) ? billFund(plan, c).contribution : c.amount * commitmentDates(c, billFrom(plan, c), end).length),
    0,
  );
}

/** weekly_limit / 7 × days of that week inside [from, to], rounded to a whole major unit so budgets read cleanly. */
export function weekAllocation(limit: Minor, weekStart: ISODate, from: ISODate, to: ISODate, unit: number): Minor {
  return Math.round((limit * overlapDays(weekStart, addDays(weekStart, 6), from, to)) / (7 * unit)) * unit;
}

export function weeksCovering(from: ISODate, to: ISODate, weekStartDay: number): ISODate[] {
  const out: ISODate[] = [];
  for (let w = weekStartOf(from, weekStartDay); w <= to; w = addDays(w, 7)) out.push(w);
  return out;
}

export function envelopeAllocation(plan: MonthPlan, env: Envelope): Minor {
  const { start, end } = planWindow(plan);
  const unit = unitOf(plan.currency);
  return weeksCovering(start, end, plan.weekStart).reduce(
    (sum, w) => sum + weekAllocation(env.weeklyLimit, w, start, end, unit),
    0,
  );
}

/** Flex = spendable − commitments − monthly envelope allocation. Can be negative when the plan is over-committed. */
export function flexBudget(plan: MonthPlan, envs: Envelope[], cs: Commitment[]): Minor {
  return (
    spendable(plan) -
    commitmentsInPlan(plan, cs) -
    envs.reduce((sum, e) => sum + envelopeAllocation(plan, e), 0)
  );
}
