// The three payment pages keep EVERYTHING the person typed (Boss order 2 Nov 2026, payment pages redesign, point D).
// Each test fills the real page in a DOM that talks to the REAL Worker, makes it go wrong (a wrong owner key = the server's 404, a failed payment call, a closed or failed
// Razorpay window), then reloads the page, and checks after every step that every field still holds what was typed. The owner key lives in this tab only.
import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { newWorld, openPage, roundAt, T, type Page } from "./harness";

setDefaultTimeout(60_000);
const START = roundAt(T) + 1200; // one hour after T
const OWNER_KEY = "owner-secret-9137";
let open: Page[] = [];
afterEach(async () => { for (const p of open) await p.close(); open = []; });

const KIT = ["common.js", "payfields.js", "paykit.js"];
const val = (p: Page, sel: string) => (p.$(sel) as any)?.value as string | undefined;
const snap = (p: Page, sels: string[]) => Object.fromEntries(sels.map((s) => [s, val(p, s)]));
/** Types into a box the way a person does: the value changes and the page is told. */
const type = (p: Page, sel: string, v: string) => { const el: any = p.$(sel); if (!el) throw new Error("no box " + sel); el.value = v; el.dispatchEvent(new p.win.Event(el.tagName === "SELECT" ? "change" : "input", { bubbles: true })); };
const fillAll = (p: Page, f: Record<string, string>) => { for (const [s, v] of Object.entries(f)) type(p, s, v); };
/** The words in the red message box (empty while it is hidden). */
const errText = (p: Page) => { const e: any = p.$("#pk-err"); return e && !e.hidden ? String(e.textContent || "").replace(/\s+/g, " ").trim() : ""; };
const dump = (st: any) => { const o: Record<string, string> = {}; for (let i = 0; i < st.length; i++) { const k = st.key(i); o[k] = st.getItem(k); } return o; };
/** Everything a page keeps in this tab, to hand to the "reloaded" page (a reload keeps the tab's sessionStorage). */
const tabOf = (p: Page) => dump(p.win.sessionStorage);

type Seen = string[];
/** Records every request the page makes; a request that matches is answered by `reply` instead of the Worker. */
function watch(p: Page, rules: { method: string; match: RegExp; reply: () => Response }[] = []): Seen {
  const real = p.win.fetch, seen: Seen = [];
  p.win.fetch = async (u: any, init?: any) => {
    const m = String(init?.method || "GET").toUpperCase(), path = String(u);
    seen.push(m + " " + path);
    const r = rules.find((x) => x.method === m && x.match.test(path));
    return r ? r.reply() : real(u, init);
  };
  return seen;
}
const reply = (status: number, body: unknown) => () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const closeRazorpay = (p: Page) => { p.win.TB.pay = async () => { throw Object.assign(new Error("The payment window was closed."), { cancelled: true }); }; };
const failRazorpay = (p: Page) => { p.win.TB.pay = async () => { throw Object.assign(new Error("Razorpay could not start. Please try again."), { status: 502 }); }; };

async function organizer(extra: Record<string, string> = {}) {
  const w = newWorld(extra);
  const s = await w.json(await w.api("POST", "/api/start", { email: "boss@acme.com" }));
  return { ...w, token: s.token as string, aiKey: s.aiKey as string };
}
type O = Awaited<ReturnType<typeof organizer>>;
const published = async (o: O, id: string, name: string) => {
  expect((await o.api("POST", "/api/z", { id, startRound: START, callSeconds: 9, cap: 100, join: "phone", name }, o.aiKey)).status).toBe(200);
  expect((await o.api("POST", `/api/z/${id}/publish`, { email: "boss@acme.com", phone: "98765 43210" }, o.token)).status).toBe(200);
};
const draftOnly = async (o: O, id: string, name: string) => { expect((await o.api("POST", "/api/z", { id, startRound: START, callSeconds: 9, cap: 100, join: "phone", name }, o.aiKey)).status).toBe(200); };

