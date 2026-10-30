# Tester report: Bingo 1.4.1 audit fixes

Branch `tests/bingo-1.4.1-2026-10-30` = `origin/tests/bingo-run5-fixes-2026-10-30` (cb330dc) + merge of `origin/fix/bingo-1.4.1-audit-2026-10-30` (750b0fb). Cloud sandbox, 2026-10-30, `bun test --isolate <folder>`, one folder at a time. No product file was changed (checked with `git status` after every break run). Counts are copied from the last summary lines of each log.

## Results (final run)

| Folder | pass | fail | Files |
|---|---|---|---|
| packages/beacon | 218 | 0 | 12 |
| packages/billing | 26 | 0 | 1 |
| packages/shared | 14 | 0 | 1 |
| apps/edge | 1482 | 0 | 80 |
| apps/web | 365 | **1** | 27 |
| tools/control-worker | 1 | 0 | 1 |

Typecheck (`bun run typecheck`): exit 0, no errors. It was already 0 right after the merge, so there was nothing to fix. It is still 0 with the new test files.

**The one web failure is a PRODUCT defect, left red on purpose** (`apps/web/test/guide.test.ts`, "every message the server can send has a guide"): `worker.ts:2060 [409] You already have people listed. Start a new game to use a different kind of ID.` has no card in `guide.js`. The coder's own new message has no guide entry. Fix is in `guide.js` (product), not mine to make.

Baseline after the merge, before my work (apps/edge): 1430 pass / 2 fail. Both were old tests that the fix legitimately changed, now updated (see "Existing tests I changed").

## What I added (tests, helpers, docs only)

| File | Tests | Covers |
|---|---|---|
| `apps/edge/test/audit-141.test.ts` | 43 | items 1, 2, 3 (server side), 4, 5, 6 |
| `apps/edge/test/audit-141-matrix.test.ts` | 3 | item 1, 1,000,000-address matrix + 100-person real-route slice |
| `apps/web/test/audit-141.test.ts` | 25 | items 3 (pages), 7, 8, 9 |
| `apps/edge/test/migrations.test.ts` | +3 | migration 0030 |
| `docs/audit141-break-checks.py` | - | applies and undoes the 37 deliberate breaks |

