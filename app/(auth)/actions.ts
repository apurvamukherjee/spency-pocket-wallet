"use server";

import type { AuthError } from "@supabase/supabase-js";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { safeNext } from "@/lib/safe-next";
import { supabaseServer } from "@/lib/supabase/server";

export type AuthState = { error?: string; notice?: string; email?: string } | null;

const field = (form: FormData, name: string) => {
  const v = form.get(name);
  return typeof v === "string" ? v.trim() : "";
};

async function origin(): Promise<string> {
  const h = await headers();
  return h.get("origin") ?? `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
}

function friendly(e: AuthError): string {
  switch (e.code) {
    case "invalid_credentials":
      return "That email and password don't match.";
    case "email_not_confirmed":
      return "Confirm your email first. Check your inbox for the link.";
    case "user_already_exists":
    case "email_exists":
      return "There's already an account with that email. Try signing in.";
    case "weak_password":
      return "Pick a stronger password: at least 8 characters, mixing letters and numbers.";
    case "over_request_rate_limit":
    case "over_email_send_rate_limit":
      return "Too many attempts. Wait a minute and try again.";
    default:
      return e.message;
  }
}

export async function signIn(_: AuthState, form: FormData): Promise<AuthState> {
  const email = field(form, "email");
  const password = form.get("password");
  if (!email || typeof password !== "string" || !password) return { error: "Enter your email and password.", email };
  const sb = await supabaseServer();
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) return { error: friendly(error), email };
  redirect(safeNext(field(form, "next")));
}

export async function signUp(_: AuthState, form: FormData): Promise<AuthState> {
  const email = field(form, "email");
  const password = form.get("password");
  if (!email) return { error: "Enter your email." };
  if (typeof password !== "string" || password.length < 8) return { error: "Use at least 8 characters for your password.", email };

  const sb = await supabaseServer();
  const { data, error } = await sb.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${await origin()}/auth/confirm?next=${encodeURIComponent(safeNext(field(form, "next")))}`,
      // Read by the handle_new_user trigger, which validates each value.
      data: {
        display_name: field(form, "name"),
        currency: field(form, "currency"),
        locale: field(form, "locale"),
        time_zone: field(form, "timeZone"),
      },
    },
  });
  if (error) return { error: friendly(error), email };
  if (data.session) redirect(safeNext(field(form, "next")));
  return { notice: `We sent a confirmation link to ${email}. Open it to finish creating your account.`, email };
}

export async function requestReset(_: AuthState, form: FormData): Promise<AuthState> {
  const email = field(form, "email");
  if (!email) return { error: "Enter the email you signed up with." };
  const sb = await supabaseServer();
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: `${await origin()}/auth/confirm?next=/reset-password` });
  // Same message either way, so the form can't be used to discover which emails have accounts.
  if (error && error.code?.startsWith("over_")) return { error: friendly(error), email };
  return { notice: `If ${email} has an account, a reset link is on its way.`, email };
}
