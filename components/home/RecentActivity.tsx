"use client";

import { useMemo, useState } from "react";
import { useAppData, useFormat, useToday } from "@/lib/data/context";
import { useUI } from "@/lib/ui";
import { categoryLabel } from "@/lib/data/category";

/** Confirmed payments, newest first. Tap one to fix or remove it. */
export function RecentActivity() {
  const { txns, envelopes, commitments } = useAppData();
  const fmt = useFormat();
  const today = useToday();
  const edit = useUI((s) => s.edit);
  const [count, setCount] = useState(8);

  const confirmed = useMemo(
    () => txns.filter((t) => t.status === "confirmed").sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)),
    [txns],
  );

  return (
    <section aria-labelledby="recent">
      <h2 id="recent" className="mb-3 text-[15px] font-medium">
        Recent
      </h2>
      {confirmed.length === 0 ? (
        <p className="text-sm text-muted">Nothing yet. Add a spend with the + button, or send Claude a payment screenshot.</p>
      ) : (
        <>
          <ul className="divide-y divide-line">
            {confirmed.slice(0, count).map((t) => {
              const label = categoryLabel(envelopes, commitments, t);
              return (
                <li key={t.id}>
                  <button type="button" onClick={() => edit(t.id)} className="flex w-full items-center justify-between gap-4 py-3 text-left">
                    <span className="min-w-0">
                      <span className="block truncate text-[15px]">{t.merchant || label}</span>
                      <span className="block text-[13px] text-muted">
                        {label}
                        {t.wallet === "cash" ? " · Cash" : ""} · {fmt.when(t.occurredAt, today)}
                      </span>
                    </span>
                    <span className={`shrink-0 text-[15px] tabular-nums ${t.direction === "credit" ? "text-ok" : ""}`}>
                      {fmt.money(t.direction === "credit" ? t.amount : -t.amount, { signed: t.direction === "credit" })}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {confirmed.length > count && (
            <button type="button" onClick={() => setCount(count + 20)} className="mt-2 text-sm text-muted hover:text-fg">
              Show more
            </button>
          )}
        </>
      )}
    </section>
  );
}
