import { addDays, addMonths, monthEnd, overlapDays, toISTDate, weekStartOf } from "./dates";
import type { Commitment, Envelope, ISODate, MonthPlan, Paise } from "./types";

/** The part of the month the plan covers: from the day balances were entered to month end. */
export function planWindow(plan: MonthPlan): { start: ISODate; end: ISODate } {
  return { start: toISTDate(plan.balanceAt), end: monthEnd(plan.month) };
}

export function salaryInPlan(plan: MonthPlan): Paise {
  if (!plan.salary) return 0;
  const { start, end } = planWindow(plan);
  return plan.salary.date >= start && plan.salary.date <= end ? plan.salary.amount : 0;
}

/** Spendable = current balance − target (+ expected salary in the month). Cash on hand is spendable too. */
export function spendable(plan: MonthPlan): Paise {
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

export function commitmentsInPlan(plan: MonthPlan, cs: Commitment[]): Paise {
  const { start, end } = planWindow(plan);
  return cs.reduce((sum, c) => sum + c.amount * commitmentDates(c, start, end).length, 0);
}

/** weekly_limit / 7 × days of that week inside [from, to], rounded to the rupee so budgets read cleanly. */
export function weekAllocation(limit: Paise, weekStart: ISODate, from: ISODate, to: ISODate): Paise {
  return Math.round((limit * overlapDays(weekStart, addDays(weekStart, 6), from, to)) / 700) * 100;
}

export function weeksCovering(from: ISODate, to: ISODate, weekStartDay: number): ISODate[] {
  const out: ISODate[] = [];
  for (let w = weekStartOf(from, weekStartDay); w <= to; w = addDays(w, 7)) out.push(w);
  return out;
}

export function envelopeAllocation(plan: MonthPlan, env: Envelope): Paise {
  const { start, end } = planWindow(plan);
  return weeksCovering(start, end, plan.weekStart).reduce(
    (sum, w) => sum + weekAllocation(env.weeklyLimit, w, start, end),
    0,
  );
}

/** Flex = spendable − commitments − monthly envelope allocation. Can be negative when the plan is over-committed. */
export function flexBudget(plan: MonthPlan, envs: Envelope[], cs: Commitment[]): Paise {
  return (
    spendable(plan) -
    commitmentsInPlan(plan, cs) -
    envs.reduce((sum, e) => sum + envelopeAllocation(plan, e), 0)
  );
}
