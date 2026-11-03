"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { addMonths, daysInMonth, monthOf, todayIST } from "@/lib/engine/dates";
import { formatINR, parseRupees } from "@/lib/engine/money";
import { flexBudget, spendable } from "@/lib/engine/plan";
import type { Commitment, Envelope, MonthPlan } from "@/lib/engine/types";
import { useSpency } from "@/lib/store";
import { Icon } from "@/components/ui/Icon";
import { Switch } from "@/components/ui/controls";

type EnvRow = { name: string; amount: string; on: boolean };
type BillRow = { name: string; amount: string; day: string };

const SUGGESTED: EnvRow[] = [
  { name: "Groceries", amount: "500", on: true },
  { name: "Fuel", amount: "500", on: true },
  { name: "Eating out", amount: "800", on: true },
  { name: "Small stuff", amount: "300", on: true },
  { name: "Shopping", amount: "1000", on: false },
];

const BILL_IDEAS = ["Rent", "Netflix", "EMI", "Phone", "Gym"];

const STEPS = ["Your month", "Weekly envelopes", "Fixed bills"];

/** Day-of-month → next date on or after today. */
function nextOnDay(day: number, today: string): string {
  const m = monthOf(today);
  const d = `${m}-${String(Math.min(day, daysInMonth(m))).padStart(2, "0")}`;
  return d >= today ? d : addMonths(d, 1, day);
}

