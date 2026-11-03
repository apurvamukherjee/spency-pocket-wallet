import type { MerchantMemory } from "@/lib/engine/inbox";
import type { ReconcileCheck } from "@/lib/engine/reconcile";
import type { Commitment, Envelope, MonthPlan, Txn } from "@/lib/engine/types";

export type Theme = "dark" | "light";

export type Profile = {
  displayName: string;
  /** null in demo mode. */
  email: string | null;
  currency: string;
  locale: string;
  timeZone: string;
  theme: Theme;
};

/** A month plan as stored; currency and time zone come from the profile at read time. */
export type StoredPlan = Omit<MonthPlan, "currency" | "timeZone"> & { id: string };
export type PlanInput = Omit<StoredPlan, "id">;

export type AppData = {
  profile: Profile;
  /** Latest plan, or null before the first onboarding. May belong to a past month. */
  plan: StoredPlan | null;
  envelopes: Envelope[];
  commitments: Commitment[];
  txns: Txn[];
  memory: MerchantMemory;
  checks: ReconcileCheck[];
};

export type NewTxn = Pick<Txn, "amount" | "wallet" | "merchant" | "occurredAt"> &
  Partial<Pick<Txn, "kind" | "direction" | "envelopeId" | "commitmentId" | "note" | "source" | "status" | "upiRef">>;

export type TxnPatch = Partial<Pick<Txn, "amount" | "merchant" | "envelopeId" | "wallet" | "note">>;

export type ProfilePatch = Partial<Omit<Profile, "email">>;

/** Everything the UI can change. Cloud applies these optimistically and syncs in the background. */
export type Actions = {
  addTxn: (t: NewTxn) => void;
  updateTxn: (id: string, patch: TxnPatch) => void;
  setStatus: (ids: string[], status: Txn["status"]) => void;
  setPlan: (patch: Partial<PlanInput>) => void;
  saveEnvelope: (e: Envelope) => void;
  deleteEnvelope: (id: string) => void;
  saveCommitment: (c: Commitment) => void;
  deleteCommitment: (id: string) => void;
  recordCheck: (c: ReconcileCheck) => void;
  /** Creates (or replaces) this month's plan and the full envelope and bill lists. */
  startMonth: (plan: PlanInput, envelopes: Envelope[], commitments: Commitment[]) => Promise<void>;
  updateProfile: (patch: ProfilePatch) => void;
  /** Deletes every transaction, envelope, bill, plan, memory and check. Keeps the account and profile. */
  resetAll: () => Promise<void>;
};
