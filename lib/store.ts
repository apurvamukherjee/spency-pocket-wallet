import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { SpencyData } from "./engine/derive";
import { recallEnvelope, rememberMerchant, type MerchantMemory } from "./engine/inbox";
import type { ReconcileCheck } from "./engine/reconcile";
import type { Commitment, Envelope, MonthPlan, Txn } from "./engine/types";
import { seedData } from "./seed";

export type NewTxn = Pick<Txn, "amount" | "wallet" | "merchant" | "occurredAt"> &
  Partial<Pick<Txn, "kind" | "direction" | "envelopeId" | "commitmentId" | "note" | "source" | "status" | "upiRef">>;

export type TxnPatch = Partial<Pick<Txn, "amount" | "merchant" | "envelopeId" | "wallet" | "note">>;

type State = {
  data: SpencyData | null;
  memory: MerchantMemory;
  checks: ReconcileCheck[];
  seedDemo: (today: string) => void;
  startFresh: (plan: MonthPlan, envelopes: Envelope[], commitments: Commitment[]) => void;
  addTxn: (t: NewTxn) => void;
  updateTxn: (id: string, patch: TxnPatch) => void;
  setStatus: (ids: string[], status: Txn["status"]) => void;
  setPlan: (patch: Partial<MonthPlan>) => void;
  saveEnvelope: (e: Envelope) => void;
  deleteEnvelope: (id: string) => void;
  saveCommitment: (c: Commitment) => void;
  deleteCommitment: (id: string) => void;
  recordCheck: (c: ReconcileCheck) => void;
};

export class StoreNotReadyError extends Error {
  override name = "StoreNotReadyError";
}

const upsert = <T extends { id: string }>(list: T[], item: T) =>
  list.some((x) => x.id === item.id) ? list.map((x) => (x.id === item.id ? item : x)) : [...list, item];

// ponytail: Phase 1 keeps everything in localStorage; Phase 2 moves server data to Supabase + TanStack Query.
export const useSpency = create<State>()(
  persist(
    (set, get) => {
      const withData = (fn: (d: SpencyData) => SpencyData) => {
        const d = get().data;
        if (!d) throw new StoreNotReadyError("Spency data is not loaded yet");
        set({ data: fn(d) });
      };
      return {
        data: null,
        memory: {},
        checks: [],

        seedDemo: (today) => set({ ...seedData(today), checks: [] }),

        startFresh: (plan, envelopes, commitments) =>
          set({ data: { plan, envelopes, commitments, txns: [] }, memory: {}, checks: [] }),

        addTxn: (t) => {
          const remembered = recallEnvelope(get().memory, t.merchant);
          withData((d) => ({
            ...d,
            txns: [
              ...d.txns,
              {
                id: crypto.randomUUID(),
                kind: "expense",
                direction: "debit",
                envelopeId: t.envelopeId === undefined ? (remembered ?? null) : t.envelopeId,
                commitmentId: null,
                note: null,
                source: "manual",
                status: "confirmed",
                upiRef: null,
                createdAt: new Date().toISOString(),
                ...t,
              },
            ],
          }));
        },

        updateTxn: (id, patch) => {
          const txn = get().data?.txns.find((t) => t.id === id);
          if (txn && patch.envelopeId !== undefined && patch.envelopeId !== txn.envelopeId) {
            set({ memory: rememberMerchant(get().memory, patch.merchant ?? txn.merchant, patch.envelopeId) });
          }
          withData((d) => ({ ...d, txns: d.txns.map((t) => (t.id === id ? { ...t, ...patch } : t)) }));
        },

        setStatus: (ids, status) => {
          const set_ = new Set(ids);
          withData((d) => ({ ...d, txns: d.txns.map((t) => (set_.has(t.id) ? { ...t, status } : t)) }));
        },

        setPlan: (patch) => withData((d) => ({ ...d, plan: { ...d.plan, ...patch } })),

        saveEnvelope: (e) => withData((d) => ({ ...d, envelopes: upsert(d.envelopes, e) })),

        // Past spends from a deleted envelope fall back to flex rather than vanishing from the budget.
        deleteEnvelope: (id) =>
          withData((d) => ({
            ...d,
            envelopes: d.envelopes.filter((e) => e.id !== id),
            txns: d.txns.map((t) => (t.envelopeId === id ? { ...t, envelopeId: null } : t)),
          })),

        saveCommitment: (c) => withData((d) => ({ ...d, commitments: upsert(d.commitments, c) })),

        deleteCommitment: (id) =>
          withData((d) => ({
            ...d,
            commitments: d.commitments.filter((c) => c.id !== id),
            txns: d.txns.map((t) => (t.commitmentId === id ? { ...t, commitmentId: null } : t)),
          })),

        recordCheck: (c) => set({ checks: [...get().checks.filter((x) => x.date !== c.date), c] }),
      };
    },
    {
      name: "spency-v1",
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
      partialize: ({ data, memory, checks }) => ({ data, memory, checks }),
    },
  ),
);
