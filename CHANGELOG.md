# Changelog

Plain words. Newest first. The version number lives in `version.json` and must be the same in `package.json`, `apps/edge/package.json` and `apps/edge/src/releases.json` (a test checks this).

## 1.5.1 (23 Nov 2026) - Security audit fixes (never deployed on its own)

**What changed for you**
- A closed game can no longer be opened to anyone with the link by a settings save that sends `closed` as `null` or as empty text. On a save, `closed` is now accepted only when it is left out or is `true`. `false`, `0`, `null`, `""` and anything else get the same plain refusal as before (`list-only`). (Audit of 23 Nov, Medium 1.)
- The console's `payInfo` call now reads at most 4096 bytes of the request (a real request is a few hundred). A bigger one is refused with 413 before it is read in full. (Audit, Low 2.)
- The same call now tells a network to wait (429) after 20 requests in one minute that could not be checked (bad request, bad signature, or a repeat). The count is kept in memory, so a flood of bad calls writes nothing to the database. (Audit, Low 3.)
- A mangled code comment on the paid and payInfo routes is fixed (no change in behaviour).

**Not changed**
- Money flags `PAY_VIA_CONSOLE` and `LOGIN_VIA_CONSOLE` stay OFF. Nothing is deployed.
- "You start the game" and "You call the numbers" are still coming in 1.6.0. BOSS waived them in writing for 1.5.0 (22 Nov 2026). This patch changes nothing about them; whether the waiver carries to 1.5.1 is BOSS's call.

## 1.5.0 (22 Nov 2026) - Owner rules v1.1 joined to the live code

**What changed for you**
- This release joins two lines of work that had drifted apart: the code that is live on the website (commit `f17d1906d8a7`, deployed 5 Nov 2026) and the owner rules v1.1 work. The version that was about to go out was missing 110 live commits. Now it has every one of them: all live fixes, all live pages, and all database migrations up to number 31.
- Nothing you could do yesterday on the live site was taken away. Where the live code and the owner rules said different things, the owner rules win on the console and the join page (ID-only invite, "you" voice, payment only through the console, Rupee sign, the fairness sentence, honest help text). Where they did not clash, both are kept.
- The ID-only switch of the live code (name, location and ID, `ID_ONLY=1`) is still there and still off unless it is switched on. Email-ID games made on the live site keep working.
- A game made before 20 Nov 2026 keeps matching IDs the old way as well as the new way, so nobody who is already on a list is locked out.
- The wrong-ID limit counts one IPv6 network as one network, in one step.

**Audit fixes added to this release (23 Nov 2026)**
- The server itself now refuses an open game. A create or a save that says "anyone with the link" is refused with a plain sentence, and a game that says nothing is a game for the people on its list. (`LEGACY_OPEN_GAMES=1` brings the old behaviour back for old tests only; it is never set on the live site.)
- The console can now ask this game, before it takes any money, what must be paid for a game and whether it can be paid (`POST /api/console/payinfo`, called `payInfo` in the audit). The game answers with the pack size to charge (never a price) and a reason when it cannot be paid. Only the game's owner gets an answer. It is switched on only with the console's keys. The console's own contract does not have this call yet, so the console must adopt it.
- The flag that closes the game's old pay routes is `PAY_VIA_CONSOLE` (this game's name). `PAY_VIA_MONEYPENNY` belongs to the console's own repository and does nothing here.

**Coming in 1.6.0 (waived in writing by BOSS for 1.5.0, 22 Nov 2026)**
- "You start the game" (press Start) and "You call the numbers" (press Next). Live Bingo does not have them either, so this is not a step back.

**Still missing (see `docs/STATE.md`, "Not done")**
- The old pay routes still work while `PAY_VIA_CONSOLE` is off (it is off until the owner says go).
- The rest of the console link (session, games list, billing, hand-off, roles) and running the contract kit.

## 1.4.1 (22 Nov 2026) - Audit fixes (never deployed on its own; now part of 1.5.0)

**What changed for you**
- The limit on wrong employee IDs (30 in 10 minutes) now counts one network as one. Before, a person on an IPv6 network could change their address and start again from zero. Now every address in the same /64 network counts together.
- Wrong IDs are now counted in a single step, so many guesses sent at the same moment cannot slip past the limit.
- Your organizer screen now says plainly: an ID is matched to your list, it does not prove who is typing it, and anyone who knows a listed ID can use it. This is the owner's decision ("ID matched, not proven"). We do not limit right IDs per address, and a right ID is never counted.
- The AI helper is no longer told it can "make a pay link that anyone can open". Only the organizer pays, in the console.
- The console's paid-notice address does nothing at all (no database write) until it is switched on.
- One page test that failed now and then under load waits for the ten steps to be drawn.

**Still missing (unchanged, see `docs/STATE.md`, "Not done")**
- "You start the game" and "You call the numbers" are not built. (Blocker in the audit.)
- The console cannot yet ask this game what a payment step needs before it takes the money (`payInfo`; its contract is not in this repository). (High in the audit.)
- The game's own old pay routes close only when the flag `PAY_VIA_CONSOLE` is on (OFF by default); the Razorpay allowance on the old pay pages stays until the owner decides. (High in the audit.)
- The server still opens a game to anyone when an API call asks for that or says nothing. The console screen and the AI helper always make closed, ID-only games. The owner must decide whether the API itself must refuse open games. (Medium in the audit.)
- The console repository's own copy of the stuck-order bug is not fixed here. This game is covered by a wrapper.

## 1.4.0 (22 Nov 2026) - Owner rules v1.1 (never deployed on its own; now part of 1.5.0)

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
