# Tester report: Corporate Bingo 1.4.1 (v3), 2026-10-31

Branch `tests/bingo-1.4.1-v3-2026-10-31` = product head `fix/bingo-1.4.1-audit-2026-10-30` (dcb58af, round 5) + the test files of `tests/bingo-1.4.1-2026-10-30` (74b2345) + this pass. I write tests only. **Product code changed: nothing** (`git diff --name-only origin/fix/bingo-1.4.1-audit-2026-10-30 HEAD` lists only `*/test/*` and `docs/` files). Ran in a cloud sandbox with `bun test --isolate <folder>`, one folder at a time.

## Results

| Folder | pass | fail | files |
|---|---|---|---|
| packages/shared | 14 | 0 | 1 |
| packages/beacon | 218 | 0 | 12 |
| packages/billing | 26 | 0 | 1 |
| tools/control-worker | 1 | 0 | 1 |
| apps/edge | 1504 | **6** | 82 |
| apps/web | 364 | **2** | 27 |

`bun run typecheck`: exit 0, **0 errors** (before and after my test changes).

**All 8 red tests are on purpose.** They are named `PRODUCT DEFECT D1 / D2`, they state the owner rule, and they stay red until the product is fixed. Nothing else is red. Fix the product, then these go green; do not edit them to match the code.

## PRODUCT DEFECTS (not fixed, not hidden)

**D1. Employee ID over 30 characters once cleaned has no "too long" sentence.** Rule: `This ID is too long. An employee ID may be up to 30 characters once cleaned.` The text does not exist anywhere in the product (`grep` over apps/ and packages/ finds nothing). Real answer today is the generic `An employee ID has letters and numbers only (up to 30).`
- Input: employee-ID game on the new rule (dated at `EMP_CLEAN_FROM_MS`), `empId` = 31 x `A` (or `a-` x 31, which cleans to 31).
- Expected: 400 / invalid-row `why` / typing hint = the too-long sentence. Actual: the "letters and numbers only (up to 30)" sentence on join, list-add and `/who`; the join page (z.js) and console (zc.js) show `The system will read this as AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA` (31 letters) instead.
- Code: `badIdMessage` in `apps/edge/src/people.ts:74`, hint in `apps/web/public/z.js:92` and `apps/web/public/zc.js:627`.
- Red tests: `apps/edge/test/audit-141-v3.test.ts` "E. PRODUCT DEFECT D1" (join, list add, /who); `apps/web/test/audit-141.test.ts` "PRODUCT DEFECT D1 (pages)" (join page, console).
- Green neighbours: 30 cleaned characters is accepted; 31 is refused (only the words are wrong).

**D2. `endedAtMs` does not exist in Bingo 1.4.1.** No route, field or code named `endedAtMs` (or `endedAt` outside the pause logic in `control.ts`). The nearest thing is `GET /api/z/:id/life`, which returns `endMs` and `endSrc` **always**, including while the game can still be live, so "absent while the game can be live" and "returned only once now >= bound" cannot hold. I could not test "organizer end": there is no organizer end route (the only organizer write to `life` is the erase, `lifecycle.ts:152`, which the rule says is not an end).
- Input: `GET /api/z/PPL-1/life` on a scheduled game at `now = bound` (bound = `endMs` + 0), and again 3 days later; and after a phones-confirmed `life` row (`end_src='phones'`, `end_ms = T+1234`) read at two different clocks.
- Expected: `endedAtMs` = bound (scheduled, once now >= bound, unchanged later); `endedAtMs` = `T+1234` at any clock (phones). Actual: key missing (`undefined`) in every case.
- Red tests: `audit-141-v3.test.ts` "E. PRODUCT DEFECT D2" (3 red). Green pin: a purged game has no `endedAtMs` (true only because the key does not exist at all; it will become a real check when D2 is fixed). Cancel is not an end: same, not separately testable until the field exists.

## Observations (not defects, not asserted)

