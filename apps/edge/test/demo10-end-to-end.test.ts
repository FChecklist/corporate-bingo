// A free 10-person game from the first tap to the erasure, through the real endpoints (QA 2026-10-29; the same run is printed by `bun tools/qa-model.mjs --only DEMO10`).
// organizer makes and publishes (Rs 0) -> ten phones join -> the 11th is told the game is full -> the phones work out the winners from the public numbers and report them
// -> the store holds exactly those winners -> the phones say the game is over -> the report is mailed and opens with every prize and winner -> 20 hours later the players' details are gone
// and the winners and the settings stay -> after day 365 everything is gone.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { defaultCfg } from "../../../packages/beacon/src/config";
import { PrizeEngine } from "../../../packages/beacon/src/prize-engine";
import { NUMBERS, pickNumber } from "../../../packages/beacon/src/index";
import { PURGE_AFTER_MS, REPORT_LINK_MS, fullDeleteAt, lifecycleTick, roundMs } from "../src/lifecycle";
import { lazyTickReset, purgeOld } from "../src/worker";
import { sentReports } from "../src/pay";
import { DAY, HOUR, MIN, T, W, call, create, dev, j, one, organizer, publish, reset, restore, startIn } from "./param-harness";

beforeEach(() => { reset(); lazyTickReset(); sentReports.length = 0; });
afterEach(restore);
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const GRACE = 40;

describe("the free 10-person game, end to end", () => {
  test("play it through: 10 join, 11th refused, winners agreed by the phones, game over, report with brand, erasure at 20 h, everything gone after 365 days", async () => {
    const o = await organizer("boss@acme.com"); const id = "DEMO-E2E"; const start = startIn(2 * HOUR);
    const prizes = [{ pattern: "line", ordinal: 1, text: "Movie tickets" }, { pattern: "corners", ordinal: 1, text: "Coffee voucher" }, { pattern: "x", ordinal: 1, text: "Lunch" }, { pattern: "blackout", ordinal: 1, text: "Hamper" }];
    expect((await create(o.key, id, { startRound: start, callSeconds: 12, cap: 10, name: "Friday Bingo", rewards: prizes, brand: { name: "Acme Foods", color: "#B3261E" } })).status).toBe(200);
    const pub = await j(await publish(o.key, id)); expect(pub.published).toBe(true); expect(pub.paid).toBe(true); // Rs 0: no payment is asked
    // ten phones join by name; the eleventh is told the game is full
    const joinAt = roundMs(start) - 30 * MIN, pids: string[] = [];
    for (let i = 1; i <= 10; i++) { const r = await call("POST", `/api/z/${id}/join`, { name: "Player " + i, device: dev(i) }, { "cf-connecting-ip": `10.1.0.${i}` }, joinAt); expect(r.status).toBe(200); pids.push((await j(r)).pid); }
    expect(new Set(pids).size).toBe(10);
    const eleven = await call("POST", `/api/z/${id}/join`, { name: "Eleven", device: dev(11) }, { "cf-connecting-ip": "10.1.0.11" }, joinAt); expect(eleven.status).toBe(409);
    // the numbers come from the public randomness (a fixed fake one here); each phone runs the same engine
    const numbers: number[] = []; for (let k = 0; k < NUMBERS; k++) numbers.push(pickNumber(id, k, sha("demo" + k), numbers));
    const engine = new PrizeEngine(id, { ...defaultCfg(), rewards: prizes.map((p) => ({ ...p, scope: "ticket" as const })) }, 1); engine.addSeats(pids.map((pid) => ({ pid, countFrom: 0 }))); engine.work(1e9);
    let last = 0; for (let k = 0; k < NUMBERS; k++) { engine.feed(numbers[k]!, 0); last = k; if (engine.results().length === prizes.length) break; }
    const results = engine.results(); expect(results.length).toBe(4);
    const firstCall = roundMs(start + GRACE), gap = 12_000, atEnd = firstCall + (last + 1) * gap;
    for (let i = 0; i < 10; i++) for (let c = 0; c < results.length; c += 3) expect((await call("POST", `/api/z/${id}/vote`, { pid: pids[i], device: dev(i + 1), results: results.slice(c, c + 3).map((x) => ({ pattern: x.pattern, ordinal: x.ordinal, round: 1, idx: x.idx, pids: x.pids })) }, {}, atEnd)).status).toBe(200);
    const stored = (await j(await call("GET", `/api/z/${id}/results`, undefined, {}, atEnd))).results; expect(stored.length).toBe(4);
    expect((await call("POST", `/api/z/${id}/vote`, { pid: pids[0], device: dev(9), results: [{ pattern: "line", ordinal: 1, round: 1, idx: 3, pids: [pids[1]] }] }, {}, atEnd)).status).toBe(403); // a vote from another phone
    for (let i = 0; i < 10; i++) await call("POST", `/api/z/${id}/over`, { pid: pids[i], device: dev(i + 1) }, {}, atEnd + 2000);
    const life = one("SELECT * FROM life WHERE eid=?", id); expect(life.end_src).toBe("phones"); const end = life.end_ms;
    // the report: not before 3 minutes, then within a few ticks; it names every prize and winner, carries the brand, says the game ended early
    await lifecycleTick(W.env as any, end + MIN); expect(sentReports.length).toBe(0);
    let guard = 0; while (!sentReports.length && guard++ < 8) await lifecycleTick(W.env as any, end + 4 * MIN + guard * 1000);
    expect(sentReports.length).toBe(1); expect(sentReports[0]!.to).toBe("boss@acme.com"); expect(sentReports[0]!.text).not.toMatch(/\bprivate\b|undefined|NaN/);
    const m = sentReports[0]!.text.match(/report\.html\?e=([A-Za-z0-9_-]+)&k=([0-9a-f]+)/)!;
    const base = (await j(await call("GET", `/api/report/${m[1]}?k=${m[2]}&part=base`, undefined, {}, end + 10 * MIN))).base;
    expect(base.prizes.map((p: any) => p.winners.length)).toEqual([1, 1, 1, 1]); expect(base.prizes.every((p: any) => /^Player \d+$/.test(p.winners[0].name))).toBe(true);
    expect(base.brand?.name).toBe("Acme Foods"); expect(base.endReason).toMatch(/Every prize was awarded/); expect(base.numbersCalled).toBe(last + 1);
    expect((await call("GET", `/api/report/${m[1]}?k=${m[2]}&part=base`, undefined, {}, end + REPORT_LINK_MS + 1000)).status).toBe(404); // the link closed at 19 hours
    // erasure
    await lifecycleTick(W.env as any, end + PURGE_AFTER_MS - MIN); expect(one("SELECT COUNT(*) c FROM participant WHERE eid=?", id).c).toBe(10);
    await lifecycleTick(W.env as any, end + PURGE_AFTER_MS + MIN);
    expect([one("SELECT COUNT(*) c FROM participant WHERE eid=?", id).c, one("SELECT COUNT(*) c FROM seat WHERE eid=?", id).c]).toEqual([0, 0]);
    expect(one("SELECT COUNT(*) c FROM winner WHERE eid=?", id).c).toBe(4); expect(one("SELECT COUNT(*) c FROM game_record WHERE eid=?", id).c).toBe(1); // the winners and the settings stay
    await purgeOld(W.env as any, fullDeleteAt(end) + MIN); expect(one("SELECT COUNT(*) c FROM winner WHERE eid=?", id).c).toBe(0);
    expect(DAY).toBeGreaterThan(0);
  });
});
