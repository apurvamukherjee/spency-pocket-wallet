export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <aside className="relative hidden overflow-hidden border-r border-line bg-surface lg:flex lg:flex-col lg:justify-between lg:p-14">
        <p className="text-[17px] font-semibold tracking-tight">spency</p>
        <div className="max-w-md">
          <p className="text-sm text-muted">Safe to spend today</p>
          <p className="mt-1 text-7xl font-medium tracking-tighter tabular-nums">1,240</p>
          <div className="mt-8 space-y-4">
            {[
              { name: "Groceries", pct: 62, note: null },
              { name: "Eating out", pct: 100, note: "Covered by Groceries savings" },
              { name: "Transport", pct: 35, note: null },
            ].map((e) => (
              <div key={e.name}>
                <div className="mb-2 flex justify-between text-sm">
                  <span>{e.name}</span>
                  <span className="text-muted tabular-nums">{e.pct}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-raised">
                  <div className={`h-full rounded-full ${e.pct === 100 ? "bg-ok" : "bg-accent"}`} style={{ width: `${e.pct}%` }} />
                </div>
                {e.note && <p className="mt-2 text-[13px] text-muted">{e.note}</p>}
              </div>
            ))}
          </div>
        </div>
        <p className="max-w-sm text-[15px] leading-relaxed text-muted">
          A calm budget that ends every month on the balance you planned. Send Claude a payment screenshot; Spency does the rest.
        </p>
      </aside>
      <main className="flex items-center justify-center px-5 py-12 pt-[max(env(safe-area-inset-top),3rem)]">
        <div className="w-full max-w-sm">{children}</div>
      </main>
    </div>
  );
}
