"use client";

import { createContext, useContext, useMemo } from "react";
import { monthOf, todayIn } from "@/lib/engine/dates";
import { type SpencyData, summarize } from "@/lib/engine/derive";
import type { MonthPlan } from "@/lib/engine/types";
import { makeFormatters } from "@/lib/format";
import type { Actions, AppData, Profile, StoredPlan } from "./types";

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

export const enginePlan = (plan: StoredPlan, profile: Profile): MonthPlan => ({
  ...plan,
  currency: profile.currency,
  timeZone: profile.timeZone,
});

export function useToday() {
  return todayIn(useProfile().timeZone);
}

/** True when there's a plan for the current calendar month; otherwise the app shows onboarding. */
export function useHasCurrentPlan(): boolean {
  const { plan } = useAppData();
  const today = useToday();
  return plan !== null && plan.month === monthOf(today);
}

/** Engine input. Only call below the plan gate, which guarantees a plan exists. */
export function useData(): SpencyData {
  const { plan, profile, envelopes, commitments, txns } = useAppData();
  if (!plan) throw new NoDataError("useData called before a month plan exists");
  return useMemo(
    () => ({ plan: enginePlan(plan, profile), envelopes, commitments, txns }),
    [plan, profile, envelopes, commitments, txns],
  );
}

export function useSummary() {
  const data = useData();
  const today = useToday();
  return useMemo(() => summarize(data, today), [data, today]);
}

export function useFormat() {
  const { currency, locale, timeZone } = useProfile();
  return useMemo(() => makeFormatters({ currency, locale, timeZone }), [currency, locale, timeZone]);
}
