"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useActionState, useSyncExternalStore } from "react";
import { confirmEmail } from "@/app/(auth)/actions";
import { ResendForm } from "./ResendForm";

const noop = () => () => {};

/** Supabase reports failures it caught itself (e.g. an expired link) in the URL fragment, which only the browser sees. */
function useHashError(): string | null {
  const hash = useSyncExternalStore(noop, () => window.location.hash, () => "");
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const code = params.get("error_code");
  if (!params.get("error") && !code) return null;
  if (code === "otp_expired") return "This link has expired or was already used. Send yourself a new one below.";
  return params.get("error_description")?.replaceAll("+", " ") ?? "That link didn't work. Send yourself a new one below.";
}

export function ConfirmView() {
  const params = useSearchParams();
  const [state, action, pending] = useActionState(confirmEmail, null);
  const hashError = useHashError();

  const code = params.get("code") ?? "";
  const tokenHash = params.get("token_hash") ?? "";
  const type = params.get("type") ?? "";
  const next = params.get("next") ?? "/";
  const recovery = type === "recovery" || next.startsWith("/reset-password");
  const hasLink = code !== "" || (tokenHash !== "" && type !== "");
  const error = hashError ?? state?.error ?? (hasLink ? null : "This link is incomplete. Send yourself a new one below.");

  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-medium tracking-tight">That link didn&apos;t work</h1>
          <p role="alert" className="mt-2 text-sm text-muted">
            {error}
          </p>
        </div>
        {recovery ? (
          <Link href="/login?mode=reset" className="btn btn-primary w-full">
            Send a new reset link
          </Link>
        ) : (
          <ResendForm />
        )}
        <Link href="/login" className="block text-center text-sm text-muted hover:text-fg">
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-6">
      <div>
        <h1 className="text-2xl font-medium tracking-tight">{recovery ? "Reset your password" : "Confirm your email"}</h1>
        <p className="mt-1.5 text-sm text-muted">
          {recovery ? "Continue to choose a new password." : "One tap and your Spency account is ready."}
        </p>
      </div>
      <input type="hidden" name="code" value={code} />
      <input type="hidden" name="token_hash" value={tokenHash} />
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="next" value={next} />
      <button type="submit" disabled={pending} className="btn btn-primary w-full py-3" autoFocus>
        {pending ? "One moment…" : recovery ? "Continue" : "Confirm and continue"}
      </button>
    </form>
  );
}
