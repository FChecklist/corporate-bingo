// Tap safety on the phone page (Corporate Tambola 1.4.4, carried to Bingo; QA 2026-10-29).
//   1. The page redraws itself every second. A redraw between a finger going down and coming up replaces the button under the finger, and the tap is lost.
//      While a finger is down the page does not redraw; it catches up as soon as the finger lifts.
//   2. A tap counts once: the same number tapped twice within a moment (a double tap, a bounce) marks it and does not un-mark it again.
import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { completionIndex, ticketsFor } from "../../../packages/beacon/src/game";
import { pickNumber } from "../../../packages/beacon/src/index";
import { roundMs } from "./harness";
import { START, cell, closeAll, joined, phone, rnd, setup, sleep, touch, running } from "./phone-world";

setDefaultTimeout(60_000);
afterEach(closeAll);

describe("a finger on the screen stops the redraw", () => {
  test("tap mode: while a finger is down the buttons stay; after it lifts the page redraws on its own", async () => {
    const w = await setup("tap"); const p = await joined(w);
    const first = cell(p); expect(first).toBeTruthy();
    await sleep(1300); expect(first.isConnected).toBe(false); // the normal redraw replaces the buttons (this is what loses a tap)
    const b = cell(p); touch(p, b, "pointerdown");
    await sleep(1300); expect(b.isConnected).toBe(true); // finger down: nothing was replaced
    touch(p, b, "pointerup");
    await sleep(1300); expect(b.isConnected).toBe(false); // finger up: the page caught up
    expect(p.errors).toEqual([]);
  });
  test("touch events work the same (older phones): touchstart holds the redraw, touchend lets it go", async () => {
    const w = await setup("tap"); const p = await joined(w);
    const b = cell(p); touch(p, b, "touchstart"); await sleep(1300); expect(b.isConnected).toBe(true);
    touch(p, b, "touchend"); await sleep(1300); expect(b.isConnected).toBe(false);
  });
  test("a lost lift (the phone never says the finger came up) cannot freeze the screen for ever: it redraws after a few seconds", async () => {
    const w = await setup("tap"); const p = await joined(w);
    const b = cell(p); touch(p, b, "pointerdown"); await sleep(3600); expect(b.isConnected).toBe(false);
  });
  test("auto-marking games are protected too (the sound, calendar and share buttons are redrawn every second as well)", async () => {
    const w = await setup("auto"); const p = await joined(w);
    const b = p.$("#snd") as any; expect(b).toBeTruthy(); touch(p, b, "pointerdown"); await sleep(1300); expect(b.isConnected).toBe(true);
    touch(p, b, "pointerup"); await sleep(1300); expect(b.isConnected).toBe(false);
  });
});

describe("a tap counts once", () => {
  test("a double tap marks the number once (it used to mark and then un-mark it)", async () => {
    const { p } = await running("tap", 25);
    await p.waitFor(() => !!p.$("button[data-dn].due"), 20000);
    const n = (p.$("button[data-dn].due") as any).dataset.dn;
    const pressed = () => (p.$(`button[data-dn="${n}"]`) as any).getAttribute("aria-pressed");
    const tapNow = () => { const el = p.$(`button[data-dn="${n}"]`) as any; touch(p, el, "pointerdown"); touch(p, el, "pointerup"); el.click(); };
    tapNow(); expect(pressed()).toBe("true");
    tapNow(); expect(pressed()).toBe("true"); // the second tap of a double tap, a moment later
    await sleep(500); tapNow(); expect(pressed()).toBe("false"); // a deliberate tap later does un-mark it (a wrong tap can be taken back)
    expect(p.errors).toEqual([]);
  });
});

describe("a win found while a finger is down is still celebrated", () => {
  /** The call at which this card's Line completes, from the same fake randomness the page uses (the first number is call 0). */
  const lineAt = (pid: string) => { const log: number[] = []; for (let k = 0; k < 75; k++) log.push(pickNumber("TAP-1", k, rnd(START + 40 + 4 * k), log)); return completionIndex(ticketsFor("TAP-1", pid, 1)[0]!, "line", log); };
  test("the redraw is held while the finger is down, and the 'Hurray' overlay still appears when it lifts", async () => {
    const w = await setup("auto"); const p0 = await joined(w);
    const ls = (p0.win as any).localStorage as { length: number; key(i: number): string; getItem(k: string): string }; const kept: [string, string][] = [];
    for (let i = 0; i < ls.length; i++) { const k = ls.key(i); kept.push([k, ls.getItem(k)]); }
    const pid = ls.getItem("cbz:TAP-1:pid"); const idx = lineAt(pid); expect(idx).toBeGreaterThan(3);
    await p0.close();
    w.world.now = roundMs(START + 40) + (idx - 1) * 12_000 + 3000; // the call before the winning one has just been made
    const p = await phone(w, kept); await p.waitFor((x) => { const m = /Call board · (\d+) of 75 called/.exec(x); return !!m && Number(m[1]) >= idx; }, 40000);
    expect(p.$("#hurray")).toBeNull();
    const b = cell(p) ?? (p.$("#snd") as any);
    p.win.__skew += 12_000; w.world.now += 12_000; touch(p, b, "pointerdown"); // the winning number is called and, in the same instant, a finger goes down (one JS turn: no redraw can come in between)
    await sleep(1600); expect(p.$("#hurray")).toBeNull(); // the page found the win but holds the redraw (2.5 s at most)
    touch(p, b, "pointerup"); await p.waitFor(() => !!p.$("#hurray"), 8000); // the finger lifts: the celebration comes
    expect((p.$("#hurray") as any).textContent).toMatch(/Hurray!.*You won|Hurray!.*Congratulations/); expect(p.errors).toEqual([]);
  });
});
