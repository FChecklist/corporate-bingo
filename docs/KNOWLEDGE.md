# Knowledge file: Corporate Bingo (read this first)

Version **1.4.0** (22 Nov 2026), branch `p1/owner-rules-v1-1`, pull request 9. Not deployed. Newest changes: `CHANGELOG.md`. Detailed state, tests and open items: `docs/STATE.md`. Payment design: `docs/CONSOLE_PAY.md`. Voice rules: `docs/CONSOLE_VOICE.md`. What the other repositories are for: `KNOWLEDGE-MAP.md`.

## Owner rules v1.1 this game follows
- Organizer and host screens say "you". Zero first-person strings, kept by `apps/web/test/console-voice.test.ts`.
- The game starts by itself and numbers come by themselves. The two press-a-button formats ("you start", "you call") do **not** exist yet.
- People are invited by employee ID only. Every non-letter/number is dropped and capitals used, so `A-1101` = `A 1101` = `A/1101`. Unlisted IDs wait for yes or no. The invite log is for the organizer and hosts only.
- Paid only through the console's signed notice (`POST /api/console/paid`), once per order id. The game decides from its own tables (owner, size, not cancelled, not already paid). The same order id can be retried; a stuck order is released after 30 seconds (`MARKING_STUCK_MS`).
- Pay on the console page goes to the console (`https://console.corporatetambola.com/?game=bingo&eid=<game>`). No payment link, no "anyone can pay".
- Rupee sign, one privacy line, the fairness sentence (proved by `packages/beacon/test/fairness.test.ts`), no forbidden claims (`apps/web/test/owner-text.test.ts`, `apps/edge/test/owner-fixes-1-4-0.test.ts`).
- Money flags `PAY_VIA_CONSOLE` and `LOGIN_VIA_CONSOLE` stay OFF until the owner says go. Never put secrets in the repo.

## Things to know before you change anything
- `apps/edge/src/console-bridge/` is a byte-for-byte copy of the console repo's bridge (hashes in `MANIFEST.json`, checked by `bridge-copy.test.ts`). Do not edit it. A fix that belongs there goes to the console repo first.
- The stuck-order recovery lives in this game's wrapper (`releaseStaleMarking` and an order that can safely run twice in `consoleMarkPaid`), because the copied bridge leaves an order in "marking" after a one-off error.
- The server API still allows `whoCanJoin: "anyone"` when a caller says so on purpose (old tests and legacy callers). The console screen and the AI helper always send `list` + `id`.
- Run every test file as its own process. `apps/web/test/pages.test.ts` takes over 4 minutes: run it alone.
- Version number: change `version.json`, `package.json`, `apps/edge/package.json`, `apps/edge/src/releases.json` and `CHANGELOG.md` together (`apps/edge/test/version.test.ts` checks).

## Not done (needs the owner or another repository)
- "You start the game" and "You call the numbers" (needs a port of Tambola's signed `go` and `next` messages, about 700 lines plus host screens plus fairness tests).
- The console's "what does this pay step need" question (`payInfo`): its contract is not in this repository.
- The rest of the console link (session, games list, billing, hand-off, roles) and running the contract kit.
- Consent boxes K4 and K6 words (legal), the console-side fix for a stuck "marking" order (the wrapper here covers it for this game).
