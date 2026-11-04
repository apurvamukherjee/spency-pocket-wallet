"use client";

import { useState } from "react";
import { useActions, useData, useFormat, useSummary } from "@/lib/data/context";
import { major, unitOf } from "@/lib/engine/money";
import { describeSettlement } from "@/lib/engine/settle";
import type { Envelope, LeftoverRule } from "@/lib/engine/types";
import { Icon } from "@/components/ui/Icon";
import { Segmented, StatusChip, Switch } from "@/components/ui/controls";

export function EnvelopesView() {
  const { envelopes, plan } = useData();
  const s = useSummary();
  const fmt = useFormat();
  const { saveEnvelope } = useActions();
  const weekly = envelopes.reduce((sum, e) => sum + e.weeklyLimit, 0);

  return (
    <div className="space-y-12">
      <header>
        <h1 className="text-2xl font-medium tracking-tight">Envelopes</h1>
        <p className="mt-1 text-sm text-muted">
          {fmt.money(weekly)} a week across {envelopes.length} {envelopes.length === 1 ? "envelope" : "envelopes"}. Savings in unlocked
          envelopes cover overspends elsewhere.
        </p>
      </header>

      <section className="space-y-3">
        {envelopes.map((e) => (
          // Keyed on the saved values too, so a change from elsewhere (Claude, a rebalance) refreshes the inputs.
          <EnvelopeEditor key={`${e.id}:${e.name}:${e.weeklyLimit}`} envelope={e} />
        ))}
        <button
          type="button"
          onClick={() =>
            saveEnvelope({ id: crypto.randomUUID(), name: "New envelope", weeklyLimit: major(50, unitOf(plan.currency)), locked: false, leftover: "rollover" })
          }
          className="btn btn-ghost w-full"
        >
          <Icon name="plus" size={18} />
          Add envelope
        </button>
      </section>

      <section aria-labelledby="history">
        <h2 id="history" className="mb-4 text-[15px] font-medium">
          This month, week by week
        </h2>
        <ol className="space-y-3">
          {[...s.weeks].reverse().map((w) => (
            <li key={w.start} className="card p-5">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-muted">
                  {fmt.shortDay(w.start)} – {fmt.shortDay(w.end)}
                </p>
                {w.final ? <StatusChip status={w.settlement.status} /> : <span className="text-xs text-faint">In progress</span>}
              </div>
              <p className="mt-3 text-[15px] leading-relaxed">
                {describeSettlement(w.settlement, { live: !w.final, target: s.target, projected: s.projected, fmt: fmt.money })}
              </p>
              <ul className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                {w.settlement.envelopes.map((e) => (
                  <li key={e.id} className="flex justify-between gap-2">
                    <span className="truncate text-muted">{e.name}</span>
                    <span className={`tabular-nums ${e.variance < 0 ? "text-warn" : ""}`}>{fmt.money(e.variance, { signed: true })}</span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

const RULES: { value: LeftoverRule; label: string }[] = [
  { value: "rollover", label: "Roll over" },
  { value: "to_flex", label: "To flex" },
  { value: "to_target", label: "Save it" },
];

function EnvelopeEditor({ envelope }: { envelope: Envelope }) {
  const { saveEnvelope, deleteEnvelope } = useActions();
  const fmt = useFormat();
  const [name, setName] = useState(envelope.name);
  const [limit, setLimit] = useState(fmt.input(envelope.weeklyLimit));
  const save = (patch: Partial<Envelope>) => saveEnvelope({ ...envelope, ...patch });

  return (
    <div className="card space-y-4 p-5">
      <div className="flex items-center gap-3">
        <input
          aria-label="Envelope name"
          className="min-w-0 flex-1 bg-transparent text-[17px] font-medium outline-none"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => {
            const next = name.trim();
            if (!next) setName(envelope.name);
            else if (next !== envelope.name) save({ name: next });
          }}
        />
        <label className="flex items-center gap-1 rounded-xl bg-raised px-3 py-1.5 text-sm focus-within:ring-1 focus-within:ring-accent/60">
          <span className="text-faint">{fmt.symbol}</span>
          <input
            aria-label={`${envelope.name} weekly limit`}
            inputMode="decimal"
            className="w-20 bg-transparent text-right tabular-nums outline-none sm:w-24"
            value={limit}
            onChange={(e) => setLimit(e.target.value)}
            onBlur={() => {
              const p = fmt.parse(limit);
              if (p === null) setLimit(fmt.input(envelope.weeklyLimit));
              else if (p !== envelope.weeklyLimit) save({ weeklyLimit: p });
            }}
          />
          <span className="text-faint">/wk</span>
        </label>
      </div>
      <div className="flex items-center justify-between gap-3 text-sm">
        <div>
          <p>Locked</p>
          <p className="text-xs text-muted">Keep its savings for itself</p>
        </div>
        <Switch label={`Lock ${envelope.name}`} checked={envelope.locked} onChange={(locked) => save({ locked })} />
      </div>
      <div className="space-y-2">
        <p className="text-sm text-muted">Leftover at week end</p>
        <Segmented<LeftoverRule> label={`${envelope.name} leftover rule`} value={envelope.leftover} options={RULES} onChange={(leftover) => save({ leftover })} />
      </div>
      <button
        type="button"
        onClick={() => confirm(`Remove ${envelope.name}? Its past spends will count as flex.`) && deleteEnvelope(envelope.id)}
        className="text-sm text-faint hover:text-bad"
      >
        Remove
      </button>
    </div>
  );
}
