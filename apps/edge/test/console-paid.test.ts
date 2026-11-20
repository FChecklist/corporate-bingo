// Owner order 20 Nov 2026: payment is only through the console. The console calls Moneypenny; this game accepts the console's SIGNED "paid" notice exactly once per order id
// (a forged, wrong-game, expired or repeated notice is refused) and the game can start only when it is paid. Spec: corporate-console docs/PAY_STEP.md, bridge contract v1.
// The old pay screens and the game's own sign-in answer a short refusal / redirect while their flags are on. Nothing is deleted.
// FALSIFIED BY: paid-notice-twice-pays-twice, paid-notice-skips-owner-check, paid-notice-accepts-wrong-size, pay-flag-lets-checkout-through
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { HOUR, T, W, callRaw, create, j, join, one, organizer, publish, q, reset, restore, roundMs, startIn, uid } from "./param-harness";
import { makeKeyPair, signAssertion, type Payload } from "../src/console-bridge/assertion";
import { legacyPayGate, loginGate } from "../src/console-pay";

const sha = async (s: string) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)))].map((b) => b.toString(16).padStart(2, "0")).join("");
let kp: Awaited<ReturnType<typeof makeKeyPair>>, other: Awaited<ReturnType<typeof makeKeyPair>>, n = 0;
beforeEach(async () => { reset(); kp = await makeKeyPair(); other = await makeKeyPair(); W.env.PUBLIC_ORIGIN = "https://bingo.test"; (W.env as any).CONSOLE_PUBKEYS = "k1:" + kp.publicB64u; });
afterEach(restore);

const notice = async (email: string, eid: string, o: { key?: CryptoKey; act?: Payload["act"]; aud?: string; iatOffsetS?: number; assertEid?: string } = {}) => {
  const nowS = Math.floor(T / 1000) + (o.iatOffsetS ?? 0);
  const payload: Payload = { v: 1, kid: "k1", aud: o.aud ?? "https://bingo.test", sub: await sha("email|" + email.toLowerCase()), act: o.act ?? "paid", eid: o.assertEid ?? eid, jti: "jti" + (++n) + "x".repeat(20), iat: nowS, exp: nowS + 60 };
  return signAssertion(payload, o.key ?? kp.privateKey);
};
const send = (body: unknown, now = T) => callRaw("POST", "/api/console/paid", body, {}, now);
const paid = async (email: string, eid: string, orderRef: string, item = "100", o: Parameters<typeof notice>[2] = {}) => send({ assertion: await notice(email, eid, o), eid, item, orderRef });
/** a published game for 20 people that is NOT paid (a game for 10 or fewer is free; 20 needs the 100-person pack) */
async function unpaidGame(over: Record<string, unknown> = {}) {
  const o = await organizer(`own${++n}@acme.com`), id = uid("CP");
  expect((await create(o.key, id, { cap: 20, ...over })).status).toBe(200);
  expect((await publish(o.key, id)).status).toBe(200);
  return { ...o, id };
}
const lockTime = () => roundMs(startIn(2 * HOUR)) - 10_000; // inside the lock window of a game made by `create`
const joinAt = (id: string, i: number, now: number) => join(id, i, {}, now);

