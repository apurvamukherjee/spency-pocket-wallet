import { describe, expect, it } from "vitest";
import { major } from "./money";
import { suggestRebalance } from "./patterns";
import type { Envelope, Txn } from "./types";

const env = (id: string, weekly: number, over: Partial<Envelope> = {}): Envelope => ({
  id,
  name: id,
  weeklyLimit: major(weekly),
  locked: false,
  leftover: "rollover",
  ...over,
});

let n = 0;
const spend = (envelopeId: string, date: string, amount: number, over: Partial<Txn> = {}): Txn => ({
  id: `t${++n}`,
  wallet: "bank",
  amount: major(amount),
  direction: "debit",
  kind: "expense",
  merchant: "Shop",
  envelopeId,
  commitmentId: null,
  occurredAt: `${date}T12:00:00+05:30`,
  source: "manual",
  status: "confirmed",
  upiRef: null,
  note: null,
  createdAt: `${date}T12:00:00+05:30`,
  ...over,
});

// Today Wed 18 Nov 2026; Monday weeks. Finished weeks: Nov 9, Nov 2, Oct 26.
const weeks = ["2026-11-10", "2026-11-03", "2026-10-27"];
const base = { today: "2026-11-18", weekStart: 1, timeZone: "Asia/Kolkata", unit: 100 };

function history(small: number[], blinkit: number[]) {
  return weeks.flatMap((d, i) => [spend("Small stuff", d, small[i]), spend("Blinkit", d, blinkit[i])]);
}

describe("suggestRebalance", () => {
  const envelopes = [env("Small stuff", 300), env("Blinkit", 500)];

  it("suggests moving money when one envelope is over 3 weeks running and another is under", () => {
    const r = suggestRebalance({ ...base, envelopes, txns: history([460, 420, 470], [300, 250, 320]) });
    expect(r?.from.id).toBe("Blinkit");
    expect(r?.to.id).toBe("Small stuff");
    // Average overspend 150, smallest saving 180 → 150 a week.
    expect(r?.amount).toBe(major(150));
  });

  it("never moves more than the donor reliably saved", () => {
    const r = suggestRebalance({ ...base, envelopes, txns: history([700, 700, 700], [440, 420, 400]) });
    expect(r?.amount).toBe(major(60));
  });

  it("needs every one of the weeks to be over", () => {
    expect(suggestRebalance({ ...base, envelopes, txns: history([460, 290, 470], [300, 250, 320]) })).toBeNull();
  });

  it("ignores locked donors and envelopes with no spending at all", () => {
    expect(
      suggestRebalance({ ...base, envelopes: [env("Small stuff", 300), env("Blinkit", 500, { locked: true })], txns: history([460, 420, 470], [300, 250, 320]) }),
    ).toBeNull();
    expect(
      suggestRebalance({ ...base, envelopes: [env("Small stuff", 300), env("New", 500)], txns: history([460, 420, 470], [0, 0, 0]).filter((t) => t.envelopeId !== "Blinkit") }),
    ).toBeNull();
  });

  it("ignores the current week, pending payments, and counts refunds", () => {
    const txns = [
      ...history([460, 420, 470], [300, 250, 320]),
      spend("Small stuff", "2026-11-17", 5000),
      spend("Small stuff", "2026-11-11", 900, { status: "pending" }),
      spend("Small stuff", "2026-10-28", 200, { direction: "credit" }),
    ];
    // The refund brings week Oct 26 to 270, under the limit, so the streak breaks.
    expect(suggestRebalance({ ...base, envelopes, txns })).toBeNull();
  });

  it("rounds to whole units, and tens from 20 up", () => {
    const r = suggestRebalance({ ...base, envelopes, txns: history([437, 437, 437], [300, 300, 300]) });
    expect(r?.amount).toBe(major(130));
  });
});
