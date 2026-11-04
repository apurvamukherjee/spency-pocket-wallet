"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { enginePlan, useActions, useAppData, useFormat, useToday } from "@/lib/data/context";
import type { PlanInput } from "@/lib/data/types";
import { addMonths, dayInMonth, daysInMonth, monthOf } from "@/lib/engine/dates";
import { unitOf } from "@/lib/engine/money";
import { billFundsAtEnd } from "@/lib/engine/derive";
import { flexBudget, spendable } from "@/lib/engine/plan";
import type { Commitment, Envelope, Minor } from "@/lib/engine/types";
import { defaultWeekStart } from "@/lib/locale";
import { Icon } from "@/components/ui/Icon";
import { Switch } from "@/components/ui/controls";

type EnvRow = { id: string; name: string; amount: string; on: boolean; locked: boolean; leftover: Envelope["leftover"] };
/** `original` is set for bills carried over from last month, so weekly and yearly ones keep their real dates. */
type BillRow = { id: string; name: string; amount: string; day: string; frequency: Commitment["frequency"]; original?: Commitment };

// Share of a week's spendable money each suggested envelope starts with; the rest stays in flex.
const SUGGESTED: { name: string; share: number; on: boolean }[] = [
  { name: "Groceries", share: 0.18, on: true },
  { name: "Eating out", share: 0.12, on: true },
  { name: "Transport", share: 0.1, on: true },
  { name: "Small stuff", share: 0.06, on: true },
  { name: "Shopping", share: 0.08, on: false },
];

const BILL_IDEAS = ["Rent", "Phone", "Internet", "Streaming", "Gym", "Loan"];
const STEPS = ["Your month", "Weekly envelopes", "Fixed bills"];

/** Two significant figures: 1,234 → 1,200, 87 → 87. */
function nice(minor: Minor, unit: number): Minor {
  const whole = Math.max(0, Math.floor(minor / unit));
  if (whole < 100) return whole * unit;
  const step = 10 ** (String(whole).length - 2);
  return Math.round(whole / step) * step * unit;
}

/** Day of month → next date on or after today. */
function nextOnDay(day: number, today: string): string {
  const d = dayInMonth(monthOf(today), day);
  return d >= today ? d : addMonths(d, 1, day);
}

