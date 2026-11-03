"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { supabaseConfigured } from "@/lib/supabase/env";
import { useSession } from "@/lib/supabase/session";

/** Reached from the recovery email (which signs the user in) or from Settings → Change password. */
export function NewPasswordView() {
  return supabaseConfigured ? (
    <WithSession />
  ) : (
    <p className="text-sm text-muted">
      Accounts aren&apos;t enabled on this server. <Link href="/" className="text-fg underline underline-offset-4">Back to Spency</Link>
    </p>
  );
}

function WithSession() {
  const session = useSession();
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (session === undefined) return null;
  if (session === null) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-medium tracking-tight">Link expired</h1>
        <p className="text-sm text-muted">Reset links work once and expire after a while. Ask for a fresh one.</p>
        <Link href="/login?mode=reset" className="btn btn-primary w-full">
          Send a new link
        </Link>
      </div>
    );
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) return setError("Use at least 8 characters.");
    setBusy(true);
    setError(null);
    const { error } = await supabaseBrowser().auth.updateUser({ password });
    if (error) {
      setError(error.code === "same_password" ? "That's your current password. Pick a new one." : error.message);
      setBusy(false);
      return;
    }
    router.replace("/settings");
  }

  return (
    <form onSubmit={save} className="space-y-6">
      <div>
        <h1 className="text-2xl font-medium tracking-tight">Choose a new password</h1>
        <p className="mt-1.5 text-sm text-muted">For {session.user.email}</p>
      </div>
      <label className="block space-y-1.5">
        <span className="label">New password</span>
        <input type="password" autoComplete="new-password" minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} className="field" autoFocus />
      </label>
      {error && (
        <p role="alert" className="text-sm text-bad">
          {error}
        </p>
      )}
      <button type="submit" disabled={busy} className="btn btn-primary w-full py-3">
        {busy ? "Saving…" : "Save password"}
      </button>
    </form>
  );
}
