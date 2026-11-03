import { describe, expect, it } from "vitest";
import { summarize, type SpencyData, walletBalances } from "./derive";
import { rupees } from "./money";
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
  id,
  name: id,
  weeklyLimit: rupees(weekly),
  locked: false,
  leftover: "rollover",
  ...over,
});

// Nov 2026: Sun 1st. Monday weeks: Oct 26 (1 day in plan), Nov 2, 9, 16, 23, Nov 30 (1 day).
const base = (over: Partial<SpencyData> = {}): SpencyData => ({
  plan: {
    month: "2026-11",
    openingBank: rupees(80000),
    openingCash: 0,
    balanceAt: "2026-11-01T00:00:00+05:30",
    target: rupees(70000),
    salary: null,
    weekStart: 1,
  },
  envelopes: [env("Blinkit", 700), env("Fuel", 700), env("Small stuff", 350)],
  commitments: [{ id: "netflix", name: "Netflix", amount: rupees(649), frequency: "monthly", nextDebit: "2026-11-15" }],
  txns: [],
  ...over,
});

describe("summarize: projection stays honest", () => {
  it.each(["2026-11-01", "2026-11-03", "2026-11-20", "2026-11-30"])("on-plan with no spending → target (%s)", (day) => {
    expect(summarize(base(), day).projected).toBe(rupees(70000));
  });

  it("plan-start partial week only budgets its in-plan day", () => {
    const s = summarize(base(), "2026-11-03");
    expect(s.weeks[0].start).toBe("2026-10-26");
    expect(s.weeks[0].settlement.envelopes[0].limit).toBe(rupees(100));
    // Its unspent ₹100 rolls into this week.
    expect(s.current.settlement.envelopes[0].limit).toBe(rupees(800));
  });

  it("all covered: overspend absorbed by savings leaves projection on target", () => {
    const s = summarize(
      base({ txns: [txn("2026-11-03", 450, { envelopeId: "Small stuff" }), txn("2026-11-03", 100, { envelopeId: "Blinkit" })] }),
      "2026-11-04",
    );
    expect(s.status).toBe("covered");
    expect(s.projected).toBe(rupees(70000));
  });

  it("flex used: flex absorbs, target holds", () => {
    const s = summarize(
      base({
        envelopes: [env("Blinkit", 700, { locked: true }), env("Small stuff", 350)],
        txns: [txn("2026-11-03", 850, { envelopeId: "Small stuff" })],
      }),
      "2026-11-04",
    );
    expect(s.status).toBe("managed");
    expect(s.current.settlement.fromFlex).toBe(rupees(450));
    expect(s.flexLeft).toBe(s.flexBudget - rupees(450));
    expect(s.projected).toBe(rupees(70000));
  });

  it("target hit: overspend past flex lowers the projection by exactly the excess", () => {
    const data = base({ envelopes: [env("Small stuff", 350)] });
    const flex = summarize(data, "2026-11-04").flexBudget;
    const over = flex / 100 + 350 + 50 + 1000; // limit (₹350 + ₹50 rollover) + all of flex + ₹1,000 more
    const s = summarize({ ...data, txns: [txn("2026-11-03", over, { envelopeId: "Small stuff" })] }, "2026-11-04");
    expect(s.status).toBe("target_hit");
    expect(s.current.settlement.hitTarget).toBe(rupees(1000));
    expect(s.projected).toBe(rupees(69000));
  });

  it("finished weeks apply leftover rules: to_target becomes bonus saved", () => {
    const s = summarize(
      base({
        envelopes: [env("Blinkit", 700, { leftover: "to_target" })],
        txns: [txn("2026-11-03", 500, { envelopeId: "Blinkit" })],
      }),
      "2026-11-10",
    );
    // Week Nov 2: limit 700 (no rollover: to_target) spent 500 → 200 saved. Week Oct 26 day: 100 saved.
    expect(s.bonusSaved).toBe(rupees(300));
    expect(s.projected).toBe(rupees(70300));
  });

  it("to_flex leftovers top up flex", () => {
    const s = summarize(
      base({ envelopes: [env("Fuel", 700, { leftover: "to_flex" })], commitments: [] }),
      "2026-11-03",
    );
    expect(s.flexLeft).toBe(s.flexBudget + rupees(100));
    expect(s.projected).toBe(rupees(70000));
  });
});

