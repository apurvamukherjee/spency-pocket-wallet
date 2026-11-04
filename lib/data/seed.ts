import "server-only";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseConfigured } from "@/lib/supabase/env";
import { fetchAppData, type User } from "./fetch";
import type { AppData } from "./types";

/** The signed-in user's month, loaded while the page renders so the first HTML already shows their numbers. */
export type Seed = { user: User; data: AppData };

/**
 * Server-side first load. null whenever it can't help (no backend, signed out, or the query failed): the browser
 * then decides demo vs sign-in and loads data itself, exactly as before.
 */
export async function loadSeed(): Promise<Seed | null> {
  if (!supabaseConfigured) return null;
  try {
    const sb = await supabaseServer();
    // getClaims verifies the JWT, so the id can be trusted; row level security guards the query either way.
    const { data: auth, error } = await sb.auth.getClaims();
    if (error || !auth || auth.claims.role !== "authenticated") return null;
    const user: User = { id: auth.claims.sub, email: typeof auth.claims.email === "string" ? auth.claims.email : null };
    return { user, data: await fetchAppData(sb, user) };
  } catch (e) {
    console.error("Server first load failed; the browser will load instead", e);
    return null;
  }
}