describe("the owner's payment test (/paytest)", () => {
  const FIELDS = { "#okey": "", "#gid": "GAME-ONE", "#nm": "Neha Shah", "#em": "neha@acme.com", "#ph": "98765 43210", "#pcode": "44", "#org": "Acme Ltd", "#tax": "27AAPFU0939F1ZV" };
  const SELS = Object.keys(FIELDS);
  const opn = async (o: O, session: Record<string, string> = {}) => { const p = await openPage(o.world, { url: "http://localhost/paytest.html", html: "paytest.html", scripts: [...KIT, "paytest.js"], session }); open.push(p); return p; };

  test("a wrong key, a closed Razorpay window and a reload: every field is still there, and the key never leaves this tab", async () => {
    const o = await organizer({ ORGANIZER_SECRET: OWNER_KEY }); await draftOnly(o, "GAME-ONE", "Diwali Bingo");
    const p = await opn(o); const seen = watch(p);
    const fields = { ...FIELDS, "#okey": "not-the-key-123" };
    fillAll(p, fields);
    expect(snap(p, SELS)).toEqual(fields);

    // 1. a wrong key, checked BEFORE any payment by asking the real server
    p.click("#okeychk"); await p.waitFor((x) => /This key does not match/.test(x));
    expect(seen).toContain("GET /api/payments/paytest/key");
    expect(snap(p, SELS)).toEqual(fields);
    expect((o.world.raw.prepare("SELECT COUNT(*) c FROM payment").get() as any).c).toBe(0); // no payment was made or started

    // 2. pressing Pay with the wrong key and a game ID: the server's 404 comes back as the same words, and nothing typed is lost
    p.click("#go"); await p.waitFor(() => /This key does not match\. Please paste it again/.test(errText(p)));
    expect(snap(p, SELS)).toEqual(fields);
    expect(seen.some((s) => /^POST \/api\/payments\/paytest$/.test(s))).toBe(false); // the game could not be looked up with that key, so no payment was opened

    // 3. the right key is accepted, the game appears with the TEST badge
    type(p, "#okey", OWNER_KEY); fields["#okey"] = OWNER_KEY;
    p.click("#okeychk"); await p.waitFor((x) => /Key accepted/.test(x) && /Diwali Bingo/.test(x) && /GAME-ONE/.test(x));
    expect(p.text()).toMatch(/Test/); expect(snap(p, SELS)).toEqual(fields);

    // 4. Razorpay fails to start, then its window is closed: the same words each time and every box still full
    watch(p, [{ method: "POST", match: /\/api\/payments\/paytest$/, reply: reply(200, { paymentId: "pay_stub0001", razorpay: { orderId: "order_stub" }, hop: "" }) }]);
    failRazorpay(p); p.click("#go"); await p.waitFor(() => /Razorpay could not start/.test(errText(p)));
    expect(snap(p, SELS)).toEqual(fields); expect((p.$("#go") as any).disabled).toBe(false);
    closeRazorpay(p); p.click("#go"); await p.waitFor(() => /payment window was closed/.test(errText(p)));
    expect(snap(p, SELS)).toEqual(fields); expect((p.$("#go") as any).disabled).toBe(false);

    // 5. a reload of the tab: every field comes back, and the game is shown again
    const tab = tabOf(p); await p.close();
    const q = await opn(o, tab);
    expect(snap(q, SELS)).toEqual(fields);
    await q.waitFor((x) => /Diwali Bingo/.test(x));

    // 6. where the key may and may not be: this tab's own storage only
    expect(JSON.stringify(dump(q.win.localStorage))).not.toContain(OWNER_KEY);
    expect(q.win.location.href).not.toContain(OWNER_KEY);
    expect(seen.join("\n")).not.toContain(OWNER_KEY); // never in an address
    expect(Object.entries(tab).filter(([, v]) => v.includes(OWNER_KEY)).map(([k]) => k)).toEqual(["cbz-paydraft-paytest"]);
  });

  test("a wrong key on the payment itself (no game ID): the server answers 404 and the page says so in the same words, with every field kept", async () => {
    const o = await organizer({ ORGANIZER_SECRET: OWNER_KEY });
    const p = await opn(o); const seen = watch(p);
    const fields = { ...FIELDS, "#gid": "", "#okey": "wrong-key-456" };
    fillAll(p, fields);
    p.click("#go"); await p.waitFor(() => /This key does not match\. Please paste it again/.test(errText(p)));
    expect(seen).toContain("POST /api/payments/paytest"); // the real server was asked, and answered 404
    expect(snap(p, SELS)).toEqual(fields); expect((p.$("#go") as any).disabled).toBe(false);
    expect((o.world.raw.prepare("SELECT COUNT(*) c FROM payment").get() as any).c).toBe(0);
    const q = await opn(o, tabOf(p)); expect(snap(q, SELS)).toEqual(fields);
  });

  test("the key is pasted with spaces: they are removed; a key with a curly quote is refused on the page before it is sent; empty game ID = payment test with no game", async () => {
    const o = await organizer({ ORGANIZER_SECRET: OWNER_KEY });
    const p = await opn(o);
    type(p, "#okey", "  " + OWNER_KEY + " \n"); (p.$("#okey") as any).dispatchEvent(new p.win.Event("blur")); expect(val(p, "#okey")).toBe(OWNER_KEY);
    p.click("#okeychk"); await p.waitFor((x) => /Key accepted/.test(x));
    expect(p.text()).toMatch(/Payment test \(no game\)/);
    type(p, "#okey", "owner’s-key"); p.click("#okeychk"); await p.waitFor((x) => /cannot be sent/.test(x));
    expect((p.$("#okey") as any).type).toBe("password"); p.click("#okeyeye"); expect((p.$("#okey") as any).type).toBe("text"); p.click("#okeyeye"); expect((p.$("#okey") as any).type).toBe("password");
  });
});

