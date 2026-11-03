"use client";

import { useState } from "react";
import { useActions, useAppData, useFormat } from "@/lib/data/context";
import { recallEnvelope } from "@/lib/engine/inbox";
import type { Wallet } from "@/lib/engine/types";
import { useUI } from "@/lib/ui";
import { CategoryPicker } from "@/components/inbox/CategoryPicker";
import { Segmented } from "@/components/ui/controls";
import { Sheet } from "@/components/ui/Sheet";

export function QuickAdd() {
  const open = useUI((s) => s.quickAdd);
  const close = useUI((s) => s.closeQuickAdd);
  return (
    <Sheet open={open} onClose={close} title="Add spend">
      <QuickAddForm onDone={close} />
    </Sheet>
  );
}

type Kind = "spend" | "withdraw";

function QuickAddForm({ onDone }: { onDone: () => void }) {
  const { envelopes, memory } = useAppData();
  const { addTxn } = useActions();
  const fmt = useFormat();

  const [kind, setKind] = useState<Kind>("spend");
  const [amountText, setAmountText] = useState("");
  const [merchant, setMerchant] = useState("");
  const [wallet, setWallet] = useState<Wallet>("bank");
  const [picked, setPicked] = useState<{ id: string | null } | null>(null);

  const amount = fmt.parse(amountText);
  const remembered = recallEnvelope(memory, merchant);
  const envelopeId = picked ? picked.id : (remembered ?? null);

  function save(e: React.FormEvent) {
    e.preventDefault();
    if (!amount) return;
    addTxn(
      kind === "withdraw"
        ? { amount, wallet: "bank", kind: "transfer", merchant: "Cash withdrawal", envelopeId: null, occurredAt: new Date().toISOString() }
        : { amount, wallet, merchant: merchant.trim() || "Quick spend", envelopeId, occurredAt: new Date().toISOString() },
    );
    onDone();
  }

  return (
    <form onSubmit={save} className="space-y-5">
      <Segmented<Kind>
        label="Type"
        value={kind}
        onChange={setKind}
        options={[
          { value: "spend", label: "Spend" },
          { value: "withdraw", label: "Cash withdrawal" },
        ]}
      />

      <label className="block">
        <span className="sr-only">Amount</span>
        <div className="flex items-baseline gap-1 border-b border-line pb-2 focus-within:border-accent/60">
          <span className="text-3xl text-faint">{fmt.symbol}</span>
          <input
            autoFocus
            inputMode="decimal"
            placeholder="0"
            value={amountText}
            onChange={(e) => setAmountText(e.target.value)}
            className="w-full bg-transparent text-4xl font-medium tracking-tight tabular-nums outline-none placeholder:text-faint"
          />
        </div>
      </label>

      {kind === "spend" ? (
        <>
          <input className="field" placeholder="Where? (optional)" value={merchant} onChange={(e) => setMerchant(e.target.value)} />
          <CategoryPicker envelopes={envelopes} value={envelopeId} onChange={(id) => setPicked({ id })} />
          <Segmented<Wallet>
            label="Paid from"
            value={wallet}
            onChange={setWallet}
            options={[
              { value: "bank", label: "Bank / card" },
              { value: "cash", label: "Cash" },
            ]}
          />
        </>
      ) : (
        <p className="text-sm text-muted">Moves money from your bank to cash. It isn&apos;t spending, so your budget stays the same.</p>
      )}

      <button type="submit" disabled={!amount} className="btn btn-primary w-full py-3">
        {amount ? `Add ${fmt.money(amount)}` : "Add"}
      </button>
    </form>
  );
}
