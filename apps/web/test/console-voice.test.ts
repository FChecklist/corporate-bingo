// 20 Nov 2026 (owner rule, CONSOLE VOICE): the organizer console speaks TO the organizer and Host as "you". Never "I", "my", "me" or "myself" in text an organizer or a Host reads.
// The whole sweep is done in this game: the count is ZERO (Tambola keeps a ratchet; here nothing is left to ratchet). Player screens (z.js, preview, demo) speak to players and are not covered.
// Left out on purpose, and listed here so nobody wonders: the agreement boxes (terms.html: "I have read and agree ..." is the person's own declaration, legal text), the partner pages (partners are not
// organizers), the AI assistant's own sentences (ai-go.ts: the AI is the speaker), and the letter I of B-I-N-G-O. See docs/CONSOLE_VOICE.md.
// FALSIFIED BY: voice-i-in-console, voice-my-in-console, voice-owner-text-reworded
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { FIRST, readable, textStrings } from "./js-strings";

const pub = (f: string) => readFileSync(join(import.meta.dir, "../public", f), "utf8").replace(/\r\n/g, "\n");
const edge = (f: string) => readFileSync(join(import.meta.dir, "../../edge/src", f), "utf8").replace(/\r\n/g, "\n");
const hitsIn = (src: string) => textStrings(src).filter((s) => readable(s.text) !== "I" && FIRST.test(readable(s.text))).map((s) => `${s.line}: ${readable(s.text).slice(0, 90)}`);
const htmlText = (f: string) => pub(f).replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ");

describe("console voice: you, never I", () => {
  for (const f of ["zc.js", "ai-link.js", "pay.js", "paylink.js", "signin.js", "guide.js", "helpdesk.js", "idlist.js", "big.js"]) {
    test(`${f}: organizer-facing text has no I, my, me or myself`, () => { expect([f, hitsIn(pub(f))]).toEqual([f, []]); });
  }
  for (const f of ["mails.ts", "credit.ts", "pay.ts", "console-pay.ts", "people.ts", "worker.ts"]) {
    test(`${f}: the sentences the server sends an organizer have no I, my, me or myself (the 'me' and 'I' of program code are not text)`, () => {
      const hits = textStrings(edge(f)).filter((s) => !/^(me|I)$/.test(s.text) && !/MY OWN|I am the owner|I am their Host/.test(s.text) && FIRST.test(readable(s.text))).map((s) => `${s.line}: ${readable(s.text).slice(0, 90)}`);
      expect([f, hits]).toEqual([f, []]);
    });
  }
  for (const f of ["index.html", "helpdesk.html", "offline.html", "organizer-guide.html", "pricing.html", "about.html", "contact.html", "trust.html"]) {
    test(`${f}: the page text has no I, my, me or myself (the letters B I N G O are not words)`, () => {
      const text = htmlText(f).replace(/<[^>]*>/g, " ").replace(/&[a-z#0-9]+;/gi, " ").replace(/\s+/g, " ").replace(/B I N G O/g, "BINGO");
      const hits = [...text.matchAll(new RegExp(FIRST.source, "g"))].map((m) => text.slice(Math.max(0, m.index! - 30), m.index! + 40));
      expect([f, hits]).toEqual([f, []]);
    });
  }
  test("the voice test itself can fail: a sentence with I or my is caught, a sentence in you voice is not", () => {
    expect(FIRST.test("Pick from my contacts")).toBe(true); expect(FIRST.test("What if I choose Host?")).toBe(true); expect(FIRST.test("Send me a code")).toBe(true);
    expect(FIRST.test("Pick from your contacts")).toBe(false); expect(FIRST.test("Invite people with just an ID")).toBe(false); expect(FIRST.test("You choose each prize")).toBe(false);
    expect(hitsIn(`const a = "<b class=\\"x\\">Open my game</b>"; const b = \`<p class="y">\${f(1)} Open my game</p>\`;`).length).toBe(2); // the reader sees text inside HTML inside a template
  });
});

describe("the owner's own words are on the screens, word for word", () => {
  const OWNER = [
    "Invite people with just an ID", "No names or personal details are needed.",
    "Just upload or paste the IDs of the people you want to invite: employee ID, associate ID, vendor ID or customer ID, whichever you use.",
    "Your invitee opens the game link and enters their ID. If it is on your list, they join and play. If it is not, you get a request to approve or decline.",
    "The list and all IDs are deleted within 24 hours after the game ends.",
  ];
  test("the invite text sits in the console, in the owner's five lines", () => { const s = pub("zc.js"); for (const t of OWNER) expect([t, s.includes(t)]).toEqual([t, true]); });
  test("the start wording: 'The game starts by itself' / 'The game begins at the time you set. You do nothing.'", () => {
    const s = pub("zc.js"); for (const t of ["The game starts by itself", "The game begins at the time you set. You do nothing.", "Numbers come by themselves", "A new random number appears every ${secs} seconds."]) expect([t, s.includes(t)]).toEqual([t, true]);
  });
});