describe("the payment-link page (/paylink)", () => {
  const FIELDS = { "#nm": "Fiona Finance", "#em": "fiona@acme.com", "#ph": "98765 43210", "#pcode": "44", "#org": "Acme Ltd", "#tax": "27AAPFU0939F1ZV" };
  const SELS = Object.keys(FIELDS);
  const linkOf = async (o: O, id: string) => { const r = await o.api("POST", `/api/z/${id}/paylink`, {}, o.token); expect(r.status).toBe(200); return new URL((await o.json(r)).url).searchParams.get("t")!; };
  const opn = async (o: O, t: string, session: Record<string, string> = {}) => { const p = await openPage(o.world, { url: "http://localhost/paylink.html" + (t ? "?t=" + t : ""), html: "paylink.html", scripts: [...KIT, "paylink.js"], session }); open.push(p); return p; };

  test("information first (game, ID, people, date, organizer, price), and a failed payment call, a failed or closed Razorpay window and a reload all keep every field", async () => {
    const o = await organizer({ TEST_MODE: "1" }); await published(o, "PG-PERSIST1", "Diwali Night"); const t = await linkOf(o, "PG-PERSIST1");
    const p = await opn(o, t); const txt = await p.waitFor((x) => /Diwali Night/.test(x));
    expect(txt).toMatch(/PG-PERSIST1/); expect(txt).toMatch(/Order summary/); expect(txt.indexOf("Order summary")).toBeLessThan(txt.indexOf("Your details"));
    expect(txt).not.toMatch(/coupon|discount|reduced/i);
    fillAll(p, FIELDS); expect(snap(p, SELS)).toEqual(FIELDS);

    // a failed call to the server
    watch(p, [{ method: "POST", match: /\/checkout$/, reply: reply(500, { error: "The payment service is busy." }) }]);
    p.click("#paygo"); await p.waitFor((x) => /payment service is busy/.test(x));
    expect(snap(p, SELS)).toEqual(FIELDS); expect((p.$("#paygo") as any).disabled).toBe(false);

    // Razorpay fails to start, then its window is closed
    watch(p, [{ method: "POST", match: /\/checkout$/, reply: reply(200, { mode: "razorpay", razorpay: { orderId: "order_stub" }, paymentId: "pay_stub0002", hop: "" }) }]);
    failRazorpay(p); p.click("#paygo"); await p.waitFor((x) => /Razorpay could not start/.test(x)); expect(snap(p, SELS)).toEqual(FIELDS);
    closeRazorpay(p); p.click("#paygo"); await p.waitFor((x) => /payment window was closed/.test(x)); expect(snap(p, SELS)).toEqual(FIELDS);

    // a reload of the tab (the link's secret is kept for this tab only, the address has none)
    const tab = tabOf(p); expect(p.win.location.search).toBe(""); await p.close();
    const q = await opn(o, "", tab); await q.waitFor((x) => /Diwali Night/.test(x));
    expect(snap(q, SELS)).toEqual(FIELDS);
    expect((q.win as any).__ctDirty()).toBe(true); // the automatic page update waits while typed details exist
  });

  test("after a paid order the draft is gone from the tab", async () => {
    const o = await organizer({ TEST_MODE: "1" }); await published(o, "PG-PERSIST2", "Paid Night"); const t = await linkOf(o, "PG-PERSIST2");
    const p = await opn(o, t); await p.waitFor((x) => /Paid Night/.test(x));
    type(p, "#nm", "Neha Shah"); type(p, "#em", "neha@acme.com");
    expect(tabOf(p)["cbz-paydraft-paylink"]).toContain("Neha Shah");
    p.click("#paygo"); await p.waitFor((x) => /Payment received/.test(x), 20_000);
    expect(tabOf(p)["cbz-paydraft-paylink"]).toBeUndefined();
    expect((await o.json(await o.api("GET", `/api/paylink/${t}`))).status).toBe("paid");
  });
});

