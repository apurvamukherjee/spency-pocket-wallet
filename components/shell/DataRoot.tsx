"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { CloudProvider, cloudKey } from "@/lib/data/cloud";
import type { Seed } from "@/lib/data/seed";
import { DemoProvider, useDemoHydrated, useDemoStore } from "@/lib/data/demo";
import { supabaseConfigured } from "@/lib/supabase/env";
import { useSession } from "@/lib/supabase/session";

/**
 * Picks the data source: Supabase for signed-in users, the local demo when Supabase isn't configured
 * or the visitor chose "Try the demo", otherwise sends them to sign in.
 */
export function DataRoot({ children, fallback, seed }: { children: ReactNode; fallback: ReactNode; seed: Seed | null }) {
  return supabaseConfigured ? (
    <AuthRoot fallback={fallback} seed={seed}>
      {children}
    </AuthRoot>
  ) : (
    <DemoProvider fallback={fallback}>{children}</DemoProvider>
  );
}

function AuthRoot({ children, fallback, seed }: { children: ReactNode; fallback: ReactNode; seed: Seed | null }) {
  const session = useSession();
  const demoReady = useDemoHydrated();
  const demoActive = useDemoStore((s) => s.active);
  const router = useRouter();
  const [queryClient] = useState(() => {
    const qc = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: 1 } } });
    // The server already loaded this user's month; start from it instead of fetching again.
    if (seed) qc.setQueryData(cloudKey(seed.user.id), seed.data);
    return qc;
  });
  const signedOut = session === null && demoReady && !demoActive;
  // Until the browser has read its session (and on the server), trust the user the server verified.
  const live = session ? { id: session.user.id, email: session.user.email ?? null } : session === undefined ? (seed?.user ?? null) : null;
  const id = live?.id;
  const email = live?.email ?? null;
  const user = useMemo(() => (id ? { id, email } : null), [id, email]);

  useEffect(() => {
    if (signedOut) router.replace("/login");
  }, [signedOut, router]);

  if (user) {
    return (
      <QueryClientProvider client={queryClient}>
        <CloudProvider user={user} fallback={fallback}>
          {children}
        </CloudProvider>
      </QueryClientProvider>
    );
  }
  if (session === null && demoActive) return <DemoProvider fallback={fallback}>{children}</DemoProvider>;
  return fallback;
}
