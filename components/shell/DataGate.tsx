"use client";

import { type ReactNode, useEffect, useSyncExternalStore } from "react";
import { todayIST } from "@/lib/engine/dates";
import { useSpency } from "@/lib/store";

const subscribe = (cb: () => void) => useSpency.persist.onFinishHydration(cb);
const hydrated = () => useSpency.persist.hasHydrated();

/**
 * User data lives in localStorage in Phase 1, so nothing below this renders on the server.
 * First visit gets the demo month.
 */
export function DataGate({ children, fallback = null }: { children: ReactNode; fallback?: ReactNode }) {
  const ready = useSyncExternalStore(subscribe, hydrated, () => false);
  const hasData = useSpency((s) => s.data !== null);

  useEffect(() => {
    if (!useSpency.persist.hasHydrated()) void useSpency.persist.rehydrate();
  }, []);

  useEffect(() => {
    if (ready && !useSpency.getState().data) useSpency.getState().seedDemo(todayIST());
  }, [ready]);

  return ready && hasData ? children : fallback;
}
