# Cloud run 5 results

Branch `release/bingo-1.4.0`, HEAD `6b61314298676914b45b7813a9b13b7e8f149c21` (matches expected `6b61314`). Bun v1.4.4. Date 2026-10-30.

## Steps

| Step | Command | Exit |
|---|---|---|
| 1 | `bun install` | 0 |
| 2 | `bun run build:control` | 0 |
| 2 | `bun run build:report` | 0 |
| 2 | `bun run build:zgame` | 0 |
| 2 | `bun run pages:build` | 0 |
| 2 | `git checkout -- .` (tracked `bun.lock` kept, nothing untracked to delete) | 0 |
| 3 | `bun run typecheck` | 0 |
| 4 | `bun test --isolate packages/shared` | 0 |
| 4 | `bun test --isolate packages/billing` | 0 |
| 4 | `bun test --isolate packages/beacon` | 0 |
| 4 | `bun test --isolate tools/control-worker` | 0 |
| 4 | `bun test --isolate apps/web` | 1 |
| 4 | `bun test --isolate <edge group 1, 20 files>` | 0 |
| 4 | `bun test --isolate <edge group 2, 19 files>` | 0 |
| 4 | `bun test --isolate <edge group 3, 20 files>` | 1 |
| 4 | `bun test --isolate <edge group 4, 19 files>` | 1 |

Bun did not crash; no folder was split further. apps/edge has 78 `*.test.ts` files, split by `ls` order into 20/19/20/19.

## Typecheck

- Lines containing `error TS`: 0
- First 20: none
- Log: `results/typecheck.log`

## Counts

Copied from the last summary lines of each log.

| Folder | pass | fail | skip | files | log |
|---|---|---|---|---|---|
| packages/shared | 14 | 0 | 0 | 1 | results/shared.log |
| packages/billing | 26 | 0 | 0 | 1 | results/billing.log |
| packages/beacon | 218 | 0 | 0 | 12 | results/beacon.log |
| tools/control-worker | 1 | 0 | 0 | 1 | results/control-worker.log |
| apps/web | 340 | 1 | 0 | 26 | results/web.log |
| apps/edge group 1 | 303 | 0 | 0 | 20 | results/edge-1.log |
| apps/edge group 2 | 151 | 0 | 0 | 19 | results/edge-2.log |
| apps/edge group 3 | 629 | 1 | 0 | 20 | results/edge-3.log |
| apps/edge group 4 | 347 | 1 | 0 | 19 | results/edge-4.log |

No log has a skip summary line; skip is 0 (no `(skip)` lines).

## Failures

3 failing tests. Each rerun once alone (180 s timeout); logs `results/rerun-*.log`.

### 1. apps/web/test/no-internal-notes.test.ts
Test: `no internal notes in anything that is shipped > no file of the website or the Pages functions matches`

First 8 lines of error:
```
31 |       const s = readFileSync(f, "utf8");
32 |       const m = s.match(EVERYWHERE);
33 |       if (m) hits.push(`${relative(ROOT, f)}: ${m[0]}`);
34 |     }
35 |     expect(files).toBeGreaterThan(50);
36 |     expect(hits).toEqual([]);
                      ^
error: expect(received).toEqual(expected)
```
Further lines of the same error: received `["apps/web/public/pack/zc-flow.css: todo", "apps/web/public/pack/zc-flow.js: todo"]`, expected `[]`.
Rerun alone: same (exit 1, same two hits).

### 2. apps/edge/test/migrations.test.ts
Test: `the migration files (0001 to 0029) match SCHEMA in the Worker`

First 8 lines of error:
```
4 | // The SQL files wrangler applies must say exactly what the code expects, so a schema change cannot be forgotten at deploy time.
5 | const FILES = ["0001_init.sql", ... "0026_partner_key.sql", "0028_game_record.sql", "0029_game_log.sql"];
6 | test("the migration files (0001 to 0029) match SCHEMA in the Worker", async () => {
7 |   const sql = (await Promise.all(FILES.map((f) => Bun.file(new URL("../migrations/" + f, import.meta.url)).text()))).join("\n");
8 |   const norm = (s: string) => s.split("\n").filter((l) => !l.trim().startsWith("--")).join(" ").replace(/\s+/g, " ").trim();
9 |   expect(norm(sql)).toBe(norm(SCHEMA.map((s) => s + ";").join("\n")));
                        ^
error: expect(received).toBe(expected)
```
(Line 5 abbreviated here; full text in `results/edge-3.log`.) The log shows Expected ending with `ALTER TABLE engagement ADD COLUMN rehearsal_of TEXT; ALTER TABLE engagement ADD COLUMN run_no INTEGER; ALTER TABLE engagement ADD COLUMN rehearsal_closed_ms INTEGER; CREATE INDEX IF NOT EXISTS engagement_rehearsal ON engagement(rehearsal_of);` and Received ending with `PRIMARY KEY (eid, seq));`.
Rerun alone: same.

### 3. apps/edge/test/worker.test.ts
Test: `joining > a join returns what the phone needs to play and nothing about others`

First 8 lines of error:
```
51 |   test("a join returns what the phone needs to play and nothing about others", async () => {
52 |     const r = await (await join(1)).json() as any;
53 |     expect(r.startRound).toBe(FAR_START);
54 |     expect(r.callSeconds).toBe(6);
55 |     expect(r.pid).toMatch(/^1x[0-9a-f]{12}$/); // seat number + hash: the seat makes the ticket collision-free
56 |     expect(Object.keys(r).sort()).toEqual(["breaks", "callSeconds", "closing", "employeesOnly", "invites", "joinPhone", "jr", "opening", "pid", "rewards", "roomMode", "rounds", "startRound", "tickets", "trackClaims", "verify"]);
                                       ^
error: expect(received).toEqual(expected)
```
Further lines: diff shows received has an extra key `"idKind"` after `"employeesOnly"`.
Rerun alone: same.

## Not run

Nothing. Every folder and edge group printed a summary line.

## Verdict line

Not all green: apps/web has 1 fail, apps/edge groups 3 and 4 have 1 fail each.
