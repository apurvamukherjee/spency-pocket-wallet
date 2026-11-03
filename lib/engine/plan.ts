import { addDays, addMonths, monthEnd, monthStart, overlapDays, toLocalDate, weekStartOf } from "./dates";
import { unitOf } from "./money";
import type { Commitment, Envelope, ISODate, MonthPlan, Minor } from "./types";

/** The part of the month the plan covers: from the day balances were entered to month end. */
export function planWindow(plan: MonthPlan): { start: ISODate; end: ISODate } {
  return { start: toLocalDate(plan.balanceAt, plan.timeZone), end: monthEnd(plan.month) };
}

export function salaryInPlan(plan: MonthPlan): Minor {
  if (!plan.salary) return 0;
  const { start, end } = planWindow(plan);
  return plan.salary.date >= start && plan.salary.date <= end ? plan.salary.amount : 0;
}

/** Spendable = current balance − target (+ expected salary in the month). Cash on hand is spendable too. */
export function spendable(plan: MonthPlan): Minor {
  return plan.openingBank + plan.openingCash - plan.target + salaryInPlan(plan);
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

/** What a bill costs per month on average: weekly × 52 / 12, monthly as is, yearly / 12. */
export function monthlyEquivalent(c: Commitment): Minor {
  if (c.frequency === "weekly") return Math.round((c.amount * 52) / 12);
  if (c.frequency === "yearly") return Math.round(c.amount / 12);
  return c.amount;
}

/** Where a bill's dues are counted from: the plan start, or the 1st if the user said an earlier payment is still unpaid. */
export function billFrom(plan: MonthPlan, c: Commitment): ISODate {
  return plan.unpaidBills?.includes(c.id) ? monthStart(plan.month) : planWindow(plan).start;
}

export function commitmentsInPlan(plan: MonthPlan, cs: Commitment[]): Minor {
  const { end } = planWindow(plan);
  return cs.reduce((sum, c) => sum + c.amount * commitmentDates(c, billFrom(plan, c), end).length, 0);
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
