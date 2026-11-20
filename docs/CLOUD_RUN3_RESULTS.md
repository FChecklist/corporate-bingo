# Cloud run 3 results: release/bingo-1.4.0

- Date: 2026-10-30
- Branch tested: `release/bingo-1.4.0`
- Full SHA: `969630e1d104e6012566b6894a2e897e146f6bbc` (`68712b6` is an ancestor of it; checked with `git merge-base --is-ancestor`, exit 0)
- Bun version: 1.4.4 (38afee6c8)
- Nothing was fixed, deployed or pushed to main. Only this file and `results/` were added.

## Steps

| Step | Command | Exit code |
|---|---|---|
| 1 | `git checkout release/bingo-1.4.0` | 0 |
| 2 | `bun install` | 0 |
| 3 | `bun run build:control` | 0 |
| 3 | `bun run build:report` | 0 |
| 3 | `bun run build:zgame` | 0 |
| 3 | `bun run pages:build` | 0 |
| 3 | `git checkout -- .` (reverted `apps/web/public/control.js`, `reportgen.js`, `zgame.js`) | 0 |
| 4 | `bun run typecheck` | 0 |
| 5 | `bun test --isolate packages/shared` | 0 |
| 5 | `bun test --isolate packages/billing` | 0 |
| 5 | `bun test --isolate packages/beacon` | 0 |
| 5 | `bun test --isolate tools/control-worker` | 0 |
| 5 | `bun test --isolate apps/web` | 0 |
| 5 | `bun test --isolate` apps/edge part 1 (20 files) | 0 |
| 5 | `bun test --isolate` apps/edge part 2 (20 files) | 0 |
| 5 | `bun test --isolate` apps/edge part 3 (20 files) | 0 |
| 5 | `bun test --isolate` apps/edge part 4 (17 files) | 0 |

Notes:
- `bun.lock` is a tracked file in this repo and was not changed by install, so there was no untracked `bun.lock` to delete.
- apps/edge has 77 test files; they were split into parts of 20, 20, 20 and 17 files. No Bun crash (panic, segfault, internal assertion) appeared in any log, so no extra splitting was needed.
- `apps/web` exceeded the 120 s tool limit and was moved to a background task; it completed normally (exit 0).

## Typecheck

- Lines containing `error TS`: 0
- First 20 error lines: none (log: `results/typecheck.log`)

## Counts (last summary lines of each log, copied)

| Folder | Pass | Fail | Skip | Files | Log file |
|---|---|---|---|---|---|
| packages/shared | 14 | 0 | no skip line | 1 | results/packages_shared.log |
| packages/billing | 26 | 0 | no skip line | 1 | results/packages_billing.log |
| packages/beacon | 218 | 0 | no skip line | 12 | results/packages_beacon.log |
| tools/control-worker | 1 | 0 | no skip line | 1 | results/tools_control-worker.log |
| apps/web | 341 | 0 | no skip line | 26 | results/apps_web.log |
| apps/edge part 1 | 303 | 0 | no skip line | 20 | results/apps_edge_part1.log |
| apps/edge part 2 | 177 | 0 | no skip line | 20 | results/apps_edge_part2.log |
| apps/edge part 3 | 624 | 0 | no skip line | 20 | results/apps_edge_part3.log |
| apps/edge part 4 | 324 | 0 | no skip line | 17 | results/apps_edge_part4.log |

Summary lines as printed:
- packages/shared: ` 14 pass`, ` 0 fail`, `Ran 14 tests across 1 file. [367.00ms]`
- packages/billing: ` 26 pass`, ` 0 fail`, `Ran 26 tests across 1 file. [119.00ms]`
- packages/beacon: ` 218 pass`, ` 0 fail`, `Ran 218 tests across 12 files. [21.87s]`
- tools/control-worker: ` 1 pass`, ` 0 fail`, `Ran 1 test across 1 file. [69.00ms]`
- apps/web: ` 341 pass`, ` 0 fail`, `Ran 341 tests across 26 files. [251.59s]`
- apps/edge part 1: ` 303 pass`, ` 0 fail`, `Ran 303 tests across 20 files. [12.03s]`
- apps/edge part 2: ` 177 pass`, ` 0 fail`, `Ran 177 tests across 20 files. [10.19s]`
- apps/edge part 3: ` 624 pass`, ` 0 fail`, `Ran 624 tests across 20 files. [25.91s]`
- apps/edge part 4: ` 324 pass`, ` 0 fail`, `Ran 324 tests across 17 files. [98.11s]`

## Failures

None. No test failed in any folder, so there were no failing files to copy, rerun alone, or run on the base commit `bd66d3c` (steps 7 and 8 had nothing to act on; no `../base` worktree was created).

## Comparison with run 2 (`docs/CLOUD_RUN2_RESULTS.md`, branch `cloud/bingo-run2-results-2026-10-30`)

Run 2 failures: 4, all in `apps/web/test/pages.test.ts`.
- Gone (not failing in run 3): all 4.
  1. "the console for an AI that works in the browser > Quick setup: real date and time pickers ..."
  2. "console: prize houses from the one table (ZG.PRIZE_HOUSES) > Quick setup lists the same houses ..."
  3. "... 'Create a new game like this one' ..."
  4. "... Rescheduling: a date more than 30 days ahead is refused politely ..."
- New (failing in run 3 but not in run 2): none.

## Not run

- `apps/cron`: contains `src` and `wrangler.toml` only; `find apps/cron -name "*.test.*"` returned 0 files (run 2 also listed it as no test files).
- `node tools/sim2/*` simulations and real-Chrome UI scenarios (`sim`, `sim:life`, `sim:matrix`, `sim:ui`): not part of this task.
- Rerun of failing files alone and base-commit run: not applicable, no failures.
