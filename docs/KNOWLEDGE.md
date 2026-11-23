# Knowledge file: Corporate Bingo (read this first)

Version **1.5.1** (23 Nov 2026), branch `p1/owner-rules-v1-1`, pull request 9. Not deployed. This version contains the live production commit `f17d1906d8a7` (merged in; the PR had been 110 commits behind it) and the owner rules v1.1 work. Before any deploy, check that the audited head contains the live commit: `git merge-base --is-ancestor f17d1906d8a7 HEAD`. Newest changes: `CHANGELOG.md`. Detailed state, tests and open items: `docs/STATE.md`. Payment design: `docs/CONSOLE_PAY.md`. Voice rules: `docs/CONSOLE_VOICE.md`. What the other repositories are for: `KNOWLEDGE-MAP.md`.

## Owner rules v1.1 this game follows
- Organizer and host screens say "you". Zero first-person strings, kept by `apps/web/test/console-voice.test.ts`.
- The game starts by itself and numbers come by themselves. The two press-a-button formats ("you start", "you call") do **not** exist yet.
- People are invited by employee ID only. Every non-letter/number is dropped and capitals used, so `A-1101` = `A 1101` = `A/1101`. Unlisted IDs wait for yes or no. The invite log is for the organizer and hosts only.
- Paid only through the console's signed notice (`POST /api/console/paid`), once per order id. The game decides from its own tables (owner, size, not cancelled, not already paid). The same order id can be retried; a stuck order is released after 30 seconds (`MARKING_STUCK_MS`).
- Pay on the console page goes to the console (`https://console.corporatetambola.com/?game=bingo&eid=<game>`). No payment link, no "anyone can pay".
- Rupee sign, one privacy line, the fairness sentence (proved by `packages/beacon/test/fairness.test.ts`), no forbidden claims (`apps/web/test/owner-text.test.ts`, `apps/edge/test/owner-fixes-1-4-0.test.ts`).
- Money flags `PAY_VIA_CONSOLE` and `LOGIN_VIA_CONSOLE` stay OFF until the owner says go. The flag that closes this game's old pay routes is `PAY_VIA_CONSOLE`; `PAY_VIA_MONEYPENNY` is the console repository's own flag and does nothing here. Never put secrets in the repo.

## Things to know before you change anything
- `apps/edge/src/console-bridge/` is a byte-for-byte copy of the console repo's bridge (hashes in `MANIFEST.json`, checked by `bridge-copy.test.ts`). Do not edit it. A fix that belongs there goes to the console repo first.
- The stuck-order recovery lives in this game's wrapper (`releaseStaleMarking` and an order that can safely run twice in `consoleMarkPaid`), because the copied bridge leaves an order in "marking" after a one-off error.
- The server refuses `whoCanJoin: "anyone"` and makes a game that says nothing a game for its list (`openGamesAllowed` in `console-pay.ts`). On a settings save `closed` is accepted only when it is absent or `true`; `false`, `0`, `null`, `""` and anything else are refused with code `list-only` (1.5.1: `null` and `""` used to re-open a closed game). `LEGACY_OPEN_GAMES=1` is the old behaviour for old tests only (set by `apps/edge/test/with-terms.ts`); a test that wants the real rule sets it to `"0"` (`audit-1-5-1.test.ts`). Never set it on the live site.
- **"ID matched, not proven" is the owner's decision (BOSS; written in the suite's `SUITE_RULES.md`, which is not in this repository).** Anyone who types a listed ID gets that person's seat. A right ID is never counted and never limited per address; only wrong IDs are (30 per network per game per 10 minutes, `idMissOver` in `worker.ts`). Do not add limits on right IDs. The help text says so (zc.js "Invite people with just an ID" box). Do not write "verified", "proven" or "secure" about an ID.
- Any per-address key groups an IPv6 address by its /64 (`apps/edge/src/ipkey.ts`, `ipGroup`). Count in ONE statement (`INSERT ... ON CONFLICT DO UPDATE ... RETURNING`), never read-then-write.
- Run every test file as its own process. `apps/web/test/pages.test.ts` takes over 4 minutes: run it alone.
- Version number: change `version.json`, `package.json`, `apps/edge/package.json`, `apps/edge/src/releases.json` and `CHANGELOG.md` together (`apps/edge/test/version.test.ts` checks).

## Not done (needs the owner or another repository)
- "You start the game" and "You call the numbers" (needs a port of Tambola's signed `go` and `next` messages, about 700 lines plus host screens plus fairness tests).
- `payInfo` exists as this game's own read-only call (`POST /api/console/payinfo`, signed, owner only, dark without `CONSOLE_PUBKEYS`; the body is read with a 4096-byte limit, and a network that sends 20 requests a minute that cannot be checked is told to wait, 429; the count is in memory, never a database write). The console's contract has no such call, so the console must adopt it (it reuses the purpose "games" because the copied bridge has a closed list of purposes).
- "You start the game" and "You call the numbers" are coming in 1.6.0 (BOSS waived them in writing for 1.5.0).
- The rest of the console link (session, games list, billing, hand-off, roles) and running the contract kit.
- Consent boxes K4 and K6 words (legal), the console-side fix for a stuck "marking" order (the wrapper here covers it for this game).
