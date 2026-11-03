import { describe, expect, it } from "vitest";
import { defaultEnvelopeId, findDuplicate, recallEnvelope, rememberMerchant } from "./inbox";
import type { Txn } from "./types";

const existing: Txn = {
  id: "a",
  wallet: "bank",
  amount: 24900,
  direction: "debit",
  kind: "expense",
  merchant: "Blinkit",
  envelopeId: "blinkit",
  commitmentId: null,
  occurredAt: "2026-11-03T10:00:00+05:30",
  source: "claude",
  status: "confirmed",
  upiRef: "631234567890",
  note: null,
  createdAt: "2026-11-03T10:01:00+05:30",
};

describe("findDuplicate", () => {
  it("matches on UPI ref", () => {
    const c = { upiRef: "631234567890", merchant: "Other", amount: 1, occurredAt: "2026-11-05T00:00:00+05:30" };
    expect(findDuplicate(c, [existing])?.id).toBe("a");
  });

  it("different refs are different payments even if everything else matches", () => {
    const c = { upiRef: "999", merchant: "Blinkit", amount: 24900, occurredAt: existing.occurredAt };
    expect(findDuplicate(c, [existing])).toBeUndefined();
  });

  it("without a ref, matches merchant + amount within 2 minutes", () => {
    const c = { upiRef: null, merchant: " blinkit ", amount: 24900, occurredAt: "2026-11-03T10:01:59+05:30" };
    expect(findDuplicate(c, [existing])?.id).toBe("a");
    expect(findDuplicate({ ...c, occurredAt: "2026-11-03T10:02:01+05:30" }, [existing])).toBeUndefined();
    expect(findDuplicate({ ...c, amount: 25000 }, [existing])).toBeUndefined();
  });

  it("ignores rejected txns and itself", () => {
    const c = { upiRef: "631234567890", merchant: "Blinkit", amount: 24900, occurredAt: existing.occurredAt };
    expect(findDuplicate(c, [{ ...existing, status: "rejected" }])).toBeUndefined();
    expect(findDuplicate({ ...c, id: "a" }, [existing])).toBeUndefined();
  });
});

describe("merchant memory", () => {
  it("remembers by normalized merchant", () => {
    const m = rememberMerchant({}, "  Blinkit  Commerce", "blinkit");
    expect(recallEnvelope(m, "blinkit commerce")).toBe("blinkit");
    expect(recallEnvelope(m, "Zepto")).toBeUndefined();
  });
});

describe("defaultEnvelopeId", () => {
  const envs = [
    { id: "g", name: "Groceries", weeklyLimit: 1, locked: false, leftover: "rollover" as const },
    { id: "s", name: "Small Stuff", weeklyLimit: 1, locked: false, leftover: "rollover" as const },
  ];
  it("prefers the user's choice, then Small stuff, then Flex", () => {
    expect(defaultEnvelopeId(envs, "g")).toBe("g");
    expect(defaultEnvelopeId(envs, null)).toBe("s");
    expect(defaultEnvelopeId(envs, "deleted")).toBe("s");
    expect(defaultEnvelopeId([envs[0]], undefined)).toBeNull();
  });
});
