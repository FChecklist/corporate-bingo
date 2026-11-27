# Changelog

Plain words. Newest first. The version number lives in `version.json` and must be the same in `package.json`, `apps/edge/package.json` and `apps/edge/src/releases.json` (a test checks this).

## 1.5.4 (27 Nov 2026) - Payment only through the console: "payable" and 410 for the old pay routes (flag PAY_VIA_CONSOLE, default off)

**What changed for you**
- The console can now ask this game, before it takes any money, which game is the organizer's own, what pack size to charge for and whether it is already paid (`POST /api/console/payable`, a signed read-only question). It is dark until `CONSOLE_PUBKEYS` is set.
- With `PAY_VIA_CONSOLE=1` the old pay, pay-link, pay-with-credit, credit and proforma routes answer **410 (gone)** with the console's address (they answered 409 before), `placeOrder` refuses to open any order, and the credit and ledger-C background jobs do not run. Razorpay's own notice (`/api/payments/webhook`) is never turned away. With the flag off nothing changes.
- The console bridge copy was refreshed from the console repo (it adds "payable" and a 30 second lease on a payment that was being saved).

**Not done / for the auditor:** nothing was run against the real console or Moneypenny. The console's own pay step needs Moneypenny's `/v1/game_pay/*` routes, which are on an unmerged branch.

## 1.5.3 (23 Nov 2026) - Security audit fixes: no names before joining, and people who wait for a yes are never locked out (never deployed on its own)

**What changed for you**
- The "Is this you?" check no longer gives back a name. It says only whether an ID is on the list. Before, anyone with the game link could try IDs one after another and read the first name and last initial of every listed person (200 of 200 in the auditor's test). The person sees their own name on their card after they join. (Audit of 23 Nov, Medium 2.)
- A person whose ID is not on the list now just waits for a yes or no. Before, such a person was counted as a "wrong try", and the 31st honest person from one office was told "Too many tries, ask your organizer" (10 of 40 in the auditor's test). That "wrong ID" limit is removed. (Audit of 23 Nov, Medium 3.)
- The waiting room now has its own limit for each network: one network (an IPv6 group of addresses counts as one) can put at most 100 requests in it in any 30 minutes. The room as a whole still holds 500, so five networks are needed to fill it, not one. A person who asks again is not counted again. A person who is on the list is never held back by this limit. When a network is over, its next person is told "Many people are asking to join from this network right now. Please ask your organizer for help."
- The AI helper's manual no longer offers `closed: false` (it has been refused since 1.5.0).

**Not changed**
- Money flags `PAY_VIA_CONSOLE` and `LOGIN_VIA_CONSOLE` stay OFF. Nothing is deployed.
- Still true and left alone: a right ID is never limited (owner decision "ID matched, not proven"). A script can still ask `who` any number of times and learn only whether an ID is listed, as `join` already lets it. Five or more different networks can still fill the 500 places of a waiting room; the organizer sees and can decline them.
- Lows of earlier audits that are not in this fix: security headers on every page, per-address join counters that use the raw address, audit counters kept in memory per Worker copy, counters that fail open on a database error.
- "You start the game" and "You call the numbers" are still coming in 1.6.0 (BOSS waiver of 22 Nov 2026 was written for 1.5.0; whether it carries to 1.5.3 is BOSS's call).

## 1.5.2 (23 Nov 2026) - Security audit fixes: a deleted player stays deleted in the audit log (never deployed on its own)

**What changed for you**
- When a player presses "Delete my name and number" (or you do it for them), their mobile number and name are now gone from the audit log too. Before this, the number stayed in the log for up to a year. (Audit of 23 Nov, High 1.)
- The same for a Co-host: their name and mobile number are not kept in the log. A Co-host's own calls are kept in the part of the log that is deleted 23 hours after the game, like a player's.
- The log now keeps only what happened and when (who did what, from where), never the details of a person. This covers names, mobile numbers, e-mail addresses, IDs, places and labels under any field name, and any number or e-mail written inside other text. The calls that name a person keep only the names of the fields, never the values.
- A visitor with no key can no longer fill the audit log. A call to a game that does not exist, or to an address that does not exist, leaves no row; and one network can add only 20 rows a minute (300 for a game that exists, because a whole office can join through one address). The count is kept in memory, so it writes nothing to the database. (Audit, Medium 1.)
- Wording: the sign-in and Co-host screens no longer say "tick the box" and the Co-host screen no longer has an "Accept" button (it says "Start as Co-host"). Going ahead is the agreement and the Terms link stays on the page. Messages say "Please press the button again to go on".

**Not changed**
- Money flags `PAY_VIA_CONSOLE` and `LOGIN_VIA_CONSOLE` stay OFF. Nothing is deployed.
- Still open from the audit, not changed here (they are Medium or Low and not part of this fix): the "Is this you?" name hint and the wrong-ID limit (Medium 2 and 3), the IPv6 join counter, security headers, constant-time secret compares, winners' IP detail, family-queue spam. BOSS to decide.
- Some checkboxes remain that are not agreement boxes: "Prize given", the house on/off switches, "also bring the people list" when cloning, "hide guest names from my AI" and the three-step cancel confirmation. They are switches for the organizer, not consent.
- "You start the game" and "You call the numbers" are still coming in 1.6.0 (BOSS waiver of 22 Nov 2026; whether it carries to 1.5.2 is BOSS's call).

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
