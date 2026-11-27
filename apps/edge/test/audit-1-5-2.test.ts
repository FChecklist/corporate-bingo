// Audit of 23 Nov 2026 (head 4a2b818, security angle), done for 1.5.2:
//  * High 1: a player's mobile number and name, and a Co-host's name and mobile number, stayed in the audit log (365 days) after "Delete" / "Forget".
//    Now: a deny-list on field names AND on values (a number or an e-mail anywhere) for every row that is kept 365 days; bodies of the person routes keep field names only;
//    a Co-host's own rows go into the shreddable part (gone 23 hours after the game).
//  * Medium 1: a caller with no key could add unlimited audit rows (any game id, any road). Now: no row for a game that does not exist, none for a road that does not exist,
//    and a small per-network limit for callers with no key.
// FALSIFIED BY: audit-keeps-player-number, audit-keeps-cohost-name, audit-logs-unknown-game, audit-no-rate-limit
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { T, W, call, create, j, mob, one, organizer, publish, q, reset, restore, uid } from "./param-harness";
import { AUDIT_ANON_PER_MIN, AUDIT_GAME_PER_MIN, loadRows, redact, resetAuditLimits, shredParticipantAudit, splitsPersonal, type AuditEnv } from "../src/audit";

const kh = (k: string): Record<string, string> => ({ "x-organizer": k });
beforeEach(() => { reset(); resetAuditLimits(); });
afterEach(restore);

const PLAYER = { phone: "9123456789", name: "Plantina Zyxwvu" }, COHOST = { label: "Ravindra Quuxford", phone: "98765 00001" };
/** Everything the owner can read from a chain, as one text, plus the raw (still sealed) table text. */
async function everything(chains: string[]) {
  const rows = (await Promise.all(chains.map((c) => loadRows(W.env as AuditEnv, c, 5000, 0)))).flat();
  return JSON.stringify(rows.map((r) => r.details));
}
const NEEDLES = [PLAYER.phone, "91234 56789", "Plantina", "Zyxwvu", "Ravindra", "Quuxford", "9876500001", "98765 00001", "98765"];

/** A published game, one player who joined, then the organizer's console does what it does: look the player up, mark, unbind, delete; and adds a Co-host. */
async function playedGame() {
  const o = await organizer(), id = uid("AUD");
  expect((await create(o.key, id, { cap: 20 })).status).toBe(200); expect((await publish(o.key, id)).status).toBe(200);
  // the organizer lists the player first (every game is a list game), then the player joins with their own device
  const org = one("SELECT org FROM engagement WHERE id=?", id).org as string;
  (W.env as any).LEGACY_OPEN_GAMES = "1";
  const jn = await call("POST", `/api/z/${id}/join`, { phone: PLAYER.phone, name: PLAYER.name, device: "ab".repeat(16) }, { "cf-connecting-ip": "203.0.113.9", "user-agent": "Mozilla/5.0 Chrome/120" });
  expect(jn.status).toBe(200);
  const see = await call("POST", `/api/z/${id}/person`, { phone: PLAYER.phone }, o.h); expect(see.status).toBe(200);
  const mk = await call("POST", `/api/z/${id}/mark`, { phone: PLAYER.phone, role: "host" }, o.h); expect(mk.status).toBe(200);
  const ub = await call("POST", `/api/z/${id}/unbind`, { phone: PLAYER.phone }, o.h); expect(ub.status).toBe(200);
  const ch = await call("POST", "/api/org/cohost", { ...COHOST, e: id }, o.h); expect(ch.status).toBe(200);
  const cohostKey = (await j(ch)).cohostKey as string; expect(cohostKey).toMatch(/^cbc_/);
  const del = await call("POST", `/api/z/${id}/forget`, { phone: PLAYER.phone }, o.h); expect([del.status, (await j(del)).deleted]).toEqual([200, true]);
  return { o, id, org, cohostKey };
}