describe("the console's paid notice", () => {
  test("without CONSOLE_PUBKEYS the route does not exist (the normal 404): the game is dark to the console", async () => {
    (W.env as any).CONSOLE_PUBKEYS = undefined;
    const g = await unpaidGame();
    expect((await paid(g.email, g.id, "ORD-AAAA-1")).status).toBe(404);
    expect(one("SELECT pack FROM engagement WHERE id=?", g.id).pack).toBe(0);
  });

  test("a good notice marks the game paid; an unpaid game cannot start (locked), a paid one can", async () => {
    const g = await unpaidGame();
    const before = await j(await joinAt(g.id, 1, lockTime())); expect(before.code).toBe("locked"); // not paid: nobody is seated at the start time
    const r = await paid(g.email, g.id, "ORD-AAAA-1"); const b = await j(r);
    expect(r.status).toBe(200); expect(b).toMatchObject({ ok: true, repeat: false, eid: g.id });
    expect(one("SELECT pack FROM engagement WHERE id=?", g.id).pack).toBe(100);
    expect(one("SELECT payment_id, eid FROM entitlement WHERE eid=?", g.id)).toMatchObject({ payment_id: "console:ORD-AAAA-1", eid: g.id });
    expect(one("SELECT 1 AS x FROM kv WHERE k=?", `paidby/${g.id}`)).toBeTruthy();
    const after = await joinAt(g.id, 2, lockTime()); expect(after.status).toBe(200); // paid: the game starts and people are seated
  });

  test("exactly once per order id: the same notice again is refused, a new notice for the same order says 'repeat' and changes nothing", async () => {
    const g = await unpaidGame();
    const a = await notice(g.email, g.id);
    expect((await send({ assertion: a, eid: g.id, item: "100", orderRef: "ORD-BBBB-1" })).status).toBe(200);
    const replay = await send({ assertion: a, eid: g.id, item: "100", orderRef: "ORD-BBBB-1" }); expect(replay.status).toBe(401); expect((await j(replay)).error).toBe("replayed");
    const again = await paid(g.email, g.id, "ORD-BBBB-1"); const ab = await j(again);
    expect(again.status).toBe(200); expect(ab.repeat).toBe(true);
    expect(q("SELECT * FROM entitlement WHERE eid=?", g.id).length).toBe(1); // one order = one pack, never two
    expect(q("SELECT * FROM console_paid WHERE order_ref='ORD-BBBB-1'").length).toBe(1);
  });

  test("an order id that belongs to another game is refused", async () => {
    const g = await unpaidGame(), h = await unpaidGame();
    expect((await paid(g.email, g.id, "ORD-CCCC-1")).status).toBe(200);
    const r = await paid(h.email, h.id, "ORD-CCCC-1"); expect(r.status).toBe(409); expect(one("SELECT pack FROM engagement WHERE id=?", h.id).pack).toBe(0);
  });

  test("forged, wrong-game, wrong-purpose and expired notices are refused and change nothing", async () => {
    const g = await unpaidGame();
    const cases: [string, Parameters<typeof notice>[2], string][] = [
      ["signed with another key", { key: other.privateKey }, "bad_assertion"],
      ["made for another game's address", { aud: "https://tambola.test" }, "wrong_audience"],
      ["made for another purpose", { act: "session" }, "wrong_act"],
      ["expired", { iatOffsetS: -3600 }, "expired"],
      ["names another game inside", { assertEid: "SOMEONE-ELSE" }, "wrong_act"],
    ];
    for (const [why, o, code] of cases) { const r = await paid(g.email, g.id, "ORD-DDDD-" + code, "100", o); expect([why, r.status, (await j(r)).error]).toEqual([why, 401, code]); }
    const garbage = await send({ assertion: "v1.abc.def", eid: g.id, item: "100", orderRef: "ORD-DDDD-9" }); expect(garbage.status).toBe(401);
    expect((await send({ eid: g.id, item: "100", orderRef: "ORD-DDDD-9" })).status).toBe(400); // no assertion at all
    expect(one("SELECT pack FROM engagement WHERE id=?", g.id).pack).toBe(0);
    expect(q("SELECT * FROM console_paid").length).toBe(0);
  });

  test("the game decides from its own tables: not the payer's game, a wrong size, a cancelled game and an already paid game are refused (and nothing is changed)", async () => {
    const g = await unpaidGame(), stranger = await organizer(`stranger${++n}@acme.com`);
    const notYours = await paid(stranger.email, g.id, "ORD-EEEE-1"); expect(notYours.status).toBe(409); expect((await j(notYours)).definite).toBe("true");
    const wrongSize = await paid(g.email, g.id, "ORD-EEEE-2", "250"); expect(wrongSize.status).toBe(409);
    expect(one("SELECT pack FROM engagement WHERE id=?", g.id).pack).toBe(0);
    expect(q("SELECT * FROM console_paid").length).toBe(0); // a refusal that changed nothing leaves no order row, so the console may try the right order later
    expect((await paid(g.email, g.id, "ORD-EEEE-3")).status).toBe(200);
    const twice = await paid(g.email, g.id, "ORD-EEEE-4"); expect(twice.status).toBe(409); // a second, different order for a paid game
    expect(q("SELECT * FROM entitlement WHERE eid=?", g.id).length).toBe(1);
    const c = await unpaidGame(); W.raw.prepare("UPDATE engagement SET cancelled_ms=? WHERE id=?").run(T, c.id);
    expect((await paid(c.email, c.id, "ORD-EEEE-5")).status).toBe(409); expect(one("SELECT pack FROM engagement WHERE id=?", c.id).pack).toBe(0);
  });

  test("a notice for a game held at its start time restarts the first number 2 minutes after the payment, like a payment made here", async () => {
    const g = await unpaidGame(); const late = roundMs(startIn(2 * HOUR)) + 600_000;
    const r = await send({ assertion: await (async () => { const nowS = Math.floor(late / 1000); return signAssertion({ v: 1, kid: "k1", aud: "https://bingo.test", sub: await sha("email|" + g.email), act: "paid", eid: g.id, jti: "late" + "x".repeat(20), iat: nowS, exp: nowS + 60 }, kp.privateKey); })(), eid: g.id, item: "100", orderRef: "ORD-FFFF-1" }, late);
    expect(r.status).toBe(200);
    const sr = one("SELECT start_round FROM engagement WHERE id=?", g.id).start_round;
    expect(roundMs(sr)).toBeGreaterThan(late - 1000); expect(roundMs(sr)).toBeLessThan(late + 3 * 60_000);
  });

  test("only the paid notice is open: every other console route is the normal 404", async () => {
    for (const p of ["/api/console/session", "/api/console/games", "/api/console/handoff", "/api/console/role", "/api/console/capabilities"]) expect([p, (await callRaw(p.endsWith("capabilities") ? "GET" : "POST", p, {}, {}, T)).status]).toEqual([p, 404]);
  });
});

