# Cloud run 1 results: release/bingo-1.4.0

- Date: 2026-10-30. Head tested: `68e8f42` (Footer: Version 1.4.0). Base for comparison: `bd66d3c` (Bingo 1.3.2).
- Machine: cloud container, 4 cores, 16 GB RAM, Bun 1.4.4, `bun install` clean (17 packages, lockfile not changed).
- Nothing was fixed, deployed or pushed to main. Only this file was added.
- Commands: `bun test --isolate <folder>` one folder at a time. `apps/edge` (74 files) was split into 4 parts by file list; Bun did not crash on any part.
- Note: the container clock is 2026-10-30. The four date-related failures in pages.test.ts also fail on base, so they are not caused by this merge.

## Build and typecheck

| Step | Result |
|---|---|
| `bun install` | OK |
| `build:control`, `build:report`, `build:zgame`, `pages:build` | All OK |
| Rebuilt bundles vs committed | `apps/web/public/control.js`, `reportgen.js`, `zgame.js` differ from the committed copies after a rebuild (15 lines changed, minified). The committed bundles may be stale. I reverted them and ran tests on the committed files. |
| `bun run typecheck` (`tsc --noEmit`) | 82 errors, all in `apps/edge/test/*` (none in `src`): 80 x TS2345 (header object `{ "x-organizer": string } \| {}` passed as `Record<string,string>`), 2 x TS2367. Files: param-people (21), param-config (17), join-gaps (13), room-mode (8), demo-pass (8), param-life (7), param-harness (3), gamelog (3), shared-read (2). Full list was not kept in the repo. Not checked on base. |

## Counts per folder

| Folder | Pass | Fail | Skipped | Files | Time |
|---|---|---|---|---|---|
| packages/shared | 14 | 0 | 0 | 1 | 0 s |
| packages/billing | 26 | 0 | 0 | 1 | 0 s |
| packages/beacon | 217 | 1 | 0 | 12 | 17 s |
| tools/control-worker | 1 | 0 | 0 | 1 | 0 s |
| apps/web | 329 | 12 | 0 | 26 | 326 s |
| apps/edge part 1 (19 files) | 274 | 20 | 0 | 19 | 9 s |
| apps/edge part 2 (19 files) | 177 | 0 | 0 | 19 | 9 s |
| apps/edge part 3 (18 files) | 603 | 0 | 0 | 18 | 19 s |
| apps/edge part 4 (18 files) | 334 | 9 | 0 | 18 | 68 s |
| apps/edge total | 1388 | 29 | 0 | 74 | |
| apps/cron | no test files | | | | |
| **Total** | **1975** | **42** | **0** | | |

(apps/web count includes gamesbar and brand-site, which were also run alone, below.)

## The two files the laptop never saw finish

- `apps/web/test/brand-site.test.ts` alone: 34 pass, 0 fail, 26 ms. Does not hang.
- `apps/web/test/gamesbar.test.ts` alone (timeout 180 s): exit 1 after 52 s. 2 pass, 1 fail. It does not hang for good, but one test is very slow. The assertion at line 25 of the test fails (the bar is not the second child of body, or a similar check on that line), and Bun then spends ~50 s trying to print the failed comparison of two huge DOM objects; it ends with "The error message exceeds the maximum string length" and "timed out after 5000ms". So: a real failure, plus a slow failure message that looks like a hang. On base the file passes (2 tests).

## Failures

Class: **NEW** = passes on base `bd66d3c`, fails now. **PRE** = fails on base too. **NEW FILE** = test file does not exist on base, so there is no baseline.

### packages/beacon (1)
1. NEW. `packages/beacon/test/secrets-names-doc.test.ts`: "config/SECRETS_NAMES.md > a setting that pages/wrangler.toml [vars] sets is listed as a wrangler var". First error: `["ONLY_12S", ["wrangler var"]]` expected, got `["ONLY_12S", []]`. Cause: `ONLY_12S` is in `pages/wrangler.toml` [vars] but missing from `config/SECRETS_NAMES.md`.

