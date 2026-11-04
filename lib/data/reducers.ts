import { defaultEnvelopeId, recallEnvelope, rememberMerchant } from "@/lib/engine/inbox";
import type { ReconcileCheck } from "@/lib/engine/reconcile";
import type { Account, Commitment, Envelope, Txn } from "@/lib/engine/types";
import type { AppData, NewTxn, PlanInput, ProfilePatch, TxnPatch } from "./types";

// Pure transitions shared by demo mode (applied to the local store) and cloud mode (applied optimistically).

const upsert = <T extends { id: string }>(list: T[], item: T) =>
  list.some((x) => x.id === item.id) ? list.map((x) => (x.id === item.id ? item : x)) : [...list, item];

/** Fills defaults; without a picked category it uses merchant memory, then the user's default envelope (not Flex). */
export function buildTxn(d: AppData, t: NewTxn, id: string, now: string): Txn {
  return {
    id,
    kind: "expense",
    direction: "debit",
    commitmentId: null,
    note: null,
    source: "manual",
    status: "confirmed",
    upiRef: null,
    createdAt: now,
    ...t,
    envelopeId:
      t.envelopeId !== undefined || t.commitmentId
        ? (t.envelopeId ?? null)
        : (recallEnvelope(d.memory, t.merchant) ?? defaultEnvelopeId(d.envelopes, d.profile.defaultEnvelopeId)),
  };
}

export const addTxn = (d: AppData, txn: Txn): AppData => ({ ...d, txns: [...d.txns, txn] });

/** Changing to another envelope (or Flex) teaches merchant memory; filing under a bill doesn't. */
export function updateTxn(d: AppData, id: string, patch: TxnPatch): AppData {
  const txn = d.txns.find((t) => t.id === id);
  const memory =
    txn && patch.envelopeId !== undefined && !patch.commitmentId && patch.envelopeId !== txn.envelopeId
      ? rememberMerchant(d.memory, patch.merchant ?? txn.merchant, patch.envelopeId)
      : d.memory;
  return { ...d, memory, txns: d.txns.map((t) => (t.id === id ? { ...t, ...patch } : t)) };
}

export function setStatus(d: AppData, ids: string[], status: Txn["status"]): AppData {
  const set = new Set(ids);
  return { ...d, txns: d.txns.map((t) => (set.has(t.id) ? { ...t, status } : t)) };
}

export const setPlan = (d: AppData, patch: Partial<PlanInput>): AppData =>
  d.plan ? { ...d, plan: { ...d.plan, ...patch } } : d;

export const saveAccounts = (d: AppData, accounts: Account[]): AppData => ({ ...d, accounts });

/** Mirrors the database: payments fall back to the main account, and the opening balance moves with them. */
export function deleteAccount(d: AppData, id: string): AppData {
  const clear = (v: string | null | undefined) => (v === id ? null : v);
  return {
    ...d,
    accounts: d.accounts.filter((a) => a.id !== id),
    plan: d.plan && { ...d.plan, openingAccounts: Object.fromEntries(Object.entries(d.plan.openingAccounts ?? {}).filter(([a]) => a !== id)) },
    txns: d.txns.map((t) => (t.accountId === id || t.toAccountId === id ? { ...t, accountId: clear(t.accountId), toAccountId: clear(t.toAccountId) } : t)),
  };
}

export const saveEnvelope = (d: AppData, e: Envelope): AppData => ({ ...d, envelopes: upsert(d.envelopes, e) });

/** Past spends and merchant mappings fall back to flex rather than vanishing; mirrors the database's set-null keys. */
export function deleteEnvelope(d: AppData, id: string): AppData {
  return {
    ...d,
    profile: d.profile.defaultEnvelopeId === id ? { ...d.profile, defaultEnvelopeId: null } : d.profile,
    envelopes: d.envelopes.filter((e) => e.id !== id),
    txns: d.txns.map((t) => (t.envelopeId === id ? { ...t, envelopeId: null } : t)),
    memory: Object.fromEntries(Object.entries(d.memory).map(([m, e]) => [m, e === id ? null : e])),
  };
}

export const saveCommitment = (d: AppData, c: Commitment): AppData => ({ ...d, commitments: upsert(d.commitments, c) });

/** Mirrors the database: payments keep their history but lose the bill, and it leaves the not-paid-yet list. */
export function deleteCommitment(d: AppData, id: string): AppData {
  return {
    ...d,
    plan: d.plan && {
      ...d.plan,
      unpaidBills: (d.plan.unpaidBills ?? []).filter((b) => b !== id),
      billFunds: Object.fromEntries(Object.entries(d.plan.billFunds ?? {}).filter(([b]) => b !== id)),
    },
    commitments: d.commitments.filter((c) => c.id !== id),
    txns: d.txns.map((t) => (t.commitmentId === id ? { ...t, commitmentId: null } : t)),
  };
}

export const recordCheck = (d: AppData, c: ReconcileCheck): AppData => ({
  ...d,
  checks: [...d.checks.filter((x) => x.date !== c.date), c],
});

export function startMonth(d: AppData, plan: PlanInput, planId: string, envelopes: Envelope[], commitments: Commitment[]): AppData {
  const keep = new Set(envelopes.map((e) => e.id));
  const keepBills = new Set(commitments.map((c) => c.id));
  let next: AppData = d;
  for (const e of d.envelopes) if (!keep.has(e.id)) next = deleteEnvelope(next, e.id);
  for (const c of d.commitments) if (!keepBills.has(c.id)) next = deleteCommitment(next, c.id);
  return { ...next, plan: { ...plan, id: planId }, envelopes, commitments };
}

export const resetAll = (d: AppData): AppData => ({
  ...d,
  plan: null,
  accounts: [],
  envelopes: [],
  commitments: [],
  txns: [],
  memory: {},
  checks: [],
});

export const updateProfile = (d: AppData, patch: ProfilePatch): AppData => ({ ...d, profile: { ...d.profile, ...patch } });
