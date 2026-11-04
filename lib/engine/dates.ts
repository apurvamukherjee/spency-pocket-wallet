import type { ISODate, MonthKey } from "./types";

const DAY_MS = 86_400_000;

const dayFormats = new Map<string, Intl.DateTimeFormat>();

/** Calendar day an instant falls on in `timeZone`. */
export function toLocalDate(instant: string | Date, timeZone: string): ISODate {
  let f = dayFormats.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
    dayFormats.set(timeZone, f);
  }
  return f.format(typeof instant === "string" ? new Date(instant) : instant);
}

/**
 * Midday on calendar day `d` in `timeZone`, as a UTC ISO instant. Used when a payment is logged for a past day
 * with no time: midday sits on the same calendar day in every zone, even across DST changes.
 */
export function middayIn(d: ISODate, timeZone: string): string {
  const guess = Date.parse(`${d}T12:00:00Z`);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
  }).formatToParts(guess);
  const n = (t: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === t)?.value);
  const wall = Date.UTC(n("year"), n("month") - 1, n("day"), n("hour"), n("minute"));
  return new Date(guess - (wall - guess)).toISOString();
}

export function todayIn(timeZone: string, now: Date = new Date()): ISODate {
  return toLocalDate(now, timeZone);
}

/** `YYYY-MM-DD` treated as a pure calendar day; UTC epoch math avoids DST/timezone drift. */
function toDays(d: ISODate): number {
  return Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) / DAY_MS;
}

function fromDays(n: number): ISODate {
  return new Date(n * DAY_MS).toISOString().slice(0, 10);
}

export function addDays(d: ISODate, n: number): ISODate {
  return fromDays(toDays(d) + n);
}

/** Whole days from `a` to `b` (b − a). */
export function diffDays(a: ISODate, b: ISODate): number {
  return toDays(b) - toDays(a);
}

/** "today", "tomorrow" or "in N days", counted from `today` to `d`. */
export function dueWhen(today: ISODate, d: ISODate): string {
  const n = diffDays(today, d);
  return n === 0 ? "today" : n === 1 ? "tomorrow" : `in ${n} days`;
}

export function dayOfWeek(d: ISODate): number {
  return new Date(toDays(d) * DAY_MS).getUTCDay();
}

export function weekStartOf(d: ISODate, weekStart: number): ISODate {
  return addDays(d, -((dayOfWeek(d) - weekStart + 7) % 7));
}

export function weekEndOf(d: ISODate, weekStart: number): ISODate {
  return addDays(weekStartOf(d, weekStart), 6);
}

export function monthOf(d: ISODate): MonthKey {
  return d.slice(0, 7);
}

export function daysInMonth(m: MonthKey): number {
  return new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7), 0)).getUTCDate();
}

/** Day of month → date in that month, clamped to short months (31 in February → the 28th or 29th). */
export function dayInMonth(m: MonthKey, day: number): ISODate {
  return `${m}-${String(Math.min(Math.max(1, Math.trunc(day)), daysInMonth(m))).padStart(2, "0")}`;
}

export function monthStart(m: MonthKey): ISODate {
  return `${m}-01`;
}

export function monthEnd(m: MonthKey): ISODate {
  return `${m}-${String(daysInMonth(m)).padStart(2, "0")}`;
}

const minDate = (a: ISODate, b: ISODate) => (a < b ? a : b);
const maxDate = (a: ISODate, b: ISODate) => (a > b ? a : b);

/** Inclusive day count shared by [aStart, aEnd] and [bStart, bEnd]. */
export function overlapDays(aStart: ISODate, aEnd: ISODate, bStart: ISODate, bEnd: ISODate): number {
  return Math.max(0, diffDays(maxDate(aStart, bStart), minDate(aEnd, bEnd)) + 1);
}

/** Month step that keeps the anchor day-of-month, clamped to short months (31 Jan + 1 → 28/29 Feb). */
export function addMonths(d: ISODate, n: number, anchorDay = +d.slice(8, 10)): ISODate {
  const total = +d.slice(0, 4) * 12 + (+d.slice(5, 7) - 1) + n;
  const m = `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
  return `${m}-${String(Math.min(anchorDay, daysInMonth(m))).padStart(2, "0")}`;
}

/**
 * Plans can run payday to payday. A period starts on `startDay` of a month (clamped in short months) and ends the
 * day before the next start; startDay 1 is the calendar month. Each period is keyed by the month it ends in, so
 * keys only move forward and a calendar plan is replaced, not outlived, when switching mid-month.
 */
export type Period = { start: ISODate; end: ISODate; key: MonthKey };

const shiftMonth = (m: MonthKey, n: number): MonthKey => monthOf(addMonths(`${m}-01`, n));

function periodFrom(start: ISODate, startDay: number): Period {
  const end = addDays(dayInMonth(shiftMonth(monthOf(start), 1), startDay), -1);
  return { start, end, key: monthOf(end) };
}

/** The period that contains day `d`. */
export function periodContaining(d: ISODate, startDay = 1): Period {
  const here = dayInMonth(monthOf(d), startDay);
  return periodFrom(d >= here ? here : dayInMonth(shiftMonth(monthOf(d), -1), startDay), startDay);
}

/** The period with key `key` (the month it ends in). */
export function periodOfKey(key: MonthKey, startDay = 1): Period {
  // The period ending in `key` starts in `key` itself for startDay 1, else in the month before.
  return periodFrom(dayInMonth(startDay === 1 ? key : shiftMonth(key, -1), startDay), startDay);
}

/** The date inside `p` that falls on day-of-month `day` (clamped), e.g. a pay day. */
export function dayInPeriod(p: Pick<Period, "start" | "end">, day: number): ISODate {
  const first = dayInMonth(monthOf(p.start), day);
  return first >= p.start && first <= p.end ? first : dayInMonth(monthOf(p.end), day);
}

