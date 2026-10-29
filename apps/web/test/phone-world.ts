// Shared set-up for the phone-page tests that need a published game, a joined phone and a game that is already running (QA 2026-10-29).
// The real page scripts run in a DOM against the real Worker; only the public randomness is faked (as in phone-guest.test.ts).
import { expect } from "bun:test";
import { createHash } from "node:crypto";
import { newWorld, openPage, roundAt, roundMs, T, type Page } from "./harness";

export const START = roundAt(T) + 1200; // one hour after T
export const rnd = (r: number) => createHash("sha256").update("fake" + r).digest("hex");
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export const opened: Page[] = [];
export const closeAll = async () => { for (const p of opened.splice(0)) await p.close(); };

export async function setup(mark: "tap" | "auto") {
  const w = newWorld();
  const s = await w.json(await w.api("POST", "/api/start", { email: "boss@acme.com" }));
  const made = await w.api("POST", "/api/z", { id: "TAP-1", startRound: START, callSeconds: 12, cap: 10, mark }, s.aiKey); expect(made.status).toBe(200);
  expect((await w.api("POST", "/api/z/TAP-1/publish", { email: "boss@acme.com", phone: "98765 43210" }, s.token)).status).toBe(200);
  return w;
}
const rtFake = (win: any, nowMs: () => number) => {
  const Orig = win.ZG.PhoneRuntime;
  win.ZG.PhoneRuntime = class extends Orig {
    constructor(eid: string, deps: any) {
      super(eid, { ...deps, beacon: { fetcher: async (url: string) => { const last = url.split("/").pop()!; const r = last === "latest" ? roundAt(nowMs()) : Number(last); return { ok: true, status: 200, json: async () => ({ round: r, randomness: rnd(r), signature: "aa" }) }; }, mirrors: ["https://a.test", "https://b.test", "https://c.test"] }, verify: () => true });
    }
  };
};
export async function phone(w: ReturnType<typeof newWorld>, store?: [string, string][]) {
  const p = await openPage(w.world, { url: "http://localhost/z?e=TAP-1", html: "z.html", scripts: ["audio.js", "zgame.js", "z.js"], afterLoad: (win, f) => { if (f === "keep.js" || f === "consent.js") for (const [k, v] of store ?? []) win.localStorage.setItem(k, v); if (f === "zgame.js") rtFake(win, () => w.world.now); } });
  opened.push(p); return p;
}
export async function joined(w: ReturnType<typeof newWorld>) {
  const p = await phone(w); await p.waitFor((x) => /Join the game/.test(x));
  (p.$("#nm") as any).value = "Asha"; p.click("#go"); await p.waitFor((x) => /Your card|What you can win|Starting in|Getting ready/.test(x));
  return p;
}

/** The cell buttons (tap-to-mark games) and a way to send a touch or pointer event to an element. */
export const cell = (p: Page) => p.$("button[data-dn]") as any;
export const touch = (p: Page, el: any, type = "pointerdown") => el.dispatchEvent(new p.win.Event(type, { bubbles: true }));

/** A phone for a game that is already running, `calls` numbers called: opened with the card an earlier visit kept (the pid and the device id are in the phone's storage). */
export async function running(mark: "tap" | "auto" = "tap", calls = 25) {
  const w = await setup(mark); const p0 = await joined(w);
  const ls = (p0.win as any).localStorage as { length: number; key(i: number): string; getItem(k: string): string }; const kept: [string, string][] = [];
  for (let i = 0; i < ls.length; i++) { const k = ls.key(i); kept.push([k, ls.getItem(k)]); }
  await p0.close(); opened.splice(opened.indexOf(p0), 1);
  w.world.now = roundMs(START + 40) + calls * 12_000 + 3000; // `calls` numbers have been called
  const p = await phone(w, kept); await p.waitFor((x) => /called/.test(x) && !/Loading/.test(x), 20000);
  return { w, p };
}
