"use client";

import { useMemo, useState } from "react";
import { useActions, useAppData, useData, useFormat, useSummary } from "@/lib/data/context";
import { addDays } from "@/lib/engine/dates";
import { accountBalances } from "@/lib/engine/derive";
import { type ReconcileCheck, reconcileGap, reconcileStreak } from "@/lib/engine/reconcile";
import { Icon } from "@/components/ui/Icon";

/** gaps: per account (id null = the single or main account), so adjustments land where the difference is. */
type Result = {
  actual: number;
  gap: number;
  gaps: { accountId: string | null; name: string | null; gap: number }[];
  done: ReconcileCheck["resolution"] | null;
};

const RESOLUTION_LABEL: Record<ReconcileCheck["resolution"], string> = {
  matched: "All square",
  adjusted: "Adjusted",
  ignored: "Ignored",
};

export function ReconcileView() {
  const s = useSummary();
  const { checks, accounts } = useAppData();
  const fmt = useFormat();
  const [text, setText] = useState("");
  const data = useData();
  const live = useMemo(() => accountBalances(data.plan, accounts, data.txns), [data, accounts]);
  const several = live.length > 1;
  const [texts, setTexts] = useState<Record<string, string>>({});
  const parsedAll = live.map((a) => fmt.parseSigned(texts[a.id] ?? ""));
  const actualTotal = several
    ? parsedAll.every((v) => v !== null)
      ? parsedAll.reduce<number>((t, v) => t + (v ?? 0), 0)
      : null
    : fmt.parseSigned(text);
  const { recordCheck, addTxn } = useActions();
  const [result, setResult] = useState<Result | null>(null);
  const [copied, setCopied] = useState<"yes" | "failed" | false>(false);
  const streak = reconcileStreak(checks, s.today);
  const last7 = Array.from({ length: 7 }, (_, i) => addDays(s.today, i - 6));
  const checkedDays = new Set(checks.map((c) => c.date));

  function resolve(resolution: ReconcileCheck["resolution"], r: Result) {
    recordCheck({ date: s.today, computed: s.bank, actual: r.actual, resolution });
    setResult({ ...r, done: resolution });
  }

  function check(e: React.FormEvent) {
    e.preventDefault();
    const actual = actualTotal;
    if (actual === null) return;
    const gaps = several
      ? live.map((a, i) => ({ accountId: i === 0 ? null : a.id, name: a.name, gap: reconcileGap(a.balance, parsedAll[i] ?? 0) }))
      : [{ accountId: null, name: null, gap: reconcileGap(s.bank, actual) }];
    const r: Result = { actual, gap: reconcileGap(s.bank, actual), gaps: gaps.filter((g) => g.gap !== 0), done: null };
    setCopied(false);
    if (r.gaps.length === 0) resolve("matched", r);
    else setResult(r);
  }

  function logAdjustment(r: Result) {
    // One adjustment per account that's off, so each account's balance comes out right too.
    for (const g of r.gaps) {
      addTxn({
        amount: Math.abs(g.gap),
        direction: g.gap < 0 ? "debit" : "credit",
        kind: "adjustment",
        wallet: "bank",
        accountId: g.accountId,
        merchant: "Reconciliation adjustment",
        envelopeId: null,
        occurredAt: new Date().toISOString(),
      });
    }
    resolve("adjusted", r);
  }

  async function askClaude(r: Result) {
    const where = r.gaps
      .filter((g) => g.name)
      .map((g) => `${g.name}: Spency is ${fmt.money(Math.abs(g.gap))} ${g.gap < 0 ? "higher" : "lower"}`)
      .join("; ");
    const prompt = `My Spency bank balance is ${fmt.money(Math.abs(r.gap))} ${r.gap < 0 ? "higher" : "lower"} than my real bank balance${where ? ` (${where})` : ""}. Can you help me find the payment I haven't logged? I'll share my recent payment screenshots.`;
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied("yes");
    } catch (e) {
      // Clipboard can be blocked (permissions, insecure origin); say so instead of failing silently.
      console.warn("Clipboard write failed", e);
      setCopied("failed");
    }
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
            <p className="mt-1 text-2xl font-medium tracking-tight tabular-nums">{fmt.money(s.bank)}</p>
          </div>
          <div>
            <p className="text-sm text-muted">Cash in hand</p>
            <p className="mt-1 text-2xl font-medium tracking-tight tabular-nums">{fmt.money(s.cash)}</p>
          </div>
        </div>

        {several ? (
          <form onSubmit={check} className="space-y-3">
            <p className="label">What does each bank app show right now?</p>
            {live.map((a) => (
              <label key={a.id} className="flex items-center gap-3">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px]">{a.name}</span>
                  <span className="block text-xs text-muted tabular-nums">Spency: {fmt.money(a.balance)}</span>
                </span>
                <input
                  className="field w-36 tabular-nums"
                  inputMode="decimal"
                  placeholder={fmt.symbol}
                  value={texts[a.id] ?? ""}
                  onChange={(e) => {
                    setTexts({ ...texts, [a.id]: e.target.value });
                    setResult(null);
                  }}
                />
              </label>
            ))}
            <button type="submit" disabled={actualTotal === null} className="btn btn-primary w-full">
              Check
            </button>
          </form>
        ) : (
          <form onSubmit={check} className="space-y-2">
            <label htmlFor="actual" className="label">
              What does your bank app show right now?
            </label>
            <div className="flex gap-2">
              <input
                id="actual"
                className="field tabular-nums"
                inputMode="decimal"
                placeholder={fmt.symbol}
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  setResult(null);
                }}
              />
              <button type="submit" disabled={fmt.parseSigned(text) === null} className="btn btn-primary shrink-0">
                Check
              </button>
            </div>
          </form>
        )}

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
                  {fmt.money(Math.abs(result.gap))} {result.gap < 0 ? "unaccounted" : "more than expected"}
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
                      <Icon name={copied === "yes" ? "check" : "sparkle"} size={16} />
                      {copied === "yes"
                        ? "Copied, paste in Claude"
                        : copied === "failed"
                          ? "Couldn't copy. Try again"
                          : "Find it with Claude"}
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
              <span className="mt-1.5 block text-[11px] text-faint">{fmt.weekdayInitial(d)}</span>
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
                  <span className="text-muted">{fmt.day(c.date)}</span>
                  <span className="tabular-nums">
                    {c.actual === c.computed
                      ? RESOLUTION_LABEL.matched
                      : `${fmt.money(c.actual - c.computed, { signed: true })} · ${RESOLUTION_LABEL[c.resolution].toLowerCase()}`}
                  </span>
                </li>
              ))}
          </ul>
        )}
      </section>
    </div>
  );
}
