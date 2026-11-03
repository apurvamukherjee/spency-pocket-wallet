"use client";

import { useMemo, useState } from "react";
import { useActions, useAppData, useData, useFormat, useToday } from "@/lib/data/context";
import { weekStartOf } from "@/lib/engine/dates";
import { unitOf } from "@/lib/engine/money";
import { suggestRebalance } from "@/lib/engine/patterns";
import { useUI } from "@/lib/ui";
import { Icon } from "@/components/ui/Icon";

const DISMISSED_KEY = "spency-dismissed-rebalance";

function readDismissed(): string[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(DISMISSED_KEY) ?? "[]");
    return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string") : [];
  } catch (e) {
    console.warn("Could not read dismissed suggestions", e);
    return [];
  }
}

/** "Move ₹150 a week from Blinkit to Small stuff?" One tap applies it; "Not now" hides it until the pattern changes. */
export function RebalanceCard() {
  const { plan, envelopes, txns } = useData();
  const { profile } = useAppData();
  const { saveEnvelope } = useActions();
  const notify = useUI((s) => s.notify);
  const fmt = useFormat();
  const today = useToday();
  const [dismissed, setDismissed] = useState(readDismissed);

  const r = useMemo(
    () => suggestRebalance({ envelopes, txns, today, weekStart: plan.weekStart, timeZone: profile.timeZone, unit: unitOf(profile.currency) }),
    [envelopes, txns, today, plan.weekStart, profile.timeZone, profile.currency],
  );
  // Keyed by week, so a dismissed pattern can come back if it keeps happening.
  const key = r && `${r.from.id}>${r.to.id}@${weekStartOf(today, plan.weekStart)}`;
  if (!r || !key || dismissed.includes(key)) return null;

  const perWeek = fmt.money(r.amount);

  function accept() {
    if (!r) return;
    saveEnvelope({ ...r.from, weeklyLimit: r.from.weeklyLimit - r.amount });
    saveEnvelope({ ...r.to, weeklyLimit: r.to.weeklyLimit + r.amount });
    notify(`Done. ${r.to.name} now gets ${perWeek} more a week, from ${r.from.name}.`);
  }

  function dismiss() {
    const next = [...dismissed, key as string].slice(-20);
    setDismissed(next);
    try {
      localStorage.setItem(DISMISSED_KEY, JSON.stringify(next));
    } catch (e) {
      console.warn("Could not remember dismissal", e);
    }
  }

  return (
    <section aria-labelledby="rebalance" className="card space-y-4 border-accent/30 p-5">
      <div className="flex gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-accent/12 text-accent">
          <Icon name="sparkle" size={18} />
        </span>
        <div>
          <h2 id="rebalance" className="text-[15px] font-medium">
            Move {perWeek} a week from {r.from.name} to {r.to.name}?
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-muted">
            {r.to.name} has gone over {r.weeks} weeks running, while {r.from.name} stayed under every week. A small shift makes your
            budget match how you actually spend.
          </p>
        </div>
      </div>
      <div className="flex gap-2 pl-12">
        <button type="button" onClick={accept} className="btn btn-primary px-4 py-2 text-sm">
          Move {perWeek}/week
        </button>
        <button type="button" onClick={dismiss} className="btn px-4 py-2 text-sm text-muted hover:text-fg">
          Not now
        </button>
      </div>
    </section>
  );
}
