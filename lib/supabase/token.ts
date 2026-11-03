import type { AuthInfo } from "@modelcontextprotocol/server";
import { createClient } from "@supabase/supabase-js";
import type { Supabase } from "./client";
import type { Database } from "./database.types";
import { SUPABASE_KEY, SUPABASE_URL, supabaseConfigured, SupabaseNotConfiguredError } from "./env";

/** A client that acts as the token's user, so row level security applies to every query. */
export function supabaseAs(token: string): Supabase {
  if (!supabaseConfigured) throw new SupabaseNotConfiguredError();
  return createClient<Database>(SUPABASE_URL, SUPABASE_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

/**
 * Verifies a Supabase access token (including ones issued to Claude by the OAuth server).
 * undefined → the MCP route answers 401 with a pointer to the authorization server.
 */
export async function verifyAccessToken(_req: Request, token?: string): Promise<AuthInfo | undefined> {
  if (!token || !supabaseConfigured) return undefined;
  const { data, error } = await supabaseAs(token).auth.getClaims(token);
  if (error || !data) {
    console.warn("MCP token rejected", error?.message);
    return undefined;
  }
  const c = data.claims;
  if (c.role !== "authenticated") return undefined;
  const clientId: unknown = c["client_id"];
  const scope: unknown = c["scope"];
  return {
    token,
    clientId: typeof clientId === "string" ? clientId : "supabase-session",
    scopes: typeof scope === "string" ? scope.split(" ").filter(Boolean) : [],
    expiresAt: c.exp,
    extra: { userId: c.sub, email: c.email ?? null },
  };
}
