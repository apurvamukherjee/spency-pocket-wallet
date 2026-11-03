"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useActionState, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { type AuthState, requestReset, signIn, signUp } from "@/app/(auth)/actions";
import { useDemoStore } from "@/lib/data/demo";
import { currencyOptions, detectDefaults } from "@/lib/locale";
import { supabaseConfigured } from "@/lib/supabase/env";
import { useSession } from "@/lib/supabase/session";
import { Segmented } from "@/components/ui/controls";
import { Icon } from "@/components/ui/Icon";

type Mode = "signin" | "signup" | "reset";

const TITLES: Record<Mode, { title: string; sub: string }> = {
  signin: { title: "Welcome back", sub: "Sign in to see what's safe to spend today." },
  signup: { title: "Create your account", sub: "Two minutes to set up. Free and open source." },
  reset: { title: "Reset your password", sub: "We'll email you a link to choose a new one." },
};

export function LoginView() {
  const params = useSearchParams();
  const initial = params.get("mode");
  const [mode, setMode] = useState<Mode>(initial === "signup" || initial === "reset" ? initial : "signin");
  const router = useRouter();

  function tryDemo() {
    useDemoStore.getState().enter();
    router.push("/");
  }

  if (!supabaseConfigured) {
    return (
      <div className="space-y-6">
        <Brand />
        <div>
          <h1 className="text-2xl font-medium tracking-tight">Accounts aren&apos;t set up here</h1>
          <p className="mt-2 text-sm text-muted">
            This copy of Spency runs without a backend. Your data stays in this browser. Add Supabase keys to <code>.env.local</code> to
            enable accounts.
          </p>
        </div>
        <Link href="/" className="btn btn-primary w-full">
          Open Spency
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <Brand />
      <SignedInRedirect />
      <div>
        <h1 className="text-2xl font-medium tracking-tight">{TITLES[mode].title}</h1>
        <p className="mt-1.5 text-sm text-muted">{TITLES[mode].sub}</p>
      </div>
      {params.get("error") === "link" && (
        <p role="alert" className="rounded-xl bg-bad/10 px-3 py-2 text-sm text-bad">
          That link has expired or was already used. Try again below.
        </p>
      )}
      {mode !== "reset" && (
        <Segmented<Mode>
          label="Account"
          value={mode}
          onChange={setMode}
          options={[
            { value: "signin", label: "Sign in" },
            { value: "signup", label: "Create account" },
          ]}
        />
      )}
      <AuthForm key={mode} mode={mode} onForgot={() => setMode("reset")} onBack={() => setMode("signin")} />
      <div className="relative py-1 text-center text-xs text-faint before:absolute before:inset-x-0 before:top-1/2 before:h-px before:bg-line">
        <span className="relative bg-bg px-3">or</span>
      </div>
      <button type="button" onClick={tryDemo} className="btn btn-ghost w-full">
        Explore a demo month
      </button>
    </div>
  );
}

function Brand() {
  return <p className="text-[17px] font-semibold tracking-tight lg:hidden">spency</p>;
}

function SignedInRedirect() {
  const session = useSession();
  const router = useRouter();
  useEffect(() => {
    if (session) router.replace("/");
  }, [session, router]);
  return null;
}

const noop = () => () => {};

const ACTIONS = { signin: signIn, signup: signUp, reset: requestReset } satisfies Record<Mode, (s: AuthState, f: FormData) => Promise<AuthState>>;

function AuthForm({ mode, onForgot, onBack }: { mode: Mode; onForgot: () => void; onBack: () => void }) {
  const [state, action, pending] = useActionState(ACTIONS[mode], null);
  // Browser locale/zone only exist on the client; the server renders the form without them.
  const onClient = useSyncExternalStore(noop, () => true, () => false);
  const defaults = useMemo(() => (onClient ? detectDefaults() : null), [onClient]);
  const currencies = useMemo(() => (defaults ? currencyOptions(defaults.locale) : []), [defaults]);
  const [showPassword, setShowPassword] = useState(false);

  if (state?.notice) {
    return (
      <div className="card space-y-3 p-5" role="status">
        <Icon name="check" className="text-ok" />
        <p className="text-[15px]">{state.notice}</p>
        <button type="button" onClick={onBack} className="text-sm text-muted hover:text-fg">
          Back to sign in
        </button>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      {mode === "signup" && (
        <label className="block space-y-1.5">
          <span className="label">Your name</span>
          <input name="name" className="field" autoComplete="name" maxLength={80} placeholder="Optional" />
        </label>
      )}
      <label className="block space-y-1.5">
        <span className="label">Email</span>
        <input name="email" type="email" required autoComplete="email" defaultValue={state?.email} className="field" />
      </label>
      {mode !== "reset" && (
        <label className="block space-y-1.5">
          <span className="flex items-baseline justify-between">
            <span className="label">Password</span>
            {mode === "signin" && (
              <button type="button" onClick={onForgot} className="text-xs text-muted hover:text-fg">
                Forgot?
              </button>
            )}
          </span>
          <span className="relative block">
            <input
              name="password"
              type={showPassword ? "text" : "password"}
              required
              minLength={mode === "signup" ? 8 : undefined}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              className="field pr-16"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute top-1/2 right-3 -translate-y-1/2 text-xs text-muted hover:text-fg"
              aria-pressed={showPassword}
            >
              {showPassword ? "Hide" : "Show"}
            </button>
          </span>
          {mode === "signup" && <span className="block text-xs text-faint">At least 8 characters.</span>}
        </label>
      )}
      {mode === "signup" && defaults && (
        <>
          <label className="block space-y-1.5">
            <span className="label">Currency</span>
            <select name="currency" defaultValue={defaults.currency} className="field">
              {currencies.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <input type="hidden" name="locale" value={defaults.locale} />
          <input type="hidden" name="timeZone" value={defaults.timeZone} />
        </>
      )}
      {state?.error && (
        <p role="alert" className="text-sm text-bad">
          {state.error}
        </p>
      )}
      <button type="submit" disabled={pending} className="btn btn-primary w-full py-3">
        {pending ? "One moment…" : mode === "signin" ? "Sign in" : mode === "signup" ? "Create account" : "Send reset link"}
      </button>
      {mode === "reset" && (
        <button type="button" onClick={onBack} className="w-full text-sm text-muted hover:text-fg">
          Back to sign in
        </button>
      )}
    </form>
  );
}
