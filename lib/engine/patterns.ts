import { addDays, toLocalDate, weekStartOf } from "./dates";
import type { Envelope, ISODate, Minor, Txn } from "./types";

export type Rebalance = {
  from: Envelope;
  to: Envelope;
  /** Per week. */
  amount: Minor;
  weeks: number;
};

/** Rounds down to something a person would pick: whole units, tens once it's 20 or more. */
function niceFloor(minor: Minor, unit: number): Minor {
  const whole = Math.floor(minor / unit);
  return (whole >= 20 ? whole - (whole % 10) : whole) * unit;
}

/**
 * If one envelope went over in each of the last `weeks` finished weeks while an unlocked one stayed under
 * in all of them, suggest moving the smaller of (average overspend, smallest saving) per week between them.
 *
 * ponytail: judges past weeks against today's limits; store limit history if limits start changing often.
 */
export function suggestRebalance(input: {
  envelopes: Envelope[];
  txns: Txn[];
  today: ISODate;
  weekStart: number;
  timeZone: string;
  unit: number;
  weeks?: number;
}): Rebalance | null {
  const n = input.weeks ?? 3;
  const thisWeek = weekStartOf(input.today, input.weekStart);
  const starts = Array.from({ length: n }, (_, i) => addDays(thisWeek, -7 * (i + 1)));

  const spent = new Map<string, Minor[]>(input.envelopes.map((e) => [e.id, starts.map(() => 0)]));
  for (const t of input.txns) {
    if (t.status !== "confirmed" || t.kind !== "expense" || !t.envelopeId) continue;
    const row = spent.get(t.envelopeId);
    if (!row) continue;
    const day = toLocalDate(t.occurredAt, input.timeZone);
    const w = starts.findIndex((s) => day >= s && day <= addDays(s, 6));
    if (w !== -1) row[w] += t.direction === "debit" ? t.amount : -t.amount;
  }

  let to: { e: Envelope; over: Minor } | null = null;
  let from: { e: Envelope; save: Minor } | null = null;
  for (const e of input.envelopes) {
    const row = spent.get(e.id) ?? [];
    const variance = row.map((s) => e.weeklyLimit - s);
    if (variance.every((v) => v < 0)) {
      const over = Math.round(variance.reduce((a, v) => a - v, 0) / n);
      if (!to || over > to.over) to = { e, over };
    } else if (!e.locked && variance.every((v) => v > 0) && row.some((s) => s > 0)) {
      // Needs some spending, so an envelope created last week doesn't look like years of savings.
      const save = Math.min(...variance);
      if (!from || save > from.save) from = { e, save };
    }
  }
  if (!to || !from) return null;

  const amount = niceFloor(Math.min(to.over, from.save, from.e.weeklyLimit), input.unit);
  return amount > 0 ? { from: from.e, to: to.e, amount, weeks: n } : null;
}
