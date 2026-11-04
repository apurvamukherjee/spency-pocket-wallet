"use client";

import { useAppData, useFormat, useToday } from "@/lib/data/context";
import { addDays, middayIn, toLocalDate } from "@/lib/engine/dates";
import type { ISODate } from "@/lib/engine/types";
import { Chip } from "@/components/ui/controls";

/**
 * The instant to store for a payment on `day`. Today uses the current moment (or keeps the original time when the
 * day didn't change); earlier days use midday in the user's zone.
 */
export function instantFor(day: ISODate, today: ISODate, timeZone: string, original?: string): string {
  if (original && toLocalDate(original, timeZone) === day) return original;
  return day === today ? new Date().toISOString() : middayIn(day, timeZone);
}

/** Today / Yesterday / any earlier day. Warns when the day is before the plan's starting balance. */
export function WhenField({ value, onChange, instant }: { value: ISODate; onChange: (d: ISODate) => void; instant: string }) {
  const today = useToday();
  const fmt = useFormat();
  const { plan } = useAppData();
  const yesterday = addDays(today, -1);
  const before = plan !== null && Date.parse(instant) <= Date.parse(plan.balanceAt);
  return (
    <div className="space-y-2">
      <span className="label">When</span>
      <div className="flex flex-wrap items-center gap-2">
        <Chip active={value === today} onClick={() => onChange(today)}>
          Today
        </Chip>
        <Chip active={value === yesterday} onClick={() => onChange(yesterday)}>
          Yesterday
        </Chip>
        <label className="relative">
          <span className="sr-only">Pick a day</span>
          <input
            type="date"
            max={today}
            value={value}
            onChange={(e) => e.target.value && onChange(e.target.value)}
            className={`rounded-full border bg-transparent px-3.5 py-1.5 text-sm transition-colors ${value !== today && value !== yesterday ? "border-accent/60 text-fg" : "border-line text-muted"}`}
          />
        </label>
      </div>
      {before && (
        <p className="text-xs text-faint">
          {fmt.day(value)} is before your plan&apos;s starting balance, so this payment is treated as already inside it and won&apos;t
          change your numbers.
        </p>
      )}
    </div>
  );
}
