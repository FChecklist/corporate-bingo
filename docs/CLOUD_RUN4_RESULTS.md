# Cloud run 4 results: release/bingo-1.4.0

- Date: 2026-10-30
- Branch tested: `release/bingo-1.4.0`
- Full SHA: `84eabfec0726fe11e33a030b107eac0fd505f3eb`
- Bun version: 1.4.4
- Runner only: nothing fixed, nothing deployed, nothing pushed to main.

## Steps

| Step | Command | Exit code |
|---|---|---|
| 1 | `git checkout release/bingo-1.4.0`, `git rev-parse HEAD` | 0 (SHA above) |
| 2 | `bun install` | 0 |
| 3 | `bun run build:control` | 0 |
| 3 | `bun run build:report` | 0 |
| 3 | `bun run build:zgame` | 0 |
| 3 | `bun run pages:build` | 0 |
| 3 | `git checkout -- .` (reverted control.js, reportgen.js, zgame.js) | 0 |
| 3 | delete untracked `bun.lock` | not applicable: `bun.lock` is a tracked file in this repo, no untracked copy existed, nothing deleted |
| 4 | `bun run typecheck` | 0 |
| 5 | `bun test --isolate packages/shared` | 0 |
| 5 | `bun test --isolate packages/billing` | 0 |
| 5 | `bun test --isolate packages/beacon` | 0 |
| 5 | `bun test --isolate tools/control-worker` | 0 |
| 5 | `bun test --isolate apps/web` | not recorded (the log shows 4 fail) |
| 5 | `bun test --isolate` apps/edge part 1 (20 files) | 0 |
| 5 | `bun test --isolate` apps/edge part 2 (19 files) | 0 |
| 5 | `bun test --isolate` apps/edge part 3 (20 files) | 1 |
| 5 | `bun test --isolate` apps/edge part 4 (19 files) | 1 |

Bun did not crash on any folder. apps/edge was split by file list (78 test files) into 4 parts as asked. apps/web took 242.90 s in one run.

## Typecheck

- Lines containing `error TS`: 0
- First 20 error lines: none (log: `results/typecheck.log`)

## Counts (copied from the last summary lines of each log)

| Folder | Pass | Fail | Skip | Files | Log |
|---|---|---|---|---|---|
| packages/shared | 14 | 0 | no skip line in log | 1 | results/packages_shared.log |
| packages/billing | 26 | 0 | no skip line in log | 1 | results/packages_billing.log |
| packages/beacon | 218 | 0 | no skip line in log | 12 | results/packages_beacon.log |
| tools/control-worker | 1 | 0 | no skip line in log | 1 | results/tools_control-worker.log |
| apps/web | 337 | 4 | no skip line in log | 26 | results/apps_web.log |
| apps/edge part 1 | 303 | 0 | no skip line in log | 20 | results/apps_edge_part1.log |
| apps/edge part 2 | 151 | 0 | no skip line in log | 19 | results/apps_edge_part2.log |
| apps/edge part 3 | 629 | 1 | no skip line in log | 20 | results/apps_edge_part3.log |
| apps/edge part 4 | 347 | 1 | no skip line in log | 19 | results/apps_edge_part4.log |

No totals computed.

## Failing tests (6 in the logs; as copied)

1. `apps/web/test/storage-notice.test.ts` : `R9: the storage notice matches the code > every key the scripts keep on a device is listed in storage-registry.json`
2. `apps/web/test/storage-notice.test.ts` : `R9: the storage notice matches the code > every key could be followed to its name (nothing is hidden behind a computed key)`
3. `apps/web/test/guide.test.ts` : `every message the server can send has a guide > each one is either guided (matched by a catalog entry) or on the list of messages no person ever sees`
4. `apps/web/test/no-internal-notes.test.ts` : `no internal notes in anything that is shipped > no file of the website or the Pages functions matches`
5. `apps/edge/test/migrations.test.ts` : `the migration files (0001 to 0029) match SCHEMA in the Worker`
6. `apps/edge/test/worker.test.ts` : `joining > a join returns what the phone needs to play and nothing about others`

