# Project: Spency — a personal spending tracker that Claude keeps updated

You are building Spency, a mobile-first web app (with an excellent desktop layout) that helps one user end each month with the bank balance they planned. It is deployed on Vercel and exposes a remote MCP server so the user can connect it to Claude as a custom connector. Claude then reads the user's UPI payment screenshots in chat and sends parsed transactions to Spency, where the user confirms them.

Before writing code, read this entire spec, then produce a short implementation plan with your proposed file structure and any questions. Wait for my approval before starting Phase 1.

## Tech stack

- Next.js (App Router) + TypeScript, deployed on Vercel. A single project hosts the website, the API, and the MCP server.
- Tailwind CSS. Use shadcn/ui only where it helps; the UI must not look like a default template.
- Postgres via Supabase (database + auth). Use Row Level Security so users can only see their own data.
- A remote MCP server served from a Next.js route (check current docs for Vercel's MCP handler package, and for how claude.ai custom connectors authenticate. Implement OAuth per the current MCP authorization spec so each Claude user maps to their own Spency account).
- Vitest for unit tests on the budget engine.
- Store all money as integer paise. Format as Indian rupees with Indian digit grouping (₹1,00,000). Default timezone Asia/Kolkata.

Verify current versions and APIs of every library from official docs instead of relying on memory.

## Core concepts

**Accounts.** Two wallets: Bank and Cash. Withdrawing cash is a transfer from Bank to Cash, never an expense. Cash spends are logged manually.

**Month plan.** The user sets:
- current bank balance (e.g. ₹80,000)
- target month-end balance (e.g. ₹70,000)
- optional salary amount and expected credit date

Spendable = current balance − target (+ expected salary in the month, if set).

**Commitments.** Recurring fixed debits (Netflix, Apple Music, Claude subscription, rent, EMIs) with amount, frequency, and next debit date. These are reserved first, before envelopes.

**Envelopes.** Weekly budgets per category, e.g. Blinkit ₹500/week, Fuel ₹500/week, Small stuff ₹300/week. Each envelope has:
- weekly limit
- `locked` flag (if true, its savings are NOT used to cover other envelopes)
- leftover rule: `rollover` (carry to next week), `to_flex`, or `to_target`

Weeks start Monday (configurable). Since months are not exactly 4 weeks, the monthly envelope allocation is prorated by day: weekly_limit / 7 × days of that week falling inside the month.

**Flex pool.** Flex = spendable − commitments for the month − total monthly envelope allocation. It is used for unplanned spends (clothes, parties) and as the second line of overspend cover.

**Transactions.** Fields: id, user_id, wallet (bank/cash), amount, direction (debit/credit), merchant, category/envelope_id (nullable → flex), occurred_at, source (manual / claude / import), status (pending / confirmed / rejected), upi_ref (nullable, unique per user for dedup), note, created_at.

Only confirmed transactions affect balances.

**Merchant memory.** When a user sets or changes a transaction's category, store merchant → category so future transactions from that merchant auto-categorize.

## Weekly settlement engine (most important logic, write it as pure functions with thorough tests)

For a given week:

1. For each envelope, variance = limit − spent (positive = saved, negative = over).
2. Total overspend is covered first by savings from unlocked envelopes that ended under budget.
3. Any remaining overspend is covered by the flex pool.
4. If flex is exhausted, the remainder reduces the projected month-end balance below target.
5. Leftover savings not used for cover follow each envelope's leftover rule.

Output a settlement object: per-envelope variance, which envelopes covered which overspend and by how much, amount taken from flex, amount hitting target, and a status:
- **Covered (green):** savings fully absorbed overspend
- **Managed (amber):** flex was used
- **Target hit (red):** target was reduced

Also generate a short human message, warm and honest, e.g. "You went ₹500 over on Small stuff, but ₹350 was covered because you spent less on Blinkit and Fuel. Only ₹150 came from flex. You're still on track for ₹70,000."

The settlement must also run live mid-week (projected, using spending so far), so the Home screen can show "currently covered by Blinkit savings" the moment an envelope goes over.

**Pattern detection.** If the same envelope is over budget 3 weeks in a row while another is consistently under, suggest a rebalance ("Move ₹150/week from Blinkit to Small stuff?"), which the user can accept in one tap.

## Key derived numbers

- **Safe to spend today:** remaining envelope + flex money for the rest of the week, spread sensibly over remaining days. Make it the hero number.
- **Projected month-end balance** vs target, with a small chart.
- **Bonus saved this month:** total savings pushed toward the target.

## Daily reconciliation

User enters their actual bank balance. Compare with Spency's computed bank balance. If there's a gap, show "₹340 unaccounted" with options: find it (prompt to ask Claude), log as an adjustment transaction, or ignore. Show a reconciliation streak.

## Screens

Mobile: bottom tab bar. Desktop (≥1024px): three columns. Left is navigation, center is the main view, right is a persistent Inbox panel.

1. **Home:** safe-to-spend today (hero), projected month-end vs target, envelope progress bars with a "covered by…" line under any overspend, settlement status chip.
2. **Inbox:** pending transactions from Claude as cards. Swipe right to confirm, left to reject, tap to edit category/amount. "Confirm all" button. Show duplicates flagged.
3. **Envelopes:** list, edit limits, locked flag, leftover rule, weekly history with past settlements.
4. **Commitments:** list with next debit dates and monthly total.
5. **Reconcile:** daily balance check.
6. **Settings / onboarding:** balance, target, salary (optional), week start, envelopes, commitments. Onboarding should take under 2 minutes.

Quick-add button everywhere for manual entries (amount, category, bank/cash) in as few taps as possible.

## Design direction

Calm, premium, uncluttered. Think a well-designed fintech app, not an admin dashboard.
- Big confident numbers, generous whitespace, one accent color, soft status colors for green/amber/red.
- Excellent dark mode and light mode.
- Smooth micro-interactions (swipe cards, progress bars animating).
- Fully responsive from 320px phones to wide desktop. Respect safe-area insets on mobile.
- Tone of all copy is supportive, never guilt-inducing.

## MCP tools (Phase 3)

All write tools create data that the user can see in the app. Transactions from Claude always arrive as `pending`.

- `get_summary`: safe to spend today, envelope status, flex left, projected month-end, current settlement status. Used for questions like "can I afford a ₹1,500 dinner?"
- `add_transactions`: array of {amount, merchant, occurred_at, upi_ref?, wallet, suggested_category?, note?}. Apply merchant memory, dedupe on upi_ref (and on merchant + amount + timestamp within 2 minutes when no ref). Return what was added and what was skipped as duplicates.
- `list_transactions`: filter by date range, status, category.
- `update_envelope`, `add_commitment`, `log_cash`, `set_bank_balance` / `reconcile`.

Include clear tool descriptions so Claude knows to extract merchant, amount, time, and UPI reference number from screenshots and map them to the user's envelope names (fetch envelopes via `get_summary` first).

## Phases

**Phase 1:** UI + budget engine on local seed data (no auth, no DB). Build all screens and the settlement engine with Vitest tests covering: all-covered, flex-used, target-hit, locked envelopes, partial weeks across month boundaries, cash transfers. Stop and let me review.

**Phase 2:** Supabase schema, migrations, RLS, auth, wire UI to real data.

**Phase 3:** MCP server route with OAuth, the tools above, and instructions in the README for adding it as a custom connector in Claude.

**Phase 4:** Polish: pattern detection, rebalance suggestions, empty states, loading states, accessibility pass, Vercel deployment notes.

Added by the user for Phase 4: a **hard reset** in Settings so they can start fresh. It wipes all their data (transactions, envelopes, bills, month plans, merchant memory, reconcile checks) behind a typed confirmation, keeps the account, profile and connected apps, then drops them into onboarding.

## Non-negotiables

- Never ask for or store bank credentials. Spency only knows what the user or Claude tells it.
- No floating-point money.
- Every balance shown must be derivable from confirmed transactions + the month plan.
- Keep the settlement engine framework-independent (pure TypeScript in `/lib/engine`).
