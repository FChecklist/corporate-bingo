# Console voice (owner rule, 20 Nov 2026)

**Two voices, never mixed.**
- **Console voice** (the organizer, Host and Co-host screens of this game, and what the server sends them): speaks TO the organizer or Host as **you**. Simple English, short sentences, polite, never threatening, never blunt. The reader is a careful HR person.
- **Game voice** (the player screens: the join page, the card, the winners): speaks to the players. Not covered by this file.

**Rules for console text**
1. Say "you" and "your". Never "I", "my", "me", "myself" (a button is "Add to your list", not "Add to my list").
2. One idea per sentence. Short words. Say what happens next ("Press Start when you are ready.").
3. No jargon: no "payload", "token", "endpoint", "hash", "bridge". Say what the person sees.
4. Keep the owner's approved texts word for word (the ID-invite text and the start and number wording below).
5. A test (`apps/web/test/console-voice.test.ts`) fails if any organizer-facing screen or server sentence has "I", "my", "me" or "myself". In this game the count is **zero**: the whole sweep is done (Tambola keeps a ratchet of 89; here nothing is left to ratchet).

**Approved wording, start and numbers** (owner, 20 Nov 2026)
- "The game starts by itself" / "The game begins at the time you set. You do nothing."
- "Numbers come by themselves" / "A new random number appears every 12 seconds."

Corporate Bingo has one answer to each of the two start questions today (it starts by itself, and numbers come by themselves). The second line shows the seconds the organizer chose (12 is the default; 9 is the other choice). The two other answers ("You start the game", "You call the numbers") do not exist in this game's engine yet, so they are not shown. See `docs/STATE.md`, "Needs".

**Not changed on purpose** (listed so nobody wonders)
- The agreement boxes (`terms.html`, "I have read and agree ..."): the person's own declaration, legal text.
- The partner pages: partners are not organizers.
- The AI assistant's own sentences (`ai-go.ts`) and the text the organizer pastes into an AI chat (`ai-link.ts`, `mails.ts`): the AI, or the organizer speaking to the AI, is the speaker.
- The letter I of B-I-N-G-O.

**Before and after**
| Before | After |
|---|---|
| Add to my list | Add to your list |
| My people | Your people |
| 3 people are on my list | 3 people are on your list |
| Download my list | Download your list |
| Use my credit | Use your credit |
| Send me a code | Send a code |
| Sign me in | Sign in |
| I will decide later | Decide later |
| I understand that cancelling cannot be undone | Tick to confirm that you understand: cancelling cannot be undone |
| How do I start? | How do you start? |
