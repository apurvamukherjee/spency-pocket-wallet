# Spency

A calm spending tracker that helps you end every month with the bank balance you planned, and that Claude keeps up to date for you.

You tell Spency your balance today and the balance you want at month-end. It reserves your fixed bills, splits the rest into weekly envelopes (Blinkit, Fuel, Small stuff…) and a flex pool, and tells you one number every morning: **how much is safe to spend today**.

> Status: **Phase 1 in progress.** UI and budget engine on local seed data. No accounts or database yet.

## Spency as Claude's wallet

The point of Spency is that you don't type in transactions. Claude does.

```
 You ──(UPI screenshot)──▶ Claude chat
                             │  reads merchant, amount, time, UPI ref
                             ▼
                   Spency MCP connector  ──▶  Inbox (pending)
                                                  │ swipe → confirm
                                                  ▼
                                    envelopes · flex · month-end projection
```

1. You add Spency to Claude as a **custom connector** (a remote MCP server hosted on the same Vercel deployment). You sign in once with OAuth, so your Claude is tied to your Spency account.
2. You drop UPI payment screenshots into any Claude chat. Claude extracts the merchant, amount, time and UPI reference, maps them to your envelope names, and calls `add_transactions`.
3. Everything Claude sends lands in your Spency **Inbox** as *pending*. Nothing touches your balances until you swipe to confirm.
4. You can also just ask Claude: *"Can I afford a ₹1,500 dinner tonight?"* It calls `get_summary` and answers from your real numbers.

Spency never sees bank credentials. It only knows what you or Claude tell it.

Planned MCP tools: `get_summary`, `add_transactions` (deduped by UPI ref), `list_transactions`, `update_envelope`, `add_commitment`, `log_cash`, `reconcile`.

## Roadmap

| Phase | What | State |
|---|---|---|
| 1 | All screens + weekly settlement engine on seed data, Vitest coverage | in progress |
| 2 | Supabase schema, RLS, auth, real data | — |
| 3 | MCP server with OAuth, connector setup guide | — |
| 4 | Pattern detection, rebalance suggestions, polish, accessibility | — |

Full product spec: [SPEC.md](SPEC.md).

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # engine tests
npm run typecheck
npm run lint
```

Stack: Next.js 16 (App Router), React 19, Tailwind CSS 4, Zustand, Vitest. Money is stored as integer paise and shown in Indian digit grouping (₹1,00,000), dates in Asia/Kolkata.
