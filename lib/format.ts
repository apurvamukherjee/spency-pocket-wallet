import { addDays, toISTDate } from "./engine/dates";
import type { ISODate } from "./engine/types";

const tz = "Asia/Kolkata";
const time = new Intl.DateTimeFormat("en-IN", { timeZone: tz, hour: "numeric", minute: "2-digit" });
const day = new Intl.DateTimeFormat("en-IN", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" });
const shortDay = new Intl.DateTimeFormat("en-IN", { timeZone: "UTC", day: "numeric", month: "short" });
const longDay = new Intl.DateTimeFormat("en-IN", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" });

const asDate = (d: ISODate) => new Date(`${d}T00:00:00Z`);

export const formatTime = (instant: string) => time.format(new Date(instant)).toLowerCase();
export const formatDay = (d: ISODate) => day.format(asDate(d));
export const formatShortDay = (d: ISODate) => shortDay.format(asDate(d));
export const formatLongDay = (d: ISODate) => longDay.format(asDate(d));

export function formatWhen(instant: string, today: ISODate): string {
  const d = toISTDate(instant);
  const label = d === today ? "Today" : d === addDays(today, -1) ? "Yesterday" : formatDay(d);
  return `${label}, ${formatTime(instant)}`;
}

export function greeting(now: Date = new Date()): string {
  const h = +new Intl.DateTimeFormat("en-IN", { timeZone: tz, hour: "numeric", hourCycle: "h23" }).format(now);
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}
