// Security audit of 23 Nov 2026 on head 9133ee65 (Medium 2 and Medium 3), fixed in 1.5.3:
//  * M2: "Is this you?" (POST /api/z/:id/who) used to return "First L." for any listed ID, with no limit. It now returns only { known } and NEVER a name before the person has joined.
//  * M3: the wrong-ID limit (30 per network per 10 minutes) counted honest unlisted people who only wait for a yes. Now a request that goes to the waiting room is not counted as a wrong try;
//        the waiting room has its own cap per network (WAITING_PER_NETWORK = 100 open requests per network per game per waiting period), counted in ONE database statement.
//  * Correctness audit Low: the AI manual no longer says `closed?: true|false` (false has been refused since 1.5.0).
// FALSIFIED BY: who-returns-a-name, who-miss-counted, unlisted-people-hit-429-at-31, no-cap-per-network-on-waiting, cap-counted-by-address-not-network, repeat-ask-counted-twice, ai-manual-offers-closed-false
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { T, call, create, dev, j, organizer, publish, q, reset, restore, uid } from "./param-harness";
import * as people from "../src/people";
import { consentFor } from "./with-terms";

beforeEach(() => reset());
afterEach(restore);
const WAITING_PER_NETWORK = 100; // written out here on purpose: a test that reads the number from the source would move with the source
const kh = (k: string): Record<string, string> => ({ "x-organizer": k });

async function idGame(cap = 20) {
  const o = await organizer(), id = uid("W3");
  expect((await create(o.key, id, { cap, whoCanJoin: "list" })).status).toBe(200);
  expect((await publish(o.key, id)).status).toBe(200);
  expect((await call("PATCH", `/api/z/${id}/settings`, { verify: "id" }, kh(o.key))).status).toBe(200);
  return { ...o, id };
}
const who = (id: string, empId: string, ip: string) => call("POST", `/api/z/${id}/who`, { empId, consent: consentFor("K4") }, { "cf-connecting-ip": ip });
const ask = (id: string, empId: string, ip: string, i = 1) => call("POST", `/api/z/${id}/join`, { empId, device: dev((i % 80) + 10) }, { "cf-connecting-ip": ip });
const waitingRows = (id: string) => Number(q("SELECT COUNT(*) AS c FROM waiting WHERE eid=? AND status='waiting'", id)[0].c);

describe("M2: \"Is this you?\" never gives a name before the person has joined", () => {
  test("200 listed people, 200 calls from one address: no call returns a name (before 1.5.3 all 200 did)", async () => {
    const g = await idGame(250);
    const people = Array.from({ length: 200 }, (_, i) => ({ name: `First${i} Last${i}`, empId: `A${1000 + i}` }));
    const r = await call("POST", `/api/z/${g.id}/people`, { people }, kh(g.key));
    expect(r.status).toBe(200);
    const answers: any[] = [];
    for (let i = 0; i < 200; i++) answers.push(await j(await who(g.id, `A-${1000 + i}`, "203.0.113.50")));
    expect(answers.filter((a) => "name" in a).length).toBe(0);
    expect(answers.every((a) => a.known === true)).toBe(true); // the page still learns "this ID is on the list"
    expect(JSON.stringify(answers)).not.toMatch(/First\d|Last\d/);
  });
  test("an ID that is not on the list answers known:false, and 40 such calls from one address are never refused (they lead to the waiting room)", async () => {
    const g = await idGame();
    await call("POST", `/api/z/${g.id}/people`, { people: [{ name: "Asha Rao", empId: "E101" }] }, kh(g.key));
    const codes: number[] = []; const bodies: any[] = [];
    for (let i = 0; i < 40; i++) { const r = await who(g.id, `Z${2000 + i}`, "203.0.113.51"); codes.push(r.status); bodies.push(await j(r)); }
    expect(codes.every((c) => c === 200)).toBe(true);
    expect(bodies.every((b) => b.known === false && !("name" in b))).toBe(true);
  });
});