First 8 lines of each error, in the order the failures appear in the logs (apps_web.log, then edge part 3, then edge part 4). Lines cut at 300 characters:

```
error: expect(received).toEqual(expected)

- []
+ [
+   "zc-mode.js: localStorage ?KEY",
+ ]

- Expected  - 1
error: expect(received).toEqual(expected)

- []
+ [
+   "zc-mode.js: ?KEY",
+ ]

- Expected  - 1
error: expect(received).toEqual(expected)

- []
+ [
+   "people.ts:528 [409] This request waited more than 30 minutes, so it has lapsed. The person can ask again.",
+ ]

- Expected  - 1
error: expect(received).toEqual(expected)

- []
+ [
+   "apps/web/public/pack/zc-flow.css: todo",
+   "apps/web/public/pack/zc-flow.js: todo",
+ ]

error: expect(received).toBe(expected)

Expected: "CREATE TABLE IF NOT EXISTS engagement (id TEXT PR... (22037 bytes truncated) ...ULL, proof TEXT NOT NULL, PRIMARY KEY (eid, seq)); ALTER TABLE engagement ADD COLUMN rehearsal_of TEXT; ALTER TABLE engagement ADD COLUMN run_no INTEGER; ALTER TABLE engagement ADD COLUMN rehearsal_closed_ms I
Received: "CREATE TABLE IF NOT EXISTS engagement (id TEXT PR... (22037 bytes truncated) ...ULL, proof TEXT NOT NULL, PRIMARY KEY (eid, seq));"

      at <anonymous> (/home/user/corporate-bingo/apps/edge/test/migrations.test.ts:9:21)
(fail) the migration files (0001 to 0029) match SCHEMA in the Worker [1.82ms]

error: expect(received).toEqual(expected)

@@ -5,2 +5,3 @@
    "employeesOnly",
+   "idKind",
    "invites",

- Expected  - 0
```

## Rerun alone (180 s timeout) and base comparison

Base `bd66d3c57f7600220ad7937800291617b3d93b49` was checked out in a separate worktree (`../base`), `bun install` exit 0, only the failing files were run there.

| File | Rerun on 84eabfe | Same / different vs full run | Base bd66d3c |
|---|---|---|---|
| apps/web/test/storage-notice.test.ts | exit 1, 5 pass, 2 fail | same 2 tests fail | exit 0, 7 pass, 0 fail |
| apps/web/test/guide.test.ts | exit 1, 12 pass, 1 fail | same | exit 0, 13 pass, 0 fail |
| apps/web/test/no-internal-notes.test.ts | exit 1, 2 pass, 1 fail | same | exit 0, 3 pass, 0 fail |
| apps/edge/test/migrations.test.ts | exit 1, 0 pass, 1 fail | same | exit 0, 1 pass, 0 fail |
| apps/edge/test/worker.test.ts | exit 1, 110 pass, 1 fail | same | exit 0, 111 pass, 0 fail |

Logs: `results/rerun_*.log`, `results/base_*.log`.

## Comparison with run 2 (typecheck 0, 2012 pass, 4 date fails in pages.test.ts)

- Typecheck: 0 in run 2, 0 now.
- Gone: the 4 failures in `apps/web/test/pages.test.ts` do not appear in this run's apps/web log.
- New (6 failing tests in 5 files, none failed in run 2): the 6 listed above. All 5 files pass on base `bd66d3c`.
- Run 2 file counts per folder: apps/web 26 files, same as now. apps/edge was split 19/19/18/18 in run 2 and 20/19/20/19 now.

## Not run

- `apps/cron`: no test files were run (not in the task's folder list).
- `node tools/sim2/*` simulations and UI scenarios: not in this task.
- Exit code of the full `apps/web` run: not recorded.
