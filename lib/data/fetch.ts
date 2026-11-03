import type { PostgrestError } from "@supabase/supabase-js";
import type { Supabase } from "@/lib/supabase/client";
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

// ponytail: one round trip for everything a month needs; paginate transactions if a month ever passes 1,000.
export async function fetchAppData(sb: Supabase, user: User): Promise<AppData> {
  const [profile, plan, envelopes, commitments, memory, checks] = await Promise.all([
    sb.from("profiles").select("*").eq("id", user.id).single().then(must),
    sb.from("month_plans").select("*").order("month", { ascending: false }).limit(1).maybeSingle().then(maybe),
    sb.from("envelopes").select("*").order("position").order("created_at").then(must),
    sb.from("commitments").select("*").order("created_at").then(must),
    sb.from("merchant_memory").select("*").then(must),
    sb.from("reconcile_checks").select("*").order("date", { ascending: false }).limit(60).then(must),
  ]);
  // From a week before the plan (its partial first week) or four weeks back (pattern detection), whichever is
  // earlier; pending items always come along.
  const since = new Date(Math.min(plan ? Date.parse(plan.balance_at) - 8 * DAY_MS : Infinity, Date.now() - 29 * DAY_MS)).toISOString();
  const txns = must(
    await sb.from("transactions").select("*").or(`status.eq.pending,occurred_at.gte."${since}"`).order("occurred_at"),
  );
  return {
    profile: rows.profileFromRow(profile, user.email),
    plan: plan && rows.planFromRow(plan),
    envelopes: envelopes.map(rows.envelopeFromRow),
    commitments: commitments.map(rows.commitmentFromRow),
    txns: txns.map(rows.txnFromRow),
    memory: Object.fromEntries(memory.map((m) => [m.merchant, m.envelope_id])),
    checks: checks.map(rows.checkFromRow),
  };
}

