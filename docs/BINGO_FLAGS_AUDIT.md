# Bingo: flags audit list (new-flow flags)

For the boss, to flip them later one at a time. Branch `feat/bingo-on-engine-2026-10-31`, core 0.9.11 vendored. Every flag below ships OFF. The order to flip is in `docs/BINGO_RELEASE_READINESS.md` (exact sed commands). Each flip needs a rebuild, a deploy and a quiet live-game gate first.

How to read "proof": **in this branch** means a test file in this repo that runs the code with the flag on or checks the shipped value. **Not in this branch** means I know of no test here; the independent flag tests the boss ran earlier (the S-series for settle, the C-series for claim) are not in this repository, so please map them.

| # | Flag (file) | Shipped | What turning it on does | Proof in this branch | Not proved here |
|---|---|---|---|---|---|
| 1 | `CORE_SETTLE` (`packages/beacon/src/game.ts`) | `false` | Settlement goes through the common engine (`settleViaCore`: `assignOrdinals`, `seatCompletion`, `countedLog`, `roundEid`), keeping the organizer's own reward-line numbers. Same output shape and fate string as the live settle. | Live settle only: `packages/beacon/test/game.test.ts`, `houses.test.ts`, `houses-runtime.test.ts`, `late-joiner.test.ts` (flag off). | Same-answer comparison, live vs core, on many random games. This must come first. |
| 2 | `DEFAULT_NEW` (`apps/web/public/zc-mode.js`) with `?flow=new` | `false` | The six-step shared organizer flow replaces the old console. | Rendering checked by hand on the release (360 / 768 / 1280). | Automated: none. The pack's calls into Bingo endpoints are unchecked. |
| 2b | `EMP_CLEAN_FROM_MS` (`apps/edge/src/people.ts`), `APPROVAL_RULES_FROM_MS` (`approvals.ts`) | `Date.UTC(2099,0,1)` | Uniform employee-ID rule and approval rules for games created after the flip instant. Set to the flip instant together with flag 2. | `apps/edge/test/emp-clean.test.ts`, `email-id.test.ts` (employee-ID rule). | Approval rules after the instant. |
| 3 | `CLAIM_BTN` (`apps/web/public/z.js`) with `?claim=1` | address only | Gold Claim button on the phone card; a prize the phone already knows is held until Claim is pressed or 10 s. Changes no result. | None for `claimNow`; `phone-runtime.test.ts` covers the runtime around it. | Button shows and press behaviour (C-series, not here). |
| 4 | `RX_ON` (`z.js`) with `?rx=1`, Organizer switch `POST /api/z/{id}/rxmode` | address only | Short comic words in a corner strip, at most one per 15 s. Organizer can set Off / Still / On per game. | Guide catalog accepts the `rxmode` message (`apps/web/test/guide.test.ts`); `reactions.css` in the saved set (`apps/web/test/pwa.test.ts`). | The words appearing, the rate limit, the switch. The core has `bun tools/reactions-sim.ts` in the core clone. |
| 5 | `HOST_KEY_ENABLED` (`packages/beacon/src/control.ts`) and `HOSTKEY` (`zc.js`, `?hostkey=1`) | `false` / address only | Host signs Pause and Resume with its own key, approved once by the Organizer; End stays Organizer-only. Messages carry `by`. | `packages/beacon/test/control.test.ts` (organizer key path). | `signerOf`, `/control/hostoffer`, `/control/hostkey`, "Paused by the Host". Flip LAST: it touches the server file format. |
| 6 | `FUNNEL_ENABLED` (`apps/edge/src/funnel.ts`) and `var FUNNEL` (`apps/web/public/v.js`) | `false` / `false` | First-party sales funnel (13 events, below). Stores only event, day, visit or hashed game/payment id, size, game kind, reason. | `apps/edge/test/funnel.test.ts` (15), `apps/web/test/funnel-dom.test.ts` (5): see below. | The real owner report on live data. |

## Flag 6: the funnel, in detail
- Events: viewed, size_chosen, signup_started, game_created, game_published, payment_page_reached, payment_page_opened, payment_link_copied, payment_started, payment_succeeded, payment_failed, game_started, game_completed.
- Page events (`funnel.js` = core `makeReporter`, loaded by `v.js` only when its `FUNNEL` is true): viewed, size_chosen, signup_started, payment_page_opened. Server events (`recordFun`): the other nine. A page cannot send a server event.
- Hooks: `POST /api/z` (game_created), `/publish` (game_published, and payment_page_reached when unpaid), `/paylink` (payment_link_copied), pay checkout (payment_started), `fulfil` (payment_succeeded), webhook `payment.failed` (payment_failed), `lifecycleTick` (game_started once its time has come with people joined; game_completed after the end).
- Privacy: no name, mobile, e-mail, IP or page address is stored. Game and payment ids are stored only as a keyed hash. Global Privacy Control and Do Not Track: the page sends nothing; the server drops a request with `Sec-GPC: 1` or `DNT: 1`. A webhook or the timer has no such header and writes only an anonymous count.
- Table `funnel_event` is created on first use (`CREATE TABLE IF NOT EXISTS`), only when the flag is on. No migration is needed; no data is written while off.
- Owner report: `GET /api/owner/funnel?from=&to=` (JSON) and `&format=csv`, platform key only, access logged; page `/owner-funnel` (noindex).
- Proof by test (each in the single files above): each of the 13 events fired from the real code; a page cannot send a server event, a bad visit id or a long message; GPC/DNT; flag off stores nothing and creates no table (and the shipped source says `false`); report and CSV numbers and access log; one test fires every event with a real name, e-mail and mobile around and a hostile page trying to slip them into every field, then proves the table, report and CSV hold none of them.
- Flip: `export let FUNNEL_ENABLED = false;` to `true` in `apps/edge/src/funnel.ts`, and `var FUNNEL = false,` to `true` in `apps/web/public/v.js` (bump `funnel.js?v=` if funnel.js changes); `bun run build:funnel` only if `funnel-browser.ts` changes.
```bash
sed -i 's/export let FUNNEL_ENABLED = false;/export let FUNNEL_ENABLED = true;/' apps/edge/src/funnel.ts
sed -i 's/var FUNNEL = false,/var FUNNEL = true,/' apps/web/public/v.js
```

## What I could not prove
- No browser check of any new feature on a real game (needs an organizer sign-in code).
- Flags 1 to 5 have almost no tests in this branch; flipping any of them rests on the independent tests from the boss's earlier runs.
