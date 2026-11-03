# Spency

Read `SPEC.md` before any work. It is the source of truth. Phases are gated: finish one, stop, and wait for review before starting the next.

## Non-negotiables
- Money is integer paise everywhere. No floats, no `number` arithmetic that can produce fractions without explicit rounding.
- Never ask for or store bank credentials.
- Every balance shown must be derivable from confirmed transactions + the month plan.
- `lib/engine/` is pure TypeScript: no React, Next, Zustand, or I/O imports.
- Dates are IST calendar dates (`YYYY-MM-DD` strings) in the engine.
- Copy is supportive, never guilt-inducing.

## Engine decisions (agreed in Phase 1 plan)
- Weeks at the plan window edges (straddling a month boundary or the plan start date) are prorated: limit = weekly/7 × days inside the window, and only spending inside the window counts. This keeps projected month-end exactly on target when spending is on plan.
- Envelope spend counts both wallets. Cash withdrawal is a Bank→Cash transfer, never an expense.
- Salary adds to spendable only while its credit date is still ahead and no confirmed credit has landed.
- Cover from multiple saving envelopes is proportional to their savings, largest-remainder rounding to exact paise.
- Locked envelopes never give cover but can receive it.

## Commands
- `npm run dev`
- `npm run typecheck`
- `npm run lint`
- `npm test`

## Git & README
- Commit granularly (one focused change per commit, descriptive subject + body saying what and why) and push to `origin` (github.com/apurvamukherjee/spency-pocket-wallet) after each step, using the local git identity only. No `Co-Authored-By` or any other attribution trailers.
- Keep `README.md` current with every change: what works, how to run it, screenshots (in `docs/screenshots/`) refreshed at each phase milestone, and the Claude connector story (Spency as Claude's personal-wallet plugin via MCP).
@AGENTS.md
