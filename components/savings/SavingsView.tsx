"use client";

import { useMemo, useState } from "react";
import { useData, useFormat, useSummary } from "@/lib/data/context";
import { unitOf } from "@/lib/engine/money";
import { savings, type SavingsLine, whatIf } from "@/lib/engine/savings";
import type { Minor } from "@/lib/engine/types";
import { Segmented } from "@/components/ui/controls";

type Per = "day" | "week";

export function SavingsView() {
  const data = useData();
  const s = useSummary();
  const fmt = useFormat();
  const unit = unitOf(data.plan.currency);
  const sv = useMemo(() => savings(data, s.today), [data, s.today]);
  const [view, setView] = useState<Per>("week");
  const [per, setPer] = useState<Per>("week");
  const [text, setText] = useState("");

  const amount = fmt.parse(text || "0") ?? 0;
  const perWeek = per === "day" ? amount * 7 : amount;
  const result = whatIf(s, perWeek, unit);
  const signed = (m: Minor) => fmt.money(m, { signed: true });
  const tone = (m: Minor) => (m >= 0 ? "text-ok" : "text-warn");
  const bars = view === "day" ? sv.days.map((d) => ({ key: d.date, label: fmt.shortDay(d.date), saved: d.saved })) : sv.weeks.map((w) => ({ key: w.start, label: fmt.shortDay(w.start), saved: w.saved }));
  const tips = ways(sv.lines);

  return (
    <div className="space-y-12">
      <header>
        <h1 className="text-2xl font-medium tracking-tight">Savings</h1>
        <p className="mt-1 text-sm text-muted">What you&rsquo;ve kept compared with your plan. It becomes real money in the bank at month end.</p>
      </header>

      <section aria-labelledby="so-far">
        <h2 id="so-far" className="text-sm text-muted">
          Saved so far this month
        </h2>
        <p className={`mt-1 text-5xl font-medium tracking-tighter tabular-nums ${tone(sv.total.saved)}`}>{signed(sv.total.saved)}</p>
        <dl className="mt-5 grid grid-cols-3 gap-3 text-sm">
          <Stat label="Per day" value={signed(sv.perDay)} />
          <Stat label="Per week" value={signed(sv.perWeek)} />
          <Stat label="At this pace" value={signed(sv.atThisPace)} note="by month end" />
        </dl>
      </section>

      <section aria-labelledby="trend" className="card p-5">
        <div className="mb-5 flex items-center justify-between gap-4">
          <h2 id="trend" className="text-[15px] font-medium">
            {view === "day" ? "Day by day" : "Week by week"}
          </h2>
          <div className="w-40">
            <Segmented label="Group by" value={view} onChange={setView} options={[{ value: "day", label: "Days" }, { value: "week", label: "Weeks" }]} />
          </div>
        </div>
        <Bars items={bars} money={signed} />
      </section>

      <section aria-labelledby="most">
        <h2 id="most" className="mb-4 text-[15px] font-medium">
          Where you save most
        </h2>
        <ul className="divide-y divide-line">
          {sv.lines.map((l) => (
            <li key={l.id ?? "flex"} className="flex items-baseline justify-between gap-4 py-3">
              <span>{l.name}</span>
              <span className="text-right">
                <span className={`tabular-nums ${tone(l.saved)}`}>{signed(l.saved)}</span>
                <span className="block text-xs text-muted tabular-nums">
                  {fmt.money(l.spent)} of {fmt.money(l.planned)} · {signed(l.perWeek)}/week
                </span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="calc" className="card p-5">
        <h2 id="calc" className="text-[15px] font-medium">
          What if I spent less?
        </h2>
        {tips.length > 0 && (
          <ul className="mt-3 space-y-2">
            {tips.map((t) => (
              <li key={t.key}>
                <button
                  type="button"
                  className="text-left text-sm text-muted underline-offset-4 hover:text-fg hover:underline"
                  onClick={() => {
                    setPer("week");
                    setText(fmt.input(t.perWeek));
                  }}
                >
                  {t.text(fmt.money)}
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-5 flex items-center gap-3">
          <label className="flex flex-1 items-center gap-2 rounded-xl bg-raised px-3.5 py-2.5">
            <span className="text-muted">{fmt.symbol}</span>
            <input
              aria-label="Amount to spend less"
              inputMode="decimal"
              placeholder="0"
              className="min-w-0 flex-1 bg-transparent tabular-nums outline-none"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </label>
          <div className="w-40">
            <Segmented label="Per" value={per} onChange={setPer} options={[{ value: "day", label: "a day" }, { value: "week", label: "a week" }]} />
          </div>
        </div>
        <dl className="mt-5 grid grid-cols-3 gap-3 text-sm">
          <Stat label="Extra this month" value={fmt.money(result.thisMonth)} />
          <Stat label="Month-end" value={fmt.money(result.projected)} note={result.aboveTarget >= 0 ? `${fmt.money(result.aboveTarget)} above target` : `${fmt.money(-result.aboveTarget)} below target`} />
          <Stat label="Over a year" value={fmt.money(result.perYear)} />
        </dl>
      </section>
    </div>
  );
}

type Tip = { key: string; perWeek: Minor; text: (money: (m: Minor) => string) => string };

/** Over-pace lines first (trim back to plan), then savers whose leftover isn't heading to the target yet. */
function ways(lines: SavingsLine[]): Tip[] {
  const over: Tip[] = lines
    .filter((l) => l.perWeek < 0)
    .reverse()
    .map((l) => ({ key: `trim:${l.name}`, perWeek: -l.perWeek, text: (m) => `${l.name} is running ${m(-l.perWeek)} a week over plan. Trimming that keeps it on track.` }));
  const bank: Tip[] = lines
    .filter((l) => l.perWeek > 0 && l.leftover !== null && l.leftover !== "to_target")
    .map((l) => ({
      key: `bank:${l.name}`,
      perWeek: l.perWeek,
      text: (m) => `You keep about ${m(l.perWeek)} a week in ${l.name}. Set its leftover to "Target" in Envelopes to bank it.`,
    }));
  return [...over, ...bank].slice(0, 3);
}

function Bars({ items, money }: { items: { key: string; label: string; saved: Minor }[]; money: (m: Minor) => string }) {
  if (!items.length) return <p className="text-sm text-muted">Nothing yet. Your first day shows up here.</p>;
  const max = Math.max(1, ...items.map((i) => Math.abs(i.saved)));
  return (
    <ul className="flex h-32 items-center gap-1" aria-label="Saved compared with plan">
      {items.map((i) => {
        return (
          <li key={i.key} className="relative flex h-full flex-1 flex-col" title={`${i.label}: ${money(i.saved)}`}>
            <span className="sr-only">
              {i.label}: {money(i.saved)}
            </span>
            <span className="flex flex-1 items-end">{i.saved > 0 && <span className="w-full rounded-t bg-ok" style={{ height: `${(i.saved / max) * 100}%` }} />}</span>
            <span className="h-px bg-line" />
            <span className="flex flex-1 items-start">{i.saved < 0 && <span className="w-full rounded-b bg-warn" style={{ height: `${(-i.saved / max) * 100}%` }} />}</span>
          </li>
        );
      })}
    </ul>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div>
      <dt className="text-muted">{label}</dt>
      <dd className="mt-0.5 tabular-nums">{value}</dd>
      {note && <dd className="mt-1 text-xs text-muted">{note}</dd>}
    </div>
  );
}
