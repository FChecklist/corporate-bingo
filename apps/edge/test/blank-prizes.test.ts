// A prize left on "decide later" has no words. The organizer is warned before publishing, by name, and publishing is never blocked (owner rule 2026-10-28, Tambola).
// The console shows the note (apps/web/test/pages.test.ts "Publish step"); the summary an AI reads before the hand-over carries the same list (QA 2026-10-29).
import { describe, expect, test } from "bun:test";
import { handle } from "./with-terms";
import { makeD1 } from "./d1-sqlite";

const T = Date.UTC(2026, 9, 29, 10), START = Math.floor((T / 1000 - 1692803367) / 3) + 1 + 2400;
async function world() {
  const d = makeD1(); const env: any = { DB: d.db, ORGANIZER_SECRET: "plat", DAILY_WRITE_BUDGET: "1000000", PUBLIC_ORIGIN: "https://bingo.test", DATA_KEY: "k", PHONE_SALT: "s" };
  const call = async (m: string, p: string, b?: unknown, hd: Record<string, string> = {}) => { const r = await handle(new Request("http://x" + p, { method: m, headers: { "content-type": "application/json", ...hd }, body: b === undefined ? undefined : JSON.stringify(b) }), env, T); return { status: r.status, j: (await r.json().catch(() => ({}))) as any }; };
  const s = await call("POST", "/api/start", { email: "boss@acme.com" }, { "cf-connecting-ip": "5.5.5.5" }); const key = { "x-organizer": s.j.token };
  expect((await call("POST", "/api/z", { id: "BLANK-1", startRound: START, callSeconds: 12, cap: 10 }, key)).status).toBe(200);
  return { call, key };
}
describe("the summary lists the prizes that have no words", () => {
  test("a new game: all four default prizes are blank, and 'Name the prizes' is not done", async () => {
    const { call, key } = await world(); const sm = (await call("GET", "/api/z/BLANK-1/summary", undefined, key)).j;
    expect(sm.blankPrizes).toEqual(["Line", "Four Corners", "X", "Blackout"]);
    expect(sm.nextSteps.find((s: any) => s.step === "Name the prizes").done).toBe(false);
  });
  test("one prize with words, one set to 'No prize' (that is words), a house with two winners where only the 2nd is blank", async () => {
    const { call, key } = await world();
    expect((await call("PATCH", "/api/z/BLANK-1/settings", { rewards: [{ pattern: "line", ordinal: 1, text: "Gift card" }, { pattern: "corners", ordinal: 1, text: "Coffee" }, { pattern: "corners", ordinal: 2, text: "" }, { pattern: "x", ordinal: 1, text: "No prize" }] }, key)).status).toBe(200);
    const sm = (await call("GET", "/api/z/BLANK-1/summary", undefined, key)).j;
    expect(sm.blankPrizes).toEqual(["2nd Four Corners"]); expect(sm.nextSteps.find((s: any) => s.step === "Name the prizes").done).toBe(false); // one blank is enough to keep the step open (it used to be 'done' when any prize had words)
  });
  test("every prize has words: nothing listed, step done; and publishing is never blocked either way", async () => {
    const { call, key } = await world();
    const blankPublish = await call("POST", "/api/z/BLANK-1/publish", { email: "boss@acme.com", phone: "98765 43210" }, key); expect(blankPublish.status).toBe(200); // blank prizes do not stop it
    expect((await call("PATCH", "/api/z/BLANK-1/settings", { rewards: [{ pattern: "line", ordinal: 1, text: "Gift card" }] }, key)).status).toBeGreaterThanOrEqual(200); // a published game may still change its prizes before the start
    const sm = (await call("GET", "/api/z/BLANK-1/summary", undefined, key)).j;
    expect(sm.blankPrizes).toEqual([]); expect(sm.nextSteps.find((s: any) => s.step === "Name the prizes").done).toBe(true);
  });
});
