// 1.5.4 (27 Nov 2026, owner order): Bingo takes no payment itself. The console asks `payable` (read-only), Moneypenny charges, the console sends the signed `paid` notice, this game unlocks.
// With PAY_VIA_CONSOLE=1 the game's own pay, pay-link, credit and proforma routes answer 410, and nothing is ever opened with Razorpay or the central service.
// FALSIFIED BY: payable-leaks-a-strangers-game, payable-writes, pay-route-left-open, credit-route-left-open, paylink-route-left-open, placeorder-opens-an-order-with-the-flag-on
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { T, W, callRaw, create, j, one, organizer, publish, q, reset, restore, uid } from "./param-harness";
import { makeKeyPair, signAssertion, type Payload } from "../src/console-bridge/assertion";

const sha = async (s: string) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)))].map((b) => b.toString(16).padStart(2, "0")).join("");
let kp: Awaited<ReturnType<typeof makeKeyPair>>, other: Awaited<ReturnType<typeof makeKeyPair>>, n = 0, outbound: string[] = [];
const fetchBefore = () => globalThis.fetch;
beforeEach(async () => {
  reset(); kp = await makeKeyPair(); other = await makeKeyPair(); outbound = [];
  W.env.PUBLIC_ORIGIN = "https://bingo.test"; (W.env as any).CONSOLE_PUBKEYS = "k1:" + kp.publicB64u; (W.env as any).CONSOLE_ORIGIN = "https://console.test"; (W.env as any).PAY_VIA_CONSOLE = "1";
  const inner = fetchBefore(); globalThis.fetch = (async (u: any, i?: any) => { outbound.push(String(u instanceof Request ? u.url : u)); return inner(u, i); }) as any;
});
afterEach(restore);

const notice = async (email: string, eid: string, o: { key?: CryptoKey; act?: Payload["act"] } = {}) => {
  const payload: Payload = { v: 1, kid: "k1", aud: "https://bingo.test", sub: await sha("email|" + email.toLowerCase()), act: o.act ?? "payable", eid, jti: "pvc" + (++n) + "x".repeat(20), iat: Math.floor(T / 1000), exp: Math.floor(T / 1000) + 60 } as any;
  return signAssertion(payload, o.key ?? kp.privateKey);
};
const payable = async (email: string, eid: string, o: Parameters<typeof notice>[2] = {}) => callRaw("POST", "/api/console/payable", { assertion: await notice(email, eid, o), eid }, {}, T);
async function game(cap = 20, over: Record<string, unknown> = {}) {
  const o = await organizer(`pvc${++n}@acme.com`), id = uid("PV");
  expect((await create(o.key, id, { cap, ...over })).status).toBe(200);
  expect((await publish(o.key, id)).status).toBe(200);
  return { ...o, id };
}

