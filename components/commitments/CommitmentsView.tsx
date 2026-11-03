"use client";

import { useState } from "react";
import { addDays, diffDays } from "@/lib/engine/dates";
import { useActions, useData, useFormat, useSummary } from "@/lib/data/context";
import { monthEnd, monthOf, monthStart } from "@/lib/engine/dates";
import { commitmentDates, monthlyEquivalent } from "@/lib/engine/plan";
import type { Commitment, Frequency, ISODate } from "@/lib/engine/types";
import { Icon } from "@/components/ui/Icon";
import { Segmented } from "@/components/ui/controls";
import { Sheet } from "@/components/ui/Sheet";

const nextDate = (c: Commitment, today: ISODate) => commitmentDates(c, today, addDays(today, 400))[0] ?? c.nextDebit;

const FREQ_LABEL: Record<Frequency, string> = { weekly: "Weekly", monthly: "Monthly", yearly: "Yearly" };

export function CommitmentsView() {
  const { commitments } = useData();
  const s = useSummary();
  const fmt = useFormat();
  const [editing, setEditing] = useState<Commitment | "new" | null>(null);
  const month = monthOf(s.today);
  const rows = commitments
    .map((c) => ({
      c,
      next: nextDate(c, s.today),
      // Already went out earlier this month (before the plan's starting balance, or before today).
      doneThisMonth: commitmentDates(c, monthStart(month), monthEnd(month)).some((d) => d < s.today),
    }))
    .sort((a, b) => a.next.localeCompare(b.next));
  const monthlyTotal = commitments.reduce((sum, c) => sum + monthlyEquivalent(c), 0);

  return (
    <div className="space-y-10">
      <header>
        <h1 className="text-2xl font-medium tracking-tight">Bills</h1>
        <p className="mt-1 text-sm text-muted">Fixed debits are set aside first, before envelopes and flex.</p>
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
      </section>

      <section>
        {rows.length === 0 && (
          <p className="rounded-[20px] border border-dashed border-line px-6 py-8 text-center text-sm text-muted">
            No bills yet. Add rent, subscriptions and loan payments so Spency sets them aside first.
          </p>
        )}
        <ul className="divide-y divide-line">
          {rows.map(({ c, next, doneThisMonth }) => {
            const inDays = diffDays(s.today, next);
            return (
              <li key={c.id}>
                <button type="button" onClick={() => setEditing(c)} className="flex w-full items-center justify-between gap-4 py-4 text-left">
                  <div className="min-w-0">
                    <p className="truncate text-[15px]">{c.name}</p>
                    <p className="mt-0.5 text-[13px] text-muted">
                      {doneThisMonth && monthOf(next) !== month ? (
                        <>
                          <span className="text-ok">Done this month</span> · next {fmt.shortDay(next)} ·{" "}
                        </>
                      ) : (
                        <>
                          {fmt.shortDay(next)} · {inDays === 0 ? "today" : inDays === 1 ? "tomorrow" : `in ${inDays} days`} ·{" "}
                        </>
                      )}
                      {FREQ_LABEL[c.frequency].toLowerCase()}
                    </p>
                  </div>
                  <p className="text-[15px] tabular-nums">{fmt.money(c.amount)}</p>
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

function CommitmentForm({ initial, today, onDone }: { initial: Commitment | null; today: ISODate; onDone: () => void }) {
  const { saveCommitment, deleteCommitment } = useActions();
  const fmt = useFormat();
  const [name, setName] = useState(initial?.name ?? "");
  const [amountText, setAmountText] = useState(initial ? fmt.input(initial.amount) : "");
  const [frequency, setFrequency] = useState<Frequency>(initial?.frequency ?? "monthly");
  const [date, setDate] = useState(initial ? nextDate(initial, today) : today);
  const amount = fmt.parse(amountText);
  const valid = name.trim() !== "" && amount !== null && amount > 0 && /^\d{4}-\d{2}-\d{2}$/.test(date);

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (!valid || amount === null) return;
        saveCommitment({ id: initial?.id ?? crypto.randomUUID(), name: name.trim(), amount, frequency, nextDebit: date });
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
      <div className="flex gap-3">
        {initial && (
          <button
            type="button"
            onClick={() => {
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
