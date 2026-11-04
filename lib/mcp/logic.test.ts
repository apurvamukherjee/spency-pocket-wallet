import { describe, expect, it } from "vitest";
import { rememberMerchant } from "@/lib/engine/inbox";
import type { Envelope, Txn } from "@/lib/engine/types";
import { beforePlanNote, categoryByName, findAccount, planImport, resolveCategory, toMinor, ToolInputError, toSignedMinor } from "./logic";

const env = (id: string, name: string): Envelope => ({ id, name, weeklyLimit: 50000, locked: false, leftover: "rollover" });
const envelopes = [env("g", "Groceries"), env("e", "Eating out"), env("s", "Small stuff")];
const bills = [{ id: "n", name: "Netflix", amount: 64900, frequency: "monthly" as const, nextDebit: "2026-11-15" }];
const opts = { bills, fallback: "s" };

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
  it("prefers merchant memory over everything", () => {
    const memory = rememberMerchant({}, "Swiggy", "e");
    expect(resolveCategory(envelopes, memory, "swiggy", "Groceries", opts)).toEqual({ envelopeId: "e", commitmentId: null, via: "memory" });
  });
  it("files bill payments under the bill, by merchant or suggestion", () => {
    expect(resolveCategory(envelopes, {}, "NETFLIX", undefined, opts)).toEqual({ envelopeId: null, commitmentId: "n", via: "bill" });
    expect(resolveCategory(envelopes, {}, "Card payment", "netflix", opts).commitmentId).toBe("n");
  });
  it("maps suggestions to envelope names, loosely", () => {
    expect(resolveCategory(envelopes, {}, "Zepto", "groceries", opts).envelopeId).toBe("g");
    expect(resolveCategory(envelopes, {}, "Cafe", "eating", opts).envelopeId).toBe("e");
  });
  it("sends anything unmatched to the default envelope, never Flex on Claude's say-so", () => {
    expect(resolveCategory(envelopes, {}, "Zara", "Clothes", opts)).toEqual({ envelopeId: "s", commitmentId: null, via: "default" });
    expect(resolveCategory(envelopes, {}, "Zara", "Flex", opts).envelopeId).toBe("s");
    expect(resolveCategory(envelopes, rememberMerchant({}, "X", "gone"), "X", undefined, opts).via).toBe("default");
  });
  it("respects a merchant the user filed under Flex themselves", () => {
    expect(resolveCategory(envelopes, rememberMerchant({}, "Zara", null), "Zara", undefined, opts)).toEqual({ envelopeId: null, commitmentId: null, via: "memory" });
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
  const data = { envelopes, commitments: bills, memory: {}, txns: [existing], defaultEnvelopeId: "s" };

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

  it("puts a refund back into the envelope it came from", () => {
    const plan = planImport(data, [{ amount: 500, merchant: "Zepto", direction: "credit", suggested_category: "Groceries" }], 100, "2026-11-03T00:00:00Z", id);
    expect(plan.add[0].txn).toMatchObject({ direction: "credit", kind: "expense", envelopeId: "g", commitmentId: null });
  });

  it("treats other credits as income toward the target, never as a bill or the default envelope", () => {
    const plan = planImport(
      data,
      [
        { amount: 500, merchant: "Acme Payroll", direction: "credit" },
        { amount: 649, merchant: "Netflix", direction: "credit" },
      ],
      100,
      "2026-11-03T00:00:00Z",
      id,
    );
    for (const { txn } of plan.add) expect(txn).toMatchObject({ direction: "credit", kind: "income", envelopeId: null, commitmentId: null });
  });
});

describe("categoryByName", () => {
  it("matches envelopes, bills and Flex in any case", () => {
    expect(categoryByName(envelopes, bills, "eating OUT")).toEqual({ envelopeId: "e", commitmentId: null });
    expect(categoryByName(envelopes, bills, "netflix")).toEqual({ envelopeId: null, commitmentId: "n" });
    expect(categoryByName(envelopes, bills, "Flex")).toEqual({ envelopeId: null, commitmentId: null });
  });
  it("explains unknown names", () => {
    expect(() => categoryByName(envelopes, bills, "Clothes")).toThrow(/Groceries, Eating out, Small stuff, Netflix, Flex/);
  });
});

describe("beforePlanNote", () => {
  it("only flags payments before the plan's starting balance", () => {
    expect(beforePlanNote("2026-10-30T10:00:00Z", "2026-11-01T00:00:00+05:30")).toMatch(/before this month's plan/);
    expect(beforePlanNote("2026-11-02T10:00:00Z", "2026-11-01T00:00:00+05:30")).toBeUndefined();
    expect(beforePlanNote("2026-10-30T10:00:00Z", null)).toBeUndefined();
  });
});

describe("toSignedMinor", () => {
  it("accepts zero and overdrawn balances", () => {
    expect(toSignedMinor("-2,000.50", 100)).toBe(-200050);
    expect(toSignedMinor(0, 100)).toBe(0);
    expect(toSignedMinor("₹0.00", 100)).toBe(0);
    expect(toSignedMinor("1500", 100)).toBe(150000);
    expect(() => toSignedMinor("abc", 100)).toThrow(ToolInputError);
  });
});

describe("bank accounts", () => {
  const accounts = [
    { id: "m", name: "HDFC" },
    { id: "s", name: "SBI Savings" },
  ];

  it("finds an account by name; the main one is stored as null", () => {
    expect(findAccount(accounts, "sbi")).toBe("s");
    expect(findAccount(accounts, "hdfc")).toBeNull();
    expect(() => findAccount(accounts, "Axis")).toThrow(/HDFC, SBI Savings/);
  });

  it("files Claude's payments under the named account", () => {
    const d = { envelopes: [], commitments: [], memory: {}, txns: [], defaultEnvelopeId: null, accounts };
    const plan = planImport(d, [{ amount: 100, merchant: "Shop", account: "SBI Savings" }, { amount: 50, merchant: "Cafe", wallet: "cash", account: "SBI" }], 100, "2026-11-03T00:00:00Z", () => "x");
    expect(plan.add.map((a) => a.txn.accountId)).toEqual(["s", null]);
  });
});