describe("the payment page in the console (/pay)", () => {
  const FIELDS = { "#nm": "Neha Shah", "#em": "neha@acme.com", "#ph": "98765 43210", "#pcode": "44", "#org": "Acme Ltd", "#tax": "27AAPFU0939F1ZV" };
  const SELS = Object.keys(FIELDS);
  const opn = async (o: O, eid: string, session: Record<string, string> = {}) => {
    const p = await openPage(o.world, { url: `http://localhost/pay.html?e=${eid}`, html: "pay.html", scripts: [...KIT, "pay.js"], session: { "cbz-org": o.token, "cbz-email": "boss@acme.com", ...session } }); open.push(p); return p;
  };
  test("a failed payment call and a closed Razorpay window keep every field, and so does a reload", async () => {
    const o = await organizer({ TEST_MODE: "1" }); await draftOnly(o, "PG-PERSIST3", "Console Night");
    const p = await opn(o, "PG-PERSIST3"); await p.waitFor((x) => !!p.$("#paygo"));
    fillAll(p, FIELDS); expect(snap(p, SELS)).toEqual(FIELDS);
    watch(p, [{ method: "POST", match: /\/api\/checkout$/, reply: reply(500, { error: "The payment service is busy." }) }]);
    p.click("#paygo"); await p.waitFor((x) => /payment service is busy/.test(x)); expect(snap(p, SELS)).toEqual(FIELDS);
    watch(p, [{ method: "POST", match: /\/api\/checkout$/, reply: reply(200, { mode: "razorpay", razorpay: { orderId: "order_stub" }, paymentId: "pay_stub0003", hop: "" }) }]);
    closeRazorpay(p); p.click("#paygo"); await p.waitFor((x) => /payment window was closed/.test(x)); expect(snap(p, SELS)).toEqual(FIELDS);
    const tab = tabOf(p); await p.close();
    const q = await opn(o, "PG-PERSIST3", tab); await q.waitFor((x) => !!q.$("#paygo"));
    expect(snap(q, SELS)).toEqual(FIELDS);
  });
});
