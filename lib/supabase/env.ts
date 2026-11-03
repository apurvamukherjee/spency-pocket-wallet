// Mapped in next.config.ts from NEXT_PUBLIC_SUPABASE_* or SUPABASE_*. Both empty → local demo mode.
export const SUPABASE_URL = process.env.SPENCY_SUPABASE_URL ?? "";
export const SUPABASE_KEY = process.env.SPENCY_SUPABASE_KEY ?? "";
export const supabaseConfigured = SUPABASE_URL !== "" && SUPABASE_KEY !== "";

export class SupabaseNotConfiguredError extends Error {
  override name = "SupabaseNotConfiguredError";
  constructor() {
    super("Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY (or their NEXT_PUBLIC_ versions); see .env.example");
  }
}
