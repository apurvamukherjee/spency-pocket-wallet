"use client";

import { useState } from "react";
import { addDays, dueWhen } from "@/lib/engine/dates";
import { useActions, useData, useFormat, useSummary } from "@/lib/data/context";
import { monthOf } from "@/lib/engine/dates";
import { billStatus, type BillStatus } from "@/lib/engine/derive";
import { billFund, commitmentDates, monthlyEquivalent, saveMonthly } from "@/lib/engine/plan";
import type { Commitment, Frequency, ISODate } from "@/lib/engine/types";
import { Icon } from "@/components/ui/Icon";
import { Segmented } from "@/components/ui/controls";
import { Sheet } from "@/components/ui/Sheet";

const nextDate = (c: Commitment, today: ISODate) => commitmentDates(c, today, addDays(today, 400))[0] ?? c.nextDebit;

const FREQ_LABEL: Record<Frequency, string> = { weekly: "Weekly", monthly: "Monthly", yearly: "Yearly" };

export function CommitmentsView() {
  const { commitments, plan, txns } = useData();
  const { addTxn, setStatus, setPlan } = useActions();
  const s = useSummary();
  const fmt = useFormat();
  const [editing, setEditing] = useState<Commitment | "new" | null>(null);
  const month = monthOf(s.today);
  const rows = commitments
    .map((c) => ({ c, next: nextDate(c, s.today), status: billStatus(plan, c, txns) }))
    .sort((a, b) => a.next.localeCompare(b.next));
  const unpaid = plan.unpaidBills ?? [];

  /** Every direction has a real effect, so balances stay derivable from payments. */
  function togglePaid(c: Commitment, status: BillStatus) {
    const paid = status.state === "paid" || status.state === "assumed_paid";
    if (paid) {
      if (status.paymentIds.length) setStatus(status.paymentIds, "rejected");
      else setPlan({ unpaidBills: [...unpaid, c.id] });
    } else if (unpaid.includes(c.id) && status.paymentIds.length === 0) {
      // Undo "not paid yet" rather than logging money that already went out before the plan.
      setPlan({ unpaidBills: unpaid.filter((id) => id !== c.id) });
    } else {
      addTxn({
        amount: status.due,
        wallet: "bank",
        merchant: c.name,
        commitmentId: c.id,
        envelopeId: null,
        occurredAt: new Date().toISOString(),
      });
    }
  }
  const monthlyTotal = commitments.reduce((sum, c) => sum + monthlyEquivalent(c), 0);

  return (
    <div className="space-y-10">
      <header>
        <h1 className="text-2xl font-medium tracking-tight">Bills</h1>
        <p className="mt-1 text-sm text-muted">Fixed debits are set aside first, before envelopes and flex. Tick a bill once it&apos;s paid.</p>
      </header>

      <section className="card grid grid-cols-2 gap-4 p-5">
        <div>
          <p className="text-sm text-muted">Monthly total</p>
          <p className="mt-1 text-2xl font-medium tracking-tight tabular-nums">{fmt.money(monthlyTotal)}</p>
        </div>
        <div>
          <p className="text-sm text-muted">Still due this month</p>
          <p className="mt-1 text-2xl font-medium tracking-tight tabular-nums">{fmt.money(s.commitmentsRemaining)}</p>
        </div>
        {s.billSavings > 0 && (
          <p className="col-span-2 border-t border-line pt-4 text-sm text-muted">
            {fmt.money(s.billSavings)} will be put aside for yearly bills by month end. It stays in your bank but isn&apos;t
            counted as spending money.
          </p>
        )}
      </section>

      <section>
        {rows.length === 0 && (
          <p className="rounded-[20px] border border-dashed border-line px-6 py-8 text-center text-sm text-muted">
            No bills yet. Add rent, subscriptions and loan payments so Spency sets them aside first.
          </p>
        )}
        <ul className="divide-y divide-line">
          {rows.map(({ c, next, status }) => {
            const when = dueWhen(s.today, next);
            const paid = status.state === "paid" || status.state === "assumed_paid";
            return (
              <li key={c.id} className="flex items-center gap-3">
                {/* Not due this month: nothing to tick, but keep the row aligned with the others. */}
                {status.state === "none" && <span aria-hidden className="size-6 shrink-0" />}
                {status.state !== "none" && (
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={paid}
                    aria-label={`${c.name} paid this month`}
                    onClick={() => togglePaid(c, status)}
                    className={`grid size-6 shrink-0 place-items-center rounded-full border transition-colors ${paid ? "border-ok bg-ok text-bg" : "border-faint text-transparent hover:border-fg"}`}
                  >
                    <Icon name="check" size={14} />
                  </button>
                )}
                <button type="button" onClick={() => setEditing(c)} className="flex min-w-0 flex-1 items-center justify-between gap-4 py-4 text-left">
                  <div className="min-w-0">
                    <p className="truncate text-[15px]">{c.name}</p>
                    <p className="mt-0.5 text-[13px] text-muted">
                      {status.state === "paid" ? (
                        <>
                          <span className="text-ok">Paid this month</span>
                          {monthOf(next) !== month && <> · next {fmt.shortDay(next)}</>} ·{" "}
                        </>
                      ) : status.state === "assumed_paid" ? (
                        <>
                          <span className="text-ok">Done this month</span> · next {fmt.shortDay(next)} ·{" "}
                        </>
                      ) : status.state === "due" ? (
                        <>
                          {unpaid.includes(c.id) && monthOf(next) !== month ? (
                            <span className="text-warn">Not paid yet</span>
                          ) : (
                            <>
                              Due {fmt.shortDay(next)} · {when}
                            </>
                          )}{" "}
                          ·{" "}
                        </>
                      ) : saveMonthly(c) ? (
                        <YearlyLine fund={billFund(plan, c)} />
                      ) : (
                        <>
                          Next {fmt.shortDay(next)} ·{" "}
                        </>
                      )}
                      {FREQ_LABEL[c.frequency].toLowerCase()}
                    </p>
                  </div>
                  <p className={`text-[15px] tabular-nums ${paid ? "text-muted" : ""}`}>{fmt.money(c.amount)}</p>
                </button>
              </li>
            );
          })}
        </ul>
        <button type="button" onClick={() => setEditing("new")} className="btn btn-ghost mt-4 w-full">
          <Icon name="plus" size={18} />
          Add bill
        </button>
      </section>

      <Sheet open={editing !== null} onClose={() => setEditing(null)} title={editing === "new" ? "New bill" : "Edit bill"}>
        {editing !== null && (
          <CommitmentForm
            key={editing === "new" ? "new" : editing.id}
            initial={editing === "new" ? null : editing}
            today={s.today}
            onDone={() => setEditing(null)}
          />
        )}
      </Sheet>
    </div>
  );
}

