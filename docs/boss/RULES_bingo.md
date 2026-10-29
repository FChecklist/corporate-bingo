# Corporate Bingo: the rules (plain words, draft 1, 2026-10-27, for the owner to read before anything is built)

Model: the Corporate Tambola rules. This page is what a player sees under "Rules" on the game screen and what the organizer and a Host see in their console. Sections 1 to 9 are the text; section 10 is the table of every message; section 11 is for the builder and the tests.

## 1. How to play
1. Everyone gets a 5 by 5 card with the letters B, I, N, G, O on top. The middle square is FREE.
2. A number is called every 12 seconds. You see only the number just called, with its letter (for example "G 52"), and the last few before it.
3. When your card has the number, tap it to dab it. The card never dabs itself.
4. When you have finished a prize pattern (for example a Line), press Claim.
5. The first correct claim wins that prize. Play carries on for the next prize.

## 2. How you win
1. The organizer chooses the prizes before the game (for example Line, Four Corners, X, Blackout). Each prize has one winner.
2. A Line is any one row, column or diagonal. Four Corners is the four corner squares. X is both diagonals. Blackout is every square. The game screen shows the pattern of each prize.
3. If two players claim the same prize on the same call, fate decides who is first. Fate is a number that anybody can re-check from public data. The other player can still win the next prize.
4. The game ends when every prize is won or when all 75 numbers have been called.

## 3. The timer
1. The gap between calls is 12 seconds. The first call comes 2 minutes after the start time.
2. The timer on your phone is small and quiet, in one corner. It is only a help. The game itself runs on the server's clock.
3. The screen always shows how far we are: "30 of 75 called · 45 left".

## 3b. Manual play has no fixed time
**Fixed time only when the software runs the game.** This game is run by the software, so the gap between numbers is fixed (12 seconds) and the timer is shown. If a host ever calls the numbers by hand, there is no fixed time between numbers, no countdown is shown (the screen says "Waiting for the host"), and no total length is promised. The claim rule is the same in both: a claim counts only before the next number is announced, decided by the server's clock.

## 4. Claiming a prize (the strict rule)
1. You may claim only before the next number is announced. The server's clock decides, not your phone's clock.
2. When you finish a pattern, a gold Claim button and a short alert appear. When the next number is announced, they disappear.
3. If you press Claim too late, nothing is recorded and you see: "Ohooo! 😊 Sorry, you pressed Claim after the next number was announced. This claim cannot be made."
4. A wrong claim (the pattern is not really finished) is not a prize. It is a Bogey. Two Bogeys on the same prize and your card is out of that prize. You stay in the game for the other prizes.
5. Nothing happens by itself: no automatic dabs and no automatic claims. A finished card that nobody claimed wins nothing.
6. Everyone sees calm messages: "Card 214 has claimed Line. Checking now", then "Correct. Line goes to Card 214" or "That claim was not correct".

## 5. Pause
1. The organizer or a Host can pause the game. While it is paused no number is called and the screen says so.
2. If a claim arrives in time and the game is then paused, the claim is kept safe and checked. When play restarts, the next number comes a full 12 seconds after the restart.
3. A pause never changes a number. It only moves the later calls by the time it lasted. Every pause and restart is written in the game log.

## 6. If you go away or lose the connection
1. Open the same link again. You see your card and the numbers called so far exactly as they are. Your dabs are kept on your phone.
2. Numbers called while you were away stay called. You may still claim a prize whose claim time has not passed.
3. Tip: switch on Do Not Disturb on your phone so calls and chats do not interrupt the game.

## 7. Fairness
1. The numbers come from a public random feed. The order cannot be known or changed in advance, not by the organizer, not by a Host, not by us.
2. Every phone works out the same result from the same public data. A result stands only when enough different phones agree.
3. Every card in a game is different.

## 8. What the organizer and a Host can and cannot do
Can: start, pause, restart, extend with a confirmation, end the game, see the full board of called numbers, the live claims, the count of players and the log.
Cannot: choose or change a number, mark a card, claim for a player, decide a winner, see anybody's name or mobile number on the live board (only card numbers).

## 9. Money and privacy
1. Players never pay and never stake money. There is no cash prize and no betting. Any gift is given by the organizer outside this product.
2. Adults (18+) only. We ask for your name only, unless your organizer asked for an employee ID or mobile number.
3. Your personal details are deleted within 20 hours after the game ends. The game log (card numbers only) is kept for 365 days.

## 10. Every message in one table
| When | Text |
|---|---|
| Pattern finished | You have finished {prize}! Press Claim now, before the next number is called. |
| Claim too late | Ohooo! 😊 Sorry, you pressed Claim after the next number was announced. This claim cannot be made. |
| Claim sent | Claim sent. Checking now. |
| Claim correct | Correct! {prize} is yours. |
| Claim wrong | That claim was not correct (Bogey {n} of 2). |
| Out of a prize | Your card is out of {prize}. You can still win the others. |
| Prize already won | {prize} has been won by Card {n}. |
| Paused | Game paused by the host at {time}. It restarts soon. Your card is safe. |
| Away note | Welcome back. You missed {k} numbers. They are marked as called. |
| Do Not Disturb | Tip: switch on Do Not Disturb so calls and chats do not interrupt your game. |

## 11. For the builder
1. Bingo today has no claim step (the phones settle winners by themselves). This page adds the Claim step like Tambola: the claim carries the call number it is made after; the server accepts it only while the server clock is before the time of call k+1, where call k happens at start + 120 s + k x 12 s (a fixed schedule, no drift).
2. Tests (falsified): a claim at the last millisecond before call k+1 counts; at the instant of call k+1 it is refused with code `late-claim` and nothing is stored; two claims on one call are ordered by fate; claim during pause freezes the schedule and the next call is a full gap after restart; the 2-Bogey rule.
3. Open for the owner: the Bingo engine today awards without claims. Moving to claims is a rule change for Bingo games already published; published games keep the old rule.
