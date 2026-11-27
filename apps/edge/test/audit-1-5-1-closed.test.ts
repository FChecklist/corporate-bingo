// Audit of 23 Nov 2026 (head 1ddcd87), done for 1.5.1:
//  * Medium 1: a settings save with `closed: null` or `closed: ""` used to re-open a closed game to strangers. `closed` is now accepted only when absent or `true`.
//  * Low 2: the payInfo body is read with a size limit.
//  * Low 3: unsigned (bad) payInfo calls from one network are rate-limited, with no database write.
// FALSIFIED BY: settings-accepts-closed-null, settings-accepts-closed-empty-text, payinfo-reads-unlimited-body, payinfo-no-rate-limit
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { T, W, call, create, j, one, organizer, publish, reset, restore, uid } from "./param-harness";
import { makeKeyPair, signAssertion } from "../src/console-bridge/assertion";
import { PAYINFO_BODY_MAX, PAYINFO_MISSES_PER_MINUTE, resetPayInfoMisses } from "../src/console-pay";

const sha = async (s: string) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)))].map((b) => b.toString(16).padStart(2, "0")).join("");
const kh = (k: string): Record<string, string> => ({ "x-organizer": k });
let kp: Awaited<ReturnType<typeof makeKeyPair>>, n = 0;
beforeEach(async () => { reset(); resetPayInfoMisses(); kp = await makeKeyPair(); W.env.PUBLIC_ORIGIN = "https://bingo.test"; (W.env as any).LEGACY_OPEN_GAMES = "0"; /* the real server rule */ });
afterEach(restore);

/** A published game for its list (closed = 1), as every game is now. */
async function closedGame() { const o = await organizer(), id = uid("CL"); expect((await create(o.key, id, { cap: 20 })).status).toBe(200); expect((await publish(o.key, id)).status).toBe(200); expect(one("SELECT closed FROM engagement WHERE id=?", id).closed).toBe(1); return { ...o, id }; }
const closedOf = (id: string) => one("SELECT closed FROM engagement WHERE id=?", id).closed as number;
/** Sends the body exactly as written (so `{"closed":null}` really carries a null, and a missing key is really missing). */
const patch = (key: string, id: string, rawJson: string) => call("PATCH", `/api/z/${id}/settings`, JSON.parse(rawJson), kh(key));

describe("a settings save never re-opens a closed game (audit 23 Nov, Medium 1)", () => {
  test("null, \"\", false, 0 (and the other falsy-looking or odd values) are refused with list-only and the game stays closed; a stranger still waits for a yes", async () => {
    const g = await closedGame();
    for (const raw of ['{"closed":null}', '{"closed":""}', '{"closed":false}', '{"closed":0}', '{"closed":"0"}', '{"closed":"false"}', '{"closed":[]}', '{"closed":{}}', '{"closed":1}']) {
      const r = await patch(g.key, g.id, raw); const b = await j(r);
      expect([raw, r.status, b.code, closedOf(g.id)]).toEqual([raw, 400, "list-only", 1]);
    }
    const s = await call("POST", `/api/z/${g.id}/join`, { phone: "9876543210", name: "Asha", device: "ab".repeat(16) }); expect([s.status, (await j(s)).code]).toEqual([403, "waiting"]);
  });
  test("a save that leaves closed out, or says true, works and the game stays closed", async () => {
    const g = await closedGame();
    for (const raw of ['{"cap":21}', '{"closed":true}', '{"closed":true,"cap":22}']) { const r = await patch(g.key, g.id, raw); expect([raw, r.status, closedOf(g.id)]).toEqual([raw, 200, 1]); }
    expect(one("SELECT cap FROM engagement WHERE id=?", g.id).cap).toBe(22);
  });
  test("the same values on a save do the old thing only when LEGACY_OPEN_GAMES is '1' (old tests); the real rule is the default", async () => {
    (W.env as any).LEGACY_OPEN_GAMES = "1";
    const o = await organizer(), id = uid("CM"); expect((await create(o.key, id, { cap: 20, closed: true })).status).toBe(200); await publish(o.key, id);
    expect((await patch(o.key, id, '{"closed":null}')).status).toBe(200); expect(closedOf(id)).toBe(0);
  });
  test("an organizer who really wants the list says whoCanJoin 'list' and that still works; 'anyone' is still refused", async () => {
    const g = await closedGame();
    expect((await patch(g.key, g.id, '{"whoCanJoin":"list"}')).status).toBe(200); expect(closedOf(g.id)).toBe(1);
    const r = await patch(g.key, g.id, '{"whoCanJoin":"anyone"}'); expect([r.status, (await j(r)).code]).toEqual([400, "list-only"]); expect(closedOf(g.id)).toBe(1);
  });
});

