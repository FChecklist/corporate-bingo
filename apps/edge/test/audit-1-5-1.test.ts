// Audit of 22 Nov 2026 (head 908c12c), findings 2 and 3, done for 1.5.1:
//  * finding 3: the SERVER itself refuses an open game ("anyone with the link") and makes a game that says nothing a game for its list. LEGACY_OPEN_GAMES="1" is the old behaviour, for old tests only.
//  * finding 2: payInfo, a read-only answer "what must be paid for this game and can it be paid", asked before the console takes money. It is this game's own call (the console contract has none yet).
// FALSIFIED BY: server-accepts-anyone, server-default-open, payinfo-answers-a-stranger, payinfo-accepts-replay, payinfo-answers-while-dark
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { HOUR, T, W, call, create, j, keyH, one, organizer, publish, reset, restore, uid } from "./param-harness";
import { makeKeyPair, signAssertion, type Payload } from "../src/console-bridge/assertion";

const sha = async (s: string) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)))].map((b) => b.toString(16).padStart(2, "0")).join("");
let kp: Awaited<ReturnType<typeof makeKeyPair>>, n = 0;
beforeEach(async () => { reset(); kp = await makeKeyPair(); W.env.PUBLIC_ORIGIN = "https://bingo.test"; (W.env as any).LEGACY_OPEN_GAMES = "0"; /* the real server rule */ });
afterEach(restore);
const kh = (k: string): Record<string, string> => ({ "x-organizer": k });

describe("the server refuses an open game (audit finding 3)", () => {
  test("a create that says 'anyone' (or closed:false) is refused with a plain sentence; a create that says nothing is a game for the list; 'list' works", async () => {
    const o = await organizer();
    for (const extra of [{ whoCanJoin: "anyone" }, { closed: false }, { closed: 0 }]) { const r = await create(o.key, uid("NA"), { cap: 20, ...extra }); const b = await j(r); expect([JSON.stringify(extra), r.status, b.code]).toEqual([JSON.stringify(extra), 400, "list-only"]); }
    const id = uid("NB"); expect((await create(o.key, id, { cap: 20 })).status).toBe(200);
    expect(one("SELECT closed FROM engagement WHERE id=?", id).closed).toBe(1);
    expect((await j(await call("GET", `/api/z/${id}/info`, undefined, kh(o.key)))).whoCanJoin).toBe("list");
    expect((await create(o.key, uid("NC"), { cap: 20, whoCanJoin: "list" })).status).toBe(200);
  });
  test("saving settings with 'anyone' is refused; with 'list' it is saved; the game stays for its list", async () => {
    const o = await organizer(), id = uid("ND"); await create(o.key, id, { cap: 20 }); await publish(o.key, id);
    const r = await call("PATCH", `/api/z/${id}/settings`, { whoCanJoin: "anyone" }, kh(o.key)); expect(r.status).toBe(400); expect((await j(r)).code).toBe("list-only");
    expect((await call("PATCH", `/api/z/${id}/settings`, { whoCanJoin: "list" }, kh(o.key))).status).toBe(200); expect(one("SELECT closed FROM engagement WHERE id=?", id).closed).toBe(1);
  });
  test("an unlisted person in a game made without any choice waits for a yes (it is not an open game)", async () => {
    const o = await organizer(), id = uid("NE"); await create(o.key, id, { cap: 20 }); await publish(o.key, id);
    const r = await call("POST", `/api/z/${id}/join`, { phone: "9876543210", name: "Asha", device: "ab".repeat(16) }); expect([r.status, (await j(r)).code]).toEqual([403, "waiting"]);
  });
  test("the old behaviour is only there when LEGACY_OPEN_GAMES is '1' (old tests); nothing sets it on the live site", async () => {
    (W.env as any).LEGACY_OPEN_GAMES = "1"; const o = await organizer(), id = uid("NF");
    expect((await create(o.key, id, { cap: 20, whoCanJoin: "anyone" })).status).toBe(200); expect(one("SELECT closed FROM engagement WHERE id=?", id).closed).toBe(0);
    for (const f of ["apps/edge/wrangler.toml", "pages/wrangler.toml"]) { try { expect(require("node:fs").readFileSync(require("node:path").join(import.meta.dir, "../../..", f), "utf8")).not.toMatch(/LEGACY_OPEN_GAMES/); } catch (e: any) { if (e.code !== "ENOENT") throw e; } }
  });
});

