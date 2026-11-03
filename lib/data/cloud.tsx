"use client";

import { type QueryClient, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useMemo } from "react";
import { normalizeMerchant } from "@/lib/engine/inbox";
import { type Supabase, supabaseBrowser } from "@/lib/supabase/client";
import { applyTheme } from "@/lib/theme";
import { useUI } from "@/lib/ui";
import { SpencyContext } from "./context";
import { fetchAppData, must, ok, type Result, type User } from "./fetch";
import * as r from "./reducers";
import * as rows from "./rows";
import type { Actions, AppData } from "./types";

function cloudActions(sb: Supabase, qc: QueryClient, key: readonly unknown[], user: User, onError: (e: unknown) => void): Actions {
  let inFlight = 0;
  const current = () => {
    const d = qc.getQueryData<AppData>(key);
    if (!d) throw new Error("Cloud data not loaded");
    return d;
  };

  /** Optimistic: update the cache now, write to Postgres, then refetch once nothing is in flight (which also rolls back failures). */
  function run(local: (d: AppData) => AppData, remote: () => PromiseLike<Result>) {
    void qc.cancelQueries({ queryKey: key });
    qc.setQueryData<AppData>(key, (d) => d && local(d));
    inFlight++;
    Promise.resolve(remote())
      .then(({ error }) => {
        if (error) throw error;
      })
      .catch(onError)
      .finally(() => {
        if (--inFlight === 0) void qc.invalidateQueries({ queryKey: key });
      });
  }

  const deleteMissing = async (table: "envelopes" | "commitments", keep: string[]) => {
    const q = sb.from(table).delete().eq("user_id", user.id);
    ok(await (keep.length ? q.not("id", "in", `(${keep.join(",")})`) : q));
  };

  return {
    addTxn(t) {
      const txn = r.buildTxn(current(), t, crypto.randomUUID(), new Date().toISOString());
      run((d) => r.addTxn(d, txn), () => sb.from("transactions").insert(rows.txnToRow(txn)));
    },
    updateTxn(id, patch) {
      const before = current().txns.find((t) => t.id === id);
      run(
        (d) => r.updateTxn(d, id, patch),
        async () => {
          const res = await sb.from("transactions").update(rows.txnPatchToRow(patch)).eq("id", id);
          if (res.error || !before || patch.envelopeId === undefined || patch.envelopeId === before.envelopeId) return res;
          return sb
            .from("merchant_memory")
            .upsert({ merchant: normalizeMerchant(patch.merchant ?? before.merchant), envelope_id: patch.envelopeId });
        },
      );
    },
    setStatus: (ids, status) => run((d) => r.setStatus(d, ids, status), () => sb.from("transactions").update({ status }).in("id", ids)),
    setPlan(patch) {
      const plan = current().plan;
      if (!plan) return;
      run((d) => r.setPlan(d, patch), () => sb.from("month_plans").update(rows.planToRow(patch)).eq("id", plan.id));
    },
    saveEnvelope(e) {
      const list = current().envelopes;
      const i = list.findIndex((x) => x.id === e.id);
      run((d) => r.saveEnvelope(d, e), () => sb.from("envelopes").upsert(rows.envelopeToRow(e, i === -1 ? list.length : i)));
    },
    deleteEnvelope: (id) => run((d) => r.deleteEnvelope(d, id), () => sb.from("envelopes").delete().eq("id", id)),
    saveCommitment: (c) => run((d) => r.saveCommitment(d, c), () => sb.from("commitments").upsert(rows.commitmentToRow(c))),
    deleteCommitment: (id) => run((d) => r.deleteCommitment(d, id), () => sb.from("commitments").delete().eq("id", id)),
    recordCheck: (c) =>
      run((d) => r.recordCheck(d, c), () => sb.from("reconcile_checks").upsert(rows.checkToRow(c), { onConflict: "user_id,date" })),
    updateProfile: (patch) =>
      run((d) => r.updateProfile(d, patch), () => sb.from("profiles").update(rows.profileToRow(patch)).eq("id", user.id)),

    // Not optimistic: onboarding waits for the server so the plan id is real before the app opens.
    async startMonth(plan, envelopes, commitments) {
      ok(await sb.from("month_plans").upsert(rows.planToInsert(plan), { onConflict: "user_id,month" }));
      await deleteMissing("envelopes", envelopes.map((e) => e.id));
      await deleteMissing("commitments", commitments.map((c) => c.id));
      if (envelopes.length) ok(await sb.from("envelopes").upsert(envelopes.map(rows.envelopeToRow)));
      if (commitments.length) ok(await sb.from("commitments").upsert(commitments.map(rows.commitmentToRow)));
      await qc.invalidateQueries({ queryKey: key });
    },
  };
}

export function CloudProvider({ user, children, fallback }: { user: User; children: ReactNode; fallback: ReactNode }) {
  const sb = supabaseBrowser();
  const qc = useQueryClient();
  const router = useRouter();
  const notify = useUI((s) => s.notify);
  const key = useMemo(() => ["spency", user.id] as const, [user.id]);
  const query = useQuery({ queryKey: key, queryFn: () => fetchAppData(sb, user) });

  const actions = useMemo(
    () =>
      cloudActions(sb, qc, key, user, (e) => {
        console.error(e);
        notify("That didn't save. We've put things back as they were, try again in a moment.");
      }),
    [sb, qc, key, user, notify],
  );

  const theme = query.data?.profile.theme;
  useEffect(() => {
    if (theme) applyTheme(theme);
  }, [theme]);

  const data = query.data;
  const value = useMemo(
    () =>
      data && {
        data,
        actions,
        mode: "cloud" as const,
        signOut: async () => {
          const { error } = await sb.auth.signOut();
          if (error) throw error;
          qc.clear();
          router.replace("/login");
        },
      },
    [data, actions, sb, qc, router],
  );

  if (query.isError) {
    return (
      <div className="card mx-auto mt-16 max-w-sm p-6 text-center" role="alert">
        <p className="font-medium">Couldn&apos;t load your money</p>
        <p className="mt-1 text-sm text-muted">Check your connection and try again.</p>
        <button type="button" onClick={() => void query.refetch()} className="btn btn-ghost mt-5">
          Try again
        </button>
      </div>
    );
  }
  if (!value) return fallback;
  return <SpencyContext value={value}>{children}</SpencyContext>;
}
