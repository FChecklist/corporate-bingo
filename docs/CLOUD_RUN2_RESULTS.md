# Cloud run 2 results: release/bingo-1.4.0

- Date: 2026-10-30. Head tested: `bc540f3`. Base for comparison: `bd66d3c` (Bingo 1.3.2). Run 1 is in `docs/CLOUD_RUN1_RESULTS.md` (branch `cloud/bingo-run1-results-2026-10-30`, head `68e8f42`).
- Machine: cloud container, 4 cores, 15 GB RAM. `bun install` clean (17 packages).
- Nothing was fixed, deployed or pushed to main. Only this file was added.
- Tests ran on the committed bundles (the three rebuilt bundles were reverted before the test run, same as run 1). Container clock is 2026-10-30.

## Build and typecheck

| Step | Result |
|---|---|
| `bun install` | OK |
| `build:control`, `build:report`, `build:zgame`, `pages:build` | All OK |
| Rebuilt bundles vs committed | `apps/web/public/control.js`, `reportgen.js`, `zgame.js` still differ from the committed copies after a rebuild (15 lines changed, minified), same as run 1. Reverted. The committed bundles may be stale; the owner should decide whether to commit a rebuild. |
| `bun run typecheck` | **0 errors**, exit 0. (Run 1: 82 errors.) The libphonenumber note did not apply here; no missing-module error appeared. |

## Counts per folder (`bun test --isolate`, one folder at a time)

| Folder | Pass | Fail | Skipped | Files |
|---|---|---|---|---|
| packages/shared | 14 | 0 | 0 | 1 |
| packages/billing | 26 | 0 | 0 | 1 |
| packages/beacon | 218 | 0 | 0 | 12 |
| tools/control-worker | 1 | 0 | 0 | 1 |
| apps/web | 337 | 4 | 0 | 26 |
| apps/edge part 1 (19 files) | 294 | 0 | 0 | 19 |
| apps/edge part 2 (19 files) | 177 | 0 | 0 | 19 |
| apps/edge part 3 (18 files) | 603 | 0 | 0 | 18 |
| apps/edge part 4 (18 files) | 342 | 0 | 0 | 18 |
| apps/edge total | 1416 | 0 | 0 | 74 |
| apps/cron | no test files | | | |
| **Total** | **2012** | **4** | **0** | |

`apps/web/test/gamesbar.test.ts` alone (180 s timeout): 3 pass, 0 fail, 161 ms. Fixed (run 1: failed after 52 s).

## Remaining failures (4, all in `apps/web/test/pages.test.ts`)

All four are PRE-EXISTING: they fail on base `bd66d3c` too (run 1 measured base: 129 pass, 4 fail, these four). Cause: test dates are fixed in the past or far ahead, and the rule "a game not paid for can be set at most 30 days ahead" now rejects them on a 2026-10-30 clock.

1. "the console for an AI that works in the browser > Quick setup: real date and time pickers ..." First error: `save failed; error box: A game that is not paid for yet can be set at most 30 days ahead. Please pick a day within the next 30 days...`
2. "console: prize houses from the one table (ZG.PRIZE_HOUSES) > Quick setup lists the same houses ..." First error: `timed out waiting; page says: Corporate BingoSigned in as Organizer ... Day (your time, Asia/Kolkata) ...` (stuck on the date step, same cause).
3. "... 'Create a new game like this one' ..." First error: `timed out waiting; page says: ... Copied game · 1 Oct 2026 4:30 pm ...` (draft dated 1 Oct 2026).
4. "... Rescheduling: a date more than 30 days ahead is refused politely ..." First error: `timed out waiting; page says: ... Your game · 1 Oct 2026 4:30 pm ... A game that is not paid for yet can start at most 30 days from today.`

Suggested fix (for the laptop session, not done here): make these tests compute dates from the current clock.

## Run 1 versus run 2

Run 1: 42 failures. Run 2: 4.

Fixed (38):
- packages/beacon `secrets-names-doc.test.ts` (ONLY_12S in SECRETS_NAMES.md): fixed.
- apps/web `seo.test.ts` image alt/size (trust.html): fixed.
- apps/web `wording-guard.test.ts`, all 5 (B04, B19 x2, B03 and the sibling): fixed.
- apps/web `gamesbar.test.ts` order check: fixed.
- apps/web `pages.test.ts` Invite and share block (item 8) and partner link (item 9): fixed.
- apps/edge `branding.test.ts` (18 tests, theme colour, offer line): fixed.
- apps/edge `ai-enablement.test.ts` (2): fixed.
- apps/edge `terms.test.ts` (8, `legaltop`, footer, Bingo-only wording): fixed.
- apps/edge `secrets-list.test.ts` (1): fixed.
- Typecheck: 82 errors down to 0.

Still failing (4): the four date-dependent `pages.test.ts` tests above (run 1 items 10 to 13). No new failures appeared.

## Not run

`node tools/sim2/*` simulations and the real-Chrome UI scenarios (the task asked for the test suites only).
