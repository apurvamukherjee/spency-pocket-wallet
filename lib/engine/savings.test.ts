import { describe, expect, it } from "vitest";
import { summarize, type SpencyData } from "./derive";
import { major as rupees } from "./money";
import { commitmentsInPlan, envelopeAllocation, spendable } from "./plan";
import { savings, whatIf } from "./savings";
import type { Envelope, Txn } from "./types";

let seq = 0;
const txn = (date: string, amount: number, over: Partial<Txn> = {}): Txn => ({
  id: `t${++seq}`,
  wallet: "bank",
  amount: rupees(amount),
  direction: "debit",
  kind: "expense",
  merchant: "Shop",
  envelopeId: null,
  commitmentId: null,
  occurredAt: `${date}T12:00:00+05:30`,
  source: "manual",
  status: "confirmed",
  upiRef: null,
  note: null,
  createdAt: `${date}T12:00:00+05:30`,
  ...over,
});
const env = (id: string, weekly: number, over: Partial<Envelope> = {}): Envelope => ({
  id, name: id, weeklyLimit: rupees(weekly), locked: false, leftover: "rollover", ...over,
});
const data = (txns: Txn[] = []): SpencyData => ({
  plan: {
    month: "2026-11", currency: "INR", timeZone: "Asia/Kolkata",
    openingBank: rupees(80000), openingCash: 0, balanceAt: "2026-11-01T00:00:00+05:30",
    target: rupees(70000), salary: null, weekStart: 1,
  },
  envelopes: [env("Blinkit", 700), env("Fuel", 700)],
  commitments: [{ id: "n", name: "Netflix", amount: rupees(649), frequency: "monthly", nextDebit: "2026-11-15" }],
  txns,
});

describe("savings", () => {
  it("planned over the whole month is exactly the discretionary budget", () => {
    const d = data();
    const s = savings(d, "2026-11-30");
    expect(s.total.planned).toBe(spendable(d.plan) - commitmentsInPlan(d.plan, d.commitments));
    expect(s.days).toHaveLength(30);
    expect(s.weeks.reduce((a, w) => a + w.saved, 0)).toBe(s.total.saved);
  });

  it("each envelope's month plan equals its allocation", () => {
    const d = data();
    const s = savings(d, "2026-11-30");
    for (const e of d.envelopes) expect(s.lines.find((l) => l.id === e.id)!.planned).toBe(envelopeAllocation(d.plan, e));
  });

  it("ranks savers, counts refunds, ignores bills, transfers and pending", () => {
    const s = savings(
      data([
        txn("2026-11-03", 900, { envelopeId: "Blinkit" }),
        txn("2026-11-04", 100, { envelopeId: "Blinkit", direction: "credit" }),
        txn("2026-11-04", 649, { commitmentId: "n" }),
        txn("2026-11-04", 2000, { kind: "transfer" }),
        txn("2026-11-05", 5000, { envelopeId: "Fuel", status: "pending" }),
      ]),
      "2026-11-08",
    );
    const blinkit = s.lines.find((l) => l.id === "Blinkit")!;
    expect(blinkit.spent).toBe(rupees(800));
    expect(s.lines.at(-1)!.id).toBe("Blinkit");
    expect(s.total.spent).toBe(rupees(800));
    expect(s.days.find((x) => x.date === "2026-11-03")!.spent).toBe(rupees(900));
  });

  it("what-if raises the projection by the money not spent", () => {
    const d = data();
    const sum = summarize(d, "2026-11-24");
    const w = whatIf(sum, rupees(700), 100);
    expect(sum.daysLeftMonth).toBe(7);
    expect(w.thisMonth).toBe(rupees(700));
    expect(w.aboveTarget).toBe(rupees(700));
    expect(w.perYear).toBe(rupees(36500));
  });
});
