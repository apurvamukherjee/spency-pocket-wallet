// Inlined at build time. Both empty → the app runs in local demo mode.
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
export const supabaseConfigured = SUPABASE_URL !== "" && SUPABASE_KEY !== "";

export class SupabaseNotConfiguredError extends Error {
  override name = "SupabaseNotConfiguredError";
  constructor() {
    super("Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (see .env.example)");
  }
}
