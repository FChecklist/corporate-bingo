# The Bingo game: rules and where they live in the code

Corporate Bingo is 75-ball Bingo. This page is the short, current description. If an older page in this folder still says "ticket", "90 numbers" or names a Tambola-style house, the code and this page are right.

## The card
- 5 x 5. Columns B I N G O hold 1-15, 16-30, 31-45, 46-60, 61-75; each column 5 different numbers (N has 4).
- The centre is FREE: it counts as marked from the first call. The organizer's logo may sit there.
- Code: `packages/shared/src/bingo-card.ts` (card, letters, the pattern table), re-exported by `ticket.ts`.
- Unique cards: `packages/beacon/src/unique-ticket.ts`. A seat number (and a second position for a second card) is mapped by a keyed Feistel permutation of all 5.5e26 valid cards, so no two cards of one game match. Tests: `unique-ticket.test.ts` (30,000 cards, 10,000 players with two cards each: no repeats).

## The calls
- 75 numbers, each once, in an order derived from the engagement id and the public drand beacon: `pickNumber` in `packages/beacon/src/index.ts` (domain string `CB1`). Nobody can predict or choose it.
- A call is shown and spoken as letter + number ("G 52"). Voice: the phone's own speech voice, Indian English (en-IN, rate 0.82, pitch 1.05) as in Corporate Tambola; wording "Next number is Gee, five two, fifty-two. Gee, fifty-two."; `apps/web/public/audio.js`. No audio files ship.
- Gap between calls: 9 or 12 seconds in the console (older games may hold 6 or 15). The console now starts a new game at 12 seconds (20 Nov 2026), so the screen sentence "A new random number appears every 12 seconds." is true by default. The first call is 2 minutes after the start time.
- How a game starts and how the numbers come: today there is one answer to each question. The game starts by itself at the time set, and numbers come by themselves. "You start the game" and "You call the numbers" are not built in this game (see `docs/STATE.md`).
- Fairness sentence on the screens: "No one knows the next number: not the organizer, not the host, not even the software." It is true because call k uses the randomness of ONE beacon round that does not exist yet when the game is set up; `packages/beacon/test/fairness.test.ts` proves the parts of that claim in code.

## The prizes (houses)
One table: `PRIZE_HOUSES` in `packages/beacon/src/config.ts`, built on `PATTERN_RULES` in `bingo-card.ts`.

| id | wins when | max winners |
|---|---|---|
| line | any one row, column or diagonal | 3 |
| twolines | any two different lines | 2 |
| corners | the four corners | 3 |
| plus | middle row + middle column | 2 |
| x | both diagonals | 2 |
| frame | the whole outer border | 2 |
| stamp | a 2 x 2 block in any corner | 3 |
| letterL / letterT | the letter shape | 2 each |
| blackout | every square | 2 |

Default set for a new game: Line, Four Corners, X, Blackout. Ties share the prize; the 2nd winner of a house is whoever completes it at the next distinct call. The game ends when every prize line is awarded or 75 numbers are called.

## Who decides a winner
Software only. Each phone runs the same engine (`prize-engine.ts`, proven equal to the whole-log `settleAll` in `game.ts` by `houses.test.ts` for every pattern) and reports what it worked out; the store accepts a result when enough different phones agree (`quorumFor`). No person can add, change or remove a winner.

## Marking
`mark: "auto"` (default) lights called squares. `mark: "tap"` is tap-to-daub: only a feeling; a missed tap never loses a prize.

## Joining (owner rule 20 Nov 2026: invite people with just an ID)
- An ID (employee, associate, vendor or customer ID: these are words, not choices) is ONE alphanumeric box. No name, no mobile number, no e-mail. Every character that is not a letter or a number is dropped and capitals are used: `A-1101`, `A 1101` and `A/1101` are one ID (`apps/edge/src/empid.ts`, used at upload, join, approval and matching).
- Every game has one game link. The organizer uploads or pastes IDs (a list, a PDF or a CSV). A person opens the link and types the ID: if it is on the list they get a card with no approval; if not, a request goes to the organizer or Host to approve or decline (`waiting`). Optional family invite: a listed person can invite 1 to 10 more (default 4).
- Only the organizer and Hosts see the full list and the invite log (`GET /api/z/<id>/people/log`: who asked, through whom, who said yes or no; IDs only).
- Games made before the rule still match: an ID is also looked up in its old form (spaces dropped, `. _ - /` kept) for games created before `EMP_LEGACY_BEFORE_MS`. Nothing stored is rewritten.
- The list, the requests, the ID look-ups and the wrong-ID counters are erased with the players' data, 20 hours after the game ends (the promise is 24).
- Older games with `verify: mobile | both` keep their phone-number behaviour; new games made in the console are always for the people on their list, by ID.

## What this page used to say about joining

The common link asks for a name only (`join: "name"`, the default). `join: "phone"` also asks for a mobile number (to match an invite list). Personal links from a list need nothing typed. One card per phone: the phone's own random id is kept as a hash.

## Money
Price ladder (up to N players, no tax added): 100 Rs 2,399 / US$ 34; 250 3,499 / 51; 500 4,699 / 67; 750 5,899 / 84; 1,000 7,099 / 101; 2,500 11,799 / 169; 5,000 17,699 / 253; 10,000 29,499 / 421 (`packages/shared/src/pricing.ts`). Orders go through the central payment service of IT Services by Rajat Agarwal when `PAY_SERVICE_KEY` is set (`apps/edge/src/pay.ts`: site `corporate-bingo.pages.dev`, product `corporate_bingo`, plans `bingo_pack_<N>` and `payment_test`); otherwise directly to Razorpay. The product never holds or pays prize money.

## No ties: one winner per prize line (owner rule 2026-10-12; acceptance BG-18 and BG-19)
- Every prize line (house + ordinal: 1st Line, 2nd Line ...) has exactly ONE winner. There is no shared prize.
- THE ONE TIE RULE, in plain words (B04, 2026-10-29): when two or more cards finish the same prize pattern on the same number, a fixed public rule puts them in order and they take the next open prize lines one by one; an earlier number always beats a later one. Nobody can choose or change the order. The screens say "same number as another card"; no screen says "fate" or "lottery", and no screen or page says that a tie shares a prize.
- If several guests complete the same house on the same call, fate orders them: each gets `sha256("CB1-TIE|<game id>|<seat>|tie|<house>|<ordinal>")`; the lowest number takes the first open ordinal, the next the next, and so on. An earlier call always beats a later one. Every phone computes it from public data only. Code: `assignOrdinals` / `fateOf` in `packages/beacon/src/game.ts`, used by both `settleAll` and `PrizeEngine.results()`.
- Ranking shown on the phone ("Winners"), the big screen, the report ("Ranking: top winners") and at prize hand-over: 1st, 2nd, 3rd ... and a top-10 list, ordered by prize value (the organizer's own prize list, first = most valuable), then call number, then fate; every row has a unique rank; a tie carries the note "N cards completed it on the same number; a fixed public rule put them in order". Code: `rankWinners` in `game.ts`.
- Tests: `packages/beacon/test/houses.test.ts` ("BG-04 / BG-18", "BG-19": ties of 2, 3 and 10 guests, stable on every phone, unique ranks 1-10, engine equals settleAll).
- Public results now name winning seats (opaque seat ids, never names) so every screen can show the ranking.
