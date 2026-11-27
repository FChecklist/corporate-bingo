// The first-party sales funnel (apps/edge/src/funnel.ts), server side: every server step fired from the real code that does the thing (create, publish, pay link, pay, webhook, timer),
// the page steps through the real route, the owner report and CSV, the flag, the opt-out headers, and that no event carries a name, a mobile number or an e-mail.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { type Env } from "../src/worker";
import { handle } from "./with-terms";
import type { PayEnv } from "../src/pay";
import { FUNNEL_LABELS, SERVER_EVENTS, CLIENT_EVENTS, funnelRows, setFunnelEnabled, weekOf } from "../src/funnel";
import { FUNNEL_EVENTS, makeReporter } from "../../../vendor/game-core/packages/core/src/funnel";
import { lifecycleTick } from "../src/lifecycle";
import { makeD1 } from "./d1-sqlite";

const T = Date.UTC(2026, 9, 8, 10, 0, 0), H = 3_600_000;
const START = Math.floor(((T + 3 * H) / 1000 - 1692803367) / 3) + 1; // the game starts 3 hours after T
let env: PayEnv; let raw: ReturnType<typeof makeD1>["raw"]; let orders: any[]; let payments: Record<string, any>; let ipN = 0;
const realFetch = globalThis.fetch;
const call = (method: string, path: string, body?: unknown, key?: string, now = T, extra: Record<string, string> = {}) =>
  handle(new Request("http://x" + path, { method, headers: { "content-type": "application/json", "cf-connecting-ip": "2.2.2.2", ...(key ? { "x-organizer": key } : {}), ...extra }, body: body === undefined ? undefined : JSON.stringify(body) }), env as Env, now);
const j = async (r: Response) => (await r.json()) as any;
const sign = (orderId: string, id: string) => createHmac("sha256", "sek").update(`${orderId}|${id}`).digest("hex");
const rows = () => (tableExists() ? (raw.prepare("SELECT * FROM funnel_event ORDER BY at_ms, event").all() as any[]) : []);
const events = () => rows().map((r) => r.event);
const tableExists = () => !!raw.prepare("SELECT 1 AS x FROM sqlite_master WHERE name='funnel_event'").get();

beforeEach(() => {
  const d = makeD1(); raw = d.raw; orders = []; payments = {}; setFunnelEnabled(true);
  (globalThis as any).fetch = async (url: string, init?: any) => {
    const u = String(url);
    if (!u.startsWith("https://rzp.test")) return realFetch(url, init);
    if (u.startsWith("https://rzp.test/v1/orders")) { const b = JSON.parse(init.body); const o = { id: "order_" + (orders.length + 1), amount: b.amount, currency: b.currency, receipt: b.receipt, status: "created" }; orders.push(o); return new Response(JSON.stringify(o)); }
    const pm = u.match(/\/payments\/([^/]+)(\/capture)?$/);
    if (pm) { const p = payments[pm[1]!]; if (pm[2]) p.status = "captured"; return new Response(JSON.stringify(p)); }
    return new Response("{}", { status: 404 });
  };
  env = { DB: d.db, ORGANIZER_SECRET: "plat", RUNNER_KEY: "test-runner-key-test-runner-key-test0000", DAILY_WRITE_BUDGET: "1000000", RAZORPAY_KEY_ID: "rzp_test_x", RAZORPAY_KEY_SECRET: "sek", RAZORPAY_WEBHOOK_SECRET: "whsec", RAZORPAY_BASE_URL: "https://rzp.test/v1", PUBLIC_ORIGIN: "https://bingo.test", OWNER_EMAIL: "owner@platform.test", DATA_KEY: "dk" } as PayEnv;
});
afterEach(() => { globalThis.fetch = realFetch; setFunnelEnabled(false); });

