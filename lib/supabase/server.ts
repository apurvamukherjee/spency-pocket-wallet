import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "./database.types";
import { cookieLifetime, REMEMBER_COOKIE } from "./remember";
import { SUPABASE_KEY, SUPABASE_URL, supabaseConfigured, SupabaseNotConfiguredError } from "./env";

/** Per-request client for Server Actions and Route Handlers. Sign-in passes `remember`; everything else reads the cookie. */
export async function supabaseServer(remember?: boolean) {
  if (!supabaseConfigured) throw new SupabaseNotConfiguredError();
  const store = await cookies();
  const keep = remember ?? store.get(REMEMBER_COOKIE)?.value === "1";
  return createServerClient<Database>(SUPABASE_URL, SUPABASE_KEY, {
    cookies: {
      getAll: () => store.getAll(),
      setAll(toSet) {
        try {
          toSet.forEach(({ name, value, options }) => store.set(name, value, cookieLifetime(options, keep)));
        } catch {
          // Server Components can't write cookies; proxy.ts refreshes the session on the next request instead.
        }
      },
    },
  });
}
