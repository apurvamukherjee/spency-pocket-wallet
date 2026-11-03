"use client";

import { useState } from "react";
import { formatINR, parseRupees } from "@/lib/engine/money";
import type { Txn, Wallet } from "@/lib/engine/types";
import { useData } from "@/lib/hooks";
import { useSpency } from "@/lib/store";
import { useUI } from "@/lib/ui";
import { Segmented } from "@/components/ui/controls";
import { Sheet } from "@/components/ui/Sheet";
import { CategoryPicker } from "./CategoryPicker";

export function EditTxnSheet() {
  const id = useUI((s) => s.editing);
  const edit = useUI((s) => s.edit);
  const txn = useData().txns.find((t) => t.id === id);
  return (
    <Sheet open={!!txn} onClose={() => edit(null)} title={txn?.status === "pending" ? "Review payment" : "Edit payment"}>
      {txn && <EditForm key={txn.id} txn={txn} onDone={() => edit(null)} />}
    </Sheet>
  );
}

function EditForm({ txn, onDone }: { txn: Txn; onDone: () => void }) {
  const { envelopes } = useData();
  const updateTxn = useSpency((s) => s.updateTxn);
  const setStatus = useSpency((s) => s.setStatus);

  const [amountText, setAmountText] = useState(String(txn.amount / 100));
  const [merchant, setMerchant] = useState(txn.merchant);
  const [envelopeId, setEnvelopeId] = useState(txn.envelopeId);
  const [wallet, setWallet] = useState<Wallet>(txn.wallet);
  const amount = parseRupees(amountText);
  const pending = txn.status === "pending";

  function save(status?: Txn["status"]) {
    if (!amount) return;
    updateTxn(txn.id, { amount, merchant: merchant.trim() || txn.merchant, envelopeId, wallet });
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
          <span className="label">Amount (₹)</span>
          <input className="field tabular-nums" inputMode="decimal" value={amountText} onChange={(e) => setAmountText(e.target.value)} />
        </label>
      </div>
      <div className="space-y-2">
        <span className="label">Category</span>
        <CategoryPicker envelopes={envelopes} value={envelopeId} onChange={setEnvelopeId} />
        {envelopeId !== txn.envelopeId && (
          <p className="text-xs text-faint">Future payments to {merchant || "this merchant"} will go here too.</p>
        )}
      </div>
      <Segmented<Wallet>
        label="Paid from"
        value={wallet}
        onChange={setWallet}
        options={[
          { value: "bank", label: "Bank / UPI" },
          { value: "cash", label: "Cash" },
        ]}
      />
      {txn.upiRef && <p className="text-xs text-faint">UPI ref {txn.upiRef}</p>}
      <div className="flex gap-3">
        {pending ? (
          <>
            <button type="button" onClick={() => save("rejected")} className="btn btn-ghost flex-1">
              Dismiss
            </button>
            <button type="submit" disabled={!amount} className="btn btn-primary flex-[2]">
              Confirm {amount ? formatINR(amount) : ""}
            </button>
          </>
        ) : (
          <button type="submit" disabled={!amount} className="btn btn-primary w-full">
            Save
          </button>
        )}
      </div>
    </form>
  );
}
