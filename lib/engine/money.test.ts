import { describe, expect, it } from "vitest";
import {
  allocate,
  allocateWhole,
  floorToUnit,
  formatMoney,
  major,
  MoneyError,
  parseMoney,
  parseSignedMoney,
  toInputText,
  unitOf,
} from "./money";

const INR = { currency: "INR", locale: "en-IN" };
const USD = { currency: "USD", locale: "en-US" };
const EUR_DE = { currency: "EUR", locale: "de-DE" };
const JPY = { currency: "JPY", locale: "ja-JP" };

describe("unitOf", () => {
  it("follows each currency's minor unit", () => {
    expect(unitOf("INR")).toBe(100);
    expect(unitOf("JPY")).toBe(1);
    expect(unitOf("KWD")).toBe(1000);
  });
});

describe("formatMoney", () => {
  it("uses the locale's grouping", () => {
    expect(formatMoney(major(100000), INR)).toBe("₹1,00,000");
    expect(formatMoney(major(100000), USD)).toBe("$100,000");
    expect(formatMoney(major(1500), EUR_DE)).toBe("1.500\u00a0€");
    expect(formatMoney(1500, JPY)).toBe("￥1,500");
  });
  it("shows fractions only when present", () => {
    expect(formatMoney(150, INR)).toBe("₹1.50");
    expect(formatMoney(5, USD)).toBe("$0.05");
    expect(formatMoney(150050, EUR_DE)).toBe("1.500,50\u00a0€");
  });
  it("is exact for large values", () => {
    expect(formatMoney(900_719_925_474_099, USD)).toBe("$9,007,199,254,740.99");
  });
  it("signs", () => {
    expect(formatMoney(-34000, INR)).toBe("-₹340");
    expect(formatMoney(34000, INR, { signed: true })).toBe("+₹340");
  });
  it("rejects fractional minor units", () => {
    expect(() => formatMoney(1.5, INR)).toThrow(MoneyError);
  });
});

describe("parseMoney", () => {
  it("parses in the locale's notation", () => {
    expect(parseMoney("1,500", INR)).toBe(150000);
    expect(parseMoney("₹99.5", INR)).toBe(9950);
    expect(parseMoney("1.500,50", EUR_DE)).toBe(150050);
    expect(parseMoney("1500", JPY)).toBe(1500);
  });
  it("rejects junk", () => {
    expect(parseMoney("", INR)).toBeNull();
    expect(parseMoney("12.345", USD)).toBeNull();
    expect(parseMoney("-5", USD)).toBeNull();
    expect(parseMoney("1.5", JPY)).toBeNull();
  });
});

describe("toInputText", () => {
  it("round-trips through parseMoney", () => {
    for (const [v, f] of [
      [9950, INR],
      [150050, EUR_DE],
      [1500, JPY],
    ] as const) {
      expect(parseMoney(toInputText(v, f), f)).toBe(v);
    }
    expect(toInputText(150050, EUR_DE)).toBe("1500,5");
  });
});

describe("floorToUnit", () => {
  it("floors toward −∞", () => {
    expect(floorToUnit(12345, 100)).toBe(12300);
    expect(floorToUnit(-50, 100)).toBe(-100);
    expect(floorToUnit(12345, 1)).toBe(12345);
  });
});

describe("allocate", () => {
  it("sums exactly", () => {
    const out = allocate(100, [1, 1, 1]);
    expect(out.reduce((a, b) => a + b)).toBe(100);
    expect(out).toEqual([34, 33, 33]);
  });
  it("is proportional", () => {
    expect(allocate(35000, [20000, 15000, 0])).toEqual([20000, 15000, 0]);
    expect(allocate(1000, [3, 1])).toEqual([750, 250]);
  });
  it("handles zero weights", () => {
    expect(allocate(100, [0, 0])).toEqual([0, 0]);
  });
});

describe("allocateWhole", () => {
  it("splits in whole units and still sums exactly", () => {
    expect(allocateWhole(major(115), [major(114), major(43)], 100)).toEqual([major(84), major(31)]);
    expect(allocateWhole(11550, [1, 3], 100)).toEqual([2900, 8650]);
    expect(allocateWhole(115, [114, 43], 1)).toEqual([84, 31]);
  });
  it("gives nothing when no one has weight", () => {
    expect(allocateWhole(150, [0, 0], 100)).toEqual([0, 0]);
  });
});

describe("overdrawn balances", () => {
  it("parses a leading minus only where signs are allowed", () => {
    expect(parseSignedMoney("-1,500.50", INR)).toBe(-150050);
    expect(parseSignedMoney("\u22122000", INR)).toBe(-200000);
    expect(parseSignedMoney("-0", INR)).toBe(0);
    expect(parseSignedMoney("1500", INR)).toBe(150000);
    expect(parseMoney("-1500", INR)).toBeNull();
  });

  it("round-trips negative amounts through the input text", () => {
    expect(toInputText(-150050, INR)).toBe("-1500.5");
    expect(parseSignedMoney(toInputText(-150050, INR), INR)).toBe(-150050);
    expect(toInputText(-5, INR)).toBe("-0.05");
  });
});
