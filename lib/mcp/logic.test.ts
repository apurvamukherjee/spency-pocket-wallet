import { describe, expect, it } from "vitest";
import { rememberMerchant } from "@/lib/engine/inbox";
import type { Envelope, Txn } from "@/lib/engine/types";
import { beforePlanNote, envelopeIdByName, planImport, resolveCategory, toMinor, ToolInputError } from "./logic";

const env = (id: string, name: string): Envelope => ({ id, name, weeklyLimit: 50000, locked: false, leftover: "rollover" });
const envelopes = [env("g", "Groceries"), env("e", "Eating out")];

describe("toMinor", () => {
  it("parses numbers and strings without floats", () => {
    expect(toMinor(249, 100)).toBe(24900);
    expect(toMinor("249.5", 100)).toBe(24950);
    expect(toMinor("1,249.00", 100)).toBe(124900);
    expect(toMinor("₹ 99", 100)).toBe(9900);
    expect(toMinor(1500, 1)).toBe(1500);
    expect(toMinor(0.1, 100)).toBe(10);
  });
  it("rejects junk, zero and extra decimals", () => {
    expect(() => toMinor("abc", 100)).toThrow(ToolInputError);
    expect(() => toMinor(0, 100)).toThrow(ToolInputError);
    expect(() => toMinor("1.234", 100)).toThrow(ToolInputError);
    expect(() => toMinor("1.5", 1)).toThrow(ToolInputError);
    expect(() => toMinor(-5, 100)).toThrow(ToolInputError);
  });
});

describe("resolveCategory", () => {
  it("prefers merchant memory over Claude's suggestion", () => {
    const memory = rememberMerchant({}, "Swiggy", "e");
    expect(resolveCategory(envelopes, memory, "swiggy", "Groceries")).toEqual({ envelopeId: "e", via: "memory" });
  });
  it("maps suggestions to envelope names, loosely", () => {
    expect(resolveCategory(envelopes, {}, "Zepto", "groceries").envelopeId).toBe("g");
    expect(resolveCategory(envelopes, {}, "Cafe", "eating").envelopeId).toBe("e");
  });
  it("falls back to flex, and ignores memory pointing at a deleted envelope", () => {
    expect(resolveCategory(envelopes, {}, "Zara", "Clothes")).toEqual({ envelopeId: null, via: "flex" });
    expect(resolveCategory(envelopes, rememberMerchant({}, "X", "gone"), "X").via).toBe("flex");
  });
});

describe("planImport", () => {
  let n = 0;
  const id = () => `new-${++n}`;
  const existing: Txn = {
    id: "old",
    wallet: "bank",
    amount: 18600,
    direction: "debit",
    kind: "expense",
    merchant: "Blinkit",
    envelopeId: "g",
    commitmentId: null,
    occurredAt: "2026-11-01T14:12:00.000Z",
    source: "claude",
    status: "confirmed",
    upiRef: "631298114502",
    note: null,
    createdAt: "2026-11-01T14:12:00.000Z",
  };
  const data = { envelopes, memory: {}, txns: [existing] };

  it("creates pending Claude transactions with categories", () => {
    const plan = planImport(data, [{ amount: "348", merchant: "Swiggy", suggested_category: "Eating out", occurred_at: "2026-11-03T12:48:00+05:30" }], 100, "2026-11-03T08:00:00Z", id);
    expect(plan.add).toHaveLength(1);
    expect(plan.add[0].txn).toMatchObject({ amount: 34800, status: "pending", source: "claude", envelopeId: "e", occurredAt: "2026-11-03T07:18:00.000Z" });
  });

  it("skips duplicates by reference and within the batch", () => {
    const plan = planImport(
      data,
      [
        { amount: 186, merchant: "Blinkit", reference: "631298114502" },
        { amount: 120, merchant: "Third Wave", occurred_at: "2026-11-03T13:02:00+05:30" },
        { amount: 120, merchant: "third wave", occurred_at: "2026-11-03T13:03:00+05:30" },
      ],
      100,
      "2026-11-03T08:00:00Z",
      id,
    );
    expect(plan.add.map((a) => a.txn.merchant)).toEqual(["Third Wave"]);
    expect(plan.skipped.map((s) => s.duplicateOf.id)).toEqual(["old", plan.add[0].txn.id]);
  });

  it("refuses bad dates and blank merchants", () => {
    expect(() => planImport(data, [{ amount: 1, merchant: "A", occurred_at: "yesterday" }], 100, "2026-11-03T00:00:00Z", id)).toThrow(ToolInputError);
    expect(() => planImport(data, [{ amount: 1, merchant: "  " }], 100, "2026-11-03T00:00:00Z", id)).toThrow(ToolInputError);
  });

  it("treats credits as income outside envelopes", () => {
    const plan = planImport(data, [{ amount: 500, merchant: "Refund", direction: "credit", suggested_category: "Groceries" }], 100, "2026-11-03T00:00:00Z", id);
    expect(plan.add[0].txn).toMatchObject({ direction: "credit", kind: "income", envelopeId: null });
  });
});

describe("envelopeIdByName", () => {
  it("matches names in any case and Flex", () => {
    expect(envelopeIdByName(envelopes, "eating OUT")).toBe("e");
    expect(envelopeIdByName(envelopes, "Flex")).toBeNull();
  });
  it("explains unknown names", () => {
    expect(() => envelopeIdByName(envelopes, "Clothes")).toThrow(/Groceries, Eating out, Flex/);
  });
});

describe("beforePlanNote", () => {
  it("only flags payments before the plan's starting balance", () => {
    expect(beforePlanNote("2026-10-30T10:00:00Z", "2026-11-01T00:00:00+05:30")).toMatch(/before this month's plan/);
    expect(beforePlanNote("2026-11-02T10:00:00Z", "2026-11-01T00:00:00+05:30")).toBeUndefined();
    expect(beforePlanNote("2026-10-30T10:00:00Z", null)).toBeUndefined();
  });
});
