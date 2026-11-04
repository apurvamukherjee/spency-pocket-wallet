# Changelog

All notable changes to Spency are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- Yearly bills are saved for month by month: each sets aside its shortfall spread over the months until it's due, so the month it falls due isn't a shock. Bills shows progress ("9,000 of 24,000 saved") and takes what's already put aside; savings carry into the next month and aren't counted as spending money. Needs the `bill_funds` migration.
- Money in: log a refund (back into the envelope it came from), income to spend (joins Flex) or income to save (lifts month-end above target). Claude files credits from known merchants as refunds.
- Overdrafts: a negative bank balance or target in onboarding, Settings, Reconcile and Claude's `update_plan` and `reconcile`.
- When heading below target, Home and `get_summary` say how to get back: spend about X a day less until month end, or, if that can't work this month, carry it into next month.
- Tagline: "End every month on the number you chose."
- Pick the day when adding or editing a payment (Today, Yesterday or any earlier date).
- File a payment under a bill from the Inbox, quick add or edit sheet; it counts as paying that bill this month. Claude does the same when the merchant or its suggestion matches a bill.
- Settings → Sorting: choose where unsorted payments go (default Small stuff). Payments are no longer filed under Flex unless you pick it; Claude's Flex suggestions are ignored. Needs the `default_envelope_id` migration.
- `set_bill_paid` for Claude: "Netflix hasn't gone out yet" sets the money aside again; "rent is paid" logs a pending payment for you to confirm.
- Bills: tick a bill to mark it paid this month (logs the payment so balances stay right), untick to undo, or untick a bill Spency assumed was paid to say it hasn't gone out yet (the money is set aside again). Needs the new `unpaid_bills` migration.
- Claude can correct the past: `update_transaction`, `remove_transaction`, `update_commitment`, `remove_commitment`, `remove_envelope` and `update_plan`. Payments dated before the plan's starting balance are flagged so Claude can explain they don't change balances. Confirming new payments stays in the app.

### Performance
- The first page load arrives with your numbers already in it: the server loads your month while rendering, behind an instant skeleton, instead of the browser fetching after it starts. Switching tabs makes no data requests.
- A month loads in one database request (`app_snapshot()`) instead of seven in two waves. It also lifts the 1,000-transaction cap. Needs the `app_snapshot` migration; until then the app uses the old queries.
- Saving no longer reloads the whole month; only a failed save reloads to roll back.
- Payments Claude adds appear without a refresh, through Supabase Realtime. Needs the `realtime` migration.
- The budget summary and the Inbox duplicate check are computed once per change instead of once per component.
- One webfont instead of two.

### Fixed
- Switching between currencies with different decimal places (INR and JPY) multiplied every amount by 100. It's now blocked while you have data.
- Claude's `update_plan` and `reconcile` rejected a balance of exactly zero.
- Saving the plan in Settings re-baselined on the balance from when the page opened, dropping any payment confirmed in the meantime. Balances now follow live figures and only an edited balance re-baselines.
- Starting a new month moved carried-over weekly and yearly bills onto a day this month. They keep their dates unless you change the day.
- Onboarding silently dropped half-filled bills and envelopes, and a salary with no pay day. Each is now pointed out before you continue.
- The edit sheet offered envelopes for cash withdrawals and adjustments (turning a withdrawal into spending). Removing a payment now takes a second tap.
- Incoming payments in the Inbox looked like spends; they now show as +amount.
- Copy buttons failed silently when the clipboard was blocked. Deleting a bill now asks first. Envelope editors no longer save on every blur and pick up changes made by Claude.
- Saturday is offered as a week start.
- Database: indexes behind the set-null foreign keys, and deleting a bill removes it from `unpaid_bills`. Needs the `fk_indexes_and_bill_cleanup` migration.
- Bills showed only what was still due as "This month", so bills already paid this month disappeared from the total. Bills now shows the full monthly total and what's still due, and marks bills done for the month.

### Changed
- Salary asks only for the pay day (1–31) in Settings and onboarding, not a full date. The year and month come from the plan; short months clamp (31 → the 28th in February).

## [0.2.0] - 2026-11-03

### Added
- Rebalance suggestions: when one envelope is over three weeks running and another stays under, Spency offers to move money between them in one tap.
- Recent activity on Home; tap a payment to edit or remove it.
- Settings → Start fresh: a typed-confirmation hard reset that keeps your account, profile and connected apps.
- Empty state for Bills, and deployment notes for Vercel in the README.
- Row level security tests: every migration runs in an in-process Postgres in CI, checking that no user can read or change another's data.
- Demo GIF, live demo link and a clearer one-line description in the README.

### Fixed
- Email confirmation and password reset links failed as "expired" when opened in another browser or pre-opened by a mail scanner. Links now work on any device and are only used when you press Continue; failures explain why and offer a resend.

### Changed
- All text meets WCAG AA contrast in both themes (axe: 0 serious issues on every screen): darker light-theme status colors and stronger hint text. Screen readers hear inbox counts as "4 to review".
- Claude connector: a remote MCP server at `/api/mcp` with `get_summary`, `add_transactions`, `list_transactions`, `update_envelope`, `add_commitment`, `log_cash` and `reconcile`. Everything Claude adds arrives pending.
- OAuth 2.1 sign-in for connectors through Supabase Auth, with a Spency consent screen and Settings → Connected apps to disconnect.
- Settings → Connect Claude with the connector URL and setup steps.
- Brand mark, tab and home-screen icons, web app manifest and share-link previews.
- Accounts with email and password (sign up, sign in, password reset, email confirmation) on Supabase.
- Postgres schema with row level security: every row is visible only to its owner.
- Cloud sync with optimistic updates; failed saves roll back with a gentle notice.
- Any currency, locale and time zone. Amounts are stored in each currency's minor unit and formatted with the user's number format.
- Light theme next to the default dark theme, switchable in Settings, with no flash on load.
- Profile in Settings: name, currency, language and number format, time zone, theme.
- Onboarding that suggests envelope amounts from what's spendable, and a new-month flow that reuses last month's setup.
- Demo mode: try Spency with a sample month and no account. Runs automatically when Supabase isn't configured.
- MIT license, contributing guide, issue templates and CI.

## [0.1.0] - Phase 1

### Added
- Weekly settlement engine: overspend is covered by savings from unlocked envelopes, then flex, then the month-end target.
- Safe to spend today, projected month-end vs target, bonus saved.
- Home, Inbox (swipe to confirm, duplicates flagged), Envelopes, Bills, Reconcile, Settings and onboarding on local demo data.
- Merchant memory, cash withdrawals as transfers, daily reconciliation with streaks.

[Unreleased]: https://github.com/apurvamukherjee/spency-pocket-wallet/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/apurvamukherjee/spency-pocket-wallet/releases/tag/v0.2.0
