import { describe, expect, it } from "vitest";
import { billFundsAtEnd, billStatus, catchUp, summarize, type SpencyData, walletBalances } from "./derive";
import { major as rupees } from "./money";
import { isCurrentPlan } from "./plan";
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
    currency: "INR",
    timeZone: "Asia/Kolkata",
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

describe("time zones", () => {
  it("buckets payments into the plan's local day", () => {
    // 11:30 pm on Mon 2 Nov in Los Angeles is already Tue 3 Nov in UTC.
    const la = base({
      plan: { ...base().plan, timeZone: "America/Los_Angeles", currency: "USD", balanceAt: "2026-11-01T00:00:00-07:00" },
      txns: [txn("2026-11-02", 40, { envelopeId: "Blinkit", occurredAt: "2026-11-03T07:30:00Z" })],
    });
    const s = summarize(la, "2026-11-02");
    expect(s.current.start).toBe("2026-11-02");
    expect(s.current.settlement.envelopes.find((e) => e.id === "Blinkit")?.spent).toBe(rupees(40));
  });

  it("rounds to whole yen for JPY plans", () => {
    const jp = base({
      plan: { ...base().plan, currency: "JPY", timeZone: "Asia/Tokyo", openingBank: 300000, target: 200000 },
      envelopes: [env("Konbini", 0, { weeklyLimit: 10000 })],
      commitments: [],
    });
    const s = summarize(jp, "2026-11-03");
    expect(s.weeks[0].settlement.envelopes[0].limit).toBe(1429);
    expect(s.projected).toBe(200000);
  });
});

describe("bill status and manual overrides", () => {
  // Plan started Tue 3 Nov. Gym is due on the 1st (already passed), Phone on the 25th.
  const gym = { id: "gym", name: "Gym", amount: rupees(750), frequency: "monthly" as const, nextDebit: "2026-12-01" };
  const phone = { id: "phone", name: "Phone", amount: rupees(250), frequency: "monthly" as const, nextDebit: "2026-11-25" };
  const plan = { ...base().plan, balanceAt: "2026-11-03T10:00:00+05:30" };
  const data = (over: Partial<SpencyData> = {}) => base({ plan, commitments: [gym, phone], ...over });

  it("assumes a bill whose day passed before the plan is already paid", () => {
    expect(billStatus(plan, gym, [])).toEqual({ state: "assumed_paid", due: 0, paymentIds: [] });
    expect(billStatus(plan, phone, [])).toEqual({ state: "due", due: rupees(250), paymentIds: [] });
    expect(summarize(data(), "2026-11-03").commitmentsRemaining).toBe(rupees(250));
  });

  it("'not paid yet' sets the money aside again without touching the projection", () => {
    const before = summarize(data(), "2026-11-03");
    const unpaid = { ...plan, unpaidBills: ["gym"] };
    const after = summarize(data({ plan: unpaid }), "2026-11-03");
    expect(billStatus(unpaid, gym, []).state).toBe("due");
    expect(after.commitmentsRemaining).toBe(rupees(1000));
    expect(after.flexBudget).toBe(before.flexBudget - rupees(750));
    expect(after.projected).toBe(rupees(70000));
  });

  it("logging a payment marks the bill paid and keeps the projection honest", () => {
    const paid = txn("2026-11-03", 250, { commitmentId: "phone", merchant: "Phone" });
    const s = summarize(data({ txns: [paid] }), "2026-11-03");
    expect(billStatus(plan, phone, [paid])).toEqual({ state: "paid", due: 0, paymentIds: [paid.id] });
    expect(s.commitmentsRemaining).toBe(0);
    expect(s.projected).toBe(rupees(70000));
  });

  it("a yearly bill not due this month has no status", () => {
    const yearly = { ...phone, id: "y", frequency: "yearly" as const, nextDebit: "2027-03-10" };
    expect(billStatus(plan, yearly, []).state).toBe("none");
  });
});

