import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { SUPABASE_KEY, SUPABASE_URL, supabaseConfigured, SupabaseNotConfiguredError } from "./env";

export type Supabase = SupabaseClient<Database>;

let browser: Supabase | null = null;

/** One browser client per tab; the session lives in cookies shared with the server. */
export function supabaseBrowser(): Supabase {
  if (!supabaseConfigured) throw new SupabaseNotConfiguredError();
  browser ??= createBrowserClient<Database>(SUPABASE_URL, SUPABASE_KEY);
  return browser;
}