describe("High 1: nothing about a player or a Co-host stays in the log that is kept 365 days", () => {
  test("after the player is deleted, no row of the organizer's account or of the game holds the player's or the Co-host's name or number", async () => {
    const g = await playedGame();
    await shredParticipantAudit(W.env as AuditEnv, g.id, T + 24 * 3_600_000); // the game's own 23-hour shred has run (the player's and the Co-host's own rows are gone); what is read now is what stays 365 days
    const text = await everything([g.id, "org:" + g.org]);
    for (const n of NEEDLES) expect([n, text.includes(n)]).toEqual([n, false]);
    // the calls ARE still recorded (who did what, when, from where): only the person's details are gone
    const ev = q("SELECT event, actor FROM audit_log WHERE chain=? OR chain=? ORDER BY id", g.id, "org:" + g.org).map((r) => r.event + "/" + r.actor);
    expect(ev.some((e) => /erase_request\/organizer/.test(e))).toBe(true);
    expect(q("SELECT 1 FROM audit_pii").length).toBe(0);
  });
  test("the body of a person route keeps only the field names, never the values, whoever sent it", async () => {
    const g = await playedGame();
    const rows = (await loadRows(W.env as AuditEnv, g.id, 5000, 0)).filter((r) => ["erase_request", "unbind", "edit"].includes(r.event) && /\/(forget|unbind|mark)$/.test(r.details.path));
    expect(rows.length).toBeGreaterThanOrEqual(3);
    for (const r of rows) { expect(r.details.changes).toMatchObject({ phone: "[removed]" }); expect(r.details.body_note).toMatch(/not copied/); }
  });
  test("a number or an e-mail hidden under an innocent field name, in a list or in a nested object, is removed from a kept row; secrets still show [redacted]", () => {
    const body = { note: "call 98765 43210 now", list: ["9123456789", "ok"], deep: { x: { y: "boss@acme.com" } }, extras: [{ phone: "9", name: "A" }], title: "Quarter party", password: "hunter2", cap: 80 };
    const kept = redact(body, 0, true) as any;
    expect(JSON.stringify(kept)).not.toMatch(/98765|9123456789|boss@|hunter2/);
    expect(kept).toMatchObject({ note: "[removed]", title: "Quarter party", cap: 80, password: "[redacted]", extras: [{ phone: "[removed]", name: "[removed]" }] });
    expect(kept.list).toEqual(["[removed]", "ok"]);
    // dates and times are not numbers of people
    expect((redact({ at: "2026-11-23T10:00:00Z", d: "2026-11-23" }, 0, true) as any)).toEqual({ at: "2026-11-23T10:00:00Z", d: "2026-11-23" });
    // the old call, with no flag, still keeps them (the shreddable part of a player's own row)
    expect((redact({ phone: "9123456789" }) as any).phone).toBe("9123456789");
  });
  test("the Co-host's own calls are in the shreddable part (the same rule as a player's); shredding leaves no trace of them", async () => {
    const g = await playedGame();
    expect(splitsPersonal({ actor: "cohost", eid: g.id, event: "edit" })).toBe(true);
    expect(splitsPersonal({ actor: "participant", eid: g.id, event: "prize" })).toBe(false); // a winner's prize row is kept (365 days)
    const rr = await call("POST", `/api/z/${g.id}/waiting`, { action: "decline", seat: 1, phone: "9000000001" }, kh(g.cohostKey)); // any call the Co-host key is allowed to make
    void rr;
    const mine = q("SELECT * FROM audit_log WHERE chain=? AND actor='cohost'", g.id);
    expect(mine.length).toBeGreaterThan(0);
    for (const r of mine) { expect(r.sealed).toBe(""); expect(r.pdig).toMatch(/^[0-9a-f]{64}$/); }
    expect(q("SELECT 1 FROM audit_pii WHERE eid=?", g.id).length).toBeGreaterThan(0);
    await shredParticipantAudit(W.env as AuditEnv, g.id, T + 24 * 3_600_000);
    expect(q("SELECT 1 FROM audit_pii WHERE eid=?", g.id).length).toBe(0);
    expect(q("SELECT 1 FROM eng_key WHERE eid=?", g.id).length).toBe(0);
  });
});

