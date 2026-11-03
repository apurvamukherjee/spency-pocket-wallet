import { createBrowserClient, parseCookieHeader, serializeCookieHeader } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { cookieLifetime, REMEMBER_COOKIE } from "./remember";
import { SUPABASE_KEY, SUPABASE_URL, supabaseConfigured, SupabaseNotConfiguredError } from "./env";

export type Supabase = SupabaseClient<Database>;

let browser: Supabase | null = null;

/** One browser client per tab; the session lives in cookies shared with the server. */
export function supabaseBrowser(): Supabase {
  if (!supabaseConfigured) throw new SupabaseNotConfiguredError();
  // Token refreshes in the tab rewrite the session cookie, so the browser needs the same lifetime rule as the server.
  browser ??= createBrowserClient<Database>(SUPABASE_URL, SUPABASE_KEY, {
    cookies: {
      getAll: () => parseCookieHeader(document.cookie).map(({ name, value }) => ({ name, value: value ?? "" })),
      setAll(toSet) {
        const remember = parseCookieHeader(document.cookie).some((c) => c.name === REMEMBER_COOKIE && c.value === "1");
        toSet.forEach(({ name, value, options }) => {
          document.cookie = serializeCookieHeader(name, value, cookieLifetime(options, remember));
        });
      },
    },
  });
  return browser;
}
