import type { Paise } from "./types";

export class MoneyError extends Error {
  override name = "MoneyError";
}

export function assertPaise(value: number): asserts value is Paise {
  if (!Number.isSafeInteger(value)) throw new MoneyError(`Not integer paise: ${value}`);
}

export function rupees(whole: number): Paise {
  assertPaise(whole);
  return whole * 100;
}

const grouping = new Intl.NumberFormat("en-IN");

/** ₹1,00,000 grouping; paise only shown when non-zero. Formats without ever dividing into a float. */
export function formatINR(paise: Paise, opts: { signed?: boolean } = {}): string {
  assertPaise(paise);
  const abs = Math.abs(paise);
  const rem = abs % 100;
  const whole = grouping.format((abs - rem) / 100);
  const body = rem === 0 ? whole : `${whole}.${String(rem).padStart(2, "0")}`;
  const sign = paise < 0 ? "−" : opts.signed && paise > 0 ? "+" : "";
  return `${sign}₹${body}`;
}

/** Parses user input like "1,500" or "₹99.5" into paise; null when not a valid amount. */
export function parseRupees(input: string): Paise | null {
  const clean = input.replace(/[₹,\s]/g, "");
  const m = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(clean);
  if (!m) return null;
  return Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0"));
}

export function floorToRupee(paise: Paise): Paise {
  return paise - (((paise % 100) + 100) % 100);
}

/**
 * Splits `total` across `weights` proportionally, summing exactly to `total`
 * (largest-remainder). BigInt because total × weight can exceed 2^53.
 */
export function allocate(total: Paise, weights: Paise[]): Paise[] {
  assertPaise(total);
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