describe("payInfo: a size limit on the body (audit Low 2) and a rate limit on requests that cannot be checked (audit Low 3)", () => {
  const sign = async (email: string) => { const nowS = Math.floor(T / 1000); return signAssertion({ v: 1, kid: "k1", aud: "https://bingo.test", sub: await sha("email|" + email.toLowerCase()), act: "games", jti: "pl" + (++n) + "x".repeat(20), iat: nowS, exp: nowS + 60 }, kp.privateKey); };
  const ask = (body: unknown, headers: Record<string, string> = {}) => call("POST", "/api/console/payinfo", body, headers, T);
  beforeEach(() => { (W.env as any).CONSOLE_PUBKEYS = "k1:" + kp.publicB64u; });

  test("a request with a good signature but a huge body is refused (413) and a normal one still works", async () => {
    const g = await closedGame();
    const big = await ask({ assertion: await sign(g.email), eid: g.id, pad: "x".repeat(PAYINFO_BODY_MAX * 4) }); expect([big.status, (await j(big)).code]).toEqual([413, "too_big"]);
    const ok = await ask({ assertion: await sign(g.email), eid: g.id }); expect([ok.status, (await j(ok)).ok]).toEqual([200, true]);
  });
  test("a big body is refused even when it arrives without a content-length (the reader stops at the limit)", async () => {
    const g = await closedGame(), a = await sign(g.email), text = JSON.stringify({ assertion: a, eid: g.id, pad: "y".repeat(PAYINFO_BODY_MAX * 2) });
    const enc = new TextEncoder().encode(text), stream = new ReadableStream({ start(c) { for (let i = 0; i < enc.length; i += 1000) c.enqueue(enc.slice(i, i + 1000)); c.close(); } });
    const { handle } = await import("./with-terms");
    const r = await handle(new Request("http://x/api/console/payinfo", { method: "POST", headers: { "content-type": "application/json" }, body: stream, duplex: "half" } as any), W.env as any, T);
    expect([r.status, (await j(r)).code]).toEqual([413, "too_big"]);
  });
  test(`${PAYINFO_MISSES_PER_MINUTE} unsigned or broken calls from one network are answered as before; the next one is told to wait (429); a different network and the next minute are not`, async () => {
    const ip = { "cf-connecting-ip": "203.0.113.7" };
    for (let i = 0; i < PAYINFO_MISSES_PER_MINUTE; i++) { const r = await ask({ assertion: "not-a-signed-thing", eid: "GAME-" + i }, ip); expect([i, r.status]).toEqual([i, 401]); }
    const over = await ask({ assertion: "not-a-signed-thing", eid: "GAME-X" }, ip); expect([over.status, (await j(over)).code, over.headers.get("retry-after")]).toEqual([429, "rate_limited", "60"]);
    expect((await ask({ eid: "GAME-X" }, ip)).status).toBe(429); // an empty request is not cheaper than a bad one
    const other = await ask({ assertion: "not-a-signed-thing", eid: "GAME-Y" }, { "cf-connecting-ip": "203.0.113.8" }); expect(other.status).toBe(401);
    const later = await call("POST", "/api/console/payinfo", { assertion: "not-a-signed-thing", eid: "GAME-Z" }, ip, T + 61_000); expect(later.status).toBe(401);
  });
  test("a flood of bad calls writes nothing to the database, and good calls from a quiet network are never counted", async () => {
    const g = await closedGame(), before = one("SELECT COUNT(*) AS c FROM kv").c, ip = { "cf-connecting-ip": "203.0.113.9" };
    for (let i = 0; i < PAYINFO_MISSES_PER_MINUTE + 5; i++) await ask({ assertion: "bad", eid: "GAME-" + i }, ip);
    expect(one("SELECT COUNT(*) AS c FROM kv").c).toBe(before);
    for (let i = 0; i < PAYINFO_MISSES_PER_MINUTE + 5; i++) expect((await ask({ assertion: await sign(g.email), eid: g.id }, { "cf-connecting-ip": "203.0.113.10" })).status).toBe(200);
  });
  test("dark without CONSOLE_PUBKEYS: still the normal 404, nothing is counted", async () => {
    (W.env as any).CONSOLE_PUBKEYS = undefined;
    for (let i = 0; i < PAYINFO_MISSES_PER_MINUTE + 5; i++) expect((await ask({ assertion: "bad", eid: "GAME-" + i }, { "cf-connecting-ip": "203.0.113.11" })).status).toBe(404);
  });
});
