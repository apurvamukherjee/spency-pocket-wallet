"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useData, useFormat, useSummary } from "@/lib/data/context";
import { balanceSeries } from "@/lib/engine/derive";
import { dueWhen } from "@/lib/engine/dates";
import { nextBill, planWindow } from "@/lib/engine/plan";
import { describeSettlement } from "@/lib/engine/settle";
import { Icon } from "@/components/ui/Icon";
import { StatusChip } from "@/components/ui/controls";
import { EnvelopeBars } from "./EnvelopeBars";
import { ProjectionChart } from "./ProjectionChart";
import { RebalanceCard } from "./RebalanceCard";
import { RecentActivity } from "./RecentActivity";

export function HomeView() {
  const data = useData();
  const s = useSummary();
  const fmt = useFormat();
  const win = planWindow(data.plan);
  const series = useMemo(() => balanceSeries(data.plan, data.txns, s.today), [data.plan, data.txns, s.today]);
  const delta = s.projected - s.target;
  const next = nextBill(data.commitments, s.today);
  const nextLine = next && `Next: ${next.commitment.name}, ${dueWhen(s.today, next.date)} (${fmt.shortDay(next.date)})`;

  return (
    <div className="space-y-10">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted">{fmt.longDay(s.today)}</p>
          <p className="text-[15px]">{fmt.greeting()}</p>
        </div>
        <div className="flex gap-1 lg:hidden">
          <Link href="/reconcile" aria-label="Reconcile" className="rounded-full p-2.5 text-muted hover:text-fg">
            <Icon name="scale" />
          </Link>
          <Link href="/settings" aria-label="Settings" className="rounded-full p-2.5 text-muted hover:text-fg">
            <Icon name="gear" />
          </Link>
        </div>
      </header>

      <section aria-labelledby="safe">
        <h1 id="safe" className="text-sm text-muted">
          Safe to spend today
        </h1>
        <p className="mt-1 text-[56px] leading-none font-medium tracking-tighter tabular-nums sm:text-[72px]">
          {fmt.money(s.safeToday)}
        </p>
        <p className="mt-3 text-sm text-muted">
          {fmt.money(s.envelopeLeftThisWeek)} left in envelopes · {s.daysLeftThisWeek} {s.daysLeftThisWeek === 1 ? "day" : "days"} to go this week
        </p>
        <div className="mt-6 flex flex-col items-start gap-3">
          <StatusChip status={s.status} />
          <p className="max-w-prose text-[15px] leading-relaxed text-muted">
            {describeSettlement(s.current.settlement, { live: !s.current.final, target: s.target, projected: s.projected, fmt: fmt.money })}
          </p>
        </div>
      </section>

      <section aria-labelledby="month" className="card p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="month" className="text-sm text-muted">
              Projected month-end
            </h2>
            <p className="mt-1 text-3xl font-medium tracking-tight tabular-nums">{fmt.money(s.projected)}</p>
          </div>
          <div className="text-right text-sm">
            <p className="text-muted">Target {fmt.money(s.target)}</p>
            <p className={`mt-1 tabular-nums ${delta >= 0 ? "text-ok" : "text-warn"}`}>
              {delta === 0 ? "Right on target" : fmt.money(delta, { signed: true })}
            </p>
          </div>
        </div>
        <div className="mt-5">
          <ProjectionChart series={series} monthStart={win.start} monthEnd={win.end} projected={s.projected} target={s.target} />
        </div>
        <dl className="mt-5 grid grid-cols-3 gap-3 border-t border-line pt-4 text-sm">
          <Stat label="Flex left" value={fmt.money(Math.max(0, s.flexLeft))} />
          <Stat label="Bills due" value={fmt.money(s.commitmentsRemaining)} note={nextLine} />
          <Stat label="Bonus saved" value={fmt.money(s.bonusSaved)} />
        </dl>
      </section>

      <RebalanceCard />

      <section aria-labelledby="envelopes">
        <div className="mb-5 flex items-baseline justify-between">
          <h2 id="envelopes" className="text-[15px] font-medium">
            This week
          </h2>
          <Link href="/envelopes" className="text-sm text-muted hover:text-fg">
            Edit
          </Link>
        </div>
        {s.current.settlement.envelopes.length ? (
          <EnvelopeBars settlement={s.current.settlement} money={fmt.money} />
        ) : (
          <p className="text-sm text-muted">
            No envelopes yet. <Link href="/envelopes" className="text-fg underline underline-offset-4">Add one</Link> to start budgeting week by week.
          </p>
        )}
      </section>

      <RecentActivity />
    </div>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note?: string | null }) {
  return (
    <div>
      <dt className="text-muted">{label}</dt>
      <dd className="mt-0.5 tabular-nums">{value}</dd>
      {note && <dd className="mt-1 text-xs text-muted">{note}</dd>}
    </div>
  );
}
