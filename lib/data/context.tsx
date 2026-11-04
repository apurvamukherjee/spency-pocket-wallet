"use client";

import { createContext, useContext, useMemo } from "react";
import type { Summary } from "@/lib/engine/derive";
import { todayIn } from "@/lib/engine/dates";
import { isCurrentPlan } from "@/lib/engine/plan";
import { type SpencyData, summarize } from "@/lib/engine/derive";
import { makeFormatters } from "@/lib/format";
import { enginePlan } from "./plan";
import type { Actions, AppData } from "./types";

export type Mode = "demo" | "cloud";

export type SpencyContextValue = { data: AppData; actions: Actions; mode: Mode; signOut: () => Promise<void> };

export const SpencyContext = createContext<SpencyContextValue | null>(null);

export class NoDataError extends Error {
  override name = "NoDataError";
}

function useCtx(): SpencyContextValue {
  const ctx = useContext(SpencyContext);
  if (!ctx) throw new NoDataError("Spency hooks must be used inside a data provider");
  return ctx;
}

export const useAppData = () => useCtx().data;
export const useActions = () => useCtx().actions;
export const useMode = () => useCtx().mode;
export const useSignOut = () => useCtx().signOut;
export const useProfile = () => useCtx().data.profile;

export { enginePlan } from "./plan";

export function useToday() {
  return todayIn(useProfile().timeZone);
}

/** True when there's a plan for the current calendar month; otherwise the app shows onboarding. */
export function useHasCurrentPlan(): boolean {
  const { plan } = useAppData();
  const today = useToday();
  return plan !== null && isCurrentPlan(plan, today);
}

// Derived values are cached per AppData snapshot (a new object after every change), so the many components that
// read them share one computation instead of each re-running the engine.
const engineCache = new WeakMap<AppData, SpencyData>();
const summaryCache = new WeakMap<SpencyData, { today: string; summary: Summary }>();

/** Engine input. Only call below the plan gate, which guarantees a plan exists. */
export function useData(): SpencyData {
  const d = useAppData();
  const { plan, profile, envelopes, commitments, txns } = d;
  if (!plan) throw new NoDataError("useData called before a month plan exists");
  let data = engineCache.get(d);
  if (!data) {
    data = { plan: enginePlan(plan, profile), envelopes, commitments, txns };
    engineCache.set(d, data);
  }
  return data;
}

export function useSummary(): Summary {
  const data = useData();
  const today = useToday();
  const hit = summaryCache.get(data);
  if (hit && hit.today === today) return hit.summary;
  const summary = summarize(data, today);
  summaryCache.set(data, { today, summary });
  return summary;
}

export function useFormat() {
  const { currency, locale, timeZone } = useProfile();
  return useMemo(() => makeFormatters({ currency, locale, timeZone }), [currency, locale, timeZone]);
}
