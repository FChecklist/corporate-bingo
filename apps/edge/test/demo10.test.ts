// The 10-player Rs 0 demo game (owner order 2026-10-27): an organizer makes a game for 10 people, publishes it with no payment, ten phones join with a name,
// the eleventh is told the game is full, and the same phone joining twice gets the same card.
import { beforeEach, describe, expect, test } from "bun:test";
import { type Env } from "../src/worker";
import { handle } from "./with-terms";
import { makeD1 } from "./d1-sqlite";

const T = Date.UTC(2026, 9, 1, 10, 0, 0), GEN = 1692803367;
const START = Math.floor((T / 1000 - GEN) / 3) + 1 + 1200;
let env: Env; let n = 0;
const call = (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) =>
  handle(new Request("http://x" + path, { method, headers: { "content-type": "application/json", ...headers }, body: body === undefined ? undefined : JSON.stringify(body) }), env, T);
const j = async (r: Response) => (await r.json()) as any;
const dev = (i: number) => String(i).padStart(2, "0").repeat(16);
beforeEach(() => { const d = makeD1(); env = { DB: d.db, ORGANIZER_SECRET: "plat", DAILY_WRITE_BUDGET: "1000000", PUBLIC_ORIGIN: "https://bingo.test", PHONE_SALT: "salt", DATA_KEY: "k" } as any; });

describe("10-player demo game at Rs 0", () => {
  test("make, publish with no payment, 10 join by name, the 11th is refused, the same phone gets the same card", async () => {
    const s = await j(await call("POST", "/api/start", { email: `demo${++n}@acme.com` }, { "cf-connecting-ip": "10.0.0.9" }));
    const h = { "x-organizer": s.token as string };
    expect((await call("POST", "/api/z", { id: "DEMO-10", startRound: START, callSeconds: 9, cap: 10 }, h)).status).toBe(200);
    const pub = await call("POST", "/api/z/DEMO-10/publish", { email: "boss@acme.com", phone: "98765 43210" }, h);
    expect(pub.status).toBe(200); const pb = await j(pub); expect(pb.published).toBe(true); expect(pb.paid).toBe(true); // no payment is asked for a game of up to 10 people
    const pids = new Set<string>();
    for (let i = 1; i <= 10; i++) {
      const r = await call("POST", "/api/z/DEMO-10/join", { name: "Player " + i, device: dev(i) }, { "cf-connecting-ip": `10.1.0.${i}` });
      expect(r.status).toBe(200); pids.add((await j(r)).pid);
    }
    expect(pids.size).toBe(10);
    const eleventh = await call("POST", "/api/z/DEMO-10/join", { name: "Late", device: dev(11) }, { "cf-connecting-ip": "10.1.0.11" });
    expect(eleventh.status).toBeGreaterThanOrEqual(400); expect((await j(eleventh)).error).toMatch(/full|limit/i);
    const again = await j(await call("POST", "/api/z/DEMO-10/join", { name: "Player 3", device: dev(3) }, { "cf-connecting-ip": "10.1.0.3" }));
    expect(pids.has(again.pid)).toBe(true);
    const sum = await j(await call("GET", "/api/z/DEMO-10/summary", undefined, h)); expect(sum.joined ?? sum.participants ?? 10).toBe(10);
  });

  test("the draft of a 10-person game says it costs Rs 0 (it used to quote the 100-person price Rs 2,399), the 11-person draft quotes the 100-person pack", async () => {
    const s = await j(await call("POST", "/api/start", { email: `demo${++n}@acme.com` }, { "cf-connecting-ip": "10.0.0.8" }));
    const h = { "x-organizer": s.token as string };
    for (const [id, cap] of [["DEMO-D10", 10], ["DEMO-D1", 1], ["DEMO-D11", 11]] as const) expect((await call("POST", "/api/z", { id, startRound: START, callSeconds: 12, cap }, h)).status).toBe(200);
    for (const id of ["DEMO-D10", "DEMO-D1"]) {
      const sm = await j(await call("GET", `/api/z/${id}/summary`, undefined, h));
      expect([sm.priceInr, sm.priceUsd, sm.free, sm.paid]).toEqual([0, 0, true, false]); expect(sm.pack).toBe(sm.limit);
      expect(sm.nextSteps.find((x: any) => /^Pay/.test(x.step)).step).toMatch(/nothing to pay.*Rs 0/);
    }
    const big = await j(await call("GET", "/api/z/DEMO-D11/summary", undefined, h));
    expect([big.pack, big.priceInr, big.free]).toEqual([100, 2399, undefined]); expect(big.nextSteps.find((x: any) => /^Pay/.test(x.step)).step).toBe("Pay (the game does not begin until it is paid)");
  });

  test("a game bigger than the biggest pack: the summary says to write to us instead of a silent empty price (the console and the checkout say the same)", async () => {
    const s = await j(await call("POST", "/api/start", { email: `demo${++n}@acme.com` }, { "cf-connecting-ip": "10.0.0.7" }));
    const h = { "x-organizer": s.token as string };
    expect((await call("POST", "/api/z", { id: "BIG-20K", startRound: START, callSeconds: 12, cap: 20000 }, h)).status).toBe(200);
    const sm = await j(await call("GET", "/api/z/BIG-20K/summary", undefined, h));
    expect([sm.pack, sm.priceInr]).toEqual([null, null]); expect(sm.customNote).toMatch(/write to us.*custom arrangement/);
    expect((await call("POST", "/api/z", { id: "ORD-100", startRound: START, callSeconds: 12, cap: 100 }, h)).status).toBe(200);
    const ok = await j(await call("GET", "/api/z/ORD-100/summary", undefined, h)); expect(ok.priceInr).toBe(2399); expect(ok.customNote).toBeUndefined(); // an ordinary size has no such note
  });
});