const NAME = "Priya Sharma Zorbaxian", EMAIL = "zorbax.boss@acme.com", MOBILE = "9876501234";
const organizer = async () => {
  const st = await j(await handle(new Request("http://x/api/start", { method: "POST", headers: { "content-type": "application/json", "cf-connecting-ip": `9.9.9.${++ipN}` }, body: JSON.stringify({ email: EMAIL }) }), env as Env, T));
  return st.token as string;
};
const make = (key: string, id = "FN-1", cap = 300) => call("POST", "/api/z", { id, startRound: START, callSeconds: 9, cap, name: "Zorbaxian Diwali Bingo" }, key);
const publish = (key: string, id = "FN-1", extra: Record<string, string> = {}) => call("POST", `/api/z/${id}/publish`, { email: EMAIL, phone: MOBILE }, key, T, extra);
const checkout = async (key: string, id = "FN-1") => {
  const l = await j(await call("POST", `/api/z/${id}/paylink`, {}, key)); const tok = new URL(l.url).searchParams.get("t")!;
  return { tok, c: await j(await call("POST", `/api/paylink/${tok}/checkout`, { name: NAME, email: EMAIL }, undefined, T, { "cf-connecting-ip": "3.3.3.3" })) };
};
const verify = (c: any, id = "pay_1") => {
  payments[id] = { id, order_id: c.razorpay.orderId, status: "captured", amount: orders.find((o) => o.id === c.razorpay.orderId)!.amount };
  return call("POST", "/api/payments/verify", { paymentId: c.paymentId, razorpay_order_id: c.razorpay.orderId, razorpay_payment_id: id, razorpay_signature: sign(c.razorpay.orderId, id) });
};
const hook = (event: string, orderId: string, id = "pay_f") => {
  const body = JSON.stringify({ event, payload: { payment: { entity: { id, order_id: orderId, amount: 100 } } } });
  return handle(new Request("http://x/api/payments/webhook", { method: "POST", headers: { "x-razorpay-signature": createHmac("sha256", "whsec").update(body).digest("hex") }, body }), env as Env, T);
};

describe("each event, fired from the real code", () => {
  test("game_created, game_published and payment_page_reached come from creating and publishing a game", async () => {
    const k = await organizer();
    expect((await make(k)).status).toBe(200);
    expect(events()).toEqual(["game_created"]);
    expect((await publish(k)).status).toBe(200);
    expect(events().sort()).toEqual(["game_created", "game_published", "payment_page_reached"]);
    expect(rows().every((r) => r.src === "srv" && r.game === "bingo" && r.size === 300)).toBe(true);
  });
  test("payment_link_copied, payment_started and payment_succeeded come from the pay link, the checkout and the verified payment", async () => {
    const k = await organizer(); await make(k);
    const { c } = await checkout(k);
    expect(events()).toEqual(expect.arrayContaining(["game_created", "payment_link_copied", "payment_started"]));
    expect(events()).not.toContain("payment_succeeded");
    expect((await verify(c)).status).toBe(200);
    expect(events()).toContain("payment_succeeded");
    await verify(c); // the same payment verified again counts once
    expect(events().filter((e) => e === "payment_succeeded")).toHaveLength(1);
  });
  test("payment_failed comes from the gateway's failed webhook, once, with the reason 'error' and no payer detail", async () => {
    const k = await organizer(); await make(k); const { c } = await checkout(k);
    expect((await hook("payment.failed", c.razorpay.orderId)).status).toBe(200);
    expect((await hook("payment.failed", c.razorpay.orderId)).status).toBe(200);
    const f = rows().filter((r) => r.event === "payment_failed");
    expect(f).toHaveLength(1); expect(f[0]).toMatchObject({ reason: "error", size: 500, src: "srv" });
  });
  test("game_started and game_completed come from the timer, once each, only for a game that has people in it", async () => {
    const k = await organizer(); await make(k, "FN-2", 100); await checkout(k, "FN-2").then(({ c }) => verify(c));
    const start = (START - 1) * 3 * 1000 + 1692803367 * 1000;
    // nobody joined: nothing is counted
    await lifecycleTick(env as any, start + 5 * 60_000);
    expect(events()).not.toContain("game_started");
    raw.prepare("INSERT INTO participant(eid,pid,phone_hash,name,joined_ms) VALUES('FN-2','p1','h','A',?)").run(T);
    await lifecycleTick(env as any, start + 5 * 60_000); await lifecycleTick(env as any, start + 6 * 60_000);
    expect(events().filter((e) => e === "game_started")).toHaveLength(1);
    expect(events()).not.toContain("game_completed");
    await lifecycleTick(env as any, start + 30 * H); await lifecycleTick(env as any, start + 30.1 * H);
    expect(events().filter((e) => e === "game_completed")).toHaveLength(1);
  });
  test("every event on the list is covered here or by the page test: the server steps and the page steps together are the thirteen", () => {
    expect([...CLIENT_EVENTS, ...SERVER_EVENTS].sort()).toEqual([...FUNNEL_EVENTS].sort());
    expect(FUNNEL_EVENTS).toHaveLength(13);
    for (const e of FUNNEL_EVENTS) expect(FUNNEL_LABELS[e].length).toBeGreaterThan(3);
  });
});