### apps/web (12)
2. NEW. `seo.test.ts`: "each indexable page > every image has alt text and a size, and the picture at the top loads early". First error: `["trust.html", true]` expected, got `false` (an `<img>` in trust.html lacks alt, or width/height).
3. NEW FILE. `wording-guard.test.ts`: "B04 ... the home page says what happens when two cards finish together". `index.html` does not match `/same number[^<]*fixed public rule[^<]*one card/`.
4. NEW FILE. `wording-guard.test.ts`: "B19 ... nobody says 22 or 23 hours". Hit: `apps/web/public/guide.html`: "Your report link works for 22 hours, so open it before then."
5. NEW FILE. `wording-guard.test.ts`: "B19 ... the organizer guide says the report link works for exactly the hours in lifecycle.ts". `organizer-guide.html` has no "report link works for N hours" text (regex returned null).
6. NEW FILE. `wording-guard.test.ts`: "B03 ... the home page, the price list, the guide ... do not mention [an AI assistant]". 4 hits in `index.html` ("free AI helper", "Give your own AI assistant the work link ...").
7. NEW. `gamesbar.test.ts`: "the bar sits right after the skip link, lists the six games and the home mark, and marks Bingo as the current game". Slow (52 s) failure, see above.
8. NEW. `pages.test.ts:409`: "console (organizer page) > Invite and share: three boxed blocks ...". `toEqual` got 23 extra lines: the sheet text now contains the "Refer & earn" block (and more) that the test does not expect. Test and page disagree.
9. NEW. `pages.test.ts:750`: "Refer & Earn page > the page is linked from the home page and listed for search engines ...". `index.html` does not contain `href="/partner.html"`.
10. PRE. `pages.test.ts:1017`: "the console for an AI that works in the browser > Quick setup: real date and time pickers ...". Error: "A game that is not paid for yet can be set at most 30 days ahead." Fixed test dates vs today's date.
11. PRE. `pages.test.ts:1619`: "console: prize houses from the one table > Quick setup lists the same houses ..." Timed out waiting (same date cause).
12. PRE. `pages.test.ts:1706`: "... 'Create a new game like this one' ..." Timed out waiting (draft dated 1 Oct 2026).
13. PRE. `pages.test.ts:1726`: "... Rescheduling: a date more than 30 days ahead is refused politely ...". Timed out waiting.

Base run of pages.test.ts: 129 pass, 4 fail (items 10 to 13 only).

### apps/edge (29)
14. NEW (18 tests). `branding.test.ts` "pages: one title pattern, icons, manifest, theme colour": 16 pages (index, report, legal, terms, dpa, subprocessors, partner-terms, organizer-guide, partner, pay, big, zc, z, ai-link, signin, 404) fail with `Expected to contain: name="theme-color" content="#0B5D5B"`. The pages carry `#0B3D91`. Also "the PWA manifest and the build ship the brand" expects `#0B5D5B`. Also "claims register ... structured data prices equal the real packs" expects "Festive offer: 50% off" which is missing. Decision needed: test is old, or the pages are wrong.
15. NEW (2 tests). `ai-enablement.test.ts`: (a) "the public Trust page and llms.txt are exactly what the facts generate": generated text differs from the committed `trust.html`/`llms.txt` by one line (the `ck-legal` paragraph, "IT Services by Rajat Agarwal ..."). (b) "the Trust page and llms.txt are served as public pages ...": expected to contain `/trust.html`, which is not found (index.html has 0 mentions; file `trust.html` and `llms.txt` do exist).
16. NEW (8 tests). `terms.test.ts` "the document pages": terms, legal-position, dpa, subprocessors, partner-terms, organizer-guide each fail with `Expected to contain: class="legaltop"`; plus "the pages are named in the footer of every page that has a legal footer, in the sitemap, and in the build" (one boolean `true` expected, `false` received) and "the public website pages describe Bingo only ..." (one extra item in a list that should be empty).
17. NEW (1 test). `secrets-list.test.ts`: "A9 ... every name the code reads or declares is in config/SECRETS_NAMES.md". Reports `"ONLY_12S (read in apps/edge/src/worker.ts)"` missing. Same root cause as item 1.

Base run of branding, ai-enablement, terms and secrets-list: 67 pass, 0 fail.

## Summary of classification

- Pre-existing: 4 (all in pages.test.ts, date dependent).
- New from the merge: 38 (including 5 in `wording-guard.test.ts`, a file that does not exist on base).
- Root causes seen: (a) theme colour `#0B3D91` vs test `#0B5D5B`, 18 tests; (b) `ONLY_12S` missing from SECRETS_NAMES.md, 2 tests; (c) legal pages without `legaltop`, 8 tests; (d) trust/llms.txt out of step, 2 tests; (e) wording-guard vs site copy, 5 tests; (f) Refer & Earn / partner link vs pages.test, 2 tests; (g) trust.html image attributes, 1 test; (h) gamesbar order, 1 test.
- Not run: `node tools/sim2/*` simulations and the real-Chrome UI scenarios (the task asked for the test suites only).
