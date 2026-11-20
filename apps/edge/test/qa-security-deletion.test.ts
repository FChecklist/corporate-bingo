// Security audit 2026-10-29, finding S4: two ways around the 20-hour erasure (each test failed on the live commit bd66d3c).
//  (a) "Delete all participant data" pressed BEFORE the game starts marked the game as erased for good, so the 20-hour job skipped it: the guests who joined afterwards were never erased.
//  (b) a guest who opened the link after the erasure could still join, and their name stayed (until the 365-day sweep).
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { PURGE_AFTER_MS, lifecycleTick, roundMs } from "../src/lifecycle";
import { lazyTickReset } from "../src/worker";
import { sentReports } from "../src/pay";
import { HOUR, MIN, W, call, create, dev, j, keyH, one, organizer, publish, reset, restore, startIn } from "./param-harness";

beforeEach(() => { reset(); lazyTickReset(); sentReports.length = 0; });
afterEach(restore);
const GRACE = 40, count = (id: string) => one("SELECT COUNT(*) AS c FROM participant WHERE eid=?", id).c as number;
const joinNamed = (id: string, i: number, now: number) => call("POST", `/api/z/${id}/join`, { name: "Guest " + i, device: dev(i) }, { "cf-connecting-ip": `10.2.0.${i}` }, now);

describe("S4(a): deleting the participants' data before the game starts does not switch the 20-hour erasure off", () => {
  test("a guest who joins after an early erase is erased 20 hours after the end, and the report still goes out", async () => {
    const o = await organizer("boss@acme.com"); const id = "ERASE-A", start = startIn(3 * HOUR);
    expect((await create(o.key, id, { startRound: start, callSeconds: 12, cap: 10, name: "Friday Bingo" })).status).toBe(200);
    expect((await j(await publish(o.key, id))).published).toBe(true);
    const before = roundMs(start) - HOUR;
    expect((await joinNamed(id, 1, before)).status).toBe(200); expect(count(id)).toBe(1);
    const er = await call("POST", `/api/z/${id}/erase`, {}, keyH(o.key), before + 5 * MIN); expect(er.status).toBe(200); expect(count(id)).toBe(0); // practice guests cleared before the real invitations
    expect((await joinNamed(id, 2, before + 10 * MIN)).status).toBe(200); expect((await joinNamed(id, 3, before + 11 * MIN)).status).toBe(200); expect(count(id)).toBe(2); // the real guests
    const end = roundMs(start + GRACE) + 75 * 12_000; // the game runs to its schedule: nobody sent "game over"
    let k = 0; while (!sentReports.length && k++ < 8) await lifecycleTick(W.env as any, end + 4 * MIN + k * 1000);
    expect(sentReports.length).toBe(1); // old code: no report at all (the game counted as erased)
    let g = 0; while (g++ < 6) await lifecycleTick(W.env as any, end + PURGE_AFTER_MS + 5 * MIN + g * 1000);
    expect(count(id)).toBe(0); // old code: 2 guests still there 20 hours later
  });
});

describe("S4(b): nobody can join a game whose participants' data has already been erased", () => {
  test("after the erasure the link says the game is over and stores nothing; before it, a late guest is still welcome", async () => {
    const o = await organizer("boss@acme.com"); const id = "ERASE-B", start = startIn(3 * HOUR);
    expect((await create(o.key, id, { startRound: start, callSeconds: 12, cap: 10 })).status).toBe(200);
    expect((await j(await publish(o.key, id))).published).toBe(true);
    const end = roundMs(start + GRACE) + 75 * 12_000;
    expect((await joinNamed(id, 1, roundMs(start) - 10 * MIN)).status).toBe(200);
    expect((await joinNamed(id, 2, end - 10 * MIN)).status).toBe(200); // a late joiner during the game (designed): welcome
    let g = 0; while (g++ < 6) await lifecycleTick(W.env as any, end + PURGE_AFTER_MS + 5 * MIN + g * 1000);
    expect(count(id)).toBe(0); expect(one("SELECT purged_ms FROM life WHERE eid=?", id).purged_ms).toBeGreaterThan(0);
    const late = await joinNamed(id, 3, end + PURGE_AFTER_MS + 40 * MIN);
    expect(late.status).toBe(410); expect((await j(late)).error).toMatch(/over|deleted/i);
    expect(count(id)).toBe(0); // old code: 200, and the name stayed
  });
});
