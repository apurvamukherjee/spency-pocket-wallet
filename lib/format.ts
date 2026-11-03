import { addDays, toLocalDate } from "./engine/dates";
import { type FormatMoney, type MoneyFormat, moneyFormatter, parseMoney, toInputText } from "./engine/money";
import type { ISODate, Minor } from "./engine/types";

export type Formatters = {
  moneyFormat: MoneyFormat;
  /** "₹", "$", "€"… for input adornments. */
  symbol: string;
  money: FormatMoney;
  parse: (input: string) => Minor | null;
  input: (minor: Minor) => string;
  time: (instant: string) => string;
  day: (d: ISODate) => string;
  shortDay: (d: ISODate) => string;
  longDay: (d: ISODate) => string;
  weekdayInitial: (d: ISODate) => string;
  when: (instant: string, today: ISODate) => string;
  greeting: () => string;
};

// Calendar dates are zone-free, so they format in UTC; instants format in the user's zone.
const asDate = (d: ISODate) => new Date(`${d}T00:00:00Z`);

export function makeFormatters(p: { currency: string; locale: string; timeZone: string }): Formatters {
  const moneyFormat = { currency: p.currency, locale: p.locale };
  const fmt = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(p.locale, o);
  const time = fmt({ timeZone: p.timeZone, hour: "numeric", minute: "2-digit" });
  const day = fmt({ timeZone: "UTC", weekday: "short", day: "numeric", month: "short" });
  const shortDay = fmt({ timeZone: "UTC", day: "numeric", month: "short" });
  const longDay = fmt({ timeZone: "UTC", weekday: "long", day: "numeric", month: "long" });
  const initial = fmt({ timeZone: "UTC", weekday: "narrow" });
  const hour = fmt({ timeZone: p.timeZone, hour: "numeric", hourCycle: "h23" });
  const relative = new Intl.RelativeTimeFormat(p.locale, { numeric: "auto" });
  const cap = (s: string) => s.charAt(0).toLocaleUpperCase(p.locale) + s.slice(1);

  const symbol =
    new Intl.NumberFormat(p.locale, { style: "currency", currency: p.currency }).formatToParts(0).find((x) => x.type === "currency")
      ?.value ?? p.currency;

  return {
    moneyFormat,
    symbol,
    money: moneyFormatter(moneyFormat),
    parse: (s) => parseMoney(s, moneyFormat),
    input: (m) => toInputText(m, moneyFormat),
    time: (i) => time.format(new Date(i)),
    day: (d) => day.format(asDate(d)),
    shortDay: (d) => shortDay.format(asDate(d)),
    longDay: (d) => longDay.format(asDate(d)),
    weekdayInitial: (d) => initial.format(asDate(d)),
    when(instant, today) {
      const d = toLocalDate(instant, p.timeZone);
      const label =
        d === today ? cap(relative.format(0, "day")) : d === addDays(today, -1) ? cap(relative.format(-1, "day")) : day.format(asDate(d));
      return `${label}, ${time.format(new Date(instant))}`;
    },
    greeting() {
      const h = +hour.format(new Date());
      return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
    },
  };
}
