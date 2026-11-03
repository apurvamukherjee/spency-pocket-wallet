# Changelog

All notable changes to Spency are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

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
