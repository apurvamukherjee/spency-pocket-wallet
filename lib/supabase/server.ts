import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "./database.types";
import { SUPABASE_KEY, SUPABASE_URL, supabaseConfigured, SupabaseNotConfiguredError } from "./env";

/** Per-request client for Server Actions and Route Handlers. */
export async function supabaseServer() {
  if (!supabaseConfigured) throw new SupabaseNotConfiguredError();
  const store = await cookies();
  return createServerClient<Database>(SUPABASE_URL, SUPABASE_KEY, {
    cookies: {
      getAll: () => store.getAll(),
      setAll(toSet) {
        try {
          toSet.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // Server Components can't write cookies; proxy.ts refreshes the session on the next request instead.
        }
      },
    },
  });
}
