"use client";

import Link from "next/link";
import { useState } from "react";
import { formatINR, parseRupees } from "@/lib/engine/money";
import { useData, useSummary } from "@/lib/hooks";
import { useSpency } from "@/lib/store";
import { Segmented } from "@/components/ui/controls";

const toText = (p: number) => String(p / 100);

export function SettingsView() {
  const { plan } = useData();
  const s = useSummary();
  const setPlan = useSpency((st) => st.setPlan);
  const seedDemo = useSpency((st) => st.seedDemo);

  const [bank, setBank] = useState(toText(s.bank));
  const [cash, setCash] = useState(toText(s.cash));
  const [target, setTarget] = useState(toText(plan.target));
  const [salary, setSalary] = useState(plan.salary ? toText(plan.salary.amount) : "");
  const [salaryDate, setSalaryDate] = useState(plan.salary?.date ?? "");
  const [weekStart, setWeekStart] = useState(String(plan.weekStart) as "0" | "1");
  const [saved, setSaved] = useState(false);

  const parsed = { bank: parseRupees(bank), cash: parseRupees(cash || "0"), target: parseRupees(target), salary: parseRupees(salary) };
  const valid = parsed.bank !== null && parsed.cash !== null && parsed.target !== null && (!salary || (parsed.salary && salaryDate));

  function save(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || parsed.bank === null || parsed.cash === null || parsed.target === null) return;
    // Re-baselining: balances are true as of now, so earlier txns are already inside them.
    setPlan({
      openingBank: parsed.bank,
      openingCash: parsed.cash,
      balanceAt: new Date().toISOString(),
      target: parsed.target,
      salary: parsed.salary && salaryDate ? { amount: parsed.salary, date: salaryDate } : null,
      weekStart: Number(weekStart),
    });
    setSaved(true);
  }

  return (
    <div className="space-y-12">
      <header>
        <h1 className="text-2xl font-medium tracking-tight">Settings</h1>
      </header>

      <form onSubmit={save} onChange={() => setSaved(false)} className="space-y-6">
        <h2 className="text-[15px] font-medium">Month plan</h2>
        <div className="grid grid-cols-2 gap-4">
          <Money label="Bank balance now" value={bank} onChange={setBank} />
          <Money label="Cash in hand" value={cash} onChange={setCash} />
          <Money label="Month-end target" value={target} onChange={setTarget} />
          <div />
          <Money label="Salary (optional)" value={salary} onChange={setSalary} />
          <label className="space-y-1.5">
            <span className="label">Expected on</span>
            <input className="field" type="date" value={salaryDate} onChange={(e) => setSalaryDate(e.target.value)} />
          </label>
        </div>
        <div className="space-y-2">
          <span className="label">Weeks start on</span>
          <Segmented
            label="Week start"
            value={weekStart}
            onChange={setWeekStart}
            options={[
              { value: "1", label: "Monday" },
              { value: "0", label: "Sunday" },
            ]}
          />
        </div>
        <p className="text-sm text-muted">Saving makes these balances your new starting point, as of right now.</p>
        <button type="submit" disabled={!valid} className="btn btn-primary w-full">
          {saved ? "Saved" : "Save plan"}
        </button>
        <p className="text-center text-sm text-muted">
          Spendable this month: <span className="text-fg tabular-nums">{formatINR(s.spendable)}</span>
        </p>
      </form>

      <section className="space-y-3">
        <h2 className="text-[15px] font-medium">Data</h2>
        <p className="text-sm text-muted">
          Spency never asks for bank logins. It only knows what you or Claude tell it. Right now everything stays in this browser.
        </p>
        <div className="flex flex-wrap gap-2 pt-2">
          <Link href="/onboarding" className="btn btn-ghost">
            Start from scratch
          </Link>
          <button type="button" onClick={() => confirm("Replace everything with the demo month?") && seedDemo(s.today)} className="btn text-muted hover:text-fg">
            Reload demo data
          </button>
        </div>
      </section>
    </div>
  );
}

function Money({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="space-y-1.5">
      <span className="label">{label}</span>
      <input className="field tabular-nums" inputMode="decimal" placeholder="₹" value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}
