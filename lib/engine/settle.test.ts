import { describe, expect, it } from "vitest";
import { major as rupees, moneyFormatter } from "./money";
import { coverLine, describeSettlement, type EnvelopeWeek, settleWeek } from "./settle";

const env = (id: string, limit: number, spent: number, over: Partial<EnvelopeWeek> = {}): EnvelopeWeek => ({
  id,
  name: id,
  limit: rupees(limit),
  spent: rupees(spent),
  locked: false,
  leftover: "rollover",
  ...over,
});

const fmt = moneyFormatter({ currency: "INR", locale: "en-IN" });
const ctx = { live: false, target: rupees(70000), projected: rupees(70000), fmt };

describe("settleWeek", () => {
  it("all covered: savings fully absorb overspend", () => {
    const s = settleWeek([env("Blinkit", 500, 300), env("Fuel", 500, 400), env("Small stuff", 300, 500)], rupees(5000), 100);
    expect(s.status).toBe("covered");
    expect(s.overspend).toBe(rupees(200));
    expect(s.coveredBySavings).toBe(rupees(200));
    expect(s.fromFlex).toBe(0);
    expect(s.hitTarget).toBe(0);
    // Proportional to savings 200:100.
    expect(s.covers).toEqual([
      { from: "Blinkit", to: "Small stuff", amount: 13300 },
      { from: "Fuel", to: "Small stuff", amount: 6700 },
    ]);
    expect(s.envelopes.find((e) => e.id === "Blinkit")?.left).toBe(rupees(67));
  });

  it("flex used: the spec example", () => {
    const s = settleWeek([env("Blinkit", 500, 300), env("Fuel", 500, 350), env("Small stuff", 300, 800)], rupees(5000), 100);
    expect(s.status).toBe("managed");
    expect(s.coveredBySavings).toBe(rupees(350));
    expect(s.fromFlex).toBe(rupees(150));
    expect(s.hitTarget).toBe(0);
    expect(describeSettlement(s, ctx)).toBe(
      "You went ₹500 over on Small stuff, but ₹350 was covered because you spent less on Blinkit and Fuel. Only ₹150 came from flex. You're still on track for ₹70,000.",
    );
  });

  it("target hit: flex exhausted", () => {
    const s = settleWeek([env("Blinkit", 500, 400), env("Small stuff", 300, 1000)], rupees(250), 100);
    expect(s.status).toBe("target_hit");
    expect(s.coveredBySavings).toBe(rupees(100));
    expect(s.fromFlex).toBe(rupees(250));
    expect(s.hitTarget).toBe(rupees(350));
    expect(s.envelopes.find((e) => e.id === "Small stuff")).toMatchObject({
      coveredBySavings: rupees(100),
      fromFlex: rupees(250),
      hitTarget: rupees(350),
    });
  });

  it("treats negative flex as empty", () => {
    const s = settleWeek([env("A", 100, 300)], rupees(-50), 100);
    expect(s.fromFlex).toBe(0);
    expect(s.hitTarget).toBe(rupees(200));
  });

  it("locked envelopes never give cover, but can receive it", () => {
    const s = settleWeek(
      [env("Fuel", 500, 100, { locked: true }), env("Blinkit", 500, 400), env("Rent top-up", 200, 400, { locked: true })],
      rupees(1000),
      100,
    );
    expect(s.envelopes.find((e) => e.id === "Fuel")?.gave).toBe(0);
    expect(s.envelopes.find((e) => e.id === "Fuel")?.left).toBe(rupees(400));
    expect(s.covers).toEqual([{ from: "Blinkit", to: "Rent top-up", amount: rupees(100) }]);
    expect(s.fromFlex).toBe(rupees(100));
  });

  it("splits cover across several over-budget envelopes and sums exactly", () => {
    const s = settleWeek([env("A", 1000, 0), env("B", 100, 133), env("C", 100, 167)], 0, 100);
    const received = s.envelopes.reduce((a, e) => a + e.coveredBySavings, 0);
    expect(received).toBe(rupees(100));
    expect(s.covers.reduce((a, c) => a + c.amount, 0)).toBe(rupees(100));
  });

  it("applies leftover rules only to savings not used for cover", () => {
    const s = settleWeek(
      [
        env("Roll", 500, 200),
        env("Flex", 500, 300, { leftover: "to_flex" }),
        env("Save", 500, 400, { leftover: "to_target" }),
      ],
      0,
      100,
    );
    expect(s.rollover).toEqual({ Roll: rupees(300) });
    expect(s.toFlex).toBe(rupees(200));
    expect(s.toTarget).toBe(rupees(100));
  });

  it("no overspend is covered", () => {
    const s = settleWeek([env("A", 500, 500)], 0, 100);
    expect(s.status).toBe("covered");
    expect(describeSettlement(s, ctx)).toBe("Every envelope stayed within budget this week. You're still on track for ₹70,000.");
  });
});

describe("live mid-week", () => {
  it("shows cover the moment an envelope goes over", () => {
    const s = settleWeek([env("Blinkit", 500, 100), env("Small stuff", 300, 350)], rupees(3000), 100);
    expect(coverLine(s, "Small stuff", fmt)).toBe("Covered by Blinkit savings");
    expect(coverLine(s, "Blinkit", fmt)).toBeNull();
    expect(describeSettlement(s, { ...ctx, live: true })).toBe(
      "You went ₹50 over on Small stuff so far, and all of it was covered because you spent less on Blinkit. You're still on track for ₹70,000.",
    );
  });

  it("explains a mixed cover line", () => {
    const s = settleWeek([env("Blinkit", 500, 400), env("Small stuff", 300, 500)], rupees(50), 100);
    expect(coverLine(s, "Small stuff", fmt)).toBe("₹100 covered by Blinkit savings · ₹50 from flex · ₹50 from your month-end");
    expect(describeSettlement(s, { ...ctx, live: true, projected: rupees(69950) })).toBe(
      "You went ₹200 over on Small stuff so far, but ₹100 was covered because you spent less on Blinkit. Only ₹50 came from flex. ₹50 comes out of your month-end balance. You're heading for ₹69,950 — a lighter few days will close the gap.",
    );
  });
});

describe("other currencies", () => {
  it("splits cover in whole yen", () => {
    const s = settleWeek(
      [env("A", 0, 0, { limit: 1000, spent: 0 }), env("B", 0, 0, { limit: 1000, spent: 0 }), env("C", 0, 0, { limit: 100, spent: 201 })],
      0,
      1,
    );
    expect(s.envelopes.map((e) => e.gave)).toEqual([51, 50, 0]);
  });

  it("formats messages in the plan currency", () => {
    const usd = moneyFormatter({ currency: "USD", locale: "en-US" });
    const s = settleWeek([env("Groceries", 50, 30), env("Coffee", 20, 35)], rupees(100), 100);
    expect(describeSettlement(s, { live: false, target: rupees(5000), projected: rupees(5000), fmt: usd })).toBe(
      "You went $15 over on Coffee, and all of it was covered because you spent less on Groceries. You're still on track for $5,000.",
    );
  });
});
