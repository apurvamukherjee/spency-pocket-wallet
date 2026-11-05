import { addDays, diffDays, toLocalDate } from "./dates";
import { allocate, unitOf } from "./money";
import { flexBudget, planWindow, weekAllocation, weeksCovering } from "./plan";
import type { Envelope, ISODate, Minor, MonthPlan, Txn } from "./types";
import type { SpencyData, Summary } from "./derive";

/** Planned vs actual over some span. saved = planned − spent; negative means over plan. */
export type SavingsSpan = { planned: Minor; spent: Minor; saved: Minor };
export type SavingsDay = SavingsSpan & { date: ISODate };
export type SavingsWeek = SavingsSpan & { start: ISODate; end: ISODate; days: number };
/** One envelope, or flex when id is null. */
export type SavingsLine = SavingsSpan & { id: string | null; name: string; leftover: Envelope["leftover"] | null; perWeek: Minor };

export type Savings = {
  days: SavingsDay[];
  weeks: SavingsWeek[];
  /** Best saver first. */
  lines: SavingsLine[];
  total: SavingsSpan;
  daysElapsed: number;
  perDay: Minor;
  perWeek: Minor;
  /** Saved so far plus the same daily pace for the rest of the month. */
  atThisPace: Minor;
};

const span = (planned: Minor, spent: Minor): SavingsSpan => ({ planned, spent, saved: planned - spent });
const roundTo = (minor: number, unit: number) => Math.round(minor / unit) * unit;

/**
 * Day-by-day "saved vs plan" for the discretionary budget (envelopes + flex) from plan start to today.
 * Each envelope's prorated weekly allocation is spread evenly over that week's in-plan days and flex over
 * the whole month, so a week's planned total equals its settlement limits. Rollover isn't added back:
 * carried money was already counted as saved in the week it was left over.
 */
export function savings(data: SpencyData, today: ISODate): Savings {
  const { plan, envelopes, commitments, txns } = data;
  const win = planWindow(plan);
  const unit = unitOf(plan.currency);
  const last = today > win.end ? win.end : today;
  const totalDays = diffDays(win.start, win.end) + 1;
  const n = Math.max(0, diffDays(win.start, last) + 1);
  const ones = (k: number) => Array.from({ length: k }, () => 1);
  const index = (d: ISODate) => diffDays(win.start, d);

  const plannedFlex = allocate(Math.max(0, flexBudget(plan, envelopes, commitments)), ones(totalDays));
  const plannedEnv = new Map<string, Minor[]>();
  for (const e of envelopes) {
    const row = new Array<Minor>(totalDays).fill(0);
    for (const w of weeksCovering(win.start, win.end, plan.weekStart)) {
      const from = w < win.start ? win.start : w;
      const to = addDays(w, 6) > win.end ? win.end : addDays(w, 6);
      const len = diffDays(from, to) + 1;
      allocate(weekAllocation(e.weeklyLimit, w, win.start, win.end, unit), ones(len)).forEach((v, i) => (row[index(from) + i] = v));
    }
    plannedEnv.set(e.id, row);
  }

  const spentByKey = new Map<string, Minor[]>();
  const known = new Set(envelopes.map((e) => e.id));
  for (const t of txns) {
    if (!counts(plan, t)) continue;
    const i = index(toLocalDate(t.occurredAt, plan.timeZone));
    if (i < 0 || i >= n) continue;
    const key = t.envelopeId && known.has(t.envelopeId) ? t.envelopeId : "";
    if (t.envelopeId && !key) continue;
    const row = spentByKey.get(key) ?? new Array<Minor>(n).fill(0);
    row[i] += t.direction === "debit" ? t.amount : -t.amount;
    spentByKey.set(key, row);
  }

  const sum = (row: Minor[] | undefined) => (row ?? []).slice(0, n).reduce((a, b) => a + b, 0);
  const pace = (saved: Minor) => (n ? roundTo((saved * 7) / n, unit) : 0);
  const lines: SavingsLine[] = [
    ...envelopes.map((e) => {
      const s = span(sum(plannedEnv.get(e.id)), sum(spentByKey.get(e.id)));
      return { ...s, id: e.id, name: e.name, leftover: e.leftover, perWeek: pace(s.saved) };
    }),
    (() => {
      const s = span(sum(plannedFlex), sum(spentByKey.get("")));
      return { ...s, id: null, name: "Flex", leftover: null, perWeek: pace(s.saved) };
    })(),
  ].sort((a, b) => b.saved - a.saved);

  const days: SavingsDay[] = Array.from({ length: n }, (_, i) => {
    let planned = plannedFlex[i];
    for (const row of plannedEnv.values()) planned += row[i];
    let spent = 0;
    for (const row of spentByKey.values()) spent += row[i];
    return { date: addDays(win.start, i), ...span(planned, spent) };
  });

  const weeks: SavingsWeek[] = [];
  for (const d of days) {
    const w = weeks.find((x) => d.date >= x.start && d.date <= x.end);
    const start = weeksCovering(d.date, d.date, plan.weekStart)[0];
    const target = w ?? { start, end: addDays(start, 6), planned: 0, spent: 0, saved: 0, days: 0 };
    target.planned += d.planned;
    target.spent += d.spent;
    target.saved += d.saved;
    target.days++;
    if (!w) weeks.push(target);
  }

  const total = span(
    lines.reduce((a, l) => a + l.planned, 0),
    lines.reduce((a, l) => a + l.spent, 0),
  );
  const perDay = n ? roundTo(total.saved / n, unit) : 0;
  return {
    days,
    weeks,
    lines,
    total,
    daysElapsed: n,
    perDay,
    perWeek: pace(total.saved),
    atThisPace: n ? roundTo((total.saved * totalDays) / n, unit) : 0,
  };
}

/** Same money as envelopeSpend + flexSpend: confirmed spends after the opening balance, refunds net off. */
function counts(plan: MonthPlan, t: Txn): boolean {
  if (t.status !== "confirmed" || Date.parse(t.occurredAt) <= Date.parse(plan.balanceAt)) return false;
  if (t.kind === "expense") return t.envelopeId !== null || t.commitmentId === null;
  return t.kind === "adjustment" && t.envelopeId === null && t.commitmentId === null;
}

export type WhatIf = {
  /** Extra kept from today to month end. */
  thisMonth: Minor;
  projected: Minor;
  aboveTarget: Minor;
  perYear: Minor;
};

/** Spending `perWeek` less from today on: the projection rises by exactly the budget not spent. */
export function whatIf(s: Pick<Summary, "projected" | "target" | "daysLeftMonth">, perWeek: Minor, unit: number): WhatIf {
  const thisMonth = roundTo((perWeek * s.daysLeftMonth) / 7, unit);
  const projected = s.projected + thisMonth;
  return { thisMonth, projected, aboveTarget: projected - s.target, perYear: roundTo((perWeek * 365) / 7, unit) };
}
