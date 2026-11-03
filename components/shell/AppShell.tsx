"use client";

import type { ReactNode } from "react";
import { InboxPanel } from "@/components/inbox/InboxView";
import { EditTxnSheet } from "@/components/inbox/EditTxnSheet";
import { DataGate } from "./DataGate";
import { Sidebar, TabBar } from "./Nav";
import { QuickAdd } from "./QuickAdd";

function Loading() {
  return (
    <div className="animate-pulse space-y-4 pt-6" aria-busy>
      <div className="h-4 w-32 rounded bg-surface" />
      <div className="h-14 w-56 rounded-xl bg-surface" />
      <div className="h-40 rounded-[20px] bg-surface" />
    </div>
  );
}

/** Mobile: content + bottom tabs. ≥1024px: nav | main | persistent inbox. */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[232px_minmax(0,1fr)_380px]">
      <Sidebar />
      <main className="mx-auto w-full max-w-2xl px-4 pt-[max(env(safe-area-inset-top),1.5rem)] pb-[calc(env(safe-area-inset-bottom)+7rem)] sm:px-6 lg:px-10 lg:pt-10 lg:pb-16">
        <DataGate fallback={<Loading />}>{children}</DataGate>
      </main>
      <aside aria-label="Inbox" className="sticky top-0 hidden h-dvh overflow-y-auto border-l border-line px-5 py-10 lg:block">
        <DataGate>
          <InboxPanel />
        </DataGate>
      </aside>
      <TabBar />
      <DataGate>
        <QuickAdd />
        <EditTxnSheet />
      </DataGate>
    </div>
  );
}