/** "4,800 of 12,000 saved by 10 Mar ·" — progress toward a yearly bill that isn't due this month. */
function YearlyLine({ fund }: { fund: ReturnType<typeof billFund> }) {
  const fmt = useFormat();
  return (
    <>
      {fmt.money(fund.saved + fund.contribution)} of {fmt.money(fund.goal)} saved · due {fmt.shortDay(fund.dueDate)} ·{" "}
    </>
  );
}

function CommitmentForm({ initial, today, onDone }: { initial: Commitment | null; today: ISODate; onDone: () => void }) {
  const { saveCommitment, deleteCommitment, setPlan } = useActions();
  const { plan } = useData();
  const fmt = useFormat();
  const funds = plan.billFunds ?? {};
  const [savedText, setSavedText] = useState(initial && funds[initial.id] ? fmt.input(funds[initial.id]) : "");
  const saved = savedText.trim() === "" ? 0 : fmt.parse(savedText);
  const [name, setName] = useState(initial?.name ?? "");
  const [amountText, setAmountText] = useState(initial ? fmt.input(initial.amount) : "");
  const [frequency, setFrequency] = useState<Frequency>(initial?.frequency ?? "monthly");
  const [date, setDate] = useState(initial ? nextDate(initial, today) : today);
  const amount = fmt.parse(amountText);
  const valid =
    name.trim() !== "" && amount !== null && amount > 0 && /^\d{4}-\d{2}-\d{2}$/.test(date) && (frequency !== "yearly" || saved !== null);

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (!valid || amount === null) return;
        const id = initial?.id ?? crypto.randomUUID();
        saveCommitment({ id, name: name.trim(), amount, frequency, nextDebit: date });
        // Only yearly bills hold savings; switching a bill away from yearly makes its savings spendable again.
        const keep = frequency === "yearly" && saved ? saved : 0;
        if (keep !== (funds[id] ?? 0)) {
          const next = Object.fromEntries(Object.entries(funds).filter(([b]) => b !== id));
          setPlan({ billFunds: keep ? { ...next, [id]: keep } : next });
        }
        onDone();
      }}
    >
      <label className="block space-y-1.5">
        <span className="label">Name</span>
        <input className="field" placeholder="Netflix, rent, EMI…" value={name} onChange={(e) => setName(e.target.value)} autoFocus={!initial} />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="space-y-1.5">
          <span className="label">Amount</span>
          <input className="field tabular-nums" inputMode="decimal" value={amountText} onChange={(e) => setAmountText(e.target.value)} />
        </label>
        <label className="space-y-1.5">
          <span className="label">Next debit</span>
          <input className="field" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
      </div>
      <Segmented<Frequency>
        label="Frequency"
        value={frequency}
        onChange={setFrequency}
        options={(["weekly", "monthly", "yearly"] as const).map((f) => ({ value: f, label: FREQ_LABEL[f] }))}
      />
      {frequency === "yearly" && (
        <label className="block space-y-1.5">
          <span className="label">Already put aside for it</span>
          <input
            className="field tabular-nums"
            inputMode="decimal"
            placeholder={`${fmt.symbol}0`}
            value={savedText}
            onChange={(e) => setSavedText(e.target.value)}
            aria-describedby="saved-hint"
          />
          <span id="saved-hint" className="block text-xs text-faint">
            Spency saves the rest a little each month, so the month it&apos;s due isn&apos;t a shock. Money you&apos;ve already put aside
            stays in your balance but isn&apos;t counted as spending money.
          </span>
        </label>
      )}
      <div className="flex gap-3">
        {initial && (
          <button
            type="button"
            onClick={() => {
              if (!confirm(`Delete ${initial.name}? Past payments stay, they just won't count as this bill.`)) return;
              deleteCommitment(initial.id);
              onDone();
            }}
            className="btn btn-ghost text-bad"
          >
            <Icon name="trash" size={18} />
            <span className="sr-only">Delete</span>
          </button>
        )}
        <button type="submit" disabled={!valid} className="btn btn-primary flex-1">
          Save
        </button>
      </div>
    </form>
  );
}