describe("page events through the real route (core makeReporter)", () => {
  const viaReporter = async (extra: Record<string, string> = {}, nav?: any) => {
    const sent: Promise<Response>[] = [];
    const r = makeReporter({ endpoint: "/api/f/e", game: "bingo", nav, send: (u, b) => { sent.push(handle(new Request("http://x" + u, { method: "POST", body: b, headers: extra }), env as Env, T)); } });
    return { r, done: () => Promise.all(sent) };
  };
  test("viewed, size_chosen, signup_started and payment_page_opened are kept once per visit", async () => {
    const { r, done } = await viaReporter();
    r.report("viewed"); r.report("viewed"); r.report("size_chosen", { size: 250 }); r.report("signup_started"); r.report("payment_page_opened");
    const rs = await done(); expect(rs.every((x) => x.status === 204)).toBe(true);
    expect(events().sort()).toEqual(["payment_page_opened", "signup_started", "size_chosen", "viewed"]);
    expect(rows().find((x) => x.event === "size_chosen")).toMatchObject({ size: 250, src: "web", game: "bingo", ref: r.visit });
  });
  test("a page cannot send a server step, a bad visit id, or a long message", async () => {
    const post = (b: unknown) => handle(new Request("http://x/api/f/e", { method: "POST", body: typeof b === "string" ? b : JSON.stringify(b) }), env as Env, T);
    await post({ event: "payment_succeeded", visit: "abcdefghijkl" }); await post({ event: "game_created", visit: "abcdefghijkl" });
    await post({ event: "viewed", visit: "short" }); await post({ event: "viewed", visit: "ABCDEFGHIJKL" }); await post("not json"); await post({ event: "viewed", visit: "abcdefghijkl", pad: "x".repeat(500) });
    expect(rows()).toHaveLength(0);
    expect((await post({ event: "viewed", visit: "abcdefghijkl" })).status).toBe(204); expect(events()).toEqual(["viewed"]);
  });
  test("Global Privacy Control and Do Not Track: the reporter sends nothing, and the server drops a request that carries either header", async () => {
    const q = await viaReporter({}, { globalPrivacyControl: true }); expect(q.r.report("viewed")).toBe(false); await q.done();
    for (const h of [{ "sec-gpc": "1" }, { dnt: "1" }] as Record<string, string>[]) { const { r, done } = await viaReporter(h); r.report("viewed"); await done(); }
    const k = await organizer(); await call("POST", "/api/z", { id: "FN-G", startRound: START, callSeconds: 9, cap: 100 }, k, T, { "sec-gpc": "1" });
    await publish(k, "FN-G", { dnt: "1" });
    expect(rows()).toHaveLength(0);
  });
  test("an endpoint on another host is refused by the reporter itself", async () => {
    const { r, done } = await viaReporter(); const bad = makeReporter({ endpoint: "https://elsewhere.test/e", game: "bingo", send: () => { throw new Error("must not send"); } });
    expect(bad.report("viewed")).toBe(false); expect(r.report("viewed")).toBe(true); await done();
  });
});

