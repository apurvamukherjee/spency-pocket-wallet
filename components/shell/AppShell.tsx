"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useEffect } from "react";
import { useHasCurrentPlan, useMode } from "@/lib/data/context";
import { supabaseConfigured } from "@/lib/supabase/env";
import { useUI } from "@/lib/ui";
import { EditTxnSheet } from "@/components/inbox/EditTxnSheet";
import { InboxPanel } from "@/components/inbox/InboxView";
import { OnboardingView } from "@/components/settings/OnboardingView";
import { Icon } from "@/components/ui/Icon";
import { DataRoot } from "./DataRoot";
import { Sidebar, TabBar } from "./Nav";
import { QuickAdd } from "./QuickAdd";

function Loading() {
  return (
    <div className="mx-auto w-full max-w-2xl animate-pulse space-y-4 px-4 pt-10 sm:px-6" aria-busy aria-label="Loading">
      <div className="h-4 w-32 rounded bg-surface" />
      <div className="h-14 w-56 rounded-xl bg-surface" />
      <div className="h-40 rounded-[20px] bg-surface" />
    </div>
  );
}

/** Mobile: content + bottom tabs. ≥1024px: nav | main | persistent inbox. */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <DataRoot fallback={<Loading />}>
      <div className="min-h-dvh lg:grid lg:grid-cols-[232px_minmax(0,1fr)_380px]">
        <Sidebar />
        <main className="mx-auto w-full max-w-2xl px-4 pt-[max(env(safe-area-inset-top),1.5rem)] pb-[calc(env(safe-area-inset-bottom)+7rem)] sm:px-6 lg:px-10 lg:pt-10 lg:pb-16">
          <DemoBanner />
          <PlanGate>{children}</PlanGate>
        </main>
        <aside aria-label="Inbox" className="sticky top-0 hidden h-dvh overflow-y-auto border-l border-line px-5 py-10 lg:block">
          <InboxPanel />
        </aside>
        <TabBar />
        <QuickAdd />
        <EditTxnSheet />
        <Toast />
      </div>
    </DataRoot>
  );
}

/** No plan for this month yet → onboarding (prefilled from last month). Settings stays reachable. */
function PlanGate({ children }: { children: ReactNode }) {
  const ready = useHasCurrentPlan();
  const path = usePathname();
  return ready || path.startsWith("/settings") || path.startsWith("/onboarding") ? children : <OnboardingView />;
}

function DemoBanner() {
  const mode = useMode();
  if (mode !== "demo" || !supabaseConfigured) return null;
  return (
    <div className="mb-8 flex items-center justify-between gap-3 rounded-2xl border border-line px-4 py-3 text-sm">
      <span className="text-muted">You&apos;re exploring a demo month. Nothing is saved to an account.</span>
      <Link href="/login?mode=signup" className="shrink-0 font-medium text-accent">
        Create account
      </Link>
    </div>
  );
}

function Toast() {
  const notice = useUI((s) => s.notice);
  const notify = useUI((s) => s.notify);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => notify(null), 6000);
    return () => clearTimeout(t);
  }, [notice, notify]);
  if (!notice) return null;
  return (
    <div
      role="status"
      className="fixed inset-x-4 bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] z-30 mx-auto flex max-w-md items-start gap-3 rounded-2xl border border-line bg-raised px-4 py-3 text-sm shadow-lg lg:bottom-8"
    >
      <p className="flex-1">{notice}</p>
      <button type="button" onClick={() => notify(null)} aria-label="Dismiss" className="text-muted hover:text-fg">
        <Icon name="x" size={16} />
      </button>
    </div>
  );
}