export function OnboardingView() {
  const router = useRouter();
  const data = useAppData();
  const { startMonth } = useActions();
  const fmt = useFormat();
  const today = useToday();
  const { profile } = data;
  const unit = unitOf(profile.currency);
  const returning = data.plan !== null;

  const [step, setStep] = useState(0);
  const [bank, setBank] = useState("");
  const [target, setTarget] = useState(data.plan ? fmt.input(data.plan.target) : "");
  const [salary, setSalary] = useState(data.plan?.salary ? fmt.input(data.plan.salary.amount) : "");
  const [salaryDay, setSalaryDay] = useState(data.plan?.salary ? String(+data.plan.salary.date.slice(8)) : "");
  const [envs, setEnvs] = useState<EnvRow[] | null>(
    data.envelopes.length
      ? data.envelopes.map((e) => ({ id: e.id, name: e.name, amount: fmt.input(e.weeklyLimit), on: true, locked: e.locked, leftover: e.leftover }))
      : null,
  );
  const [bills, setBills] = useState<BillRow[]>(
    data.commitments.map((c) => ({
      id: c.id,
      name: c.name,
      amount: fmt.input(c.amount),
      day: String(+c.nextDebit.slice(8)),
      frequency: c.frequency,
      original: c,
    })),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const bankP = fmt.parse(bank);
  const targetP = fmt.parse(target);
  const salaryP = fmt.parse(salary);
  const salaryDayN = Number(salaryDay);
  const salaryDayOk = salaryDayN >= 1 && salaryDayN <= 31;

  // Yearly-bill savings carry over: from last month's plan as they stood at its end, or unchanged when redoing
  // this month. Derived from that plan and its confirmed payments, so nothing is double counted.
  const carried =
    data.plan === null
      ? {}
      : data.plan.month === monthOf(today)
        ? (data.plan.billFunds ?? {})
        : billFundsAtEnd(enginePlan(data.plan, profile), data.commitments, data.txns);

  const carriedTotal = Object.values(carried).reduce((s, v) => s + v, 0);

  const plan: PlanInput | null =
    bankP !== null && targetP !== null
      ? {
          month: monthOf(today),
          openingBank: bankP,
          openingCash: 0,
          // Preview only; finish() stamps the real moment the balance was entered.
          balanceAt: `${today}T12:00:00Z`,
          target: targetP,
          salary: salaryP && salaryDayOk ? { amount: salaryP, date: nextOnDay(salaryDayN, today) } : null,
          weekStart: data.plan?.weekStart ?? defaultWeekStart(profile.locale),
          billFunds: carried,
        }
      : null;
  const full = plan && enginePlan({ ...plan, id: "draft" }, profile);
  const canSpend = full ? spendable(full) : 0;

  // Suggestions scale with what's actually spendable, so they make sense in any currency.
  const weeklySpend = (canSpend * 7) / daysInMonth(monthOf(today));
  const rows: EnvRow[] =
    envs ??
    SUGGESTED.map((s) => ({
      id: s.name,
      name: s.name,
      amount: fmt.input(nice(weeklySpend * s.share, unit)),
      on: s.on,
      locked: false,
      leftover: "rollover",
    }));
  const setRows = (next: EnvRow[]) => setEnvs(next);

  const envelopes: Envelope[] = rows.flatMap((r) => {
    const p = fmt.parse(r.amount);
    return r.on && r.name.trim() && p !== null ? [{ id: r.id, name: r.name.trim(), weeklyLimit: p, locked: r.locked, leftover: r.leftover }] : [];
  });
  const billOk = (b: BillRow) => {
    const day = Number(b.day);
    return b.name.trim() !== "" && !!fmt.parse(b.amount) && day >= 1 && day <= 31;
  };
  const commitments: Commitment[] = bills.flatMap((b) => {
    const p = fmt.parse(b.amount);
    if (!billOk(b) || !p) return [];
    const o = b.original;
    // Only monthly bills are described by a day of the month; others keep their date unless the day was changed.
    const keep = o && o.frequency !== "monthly" && b.day === String(+o.nextDebit.slice(8));
    return [{ id: b.id, name: b.name.trim(), amount: p, frequency: b.frequency, nextDebit: keep ? o.nextDebit : nextOnDay(Number(b.day), today) }];
  });
  // Rows the user started but didn't finish would otherwise be dropped without a word.
  const halfBills = bills.filter((b) => (b.name.trim() || b.amount || b.day) && !billOk(b)).length;
  const halfEnvs = rows.filter((r) => r.on && (!r.name.trim() || fmt.parse(r.amount) === null)).length;
  const salaryNeedsDay = salary.trim() !== "" && !salaryDayOk;

  const flex = full ? flexBudget(full, envelopes, commitments) : 0;
  const canNext = step === 0 ? plan !== null && canSpend >= 0 && !salaryNeedsDay : step === 1 ? halfEnvs === 0 : true;

  async function finish() {
    if (!plan) return;
    setSaving(true);
    setError(null);
    try {
      // Suggested rows use their name as a placeholder id until saved.
      const ids = envelopes.map((e) => (SUGGESTED.some((s) => s.name === e.id) ? { ...e, id: crypto.randomUUID() } : e));
      // Savings only stay with yearly bills that are kept; anything else is spendable again.
      const billFunds = Object.fromEntries(
        Object.entries(carried).filter(([id]) => commitments.some((c) => c.id === id && c.frequency === "yearly")),
      );
      await startMonth({ ...plan, balanceAt: new Date().toISOString(), billFunds }, ids, commitments);
      router.push("/");
    } catch (e) {
      console.error(e);
      setError("We couldn't save your plan. Check your connection and try again.");
      setSaving(false);
    }
  }

  const updateRow = (i: number, patch: Partial<EnvRow>) => setRows(rows.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const updateBill = (i: number, patch: Partial<BillRow>) => setBills(bills.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  return (
    <div className="mx-auto max-w-md space-y-10">
      <header>
        <ol className="flex gap-1.5" aria-label="Progress">
          {STEPS.map((s, i) => (
            <li key={s} aria-current={i === step ? "step" : undefined} className={`h-1 flex-1 rounded-full transition-colors ${i <= step ? "bg-fg" : "bg-line"}`}>
              <span className="sr-only">{s}</span>
            </li>
          ))}
        </ol>
        <p className="mt-6 text-sm text-muted">
          {step === 0 ? (returning ? "A new month, a fresh plan" : "Let's plan your month") : `Step ${step + 1} of ${STEPS.length}`}
        </p>
        <h1 className="mt-1 text-2xl font-medium tracking-tight">{STEPS[step]}</h1>
      </header>

      {step === 0 && (
        <div className="space-y-5">
          <MoneyField label="What's in your bank right now?" symbol={fmt.symbol} value={bank} onChange={setBank} autoFocus />
          <MoneyField label="What would you like to end the month with?" symbol={fmt.symbol} value={target} onChange={setTarget} />
          <div className="grid grid-cols-[1fr_6rem] gap-3">
            <MoneyField label="Pay still coming this month (optional)" symbol={fmt.symbol} value={salary} onChange={setSalary} />
            <label className="space-y-1.5">
              <span className="label">Pay day</span>
              <input
                className="field tabular-nums"
                inputMode="numeric"
                placeholder="1–31"
                maxLength={2}
                value={salaryDay}
                onChange={(e) => setSalaryDay(e.target.value.replace(/\D/g, ""))}
              />
            </label>
          </div>
          {salaryNeedsDay && <p className="text-sm text-warn">Add the day your pay arrives so Spency can count it.</p>}
          {plan && (
            <p className={`text-sm ${canSpend >= 0 ? "text-muted" : "text-warn"}`}>
              {canSpend >= 0
                ? `That gives you ${fmt.money(canSpend)} to work with this month.${
                    carriedTotal > 0 ? ` ${fmt.money(carriedTotal)} of your balance is already put aside for yearly bills.` : ""
                  }`
                : "Your target is above what you'll have. Try a lower target."}
            </p>
          )}
        </div>
      )}

      {step === 1 && (
        <div className="space-y-3">
          <p className="text-sm text-muted">A weekly budget for each thing you spend on often. We&apos;ve suggested amounts from your plan; change anything.</p>
          {rows.map((r, i) => (
            <div key={r.id} className="flex items-center gap-3 rounded-2xl bg-surface px-4 py-3">
              <Switch label={`Use ${r.name}`} checked={r.on} onChange={(on) => updateRow(i, { on })} />
              <input
                aria-label="Envelope name"
                value={r.name}
                onChange={(e) => updateRow(i, { name: e.target.value })}
                className={`min-w-0 flex-1 bg-transparent outline-none ${r.on ? "" : "text-faint"}`}
              />
              <label className="flex items-center gap-1 text-sm">
                <span className="text-faint">{fmt.symbol}</span>
                <input
                  aria-label={`${r.name} per week`}
                  inputMode="decimal"
                  disabled={!r.on}
                  className="w-20 bg-transparent text-right tabular-nums outline-none disabled:text-faint"
                  value={r.amount}
                  onChange={(e) => updateRow(i, { amount: e.target.value })}
                />
                <span className="text-faint">/wk</span>
              </label>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setRows([...rows, { id: crypto.randomUUID(), name: "", amount: "", on: true, locked: false, leftover: "rollover" }])}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-line py-3 text-sm text-muted hover:text-fg"
          >
            <Icon name="plus" size={16} />
            Another envelope
          </button>
          {halfEnvs > 0 && (
            <p className="text-sm text-warn">
              Give every envelope that&apos;s switched on a name and a weekly amount, or switch it off.
            </p>
          )}
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <p className="text-sm text-muted">Rent, subscriptions, loans. These are set aside first.</p>
          {bills.map((b, i) => (
            <div key={b.id} className="grid grid-cols-[1fr_5.5rem_3.75rem_auto] items-center gap-2">
              <input aria-label="Bill name" className="field" placeholder="Name" value={b.name} onChange={(e) => updateBill(i, { name: e.target.value })} />
              <input aria-label="Amount" className="field tabular-nums" inputMode="decimal" placeholder={fmt.symbol} value={b.amount} onChange={(e) => updateBill(i, { amount: e.target.value })} />
              <input
                aria-label={b.frequency === "monthly" ? "Day of month" : `Day of month (${b.frequency} bill)`}
                title={b.frequency === "monthly" ? undefined : `${b.frequency === "weekly" ? "Weekly" : "Yearly"} bill: keeps its date unless you change the day`}
                className="field tabular-nums"
                inputMode="numeric"
                maxLength={2}
                placeholder="Day"
                value={b.day}
                onChange={(e) => updateBill(i, { day: e.target.value.replace(/\D/g, "") })}
              />
              <button type="button" aria-label="Remove bill" onClick={() => setBills(bills.filter((_, j) => j !== i))} className="p-2 text-faint hover:text-fg">
                <Icon name="x" size={16} />
              </button>
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            {[...BILL_IDEAS.filter((n) => !bills.some((b) => b.name === n)), "Other"].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setBills([...bills, { id: crypto.randomUUID(), name: n === "Other" ? "" : n, amount: "", day: "", frequency: "monthly" }])}
                className="rounded-full border border-line px-3.5 py-1.5 text-sm text-muted transition-colors hover:text-fg"
              >
                + {n}
              </button>
            ))}
          </div>
          {halfBills > 0 && (
            <p className="text-sm text-warn">
              {halfBills === 1 ? "One bill needs" : `${halfBills} bills need`} a name, an amount and a day (1–31) before you start, or
              remove {halfBills === 1 ? "it" : "them"}.
            </p>
          )}
          {plan && (
            <p className={`pt-2 text-sm ${flex >= 0 ? "text-muted" : "text-warn"}`}>
              {flex >= 0
                ? `After bills and envelopes, ${fmt.money(flex)} stays in flex for everything unplanned.`
                : `Bills and envelopes are ${fmt.money(-flex)} more than you have. Trim an envelope or two.`}
            </p>
          )}
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-bad">
          {error}
        </p>
      )}

      <div className="flex gap-3">
        {step > 0 && (
          <button type="button" onClick={() => setStep(step - 1)} className="btn btn-ghost">
            Back
          </button>
        )}
        {step < STEPS.length - 1 ? (
          <button type="button" disabled={!canNext} onClick={() => setStep(step + 1)} className="btn btn-primary flex-1">
            Continue
          </button>
        ) : (
          <button type="button" disabled={!plan || saving || halfBills > 0 || halfEnvs > 0} onClick={finish} className="btn btn-primary flex-1">
            {saving ? "Saving…" : "Start my month"}
          </button>
        )}
      </div>
    </div>
  );
}

function MoneyField(props: { label: string; symbol: string; value: string; onChange: (v: string) => void; autoFocus?: boolean }) {
  return (
    <label className="block space-y-1.5">
      <span className="label">{props.label}</span>
      <input
        className="field text-lg tabular-nums"
        inputMode="decimal"
        placeholder={props.symbol}
        autoFocus={props.autoFocus}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
      />
    </label>
  );
}
