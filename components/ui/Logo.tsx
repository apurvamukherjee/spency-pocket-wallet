/** The brand mark: a ring three-quarters full, i.e. on track. */
export function Logo({ size = 24, withName = true }: { size?: number; withName?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5 text-[17px] font-semibold tracking-tight">
      <svg width={size} height={size} viewBox="10 10 44 44" aria-hidden>
        <circle cx="32" cy="32" r="16.5" fill="none" className="stroke-line" strokeWidth="7" />
        <circle
          cx="32"
          cy="32"
          r="16.5"
          fill="none"
          className="stroke-accent"
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray="77.8 103.7"
          transform="rotate(-90 32 32)"
        />
      </svg>
      {withName && "spency"}
    </span>
  );
}
