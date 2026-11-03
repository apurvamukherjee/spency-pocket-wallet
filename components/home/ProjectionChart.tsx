import { diffDays } from "@/lib/engine/dates";
import type { ISODate, Paise } from "@/lib/engine/types";

const W = 320;
const H = 96;

/** Actual balance so far (solid), straight projection to month end (dashed), target (hairline). */
export function ProjectionChart({
  series,
  monthStart,
  monthEnd,
  projected,
  target,
}: {
  series: { date: ISODate; balance: Paise }[];
  monthStart: ISODate;
  monthEnd: ISODate;
  projected: Paise;
  target: Paise;
}) {
  const span = Math.max(1, diffDays(monthStart, monthEnd));
  const values = [...series.map((p) => p.balance), projected, target];
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const pad = (hi - lo) * 0.12 || 1;
  const x = (d: ISODate) => (diffDays(monthStart, d) / span) * W;
  const y = (v: Paise) => H - ((v - lo + pad) / (hi - lo + 2 * pad)) * H;

  const last = series.at(-1);
  const line = series.map((p, i) => `${i ? "L" : "M"}${x(p.date).toFixed(1)},${y(p.balance).toFixed(1)}`).join("");
  const below = projected < target;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-24 w-full overflow-visible" role="img" aria-label="Balance this month and projection to month end">
      <line x1={0} x2={W} y1={y(target)} y2={y(target)} className="stroke-faint" strokeDasharray="2 4" vectorEffect="non-scaling-stroke" />
      {last && (
        <line
          x1={x(last.date)}
          y1={y(last.balance)}
          x2={W}
          y2={y(projected)}
          className={below ? "stroke-warn" : "stroke-accent"}
          strokeDasharray="4 4"
          strokeWidth={1.5}
          opacity={0.7}
          vectorEffect="non-scaling-stroke"
        />
      )}
      <path d={line} fill="none" className="stroke-accent" strokeWidth={2} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
