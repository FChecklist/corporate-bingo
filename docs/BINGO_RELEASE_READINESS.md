# Bingo: release readiness of the common-engine work

Branch `feat/bingo-on-engine-2026-10-31`. Core vendored: game-core 0.9.0 (1934ebc), file `vendor/game-core/CORE_VERSION`.
Nothing here is deployed. Every item below is OFF by default, so the live game is unchanged until a flag is flipped.
I have not run any test or opened any browser page for this work. "Tests that exist" means files already in the repo that touch the same code; none was written for the new parts.

## 1. New organizer flow (six steps)
- Default now: OFF. The old console opens. The new screens open with `?flow=new` on `/zc.html`.
- What it changes: the shared pack screens (Game, People, Time, Prizes, Brand and Breaks, Check and publish) replace the old console. Sign-in names are bridged by `zc-flow-bridge.js`.
- Tests that exist: none for the new flow. The pack's API calls against Bingo endpoints are not checked.
- Flip on (default for everyone): in `apps/web/public/zc-mode.js` change `var DEFAULT_NEW = false;` to `true`.
```bash
sed -i 's/var DEFAULT_NEW = false;/var DEFAULT_NEW = true;/' apps/web/public/zc-mode.js
```
- Flip back: the reverse sed. Try it first on one game with `?flow=new`.
- Known gap: the pack's People step has no Host row. Hosts are added in the old console's Team block.

## 2. Settle adapter (settlement through the common engine)
- Default now: OFF (`CORE_SETTLE = false`, `packages/beacon/src/game.ts`).
- What it changes: when on, `settleAll` asks the core `settleFromLog` with seats, `countFrom` and `callRounds`. Same output shape and the same rule (public log plus seat list, one winner per prize line, fate `CB1-TIE|eid|seat|tie|house|ordinal`).
- Known difference to check: the core numbers prize lines 1..n and caps them at the house maximum; the live code uses the actual reward-line numbers.
- Tests that exist: `packages/beacon/test/game.test.ts`, `houses.test.ts`, `houses-runtime.test.ts`, `late-joiner.test.ts` cover the LIVE settle. None runs with the flag on. A same-answer comparison (live vs core on many random games) is needed before flipping.
- Flip on: change `export let CORE_SETTLE = false;` to `true` in `packages/beacon/src/game.ts`, then rebuild the phone bundle.
```bash
sed -i 's/export let CORE_SETTLE = false;/export let CORE_SETTLE = true;/' packages/beacon/src/game.ts
bun run build:zgame
```

## 3. Claim mirror button (golden "Claim")
- Default now: OFF. Shows only when the phone page address has `?claim=1`.
- What it changes: a gold "Claim" button on the card screen when this card meets a house not yet in its won list. Press: the phone re-sends its claims and asks for results now. It changes no result; auto-claim still runs; the "You won" card comes from the settle as before.
- Tests that exist: `packages/beacon/test/phone-runtime.test.ts` covers the runtime but not `claimNow`.
- Flip on for everyone: in `apps/web/public/z.js` replace the `CLAIM_BTN` test with `true`.
```bash
sed -i 's|const CLAIM_BTN = /\[?&\]claim=1(?:&\|\$)/.test(location.search);|const CLAIM_BTN = true;|' apps/web/public/z.js
```
(Check the line afterwards with `grep -n "const CLAIM_BTN" apps/web/public/z.js`; edit by hand if the sed did not match.)

## 4. Host key for Pause and Resume
- Default now: OFF in two places: server `HOST_KEY_ENABLED = false` (`packages/beacon/src/control.ts`) and the console address needs `?hostkey=1` (`HOSTKEY` in `apps/web/public/zc.js`).
- What it changes: the Host makes its own key in its browser; the Organizer (master key only) approves it with one button; the Host can then Pause and Resume but not End. Each pause and resume is stored with `by: organizer|host`; phones and the console say "Paused by the Host/Organizer". The organizer's own key is never shared.
- Tests that exist: `packages/beacon/test/control.test.ts` covers the organizer-key path. Nothing covers `signerOf`, `/control/hostoffer` or `/control/hostkey`.
- Flip on (server): set `HOST_KEY_ENABLED = true`, rebuild both bundles. (Page): make `HOSTKEY` true in `zc.js`.
```bash
sed -i 's/export const HOST_KEY_ENABLED = false;/export const HOST_KEY_ENABLED = true;/' packages/beacon/src/control.ts
sed -i 's|const HOSTKEY = /\[?&\]hostkey=1(?:&\|\$)/.test(location.search);|const HOSTKEY = true;|' apps/web/public/zc.js
bun run build:zgame && bun run build:control
```

## 5. Reactions (comic words in the corner)
- Default now: OFF. Shows only with `?rx=1` on the phone page.
- What it changes: short words (2.2 s) in a corner strip at most a quarter of the width, never over the card, from the core Reaction pack. Events: join (Hello!), countdown (Tick tock!), a number you have (Yes!), one number from a house (Last chance!), claim button shown (Super!), claim accepted (Spot on!), You won (Champion!), paused (Hang on!), resumed (Let's go!). Pack rules limit it to one every 15 s and 15 per 10 minutes of game time (a pause freezes that time).
- Not done: Organizer on/off switch (`setMode`), service-worker precache entry for `reactions.css`.
- Tests that exist: none here. The core has its own simulation (`bun tools/reactions-sim.ts` in the core clone).
- Flip on: replace the `RX_ON` test with `true` in `apps/web/public/z.js`.
```bash
sed -i 's|const RX_ON = /\[?&\]rx=1(?:&\|\$)/.test(location.search);|const RX_ON = true;|' apps/web/public/z.js
```

## 6. Release-session items (not flags)
- Set `EMP_CLEAN_FROM_MS` (people.ts) and `APPROVAL_RULES_FROM_MS` (approvals.ts) to the deploy instant (now `Date.UTC(2099,0,1)`).
- Apply migration 0030 before deploy; write the release time and commit into `releases.json`.
- Re-enable "Which ID?" once the pack ties `idKind` to `verify`.
- Typecheck: `bun run typecheck`. Only the old `libphonenumber-js` errors in `phone.ts` appear on the partner laptop run here; they are not from this work.

## 7. Suggested order
1. Settle comparison (flag 2) before anything that depends on it. 2. New flow (1) on a rehearsal game. 3. Claim (3), Reactions (5). 4. Host key (4) last, it touches the server file format.
