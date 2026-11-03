"use client";

import type { SettlementStatus } from "@/lib/engine/settle";

export function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-10 shrink-0 rounded-full transition-colors duration-200 ${checked ? "bg-accent" : "bg-line"}`}
    >
      <span
        className={`absolute top-0.5 left-0.5 size-5 rounded-full bg-fg transition-transform duration-200 ease-out-soft ${checked ? "translate-x-4" : ""}`}
      />
    </button>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-xl bg-raised p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`flex-1 rounded-lg px-3 py-1.5 text-sm transition-colors ${value === o.value ? "bg-line text-fg" : "text-muted hover:text-fg"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`rounded-full border px-3.5 py-1.5 text-sm transition-colors ${active ? "border-accent/60 bg-accent/12 text-fg" : "border-line text-muted hover:text-fg"}`}
    >
      {children}
    </button>
  );
}

const statusStyle: Record<SettlementStatus, { label: string; cls: string }> = {
  covered: { label: "On track", cls: "bg-ok/12 text-ok" },
  managed: { label: "Using flex", cls: "bg-warn/12 text-warn" },
  target_hit: { label: "Below target", cls: "bg-bad/12 text-bad" },
};

export function StatusChip({ status }: { status: SettlementStatus }) {
  const s = statusStyle[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${s.cls}`}>
      <span className="size-1.5 rounded-full bg-current" />
      {s.label}
    </span>
  );
}
