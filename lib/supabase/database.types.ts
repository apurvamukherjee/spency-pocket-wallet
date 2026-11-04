// Mirrors supabase/migrations. Regenerate with `npx supabase gen types typescript --linked` once linked.

type Table<Row, Required extends keyof Row> = {
  Row: Row;
  Insert: Pick<Row, Required> & Partial<Omit<Row, Required>>;
  Update: Partial<Row>;
  Relationships: [];
};

export type ProfileRow = {
  id: string;
  display_name: string;
  currency: string;
  locale: string;
  time_zone: string;
  theme: "dark" | "light";
  default_envelope_id: string | null;
  created_at: string;
};

export type MonthPlanRow = {
  id: string;
  user_id: string;
  month: string;
  opening_bank: number;
  opening_cash: number;
  balance_at: string;
  target: number;
  salary_amount: number | null;
  salary_date: string | null;
  week_start: number;
  unpaid_bills: string[];
  created_at: string;
};

export type EnvelopeRow = {
  id: string;
  user_id: string;
  name: string;
  weekly_limit: number;
  locked: boolean;
  leftover: "rollover" | "to_flex" | "to_target";
  position: number;
  created_at: string;
};

export type CommitmentRow = {
  id: string;
  user_id: string;
  name: string;
  amount: number;
  frequency: "weekly" | "monthly" | "yearly";
  next_debit: string;
  created_at: string;
};

export type TransactionRow = {
  id: string;
  user_id: string;
  wallet: "bank" | "cash";
  amount: number;
  direction: "debit" | "credit";
  kind: "expense" | "income" | "salary" | "transfer" | "adjustment";
  merchant: string;
  envelope_id: string | null;
  commitment_id: string | null;
  occurred_at: string;
  source: "manual" | "claude" | "import";
  status: "pending" | "confirmed" | "rejected";
  upi_ref: string | null;
  note: string | null;
  created_at: string;
};

export type MerchantMemoryRow = { user_id: string; merchant: string; envelope_id: string | null };

export type ReconcileCheckRow = {
  user_id: string;
  date: string;
  computed: number;
  actual: number;
  resolution: "matched" | "adjusted" | "ignored";
};

/** Returned by app_snapshot(): one month of the caller's data in a single round trip. */
export type Snapshot = {
  profile: ProfileRow | null;
  plan: MonthPlanRow | null;
  envelopes: EnvelopeRow[];
  commitments: CommitmentRow[];
  transactions: TransactionRow[];
  merchant_memory: MerchantMemoryRow[];
  reconcile_checks: ReconcileCheckRow[];
};

export type Database = {
  public: {
    Tables: {
      profiles: Table<ProfileRow, "id">;
      month_plans: Table<MonthPlanRow, "month" | "opening_bank" | "balance_at" | "target">;
      envelopes: Table<EnvelopeRow, "name" | "weekly_limit">;
      commitments: Table<CommitmentRow, "name" | "amount" | "frequency" | "next_debit">;
      transactions: Table<TransactionRow, "wallet" | "amount" | "direction" | "occurred_at">;
      merchant_memory: Table<MerchantMemoryRow, "merchant">;
      reconcile_checks: Table<ReconcileCheckRow, "date" | "computed" | "actual" | "resolution">;
    };
    Views: { [_ in never]: never };
    Functions: {
      app_snapshot: { Args: Record<PropertyKey, never>; Returns: Snapshot };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
