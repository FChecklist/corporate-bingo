// Small notes on the phone page that the owner asked for from Corporate Tambola (docs/boss/RULES_bingo.md sections 3, 6 and 10; QA 2026-10-29):
//   - the counter says how many are left: "30 of 75 called · 45 left"
//   - the waiting room tells the player to switch on Do Not Disturb
//   - a player who comes back after being away is told, once, how many numbers they missed, and that those stay called
import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { closeAll, joined, running, setup, sleep } from "./phone-world";

setDefaultTimeout(60_000);
afterEach(closeAll);

describe("the counter", () => {
  test("shows 'N of 75 called · K left' with N + K = 75, in auto and in tap games", async () => {
    for (const mark of ["auto", "tap"] as const) {
      const { p } = await running(mark, 25);
      const t = p.text(), m = /of 75 called · (\d+) left/.exec(t), board = /Call board · (\d+) of 75 called/.exec(t); expect(m).toBeTruthy(); expect(board).toBeTruthy(); // (the number in the chip counts up over a third of a second, so the call board's count is the exact one)
      expect(Number(board![1]) + Number(m![1])).toBe(75); expect(Number(board![1])).toBeGreaterThanOrEqual(25);
      expect(p.text()).not.toMatch(/NaN|undefined/); await p.close();
    }
  });
});

describe("Do Not Disturb", () => {
  test("the waiting room carries the tip once", async () => {
    const w = await setup("auto"); const p = await joined(w);
    const t = p.text(); expect(t.split("Tip: switch on Do Not Disturb so calls and chats do not interrupt your game.").length - 1).toBe(1);
  });
});

describe("away and back", () => {
  /** Hides the page, lets `ms` pass for the phone clock and for the world, shows the page again. */
  async function awayFor(p: any, w: any, ms: number) {
    const doc = p.win.document;
    Object.defineProperty(doc, "visibilityState", { value: "hidden", configurable: true }); Object.defineProperty(doc, "hidden", { value: true, configurable: true }); doc.dispatchEvent(new p.win.Event("visibilitychange"));
    p.win.__skew += ms; w.world.now += ms;
    Object.defineProperty(doc, "visibilityState", { value: "visible", configurable: true }); Object.defineProperty(doc, "hidden", { value: false, configurable: true }); doc.dispatchEvent(new p.win.Event("visibilitychange"));
  }
  test("30 seconds away at 12 s a number: 'Welcome back. You missed 2 or 3 numbers.' (marked as called) and it goes after a few seconds", async () => {
    const { w, p } = await running("auto", 10);
    await awayFor(p, w, 30_000);
    const t = await p.waitFor((x) => /Welcome back\. You missed \d+ numbers?\./.test(x), 20000);
    const k = Number(/You missed (\d+) number/.exec(t)![1]); expect(k).toBeGreaterThanOrEqual(2); expect(k).toBeLessThanOrEqual(3);
    expect(t).toContain("They are marked as called."); expect(t).not.toMatch(/NaN|undefined/);
    await sleep(11_500); expect(p.text()).not.toMatch(/Welcome back/);
  });
  test("5 minutes away: the count in the note keeps up with the numbers the phone catches up on (it froze at the first batch)", async () => {
    const { w, p } = await running("auto", 10);
    const board = () => Number(/Call board · (\d+) of 75/.exec(p.text())?.[1] ?? NaN);
    const before = board(); await awayFor(p, w, 300_000);
    const seen: { note: number; board: number }[] = []; const t0 = Date.now();
    while (Date.now() - t0 < 14_000) { const t = p.text(), m = /Welcome back\. You missed (\d+) numbers?/.exec(t), b = board(); if (m && Number.isFinite(b)) seen.push({ note: Number(m[1]), board: b }); await sleep(250); }
    expect(seen.length).toBeGreaterThan(3);
    for (const x of seen) expect(x.note).toBe(x.board - before); // old code: the note stayed at the first batch (8) while the board went 11 to 37
    expect(Math.max(...seen.map((x) => x.note))).toBeGreaterThanOrEqual(20);
  });
  test("a tap-to-mark game says to tap them", async () => {
    const { w, p } = await running("tap", 10); await awayFor(p, w, 30_000);
    expect(await p.waitFor((x) => /Welcome back\. You missed \d+ numbers?\./.test(x), 20000)).toContain("tap them to mark");
  });
  test("a short glance away (under 15 seconds) says nothing", async () => {
    const { w, p } = await running("auto", 10); await awayFor(p, w, 8_000); await sleep(2500);
    expect(p.text()).not.toMatch(/Welcome back/);
  });
});
