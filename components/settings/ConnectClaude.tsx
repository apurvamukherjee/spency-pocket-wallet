"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useSyncExternalStore } from "react";
import { useFormat } from "@/lib/data/context";
import { supabaseBrowser } from "@/lib/supabase/client";
import { Icon } from "@/components/ui/Icon";

const STEPS = [
  "In Claude, open Settings → Connectors → Add custom connector.",
  "Name it Spency and paste the URL above.",
  "Sign in and allow access. You'll come straight back to Claude.",
  "Send Claude a payment screenshot. It lands in your Inbox to confirm.",
];

const noop = () => () => {};

/** Cloud mode only: the connector URL plus every app the user has authorized, with a way to revoke each. */
export function ConnectClaude() {
  // window only exists in the browser; the server render leaves the URL empty and the browser fills it in.
  const origin = useSyncExternalStore(noop, () => window.location.origin, () => "");
  const url = origin && `${origin}/api/mcp`;
  const [copied, setCopied] = useState<"yes" | "failed" | false>(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied("yes");
    } catch (e) {
      console.warn("Clipboard write failed", e);
      setCopied("failed");
    }
  }

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-[15px] font-medium">Connect Claude</h2>
        <p className="mt-0.5 text-sm text-muted">Let Claude log payments from your screenshots and answer &ldquo;can I afford this?&rdquo;</p>
      </div>
      <div className="card space-y-5 p-5">
        <div className="flex items-center gap-2 rounded-xl bg-raised py-1.5 pr-1.5 pl-3.5">
          <code className="min-w-0 flex-1 truncate font-mono text-sm select-all">{url}</code>
          <button type="button" onClick={copy} disabled={!url} className="btn btn-primary shrink-0 px-3 py-1.5 text-sm">
            <Icon name={copied === "yes" ? "check" : "copy"} size={15} />
            {copied === "yes" ? "Copied" : copied === "failed" ? "Select and copy" : "Copy"}
          </button>
        </div>
        <ol className="space-y-2.5 text-sm">
          {STEPS.map((s, i) => (
            <li key={s} className="flex gap-3">
              <span className="grid size-5 shrink-0 place-items-center rounded-full bg-raised text-xs text-muted tabular-nums">{i + 1}</span>
              <span className="text-muted">{s}</span>
            </li>
          ))}
        </ol>
      </div>
      <ConnectedApps />
    </section>
  );
}

function ConnectedApps() {
  const fmt = useFormat();
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const grants = useQuery({
    queryKey: ["oauth-grants"],
    queryFn: async () => {
      const { data, error } = await supabaseBrowser().auth.oauth.listGrants();
      if (error) throw error;
      return Array.isArray(data) ? data : [];
    },
  });

  async function revoke(clientId: string) {
    setBusy(clientId);
    setError(null);
    const { error } = await supabaseBrowser().auth.oauth.revokeGrant({ clientId });
    setBusy(null);
    if (error) {
      console.error("Revoke failed", error);
      setError("Couldn't disconnect that app. Try again in a moment.");
      return;
    }
    await qc.invalidateQueries({ queryKey: ["oauth-grants"] });
  }

  if (grants.isPending) return null;
  if (grants.isError) {
    return <p className="text-xs text-faint">Connected apps will show here once the OAuth server is enabled for this project.</p>;
  }
  if (grants.data.length === 0) return <p className="text-sm text-muted">No apps connected yet.</p>;

  return (
    <div className="space-y-2">
      <p className="text-sm text-muted">Connected apps</p>
      <ul className="divide-y divide-line rounded-2xl border border-line">
        {grants.data.map((g) => (
          <li key={g.client.id} className="flex items-center gap-3 px-4 py-3">
            <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-xl bg-raised text-sm font-semibold">
              {g.client.name.charAt(0).toUpperCase()}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px]">{g.client.name}</span>
              <span className="block text-xs text-muted">Connected {fmt.day(g.granted_at.slice(0, 10))}</span>
            </span>
            <button
              type="button"
              disabled={busy === g.client.id}
              onClick={() => revoke(g.client.id)}
              className="btn btn-ghost px-3 py-1.5 text-sm"
            >
              Disconnect
            </button>
          </li>
        ))}
      </ul>
      {error && (
        <p role="alert" className="text-sm text-bad">
          {error}
        </p>
      )}
    </div>
  );
}
