import type { Minor } from "./types";

export class MoneyError extends Error {
  override name = "MoneyError";
}

export function assertMinor(value: number): asserts value is Minor {
  if (!Number.isSafeInteger(value)) throw new MoneyError(`Not integer minor units: ${value}`);
}

/** Minor units per major unit: 100 for USD/INR/EUR, 1 for JPY, 1000 for KWD. */
export function unitOf(currency: string): number {
  const digits = new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;
  return 10 ** digits;
}

/** Whole major units → minor units, e.g. major(500) = 50000 for a 2-decimal currency. */
export function major(whole: number, unit = 100): Minor {
  assertMinor(whole);
  return whole * unit;
}

export type MoneyFormat = { currency: string; locale: string };
export type FormatMoney = (minor: Minor, opts?: { signed?: boolean }) => string;

const formatters = new Map<string, Intl.NumberFormat>();
function formatter(f: MoneyFormat, digits: number, fraction: boolean, signed: boolean) {
  const key = `${f.locale}|${f.currency}|${fraction}|${signed}`;
  let nf = formatters.get(key);
  if (!nf) {
    nf = new Intl.NumberFormat(f.locale, {
      style: "currency",
      currency: f.currency,
      minimumFractionDigits: fraction ? digits : 0,
      maximumFractionDigits: digits,
      signDisplay: signed ? "exceptZero" : "auto",
    });
    formatters.set(key, nf);
  }
  return nf;
}

/**
 * Locale-aware currency formatting (₹1,00,000 · $100,000 · 100.000 €). Builds a decimal string so the
 * value never passes through a float; fractions only show when non-zero.
 */
export function formatMoney(minor: Minor, f: MoneyFormat, opts: { signed?: boolean } = {}): string {
  assertMinor(minor);
  const unit = unitOf(f.currency);
  const digits = Math.log10(unit);
  const abs = Math.abs(minor);
  const rem = abs % unit;
  const whole = (abs - rem) / unit;
  const decimal = `${minor < 0 ? "-" : ""}${whole}${digits ? `.${String(rem).padStart(digits, "0")}` : ""}`;
  return formatter(f, digits, rem !== 0, !!opts.signed).format(decimal as Intl.StringNumericLiteral);
}

export function moneyFormatter(f: MoneyFormat): FormatMoney {
  return (minor, opts) => formatMoney(minor, f, opts);
}

/** User input in the locale's own notation ("1,500.50" in en-US, "1.500,50" in de-DE) → minor units; null if invalid. */
export function parseMoney(input: string, f: MoneyFormat): Minor | null {
  const unit = unitOf(f.currency);
  const digits = Math.log10(unit);
  const sep = new Intl.NumberFormat(f.locale).formatToParts(1.1).find((p) => p.type === "decimal")?.value ?? ".";
  const clean = [...input].filter((c) => /\d/.test(c) || c === sep).join("");
  const parts = clean.split(sep);
  if (!parts[0] || parts.length > 2 || !/[\d]/.test(input)) return null;
  const frac = parts[1] ?? "";
  if (frac.length > digits || parts[0].length > 13) return null;
  if (/-/.test(input)) return null;
  return Number(parts[0]) * unit + Number(frac.padEnd(digits, "0") || "0");
}

/**
 * Like parseMoney, but a leading minus ("-" or "−") makes it negative. For balances that can be overdrawn and
 * targets that pay an overdraft down; never for payment amounts, which are always positive.
 */
export function parseSignedMoney(input: string, f: MoneyFormat): Minor | null {
  const t = input.trim();
  const negative = /^[-\u2212]/.test(t);
  const v = parseMoney(negative ? t.slice(1) : t, f);
  return v === null || !negative || v === 0 ? v : -v;
}

/** Minor units → plain editable text in the locale's notation, without grouping ("1500.5" / "1500,5"). */
export function toInputText(minor: Minor, f: MoneyFormat): string {
  // Format the size and put the sign in front: % on a negative number would split "-1500.50" into "-1500.-50".
  if (minor < 0) return `-${toInputText(-minor, f)}`;
  const unit = unitOf(f.currency);
  const digits = Math.log10(unit);
  return new Intl.NumberFormat(f.locale, { useGrouping: false, maximumFractionDigits: digits }).format(
    `${(minor - (minor % unit)) / unit}.${String(minor % unit).padStart(digits, "0")}` as Intl.StringNumericLiteral,
  );
}

export function floorToUnit(minor: Minor, unit: number): Minor {
  return minor - (((minor % unit) + unit) % unit);
}

/**
 * Splits `total` across `weights` proportionally, summing exactly to `total`
 * (largest-remainder). BigInt because total × weight can exceed 2^53.
 */
export function allocate(total: Minor, weights: Minor[]): Minor[] {
  assertMinor(total);
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0 || total === 0) return weights.map(() => 0);
  const T = BigInt(total);
  const W = BigInt(sum);
  const raw = weights.map((w) => {
    const p = T * BigInt(w);
    return { q: p / W, r: p % W };
  });
  let left = total - raw.reduce((a, x) => a + Number(x.q), 0);
  const order = raw
    .map((x, i) => ({ i, r: x.r }))
    .sort((a, b) => (a.r === b.r ? a.i - b.i : a.r > b.r ? -1 : 1));
  const out = raw.map((x) => Number(x.q));
  for (const { i } of order) {
    if (left <= 0) break;
    out[i]++;
    left--;
  }
  return out;
}

/** Like allocate, but in whole major units; the leftover fraction goes to the largest weight. Keeps derived numbers clean. */
export function allocateWhole(total: Minor, weights: Minor[], unit: number): Minor[] {
  if (weights.every((w) => w <= 0)) return weights.map(() => 0);
  const frac = total % unit;
  const out = allocate((total - frac) / unit, weights).map((r) => r * unit);
  if (frac > 0) out[weights.indexOf(Math.max(...weights))] += frac;
  return out;
}
