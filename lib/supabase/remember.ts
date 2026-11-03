import type { CookieOptions } from "@supabase/ssr";

export const REMEMBER_COOKIE = "spency-remember";
export const REMEMBER_SECONDS = 30 * 24 * 60 * 60;

/**
 * @supabase/ssr hard-codes a 400-day cookie. Cap it at 30 days when the user asked to be remembered, otherwise make it
 * a browser-session cookie so closing the browser signs them out. Removals (maxAge 0) pass through untouched.
 */
export function cookieLifetime(options: CookieOptions, remember: boolean): CookieOptions {
  if (options.maxAge === 0) return options;
  const rest = { ...options };
  delete rest.maxAge;
  delete rest.expires;
  return remember ? { ...rest, maxAge: REMEMBER_SECONDS } : rest;
}
