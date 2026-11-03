import type { FormatMoney } from "@/lib/engine/money";
import { coverLine, type Settlement } from "@/lib/engine/settle";
import { Icon } from "@/components/ui/Icon";

export function EnvelopeBars({ settlement, money }: { settlement: Settlement; money: FormatMoney }) {
  return (
    <ul className="space-y-5">
      {settlement.envelopes.map((e) => {
        const over = e.variance < 0;
        const pct = e.limit > 0 ? Math.min(100, (e.spent / e.limit) * 100) : over ? 100 : 0;
        const line = coverLine(settlement, e.id, money);
        const tone = !over ? "bg-accent" : e.hitTarget > 0 ? "bg-bad" : e.fromFlex > 0 ? "bg-warn" : "bg-ok";
        return (
          <li key={e.id}>
            <div className="mb-2 flex items-baseline justify-between gap-3 text-[15px]">
              <span className="flex items-center gap-1.5">
                {e.name}
                {e.locked && <Icon name="lock" size={13} className="text-faint" />}
              </span>
              <span className="text-sm text-muted tabular-nums">
                {over ? (
                  <span className="text-fg">{money(-e.variance)} over</span>
                ) : (
                  <>
                    <span className="text-fg">{money(e.variance)}</span> left of {money(e.limit)}
                  </>
                )}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-raised">
              <div
                className={`h-full rounded-full ${tone} origin-left transition-[width] duration-700 ease-out-soft`}
                style={{ width: `${pct}%` }}
              />
            </div>
            {line && <p className="mt-2 text-[13px] text-muted">{line}</p>}
          </li>
        );
      })}
    </ul>
  );
}
