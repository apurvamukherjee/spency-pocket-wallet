/** Integer paise. Never a fraction. */
export type Paise = number;
/** Calendar date in Asia/Kolkata, `YYYY-MM-DD`. */
export type ISODate = string;
/** `YYYY-MM`. */
export type MonthKey = string;

export type Wallet = "bank" | "cash";
export type Direction = "debit" | "credit";
export type TxnStatus = "pending" | "confirmed" | "rejected";
export type TxnSource = "manual" | "claude" | "import";
/**
 * `transfer` moves money from `wallet` to the other wallet (a cash withdrawal is a bank debit transfer).
 * `adjustment` is an unexplained gap logged from reconciliation; it draws on flex like any unplanned spend.
 */
export type TxnKind = "expense" | "income" | "salary" | "transfer" | "adjustment";

export type Txn = {
  id: string;
  wallet: Wallet;
  amount: Paise;
  direction: Direction;
  kind: TxnKind;
  merchant: string;
  /** null and no commitmentId → flex. */
  envelopeId: string | null;
  commitmentId: string | null;
  /** ISO instant with offset. */
  occurredAt: string;
  source: TxnSource;
  status: TxnStatus;
  upiRef: string | null;
  note: string | null;
  createdAt: string;
};

export type LeftoverRule = "rollover" | "to_flex" | "to_target";

export type Envelope = {
  id: string;
  name: string;
  weeklyLimit: Paise;
  locked: boolean;
  leftover: LeftoverRule;
};

export type Frequency = "weekly" | "monthly" | "yearly";

export type Commitment = {
  id: string;
  name: string;
  amount: Paise;
  frequency: Frequency;
  nextDebit: ISODate;
};

export type MonthPlan = {
  month: MonthKey;
  openingBank: Paise;
  openingCash: Paise;
  /** Instant the opening balances were true; only confirmed txns after it move balances. */
  balanceAt: string;
  target: Paise;
  salary: { amount: Paise; date: ISODate } | null;
  /** 0 = Sunday … 6 = Saturday. */
  weekStart: number;
};