describe("the flag", () => {
  test("shipped OFF in the source: nothing is stored, the route answers 204 and the table is not even created", async () => {
    expect(readFileSync(new URL("../src/funnel.ts", import.meta.url), "utf8")).toContain("export let FUNNEL_ENABLED = false;");
    expect(readFileSync(new URL("../../web/public/v.js", import.meta.url), "utf8")).toContain("var FUNNEL = false,");
    setFunnelEnabled(false);
    const d = makeD1(); raw = d.raw; env = { ...env, DB: d.db } as PayEnv;
    const k = await organizer(); await make(k); await publish(k);
    expect((await handle(new Request("http://x/api/f/e", { method: "POST", body: JSON.stringify({ event: "viewed", visit: "abcdefghijkl" }) }), env as Env, T)).status).toBe(204);
    expect(tableExists()).toBe(false);
  });
});

describe("the owner report and the CSV", () => {
  const seed = async () => {
    const k = await organizer(); await make(k); await publish(k); const { c } = await checkout(k); await verify(c);
    for (const [v, ev] of [["aaaaaaaaaaaa", "viewed"], ["bbbbbbbbbbbb", "viewed"], ["cccccccccccc", "viewed"], ["dddddddddddd", "viewed"], ["aaaaaaaaaaaa", "size_chosen"], ["bbbbbbbbbbbb", "size_chosen"], ["aaaaaaaaaaaa", "signup_started"]] as const)
      await handle(new Request("http://x/api/f/e", { method: "POST", body: JSON.stringify({ event: ev, visit: v, size: 250 }) }), env as Env, T);
  };
  test("only the owner reads it; others get the same 404 as an unknown address; the read is written to the access log", async () => {
    await seed(); const k = await organizer();
    expect((await call("GET", "/api/owner/funnel", undefined, k)).status).toBe(404);
    expect((await call("GET", "/api/owner/funnel")).status).toBe(404);
    expect((await call("GET", "/api/owner/funnel", undefined, "plat", T, { "x-cb-link": "1" })).status).toBe(404);
    const r = await call("GET", "/api/owner/funnel?from=2026-10-01&to=2026-10-31", undefined, "plat"); expect(r.status).toBe(200);
    const rep = await j(r);
    const n = (e: string) => rep.total.find((x: any) => x.event === e);
    expect(n("viewed")).toMatchObject({ count: 4, ofFirst: 100 }); expect(n("size_chosen")).toMatchObject({ count: 2, ofPrevious: 50, ofFirst: 50 }); expect(n("signup_started")).toMatchObject({ count: 1, ofPrevious: 50, ofFirst: 25 });
    expect(n("game_created").count).toBe(1); expect(n("payment_succeeded").count).toBe(1);
    expect(rep.total.map((x: any) => x.event)).toEqual([...FUNNEL_EVENTS]);
    expect(rep.days.map((d: any) => d.period)).toEqual(["2026-10-08"]); expect(rep.weeks.map((d: any) => d.period)).toEqual([weekOf("2026-10-08")]);
    expect(rep.sizes[0]).toMatchObject({ size: 250 });
    expect(raw.prepare("SELECT COUNT(*) AS c FROM audit_access WHERE action='funnel'").get()).toEqual({ c: 1 });
    expect(raw.prepare("SELECT COUNT(*) AS c FROM audit_access WHERE action='denied:funnel'").get()).toEqual({ c: 3 });
  });
  test("the CSV has one line per step for the total, each day and each week, with the two percentages", async () => {
    await seed();
    const r = await call("GET", "/api/owner/funnel?format=csv&from=2026-10-01&to=2026-10-31", undefined, "plat");
    expect(r.headers.get("content-type")).toContain("text/csv"); expect(r.headers.get("content-disposition")).toContain("sales-funnel.csv");
    const lines = (await r.text()).trim().split("\n");
    expect(lines[0]).toBe("scope,period,event,label,count,percent_of_previous,percent_of_first");
    expect(lines).toHaveLength(1 + 13 * 3);
    expect(lines).toContain("total,all,viewed,Site viewed,4,,100");
    expect(lines).toContain("total,all,size_chosen,Size chosen,2,50,50");
    expect(lines.filter((l) => l.startsWith("day,2026-10-08,"))).toHaveLength(13);
  });
  test("funnelRows: payment_failed is a side branch, so the step after it compares with the step before it", () => {
    const rs = funnelRows({ viewed: 10, size_chosen: 5, signup_started: 4, game_created: 3, game_published: 3, payment_page_reached: 2, payment_page_opened: 2, payment_link_copied: 1, payment_started: 1, payment_succeeded: 1, payment_failed: 1, game_started: 1, game_completed: 1 });
    expect(rs.find((r) => r.event === "payment_failed")!.ofPrevious).toBeNull();
    expect(rs.find((r) => r.event === "game_started")).toMatchObject({ ofPrevious: 100, ofFirst: 10 });
  });
  test("the owner page is not indexed, and is in the build with the script that draws it", () => {
    const pub = (f: string) => readFileSync(new URL("../../web/public/" + f, import.meta.url), "utf8");
    expect(pub("owner-funnel.html")).toMatch(/name="robots" content="noindex, nofollow"/); expect(pub("owner-funnel.html")).toContain('src="/owner-funnel.js"');
    const b = readFileSync(new URL("../../../pages/build.mjs", import.meta.url), "utf8");
    for (const f of ['"owner-funnel.html"', '"owner-funnel.js"', '"funnel.js"', '["/owner-funnel", PLAINCSP, true]']) expect(b).toContain(f);
    expect(pub("owner-funnel.js")).not.toMatch(/innerHTML|document\.write|eval\(/);
  });
});

describe("no event carries a name, a mobile number or an e-mail", () => {
  test("after every step has fired with real names, numbers and e-mails around, the table, the report and the CSV hold none of them", async () => {
    const k = await organizer(); await make(k); await publish(k); const { c } = await checkout(k); await hook("payment.failed", c.razorpay.orderId); await verify(c);
    const send = (b: unknown) => handle(new Request("http://x/api/f/e", { method: "POST", body: JSON.stringify(b) }), env as Env, T);
    // a hostile or careless page tries to slip personal details into every field
    await send({ event: "viewed", visit: "abcdefghijkl", game: EMAIL, name: NAME, email: EMAIL, mobile: MOBILE, phone: MOBILE });
    await send({ event: "size_chosen", visit: "abcdefghijkm", size: 250, game: MOBILE, name: NAME, reason: EMAIL, mode: NAME });
    await send({ event: "signup_started", visit: "abcdefghijkn", game: "zorbax@acme", email: EMAIL });
    const t = rows();
    expect(t.length).toBeGreaterThan(8);
    expect(Object.keys(t[0]).sort()).toEqual(["at_ms", "day", "event", "game", "mode", "reason", "ref", "size", "src"]);
    const everything = JSON.stringify(t) + JSON.stringify(await j(await call("GET", "/api/owner/funnel?from=2026-10-01&to=2026-10-31", undefined, "plat"))) + await (await call("GET", "/api/owner/funnel?format=csv&from=2026-10-01&to=2026-10-31", undefined, "plat")).text();
    for (const secret of [NAME, "Zorbaxian", "Priya", "zorbax", EMAIL, "acme.com", MOBILE, "98765", "Diwali", "FN-1", "pay_1", "order_1", "2.2.2.2", "3.3.3.3", "cbk_"]) expect([secret, everything.includes(secret)]).toEqual([secret, false]);
    expect(t.every((r) => r.game === "bingo" || r.game === null)).toBe(true);
    expect(t.every((r) => r.mode === null && (r.reason === null || r.reason === "error"))).toBe(true);
    expect(t.every((r) => /^[0-9a-f]{16}$/.test(r.ref) || /^[a-z0-9]{12}$/.test(r.ref))).toBe(true);
  });
});
