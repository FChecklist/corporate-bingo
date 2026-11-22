# Changelog

Plain words. Newest first. The version number lives in `version.json` and must be the same in `package.json`, `apps/edge/package.json` and `apps/edge/src/releases.json` (a test checks this).

## 1.4.0 (22 Nov 2026) - Owner rules v1.1, not deployed yet

**What changed for you**
- Every organizer and host screen speaks to you ("you", "your"). A test keeps it that way.
- The game starts by itself and the numbers come by themselves (a new number every 12 seconds unless you pick another).
- You invite people with just an employee ID. `A-1101`, `A 1101` and `A/1101` are the same person. An ID that is not on your list waits for your yes or no. A listed person can invite 1 to 10 family members (default 4).
- The AI helper now makes invite-only games (people join with their ID) and its default speed is 12 seconds. It no longer offers "anyone with the link".
- The Pay button on your console page opens your game in the console. There is no payment link to copy any more, and no "anyone with this link can pay".
- The old payment pages (when the flag is on) send you to your own game in the console, not to the console's front door.
- A game is marked paid only by the console's signed notice, once per order id. If the first try hit a one-off database error, the console can try the same order again after 30 seconds and the game finishes being paid once (before: it stayed stuck for ever).
- If the game's own web address (`PUBLIC_ORIGIN`) is not set, the paid route now says "not set up" instead of refusing every real notice with a confusing reason.
- Rupee sign everywhere, one privacy line, the fairness sentence proved by a test, a wider test for claims we must never make.

**What is still missing (see `docs/STATE.md`, "Not done")**
- "You start the game" and "You call the numbers" are not built. Only "the game starts by itself" and "numbers come by themselves" exist.
- The console cannot yet ask this game what a payment step needs before it takes the money (the size is only checked after).
- The rest of the console link (sign-in, games list, billing) is not built, so the two money/sign-in flags stay OFF.

**For the people who deploy**
- Nothing here is deployed. Money flags (`PAY_VIA_CONSOLE`, `LOGIN_VIA_CONSOLE`) are OFF.
- Set `PUBLIC_ORIGIN` before `CONSOLE_PUBKEYS`.
