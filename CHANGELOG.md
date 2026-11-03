# Changelog

All notable changes to Spency are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
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
