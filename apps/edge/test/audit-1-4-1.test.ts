// Audit of PR 9 head 2262827b (FAIL + PASS comments), fixed in 1.4.1:
//  * counter per network: one key per network (an IPv6 /64 is ONE network), and the count goes up in one database statement (parallel requests cannot all read the old number). 1.5.3: it counts waiting-room requests now, not wrong IDs
//  * the paid route writes to the database only when it is switched on (CONSOLE_PUBKEYS set)
//  * the AI helper is no longer told it can "make a pay link that anyone can open"
//  * the organizer's ID box says an ID is matched to a list and does not prove who types it (owner decision: "ID matched, not proven")
// FALSIFIED BY: ipv6-rotation-resets-limit, parallel-misses-pass-the-limit, dark-route-writes-to-db, ai-text-offers-open-pay-link, id-box-says-nothing-about-proof
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ipGroup } from "../src/ipkey";
import { T, W, call, callRaw, create, dev, j, one, organizer, publish, q, reset, restore, uid } from "./param-harness";

beforeEach(() => reset());
afterEach(restore);
const kh = (k: string): Record<string, string> => ({ "x-organizer": k });

describe("one key per network", () => {
  test("every address inside one IPv6 /64 gives the same key; another /64 and IPv4 addresses differ; a mapped IPv4 equals the plain one", () => {
    expect(ipGroup("2001:db8:1:2:aaaa:bbbb:cccc:dddd")).toBe(ipGroup("2001:db8:1:2::1"));
    expect(ipGroup("2001:DB8:1:2:ffff:ffff:ffff:ffff")).toBe(ipGroup("2001:db8:1:2:0:0:0:0"));
    expect(ipGroup("2001:db8:1:3::1")).not.toBe(ipGroup("2001:db8:1:2::1"));
    expect(ipGroup("203.0.113.7")).not.toBe(ipGroup("203.0.113.8"));
    expect(ipGroup("::ffff:203.0.113.7")).toBe(ipGroup("203.0.113.7"));
    expect(ipGroup(null)).toBe("local");
  });
});

async function idGame() {
  const o = await organizer(), id = uid("IP");
  expect((await create(o.key, id, { cap: 20, whoCanJoin: "list" })).status).toBe(200);
  expect((await publish(o.key, id)).status).toBe(200);
  expect((await call("PATCH", `/api/z/${id}/settings`, { verify: "id" }, kh(o.key))).status).toBe(200);
  return { ...o, id };
}
const miss = (id: string, i: number, ip: string, now = T) => call("POST", `/api/z/${id}/join`, { empId: "ZZ" + (1000 + i), device: dev(i) }, { "cf-connecting-ip": ip }, now); // with the ticked boxes: only then does an unlisted ID reach the waiting room

// 1.5.3 (security audit 23 Nov 2026, Medium 3): the old "30 wrong IDs per network per 10 minutes" door is gone, because an unlisted ID is a normal request that waits for a yes.
// What stays from 1.4.1 is the part that was right: ONE key per network (an IPv6 /64) and ONE database statement per count, so parallel requests cannot all read the old number.
// The new limits (waiting room cap per network, no counting of waiting people) are in audit-1-5-3.test.ts.
describe("the waiting-room counter per network", () => {
  test("a person who turns through addresses of one IPv6 /64 is still ONE network: one key, and every unlisted ID waits", async () => {
    const g = await idGame();
    const seen: number[] = [];
    for (let i = 0; i < 31; i++) seen.push((await miss(g.id, i, `2001:db8:5:6:${(i + 1).toString(16)}::${(i + 7).toString(16)}`)).status);
    expect(seen.every((s) => s === 403)).toBe(true); // waiting, never the old 429
    expect(q("SELECT v FROM kv WHERE k LIKE ?", `idmiss/${g.id}/%`).length).toBe(1);
  });
  test("40 unlisted IDs sent at the same moment from one address: the count is exact (40) and every one of them waits", async () => {
    const g = await idGame();
    const rs = await Promise.all(Array.from({ length: 40 }, (_, i) => miss(g.id, i, "2001:db8:9:9::1")));
    expect(rs.filter((r) => r.status === 403).length).toBe(40);
    const rows = q("SELECT v FROM kv WHERE k LIKE ?", `idmiss/${g.id}/%`);
    expect(rows.length).toBe(1); expect(Number(rows[0].v)).toBe(40);
  });
});

describe("the paid route is quiet when it is dark", () => {
  test("without CONSOLE_PUBKEYS a POST with an order id changes nothing in the database", async () => {
    W.raw.exec("CREATE TABLE IF NOT EXISTS console_paid (order_ref TEXT PRIMARY KEY, eid TEXT NOT NULL, state TEXT NOT NULL, at_ms INTEGER NOT NULL)");
    W.raw.prepare("INSERT INTO console_paid VALUES('ORD-STALE-1','x','marking',?)").run(T - 10 * 60_000);
    delete (W.env as any).CONSOLE_PUBKEYS; W.env.PUBLIC_ORIGIN = "https://bingo.test";
    const r = await callRaw("POST", "/api/console/paid", { assertion: "a.b", eid: "x", item: "100", orderRef: "ORD-STALE-1" }, {}, T);
    expect(r.status).toBe(404);
    expect(one("SELECT state FROM console_paid WHERE order_ref='ORD-STALE-1'")?.state).toBe("marking");
  });
});

describe("words", () => {
  test("the AI helper is not told it can make a pay link that anyone can open", () => {
    const src = readFileSync(join(import.meta.dir, "../src/worker.ts"), "utf8");
    expect(src).not.toMatch(/pay link that anyone can open/i);
    expect(src).toMatch(/an AI key never pays or makes a pay link/);
  });
  test("the organizer's ID box says an ID is matched to the list and does not prove who types it", () => {
    const zc = readFileSync(join(import.meta.dir, "../../web/public/zc.js"), "utf8");
    expect(zc).toMatch(/An ID is matched to your list\. It does not prove who is typing it/);
  });
});
