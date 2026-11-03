"use client";

import { useMemo } from "react";
import { useActions, useAppData, useFormat, useToday } from "@/lib/data/context";
import { findDuplicate } from "@/lib/engine/inbox";
import type { Envelope, Txn } from "@/lib/engine/types";
import { useUI } from "@/lib/ui";
import { Icon } from "@/components/ui/Icon";
import { categoryName } from "./CategoryPicker";
import { SwipeCard } from "./SwipeCard";

function usePending() {
  const { txns } = useAppData();
  return useMemo(() => {
    const pending = txns.filter((t) => t.status === "pending").sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
    return pending.map((t) => ({ txn: t, duplicateOf: findDuplicate(t, txns) }));
  }, [txns]);
}

export function InboxView() {
  return (
    <div>
      <header className="mb-8">
        <h1 className="text-2xl font-medium tracking-tight">Inbox</h1>
        <p className="mt-1 text-sm text-muted">Payments Claude read from your screenshots. Swipe right to confirm, left to dismiss.</p>
      </header>
      <InboxList />
    </div>
  );
}

export function InboxPanel() {
  const count = usePending().length;
  return (
    <div>
      <header className="mb-6 flex items-baseline justify-between">
        <h2 className="text-[15px] font-medium">Inbox</h2>
        {count > 0 && <span className="text-sm text-muted tabular-nums">{count} to review</span>}
      </header>
      <InboxList />
    </div>
  );
}

function InboxList() {
  const items = usePending();
  const { envelopes } = useAppData();
  const { setStatus } = useActions();
  const today = useToday();

  if (items.length === 0) {
    return (
      <div className="rounded-[20px] border border-dashed border-line px-6 py-10 text-center">
        <p className="text-[15px]">All caught up</p>
        <p className="mx-auto mt-1.5 max-w-64 text-sm text-muted">Share a payment screenshot with Claude and it will appear here for you to confirm.</p>
      </div>
    );
  }

  const clean = items.filter((i) => !i.duplicateOf).map((i) => i.txn.id);
  return (
    <div className="space-y-3">
      {clean.length > 1 && (
        <button type="button" onClick={() => setStatus(clean, "confirmed")} className="btn btn-ghost w-full">
          <Icon name="check" size={18} />
          Confirm all {clean.length}
        </button>
      )}
      <ul className="space-y-3">
        {items.map(({ txn, duplicateOf }) => (
          <li key={txn.id}>
            <SwipeCard onConfirm={() => setStatus([txn.id], "confirmed")} onReject={() => setStatus([txn.id], "rejected")}>
              <TxnCard txn={txn} duplicateOf={duplicateOf} envelopes={envelopes} today={today} />
            </SwipeCard>
          </li>
        ))}
      </ul>
      {items.some((i) => i.duplicateOf) && (
        <p className="px-1 text-xs text-faint">Possible duplicates are left out of Confirm all so you can check them first.</p>
      )}
    </div>
  );
}

function TxnCard({ txn, duplicateOf, envelopes, today }: { txn: Txn; duplicateOf?: Txn; envelopes: Envelope[]; today: string }) {
  const edit = useUI((s) => s.edit);
  const fmt = useFormat();
  return (
    <button type="button" onClick={() => edit(txn.id)} className="card block w-full p-4 text-left transition-colors hover:border-faint">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[15px] font-medium">{txn.merchant}</p>
          <p className="mt-0.5 text-[13px] text-muted">{fmt.when(txn.occurredAt, today)}</p>
        </div>
        <p className="text-[17px] font-medium tabular-nums">{fmt.money(txn.amount)}</p>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-full bg-raised px-2.5 py-1 text-muted">{categoryName(envelopes, txn.envelopeId)}</span>
        {txn.wallet === "cash" && <span className="rounded-full bg-raised px-2.5 py-1 text-muted">Cash</span>}
        {txn.source === "claude" && (
          <span className="inline-flex items-center gap-1 text-faint">
            <Icon name="sparkle" size={12} />
            via Claude
          </span>
        )}
      </div>
      {duplicateOf && (
        <p className="mt-3 rounded-xl bg-warn/10 px-3 py-2 text-[13px] text-warn">
          Matches a {fmt.money(duplicateOf.amount)} payment from {fmt.when(duplicateOf.occurredAt, today)}
          {duplicateOf.upiRef && duplicateOf.upiRef === txn.upiRef ? " with the same reference" : ""}. Probably a duplicate.
        </p>
      )}
    </button>
  );
}
