"use client";

import { useState } from "react";
import { useActions, useAppData, useFormat } from "@/lib/data/context";
import type { Txn, Wallet } from "@/lib/engine/types";
import { useUI } from "@/lib/ui";
import { Segmented } from "@/components/ui/controls";
import { Sheet } from "@/components/ui/Sheet";
import type { Category } from "@/lib/data/category";
import { CategoryPicker } from "./CategoryPicker";

export function EditTxnSheet() {
  const id = useUI((s) => s.editing);
  const edit = useUI((s) => s.edit);
  const txn = useAppData().txns.find((t) => t.id === id);
  return (
    <Sheet open={!!txn} onClose={() => edit(null)} title={txn?.status === "pending" ? "Review payment" : "Edit payment"}>
      {txn && <EditForm key={txn.id} txn={txn} onDone={() => edit(null)} />}
    </Sheet>
  );
}

function EditForm({ txn, onDone }: { txn: Txn; onDone: () => void }) {
  const { envelopes, commitments } = useAppData();
  const { updateTxn, setStatus } = useActions();
  const fmt = useFormat();

  const [amountText, setAmountText] = useState(fmt.input(txn.amount));
  const [merchant, setMerchant] = useState(txn.merchant);
  const [category, setCategory] = useState<Category>({ envelopeId: txn.envelopeId, commitmentId: txn.commitmentId });
  const [wallet, setWallet] = useState<Wallet>(txn.wallet);
  const amount = fmt.parse(amountText);
  const pending = txn.status === "pending";

  function save(status?: Txn["status"]) {
    if (!amount) return;
    updateTxn(txn.id, { amount, merchant: merchant.trim() || txn.merchant, ...category, wallet });
    if (status) setStatus([txn.id], status);
    onDone();
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save(pending ? "confirmed" : undefined);
      }}
      className="space-y-5"
    >
      <div className="grid grid-cols-[1fr_8rem] gap-3">
        <label className="space-y-1.5">
          <span className="label">Merchant</span>
          <input className="field" value={merchant} onChange={(e) => setMerchant(e.target.value)} />
        </label>
        <label className="space-y-1.5">
          <span className="label">Amount</span>
          <input className="field tabular-nums" inputMode="decimal" value={amountText} onChange={(e) => setAmountText(e.target.value)} />
        </label>
      </div>
      <div className="space-y-2">
        <span className="label">Category</span>
        <CategoryPicker envelopes={envelopes} bills={commitments} value={category} onChange={setCategory} />
        {category.commitmentId && category.commitmentId !== txn.commitmentId && (
          <p className="text-xs text-faint">Counts as paying this bill for the month.</p>
        )}
        {!category.commitmentId && category.envelopeId !== txn.envelopeId && (
          <p className="text-xs text-faint">Future payments to {merchant || "this merchant"} will go here too.</p>
        )}
      </div>
      <Segmented<Wallet>
        label="Paid from"
        value={wallet}
        onChange={setWallet}
        options={[
          { value: "bank", label: "Bank / card" },
          { value: "cash", label: "Cash" },
        ]}
      />
      {txn.upiRef && <p className="text-xs text-faint">Reference {txn.upiRef}</p>}
      <div className="flex gap-3">
        {pending ? (
          <>
            <button type="button" onClick={() => save("rejected")} className="btn btn-ghost flex-1">
              Dismiss
            </button>
            <button type="submit" disabled={!amount} className="btn btn-primary flex-[2]">
              Confirm {amount ? fmt.money(amount) : ""}
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => {
                setStatus([txn.id], "rejected");
                onDone();
              }}
              className="btn btn-ghost text-bad"
            >
              Remove
            </button>
            <button type="submit" disabled={!amount} className="btn btn-primary flex-1">
              Save
            </button>
          </>
        )}
      </div>
    </form>
  );
}