describe("cash", () => {
  it("withdrawal is a transfer: bank down, cash up, budget untouched", () => {
    const data = base({ txns: [txn("2026-11-03", 2000, { kind: "transfer", merchant: "ATM" })] });
    const s = summarize(data, "2026-11-03");
    expect(s.bank).toBe(rupees(78000));
    expect(s.cash).toBe(rupees(2000));
    expect(s.flexLeft).toBe(s.flexBudget);
    expect(s.envelopeLeftThisWeek).toBe(summarize(base(), "2026-11-03").envelopeLeftThisWeek);
    expect(s.projected).toBe(rupees(70000));
  });

  it("cash spends count toward envelopes but only move the cash wallet", () => {
    const s = summarize(
      base({
        txns: [
          txn("2026-11-03", 2000, { kind: "transfer" }),
          txn("2026-11-03", 300, { wallet: "cash", envelopeId: "Fuel" }),
        ],
      }),
      "2026-11-03",
    );
    expect(s.bank).toBe(rupees(78000));
    expect(s.cash).toBe(rupees(1700));
    expect(s.current.settlement.envelopes.find((e) => e.id === "Fuel")?.spent).toBe(rupees(300));
    expect(s.projected).toBe(rupees(70000));
  });
});

describe("balances only come from confirmed txns after the plan", () => {
  it("ignores pending, rejected and pre-plan txns", () => {
    const data = base({
      txns: [
        txn("2026-11-02", 100, { status: "pending" }),
        txn("2026-11-02", 100, { status: "rejected" }),
        txn("2026-10-31", 100),
        txn("2026-11-02", 100),
      ],
    });
    expect(walletBalances(data.plan, data.txns)).toEqual({ bank: rupees(79900), cash: 0 });
  });
});

describe("commitments and salary", () => {
  it("a paid bill stops being reserved and does not touch flex", () => {
    const s = summarize(base({ txns: [txn("2026-11-15", 649, { commitmentId: "netflix" })] }), "2026-11-16");
    expect(s.commitmentsRemaining).toBe(0);
    expect(s.flexLeft).toBe(s.flexBudget);
    expect(s.projected).toBe(rupees(70000));
  });

  it("pending salary counts once, received salary isn't double-counted", () => {
    const plan = { ...base().plan, salary: { amount: rupees(50000), date: "2026-11-28" } };
    expect(summarize(base({ plan }), "2026-11-03").projected).toBe(rupees(70000));
    const paid = summarize(
      base({ plan, txns: [txn("2026-11-28", 50000, { direction: "credit", kind: "salary" })] }),
      "2026-11-29",
    );
    expect(paid.salaryPending).toBe(0);
    expect(paid.projected).toBe(rupees(70000));
  });

  it("reconciliation adjustments draw on flex", () => {
    const s = summarize(base({ txns: [txn("2026-11-03", 340, { kind: "adjustment" })] }), "2026-11-03");
    expect(s.flexLeft).toBe(s.flexBudget - rupees(340));
    expect(s.projected).toBe(rupees(70000));
  });
});

describe("safe to spend today", () => {
  it("spreads envelope + a fair share of flex over the days left this week", () => {
    const data = base({ envelopes: [env("Blinkit", 700)], commitments: [] });
    const s = summarize(data, "2026-11-02");
    // Envelope: 700 + 100 rollover. Flex share: 7 of 29 remaining days.
    const flexShare = Math.floor((s.flexLeft * 7) / 29);
    expect(s.daysLeftThisWeek).toBe(7);
    expect(s.safeToday).toBe(Math.floor((rupees(800) + flexShare) / 7 / 100) * 100);
  });

  it("never goes negative", () => {
    const s = summarize(base({ txns: [txn("2026-11-02", 50000, { envelopeId: "Blinkit" })] }), "2026-11-02");
    expect(s.safeToday).toBe(0);
  });

  it("the last partial week only counts days in the month", () => {
    expect(summarize(base(), "2026-11-30").daysLeftThisWeek).toBe(1);
  });
});