export function OnboardingView() {
  const router = useRouter();
  const startFresh = useSpency((s) => s.startFresh);
  const today = todayIST();
  const [step, setStep] = useState(0);
  const [bank, setBank] = useState("");
  const [target, setTarget] = useState("");
  const [salary, setSalary] = useState("");
  const [salaryDay, setSalaryDay] = useState("1");
  const [envs, setEnvs] = useState(SUGGESTED);
  const [bills, setBills] = useState<BillRow[]>([]);

  const bankP = parseRupees(bank);
  const targetP = parseRupees(target);
  const salaryP = parseRupees(salary);

  const plan: MonthPlan | null =
    bankP !== null && targetP !== null
      ? {
          month: monthOf(today),
          openingBank: bankP,
          openingCash: 0,
          balanceAt: new Date().toISOString(),
          target: targetP,
          salary: salaryP ? { amount: salaryP, date: nextOnDay(Number(salaryDay) || 1, today) } : null,
          weekStart: 1,
        }
      : null;

  const envelopes: Envelope[] = envs.flatMap((r, i) => {
    const p = parseRupees(r.amount);
    return r.on && r.name.trim() && p
      ? [{ id: `env-${i}-${r.name.toLowerCase().replace(/\W+/g, "-")}`, name: r.name.trim(), weeklyLimit: p, locked: false, leftover: "rollover" as const }]
      : [];
  });
  const commitments: Commitment[] = bills.flatMap((b, i) => {
    const p = parseRupees(b.amount);
    const day = Number(b.day);
    return b.name.trim() && p && day >= 1 && day <= 31
      ? [{ id: `bill-${i}`, name: b.name.trim(), amount: p, frequency: "monthly" as const, nextDebit: nextOnDay(day, today) }]
      : [];
  });

  const flex = plan ? flexBudget(plan, envelopes, commitments) : 0;
  const canNext = step > 0 || (plan !== null && spendable(plan) >= 0);

  function finish() {
    if (!plan) return;
    startFresh(plan, envelopes, commitments);
    router.push("/");
  }

  return (
    <div className="mx-auto max-w-md space-y-10">
      <header>
        <ol className="flex gap-1.5" aria-label="Progress">
          {STEPS.map((s, i) => (
            <li key={s} aria-current={i === step ? "step" : undefined} className={`h-1 flex-1 rounded-full ${i <= step ? "bg-fg" : "bg-line"}`}>
              <span className="sr-only">{s}</span>
            </li>
          ))}
        </ol>
        <p className="mt-6 text-sm text-muted">
          Step {step + 1} of {STEPS.length}
        </p>
        <h1 className="mt-1 text-2xl font-medium tracking-tight">{STEPS[step]}</h1>
      </header>

      {step === 0 && (
        <div className="space-y-5">
          <Field label="What's in your bank right now?" value={bank} onChange={setBank} autoFocus />
          <Field label="What would you like to end the month with?" value={target} onChange={setTarget} />
          <div className="grid grid-cols-[1fr_6rem] gap-3">
            <Field label="Salary this month (optional)" value={salary} onChange={setSalary} />
            <label className="space-y-1.5">
              <span className="label">On day</span>
              <input className="field" inputMode="numeric" value={salaryDay} onChange={(e) => setSalaryDay(e.target.value)} />
            </label>
          </div>
          {plan && (
            <p className={`text-sm ${spendable(plan) >= 0 ? "text-muted" : "text-warn"}`}>
              {spendable(plan) >= 0
                ? `That gives you ${formatINR(spendable(plan))} to work with this month.`
                : "Your target is above what you'll have. Try a lower target."}
            </p>
          )}
        </div>
      )}

      {step === 1 && (
        <div className="space-y-3">
          <p className="text-sm text-muted">A weekly budget for each thing you spend on often. You can change these any time.</p>
          {envs.map((r, i) => (
            <div key={r.name + i} className="flex items-center gap-3 rounded-2xl bg-surface px-4 py-3">
              <Switch label={`Use ${r.name}`} checked={r.on} onChange={(on) => setEnvs(envs.map((x, j) => (j === i ? { ...x, on } : x)))} />
              <span className={`flex-1 ${r.on ? "" : "text-faint"}`}>{r.name}</span>
              <label className="flex items-center gap-1 text-sm">
                <span className="text-faint">₹</span>
                <input
                  aria-label={`${r.name} per week`}
                  inputMode="decimal"
                  disabled={!r.on}
                  className="w-14 bg-transparent text-right tabular-nums outline-none disabled:text-faint"
                  value={r.amount}
                  onChange={(e) => setEnvs(envs.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))}
                />
                <span className="text-faint">/wk</span>
              </label>
            </div>
          ))}
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <p className="text-sm text-muted">Subscriptions, rent, EMIs. These are set aside first.</p>
          {bills.map((b, i) => (
            <div key={i} className="grid grid-cols-[1fr_6rem_4rem_auto] items-center gap-2">
              <input aria-label="Bill name" className="field" placeholder="Name" value={b.name} onChange={(e) => setBills(bills.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
              <input aria-label="Amount" className="field tabular-nums" inputMode="decimal" placeholder="₹" value={b.amount} onChange={(e) => setBills(bills.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} />
              <input aria-label="Day of month" className="field" inputMode="numeric" placeholder="Day" value={b.day} onChange={(e) => setBills(bills.map((x, j) => (j === i ? { ...x, day: e.target.value } : x)))} />
              <button type="button" aria-label="Remove bill" onClick={() => setBills(bills.filter((_, j) => j !== i))} className="p-2 text-faint hover:text-fg">
                <Icon name="x" size={16} />
              </button>
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            {BILL_IDEAS.filter((n) => !bills.some((b) => b.name === n)).map((n) => (
              <button key={n} type="button" onClick={() => setBills([...bills, { name: n, amount: "", day: "" }])} className="rounded-full border border-line px-3.5 py-1.5 text-sm text-muted hover:text-fg">
                + {n}
              </button>
            ))}
            <button type="button" onClick={() => setBills([...bills, { name: "", amount: "", day: "" }])} className="rounded-full border border-line px-3.5 py-1.5 text-sm text-muted hover:text-fg">
              + Other
            </button>
          </div>
          {plan && (
            <p className={`pt-2 text-sm ${flex >= 0 ? "text-muted" : "text-warn"}`}>
              {flex >= 0
                ? `After bills and envelopes, ${formatINR(flex)} stays in flex for everything unplanned.`
                : `Bills and envelopes are ${formatINR(-flex)} more than you have. Trim an envelope or two.`}
            </p>
          )}
        </div>
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
          <button type="button" disabled={!plan} onClick={finish} className="btn btn-primary flex-1">
            Start my month
          </button>
        )}
      </div>
    </div>
  );
}

function Field({ label, value, onChange, autoFocus }: { label: string; value: string; onChange: (v: string) => void; autoFocus?: boolean }) {
  return (
    <label className="block space-y-1.5">
      <span className="label">{label}</span>
      <input className="field text-lg tabular-nums" inputMode="decimal" placeholder="₹" autoFocus={autoFocus} value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}
