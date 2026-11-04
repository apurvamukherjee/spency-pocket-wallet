import type { PostgrestError } from "@supabase/supabase-js";
import type { Supabase } from "@/lib/supabase/client";
import type { Snapshot } from "@/lib/supabase/database.types";
import * as rows from "./rows";
import type { AppData } from "./types";

// Shared by the browser (cloud provider) and the server (MCP tools). Pass a client authenticated as the user;
// row level security limits every query to their rows.

export type User = { id: string; email: string | null };
export type Result = { error: PostgrestError | null };

const DAY_MS = 86_400_000;

class EmptyResponseError extends Error {
  override name = "EmptyResponseError";
}

export function ok(res: Result): void {
  if (res.error) throw res.error;
}

export function maybe<T>(res: { data: T | null; error: PostgrestError | null }): T | null {
  ok(res);
  return res.data;
}

export function must<T>(res: { data: T | null; error: PostgrestError | null }): T {
  const data = maybe(res);
  if (data === null) throw new EmptyResponseError("Supabase returned no data");
  return data;
}

/** Not deployed yet (migration pending): fall back to separate queries rather than failing. */
const MISSING_FUNCTION = new Set(["PGRST202", "42883"]);

/** One round trip via app_snapshot(); falls back to the per-table queries if that function isn't deployed. */
export async function fetchAppData(sb: Supabase, user: User): Promise<AppData> {
  const res = await sb.rpc("app_snapshot");
  if (res.error && MISSING_FUNCTION.has(res.error.code)) {
    console.warn("app_snapshot() missing; apply the latest migration. Using separate queries.");
    return fetchAppDataSlow(sb, user);
  }
  return fromSnapshot(must(res), user);
}

export function fromSnapshot(s: Snapshot, user: User): AppData {
  if (!s.profile) throw new EmptyResponseError("No profile for this user");
  return {
    profile: rows.profileFromRow(s.profile, user.email),
    plan: s.plan && rows.planFromRow(s.plan),
    accounts: (s.accounts ?? []).map(rows.accountFromRow),
    envelopes: s.envelopes.map(rows.envelopeFromRow),
    commitments: s.commitments.map(rows.commitmentFromRow),
    txns: s.transactions.map(rows.txnFromRow),
    memory: Object.fromEntries(s.merchant_memory.map((m) => [m.merchant, m.envelope_id])),
    checks: s.reconcile_checks.map(rows.checkFromRow),
  };
}

// The pre-app_snapshot path: six queries, then transactions once the plan is known.
async function fetchAppDataSlow(sb: Supabase, user: User): Promise<AppData> {
  const [profile, plan, accounts, envelopes, commitments, memory, checks] = await Promise.all([
    sb.from("profiles").select("*").eq("id", user.id).single().then(must),
    sb.from("month_plans").select("*").order("month", { ascending: false }).limit(1).maybeSingle().then(maybe),
    // Before the accounts migration the table doesn't exist; carry on with one unnamed account.
    sb.from("accounts").select("*").order("position").order("created_at").then((r) => (r.error ? [] : (r.data ?? []))),
    sb.from("envelopes").select("*").order("position").order("created_at").then(must),
    sb.from("commitments").select("*").order("created_at").then(must),
    sb.from("merchant_memory").select("*").then(must),
    sb.from("reconcile_checks").select("*").order("date", { ascending: false }).limit(60).then(must),
  ]);
  // From a week before the plan (its partial first week) or four weeks back (pattern detection), whichever is
  // earlier; pending items always come along.
  const since = new Date(Math.min(plan ? Date.parse(plan.balance_at) - 8 * DAY_MS : Infinity, Date.now() - 29 * DAY_MS)).toISOString();
  const transactions = must(
    await sb.from("transactions").select("*").or(`status.eq.pending,occurred_at.gte."${since}"`).order("occurred_at"),
  );
  return fromSnapshot(
    { profile, plan, accounts, envelopes, commitments, transactions, merchant_memory: memory, reconcile_checks: checks },
    user,
  );
}
