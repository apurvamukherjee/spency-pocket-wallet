"use client";

import { useState } from "react";
import { useActions, useAppData, useFormat, useToday } from "@/lib/data/context";
import type { Category } from "@/lib/data/category";
import { defaultEnvelopeId, recallEnvelope } from "@/lib/engine/inbox";
import { useUI } from "@/lib/ui";
import { CategoryPicker } from "@/components/inbox/CategoryPicker";
import { type Source, SourcePicker } from "@/components/inbox/SourcePicker";
import { instantFor, WhenField } from "@/components/inbox/WhenField";
import { Chip, Segmented } from "@/components/ui/controls";
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
  const { envelopes, commitments, memory, profile, accounts } = useAppData();
  const { addTxn } = useActions();
  const fmt = useFormat();
  const today = useToday();

  const [kind, setKind] = useState<Kind>("spend");
  const [amountText, setAmountText] = useState("");
  const [merchant, setMerchant] = useState("");
  const [source, setSource] = useState<Source>({ wallet: "bank", accountId: null });
  // Moving money: from a bank account (null = main) to cash or another account.
  const [moveFrom, setMoveFrom] = useState<string | null>(null);
  const [moveTo, setMoveTo] = useState<string>("cash");
  const several = accounts.length > 1;
  const mainId = accounts[0]?.id ?? null;
  const fromId = moveFrom ?? mainId;
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
    const wallet = source.wallet;
    const via = { wallet, accountId: wallet === "bank" ? source.accountId : null };
    if (kind === "withdraw") {
      const toAccount = moveTo === "cash" ? null : moveTo;
      const from = fromId === mainId ? null : fromId;
      addTxn({
        amount,
        wallet: "bank",
        kind: "transfer",
        accountId: from,
        toAccountId: toAccount,
        merchant: toAccount ? `To ${accounts.find((a) => a.id === toAccount)?.name ?? "account"}` : "Cash withdrawal",
        envelopeId: null,
        occurredAt,
      });
    } else if (kind === "spend") {
      addTxn({ amount, ...via, merchant: name || "Quick spend", ...category, occurredAt });
    } else if (inKind === "refund") {
      // A refund is negative spending: it goes back where the spend was counted.
      addTxn({
        amount,
        ...via,
        direction: "credit",
        merchant: name || "Refund",
        envelopeId: category.envelopeId,
        commitmentId: null,
        occurredAt,
      });
    } else if (inKind === "spend") {
      // Extra money to use this month joins Flex, so safe-to-spend rises and the target stays put.
      addTxn({ amount, ...via, direction: "credit", merchant: name || "Extra income", envelopeId: null, commitmentId: null, occurredAt });
    } else {
      // Saved income isn't spending money; it lifts the month-end balance above the target.
      addTxn({ amount, ...via, direction: "credit", kind: "income", merchant: name || "Extra income", envelopeId: null, occurredAt });
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
          { value: "withdraw", label: several ? "Move" : "Withdraw" },
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
          <SourcePicker accounts={accounts} label="Paid from" value={source} onChange={setSource} />
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
              { value: "spend", label: "To spend" },
              { value: "save", label: "To save" },
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
                ? "Extra income. Adds to Flex, so you can spend it this month. Your month-end target stays the same."
                : "Extra income. Kept out of your spending money, so you end the month above your target."}
            </p>
          )}
          <SourcePicker accounts={accounts} label="Received into" value={source} onChange={setSource} />
        </>
      ) : several ? (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <p className="text-xs text-muted">From</p>
            <div role="group" aria-label="From" className="flex flex-wrap gap-2">
              {accounts.map((a) => (
                <Chip
                  key={a.id}
                  active={fromId === a.id}
                  onClick={() => {
                    setMoveFrom(a.id);
                    if (moveTo === a.id) setMoveTo("cash");
                  }}
                >
                  {a.name}
                </Chip>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <p className="text-xs text-muted">To</p>
            <div role="group" aria-label="To" className="flex flex-wrap gap-2">
              <Chip active={moveTo === "cash"} onClick={() => setMoveTo("cash")}>
                Cash
              </Chip>
              {accounts
                .filter((a) => a.id !== fromId)
                .map((a) => (
                  <Chip key={a.id} active={moveTo === a.id} onClick={() => setMoveTo(a.id)}>
                    {a.name}
                  </Chip>
                ))}
            </div>
          </div>
          <p className="text-sm text-muted">Moving your own money isn&apos;t spending, so your budget stays the same.</p>
        </div>
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
