import { addDays, monthOf, monthStart } from "./engine/dates";
import { rememberMerchant, type MerchantMemory } from "./engine/inbox";
import { major as rupees } from "./engine/money";
import { commitmentDates } from "./engine/plan";
import type { SpencyData } from "./engine/derive";
import type { Commitment, Envelope, ISODate, Txn } from "./engine/types";

const at = (d: ISODate, hhmm: string) => `${d}T${hhmm}:00+05:30`;

/** A believable Indian month so far (INR, Asia/Kolkata), generated relative to `today` so the demo always looks current. Deterministic. */
export function seedData(today: ISODate): { data: SpencyData; memory: MerchantMemory } {
  const month = monthOf(today);
  const first = monthStart(month);

  const envelopes: Envelope[] = [
    { id: "blinkit", name: "Blinkit", weeklyLimit: rupees(500), locked: false, leftover: "rollover" },
    { id: "fuel", name: "Fuel", weeklyLimit: rupees(500), locked: true, leftover: "to_flex" },
    { id: "eating-out", name: "Eating out", weeklyLimit: rupees(800), locked: false, leftover: "rollover" },
    { id: "small-stuff", name: "Small stuff", weeklyLimit: rupees(300), locked: false, leftover: "to_target" },
  ];

  const commitments: Commitment[] = [
    { id: "rent", name: "Rent", amount: rupees(18000), frequency: "monthly", nextDebit: `${month}-05` },
    { id: "bike-emi", name: "Bike EMI", amount: rupees(3200), frequency: "monthly", nextDebit: `${month}-10` },
    { id: "claude", name: "Claude Pro", amount: rupees(1950), frequency: "monthly", nextDebit: `${month}-12` },
    { id: "netflix", name: "Netflix", amount: rupees(649), frequency: "monthly", nextDebit: `${month}-15` },
    { id: "apple-music", name: "Apple Music", amount: rupees(99), frequency: "monthly", nextDebit: `${month}-20` },
  ];

  const txns: Txn[] = [];
  let n = 0;
  const add = (d: ISODate, hhmm: string, amount: number, t: Partial<Txn>) =>
    txns.push({
      id: `seed-${++n}`,
      wallet: "bank",
      amount: rupees(amount),
      direction: "debit",
      kind: "expense",
      merchant: "",
      envelopeId: null,
      commitmentId: null,
      occurredAt: at(d, hhmm),
      source: "claude",
      status: "confirmed",
      upiRef: `6${String(31_000_000_000 + n * 7919).padStart(11, "0")}`,
      note: null,
      createdAt: at(d, hhmm),
      ...t,
    });

  const blinkit = [186, 142, 231, 98, 164];
  const food = [420, 260, 380, 515];
  for (let d = first, i = 0; d < today; d = addDays(d, 1), i++) {
    if (i % 2 === 0) add(d, "19:42", blinkit[i % blinkit.length], { merchant: "Blinkit", envelopeId: "blinkit" });
    if (i % 3 === 1) add(d, "21:05", food[i % food.length], { merchant: "Swiggy", envelopeId: "eating-out" });
    if (i % 6 === 2) add(d, "08:30", 450, { merchant: "Indian Oil", envelopeId: "fuel" });
    if (i % 2 === 1) add(d, "13:15", 60 + (i % 4) * 25, { merchant: "Chai Point", envelopeId: "small-stuff" });
    if (i === 3) add(d, "11:00", 2000, { merchant: "ATM withdrawal", kind: "transfer", source: "manual", upiRef: null });
    if (i === 4) add(d, "17:20", 150, { merchant: "Auto", wallet: "cash", envelopeId: "small-stuff", source: "manual", upiRef: null });
    if (i === 9) add(d, "20:10", 1899, { merchant: "Uniqlo", note: "Winter jacket" });
  }
  for (const c of commitments) {
    for (const d of commitmentDates(c, first, addDays(today, -1))) {
      add(d, "09:00", c.amount / 100, { merchant: c.name, commitmentId: c.id, source: "import" });
    }
  }

  // This morning: a little over on Small stuff, so Home shows live cover.
  add(today, "09:10", 260, { merchant: "Amazon", envelopeId: "small-stuff", note: "Phone cable" });

  // Waiting in the inbox from Claude, including one duplicate of a confirmed payment.
  const pending = (hhmm: string, amount: number, merchant: string, envelopeId: string | null, upiRef: string | null) =>
    add(today, hhmm, amount, { merchant, envelopeId, status: "pending", upiRef });
  pending("12:48", 348, "Swiggy", "eating-out", "631298114502");
  pending("13:02", 120, "Third Wave Coffee", "small-stuff", "631298114733");
  pending("13:40", 1299, "Decathlon", null, "631298115021");
  const dup = txns.find((t) => t.merchant === "Blinkit" && t.status === "confirmed");
  if (dup) add(today, "14:05", dup.amount / 100, { merchant: "Blinkit", envelopeId: "blinkit", status: "pending", upiRef: dup.upiRef });

  let memory: MerchantMemory = {};
  for (const [m, e] of [
    ["Blinkit", "blinkit"],
    ["Swiggy", "eating-out"],
    ["Indian Oil", "fuel"],
    ["Chai Point", "small-stuff"],
  ] as const) {
    memory = rememberMerchant(memory, m, e);
  }

  return {
    data: {
      plan: {
        month,
        currency: "INR",
        timeZone: "Asia/Kolkata",
        openingBank: rupees(120000),
        openingCash: rupees(500),
        balanceAt: at(first, "00:00"),
        target: rupees(70000),
        salary: null,
        weekStart: 1,
      },
      envelopes,
      commitments,
      txns,
    },
    memory,
  };
}