- O1. An employee-ID box holding only U+0085 (no other characters) answers "refused" (`letters and numbers only`) not "nothing typed". Both are refused, so the empty-ID rule holds. `normEmp` strips `[\s U+200B-U+200D U+2060 U+FEFF]` for "nothing typed", not U+0085. 15,388 of the 1,000,000 matrix inputs are of this kind.
- O2. Account/sign-in e-mails: an invisible character at the START or END is trimmed (accepted); INSIDE it is refused. Rule says refuse inner ones; ends are not mentioned. Pinned only by the existing "Rajat1＠Demo.com " test (a trailing space is accepted).
- O3. The old `docs/audit141-break-checks.py` (from the earlier test branch) no longer applies: its edit targets were changed by rounds 3-5. Use `docs/v3-break-checks.py`.
- O4. The editing tool in this environment silently turns `\uXXXX` escapes typed in source into raw characters. A raw U+2028 inside a regex literal broke one file with a syntax error. All test files in this branch were converted back to escapes (`\u0085`, ` `, ...) and re-read.

## What changed in tests, and why

Old tests that encoded OLD behaviour were fixed (the product is right):
- `audit-141.test.ts`: lock sentence for a verify-only change is now `...different way of asking for IDs.` (second sentence added to the checks); a name-only guest and a mobile-only guest no longer lock (round 3: only people holding an ID hash lock), so the "joined" tests join with a listed ID; `accountEmail` turns an inner invisible character into a space (kept, then refused by the shape check) instead of dropping it; exact regex text for `INVISIBLE_RE` and the page scripts updated (now includes U+0085, U+2028, U+2029).
- `audit-141.test.ts` rehearsal routes: the `test.failing` 404 pin became a plain test (round 3 added the routes to the pattern).
- `apps/web/test/audit-141.test.ts`: summary now says `Same Email ID after cleaning` in an Email-ID game and `Already on the list: Asha again (asha@acme.com)` (names the duplicate); a server-refused row keeps the person's name; a line with only an Email ID is accepted (round 4); old-game console hint is now empty (was pinned wrong, P4); step 2 opens on and saves the saved `verify / idKind / employeesOnly` unchanged (was P2: two `test.failing` + two pins became three plain tests); the dead `EMAIL_UNUSABLE_MESSAGE` and its guide card are gone (test now asserts they are gone), the lock sentence has its guide card (the card for the dead message was replaced); `?flow=new` now opens the previous screens (round 5), so the "Which ID?" new-flow test now asserts the pack draws nothing and the old console runs.
- Carried from the earlier test branch (product branch lacked them): `migrations.test.ts` (0030 in the list), `worker.test.ts` (join keys), `no-internal-notes.test.ts` (pack `todo` class), `verify.test.ts` (name-only join; now: allowed to change `verify` because a name-only guest holds no ID hash).

New tests (gaps):
- `apps/edge/test/audit-141-v3.test.ts` (26 tests, 6 red = D1 x3, D2 x3): A. employee-ID cleaning (NFKC, upper case, A-Z0-9, full-width, circled digits, ligature, Kelvin sign, sharp s, accents dropped), cap 30 after cleaning (29/30/31, 60 typed that clean to 30, 62 typed that clean to 31), empty and symbols-only refused at join and list-add, duplicates after cleaning flagged and named, e-mail in an employee-ID game gets the plain refusal; B. participant Email ID with each of the 8 invisible characters inside and at the ends, escape names as text (a lost backslash would eat them), real routes; C. account/sign-in/Host refuse each invisible character inside; D. lock sentences (kind / verify / both), who counts; E. defects D1, D2.
- `apps/edge/test/audit-141-v3-matrix.test.ts` (2 tests): the employee-ID matrix below + 72 inputs through the real list-add route.
- `apps/web/test/audit-141.test.ts`: D1 on the join page and console.
- Letter **s** coverage (the lost-backslash regex): `audit-141.test.ts` "Email IDs that contain the letter s are ACCEPTED", the 1M Email ID matrix (902,891 inputs with an s), and the source scan that fails on `[^s@]`. Proof of red: break V7 below.

## Streamed matrices