describe("Medium 1: a caller with no key cannot fill the log", () => {
  test("calls to a game that was never made, from any number of networks, leave no row, no key salt and no personal part", async () => {
    for (let i = 0; i < 40; i++) await call("POST", `/api/z/NOPE-${i}/join`, { phone: mob(i), name: "X " + i, device: "cd".repeat(16) }, { "cf-connecting-ip": `198.51.100.${i + 1}` });
    for (let i = 0; i < 5; i++) await call("POST", `/api/z/NOPE-${i}/claims`, { pid: "p", claims: [] }, { "cf-connecting-ip": `198.51.100.${i + 1}` });
    expect(q("SELECT COUNT(*) AS c FROM audit_log").map((r) => r.c)).toEqual([0]);
    expect(q("SELECT COUNT(*) AS c FROM eng_key").map((r) => r.c)).toEqual([0]);
    expect(q("SELECT COUNT(*) AS c FROM audit_pii").map((r) => r.c)).toEqual([0]);
  });
  test("a road that does not exist leaves no row either; a refused sign-in from one network leaves a few rows, not unlimited ones", async () => {
    for (let i = 0; i < 30; i++) expect((await call("POST", `/api/nothing-${i}`, { a: 1 }, { "cf-connecting-ip": "198.51.100.5" })).status).toBe(404);
    expect(one("SELECT COUNT(*) AS c FROM audit_log").c).toBe(0);
    for (let i = 0; i < AUDIT_ANON_PER_MIN + 15; i++) await call("POST", "/api/auth/verify", { email: "x@y.com", code: "00000" + (i % 10) }, { "cf-connecting-ip": "198.51.100.6" });
    const n = one("SELECT COUNT(*) AS c FROM audit_log WHERE chain='anon'").c as number;
    expect(n).toBeGreaterThan(0); expect(n).toBeLessThanOrEqual(AUDIT_ANON_PER_MIN);
    // another network is not blocked, and the next minute starts again
    await call("POST", "/api/auth/verify", { email: "x@y.com", code: "000001" }, { "cf-connecting-ip": "198.51.100.7" });
    expect(one("SELECT COUNT(*) AS c FROM audit_log WHERE chain='anon'").c).toBe(n + 1);
    await call("POST", "/api/auth/verify", { email: "x@y.com", code: "000002" }, { "cf-connecting-ip": "198.51.100.6" }, T + 61_000);
    expect(one("SELECT COUNT(*) AS c FROM audit_log WHERE chain='anon'").c).toBe(n + 2);
  });
  test("for a game that exists, one network is limited per minute; the organizer with a key is never limited and their rows are all kept", async () => {
    const o = await organizer(), id = uid("LIM"); expect((await create(o.key, id, { cap: 20 })).status).toBe(200); expect((await publish(o.key, id)).status).toBe(200);
    for (let i = 0; i < AUDIT_GAME_PER_MIN + 20; i++) await call("POST", `/api/z/${id}/claims`, { pid: "p" + i, claims: [] }, { "cf-connecting-ip": "198.51.100.8" });
    const mine = one("SELECT COUNT(*) AS c FROM audit_log WHERE chain=? AND actor='participant'", id).c as number;
    expect(mine).toBeGreaterThan(0); expect(mine).toBeLessThanOrEqual(AUDIT_GAME_PER_MIN);
    const before = one("SELECT COUNT(*) AS c FROM audit_log WHERE chain=? AND actor='organizer'", id).c as number;
    for (let i = 0; i < 25; i++) await call("PATCH", `/api/z/${id}/settings`, { cap: 21 + i }, o.h);
    expect(one("SELECT COUNT(*) AS c FROM audit_log WHERE chain=? AND actor='organizer'", id).c).toBe(before + 25);
  });
  test("a key holder who names a game that is not there does not make a chain for it", async () => {
    const o = await organizer();
    await call("PATCH", "/api/z/MADE-UP-1/settings", { cap: 5 }, o.h);
    expect(q("SELECT 1 FROM audit_log WHERE chain='MADE-UP-1' OR eid='MADE-UP-1'").length).toBe(0);
  });
});
