import { addDays, diffDays, toISTDate } from "./dates";
import { floorToRupee } from "./money";
import {
  commitmentDates,
  commitmentsInPlan,
  flexBudget,
  planWindow,
  salaryInPlan,
  spendable,
  weekAllocation,
  weeksCovering,
} from "./plan";
import { describeSettlement, type Settlement, settleWeek, type SettlementStatus } from "./settle";
import type { Commitment, Envelope, ISODate, MonthPlan, Paise, Txn } from "./types";

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
  bank: Paise;
  cash: Paise;
  target: Paise;
  spendable: Paise;
  commitmentsTotal: Paise;
  commitmentsRemaining: Paise;
  salaryPending: Paise;
  flexBudget: Paise;
  /** May go negative when unplanned spends exceed the pool. */
  flexLeft: Paise;
  weeks: WeekReport[];
  current: WeekReport;
  /** Envelope money still unspent this week, after cover. */
  envelopeLeftThisWeek: Paise;
  daysLeftThisWeek: number;
  safeToday: Paise;
  projected: Paise;
  bonusSaved: Paise;
  status: SettlementStatus;
  message: string;
};

const confirmedAfter = (plan: MonthPlan, t: Txn) =>
  t.status === "confirmed" && Date.parse(t.occurredAt) > Date.parse(plan.balanceAt);

const signed = (t: Txn) => (t.direction === "credit" ? t.amount : -t.amount);

const inRange = (t: Txn, from: ISODate, to: ISODate) => {
  const d = toISTDate(t.occurredAt);
  return d >= from && d <= to;
};

/** Opening balances + every confirmed txn after balanceAt. Transfers move money between wallets. */
export function walletBalances(plan: MonthPlan, txns: Txn[]): { bank: Paise; cash: Paise } {
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
export function envelopeSpend(plan: MonthPlan, txns: Txn[], envelopeId: string, from: ISODate, to: ISODate): Paise {
  return txns
    .filter((t) => confirmedAfter(plan, t) && t.kind === "expense" && t.envelopeId === envelopeId && inRange(t, from, to))
    .reduce((sum, t) => sum - signed(t), 0);
}

/** Unplanned spends (no envelope, no commitment) and reconciliation adjustments draw on flex. */
export function flexSpend(plan: MonthPlan, txns: Txn[], from: ISODate, to: ISODate): Paise {
  return txns
    .filter(
      (t) =>
        confirmedAfter(plan, t) &&
        (t.kind === "expense" || t.kind === "adjustment") &&
        t.envelopeId === null &&
        t.commitmentId === null &&
        inRange(t, from, to),
    )
    .reduce((sum, t) => sum - signed(t), 0);
}

export function commitmentsRemaining(plan: MonthPlan, cs: Commitment[], txns: Txn[]): Paise {
  const { start, end } = planWindow(plan);
  return cs.reduce((sum, c) => {
    const due = c.amount * commitmentDates(c, start, end).length;
    const paid = txns
      .filter((t) => confirmedAfter(plan, t) && t.commitmentId === c.id && inRange(t, start, end))
      .reduce((s, t) => s - signed(t), 0);
    return sum + Math.max(0, due - paid);
  }, 0);
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
  const day = today < win.start ? win.start : today > win.end ? win.end : today;

  const flexTotal = flexBudget(plan, envelopes, commitments);
  let flexLeft = flexTotal;
  let carry: Record<string, Paise> = {};
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
        limit: weekAllocation(e.weeklyLimit, start, win.start, win.end) + (carry[e.id] ?? 0),
        spent: envelopeSpend(plan, txns, e.id, from, upTo),
        locked: e.locked,
        leftover: e.leftover,
      })),
      flexLeft,
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
    (sum, w) => sum + envelopes.reduce((s, e) => s + weekAllocation(e.weeklyLimit, w, win.start, win.end), 0),
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
  const safeToday = Math.max(0, floorToRupee(Math.floor((envelopeLeftThisWeek + flexForWeek) / daysLeftThisWeek)));

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
    message: describeSettlement(current.settlement, { live: !current.final, target: plan.target, projected }),
  };
}
