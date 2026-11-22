# Payment and sign-in live in the console (owner order, 20 Nov 2026)

The order of the chain: **home.corporatetambola.com** (the one sign-in) -> **console.corporatetambola.com** (one console for all games) -> **moneypenny.corporatetambola.com** (credits and payment, API only) -> **IT Services by Rajat Agarwal** -> **Razorpay**. An organizer never leaves the console. A game page has no sign-in, no payment and no chat of its own.

The contract is the console repo's `docs/PAY_STEP.md` and `packages/bridge` (branch `claude/console-game-pay-step-91b60a`, commit `2db8168`). This repo had no bridge and no `docs/CONTRACT_V1.md`, so the bridge was copied in with the console repo's own tool (`node tools/vendor-bridge.mjs --game <this repo>`), byte for byte:
- `apps/edge/src/console-bridge/` (5 files and a `MANIFEST.json` of hashes). Do not edit. `apps/edge/test/bridge-copy.test.ts` fails if a file changes.
- `apps/edge/test/console-contract/` (the contract kit, fixtures and schemas, copied as they are; the kit runs against a full adapter, which this game does not have yet, so it is not run here).

## What this game does
| Piece | Where | What it does |
|---|---|---|
| The signed "paid" notice | `POST /api/console/paid` -> `apps/edge/src/console-pay.ts` | Checks the signature (Ed25519, the console's public keys in `CONSOLE_PUBKEYS`), that the notice is for THIS game's address, for the purpose "paid", under 60 seconds old and never used before. The bridge keeps one row per order id (`console_paid`), so a game is marked paid **once per order id**: the same notice again is refused ("replayed"), a new notice for the same order says "repeat" and changes nothing. |
| What "paid" means here | `consoleMarkPaid` in `console-pay.ts` | From this game's own tables: the game exists, belongs to the account of the person who paid (`sub` = hash of their e-mail), is not cancelled, the size paid for is the size of the game (the smallest pack that holds `cap`), and it is not paid yet. Then `engagement.pack` is set (that is what "paid" is in this game), the entitlement and the publish mark are written, and a game that was held at its start time restarts 2 minutes after the payment. A refusal changes nothing. |
| The game starts only when paid | `worker.ts` (`locked`) | A published game that is not paid by its start time seats nobody and does not begin. Unchanged; the notice is what unlocks it. |
| Dark by default | `console-pay.ts` | Without `CONSOLE_PUBKEYS` the route does not exist (the normal 404). Only `/api/console/paid` is open: the other bridge routes (session, games, billing, hand-off, role) are not built into this game yet and answer the normal 404. |
| Old pay screens | flag `PAY_VIA_CONSOLE=1` | `pay.html`, `paylink.html`, `paytest.html` redirect to the console; the old pay routes (`/api/checkout`, `/api/payments/test|paytest|verify`, `/api/paylink/*`, `/api/z/<id>/paylink|credit`) answer a short refusal (HTTP 409, "Payment is made in your console now"). Razorpay's own notice to this game (`/api/payments/webhook`) is never turned away: money already paid must still be recorded. Nothing is deleted: the code and the data stay behind the flag. |
| Own sign-in | flag `LOGIN_VIA_CONSOLE=1` | `signin.html` redirects to home; `/api/start` and `/api/auth/email|verify|google|link` answer a short refusal that points to home and the console. |

Both flags are **off**. Do not switch `LOGIN_VIA_CONSOLE` on before the console's session and hand-off routes are built into this game (otherwise nobody could sign in to the game's own console page).

## Privacy of the notice
The notice carries the hash of the payer's e-mail, the game id, the pack size and the order reference. No name, no card data, no e-mail. `console_paid` keeps order references only (no participant data), so it is not part of the 24-hour deletion.

## Not done here (see `docs/STATE.md`, "Needs")
- The rest of the bridge adapter (session, games, billing, invited cards, hand-off, roles) and the contract kit run.
- No invoice is issued by this game for a console payment: Moneypenny and IT Services keep the payment record and the invoice. The owner should confirm this is the intended rule.

## Added in 1.4.0 (audit fixes)
- **A stuck order recovers.** The bridge copy leaves an order in "marking" after a one-off database error. `releaseStaleMarking` (console-pay.ts) clears a row that has been "marking" for over 30 seconds (`MARKING_STUCK_MS`) before the bridge runs; the retry then goes through all the bridge's checks, and `consoleMarkPaid` finishes the job once (this order's entitlement is written first; every step is safe to repeat). A "paid" row is never cleared, and a different order id for an already-paid game is still refused.
- **The old pay pages name the game.** With `PAY_VIA_CONSOLE=1` a page such as `/pay.html?e=<game>` redirects to `console/?game=bingo&eid=<game>`.
- **`PUBLIC_ORIGIN`** must be set before `CONSOLE_PUBKEYS`: with it empty the paid route answers 503 "not set up".
