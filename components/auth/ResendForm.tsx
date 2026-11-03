"use client";

import { useActionState } from "react";
import { resendConfirmation } from "@/app/(auth)/actions";

/** "Send me a new confirmation link" for links that expired, were opened elsewhere, or never arrived. */
export function ResendForm({ email = "" }: { email?: string }) {
  const [state, action, pending] = useActionState(resendConfirmation, null);
  if (state?.notice) {
    return (
      <p role="status" className="rounded-xl bg-ok/10 px-3 py-2 text-sm text-ok">
        {state.notice}
      </p>
    );
  }
  return (
    <form action={action} className="space-y-2">
      <div className="flex gap-2">
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          defaultValue={state?.email ?? email}
          placeholder="you@example.com"
          aria-label="Email"
          className="field"
        />
        <button type="submit" disabled={pending} className="btn btn-ghost shrink-0">
          {pending ? "Sending…" : "Resend"}
        </button>
      </div>
      {state?.error && (
        <p role="alert" className="text-sm text-bad">
          {state.error}
        </p>
      )}
    </form>
  );
}
