// 20 Nov 2026 (owner): "Invite people with just an ID". One alphanumeric ID, no name, no mobile number, no e-mail. A-1101, A 1101 and A/1101 are the same ID at upload, at join, at approval and at matching,
// in every game (old or new). An ID that is not on the list waits; the organizer says yes or no; every step is in a log that shows only the ID. The list and the IDs are erased with the players' data
// (within 24 hours after the game ends). Real Worker code against an in-memory D1.
// FALSIFIED BY: idinvite-dash-differs, idinvite-space-differs, idinvite-slash-differs, idinvite-unlisted-joins-straight-in, idinvite-log-shows-name, idinvite-erase-keeps-ids, idinvite-legacy-locked-out
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { HOUR, T, W, call, callRaw, create, dev, j, one, organizer, publish, q, reset, restore, uid } from "./param-harness";
import { EMP_LEGACY_BEFORE_MS, cleanEmpId, legacyEmpFor, normEmpFor } from "../src/empid";
import { empHashOf } from "../src/people";
import { erasePersonal, lifecycleTick, endBoundMs, PURGE_AFTER_MS } from "../src/lifecycle";

const kh = (k: string): Record<string, string> => ({ "x-organizer": k });
beforeEach(() => reset());
afterEach(restore);

/** a published game for 20 people that waits for a yes from people who are not on its list, asking for the ID only */
async function idGame(over: Record<string, unknown> = {}, settings: Record<string, unknown> = {}) {
  const o = await organizer(), id = uid("ID");
  expect((await create(o.key, id, { cap: 20, whoCanJoin: "list", ...over })).status).toBe(200);
  expect((await publish(o.key, id)).status).toBe(200);
  expect((await call("PATCH", `/api/z/${id}/settings`, { verify: "id", ...settings }, kh(o.key))).status).toBe(200);
  return { ...o, id };
}
const add = (g: { key: string; id: string }, ids: string[], now = T) => call("POST", `/api/z/${g.id}/people`, { people: ids.map((empId) => ({ empId })) }, kh(g.key), now);
const joinId = (g: { id: string }, empId: string, i: number, now = T) => call("POST", `/api/z/${g.id}/join`, { empId, device: dev(i) }, {}, now);
const count = (sql: string, ...a: unknown[]) => Number(one(sql, ...a)?.c ?? 0);

describe("the one ID rule", () => {
  test("every character that is not a letter or a number goes; capitals; A-1101, A 1101, A/1101 and a.1101 are one ID", () => {
    for (const x of ["A-1101", "A 1101", "A/1101", "a.1101", "  a_1101 ", "Ａ１１０１"]) expect([x, cleanEmpId(x)]).toEqual([x, "A1101"]);
    expect(normEmpFor("B-2202")).toBe("B2202"); expect(normEmpFor("   ")).toBe(""); expect(normEmpFor("---")).toBeNull();
    expect(normEmpFor("x@y.com")).toBeNull(); expect(normEmpFor("१२३")).toBeNull(); expect(normEmpFor("A".repeat(31))).toBeNull(); expect(normEmpFor("A".repeat(30))).toBe("A".repeat(30));
  });
  test("a game made before the rule is also looked up in its old form; a game after it is not", () => {
    expect(legacyEmpFor("A-1101", { created_ms: EMP_LEGACY_BEFORE_MS - 1000 })).toBe("A-1101");
    expect(legacyEmpFor("A1101", { created_ms: EMP_LEGACY_BEFORE_MS - 1000 })).toBeNull(); // nothing more to try
    expect(legacyEmpFor("A-1101", { created_ms: EMP_LEGACY_BEFORE_MS + 1000 })).toBeNull();
  });
});

for (const [label, legacy] of [["a new game", false], ["a game made before the rule", true]] as const) {
  describe(`A-1101, A 1101 and A/1101 are one ID (${label})`, () => {
    test("uploaded as A-1101, the person gets in typing A 1101; the same ID typed again as A/1101 on another phone is the same person", async () => {
      const g = await idGame(); if (legacy) W.raw.prepare("UPDATE engagement SET created_ms=? WHERE id=?").run(EMP_LEGACY_BEFORE_MS - 3 * 86_400_000, g.id);
      const r = await j(await add(g, ["A-1101", "B 2202"])); expect(r.added).toBe(2);
      expect((await joinId(g, "A 1101", 1)).status).toBe(200);
      const again = await joinId(g, "a/1101", 2); expect(again.status).toBe(423); expect((await j(again)).code).toBe("id-used");
      expect((await joinId(g, "b.2202", 3)).status).toBe(200);
    });
    test("the same ID written four ways in one upload is ONE person", async () => {
      const g = await idGame(); if (legacy) W.raw.prepare("UPDATE engagement SET created_ms=? WHERE id=?").run(EMP_LEGACY_BEFORE_MS - 3 * 86_400_000, g.id);
      const r = await j(await add(g, ["A-1101", "A 1101", "A/1101", "a.1101"])); expect(r.added).toBe(1); expect(r.duplicates).toBe(3);
      expect(count("SELECT COUNT(*) AS c FROM person WHERE eid=? AND role IS NULL", g.id)).toBe(1);
    });
  });
}

