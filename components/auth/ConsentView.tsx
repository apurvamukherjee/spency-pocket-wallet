"use client";

import type { OAuthAuthorizationDetails } from "@supabase/supabase-js";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { supabaseConfigured } from "@/lib/supabase/env";
import { useSession } from "@/lib/supabase/session";
import { Icon } from "@/components/ui/Icon";
import { Logo } from "@/components/ui/Logo";

const CAN = [
  "See your balances, envelopes, bills and transactions",
  "Add payments to your Inbox, waiting for you to confirm",
  "Change envelopes and add bills when you ask it to",
];
const CANNOT = ["Confirm transactions for you", "See any bank login (Spency never has one)"];

type State =
  | { kind: "loading" }
  | { kind: "ask"; details: OAuthAuthorizationDetails }
  | { kind: "leaving" }
  | { kind: "error"; message: string };

/**
 * Supabase's OAuth server sends the user here (Authorization Path /oauth/consent) when an app like Claude asks
 * to connect. Approving issues the app a token that acts as this user, still bound by row level security.
 */
export function ConsentView() {
  const id = useSearchParams().get("authorization_id");
  if (!supabaseConfigured) return <Problem message="Accounts aren't configured on this server." />;
  if (!id) return <Problem message="This link is missing its authorization request. Start connecting again from Claude." />;
  return <Consent id={id} />;
}

function Consent({ id }: { id: string }) {
  const session = useSession();
  const router = useRouter();
  const [state, setState] = useState<State>({ kind: "loading" });
  const back = `/oauth/consent?authorization_id=${encodeURIComponent(id)}`;

  useEffect(() => {
    if (session === null) router.replace(`/login?next=${encodeURIComponent(back)}`);
  }, [session, router, back]);

  useEffect(() => {
    if (!session) return;
    let live = true;
    void supabaseBrowser()
      .auth.oauth.getAuthorizationDetails(id)
      .then(({ data, error }) => {
        if (!live) return;
        if (error || !data) {
          console.error("Authorization details failed", error);
          setState({ kind: "error", message: "This request has expired or was already used. Start connecting again from Claude." });
        } else if ("authorization_id" in data) {
          setState({ kind: "ask", details: data });
        } else {
          // Already approved earlier: Supabase hands back the redirect straight away.
          setState({ kind: "leaving" });
          window.location.assign(data.redirect_url);
        }
      });
    return () => {
      live = false;
    };
  }, [session, id]);

  async function decide(approve: boolean) {
    setState({ kind: "leaving" });
    const oauth = supabaseBrowser().auth.oauth;
    const { data, error } = approve
      ? await oauth.approveAuthorization(id, { skipBrowserRedirect: true })
      : await oauth.denyAuthorization(id, { skipBrowserRedirect: true });
    if (error || !data) {
      console.error("Authorization decision failed", error);
      setState({ kind: "error", message: "That didn't go through. Start connecting again from Claude." });
      return;
    }
    window.location.assign(data.redirect_url);
  }

  if (state.kind === "error") return <Problem message={state.message} />;
  if (state.kind !== "ask") {
    return (
      <p className="text-sm text-muted" aria-busy>
        {state.kind === "leaving" ? "Taking you back…" : "One moment…"}
      </p>
    );
  }

  const { client, user } = state.details;
  const site = hostOf(client.uri);
  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <span aria-hidden className="grid size-12 place-items-center rounded-2xl bg-raised text-lg font-semibold">
          {client.name.charAt(0).toUpperCase()}
        </span>
        <Icon name="plus" size={16} className="rotate-45 text-faint" />
        <span className="grid size-12 place-items-center rounded-2xl bg-raised">
          <Logo size={26} withName={false} />
        </span>
      </div>

      <div>
        <h1 className="text-2xl font-medium tracking-tight">Connect {client.name} to Spency?</h1>
        <p className="mt-1.5 text-sm text-muted">
          {site ? `${site} is asking` : "This app is asking"} to use your Spency account, signed in as {user.email}.
        </p>
      </div>

      <section className="card space-y-4 p-5">
        <List title="It will be able to" items={CAN} icon="check" tone="text-ok" />
        <List title="It won't be able to" items={CANNOT} icon="x" tone="text-faint" />
      </section>

      <p className="text-xs text-faint">
        You can disconnect any time in Settings → Connected apps.{" "}
        <Link href="/settings" className="underline underline-offset-4">
          Open Settings
        </Link>
      </p>

      <div className="flex gap-3">
        <button type="button" onClick={() => decide(false)} className="btn btn-ghost flex-1">
          Deny
        </button>
        <button type="button" onClick={() => decide(true)} className="btn btn-primary flex-[2]">
          Allow
        </button>
      </div>
    </div>
  );
}

function List({ title, items, icon, tone }: { title: string; items: string[]; icon: "check" | "x"; tone: string }) {
  return (
    <div>
      <p className="mb-2 text-sm text-muted">{title}</p>
      <ul className="space-y-2">
        {items.map((i) => (
          <li key={i} className="flex gap-2.5 text-[15px]">
            <Icon name={icon} size={18} className={`mt-0.5 shrink-0 ${tone}`} />
            {i}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Problem({ message }: { message: string }) {
  return (
    <div className="space-y-4" role="alert">
      <h1 className="text-2xl font-medium tracking-tight">Can&apos;t connect right now</h1>
      <p className="text-sm text-muted">{message}</p>
      <Link href="/" className="btn btn-ghost w-full">
        Back to Spency
      </Link>
    </div>
  );
}

function hostOf(uri: string): string | null {
  try {
    return new URL(uri).host;
  } catch (e) {
    console.warn("Client has no valid URI", uri, e);
    return null;
  }
}
