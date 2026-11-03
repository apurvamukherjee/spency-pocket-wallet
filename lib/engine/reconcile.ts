import { addDays } from "./dates";
import type { ISODate, Minor } from "./types";

export type ReconcileCheck = {
  date: ISODate;
  computed: Minor;
  actual: Minor;
  resolution: "matched" | "adjusted" | "ignored";
};

/** Positive = more in the bank than Spency knows about; negative = money unaccounted for. */
export function reconcileGap(computed: Minor, actual: Minor): Minor {
  return actual - computed;
}

/** Consecutive days with a check, ending today (or yesterday, so the streak survives until tonight). */
export function reconcileStreak(checks: ReconcileCheck[], today: ISODate): number {
  const days = new Set(checks.map((c) => c.date));
  let d = days.has(today) ? today : addDays(today, -1);
  let streak = 0;
  while (days.has(d)) {
    streak++;
    d = addDays(d, -1);
  }
  return streak;
}
