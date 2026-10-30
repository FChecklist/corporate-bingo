# Tester report: Bingo run 5 fixes

Branch: `tests/bingo-run5-fixes-2026-10-30` (from `origin/release/bingo-1.4.0`, head 6b61314)
Run: cloud sandbox, 2026-10-30, `bun test --isolate <folder>`, one folder at a time. Counts copied from the last summary lines of each log.

## Results

| Folder | pass | fail | Files | Note |
|---|---|---|---|---|
| packages/beacon | 218 | 0 | 12 | |
| packages/billing | 26 | 0 | 1 | |
| packages/shared | 14 | 0 | 1 | |
| apps/edge | 1432 | 0 | 78 | |
| apps/web | 341 | 0 | 26 | |
| tools/control-worker | 1 | 0 | 1 | |
| apps/cron | - | - | 0 | no test files (bun exits 1: "Tests need .test in the filename") |
| tools/errorlog | - | - | 0 | no test files |
| tools/legal | - | - | 0 | no test files |
| tools/sim2 | - | - | 0 | no test files (its checks run through `bun run sim*`, not `bun test`; not run here) |

Typecheck (`bun run typecheck` = `tsc --noEmit -p tsconfig.json`): exit 0, no errors.

Before the fixes (same sandbox): apps/web 340 pass / 1 fail. apps/edge was not run before the fixes in this sandbox; the two edge failures come from the run 5 report and docs/TEST_HANDOFF.md.

## What I changed (test files only)

1. `apps/edge/test/migrations.test.ts`: added `0030_rehearsal.sql` to `FILES`; title now says 0001 to 0030.
2. `apps/edge/test/worker.test.ts` (line 56, "a join returns what the phone needs to play..."): added `idKind` to the expected key list.
3. `apps/web/test/no-internal-notes.test.ts`: exempt the vendored pack's `todo` CSS class, nothing else (see the mismatch below).

## Mismatch with the task text (please read)

The task said to exempt "the file `.zf-ready.todo` inside `apps/web/public/pack/`". No such file exists. `.zf-ready.todo` is a CSS class name. The real hits were:
- `apps/web/public/pack/zc-flow.css` lines 136 and 147 (`.zf-ready.todo`)
- `apps/web/public/pack/zc-flow.js` line 741 (`(ok ? "ok" : "todo")`)

A file named `.zf-ready.todo` would not even be scanned (the test only reads known text extensions), so exempting it by file name would have fixed nothing.

I kept the intent ("only this, nothing else") and made the exemption as narrow as I could:
- only in those two files, and only the exact class text above is removed before scanning;
- any other TODO/note in those two files, in the rest of `pack/`, or anywhere else still fails.

I did not exempt the whole `pack/` folder, which docs/TEST_HANDOFF.md item 4 also offered as an option. If you wanted the folder-wide exemption, say so. Longer term, the cleaner fix is for the console repo to rename the class and re-vendor the pack; the pack must not be edited here.

## Break checks (red when the rule is broken, then green)

| Rule | Break | Result | Restored |
|---|---|---|---|
| migrations list matches SCHEMA | removed `0030_rehearsal.sql` from `FILES` | red (1 fail) | green (1 pass) |
| join returns only the allowed keys | removed `idKind` from expected list | red (1 fail, the join test) | green (111 pass, 0 fail in worker.test) |
| no internal notes | added `// TODO fix later` to the exempt `pack/zc-flow.js` | red (`zc-flow.js: TODO`) | |
| no internal notes | added `/* TODO */` to another pack file `pack/pack.css` | red (`pack.css: TODO`) | |
| no internal notes | added `<!-- TODO -->` to `apps/web/public/guide.js` | red (`guide.js: TODO`) | green (3 pass, 0 fail) |

All temporary breaks were reverted; `git status` shows only the three test files changed.

## Possible product issues

None found. The three failures were all test-side, as the coder's notes in docs/TEST_HANDOFF.md said, and I confirmed each against the code:
- `0030_rehearsal.sql` exists and the migrations test passes with it, so the migration matches `SCHEMA`.
- `idKind` is a per-game setting in the join settings object (also used by `email-id.test.ts`); its presence is expected.
- The `todo` class is in the vendored pack only and is not shown to users.

Observations (not bugs, not fixed):
- No `0027_*.sql` migration exists (list goes 0026, 0028). The test's schema match passes, so it looks intentional; worth one line of confirmation from the coder.
- `bun run test` at the repo root (`bun test packages apps tools/control-worker`) would exit 1 only if a folder has no tests; I ran folders one at a time as instructed, so I did not run that command.
