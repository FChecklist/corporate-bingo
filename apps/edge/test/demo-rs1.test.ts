// Boss order 1 Nov 2026: (1) the free DEMO game (apps/edge/src/demo.ts, flag DEMO_GAME) and (2) the Rs 1 payment test that only the owner can open.
// Everything runs through the real Worker with a real SQLite D1; the gateway is a small stand-in.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { type Env } from "../src/worker";
import { handle } from "./with-terms";
import type { PayEnv } from "../src/pay";
import { DEMO_GAME, DEMO_PER_DAY, demoName, setDemoGame } from "../src/demo";
import { makeD1 } from "./d1-sqlite";

const T = Date.UTC(2026, 9, 8, 10, 0, 0), H = 3_600_000;
const START = Math.floor(((T + 3 * H) / 1000 - 1692803367) / 3) + 1;
let env: PayEnv; let raw: ReturnType<typeof makeD1>["raw"]; let orders: any[]; let payments: Record<string, any>; let ipN = 0;
const realFetch = globalThis.fetch;
const call = (method: string, path: string, body?: unknown, key?: string, now = T, ip = "2.2.2.2") =>
  handle(new Request("http://x" + path, { method, headers: { "content-type": "application/json", "cf-connecting-ip": ip, ...(key ? { "x-organizer": key } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) }), env as Env, now);
const j = async (r: Response) => (await r.json()) as any;
const sign = (orderId: string, id: string) => createHmac("sha256", "sek").update(`${orderId}|${id}`).digest("hex");

beforeEach(() => {
  const d = makeD1(); raw = d.raw; orders = []; payments = {}; setDemoGame(true);
  (globalThis as any).fetch = async (url: string, init?: any) => {
    const u = String(url);
    if (!u.startsWith("https://rzp.test")) return realFetch(url, init);
    if (u.startsWith("https://rzp.test/v1/orders")) { const b = JSON.parse(init.body); const o = { id: "order_" + (orders.length + 1), amount: b.amount, currency: b.currency, receipt: b.receipt, status: "created" }; orders.push(o); return new Response(JSON.stringify(o)); }
    const pm = u.match(/\/payments\/([^/]+)(\/capture)?$/);
    if (pm) { const p = payments[pm[1]!]; if (pm[2]) p.status = "captured"; return new Response(JSON.stringify(p)); }
    return new Response("{}", { status: 404 });
  };
  env = { DB: d.db, ORGANIZER_SECRET: "plat", DAILY_WRITE_BUDGET: "1000000", RAZORPAY_KEY_ID: "rzp_test_x", RAZORPAY_KEY_SECRET: "sek", RAZORPAY_WEBHOOK_SECRET: "whsec", RAZORPAY_BASE_URL: "https://rzp.test/v1", PUBLIC_ORIGIN: "https://bingo.test", OWNER_EMAIL: "owner@platform.test", DATA_KEY: "dk" } as PayEnv;
});
afterEach(() => { globalThis.fetch = realFetch; setDemoGame(false); });

const organizer = async (email = "asha@acme.com") => {
  const st = await j(await handle(new Request("http://x/api/start", { method: "POST", headers: { "content-type": "application/json", "cf-connecting-ip": `9.9.9.${++ipN}` }, body: JSON.stringify({ email }) }), env as Env, T));
  return st.token as string;
};
const demo = (key: string, id: string, extra: Record<string, unknown> = {}, ip = "2.2.2.2") => call("POST", "/api/z", { id, startRound: START, callSeconds: 9, cap: 10, demo: true, ...extra }, key, T, ip);
const count = (sql: string) => (raw.prepare(sql).get() as any).c as number;

describe("the free demo game", () => {
  test("shipped OFF: the flag is false in the source, and with it off a demo is refused and nothing is made", async () => {
    expect(readFileSync(new URL("../src/demo.ts", import.meta.url), "utf8")).toContain("export let DEMO_GAME = false;");
    expect(readFileSync(new URL("../../web/public/zc.js", import.meta.url), "utf8")).toContain("var DEMO_GAME = false;");
    setDemoGame(false); expect(DEMO_GAME).toBe(false);
    const k = await organizer(); const r = await demo(k, "DEMO-OFF");
    expect(r.status).toBe(403); expect((await j(r)).code).toBe("demo-off");
    expect(count("SELECT COUNT(*) c FROM engagement")).toBe(0);
  });
  test("with the flag on, a demo is a draft of up to 10 people, marked as a demo, named Demo on every screen", async () => {
    const k = await organizer(); const r = await demo(k, "DEMO-1", { name: "Team quiz" });
    expect(r.status, JSON.stringify(await r.clone().json())).toBe(200); expect((await j(r)).demo).toBe(true);
    const e = raw.prepare("SELECT cap, pack, config FROM engagement WHERE id='DEMO-1'").get() as any;
    expect(e.cap).toBe(10); expect(e.pack).toBe(0); expect(JSON.parse(e.config).name).toBe("Demo: Team quiz");
    const info = await j(await call("GET", "/api/z/DEMO-1/info", undefined, k)); expect(info.demo).toBe(true); expect(info.name).toBe("Demo: Team quiz");
    expect(demoName("")).toBe("Demo game"); expect(demoName("Demo: x")).toBe("Demo: x");
    const other = await j(await call("POST", "/api/z", { id: "REAL-10", startRound: START, callSeconds: 9, cap: 10, name: "Real" }, k)); expect(other.demo).toBeUndefined();
    expect((await j(await call("GET", "/api/z/REAL-10/info", undefined, k))).demo).toBeUndefined();
  });
  test("a demo cannot grow past 10 people", async () => {
    const k = await organizer(); await demo(k, "DEMO-2", { name: "Quiz" });
    const big = await call("PATCH", "/api/z/DEMO-2/settings", { cap: 50 }, k); expect(big.status).toBe(400); expect((await j(big)).code).toBe("demo-cap");
    expect((await demo(k, "DEMO-3", { cap: 11 })).status).toBe(400);
  });
  test("publishing a demo is free: no payment row, no entitlement used; a bought pack is left alone", async () => {
    const k = await organizer(); const org = (raw.prepare("SELECT org FROM organizer_key LIMIT 1").get() as any).org;
    raw.prepare("INSERT INTO entitlement(id,org,pack,payment_id,eid,created_ms) VALUES('ent_x',?,?,?,NULL,?)").run(org, 500, "pay_bought", T);
    await demo(k, "DEMO-4");
    const p = await call("POST", "/api/z/DEMO-4/publish", { email: "asha@acme.com", phone: "9876501234" }, k);
    expect(p.status).toBe(200); expect((await j(p)).paid).toBe(true);
    expect(count("SELECT COUNT(*) c FROM payment")).toBe(0);
    expect((raw.prepare("SELECT eid FROM entitlement WHERE id='ent_x'").get() as any).eid).toBeNull();
    expect((raw.prepare("SELECT pack FROM engagement WHERE id='DEMO-4'").get() as any).pack).toBe(10);
  });
  test("at most 3 demos a day for one organizer; the same internet connection is limited too; the next day starts again", async () => {
    const k = await organizer();
    for (let i = 1; i <= DEMO_PER_DAY; i++) expect((await demo(k, `DEMO-L${i}`)).status).toBe(200);
    const no = await demo(k, "DEMO-L4"); expect(no.status).toBe(429); expect((await j(no)).code).toBe("demo-limit");
    expect(count("SELECT COUNT(*) c FROM engagement")).toBe(3);
    const k2 = await organizer("ravi@other.com");
    expect((await demo(k2, "DEMO-M1")).status).toBe(429);
    expect((await demo(k2, "DEMO-M2", {}, "5.5.5.5")).status).toBe(200);
    const next = await call("POST", "/api/z", { id: "DEMO-N1", startRound: START + 40000, callSeconds: 9, cap: 10, demo: true }, k, T + 24 * H); expect(next.status).toBe(200);
  });
  test("the limits keep no raw address or e-mail", async () => {
    const k = await organizer();
    for (let i = 1; i <= 4; i++) await demo(k, `DEMO-A${i}`);
    const keys = raw.prepare("SELECT k, v FROM kv WHERE k LIKE 'dlim/%'").all() as any[];
    expect(keys.length).toBe(2); for (const r of keys) { expect(r.v).toBe("3"); expect(r.k).not.toContain("2.2.2.2"); expect(r.k).not.toContain("asha"); }
  });
  test("a demo's guests are erased by the same timer as any game (nothing special)", () => {
    expect(readFileSync(new URL("../src/lifecycle.ts", import.meta.url), "utf8")).toContain("PURGE_AFTER_MS");
    expect(readFileSync(new URL("../src/admin.ts", import.meta.url), "utf8")).toContain("within 24 hours");
  });
});

describe("the Rs 1 payment test is for the owner only", () => {
  const start = (key?: string, extra: Record<string, unknown> = {}) => call("POST", "/api/payments/paytest", { name: "Rajat Agarwal", email: "owner@acme.in", country: "IN", ...extra }, key);
  test("without the owner key, or with an ordinary organizer's key, the API answers Not found and no order is opened", async () => {
    const k = await organizer();
    for (const key of [undefined, "wrong", k]) expect((await start(key)).status).toBe(404);
    expect((await call("GET", "/api/payments/paytest/pay_0000000000000000", undefined, k)).status).toBe(404);
    expect(orders.length).toBe(0); expect(count("SELECT COUNT(*) c FROM payment")).toBe(0);
  });
  test("a work link made from the owner key does not open it either", async () => {
    const r = await handle(new Request("http://x/api/payments/paytest", { method: "POST", headers: { "content-type": "application/json", "x-organizer": "plat", "x-cb-link": "1" }, body: "{}" }), env as Env, T);
    expect(r.status).toBe(404);
  });
  test("with the owner key: Rs 1 recorded as payment_test with a SITECODE txn id, the gateway order is 100 paise, and the receipt appears", async () => {
    const r = await start("plat"); const b = await j(r);
    expect(r.status, JSON.stringify(b)).toBe(200);
    expect(b.razorpay.amount).toBe(100); expect(orders[0].amount).toBe(100);
    const row = raw.prepare("SELECT product_type, product, txn_id, amount, is_test, status FROM payment WHERE id=?").get(b.paymentId) as any;
    expect(row).toMatchObject({ product_type: "payment_test", product: "corporate_bingo", amount: 1, is_test: 1, status: "created" });
    expect(row.txn_id).toMatch(/^[A-Z0-9]+-/);
    payments["pay_o1"] = { id: "pay_o1", order_id: b.razorpay.orderId, status: "captured", amount: 100, currency: "INR", method: "upi", vpa: "o@okicici" };
    const v = await j(await call("POST", "/api/payments/verify", { paymentId: b.paymentId, razorpay_order_id: b.razorpay.orderId, razorpay_payment_id: "pay_o1", razorpay_signature: sign(b.razorpay.orderId, "pay_o1") }));
    expect(v.paytest).toBe(true);
    expect((await j(await call("GET", `/api/payments/paytest/${b.paymentId}`, undefined, "plat"))).paytest).toBe(true);
    expect(count("SELECT COUNT(*) c FROM entitlement")).toBe(0);
    expect(count("SELECT COUNT(*) c FROM payment_ledger WHERE product_type='payment_test'")).toBe(1);
  });
  test("the page asks for the owner key, keeps it in memory only, and is not listed for search", () => {
    const js = readFileSync(new URL("../../web/public/paytest.js", import.meta.url), "utf8");
    expect(js).toContain('id="okey"'); expect(js).toContain("owner only"); expect(js).not.toMatch(/localStorage|sessionStorage/);
    expect(readFileSync(new URL("../../web/public/paytest.html", import.meta.url), "utf8")).toContain('content="noindex"');
    expect(readFileSync(new URL("../../web/public/robots.txt", import.meta.url), "utf8")).toContain("Disallow: /paytest.html");
  });
});
