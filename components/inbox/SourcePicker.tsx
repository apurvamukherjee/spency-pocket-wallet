"use client";

import type { Account, Wallet } from "@/lib/engine/types";
import { Chip, Segmented } from "@/components/ui/controls";

/** Where money came from or went: cash, or a bank account (null = the main one). */
export type Source = { wallet: Wallet; accountId: string | null };

/**
 * One bank account: the familiar Bank / Cash switch. Several: a chip per account plus Cash.
 * `label` names the group for screen readers ("Paid from", "Received into").
 */
export function SourcePicker({
  accounts,
  value,
  onChange,
  label,
}: {
  accounts: Account[];
  value: Source;
  onChange: (s: Source) => void;
  label: string;
}) {
  if (accounts.length <= 1) {
    return (
      <Segmented<Wallet>
        label={label}
        value={value.wallet}
        onChange={(wallet) => onChange({ wallet, accountId: null })}
        options={[
          { value: "bank", label: "Bank / card" },
          { value: "cash", label: "Cash" },
        ]}
      />
    );
  }
  const main = accounts[0].id;
  const current = value.wallet === "cash" ? "cash" : (value.accountId ?? main);
  return (
    <div className="space-y-1.5">
      <p className="text-xs text-muted">{label}</p>
      <div role="group" aria-label={label} className="flex flex-wrap gap-2">
        {accounts.map((a) => (
          <Chip key={a.id} active={current === a.id} onClick={() => onChange({ wallet: "bank", accountId: a.id === main ? null : a.id })}>
            {a.name}
          </Chip>
        ))}
        <Chip active={current === "cash"} onClick={() => onChange({ wallet: "cash", accountId: null })}>
          Cash
        </Chip>
      </div>
    </div>
  );
}

/** "Savings" for a payment from that account; null for the main account, cash, or a single account. */
export function accountLabel(accounts: Account[], t: { wallet: Wallet; accountId?: string | null }): string | null {
  if (t.wallet !== "bank" || accounts.length <= 1 || !t.accountId || t.accountId === accounts[0].id) return null;
  return accounts.find((a) => a.id === t.accountId)?.name ?? null;
}
