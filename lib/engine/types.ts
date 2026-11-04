/** Integer paise. Never a fraction. */
export type Minor = number;
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
  amount: Minor;
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
  weeklyLimit: Minor;
  locked: boolean;
  leftover: LeftoverRule;
};

export type Frequency = "weekly" | "monthly" | "yearly";

export type Commitment = {
  id: string;
  name: string;
  amount: Minor;
  frequency: Frequency;
  nextDebit: ISODate;
};

export type MonthPlan = {
  /** The period's key: the month it ends in (see periodContaining). */
  month: MonthKey;
  /** Day of the month the period starts on: 1 = calendar month, e.g. 25 for paid on the 25th. Default 1. */
  startDay?: number;
  /** ISO 4217, e.g. "INR", "USD". Decides the minor unit used for rounding. */
  currency: string;
  /** IANA zone, e.g. "Asia/Kolkata". Decides which calendar day a payment falls on. */
  timeZone: string;
  openingBank: Minor;
  openingCash: Minor;
  /** Instant the opening balances were true; only confirmed txns after it move balances. */
  balanceAt: string;
  target: Minor;
  salary: { amount: Minor; date: ISODate } | null;
  /** 0 = Sunday … 6 = Saturday. */
  weekStart: number;
  /**
   * Bills whose payment earlier this month (before the starting balance) hasn't actually gone out yet.
   * By default such a payment is assumed to be inside the starting balance.
   */
  unpaidBills?: string[];
  /**
   * Yearly bills are saved for month by month. Per bill id: what was already put aside for it when this plan
   * started. That money is inside the opening balance but isn't spendable.
   */
  billFunds?: Record<string, Minor>;
};