**Employee ID** (`audit-141-v3-matrix.test.ts`): 24 kinds in turn (plain, lower, hyphens, mixed separators, spaces/tabs, full-width, zero-width and U+0085/2028/2029, circled digits, junk around, mixed, exactly 30, 30 from 60+ typed, 31 plain, 31-40 with punctuation, symbols only, nothing typed, e-mail shaped, ligature, sharp s, accents, Kelvin sign, full-width-at e-mail, 29 + separator, 32+). Each input is built from a unique core (last 4 characters = its number in fixed-width base 36), so the expected answer comes from the construction; a second rule written code point by code point is checked on every input too.
- Generated **1,000,000**, distinct raw inputs **1,000,000** (exact `Set`), repeats skipped in the final run: **0**. (An earlier draft of my generator made 287 repeats; they were skipped and counted, then I made the core unique by construction.)
- Accepted 708,334 (all distinct, all `^[A-Z0-9]{1,30}$`, cleaning again changes nothing); nothing typed 41,667; refused 249,999 (over 30, symbols only, e-mail shaped). Wrong results: **0**. Disagreements with the second rule: **0**.
- Inputs with lower case 644,344; separators 442,601; invisible characters 120,063; full-width 125,000; non-ASCII 524,458; more than 30 characters typed 206,801; longest 66.

**Email ID** (`audit-141-matrix.test.ts`, existing, now with U+0085, U+2028, U+2029 in the invisible set): generated 1,000,000, distinct 1,000,000, skipped repeats 0, accepted 625,002, refused 374,998, wrong results 0, every accepted Email ID lower case with no white space or invisible character, 902,891 inputs contain the letter s, 164,207 hold invisible characters.

Both matrices end with a real list-add slice (employee: 72 inputs, 3 per kind; Email: 90 valid + 10 refused) that keeps exactly the cleaned IDs.

## Deliberate breaks: red, then restored

`python3 docs/v3-break-checks.py` (about 6 minutes). Per break: baseline fail count of the named test files, ONE wrong edit to a product file, fail count again, `git checkout -- <file>`, fail count again. The baseline of `audit-141-v3.test.ts` is 6 (the D1/D2 defect tests), so "red" means the count went UP.

| id | what is broken | product file | fails before | during | after | first tests that went red |
|---|---|---|---|---|---|---|
| V1 | employee ID cap 30 becomes 31 after cleaning | apps/edge/src/people.ts | 6 | 10 | 6 | A. employee ID (cap 30), employee-ID matrix |
| V2 | participant Email ID keeps U+0085 (leaves the invisible set) | apps/edge/src/emailkey.ts | 6 | 16 | 6 | B. participant Email ID, source scan |
| V3 | lock: the "different way of asking for IDs" sentence replaced by the kind sentence | apps/edge/src/worker.ts | 6 | 11 | 6 | D. id-kind lock (sentences), 4. PATCH idKind/verify |
| V4 | account e-mail mends an inner invisible character instead of refusing | apps/edge/src/emailkey.ts | 6 | 15 | 6 | C. account / sign-in / Host refuse |
| V5 | employee ID no longer made upper case | apps/edge/src/people.ts | 6 | 14 | 6 | A. employee ID, employee-ID matrix |
| V6 | lock ignores people who JOINED (participant table not read) | apps/edge/src/people.ts | 6 | 7 | 6 | 4. PATCH idKind/verify (joined) |
| V7 | `EMAIL_ID_RE` loses its backslash: `[^\s@]` becomes `[^s@]` (letter s refused) | apps/edge/src/people.ts | 6 | 19 | 6 | B. participant Email ID (s addresses), source scan, matrix |

7 of 7 broke (red) and came back (fail count equal to the baseline). V1-V6 ran in one run, V2 and V7 in later runs (V2 was first aimed at U+2028/2029, which JS `\s` also covers, so that break only reddened the text scan; I changed it to U+0085, which only the explicit list covers). **Product diff after every run: EMPTY** (`git diff --stat -- apps packages tools pages config` printed nothing; final `git diff --name-only origin/fix/bingo-1.4.1-audit-2026-10-30 HEAD` has no file outside `*/test/*` and `docs/`).

## Not covered

- PDF upload (needs the PDF reader); it ends in the same `cleanBatch` as paste and CSV.
- Live deployment: everything ran on the in-memory test database and a DOM, not on Cloudflare.
- "Organizer end" of a game (no such route exists, see D2) and a cancel's effect on `endedAtMs` (field missing).
- Independent cloud run: not done by me, per the standard.
