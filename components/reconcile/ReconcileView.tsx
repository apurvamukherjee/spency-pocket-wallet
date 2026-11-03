"use client";

import { useState } from "react";
import { addDays } from "@/lib/engine/dates";
import { formatINR, parseRupees } from "@/lib/engine/money";
import { type ReconcileCheck, reconcileGap, reconcileStreak } from "@/lib/engine/reconcile";
import { formatDay } from "@/lib/format";
import { useSummary } from "@/lib/hooks";
import { useSpency } from "@/lib/store";
import { Icon } from "@/components/ui/Icon";

type Result = { actual: number; gap: number; done: ReconcileCheck["resolution"] | null };

const RESOLUTION_LABEL: Record<ReconcileCheck["resolution"], string> = {
  matched: "All square",
  adjusted: "Adjusted",
  ignored: "Ignored",
};

export function ReconcileView() {
  const s = useSummary();
  const checks = useSpency((st) => st.checks);
  const recordCheck = useSpency((st) => st.recordCheck);
  const addTxn = useSpency((st) => st.addTxn);
  const [text, setText] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [copied, setCopied] = useState(false);
  const streak = reconcileStreak(checks, s.today);
  const last7 = Array.from({ length: 7 }, (_, i) => addDays(s.today, i - 6));
  const checkedDays = new Set(checks.map((c) => c.date));

  function resolve(resolution: ReconcileCheck["resolution"], r: Result) {
    recordCheck({ date: s.today, computed: s.bank, actual: r.actual, resolution });
    setResult({ ...r, done: resolution });
  }

  function check(e: React.FormEvent) {
    e.preventDefault();
    const actual = parseRupees(text);
    if (actual === null) return;
    const r: Result = { actual, gap: reconcileGap(s.bank, actual), done: null };
    setCopied(false);
    if (r.gap === 0) resolve("matched", r);
    else setResult(r);
  }

  function logAdjustment(r: Result) {
    addTxn({
      amount: Math.abs(r.gap),
      direction: r.gap < 0 ? "debit" : "credit",
      kind: "adjustment",
      wallet: "bank",
      merchant: "Reconciliation adjustment",
      envelopeId: null,
      occurredAt: new Date().toISOString(),
    });
    resolve("adjusted", r);
  }

  async function askClaude(r: Result) {
    const prompt = `My Spency bank balance is ${formatINR(Math.abs(r.gap))} ${r.gap < 0 ? "higher" : "lower"} than my real bank balance. Can you help me find the payment I haven't logged? I'll share my recent UPI screenshots.`;
    await navigator.clipboard.writeText(prompt);
    setCopied(true);
  }

  return (
    <div className="space-y-10">
      <header>
        <h1 className="text-2xl font-medium tracking-tight">Reconcile</h1>
        <p className="mt-1 text-sm text-muted">A ten-second check that keeps every number honest.</p>
      </header>

      <section className="card space-y-6 p-5">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-muted">Spency&apos;s bank balance</p>
            <p className="mt-1 text-2xl font-medium tracking-tight tabular-nums">{formatINR(s.bank)}</p>
          </div>
          <div>
            <p className="text-sm text-muted">Cash in hand</p>
            <p className="mt-1 text-2xl font-medium tracking-tight tabular-nums">{formatINR(s.cash)}</p>
          </div>
        </div>

        <form onSubmit={check} className="space-y-2">
          <label htmlFor="actual" className="label">
            What does your bank app show right now?
          </label>
          <div className="flex gap-2">
            <input
              id="actual"
              className="field tabular-nums"
              inputMode="decimal"
              placeholder="₹"
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setResult(null);
              }}
            />
            <button type="submit" disabled={parseRupees(text) === null} className="btn btn-primary shrink-0">
              Check
            </button>
          </div>
        </form>

        {result && (
          <div className="border-t border-line pt-5" aria-live="polite">
            {result.gap === 0 ? (
              <p className="flex items-center gap-2 text-ok">
                <Icon name="check" size={18} />
                All square. Nice.
              </p>
            ) : (
              <>
                <p className="text-xl font-medium tabular-nums">
                  {formatINR(Math.abs(result.gap))} {result.gap < 0 ? "unaccounted" : "more than expected"}
                </p>
                <p className="mt-1 text-sm text-muted">
                  {result.gap < 0
                    ? "Usually a payment that hasn't been logged yet. It happens."
                    : "Maybe a refund or credit Spency doesn't know about."}
                </p>
                {result.done ? (
                  <p className="mt-4 text-sm text-muted">{RESOLUTION_LABEL[result.done]}. Thanks for checking in.</p>
                ) : (
                  <div className="mt-5 flex flex-wrap gap-2">
                    <button type="button" onClick={() => askClaude(result)} className="btn btn-ghost">
                      <Icon name={copied ? "check" : "sparkle"} size={16} />
                      {copied ? "Copied, paste in Claude" : "Find it with Claude"}
                    </button>
                    <button type="button" onClick={() => logAdjustment(result)} className="btn btn-ghost">
                      Log as adjustment
                    </button>
                    <button type="button" onClick={() => resolve("ignored", result)} className="btn text-muted hover:text-fg">
                      Ignore
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </section>

      <section aria-labelledby="streak">
        <div className="flex items-baseline justify-between">
          <h2 id="streak" className="text-[15px] font-medium">
            {streak > 0 ? `${streak}-day streak` : "Start a streak today"}
          </h2>
          <span className="text-sm text-muted">Last 7 days</span>
        </div>
        <ol className="mt-4 grid grid-cols-7 gap-2">
          {last7.map((d) => (
            <li key={d} className="text-center">
              <div className={`mx-auto size-8 rounded-full ${checkedDays.has(d) ? "bg-accent" : "border border-line"}`} />
              <span className="mt-1.5 block text-[11px] text-faint">{formatDay(d).slice(0, 2)}</span>
            </li>
          ))}
        </ol>
        {checks.length > 0 && (
          <ul className="mt-8 divide-y divide-line text-sm">
            {[...checks]
              .sort((a, b) => b.date.localeCompare(a.date))
              .slice(0, 7)
              .map((c) => (
                <li key={c.date} className="flex justify-between py-3">
                  <span className="text-muted">{formatDay(c.date)}</span>
                  <span className="tabular-nums">
                    {c.actual === c.computed ? RESOLUTION_LABEL.matched : `${formatINR(c.actual - c.computed, { signed: true })} · ${RESOLUTION_LABEL[c.resolution].toLowerCase()}`}
                  </span>
                </li>
              ))}
          </ul>
        )}
      </section>
    </div>
  );
}