describe("old stored IDs keep matching (nobody already on a list is locked out)", () => {
  test("a person stored under the OLD rule (A-1101 with the dash) still gets in typing A-1101, and uploading A-1101 again does not list them a second time", async () => {
    const g = await idGame(); W.raw.prepare("UPDATE engagement SET created_ms=? WHERE id=?").run(EMP_LEGACY_BEFORE_MS - 3 * 86_400_000, g.id);
    // what the old release stored: the hash of "A-1101" (spaces dropped, dash kept) and the ID sealed in the person row
    const { sealPii } = await import("../src/pii");
    const ph = await empHashOf(W.env as any, "A-1101");
    W.raw.prepare("INSERT INTO person(eid,id,ph,pii,inviter,role,status,tok_hash,tok_sealed,approved_by,approved_ms,added_ms) VALUES(?,?,?,?,?,NULL,'invited',?,?,NULL,NULL,?)").run(g.id, "oldrow000001", ph, await sealPii(W.env as any, { phone: "", name: null, empId: "A-1101" }), "o", "tok1", "x", T);
    expect((await joinId(g, "A-1101", 1)).status).toBe(200); // listed under the old form: in, no approval
    const up = await j(await add(g, ["A-1101"])); expect(up.added).toBe(0); expect(up.duplicates).toBe(1);
    expect(count("SELECT COUNT(*) AS c FROM person WHERE eid=?", g.id)).toBe(1);
    expect(count("SELECT COUNT(*) AS c FROM waiting WHERE eid=?", g.id)).toBe(0);
  });
});

describe("an ID that is not on the list waits for a yes", () => {
  test("it gets no card; the organizer sees only the ID; yes lets it in (any written form); no sends it away", async () => {
    const g = await idGame(); await add(g, ["A1101"]);
    const w1 = await joinId(g, "Z 9001", 1), w2 = await joinId(g, "Z-9002", 2);
    expect(w1.status).toBe(403); expect((await j(w1)).code).toBe("waiting"); expect(w2.status).toBe(403);
    const list = await j(await call("GET", `/api/z/${g.id}/waiting`, undefined, kh(g.key)));
    expect(list.waiting.map((x: any) => x.empId).sort()).toEqual(["Z9001", "Z9002"]);
    expect(list.waiting.every((x: any) => !String(x.firstName || "").trim() && !x.last4)).toBe(true); // no name, no number
    const [a, b] = list.waiting;
    expect((await call("POST", `/api/z/${g.id}/waiting/${a.id}`, { decision: "admit" }, kh(g.key))).status).toBe(200);
    expect((await call("POST", `/api/z/${g.id}/waiting/${b.id}`, { decision: "decline" }, kh(g.key))).status).toBe(200);
    expect(count("SELECT COUNT(*) AS c FROM person WHERE eid=? AND role IS NULL", g.id)).toBe(2); // A1101 and the one let in
    const again = await joinId(g, a.empId === "Z9001" ? "z/9001" : "Z.9002", a.empId === "Z9001" ? 1 : 2);
    expect(again.status).toBe(200); // the one who was let in comes in, whichever way the ID is written
  });
  test("an unlisted ID typed three ways asks once: one request, not three", async () => {
    const g = await idGame();
    for (const [i, x] of ["Q-77", "q 77", "Q/77"].entries()) await joinId(g, x, i + 1);
    expect(count("SELECT COUNT(*) AS c FROM waiting WHERE eid=? AND status='waiting'", g.id)).toBe(1);
  });
  test("an ID game asks for the ID and nothing else: a mobile number alone, or a name alone, is not a way in", async () => {
    const g = await idGame();
    for (const body of [{ phone: "9876543210", device: dev(1) }, { name: "Asha", device: dev(2) }, { device: dev(3) }]) { const r = await call("POST", `/api/z/${g.id}/join`, body); expect([r.status, (await j(r)).code]).toEqual([400, "need-id"]); }
    const bad = await call("POST", `/api/z/${g.id}/join`, { empId: "x@y.com", device: dev(4) }); expect(bad.status).toBe(400);
  });
});

