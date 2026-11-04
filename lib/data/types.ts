import type { MerchantMemory } from "@/lib/engine/inbox";
import type { ReconcileCheck } from "@/lib/engine/reconcile";
import type { Account, Commitment, Envelope, MonthPlan, Txn } from "@/lib/engine/types";

export type Theme = "dark" | "light";

export type Profile = {
  displayName: string;
  /** null in demo mode. */
  email: string | null;
  currency: string;
  locale: string;
  timeZone: string;
  theme: Theme;
  /** Envelope for payments nothing else places; unset → "Small stuff", then Flex. */
  defaultEnvelopeId?: string | null;
};

/** A month plan as stored; currency and time zone come from the profile at read time. */
export type StoredPlan = Omit<MonthPlan, "currency" | "timeZone"> & { id: string };
export type PlanInput = Omit<StoredPlan, "id">;

export type AppData = {
  profile: Profile;
  /** Latest plan, or null before the first onboarding. May belong to a past month. */
  plan: StoredPlan | null;
  /** Bank accounts, main one first. Empty means one unnamed bank account. */
  accounts: Account[];
  envelopes: Envelope[];
  commitments: Commitment[];
  txns: Txn[];
  memory: MerchantMemory;
  checks: ReconcileCheck[];
};

export type NewTxn = Pick<Txn, "amount" | "wallet" | "merchant" | "occurredAt"> &
  Partial<Pick<Txn, "kind" | "direction" | "envelopeId" | "commitmentId" | "note" | "source" | "status" | "upiRef" | "accountId" | "toAccountId">>;

export type TxnPatch = Partial<
  Pick<Txn, "amount" | "merchant" | "envelopeId" | "commitmentId" | "wallet" | "note" | "occurredAt" | "direction" | "accountId">
>;

export type ProfilePatch = Partial<Omit<Profile, "email">>;

/** Everything the UI can change. Cloud applies these optimistically and syncs in the background. */
export type Actions = {
  addTxn: (t: NewTxn) => void;
  updateTxn: (id: string, patch: TxnPatch) => void;
  setStatus: (ids: string[], status: Txn["status"]) => void;
  setPlan: (patch: Partial<PlanInput>) => void;
  /** Adds or renames accounts; the list order is kept, main account first. */
  saveAccounts: (accounts: Account[]) => void;
  /** Its payments move to the main account. */
  deleteAccount: (id: string) => void;
  saveEnvelope: (e: Envelope) => void;
  deleteEnvelope: (id: string) => void;
  saveCommitment: (c: Commitment) => void;
  deleteCommitment: (id: string) => void;
  recordCheck: (c: ReconcileCheck) => void;
  /** Creates (or replaces) this month's plan and the full envelope and bill lists. */
  startMonth: (plan: PlanInput, envelopes: Envelope[], commitments: Commitment[]) => Promise<void>;
  updateProfile: (patch: ProfilePatch) => void;
  /** Deletes every transaction, bank account, envelope, bill, plan, memory and check. Keeps the login and profile. */
  resetAll: () => Promise<void>;
};
