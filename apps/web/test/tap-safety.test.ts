// Tap safety on the phone page (Corporate Tambola 1.4.4, carried to Bingo; QA 2026-10-29).
//   1. The page redraws itself every second. A redraw between a finger going down and coming up replaces the button under the finger, and the tap is lost.
//      While a finger is down the page does not redraw; it catches up as soon as the finger lifts.
//   2. A tap counts once: the same number tapped twice within a moment (a double tap, a bounce) marks it and does not un-mark it again.
import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { cell, closeAll, joined, running, setup, sleep, touch } from "./phone-world";

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