describe("payInfo: what must be paid for this game, asked before any money is taken (audit finding 2)", () => {
  const sign = async (email: string, o: { key?: CryptoKey; act?: Payload["act"]; aud?: string; iatOffsetS?: number } = {}) => {
    const nowS = Math.floor(T / 1000) + (o.iatOffsetS ?? 0);
    return signAssertion({ v: 1, kid: "k1", aud: o.aud ?? "https://bingo.test", sub: await sha("email|" + email.toLowerCase()), act: o.act ?? "games", jti: "pi" + (++n) + "x".repeat(20), iat: nowS, exp: nowS + 60 }, o.key ?? kp.privateKey);
  };
  const ask = (body: unknown, now = T) => call("POST", "/api/console/payinfo", body, {}, now);
  const game = async (cap = 20) => { const o = await organizer(`own${++n}@acme.com`), id = uid("PI"); expect((await create(o.key, id, { cap })).status).toBe(200); expect((await publish(o.key, id)).status).toBe(200); return { ...o, id }; };
  beforeEach(() => { (W.env as any).CONSOLE_PUBKEYS = "k1:" + kp.publicB64u; });

  test("dark without CONSOLE_PUBKEYS: the normal 404", async () => {
    (W.env as any).CONSOLE_PUBKEYS = undefined; const g = await game();
    expect((await ask({ assertion: await sign(g.email), eid: g.id })).status).toBe(404);
  });
  test("the owner gets the size to charge (a string, like the paid notice's item), whether it can be paid, and no price", async () => {
    const g = await game(); const r = await ask({ assertion: await sign(g.email), eid: g.id }); const b = await j(r);
    expect(r.status).toBe(200); expect(b).toMatchObject({ ok: true, eid: g.id, cap: 20, paid: false, payable: true, item: "100", reason: null });
    expect(JSON.stringify(b)).not.toMatch(/price|amount|inr|usd|₹/i); // every number of money is Moneypenny's
    expect(one("SELECT pack FROM engagement WHERE id=?", g.id).pack).toBe(0); // asking changes nothing
  });
  test("what it says is what the paid notice then checks: asking first and paying the item given works; a game already paid says so; a cancelled game says closed; a game bigger than the biggest pack says too_big", async () => {
    const g = await game(); const b = await j(await ask({ assertion: await sign(g.email), eid: g.id }));
    const nowS = Math.floor(T / 1000), paid = await signAssertion({ v: 1, kid: "k1", aud: "https://bingo.test", sub: await sha("email|" + g.email), act: "paid", eid: g.id, jti: "pay" + "x".repeat(20), iat: nowS, exp: nowS + 60 }, kp.privateKey);
    expect((await call("POST", "/api/console/paid", { assertion: paid, eid: g.id, item: b.item, orderRef: "ORD-PI-0001" }, {}, T)).status).toBe(200);
    expect(await j(await ask({ assertion: await sign(g.email), eid: g.id }))).toMatchObject({ paid: true, payable: false, reason: "already_paid" });
    const c = await game(); W.raw.prepare("UPDATE engagement SET cancelled_ms=? WHERE id=?").run(T, c.id);
    expect(await j(await ask({ assertion: await sign(c.email), eid: c.id }))).toMatchObject({ payable: false, reason: "closed" });
    const big = await game(20); W.raw.prepare("UPDATE engagement SET cap=? WHERE id=?").run(50000, big.id);
    expect(await j(await ask({ assertion: await sign(big.email), eid: big.id }))).toMatchObject({ payable: false, reason: "too_big", item: null });
  });
  test("a stranger, a forged, a wrong-game, a wrong-purpose, an expired and a repeated assertion are all refused; a stranger learns nothing (the same answer as for a game that is not there)", async () => {
    const g = await game(), stranger = await organizer(`stranger${++n}@acme.com`);
    const s = await ask({ assertion: await sign(stranger.email), eid: g.id }), none = await ask({ assertion: await sign(stranger.email), eid: "NOT-THERE-1" });
    expect([s.status, none.status]).toEqual([404, 404]); expect(await j(s)).toEqual(await j(none));
    const cases: [string, Parameters<typeof sign>[1], string][] = [["forged", { key: (await makeKeyPair()).privateKey }, "bad_assertion"], ["other address", { aud: "https://tambola.test" }, "wrong_audience"], ["other purpose", { act: "paid" }, "wrong_act"], ["expired", { iatOffsetS: -3600 }, "expired"]];
    for (const [why, o, code] of cases) { const r = await ask({ assertion: await sign(g.email, o), eid: g.id }); expect([why, r.status, (await j(r)).error]).toEqual([why, 401, code]); }
    const a = await sign(g.email); expect((await ask({ assertion: a, eid: g.id })).status).toBe(200);
    const again = await ask({ assertion: a, eid: g.id }); expect([again.status, (await j(again)).error]).toEqual([401, "replayed"]);
    expect((await ask({ eid: g.id })).status).toBe(400);
  });
});
