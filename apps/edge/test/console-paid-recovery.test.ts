// Audit finding 4 (PR 9): a one-off database error inside `markPaid` left the order row "marking" for ever, so every retry got 409 "in progress" and the game stayed locked (or the console was told "in progress" for ever).
// Audit finding 2: the old pay pages sent everyone to the console's front door, with no game named.
// FALSIFIED BY: stuck-order-never-retried, retry-after-half-failure-refused-as-already-paid, pay-redirect-names-no-game, in-flight-order-cleared-too-early
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { T, W, callRaw, create, j, one, organizer, publish, q, reset, restore, uid } from "./param-harness";
import { makeKeyPair, signAssertion, type Payload } from "../src/console-bridge/assertion";
import { MARKING_STUCK_MS, legacyPayGate } from "../src/console-pay";

const sha = async (s: string) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)))].map((b) => b.toString(16).padStart(2, "0")).join("");
let kp: Awaited<ReturnType<typeof makeKeyPair>>, n = 0;
beforeEach(async () => { reset(); kp = await makeKeyPair(); W.env.PUBLIC_ORIGIN = "https://bingo.test"; (W.env as any).CONSOLE_PUBKEYS = "k1:" + kp.publicB64u; });
afterEach(restore);

const notice = async (email: string, eid: string, now: number) => {
  const nowS = Math.floor(now / 1000);
  const payload: Payload = { v: 1, kid: "k1", aud: "https://bingo.test", sub: await sha("email|" + email.toLowerCase()), act: "paid", eid, jti: "jti" + (++n) + "x".repeat(20), iat: nowS, exp: nowS + 60 };
  return signAssertion(payload, kp.privateKey);
};
const paid = async (email: string, eid: string, orderRef: string, now = T) => callRaw("POST", "/api/console/paid", { assertion: await notice(email, eid, now), eid, item: "100", orderRef }, {}, now);
async function unpaidGame() {
  const o = await organizer(`own${++n}@acme.com`), id = uid("CR");
  expect((await create(o.key, id, { cap: 20 })).status).toBe(200);
  expect((await publish(o.key, id)).status).toBe(200);
  return { ...o, id };
}
/** the next write whose SQL contains `part` fails once with a plain database error (a "one-off blip"), then everything works again */
function failOnce(part: string) {
  const real = W.env.DB as any; let hit = 0;
  const wrap = (s: string) => { const st = real.prepare(s); if (!s.includes(part)) return st; return { ...st, bind: (...a: any[]) => { const b = st.bind(...a); return { ...b, run: async () => { if (hit++ === 0) throw new Error("D1_ERROR: one-off blip"); return b.run(); } }; } }; };
  (W.env as any).DB = { prepare: wrap, batch: (xs: any[]) => real.batch(xs) };
  return { done: () => { (W.env as any).DB = real; }, hits: () => hit };
}

