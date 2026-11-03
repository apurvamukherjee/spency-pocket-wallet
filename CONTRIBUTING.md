# Contributing to Spency

Thanks for helping. Spency is small on purpose, so the bar for new code is "does this make the month easier to stay on top of?"

## Run it locally

You need Node.js 20.9 or newer.

```bash
git clone https://github.com/apurvamukherjee/spency-pocket-wallet.git
cd spency-pocket-wallet
npm install
npm run dev
```

Open http://localhost:3000. With no Supabase keys, Spency runs in **demo mode**: a sample month stored in your browser. That's enough for most UI and engine work.

### With accounts (Supabase)

1. Create a free project at [supabase.com](https://supabase.com).
2. `cp .env.example .env.local` and fill in the project URL and publishable key (Project Settings → API).
3. Apply the schema:
   ```bash
   npx supabase login
   npx supabase link --project-ref <your-project-ref>
   npx supabase db push --remote
   ```
4. In Supabase → Authentication → URL Configuration, add `http://localhost:3000/auth/confirm` to the redirect URLs.

## Checks

Run all four before opening a pull request; CI runs the same ones.

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

## Where things live

| Path | What |
|---|---|
| `lib/engine/` | The budget engine: pure TypeScript, no React or I/O. Settlement, projection, proration. Every change here needs a test. |
| `lib/data/` | Data layer. `reducers.ts` holds every state change as a pure function; `demo.tsx` and `cloud.tsx` apply them locally or to Supabase. |
| `supabase/migrations/` | Postgres schema and row level security. Add a new migration file, never edit an applied one. |
| `components/`, `app/` | UI. One folder per screen. |

## House rules

- Money is always integer minor units (cents, paise, yen). Never a float.
- Every balance shown must be derivable from confirmed transactions and the month plan.
- Copy is supportive, never guilt-inducing.
- TypeScript strict, no `any`. Throw typed errors; don't swallow them.
- No new dependency without saying why in the PR, its bundle cost, and the alternative you considered.

## Pull requests

1. Fork, then branch from `main` (`fix/inbox-swipe`, `feat/csv-import`).
2. Keep each PR to one change, with small commits that say what and why.
3. Describe what changed, how you tested it, and add screenshots for UI changes (dark and light).
4. A maintainer will review; expect a first response within a couple of days.

## Issues

- **Bugs:** use the bug report template, with steps to reproduce.
- **Ideas:** use the feature request template.
- **Questions:** use [Discussions](https://github.com/apurvamukherjee/spency-pocket-wallet/discussions) rather than issues.

We aim to reply to every new issue within one day.

## Security

Please don't open public issues for security problems. Use GitHub's private vulnerability reporting on this repo instead.