describe("yearly bills are saved for monthly", () => {
  const insurance = { id: "ins", name: "Insurance", amount: rupees(12000), frequency: "yearly" as const, nextDebit: "2027-03-10" };

  it("spreads the bill over the months left and still lands on target", () => {
    const data = base({ commitments: [insurance] });
    for (const day of ["2026-11-01", "2026-11-15", "2026-11-30"]) {
      const s = summarize(data, day);
      expect(s.projected).toBe(rupees(70000));
      // Nov → Mar is five months: 12,000 / 5.
      expect(s.billSavings).toBe(rupees(2400));
      expect(s.commitmentsRemaining).toBe(0);
    }
    expect(billFundsAtEnd(data.plan, data.commitments, [])).toEqual({ ins: rupees(2400) });
  });

  it("counts what's already saved as not spendable", () => {
    const fresh = summarize(base({ commitments: [insurance] }), "2026-11-02");
    const saved = summarize(base({ commitments: [insurance], plan: { ...base().plan, openingBank: rupees(87000), billFunds: { ins: rupees(7000) } } }), "2026-11-02");
    // The bank holds 7,000 more, all of it for the bill, and the monthly share falls to (12,000 − 7,000) / 5.
    expect(saved.spendable).toBe(fresh.spendable);
    expect(saved.billSavings).toBe(rupees(7000 + 1000));
    expect(saved.projected).toBe(rupees(70000));
  });

  it("in the month it's due, pays from the savings and resets", () => {
    const march = {
      ...base().plan,
      month: "2027-03",
      openingBank: rupees(90000),
      balanceAt: "2027-03-01T00:00:00+05:30",
      billFunds: { ins: rupees(9600) },
    };
    const unpaid = summarize(base({ plan: march, commitments: [insurance] }), "2027-03-05");
    expect(unpaid.commitmentsRemaining).toBe(rupees(12000));
    expect(unpaid.billSavings).toBe(0);
    expect(unpaid.projected).toBe(rupees(70000));

    const paid = [txn("2027-03-10", 12000, { commitmentId: "ins", merchant: "Insurance" })];
    const after = summarize(base({ plan: march, commitments: [insurance], txns: paid }), "2027-03-12");
    expect(after.commitmentsRemaining).toBe(0);
    expect(after.projected).toBe(rupees(70000));
    expect(billFundsAtEnd(march, [insurance], paid)).toEqual({});
  });

  it("catches up when started late: everything missing is due in the bill's own month", () => {
    const feb = { ...base().plan, month: "2027-02", balanceAt: "2027-02-01T00:00:00+05:30" };
    // Feb → Mar is two months.
    expect(summarize(base({ plan: feb, commitments: [insurance] }), "2027-02-02").billSavings).toBe(rupees(6000));
  });
});

describe("catchUp", () => {
  it("is null when on track", () => {
    expect(catchUp(summarize(base(), "2026-11-10"), 100)).toBeNull();
  });

  it("spreads the gap over the days left, rounded up to a whole unit", () => {
    // 2,000 over on flex on the 10th: 21 days left.
    const s = summarize(base({ txns: [txn("2026-11-10", 2000)] }), "2026-11-10");
    const c = catchUp({ ...s, projected: s.target - rupees(1000) }, 100);
    expect(c).toEqual({ kind: "per_day", gap: rupees(1000), perDay: rupees(48) });
  });

  it("says when the gap can't close this month", () => {
    expect(catchUp({ target: rupees(70000), projected: rupees(60000), budgetLeft: rupees(4000), daysLeftMonth: 5 }, 100)).toEqual({
      kind: "next_month",
      gap: rupees(10000),
      shortBy: rupees(6000),
    });
  });
});

describe("payday-to-payday months", () => {
  // Paid on the 25th: the month runs 25 Oct – 24 Nov and is keyed by the month it ends in.
  const payday = (over: Partial<SpencyData["plan"]> = {}) =>
    base({ plan: { ...base().plan, month: "2026-11", startDay: 25, balanceAt: "2026-10-25T09:00:00+05:30", ...over } });

  it("covers 25th to 24th and still lands on target", () => {
    for (const day of ["2026-10-25", "2026-10-31", "2026-11-01", "2026-11-24"]) {
      expect(summarize(payday(), day).projected).toBe(rupees(70000));
    }
    const s = summarize(payday(), "2026-11-10");
    expect(s.weeks[0].start).toBe("2026-10-19");
    expect(s.weeks.at(-1)?.start).toBe("2026-11-09");
  });

  it("counts bills due across both calendar months", () => {
    // Netflix on the 15th falls on 15 Nov, inside 25 Oct – 24 Nov.
    expect(summarize(payday(), "2026-10-26").commitmentsRemaining).toBe(rupees(649));
  });

  it("knows when the month is over", () => {
    const { plan } = payday();
    expect(isCurrentPlan(plan, "2026-11-24")).toBe(true);
    expect(isCurrentPlan(plan, "2026-11-25")).toBe(false);
    expect(isCurrentPlan(base().plan, "2026-11-30")).toBe(true);
    expect(isCurrentPlan(base().plan, "2026-12-01")).toBe(false);
  });
});
