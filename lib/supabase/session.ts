"use client";

import type { Session } from "@supabase/supabase-js";
import { useSyncExternalStore } from "react";
import { supabaseBrowser } from "./client";

// undefined = still loading, null = signed out.
let snapshot: Session | null | undefined;
const listeners = new Set<() => void>();
let started = false;

function emit(next: Session | null) {
  snapshot = next;
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!started) {
    started = true;
    const sb = supabaseBrowser();
    void sb.auth.getSession().then(({ data, error }) => {
      if (error) console.error("Could not read session", error);
      emit(data.session);
    });
    sb.auth.onAuthStateChange((_event, session) => emit(session));
  }
  return () => listeners.delete(listener);
}

/** Client-side session for UI routing only; row level security is what actually protects data. */
export function useSession(): Session | null | undefined {
  return useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => undefined,
  );
}