### Existing tests I changed
1. `apps/edge/test/worker.test.ts:56`: the join answer now also has the key `idClean` (fix item 3). Added to the expected key list.
2. `apps/edge/test/verify.test.ts` (Bingo's name-only join next to the ID): it joined a guest and then changed `verify` to `both`. Since 1.4.1 that is correctly refused (409 id-kind-locked). Kept the intent: the joined-guest part now checks the 409 and that the same value still saves; the `both` rule is checked in a new test on a game nobody has joined.

## Email ID matrix (item 1)

Streamed, one address at a time, nothing kept except a bit map and 64-bit hashes of the raw inputs.
- Generated: **1,000,000** raw inputs, **1,000,000 distinct** (hash check: 1,000,000 distinct hashes; every address carries its own base-36 number).
- Accepted **625,002**, refused **374,998**. Expected counts come from how each address was built, and every address was also checked by a second rule written without regex (`oracle`): 1,000,000 of 1,000,000 agree.
- 24 kinds in turn: plain, upper case, full-width at-sign, inner spaces, zero-width (all five), plus tags, digits, local part exactly 64, total exactly 254, mixed everything, NBSP/tab/ideographic space, full-width letters, plus sets that must be refused (no @, no dot, 1-letter ending, empty local, double @, local 65, total 255, dot first, trailing dot) and s-heavy addresses.
- Inputs that contain the letter s (any case): 902,891; with capitals: 411,332; full-width at-sign: 214,772; inner blanks: 197,622; zero-width: 164,207; plus tag: 395,305; longest raw input 258 characters.
- Result: 0 wrong results; every accepted Email ID is lower case, has no white space, no zero-width characters, is at most 254 long, and each came back exactly once. 90 valid + 10 refused spellings also went through the real list-add route and came back clean in the list.
- Also: all 13 x 13 x 13 mixes of blanks and zero-width characters alone count as "nothing typed" (empty string, not an error).

## Deliberate breaks: red then green

`python3 docs/audit141-break-checks.py` (about 5 minutes). For each: product file right, test file green; ONE wrong edit; test file red; file restored, green again. Result of the run: **37 of 37 behaved; product files clean afterwards.**

| id | what is broken | file | green before | red during (fail count) | tests that went red | green after |
|---|---|---|---|---|---|---|
| B01 | EMAIL_ID_RE loses the backslash in \s (the letter s is refused) | `apps/edge/src/people.ts` | green (43 pass) | RED (7) | 1. EMAIL_ID_RE (people.ts) and the cleaners: real backslashes > Email IDs that contain the letter s are ACCEPT; 1. EMAIL_ID_RE (people.ts) and the cleaners: real backslashes > inner spaces of every k| green |
| B02 | EMAIL_ID_RE: the dot before the last part is no longer escaped | `apps/edge/src/people.ts` | green (43 pass) | RED (5) | 1. EMAIL_ID_RE (people.ts) and the cleaners: real backslashes > incomplete addresses are refused (null), nothi; 1. EMAIL_ID_RE (people.ts) and the cleaners: real backslashes > the dot before the last| green |
| B03 | accountEmail: the zero-width list loses its backslash (u200B-u200D becomes a letter range) | `apps/edge/src/emailkey.ts` | green (43 pass) | RED (30) | 1. EMAIL_ID_RE (people.ts) and the cleaners: real backslashes > Email IDs that contain the letter s are ACCEPT; 1. EMAIL_ID_RE (people.ts) and the cleaners: real backslashes > the dot before the last| green |
| B04 | emailKey stops removing inner spaces (participant Email ID keeps them) | `apps/edge/src/emailkey.ts` | green (43 pass) | RED (4) | 1. EMAIL_ID_RE (people.ts) and the cleaners: real backslashes > inner spaces of every kind are removed from a ; 1. EMAIL_ID_RE (people.ts) and the cleaners: real backslashes > accountEmail KEEPS inne| green |
| B05 | accountEmail removes inner spaces (sign-in would mend 'ra jat@..' instead of refusing) | `apps/edge/src/emailkey.ts` | green (43 pass) | RED (5) | 1. EMAIL_ID_RE (people.ts) and the cleaners: real backslashes > accountEmail KEEPS inner spaces (trim, NFKC, l; 2. account / sign-in / Host / payment / form e-mails REFUSE inner spaces; the participa| green |
| B06 | normId (email): 'nothing typed' test loses the backslash in the zero-width list | `apps/edge/src/people.ts` | green (43 pass) | RED (3) | 1. EMAIL_ID_RE (people.ts) and the cleaners: real backslashes > incomplete addresses are refused (null), nothi; 1. EMAIL_ID_RE (people.ts) and the cleaners: real backslashes > source scan: no regex i| green |
| B07 | /who no longer refuses an unusable ID (back to known:false) | `apps/edge/src/worker.ts` | green (43 pass) | RED (3) | 3. employee-ID game vs Email ID: plain refusal, no 'The system will read this as'; Email-ID games use the e-ma; 3. employee-ID game vs Email ID: plain refusal, no 'The system will read this as'; Emai| green |
| B08 | lock ignores people who JOINED (participant) | `apps/edge/src/worker.ts` | green (43 pass) | RED (1) | 4. PATCH idKind / verify: 409 id-kind-locked once anyone is LISTED (person) or JOINED (participant) > one pers | green |
| B09 | lock ignores people who are LISTED (person) | `apps/edge/src/worker.ts` | green (43 pass) | RED (2) | 4. PATCH idKind / verify: 409 id-kind-locked once anyone is LISTED (person) or JOINED (participant) > one pers; 4. PATCH idKind / verify: 409 id-kind-locked once anyone is LISTED (person) or JOINED (| green |
| B10 | lock gives another error code | `apps/edge/src/worker.ts` | green (43 pass) | RED (4) | 4. PATCH idKind / verify: 409 id-kind-locked once anyone is LISTED (person) or JOINED (participant) > one pers; 4. PATCH idKind / verify: 409 id-kind-locked once anyone is LISTED (person) or JOINED (| green |
| B11 | lock covers idKind but not verify | `apps/edge/src/worker.ts` | green (43 pass) | RED (3) | 4. PATCH idKind / verify: 409 id-kind-locked once anyone is LISTED (person) or JOINED (participant) > one pers; 4. PATCH idKind / verify: 409 id-kind-locked once anyone is LISTED (person) or JOINED (| green |
| B12 | lock sentence changed | `apps/edge/src/worker.ts` | green (43 pass) | RED (4) | 4. PATCH idKind / verify: 409 id-kind-locked once anyone is LISTED (person) or JOINED (participant) > one pers; 4. PATCH idKind / verify: 409 id-kind-locked once anyone is LISTED (person) or JOINED (| green |
| B13 | EMP_CLEAN_FROM_MS set to 2020 (new employee-ID rule on for every game) | `apps/edge/src/people.ts` | green (43 pass) | RED (3) | 3. employee-ID game vs Email ID: plain refusal, no 'The system will read this as'; Email-ID games use the e-ma; 5. EMP_CLEAN_FROM_MS and APPROVAL_RULES_FROM_MS: 2099-01-01 until the release session s| green |
| B14 | APPROVAL_RULES_FROM_MS set to 2020 (30-minute rule on for every game) | `apps/edge/src/approvals.ts` | green (43 pass) | RED (2) | 5. EMP_CLEAN_FROM_MS and APPROVAL_RULES_FROM_MS: 2099-01-01 until the release session sets them > both default; 5. EMP_CLEAN_FROM_MS and APPROVAL_RULES_FROM_MS: 2099-01-01 until the release session s| green |
| B15 | rehearsal takes the clock, not the real game's created_ms | `apps/edge/src/rehearsal.ts` | green (43 pass) | RED (2) | 6. rehearsal inherits created_ms; ensureRehearsalColumns adds only what is missing; migration 0030 and the run; 6. rehearsal inherits created_ms; ensureRehearsalColumns adds only what is missing; mig| green |
| B16 | ensureRehearsalColumns no longer skips existing columns | `apps/edge/src/rehearsal.ts` | green (43 pass) | RED (2) | 6. rehearsal inherits created_ms; ensureRehearsalColumns adds only what is missing; migration 0030 and the run; 6. rehearsal inherits created_ms; ensureRehearsalColumns adds only what is missing; mig| green |
| B17 | ensureRehearsalColumns: the column-name regex loses its backslash (\w) | `apps/edge/src/rehearsal.ts` | green (43 pass) | RED (2) | 6. rehearsal inherits created_ms; ensureRehearsalColumns adds only what is missing; migration 0030 and the run; 6. rehearsal inherits created_ms; ensureRehearsalColumns adds only what is missing; mig| green |
| B18 | normId: an e-mail in an employee-ID game is mangled again instead of refused | `apps/edge/src/people.ts` | green (43 pass) | RED (2) | 3. employee-ID game vs Email ID: plain refusal, no 'The system will read this as'; Email-ID games use the e-ma; 3. employee-ID game vs Email ID: plain refusal, no 'The system will read this as'; Emai| green |
| B19 | info/summary idClean always false | `apps/edge/src/worker.ts` | green (43 pass) | RED (1) | 3. employee-ID game vs Email ID: plain refusal, no 'The system will read this as'; Email-ID games use the e-ma | green |
| B20 | sign-up (/api/start) mends inner spaces instead of refusing | `apps/edge/src/worker.ts` | green (43 pass) | RED (1) | 2. account / sign-in / Host / payment / form e-mails REFUSE inner spaces; the participant Email ID removes the | green |
| B21 | Host add mends inner spaces instead of refusing | `apps/edge/src/worker.ts` | green (43 pass) | RED (1) | 2. account / sign-in / Host / payment / form e-mails REFUSE inner spaces; the participant Email ID removes the | green |
| B22 | checkout e-mail check mends inner spaces | `apps/edge/src/pay.ts` | green (43 pass) | RED (1) | 2. account / sign-in / Host / payment / form e-mails REFUSE inner spaces; the participant Email ID removes the | green |
| B23 | matrix: EMAIL_ID_RE allows 65-character local parts | `apps/edge/src/people.ts` | green (3 pass) | RED (2) | Email ID matrix: 1,000,000 distinct addresses through the participant Email ID cleaner > every address is acce; the same matrix, a slice of it, through the real list-add route > 90 valid and 10 refus| green |
| B24 | matrix: Email ID no longer lower-cased | `apps/edge/src/emailkey.ts` | green (3 pass) | RED (2) | Email ID matrix: 1,000,000 distinct addresses through the participant Email ID cleaner > every address is acce; the same matrix, a slice of it, through the real list-add route > 90 valid and 10 refus| green |
| B25 | matrix: zero-width characters no longer removed from a participant Email ID | `apps/edge/src/emailkey.ts` | green (3 pass) | RED (2) | Email ID matrix: 1,000,000 distinct addresses through the participant Email ID cleaner > every address is acce; the same matrix, a slice of it, through the real list-add route > 90 valid and 10 refus| green |
| B26 | migration 0030 loses a column | `apps/edge/migrations/0030_rehearsal.sql` | green (4 pass) | RED (3) | the migration files (0001 to 0030) match SCHEMA in the Worker; 0030_rehearsal.sql: exactly the three columns and the index, nothing else, equal to REHEARSAL_SCHEMA in rehear; applying the files 0001 | green |
| B27 | REHEARSAL_SCHEMA and 0030 disagree (a column type changes) | `apps/edge/src/rehearsal.ts` | green (4 pass) | RED (3) | the migration files (0001 to 0030) match SCHEMA in the Worker; 0030_rehearsal.sql: exactly the three columns and the index, nothing else, equal to REHEARSAL_SCHEMA in rehear; applying the files 0001 | green |
| B28 | 'Which ID?' switched on in the new flow | `apps/web/public/zc-flow-game.js` | green (25 pass) | RED (1) | 7. 'Which ID?' is hidden in Bingo's new flow (zc-flow-game.js:8), and still works in the console when it is tr | green |
| B29 | join page hint appears for an e-mail in an employee-ID game | `apps/web/public/z.js` | green (25 pass) | RED (1) | 3a. the join page (z.js:92): 'The system will read this as ...' only where the server really cleans > employee | green |
| B30 | console hint/refusal: e-mail in a new-rule employee-ID game is no longer refused | `apps/web/public/zc.js` | green (25 pass) | RED (2) | 3b/9. console: the typing hint, paste, CSV; duplicates after cleaning are NAMED in the summary > typing hint (; 3b/9. console: the typing hint, paste, CSV; duplicates after cleaning are NAMED in the | green |
| B31 | console: Email-ID rows cleaned with the employee-ID cleaner | `apps/web/public/zc.js` | green (25 pass) | RED (4) | 3b/9. console: the typing hint, paste, CSV; duplicates after cleaning are NAMED in the summary > typing hint (; 3b/9. console: the typing hint, paste, CSV; duplicates after cleaning are NAMED in the | green |
| B32 | console: the Email ID shape check in zc.js loses the backslash in \s | `apps/web/public/zc.js` | green (25 pass) | RED (2) | 3b/9. console: the typing hint, paste, CSV; duplicates after cleaning are NAMED in the summary > Email-ID game; 3b/9. console: the typing hint, paste, CSV; duplicates after cleaning are NAMED in the | green |
| B33 | console: duplicates after cleaning are dropped silently again | `apps/web/public/zc.js` | green (25 pass) | RED (3) | 3b/9. console: the typing hint, paste, CSV; duplicates after cleaning are NAMED in the summary > Email-ID game; 3b/9. console: the typing hint, paste, CSV; duplicates after cleaning are NAMED in the | green |
| B34 | guide.js: a card string no longer matches what the Worker sends | `apps/web/public/guide.js` | green (25 pass) | RED (3) | 8. guide.js: no duplicate entry, no template syntax, the three new cards match what the Worker really sends > ; 8. guide.js: no duplicate entry, no template syntax, the three new cards match what the| green |
| B35 | guide.js: template syntax in a new card | `apps/web/public/guide.js` | green (25 pass) | RED (1) | 8. guide.js: no duplicate entry, no template syntax, the three new cards match what the Worker really sends >  | green |
| B36 | guide.js: the game-ended row is duplicated | `apps/web/public/guide.js` | green (25 pass) | RED (1) | 8. guide.js: no duplicate entry, no template syntax, the three new cards match what the Worker really sends >  | green |
| B37 | guide.js: the e-mail-in-employee-game card is removed | `apps/web/public/guide.js` | green (25 pass) | RED (3) | 8. guide.js: no duplicate entry, no template syntax, the three new cards match what the Worker really sends > ; 8. guide.js: no duplicate entry, no template syntax, the three new cards match what the| green |

Product files after the run: CLEAN (nothing changed)


(The "tests that went red" column is cut to the first failing test names. Re-run the script for the full list.)

## Item by item

1. **EMAIL_ID_RE / backslashes: OK.** sales, rahul.sharma, assist, SALES＠ACME.COM accepted; `a@b`, `a@bcom`, `x@.com`, `@acme.com`, `a@@b.com`, 65-char local part, 255-char total refused with "Please check your Email ID. It looks incomplete." Zero-width strips tested with all five characters and with text like `Bu200Dfeff2060CE@Dubai-U200B.com` (a lost backslash would eat letters). A source scan of all edge `.ts` and the page scripts finds no `[^s@]`, no unescaped zero-width list, no unescaped dot before the ending; the exact regex text is asserted in people.ts, emailkey.ts, hostsetup/google/helpdesk/pay/worker/partners and zc.js/z.js.
2. **Account vs participant: OK.** `/api/start`, `/api/auth/email`, Host add, `/api/host/setup/email`, `/api/checkout`, `/api/payments/paytest`, Refer & earn enrolment, helpdesk join all refuse `ra jat＠acme.com` and similar; `Rajat1＠Demo.com ` and `rajat1@demo.com` are one account; participant Email IDs lose inner spaces (list and join).
3. **Employee-ID game: server OK, console deviates.** An e-mail in a new-rule employee-ID game gets exactly `This looks like an Email ID. This game asks for an employee ID: letters and numbers only.` from join, list-add and `/who` (400 `bad-id`), never "read this as". Join page (z.js) and console behave as written for Email-ID games and new-rule games. Email-ID game uses the e-mail cleaner for join, add-person, paste and CSV. `/info` and the summary both return `idClean`. `/who` empty ID is still `known:false`. See product defect P4 for old games in the console.
4. **id-kind-locked: OK on the server.** 409, code `id-kind-locked`, exact sentence, when anyone is listed (table `person`, nobody joined), or joined (table `participant`, person rows deleted to isolate it), also for a Host key and in a mobile-number game; allowed with nobody; same values and unrelated settings still save. Note: joining also writes a `person` row, so the two tables only differ when I delete the row by hand (the participant break B08 needed that). A removed person does not lock (pinned). See P2 for what this does to the console.
5. **Constants: OK.** Both are `Date.UTC(2099,0,1)`; both sides tested with the exported constants (employee-ID rule, `approvalRulesOn`, `waitSince`, and an end-to-end waiting request that stays "waiting" in an old game and becomes "lapsed" in a game dated at the constant). The test that pins 2099 must be edited in the same commit by the release session (it says so).
6. **Rehearsal / 0030: OK, with P1.** `startRehearsal` copies the real game's `created_ms` (old-rule game: rehearsal `idClean` false, new-rule: true). `ensureRehearsalColumns` adds only missing columns (one ALTER for whichever column is missing, none after the migration, three before it). Running the real 0030 file after the runtime has added the columns fails with "duplicate column name", exactly as the handoff warns. migrations.test now checks 0030 text, equals `REHEARSAL_SCHEMA`, every file in `migrations/` is listed, files applied in order give the same tables as `SCHEMA`. These were tested by calling `startRehearsal` directly because of P1.
7. **'Which ID?': OK.** `ZFLOW_GAME.idKind` is false, the pack's only heading is under `if (G.idKind)`, the step-2 save omits `idKind`, the new flow page shows no "Which ID?". Flag switched on in the test: the pack loads with it true (the new-flow step 2 itself could not be reached in the test DOM: it is locked until step 1 is saved and the save answered "Not allowed."; so the heading is proven by source plus the break B28, not by a rendered step 2). Bingo's own console shows "Which ID?" only after a non-mobile choice is clicked.
8. **guide.js: mostly OK.** "The game has ended..." appears once; no template syntax in any entry; the new rows have none. Card 1 and card 2 match strings the Worker really sent in a real join. **Card 3 matches a string the Worker never sends** (see O1).
9. **Upload duplicates named: OK in the page.** Paste and CSV: two spellings of one address are named ("Same employee ID after cleaning: ... (read as ...)"). See O4 for a gap.

## PRODUCT defects (evidence; not fixed)

**P1. The three rehearsal routes cannot be reached (404).** `GET /api/z/{id}/rehearsals`, `POST /api/z/{id}/rehearsal`, `POST /api/z/{id}/rehearsalclose` are handled at `worker.ts` ~1549-1560, but the route pattern at `worker.ts:1486` (`join|claims|settle|...|gamelog`) does not list `rehearsal`, `rehearsals` or `rehearsalclose`. Result today: all three answer `404 {"error":"Not found","hint":...}` before the handler. Same in cb330dc and release/bingo-1.4.0 (introduced by commit 84eabfe). The new-flow dashboard (`pack/zc-flow.js` lines 710, 823, 827) calls exactly these URLs, and `zc-flow-game.js` says `rehearsal: true`, so the "3 free rehearsals" cards would show "Not found". Tests: `test.failing` "the HTTP routes ... are reachable" (turns red the day it is fixed, then remove the marker) and a pin that shows the three 404s.
**P2. Console step 2 does not know the saved "what a person must give".** `zc.js:1192` builds `S.cfg` from the participants answer, which has no `verify`, `employeesOnly` or `idKind`; `formFromServer` (zc.js:183) then starts from defaults. Evidence (test `4b`): a saved game with verify id / idKind email / employees only opens step 2 with "Name or mobile number" pressed; "Save and continue" without touching it sends `{"verify":"mobile","idKind":"emp","employeesOnly":false,...}`. With nobody listed the server accepts it and the game silently becomes a mobile game. With one person listed, 1.4.1 answers 409 id-kind-locked, so no step-2 setting (even the people limit) can be saved, and the message ("Start a new game...") blames an organizer who changed nothing. Bug existed before 1.4.1; the lock makes it visible. Tests: two `test.failing` (expected behaviour) and two pins.
**P3. No guide card for the new lock message** (details in Results). `apps/web/test/guide.test.ts` is red because of it.
**P4. Console hint in games made before the new rule contradicts handoff item 3 ("older games get no hint").** In an old employee-ID game the console shows `The system will read this as 1B-678` for `1b-678`, and `The system will read this as RAJAT1@DEMO.COM` for an e-mail that the server then refuses. The join page (z.js) correctly shows nothing. Tests: one pin, one `test.failing`.

## Observations (smaller, not asserted as bugs)

- O1. `EMAIL_UNUSABLE_MESSAGE` (approvals.ts:31) is defined, matched by guide card 3, and used nowhere: the Worker never sends it. Pinned (`uses === 0`).
- O2. In a paste, a line holding only an Email ID with no name (`asha@acme.com`) is read as a name, so it lands in "look wrong" (the parser only recognises employee-ID-shaped single tokens). Pinned.
- O3. A row the server refuses comes back in the "look wrong" list without the person's name ("No name").
- O4. A row cleaned on the page to an address already on the list (`ASHA＠Acme.com` vs listed `asha@acme.com`) is counted as a duplicate but not named in the summary, because the server only sees the clean form. Pinned.
- O5. The summary line says "Same employee ID after cleaning" even in an Email-ID game.
- O6. The lock also counts name-only guests (a mobile-number game that has had one guest cannot switch to "ID" any more). It is what the handoff says; the organizer-facing consequence is worth a product decision.
- O7. `guide.js` has older shadowed duplicate fragments (e.g. entries 13 and 41 both match "Enter your employee ID"; 53 and 71 both "You were removed from this game"). Not from 1.4.1; harmless because the first match wins.
- O8. From reading the regex only (not run): `a@b..com` is accepted by `EMAIL_ID_RE`, because any dot with 2+ characters after it counts.

## Not covered

- PDF upload (needs the PDF reader); it ends in the same `cleanBatch` as paste and CSV.
- The rendered step 2 of the new flow (see item 7).
- The 1.4.1 checks on a live deployment; everything ran against the in-memory test database.
