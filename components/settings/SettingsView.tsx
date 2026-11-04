"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useMemo, useState } from "react";
import { useActions, useAppData, useFormat, useMode, useSignOut, useSummary, useHasCurrentPlan } from "@/lib/data/context";
import { useDemoStore } from "@/lib/data/demo";
import { dayInMonth } from "@/lib/engine/dates";
import { defaultEnvelopeId } from "@/lib/engine/inbox";
import { unitOf } from "@/lib/engine/money";
import type { Theme } from "@/lib/data/types";
import { currencyOptions, localeOptions, timeZoneOptions } from "@/lib/locale";
import { supabaseConfigured } from "@/lib/supabase/env";
import { applyTheme } from "@/lib/theme";
import { Avatar } from "@/components/shell/Nav";
import { Segmented } from "@/components/ui/controls";
import { ConnectClaude } from "./ConnectClaude";
import { Icon } from "@/components/ui/Icon";

export function SettingsView() {
  const hasPlan = useHasCurrentPlan();
  const mode = useMode();
  return (
    <div className="space-y-12">
      <header>
        <h1 className="text-2xl font-medium tracking-tight">Settings</h1>
      </header>
      <ProfileCard />
      <Preferences />
      {hasPlan ? <PlanForm /> : <NoPlan />}
      {mode === "cloud" && <ConnectClaude />}
      <Account />
      <DangerZone />
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-[15px] font-medium">{title}</h2>
        {hint && <p className="mt-0.5 text-sm text-muted">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function ProfileCard() {
  const { profile } = useAppData();
  const { updateProfile } = useActions();
  const mode = useMode();
  const [name, setName] = useState(profile.displayName);

  return (
    <section className="card flex items-center gap-4 p-5">
      <Avatar size={56} />
      <div className="min-w-0 flex-1">
        <label className="sr-only" htmlFor="display-name">
          Display name
        </label>
        <input
          id="display-name"
          value={name}
          placeholder="Add your name"
          maxLength={80}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name.trim() !== profile.displayName && updateProfile({ displayName: name.trim() })}
          className="w-full truncate bg-transparent text-lg font-medium outline-none placeholder:text-faint"
        />
        <p className="truncate text-sm text-muted">{profile.email ?? "Demo month · stored in this browser"}</p>
      </div>
      <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs ${mode === "cloud" ? "bg-ok/12 text-ok" : "bg-raised text-muted"}`}>
        {mode === "cloud" ? "Synced" : "Local"}
      </span>
    </section>
  );
}

function Select({ label, value, onChange, children }: { label: string; value: string; onChange: (v: string) => void; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="label">{label}</span>
      <span className="relative block">
        <select className="field appearance-none pr-10" value={value} onChange={(e) => onChange(e.target.value)}>
          {children}
        </select>
        <Icon name="chevron" size={16} className="pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 text-muted" />
      </span>
    </label>
  );
}

function Preferences() {
  const { profile, plan, txns, envelopes, commitments } = useAppData();
  const { updateProfile } = useActions();
  const [currencyBlocked, setCurrencyBlocked] = useState<string | null>(null);
  const hasMoney = plan !== null || txns.length > 0 || envelopes.length > 0 || commitments.length > 0;

  /**
   * Amounts are stored in the currency's smallest unit. Between currencies with the same number of decimals a
   * switch is a harmless relabel; between different ones (rupees have 2, yen 0) every amount would be off by
   * 100×, so it's blocked while there's data.
   */
  function setCurrency(currency: string) {
    if (hasMoney && unitOf(currency) !== unitOf(profile.currency)) {
      setCurrencyBlocked(currency);
      return;
    }
    setCurrencyBlocked(null);
    updateProfile({ currency });
  }
  const currencies = useMemo(() => currencyOptions(profile.locale), [profile.locale]);
  const locales = useMemo(() => localeOptions(profile.locale, profile.locale), [profile.locale]);
  const zones = useMemo(() => timeZoneOptions(profile.timeZone), [profile.timeZone]);

  function setTheme(theme: Theme) {
    applyTheme(theme);
    updateProfile({ theme });
  }

  return (
    <>
      <Section title="Appearance">
        <Segmented<Theme>
          label="Theme"
          value={profile.theme}
          onChange={setTheme}
          options={[
            { value: "dark", label: "Dark" },
            { value: "light", label: "Light" },
          ]}
        />
      </Section>

      <Section title="Region" hint="How money, dates and weeks look to you.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Select label="Currency" value={profile.currency} onChange={setCurrency}>
            {currencies.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </Select>
          <Select label="Language & number format" value={profile.locale} onChange={(locale) => updateProfile({ locale })}>
            {locales.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </Select>
          <div className="sm:col-span-2">
            <Select label="Time zone" value={profile.timeZone} onChange={(timeZone) => updateProfile({ timeZone })}>
              {zones.map((z) => (
                <option key={z} value={z}>
                  {z.replaceAll("_", " ")}
                </option>
              ))}
            </Select>
          </div>
        </div>
        {currencyBlocked ? (
          <p role="alert" className="text-sm text-warn">
            {currencyBlocked} uses a different number of decimal places from {profile.currency}, so your amounts would come out wrong.
            To switch, use Start fresh below first, then pick {currencyBlocked}.
          </p>
        ) : (
          <p className="text-xs text-faint">Switching currency relabels your amounts; it doesn&apos;t convert them.</p>
        )}
      </Section>

      <Sorting />
    </>
  );
}

/** Where payments go when merchant memory and Claude can't place them. Flex is only ever chosen by hand. */
function Sorting() {
  const { profile, envelopes } = useAppData();
  const { updateProfile } = useActions();
  const current = defaultEnvelopeId(envelopes, profile.defaultEnvelopeId);
  if (envelopes.length === 0) return null;
  return (
    <Section title="Sorting" hint="Payments Spency and Claude can't match to an envelope go here. You can still move any payment to Flex yourself.">
      <Select
        label="Unsorted payments go to"
        value={current ?? "flex"}
        onChange={(v) => updateProfile({ defaultEnvelopeId: v === "flex" ? null : v })}
      >
        {envelopes.map((e) => (
          <option key={e.id} value={e.id}>
            {e.name}
          </option>
        ))}
        {/* ponytail: Flex as a default only when there's no "Small stuff" envelope, since null means "use Small stuff". */}
        {current === null && <option value="flex">Flex</option>}
      </Select>
    </Section>
  );
}

const WEEK_STARTS = [
  { value: "1", label: "Monday" },
  { value: "0", label: "Sunday" },
  { value: "6", label: "Saturday" },
] as const;
type WeekStartValue = (typeof WEEK_STARTS)[number]["value"];

function PlanForm() {
  const { plan } = useAppData();
  const s = useSummary();
  const fmt = useFormat();
  const { setPlan } = useActions();

  // Balances keep following the live numbers until the user types in them. Saving untouched balances would
  // re-baseline on a stale figure and silently drop anything confirmed since the page opened.
  const [bankText, setBank] = useState<string | null>(null);
  const [cashText, setCash] = useState<string | null>(null);
  const bank = bankText ?? fmt.input(s.bank);
  const cash = cashText ?? fmt.input(s.cash);
  const [target, setTarget] = useState(fmt.input(s.target));
  const [salary, setSalary] = useState(plan?.salary ? fmt.input(plan.salary.amount) : "");
  // Just the day of the month; the year and month always come from the plan.
  const [salaryDay, setSalaryDay] = useState(plan?.salary ? String(+plan.salary.date.slice(8)) : "");
  const [weekStart, setWeekStart] = useState<WeekStartValue>(
    WEEK_STARTS.find((w) => w.value === String(plan?.weekStart ?? 1))?.value ?? "1",
  );
  const [saved, setSaved] = useState(false);
  const edit =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      set(v);
      setSaved(false);
    };

  // The bank balance and target may be negative (overdraft); cash and salary can't be.
  const p = { bank: fmt.parseSigned(bank), cash: fmt.parse(cash || "0"), target: fmt.parseSigned(target), salary: fmt.parse(salary) };
  const day = Number(salaryDay);
  const dayOk = Number.isInteger(day) && day >= 1 && day <= 31;
  const valid = p.bank !== null && p.cash !== null && p.target !== null && (!salary || (p.salary !== null && dayOk));
  const rebase = bankText !== null || cashText !== null;

  function save(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || p.bank === null || p.cash === null || p.target === null) return;
    setPlan({
      // Re-baselining only when a balance was edited: they're true as of now, so earlier payments are inside them.
      ...(rebase ? { openingBank: p.bank, openingCash: p.cash, balanceAt: new Date().toISOString() } : {}),
      target: p.target,
      salary: p.salary && dayOk && plan ? { amount: p.salary, date: dayInMonth(plan.month, day) } : null,
      weekStart: Number(weekStart),
    });
    setBank(null);
    setCash(null);
    setSaved(true);
  }

  return (
    <Section title="This month's plan" hint={`Spendable this month: ${fmt.money(s.spendable)}`}>
      <form onSubmit={save} className="space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <Money label="Bank balance now" symbol={fmt.symbol} value={bank} onChange={edit(setBank)} />
          <Money label="Cash in hand" symbol={fmt.symbol} value={cash} onChange={edit(setCash)} />
          <Money label="Month-end target" symbol={fmt.symbol} value={target} onChange={edit(setTarget)} />
          <div />
          <Money label="Salary (optional)" symbol={fmt.symbol} value={salary} onChange={edit(setSalary)} />
          <label className="space-y-1.5">
            <span className="label">Pay day</span>
            <input
              className="field tabular-nums"
              inputMode="numeric"
              placeholder="1–31"
              maxLength={2}
              aria-describedby="payday-hint"
              value={salaryDay}
              onChange={(e) => edit(setSalaryDay)(e.target.value.replace(/\D/g, ""))}
            />
            <span id="payday-hint" className="block text-xs text-faint">
              Day of the month. If it&apos;s already passed, Spency treats this month&apos;s pay as received.
            </span>
          </label>
        </div>
        {salary && !dayOk && <p className="text-sm text-warn">Add the day your pay arrives so Spency can count it.</p>}
        <div className="space-y-2">
          <span className="label">Weeks start on</span>
          <Segmented<WeekStartValue> label="Week start" value={weekStart} onChange={edit(setWeekStart)} options={[...WEEK_STARTS]} />
        </div>
        <p className="text-sm text-muted">
          {rebase
            ? "Saving makes these balances your new starting point, as of right now."
            : "Balances follow your payments. Type a new one only if your bank shows something different."}
        </p>
        <button type="submit" disabled={!valid} className="btn btn-primary w-full">
          {saved ? "Saved" : "Save plan"}
        </button>
      </form>
    </Section>
  );
}

function NoPlan() {
  return (
    <Section title="This month's plan">
      <Link href="/" className="btn btn-primary w-full">
        Set up this month
      </Link>
    </Section>
  );
}

function Account() {
  const mode = useMode();
  const signOut = useSignOut();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function leave() {
    setBusy(true);
    setError(null);
    try {
      await signOut();
    } catch (e) {
      console.error(e);
      setError("Couldn't sign out. Check your connection and try again.");
      setBusy(false);
    }
  }

  return (
    <Section
      title={mode === "cloud" ? "Account" : "Data"}
      hint="Spency never asks for bank logins. It only knows what you or Claude tell it."
    >
      <div className="flex flex-wrap gap-2">
        {mode === "cloud" ? (
          <>
            <Link href="/reset-password" className="btn btn-ghost">
              Change password
            </Link>
            <button type="button" disabled={busy} onClick={leave} className="btn btn-ghost">
              Sign out
            </button>
          </>
        ) : (
          <>
            {supabaseConfigured && (
              <Link href="/login?mode=signup" className="btn btn-primary">
                Create account
              </Link>
            )}
            <Link href="/onboarding" className="btn btn-ghost">
              Start from scratch
            </Link>
            <button
              type="button"
              onClick={() => confirm("Replace everything with the demo month?") && useDemoStore.getState().reset()}
              className="btn btn-ghost"
            >
              Reload demo
            </button>
            {supabaseConfigured && (
              <button type="button" disabled={busy} onClick={leave} className="btn text-muted hover:text-fg">
                Exit demo
              </button>
            )}
          </>
        )}
      </div>
      {error && (
        <p role="alert" className="text-sm text-bad">
          {error}
        </p>
      )}
    </Section>
  );
}

const RESET_WORD = "RESET";

/** Start fresh: wipes money data, keeps the account, profile and connected apps, then reopens onboarding. */
function DangerZone() {
  const { resetAll } = useActions();
  const mode = useMode();
  const router = useRouter();
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function reset(e: React.FormEvent) {
    e.preventDefault();
    if (typed.trim().toUpperCase() !== RESET_WORD) return;
    setBusy(true);
    setError(null);
    try {
      await resetAll();
      router.push("/");
    } catch (err) {
      console.error("Reset failed", err);
      setError("Couldn't finish the reset. Some data may remain; try again.");
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="danger" className="space-y-4 rounded-[20px] border border-bad/30 p-5">
      <div>
        <h2 id="danger" className="text-[15px] font-medium text-bad">
          Start fresh
        </h2>
        <p className="mt-1 text-sm leading-relaxed text-muted">
          Deletes every transaction, envelope, bill, month plan, merchant memory and reconcile check
          {mode === "cloud" ? " from your account" : " in this browser"}. Your {mode === "cloud" ? "login, " : ""}profile
          {mode === "cloud" ? " and connected apps stay" : " stays"}. This can&apos;t be undone.
        </p>
      </div>
      <form onSubmit={reset} className="flex flex-col gap-2 sm:flex-row">
        <label className="sr-only" htmlFor="reset-confirm">
          Type {RESET_WORD} to confirm
        </label>
        <input
          id="reset-confirm"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder={`Type ${RESET_WORD} to confirm`}
          autoComplete="off"
          autoCapitalize="characters"
          className="field"
        />
        <button
          type="submit"
          disabled={busy || typed.trim().toUpperCase() !== RESET_WORD}
          className="btn shrink-0 bg-bad text-bg"
        >
          {busy ? "Resetting…" : "Reset everything"}
        </button>
      </form>
      {error && (
        <p role="alert" className="text-sm text-bad">
          {error}
        </p>
      )}
    </section>
  );
}

function Money({ label, symbol, value, onChange }: { label: string; symbol: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="space-y-1.5">
      <span className="label">{label}</span>
      <input className="field tabular-nums" inputMode="decimal" placeholder={symbol} value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}