describe("a paid order that failed half way can be tried again", () => {
  test("a blip AFTER the pack was set: the retry with the same order id finishes the job once (no 'already paid', no second entitlement)", async () => {
    const g = await unpaidGame(); const f = failOnce("INSERT OR IGNORE INTO kv");
    const first = await paid(g.email, g.id, "ORD-RECOV-1"); expect(first.status).toBe(503); expect((await j(first)).error).toBe("unclear");
    expect(one("SELECT state FROM console_paid WHERE order_ref='ORD-RECOV-1'").state).toBe("marking");
    const retry = await paid(g.email, g.id, "ORD-RECOV-1", T + MARKING_STUCK_MS + 1000); const b = await j(retry);
    expect([retry.status, b.ok, b.repeat]).toEqual([200, true, false]);
    expect(one("SELECT state FROM console_paid WHERE order_ref='ORD-RECOV-1'").state).toBe("paid");
    expect(one("SELECT pack FROM engagement WHERE id=?", g.id).pack).toBe(100);
    expect(q("SELECT * FROM entitlement WHERE eid=?", g.id).length).toBe(1);
    expect(one("SELECT 1 AS x FROM kv WHERE k=?", `paidby/${g.id}`)).toBeTruthy();
    f.done();
  });

  test("a blip on the entitlement write (before the pack was set): the retry does the whole job once", async () => {
    const g = await unpaidGame(); failOnce("INSERT OR IGNORE INTO entitlement");
    expect((await paid(g.email, g.id, "ORD-RECOV-6")).status).toBe(503); expect(one("SELECT pack FROM engagement WHERE id=?", g.id).pack).toBe(0);
    expect((await paid(g.email, g.id, "ORD-RECOV-6", T + MARKING_STUCK_MS + 1000)).status).toBe(200);
    expect(one("SELECT pack FROM engagement WHERE id=?", g.id).pack).toBe(100); expect(q("SELECT * FROM entitlement WHERE eid=?", g.id).length).toBe(1);
  });

  test("a blip BEFORE the pack was set: the retry sets it (the game does not stay locked)", async () => {
    const g = await unpaidGame(); failOnce("UPDATE engagement SET pack");
    const first = await paid(g.email, g.id, "ORD-RECOV-2"); expect(first.status).toBe(503);
    expect(one("SELECT pack FROM engagement WHERE id=?", g.id).pack).toBe(0);
    const retry = await paid(g.email, g.id, "ORD-RECOV-2", T + MARKING_STUCK_MS + 1000); expect(retry.status).toBe(200);
    expect(one("SELECT pack FROM engagement WHERE id=?", g.id).pack).toBe(100);
    expect(one("SELECT state FROM console_paid WHERE order_ref='ORD-RECOV-2'").state).toBe("paid");
  });

  test("a retry a moment later (the first call may still be running) still says 'in progress': the marker is cleared only when it is stuck", async () => {
    const g = await unpaidGame(); failOnce("INSERT OR IGNORE INTO kv");
    expect((await paid(g.email, g.id, "ORD-RECOV-3")).status).toBe(503);
    const soon = await paid(g.email, g.id, "ORD-RECOV-3", T + 5_000); expect(soon.status).toBe(409); expect((await j(soon)).error).toBe("in_progress");
  });

  test("a different order for a game this order already paid is still refused ('already paid'): only the SAME order id may finish", async () => {
    const g = await unpaidGame(); failOnce("INSERT OR IGNORE INTO kv");
    expect((await paid(g.email, g.id, "ORD-RECOV-4")).status).toBe(503);
    const other = await paid(g.email, g.id, "ORD-OTHER-4", T + MARKING_STUCK_MS + 1000); expect(other.status).toBe(409);
    expect((await j(other)).error).toBe("game_refused");
  });

  test("an order that is already 'paid' is never cleared: the repeat still says repeat and changes nothing", async () => {
    const g = await unpaidGame();
    expect((await paid(g.email, g.id, "ORD-RECOV-5")).status).toBe(200);
    const again = await paid(g.email, g.id, "ORD-RECOV-5", T + 10 * MARKING_STUCK_MS); expect((await j(again)).repeat).toBe(true);
    expect(q("SELECT * FROM entitlement WHERE eid=?", g.id).length).toBe(1);
  });
});

describe("the old pay page sends the person to THEIR game in the console", () => {
  test("PAY_VIA_CONSOLE=1: /pay.html?e=<game> goes to the console naming game and id; the pay routes name it too; no id = the front door", () => {
    (W.env as any).PAY_VIA_CONSOLE = "1";
    const req = (path: string, method = "GET") => new Request("https://bingo.test" + path, { method });
    const r = legacyPayGate(req("/pay.html?e=ABC-123"), W.env as any)!; expect([r.status, r.headers.get("location")]).toEqual([302, "https://console.corporatetambola.com/?game=bingo&eid=ABC-123"]);
    expect(legacyPayGate(req("/paylink.html?e=ZZ9"), W.env as any)!.headers.get("location")).toBe("https://console.corporatetambola.com/?game=bingo&eid=ZZ9");
    expect(legacyPayGate(req("/pay.html?e=" + encodeURIComponent("<x>")), W.env as any)!.headers.get("location")).toBe("https://console.corporatetambola.com/"); // a strange id is not copied into the address
    expect(legacyPayGate(req("/pay.html"), W.env as any)!.headers.get("location")).toBe("https://console.corporatetambola.com/");
  });
});
