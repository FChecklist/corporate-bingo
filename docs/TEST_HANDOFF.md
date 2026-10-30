# TEST HANDOFF: Corporate Bingo release/bingo-1.4.0 (coder to test author), 2026-10-30
Coder rule from the boss: the coder writes product code only. This file lists what changed and what to test. Nothing below has been certified; "tests pass" is not claimed by the coder.

## How to start locally
`bun install`, then `python -I apps/web/tools/make_site.py` (regenerates the pages from the brand kit), `bun run pages:build`, and the edge worker as in README (apps/edge, TEST_MODE=1 for demo sign-ins). The web test harness clock is 1 Oct 2026 (apps/web/test/harness.ts `T`).

## Milestone 0: site on the brand kit + gap wave 1 (merge fffcb33 and later)
Files: apps/web/tools/site_shell.py, make_site.py, apps/web/public/*.html, bingo-site.css, bingo-console.css, kit css/js, gamesbar.*, apps/edge/src/trust-page.ts, brand.ts, mails.ts, releases.json.
Test: six-item menu on every public page (How it works | Free demo game | Guide | Brochure | Refer & earn | Log in); logo lockup "Corporate" over "Bingo"; kit files byte-identical to C:\ct\test-sites\corporate-brand-kit; games bar present on public pages only; canonical/og/sitemap use clean URLs; the word "private" absent; footer shows "Version 1.4.0, released 30 Oct 2026" (the release time is added at deploy); home page has the tie rule sentence and "Festive offer: 50% off"; no page promises an AI assistant.

## Milestone 1a: uniform employee ID (a12c6a1, 171392c)
Code: apps/edge/src/people.ts (empClean, normEmp, EMP_CLEAN_FROM_MS), worker.ts join/verify, z.js and zc.js hints.
Expect: 1B-678, 1b-678, 1B/678, 1B 678 -> 1B678 for games created at or after EMP_CLEAN_FROM_MS (placeholder 1793341800000, set at deploy); full-width, emoji, zero-width removed; only symbols = refused; 31+ cleaned characters = refused; older games keep the old rule; list upload names duplicates found only after cleaning (`sameAfterCleaning` in the /people reply and in the console summary); the page shows "The system will read this as ..." while typing (join page #empHint, organizer add box #gemphint); exports carry the cleaned ID.

## Milestone 1b: e-mail case-insensitive (f2b452f, 68712b6, 171392c)
Code: apps/edge/src/emailkey.ts used by hostsetup, google, mode, admin, pay, credit, helpdesk, partners, visits, testlogins, worker.
Expect: RAJAT1＠DEMO.COM, Rajat1＠Demo.com, rajat1@demo.com are one address on Host/Co-host setup and sign-in, Google sign-in, payment hash, partner and helpdesk forms; inner spaces are removed ("a b@c.com" becomes ab@c.com, so it is valid).

## Milestone 1c: Email ID criterion (8d1609a)
Code: packages/beacon/src/config.ts (idKind), worker.ts (info, settings, join), people.ts (normId, badIdMessage), z.js labels, zc.js step 2 "Which ID?".
Expect: settings PATCH {idKind:"email"} saved and returned by /api/z/:id/info; {idKind:"phone"} = 400; with verify id/both + idKind email, list rows and join use the Email ID (any case/full-width at-sign = same person, a second phone gets 423 "already joined"); half address = plain refusal mentioning Email ID; an e-mail typed in an employee-ID game is refused (new games: "This looks like an Email ID..."; older games: the old wording); organizer add-person placeholder still says Employee ID (known gap).

## Test files created by the coder so far (the test author takes them over)
apps/edge/test: emp-clean.test.ts, email-key.test.ts, email-key-grep.test.ts, email-id.test.ts; edited branding, terms, ai-enablement, verify, usecases, param-config, param-harness.
apps/web/test: brand-site.test.ts (new), gamesbar.test.ts (rewritten), edited seo, visits-dom, helpdesk-pages, pages (dates), wording-guard.
tools/sim2/scenarios/matrix/gen-people.mjs: "id-format" axis (24 scenarios, added at the end).
The planted-break harness is in the coder's scratchpad (plant.py); not in the repo.
Known test notes: param-life "limit set in the environment is the BASE" timed out once at 5 s under load; UC-5 now treats an e-mail with an inner space as valid.

## Milestone 2a: the new organizer flow, opt-in (this commit)
Code (product only, NOT run by the coder): the shared game pack vendored byte for byte from the console repo branch claude/master-console-complete-882589 (packages/game-pack -> apps/web/public/pack/ with MANIFEST.json, via tools/vendor-pack.mjs); apps/web/public/zc-flow-game.js (Bingo's descriptor: one card, board 75 numbers x 15 columns titled BINGO, no sample ticket preview, no rehearsal, no lucky draw, no next-number control, game log on); zc.js stands aside when ?flow=new; zc.html loads pack/zc-flow.css, zc-flow-game.js, pack/zc-flow.js and shows "Try the new screens" / "Use the previous screens" (swaps ?flow=new/old, keeps other parameters); pages/build.mjs ships the pack files.
Expect: /zc.html opens the previous console exactly as before; /zc.html?flow=new draws the five steps (Date and time; Who is this game for; Tickets and prizes; Brand & Breaks; Check and publish) and the Game dashboard; the prize list is Bingo's own (Line, Two Lines, Four Corners, Plus, X, Frame, Postage Stamp, Letter L, Letter T, Blackout); no ticket-count question (one card); no Super Bumper, rehearsal or lucky draw anywhere; the link on top switches back to the previous screens.
Risks to check first (the coder could not run it): the pack calls /api/z/:id/{info,life,settings,publish,prizes,prizegiven,claims,waiting,gamelog,paylink} and /api/z/ai-manifest: confirm each is answered in Bingo's shape; the pack sends Tambola-shaped settings (check the saved config for a Bingo game: tickets=1, rewards, rounds, verify/idKind); the dashboard board must show numbers 1 to 75; the old-console-only links (demo, pass, quick, new, cap, do, k, api) are not yet redirected to the previous screens (zc-mode.js not ported: the flow is opt-in only in this milestone).
Not done in 2a: default-on switch with the remembered choice (Tambola's zc-mode.js), Bingo's own adapter file zc-flow-bingo.js for Bingo-only sections, Host/Co-host screens (zc-flow-roles.js), Email ID choice inside the new step 2.

## M1 detail: Email ID criterion (idKind), every behaviour with expected result (reference for the other games; names are stable: `idKind` = "emp" | "email")
1. Default: a game with no idKind behaves as "emp" (employee ID). /api/z/:id/info and the organizer summary return `idKind` ("emp" or "email").
2. PATCH /api/z/:id/settings {idKind:"email"} -> 200, saved; {idKind:"emp"} -> 200, back to default (field removed from the stored config); {idKind:"phone"} or any other value -> 400 "What the ID is: an employee ID or an Email ID."
3. idKind only matters when verify is "id", "either" or "both"; with verify "mobile" nothing asks for an ID.
4. List add/upload with idKind "email": each row's empId is cleaned by emailKey (NFKC, spaces and zero-width removed, lower case; full-width at-sign allowed). Valid = one @, no spaces, a dot after it, at most 254 characters. A row that is not valid is returned in `invalid` with "Please check your Email ID. It looks incomplete."
5. Two rows that are the same address after cleaning (Rajat1＠Demo.com and RAJAT1@DEMO.COM): the second counts in `duplicates` and appears in `sameAfterCleaning` as {raw, as}; the console summary line starts "Same employee ID after cleaning: ...".
6. Join with idKind "email": body.empId in any case/with spaces/full-width at-sign matches the listed person; a different phone for the same person gets 423 (already joined); an address not on the list waits (list game) or joins (open game); an incomplete address is 400 with "Please check your Email ID. It looks incomplete."
7. Join page (z.js): the field label reads "Your Email ID" (or "Your employee ID"), email keyboard, no auto-capitals, max 254 characters; typing shows "The system will read this as <cleaned>" only when cleaning changes the text.
8. idKind "emp" game, new (created at or after EMP_CLEAN_FROM_MS): a typed text containing "@" is refused with "This looks like an Email ID. This game asks for an employee ID: letters and numbers only." and is never turned into letters. Older game: old rule and old wording.
9. Organizer console step 2 shows "Which ID?" (Employee ID / Email ID) when verify is not mobile; the add-person box placeholder, the Excel/CSV template columns and the downloaded list header follow the kind ("Email ID" or "Employee ID").
10. Stored identity: the hash of the cleaned ID (empHashOf) is the person's identity; exports and the list viewer show the cleaned ID.

## Milestone 2b (partial): roles rules helper
Code: apps/web/public/zc-flow-roles.js copied from Corporate Tambola (pure rules window.ZROLES: who may let a person in by the link used, 15-minute family cutoff, 30-minute wait limit, role sentences); loaded after the pack on /zc.html; shipped by pages/build.mjs. It only changes what the new flow says, not what the engine does.
Expect: with ?flow=new nothing breaks and window.ZROLES exists; approvalText("organizer") = "People who join with the game link wait for you or a Host."; decide({link:"open"}).outcome = "in"; decide({link:"listed", validation:"system", onList:true}).outcome = "in"; a pending payment gives "not_open".
Engine modules that Tambola has and Bingo does not yet have (M3 port list): approvals.ts, modes.ts, presence.ts, rehearsal.ts, rehearsal-mail.ts, report-email.ts, prospect-links.ts, owner-stats.ts, empid.ts (Bingo has the same rule in people.ts).
