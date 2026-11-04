"use client";

import { useState } from "react";
import { useActions, useAppData, useFormat, useToday } from "@/lib/data/context";
import type { Category } from "@/lib/data/category";
import { defaultEnvelopeId, recallEnvelope } from "@/lib/engine/inbox";
import type { Wallet } from "@/lib/engine/types";
import { useUI } from "@/lib/ui";
import { CategoryPicker } from "@/components/inbox/CategoryPicker";
import { instantFor, WhenField } from "@/components/inbox/WhenField";
import { Segmented } from "@/components/ui/controls";
import { Sheet } from "@/components/ui/Sheet";

export function QuickAdd() {
  const open = useUI((s) => s.quickAdd);
  const close = useUI((s) => s.closeQuickAdd);
  return (
    <Sheet open={open} onClose={close} title="Add a payment">
      <QuickAddForm onDone={close} />
    </Sheet>
  );
}

type Kind = "spend" | "in" | "withdraw";
/** Refund: back into the envelope (or Flex) it came from. Income: extra money, spent this month or saved. */
type InKind = "refund" | "spend" | "save";

function QuickAddForm({ onDone }: { onDone: () => void }) {
  const { envelopes, commitments, memory, profile } = useAppData();
  const { addTxn } = useActions();
  const fmt = useFormat();
  const today = useToday();

  const [kind, setKind] = useState<Kind>("spend");
  const [amountText, setAmountText] = useState("");
  const [merchant, setMerchant] = useState("");
  const [wallet, setWallet] = useState<Wallet>("bank");
  const [picked, setPicked] = useState<Category | null>(null);
  const [day, setDay] = useState(today);
  const [inKind, setInKind] = useState<InKind>("refund");
  const instant = instantFor(day, today, profile.timeZone);

  const amount = fmt.parse(amountText);
  const remembered = recallEnvelope(memory, merchant);
  const category: Category = picked ?? {
    envelopeId: remembered !== undefined ? remembered : defaultEnvelopeId(envelopes, profile.defaultEnvelopeId),
    commitmentId: null,
  };

  function save(e: React.FormEvent) {
    e.preventDefault();
    if (!amount) return;
    const occurredAt = instantFor(day, today, profile.timeZone);
    const name = merchant.trim();
    if (kind === "withdraw") {
      addTxn({ amount, wallet: "bank", kind: "transfer", merchant: "Cash withdrawal", envelopeId: null, occurredAt });
    } else if (kind === "spend") {
      addTxn({ amount, wallet, merchant: name || "Quick spend", ...category, occurredAt });
    } else if (inKind === "refund") {
      // A refund is negative spending: it goes back where the spend was counted.
      addTxn({ amount, wallet, direction: "credit", merchant: name || "Refund", envelopeId: category.envelopeId, commitmentId: null, occurredAt });
    } else if (inKind === "spend") {
      // Extra money to use this month joins Flex, so safe-to-spend rises and the target stays put.
      addTxn({ amount, wallet, direction: "credit", merchant: name || "Extra income", envelopeId: null, commitmentId: null, occurredAt });
    } else {
      // Saved income isn't spending money; it lifts the month-end balance above the target.
      addTxn({ amount, wallet, direction: "credit", kind: "income", merchant: name || "Extra income", envelopeId: null, occurredAt });
    }
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
          { value: "in", label: "Money in" },
          { value: "withdraw", label: "Withdraw cash" },
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
          <CategoryPicker envelopes={envelopes} bills={commitments} value={category} onChange={setPicked} />
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
      ) : kind === "in" ? (
        <>
          <input className="field" placeholder="From? (optional)" value={merchant} onChange={(e) => setMerchant(e.target.value)} />
          <Segmented<InKind>
            label="What is it"
            value={inKind}
            onChange={setInKind}
            options={[
              { value: "refund", label: "Refund" },
              { value: "spend", label: "Income to spend" },
              { value: "save", label: "Income to save" },
            ]}
          />
          {inKind === "refund" ? (
            <div className="space-y-2">
              <p className="text-xs text-muted">Goes back to</p>
              <CategoryPicker envelopes={envelopes} bills={[]} value={category} onChange={setPicked} />
            </div>
          ) : (
            <p className="text-sm text-muted">
              {inKind === "spend"
                ? "Adds to Flex, so you can spend it this month. Your month-end target stays the same."
                : "Kept out of your spending money, so you end the month above your target."}
            </p>
          )}
          <Segmented<Wallet>
            label="Received into"
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

      <WhenField value={day} onChange={setDay} instant={instant} />

      <button type="submit" disabled={!amount} className="btn btn-primary w-full py-3">
        {amount ? `Add ${fmt.money(amount)}` : "Add"}
      </button>
    </form>
  );
}
