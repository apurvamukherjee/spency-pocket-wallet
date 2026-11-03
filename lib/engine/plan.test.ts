import { describe, expect, it } from "vitest";
import { major as rupees } from "./money";
import {
  commitmentDates,
  commitmentsInPlan,
  monthlyEquivalent,
  envelopeAllocation,
  flexBudget,
  spendable,
  weekAllocation,
  weeksCovering,
} from "./plan";
import type { Commitment, Envelope, MonthPlan } from "./types";

const plan: MonthPlan = {
  month: "2026-11",
  currency: "INR",
  timeZone: "Asia/Kolkata",
  openingBank: rupees(80000),
  openingCash: 0,
  balanceAt: "2026-11-01T00:00:00+05:30",
  target: rupees(70000),
  salary: null,
  weekStart: 1,
};

const env = (weekly: number): Envelope => ({
  id: "e",
  name: "E",
  weeklyLimit: rupees(weekly),
  locked: false,
  leftover: "rollover",
});

const commitment = (over: Partial<Commitment>): Commitment => ({
  id: "c",
  name: "C",
  amount: rupees(649),
  frequency: "monthly",
  nextDebit: "2026-11-15",
  ...over,
});

describe("spendable", () => {
  it("is balance minus target", () => {
    expect(spendable(plan)).toBe(rupees(10000));
  });
  it("adds salary credited inside the month", () => {
    expect(spendable({ ...plan, salary: { amount: rupees(50000), date: "2026-11-30" } })).toBe(rupees(60000));
  });
  it("ignores salary dated outside the month", () => {
    expect(spendable({ ...plan, salary: { amount: rupees(50000), date: "2026-12-01" } })).toBe(rupees(10000));
  });
});

describe("partial weeks across month boundaries", () => {
  it("prorates a straddling week by days inside the month", () => {
    // Week of Mon 26 Oct: only Sun 1 Nov falls in November.
    expect(weekAllocation(rupees(700), "2026-10-26", "2026-11-01", "2026-11-30", 100)).toBe(rupees(100));
    // Week of Mon 30 Nov: only Mon 30 Nov falls in November.
    expect(weekAllocation(rupees(700), "2026-11-30", "2026-11-01", "2026-11-30", 100)).toBe(rupees(100));
  });

  it("lists every week that touches the month", () => {
    expect(weeksCovering("2026-11-01", "2026-11-30", 1)).toEqual([
      "2026-10-26",
      "2026-11-02",
      "2026-11-09",
      "2026-11-16",
      "2026-11-23",
      "2026-11-30",
    ]);
  });

  it("monthly allocation equals weekly/7 × days in month", () => {
    expect(envelopeAllocation(plan, env(700))).toBe(rupees(3000));
    expect(envelopeAllocation({ ...plan, month: "2027-02", balanceAt: "2027-02-01T00:00:00+05:30" }, env(700))).toBe(
      rupees(2800),
    );
  });

  it("only allocates from the day the plan starts", () => {
    expect(envelopeAllocation({ ...plan, balanceAt: "2026-11-16T09:00:00+05:30" }, env(700))).toBe(rupees(1500));
  });
});

describe("commitments", () => {
  it("expands monthly occurrences inside the window, including ones before nextDebit", () => {
    expect(commitmentDates(commitment({ nextDebit: "2026-12-05" }), "2026-11-01", "2026-11-30")).toEqual([
      "2026-11-05",
    ]);
  });
  it("expands weekly occurrences", () => {
    expect(commitmentDates(commitment({ frequency: "weekly", nextDebit: "2026-11-02" }), "2026-11-01", "2026-11-30"))
      .toHaveLength(5);
  });
  it("skips yearly commitments not due this month", () => {
    expect(commitmentDates(commitment({ frequency: "yearly", nextDebit: "2027-03-10" }), "2026-11-01", "2026-11-30"))
      .toEqual([]);
  });
  it("totals per plan window", () => {
    expect(commitmentsInPlan(plan, [commitment({}), commitment({ amount: rupees(99), nextDebit: "2026-11-02" })])).toBe(
      rupees(748),
    );
  });
});

describe("monthlyEquivalent", () => {
  it("normalizes every frequency to a month", () => {
    expect(monthlyEquivalent(commitment({ amount: rupees(750) }))).toBe(rupees(750));
    expect(monthlyEquivalent(commitment({ frequency: "weekly", amount: rupees(300) }))).toBe(rupees(1300));
    expect(monthlyEquivalent(commitment({ frequency: "yearly", amount: rupees(1200) }))).toBe(rupees(100));
  });
});

describe("flexBudget", () => {
  it("is spendable minus commitments minus envelope allocation", () => {
    expect(flexBudget(plan, [env(700)], [commitment({})])).toBe(rupees(10000 - 649 - 3000));
  });
});
