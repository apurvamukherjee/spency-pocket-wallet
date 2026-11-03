"use client";

import { type ReactNode, useEffect, useMemo, useSyncExternalStore } from "react";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { monthOf, todayIn } from "@/lib/engine/dates";
import { seedData } from "@/lib/seed";
import { applyTheme } from "@/lib/theme";
import { SpencyContext } from "./context";
import * as r from "./reducers";
import type { Actions, AppData, Theme } from "./types";

const DEMO_TZ = "Asia/Kolkata";

function demoData(): AppData {
  const { data, memory } = seedData(todayIn(DEMO_TZ));
  const { currency, timeZone, ...plan } = data.plan;
  const theme: Theme = document.documentElement.dataset.theme === "light" ? "light" : "dark";
  return {
    profile: { displayName: "Demo", email: null, currency, locale: "en-IN", timeZone, theme },
    plan: { ...plan, id: "demo-plan" },
    envelopes: data.envelopes,
    commitments: data.commitments,
    txns: data.txns,
    memory,
    checks: [],
  };
}

type DemoState = {
  data: AppData | null;
  /** Chosen "Try the demo" on the sign-in page. Irrelevant when Supabase isn't configured (always demo). */
  active: boolean;
  apply: (fn: (d: AppData) => AppData) => void;
  reset: () => void;
  enter: () => void;
  exit: () => void;
};

// ponytail: demo data lives only in this browser's localStorage, by design.
export const useDemoStore = create<DemoState>()(
  persist(
    (set, get) => ({
      data: null,
      active: false,
      apply: (fn) => {
        const d = get().data;
        if (d) set({ data: fn(d) });
      },
      reset: () => set({ data: demoData() }),
      enter: () => set({ active: true }),
      exit: () => set({ active: false }),
    }),
    {
      name: "spency-demo-v2",
      // window.* so the server throws (zustand skips storage) instead of touching Node's global localStorage.
      storage: createJSONStorage(() => window.localStorage),
      skipHydration: true,
      partialize: ({ data, active }) => ({ data, active }),
    },
  ),
);

const subscribe = (cb: () => void) => useDemoStore.persist.onFinishHydration(cb);
const hydrated = () => useDemoStore.persist.hasHydrated();

export function useDemoHydrated(): boolean {
  const ready = useSyncExternalStore(subscribe, hydrated, () => false);
  useEffect(() => {
    if (!useDemoStore.persist.hasHydrated()) void useDemoStore.persist.rehydrate();
  }, []);
  return ready;
}

const { apply } = useDemoStore.getState();
const demoActions: Actions = {
    addTxn: (t) => apply((d) => r.addTxn(d, r.buildTxn(d, t, crypto.randomUUID(), new Date().toISOString()))),
    updateTxn: (id, patch) => apply((d) => r.updateTxn(d, id, patch)),
    setStatus: (ids, status) => apply((d) => r.setStatus(d, ids, status)),
    setPlan: (patch) => apply((d) => r.setPlan(d, patch)),
    saveEnvelope: (e) => apply((d) => r.saveEnvelope(d, e)),
    deleteEnvelope: (id) => apply((d) => r.deleteEnvelope(d, id)),
    saveCommitment: (c) => apply((d) => r.saveCommitment(d, c)),
    deleteCommitment: (id) => apply((d) => r.deleteCommitment(d, id)),
    recordCheck: (c) => apply((d) => r.recordCheck(d, c)),
    startMonth: async (plan, envelopes, commitments) =>
      apply((d) => r.startMonth({ ...d, txns: [], checks: [], memory: {} }, plan, "demo-plan", envelopes, commitments)),
    updateProfile: (patch) => apply((d) => r.updateProfile(d, patch)),
    resetAll: async () => apply(r.resetAll),
};

export function DemoProvider({ children, fallback }: { children: ReactNode; fallback: ReactNode }) {
  const ready = useDemoHydrated();
  const data = useDemoStore((s) => s.data);
  const theme = data?.profile.theme;

  // The demo is always "this month": regenerate when empty or left over from a previous month.
  useEffect(() => {
    const d = useDemoStore.getState().data;
    // A reset leaves plan null on purpose (onboarding), so only a stale month regenerates.
    if (ready && (!d || (d.plan && d.plan.month !== monthOf(todayIn(d.profile.timeZone))))) useDemoStore.getState().reset();
  }, [ready]);

  useEffect(() => {
    if (theme) applyTheme(theme);
  }, [theme]);

  const value = useMemo(
    () => data && { data, actions: demoActions, mode: "demo" as const, signOut: async () => useDemoStore.getState().exit() },
    [data],
  );
  if (!ready || !value) return fallback;
  return <SpencyContext value={value}>{children}</SpencyContext>;
}