describe("the old pay and sign-in routes behind flags (off until the owner says go)", () => {
  const req = (path: string, method = "GET") => new Request("https://bingo.test" + path, { method });
  test("flags off: nothing changes", () => {
    expect(legacyPayGate(req("/pay.html"), W.env as any)).toBeNull(); expect(loginGate(req("/signin.html"), W.env as any)).toBeNull();
  });
  test("PAY_VIA_CONSOLE=1: the pay pages go to the console, the pay routes are refused with a plain sentence, Razorpay's own notice is not touched", async () => {
    (W.env as any).PAY_VIA_CONSOLE = "1";
    for (const p of ["/pay.html", "/paylink.html", "/paytest.html"]) { const r = legacyPayGate(req(p), W.env as any)!; expect([p, r.status, r.headers.get("location")]).toEqual([p, 302, "https://console.corporatetambola.com/"]); }
    for (const [m, p] of [["POST", "/api/checkout"], ["POST", "/api/payments/verify"], ["POST", "/api/payments/test"], ["GET", "/api/paylink/" + "a".repeat(48)], ["POST", "/api/z/ABC-123/paylink"]] as const) { const r = await callRaw(m, p, {}, {}, T); expect([p, r.status, (await j(r)).code]).toEqual([p, 409, "pay-in-console"]); }
    expect(legacyPayGate(req("/api/payments/webhook", "POST"), W.env as any)).toBeNull(); // money already paid must still be recorded
    expect(legacyPayGate(req("/zc.html"), W.env as any)).toBeNull();
  });
  test("LOGIN_VIA_CONSOLE=1: the sign-in page goes home; the game's own sign-in routes are refused and point to home and the console", async () => {
    (W.env as any).LOGIN_VIA_CONSOLE = "1";
    const r = loginGate(req("/signin.html"), W.env as any)!; expect([r.status, r.headers.get("location")]).toEqual([302, "https://home.corporatetambola.com/"]);
    for (const p of ["/api/auth/email", "/api/auth/verify", "/api/auth/google", "/api/auth/link", "/api/start"]) { const x = await callRaw("POST", p, { email: "a@b.co" }, {}, T); const b = await j(x); expect([p, x.status, b.code, b.home]).toEqual([p, 409, "login-at-home", "https://home.corporatetambola.com/"]); }
    expect(loginGate(req("/zc.html"), W.env as any)).toBeNull();
  });
});