describe("payable: what must be paid, asked before any money is taken", () => {
  test("the owner gets the pack size for the game's size and paid:false; nothing in the game changes", async () => {
    const g = await game(20), before = JSON.stringify(q("SELECT id, pack, start_round, cap FROM engagement WHERE id=?", g.id)), kv = q("SELECT k FROM kv WHERE k LIKE 'paidby/%'").length;
    const r = await payable(g.email, g.id);
    expect(r.status).toBe(200); expect(await j(r)).toMatchObject({ ok: true, owner: true, item: "100", paid: false });
    expect(JSON.stringify(q("SELECT id, pack, start_round, cap FROM engagement WHERE id=?", g.id))).toBe(before);
    expect(q("SELECT k FROM kv WHERE k LIKE 'paidby/%'").length).toBe(kv);
  });
  test("a stranger is not the owner and learns nothing (no item, not paid)", async () => {
    const g = await game(20), s = await organizer(`stranger${++n}@evil.com`);
    expect(await j(await payable(s.email, g.id))).toMatchObject({ ok: true, owner: false, item: null, paid: false });
  });
  test("a game that is not there looks the same as someone else's", async () => {
    const s = await organizer(`nobody${++n}@acme.com`);
    expect(await j(await payable(s.email, "NO-SUCH-GAME"))).toMatchObject({ owner: false, item: null, paid: false });
  });
  test("after the paid notice the game says paid:true with its pack size; a demo-size game is already free and a cancelled game has no item", async () => {
    const g = await game(20);
    const paidNotice = await notice(g.email, g.id, { act: "paid" });
    expect((await callRaw("POST", "/api/console/paid", { assertion: paidNotice, eid: g.id, item: "100", orderRef: "GAME-bingo-" + g.id }, {}, T)).status).toBe(200);
    expect(await j(await payable(g.email, g.id))).toMatchObject({ owner: true, item: "100", paid: true });
    const d = await game(5), c = await game(20);
    expect(await j(await payable(d.email, d.id))).toMatchObject({ owner: true, paid: true }); // a demo game (up to 10 people) is free: it already has its own pack, nothing to pay
    W.raw.prepare("UPDATE engagement SET cancelled_ms=1 WHERE id=?").run(c.id);
    expect(await j(await payable(c.email, c.id))).toMatchObject({ owner: true, item: null, paid: false });
  });
  test("a 'paid' assertion sent to /payable, a reused one, and a forged signature are all 401; 'payable' sent to /paid is 401", async () => {
    const g = await game(20);
    expect((await payable(g.email, g.id, { act: "paid" })).status).toBe(401);
    const tok = await notice(g.email, g.id);
    expect((await callRaw("POST", "/api/console/payable", { assertion: tok, eid: g.id }, {}, T)).status).toBe(200);
    expect((await callRaw("POST", "/api/console/payable", { assertion: tok, eid: g.id }, {}, T)).status).toBe(401); // same jti twice
    expect((await payable(g.email, g.id, { key: other.privateKey })).status).toBe(401);
    expect((await callRaw("POST", "/api/console/paid", { assertion: await notice(g.email, g.id), eid: g.id, item: "100", orderRef: "GAME-bingo-wrongact" }, {}, T)).status).toBe(401);
    expect(one("SELECT pack FROM engagement WHERE id=?", g.id).pack).toBe(0);
  });
  test("dark without the console's keys (the normal 404); without PUBLIC_ORIGIN it says why (503)", async () => {
    const g = await game(20); const tok = await notice(g.email, g.id);
    (W.env as any).CONSOLE_PUBKEYS = undefined;
    expect((await callRaw("POST", "/api/console/payable", { assertion: tok, eid: g.id }, {}, T)).status).toBe(404);
    (W.env as any).CONSOLE_PUBKEYS = "k1:" + kp.publicB64u; W.env.PUBLIC_ORIGIN = "";
    expect((await callRaw("POST", "/api/console/payable", { assertion: tok, eid: g.id }, {}, T)).status).toBe(503);
  });
});

describe("with PAY_VIA_CONSOLE=1 the game takes no payment itself", () => {
  test("every old pay, pay-link, credit and proforma route answers 410 with the console's address; Razorpay's own notice is not shut", async () => {
    const o = await organizer(`gate${++n}@acme.com`);
    for (const [m, p] of [["POST", "/api/checkout"], ["POST", "/api/proforma"], ["POST", "/api/payments/test"], ["POST", "/api/payments/paytest"], ["POST", "/api/payments/verify"], ["GET", "/api/org/credit"], ["POST", "/api/z/GAME-0001/pay-with-credit"], ["POST", "/api/z/GAME-0001/paylink"], ["GET", "/api/paylink/" + "a".repeat(48)], ["POST", "/api/paylink/" + "a".repeat(48) + "/checkout"]] as const) {
      const r = await callRaw(m, p, m === "POST" ? {} : undefined, o.h, T);
      expect([m, p, r.status]).toEqual([m, p, 410]);
      expect((await j(r)).code).toBe("pay-in-console");
    }
    expect((await callRaw("POST", "/api/payments/webhook", {}, {}, T)).status).not.toBe(410);
  });
  test("nothing is opened with Razorpay or the central order service, whatever keys are set", async () => {
    (W.env as any).PAY_SERVICE_KEY = "svc"; const g = await game(20);
    for (const p of ["/api/checkout", "/api/payments/test"]) expect((await callRaw("POST", p, { eid: g.id, pack: 100 }, g.h, T)).status).toBe(410);
    expect(outbound.filter((u) => /razorpay|rzp\.test|api\/pay\/order/i.test(u))).toEqual([]);
    expect(one("SELECT pack FROM engagement WHERE id=?", g.id).pack).toBe(0);
  });
  test("the credit-expiry and ledger C jobs are skipped; with the flag off the ledger C job runs", async () => {
    const { runTick } = await import("../src/worker");
    const on: any = await runTick(W.env as any, T);
    expect(on.ledgerC).toBeNull(); expect(on.creditLapsed).toBeUndefined();
    (W.env as any).PAY_VIA_CONSOLE = undefined;
    expect(((await runTick(W.env as any, T)) as any).ledgerC).not.toBeNull();
  });
});

describe("rollback: with the flag off the old path is not shut", () => {
  test("the old routes do not answer 410", async () => {
    (W.env as any).PAY_VIA_CONSOLE = undefined; const o = await organizer(`off${++n}@acme.com`);
    for (const p of ["/api/checkout", "/api/proforma"]) expect((await callRaw("POST", p, {}, o.h, T)).status).not.toBe(410);
    expect((await callRaw("GET", "/api/org/credit", undefined, o.h, T)).status).not.toBe(410);
  });
});