describe("M3: honest unlisted people wait; the waiting room has its own cap per network", () => {
  test("40 honest unlisted people from one office address in 10 minutes: all 40 are told to wait, none is refused (before 1.5.3 the 31st to 40th got 429)", async () => {
    const g = await idGame();
    const out: { s: number; code: string }[] = [];
    for (let i = 0; i < 40; i++) { const r = await ask(g.id, `U${3000 + i}`, "198.51.100.7", i); out.push({ s: r.status, code: (await j(r)).code }); }
    expect(out.every((o) => o.s === 403 && o.code === "waiting")).toBe(true);
    expect(waitingRows(g.id)).toBe(40);
  });
  test(`one network can have ${WAITING_PER_NETWORK} requests open; the next gets 429 waiting-network-full and no row; another network is not affected`, async () => {
    const g = await idGame();
    for (let i = 0; i < WAITING_PER_NETWORK; i++) expect((await ask(g.id, `U${4000 + i}`, "198.51.100.8", i)).status).toBe(403);
    const over = await ask(g.id, "U9999", "198.51.100.8", 7);
    expect(over.status).toBe(429); expect((await j(over)).code).toBe("waiting-network-full");
    expect(waitingRows(g.id)).toBe(WAITING_PER_NETWORK);
    const other = await ask(g.id, "U9998", "198.51.100.9", 8); expect(other.status).toBe(403); expect((await j(other)).code).toBe("waiting");
    expect(waitingRows(g.id)).toBe(WAITING_PER_NETWORK + 1);
  });
  test("a right ID is never held back by the cap (owner rule: a right ID is not limited)", async () => {
    const g = await idGame();
    await call("POST", `/api/z/${g.id}/people`, { people: [{ name: "Asha Rao", empId: "E101" }] }, kh(g.key));
    for (let i = 0; i < WAITING_PER_NETWORK; i++) await ask(g.id, `U${5000 + i}`, "198.51.100.10", i);
    expect((await ask(g.id, "U-overflow", "198.51.100.10", 3)).status).toBe(429);
    expect((await ask(g.id, "E-101", "198.51.100.10", 4)).status).toBe(200); // the listed person comes in from the same full network
  });
  test(`${WAITING_PER_NETWORK + 30} requests at the same moment from one address: exactly ${WAITING_PER_NETWORK} wait, the rest get 429, the database count is exact`, async () => {
    const g = await idGame();
    const rs = await Promise.all(Array.from({ length: WAITING_PER_NETWORK + 30 }, (_, i) => ask(g.id, `P${6000 + i}`, "198.51.100.11", i)));
    expect(rs.filter((r) => r.status === 403).length).toBe(WAITING_PER_NETWORK);
    expect(rs.filter((r) => r.status === 429).length).toBe(30);
    expect(waitingRows(g.id)).toBe(WAITING_PER_NETWORK);
    const rows = q("SELECT v FROM kv WHERE k LIKE ?", `idmiss/${g.id}/%`);
    expect(rows.length).toBe(1); expect(Number(rows[0].v)).toBe(WAITING_PER_NETWORK + 30);
  });
  test("turning through addresses of one IPv6 /64 does not escape the cap", async () => {
    const g = await idGame();
    for (let i = 0; i < WAITING_PER_NETWORK; i++) expect((await ask(g.id, `V${7000 + i}`, `2001:db8:7:7:${(i + 1).toString(16)}::${(i + 3).toString(16)}`, i)).status).toBe(403);
    expect((await ask(g.id, "V-over", "2001:db8:7:7:ffff::1", 5)).status).toBe(429);
    expect((await ask(g.id, "V-other", "2001:db8:7:8::1", 6)).status).toBe(403); // another /64
  });
  test("the same person asking again is not counted again (the old counter counted every try)", async () => {
    const g = await idGame();
    for (let i = 0; i < 5; i++) expect((await ask(g.id, "R4001", "198.51.100.12", 1)).status).toBe(403);
    const rows = q("SELECT v FROM kv WHERE k LIKE ?", `idmiss/${g.id}/%`);
    expect(rows.length).toBe(1); expect(Number(rows[0].v)).toBe(1);
    expect(waitingRows(g.id)).toBe(1);
  });
  test("a new waiting period (30 minutes later) starts a new count for the same network", async () => {
    const g = await idGame();
    for (let i = 0; i < WAITING_PER_NETWORK; i++) await ask(g.id, `L${8000 + i}`, "198.51.100.13", i);
    expect((await ask(g.id, "L-over", "198.51.100.13", 2)).status).toBe(429);
    const later = await call("POST", `/api/z/${g.id}/join`, { empId: "L-later", device: dev(33) }, { "cf-connecting-ip": "198.51.100.13" }, T + 31 * 60_000);
    const lb = await j(later); expect([later.status, lb.code]).toEqual([403, "waiting"]);
  });
});

describe("the numbers", () => {
  test("the cap per network in the source is 100 of the 500 places", () => {
    expect((people as any).WAITING_PER_NETWORK).toBe(100);
    expect(people.WAITING_MAX).toBe(500);
  });
});

describe("words", () => {
  test("the AI manual does not offer `closed: false` (it has been refused since 1.5.0)", () => {
    const src = readFileSync(join(import.meta.dir, "../src/ai-link.ts"), "utf8");
    expect(src).not.toMatch(/closed\?: true\|false/);
    expect(src).toMatch(/closed\?: true \(invite-only/);
  });
});
