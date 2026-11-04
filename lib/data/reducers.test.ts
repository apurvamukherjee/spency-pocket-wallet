import { describe, expect, it } from "vitest";
import { deleteCommitment, deleteEnvelope } from "./reducers";
import type { AppData } from "./types";

const base: AppData = {
  profile: { displayName: "", email: null, currency: "INR", locale: "en-IN", timeZone: "Asia/Kolkata", theme: "dark", defaultEnvelopeId: "e1" },
  plan: { id: "p", month: "2026-11", openingBank: 0, openingCash: 0, balanceAt: "2026-11-01T00:00:00Z", target: 0, salary: null, weekStart: 1, unpaidBills: ["b1", "b2"] },
  envelopes: [{ id: "e1", name: "Groceries", weeklyLimit: 100, locked: false, leftover: "rollover" }],
  commitments: [{ id: "b1", name: "Rent", amount: 100, frequency: "monthly", nextDebit: "2026-11-05" }],
  txns: [],
  memory: {},
  checks: [],
};

describe("delete reducers mirror the database", () => {
  it("clears the default envelope when it is deleted", () => {
    expect(deleteEnvelope(base, "e1").profile.defaultEnvelopeId).toBeNull();
  });
  it("drops a deleted bill from the not-paid-yet list", () => {
    expect(deleteCommitment(base, "b1").plan?.unpaidBills).toEqual(["b2"]);
  });
});
