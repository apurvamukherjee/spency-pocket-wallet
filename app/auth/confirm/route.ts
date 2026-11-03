import type { EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { safeNext } from "@/lib/safe-next";
import { supabaseServer } from "@/lib/supabase/server";

const OTP_TYPES: EmailOtpType[] = ["signup", "invite", "magiclink", "recovery", "email_change", "email"];

/** Landing point for email links: sign-up confirmation and password recovery. Handles both token-hash and PKCE code links. */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const next = safeNext(params.get("next"));
  const sb = await supabaseServer();

  const code = params.get("code");
  const tokenHash = params.get("token_hash");
  const type = OTP_TYPES.find((t) => t === params.get("type"));

  const { error } = code
    ? await sb.auth.exchangeCodeForSession(code)
    : tokenHash && type
      ? await sb.auth.verifyOtp({ type, token_hash: tokenHash })
      : { error: new Error("Missing token") };

  if (error) {
    console.error("Email link failed", error);
    redirect("/login?error=link");
  }
  redirect(next);
}
