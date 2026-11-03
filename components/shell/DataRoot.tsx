"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";
import { CloudProvider } from "@/lib/data/cloud";
import { DemoProvider, useDemoHydrated, useDemoStore } from "@/lib/data/demo";
import { supabaseConfigured } from "@/lib/supabase/env";
import { useSession } from "@/lib/supabase/session";

/**
 * Picks the data source: Supabase for signed-in users, the local demo when Supabase isn't configured
 * or the visitor chose "Try the demo", otherwise sends them to sign in.
 */
export function DataRoot({ children, fallback }: { children: ReactNode; fallback: ReactNode }) {
  return supabaseConfigured ? (
    <AuthRoot fallback={fallback}>{children}</AuthRoot>
  ) : (
    <DemoProvider fallback={fallback}>{children}</DemoProvider>
  );
}

function AuthRoot({ children, fallback }: { children: ReactNode; fallback: ReactNode }) {
  const session = useSession();
  const demoReady = useDemoHydrated();
  const demoActive = useDemoStore((s) => s.active);
  const router = useRouter();
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: 1 } } }),
  );
  const signedOut = session === null && demoReady && !demoActive;

  useEffect(() => {
    if (signedOut) router.replace("/login");
  }, [signedOut, router]);

  if (session) {
    return (
      <QueryClientProvider client={queryClient}>
        <CloudProvider user={{ id: session.user.id, email: session.user.email ?? null }} fallback={fallback}>
          {children}
        </CloudProvider>
      </QueryClientProvider>
    );
  }
  if (session === null && demoActive) return <DemoProvider fallback={fallback}>{children}</DemoProvider>;
  return fallback;
}