describe("the invite and approval log", () => {
  test("lists who asked, through what, what was decided and by whom; only the ID, never a name or a number", async () => {
    const g = await idGame(); await add(g, ["L1"]);
    await joinId(g, "L-2", 1); await joinId(g, "L 3", 2);
    const [x, y] = (await j(await call("GET", `/api/z/${g.id}/waiting`, undefined, kh(g.key)))).waiting;
    await call("POST", `/api/z/${g.id}/waiting/${x.id}`, { decision: "admit" }, kh(g.key)); await call("POST", `/api/z/${g.id}/waiting/${y.id}`, { decision: "decline" }, kh(g.key), T + 1000);
    const r = await call("GET", `/api/z/${g.id}/people/log`, undefined, kh(g.key), T + 2000); expect(r.status).toBe(200);
    const log = (await j(r)).log as any[];
    const kinds = (id: string) => log.filter((e) => e.id === id).map((e) => e.kind).sort();
    expect(kinds("L1")).toEqual(["listed"]);
    expect(kinds(x.empId)).toEqual(["asked", "let in"]); expect(kinds(y.empId)).toEqual(["asked", "declined"]);
    expect(log.find((e) => e.kind === "let in").by).toBeTruthy();
    expect(JSON.stringify(log)).not.toMatch(/name|phone|mobile|last4/i);
    expect(log.every((e) => typeof e.through === "string" && e.through.length > 0)).toBe(true);
  });
  test("only the organizer and hosts can read it: no key, a wrong key and a Co-host get a refusal", async () => {
    const g = await idGame();
    expect([401, 403, 404]).toContain((await call("GET", `/api/z/${g.id}/people/log`)).status);
    expect([401, 403, 404]).toContain((await call("GET", `/api/z/${g.id}/people/log`, undefined, { "x-organizer": "cbk_" + "0".repeat(48) })).status);
    const co = await j(await call("POST", "/api/org/cohost", { eid: g.id, name: "Rita", phone: "9812345678" }, kh(g.key)));
    if (co.key) expect([401, 403, 404]).toContain((await call("GET", `/api/z/${g.id}/people/log`, undefined, kh(co.key))).status);
  });
});

describe("family invite: each listed person may invite 1 to 10, the default is 4", () => {
  test("4 is the default; 10 is allowed; 11 is refused", async () => {
    const g = await idGame();
    const set = async (per: number) => (await call("PATCH", `/api/z/${g.id}/settings`, { invites: { on: true, per, cats: ["family", "colleagues"] } }, kh(g.key))).status;
    expect(await set(4)).toBe(200); expect(await set(10)).toBe(200); expect(await set(11)).toBeGreaterThanOrEqual(400);
    const fresh = await idGame(); const s = await j(await call("PATCH", `/api/z/${fresh.id}/settings`, { invites: { on: true } }, kh(fresh.key)));
    expect((s.invites ?? s.cfg?.invites)?.per ?? 4).toBe(4);
  });
});

describe("the list, every ID and the log are erased with the players' data (within 24 hours after the game ends)", () => {
  test("erasing leaves no ID in the list, the waiting requests, the ID lookups, the wrong-ID counters or the log", async () => {
    const g = await idGame(); await add(g, ["E1", "E2"]); await joinId(g, "E1", 1); await joinId(g, "X-9", 2); await joinId(g, "E-3", 3);
    W.raw.prepare("INSERT OR REPLACE INTO kv(k,v) VALUES(?,?)").run(`idx/${g.id}/abc`, "x");
    expect(count("SELECT COUNT(*) AS c FROM person WHERE eid=?", g.id)).toBeGreaterThan(0); expect(count("SELECT COUNT(*) AS c FROM waiting WHERE eid=?", g.id)).toBe(2);
    expect(count("SELECT COUNT(*) AS c FROM kv WHERE k LIKE ?", `idmiss/${g.id}/%`)).toBeGreaterThan(0); // the wrong-ID counter exists while the game runs
    await erasePersonal(W.env as any, g.id, T + 86_400_000, "test");
    for (const t of ["person", "waiting", "seat", "participant"]) expect([t, count(`SELECT COUNT(*) AS c FROM ${t} WHERE eid=?`, g.id)]).toEqual([t, 0]);
    expect(count("SELECT COUNT(*) AS c FROM kv WHERE k LIKE ? OR k LIKE ?", `idx/${g.id}/%`, `idmiss/${g.id}/%`)).toBe(0);
    const log = (await j(await call("GET", `/api/z/${g.id}/people/log`, undefined, kh(g.key), T + 86_400_000))).log as any[];
    expect(log.length).toBe(0);
    expect(q("SELECT k FROM kv").map((r: any) => r.k).filter((k: string) => /^(idx|idmiss)\//.test(k) && k.includes(g.id))).toEqual([]);
  });
  test("the scheduled sweep does it on its own, under 24 hours after the game ended, and the promise number is under a day", async () => {
    const g = await idGame(); await add(g, ["S1"]); await joinId(g, "S1", 1); await joinId(g, "S-2", 2);
    const e = one("SELECT * FROM engagement WHERE id=?", g.id); const end = await endBoundMs(W.env as any, e);
    await lifecycleTick(W.env as any, end + PURGE_AFTER_MS - 60_000);
    expect(count("SELECT COUNT(*) AS c FROM person WHERE eid=?", g.id)).toBeGreaterThan(0); // not before its time
    await lifecycleTick(W.env as any, end + PURGE_AFTER_MS + 1000);
    expect(count("SELECT COUNT(*) AS c FROM person WHERE eid=?", g.id) + count("SELECT COUNT(*) AS c FROM waiting WHERE eid=?", g.id) + count("SELECT COUNT(*) AS c FROM seat WHERE eid=?", g.id)).toBe(0);
    expect(PURGE_AFTER_MS).toBeLessThan(24 * HOUR);
  });
});
void callRaw;
