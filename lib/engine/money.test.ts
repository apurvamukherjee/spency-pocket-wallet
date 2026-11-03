import { describe, expect, it } from "vitest";
import { allocate, floorToRupee, formatINR, MoneyError, parseRupees, rupees } from "./money";

describe("formatINR", () => {
  it("uses Indian digit grouping", () => {
    expect(formatINR(rupees(100000))).toBe("₹1,00,000");
    expect(formatINR(rupees(12345678))).toBe("₹1,23,45,678");
  });
  it("shows paise only when present", () => {
    expect(formatINR(150)).toBe("₹1.50");
    expect(formatINR(5)).toBe("₹0.05");
  });
  it("signs", () => {
    expect(formatINR(-34000)).toBe("−₹340");
    expect(formatINR(34000, { signed: true })).toBe("+₹340");
  });
  it("rejects fractional paise", () => {
    expect(() => formatINR(1.5)).toThrow(MoneyError);
  });
});

describe("parseRupees", () => {
  it("parses", () => {
    expect(parseRupees("1,500")).toBe(150000);
    expect(parseRupees("₹99.5")).toBe(9950);
    expect(parseRupees("0.05")).toBe(5);
  });
  it("rejects junk", () => {
    expect(parseRupees("")).toBeNull();
    expect(parseRupees("12.345")).toBeNull();
    expect(parseRupees("-5")).toBeNull();
  });
});

describe("floorToRupee", () => {
  it("floors toward −∞", () => {
    expect(floorToRupee(12345)).toBe(12300);
    expect(floorToRupee(-50)).toBe(-100);
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
