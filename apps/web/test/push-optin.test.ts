// "Yes, notify me when this game begins" on the player page (1.6.0). It ships OFF: while apps/web/public/push-config.js holds no address nothing is drawn, nothing is loaded and no call is made.
// With an address: the block (the corporate-push client, copied unchanged) appears with "Stop notifications" always visible; no browser question and no request until the tap; one subscribe for the game's own scope.
// The pages run in happy-dom with a fake browser (service worker, push manager, notification permission) and a fake push service; no real message or request ever leaves this test.
// FALSIFIED BY: client-file-edited, block-shown-while-dark, request-on-load, permission-asked-on-load, stop-button-hidden, wrong-scope, push-click-handled-twice, address-added-to-csp-while-dark
import { afterEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Window } from "happy-dom";
import { pushApiOf, withPushConnect } from "../../../pages/push-api.mjs";

const PUB = join(import.meta.dir, "../public");
const ROOT = join(import.meta.dir, "../../..");
const pub = (f: string) => readFileSync(join(PUB, f), "utf8");
const PUSH = "https://push.example.com";

// The three client files are byte-for-byte what the corporate-push service ships at the pinned commit: any edit, even a space, changes the hash.
const PINNED = "f1e93f59f45444711edbb66e632fe1333bf8f9cb";
const HASHES: Record<string, string> = {
  "push-optin.js": "10daba00f8f6d7a7605f1af1875cfe683bc17c9670fed5be5893ddcd3afc132c",
  "push-optin.css": "60ee847249cd5af714e269d67b3188225062ff24352864236e3df252d6537e41",
  "sw-push-snippet.js": "ff004604f481bf2ca665441862fc3ebee0ab0f33f7cc610ac2bf3546a5c9ff0b",
};
const sha = (s: Buffer | string) => createHash("sha256").update(s).digest("hex");

// ---- a fake browser and a fake push service -------------------------------------------------------------
type Page = { win: any; box: () => any; calls: { url: string; init: any }[]; asked: () => number; sub: { endpoint: string }; subscribed: () => boolean; until: (f: () => boolean) => Promise<void>; run: (file: string) => void };
let open: any[] = [];
afterEach(() => { for (const w of open) { try { w.close(); } catch { /* closed */ } } open = []; });

function page(o: { query?: string; api?: string | null; permission?: string; demo?: boolean; ended?: boolean } = {}): Page {
  const win: any = new Window({ url: "https://bingo.test/z.html" + (o.query ?? "?e=GAME1"), settings: { disableJavaScriptFileLoading: true, disableCSSFileLoading: true } });
  open.push(win);
  for (const n of ["Uint8Array", "Event", "AbortController", "atob", "btoa", "Promise", "JSON", "Math", "Date", "Array", "Object", "String", "Number", "RegExp", "Error", "URL", "URLSearchParams", "encodeURIComponent"]) if (win[n] === undefined && (globalThis as any)[n] !== undefined) win[n] = (globalThis as any)[n];
  win.document.write('<!doctype html><html><head></head><body><main id="app"></main><aside class="mkown"></aside></body></html>');
  const calls: Page["calls"] = []; let permissionAsks = 0; let current: any = null;
  const sub = { endpoint: "https://fcm.googleapis.com/fcm/send/abc123" };
  const subscription: any = { ...sub, options: { applicationServerKey: null }, toJSON: () => ({ endpoint: sub.endpoint, keys: { p256dh: "P256", auth: "AUTH" } }), unsubscribe: async () => { current = null; return true; } };
  const reg = { pushManager: { getSubscription: async () => current, subscribe: async () => (current = subscription) } };
  Object.defineProperty(win.navigator, "serviceWorker", { value: { getRegistration: async () => reg, ready: Promise.resolve(reg), register: async () => reg }, configurable: true });
  win.PushManager = function PushManager() { /* present */ };
  win.Notification = { permission: o.permission ?? "default", requestPermission: async () => { permissionAsks++; return "granted"; } };
  win.fetch = async (url: any, init: any) => { // the fake push service: only its own address answers
    calls.push({ url: String(url), init });
    const u = new URL(String(url));
    if (u.origin !== PUSH) throw new Error("offline: " + u.origin);
    if (u.pathname === "/vapid-public") return Response.json({ key: Buffer.from(new Uint8Array(65).fill(4)).toString("base64url") });
    return Response.json({ ok: true });
  };
  if (o.demo) win.__CB_DEMO = { eid: "DEMO" };
  if (o.ended) win.__cbGameEnded = true;
  const run = (file: string) => new Function("window", `with (window) { ${pub(file)}\n}`).call(win, win);
  run("push-config.js"); // the real file: empty today
  if (o.api !== undefined && o.api !== null) win.CBPushConfig.api = o.api;
  if (o.api === null) win.CBPushConfig = undefined;
  run("push-boot.js");
  const until = async (f: () => boolean) => { for (let i = 0; i < 400 && !f(); i++) await new Promise((r) => setTimeout(r, 5)); if (!f()) throw new Error("timed out waiting"); };
  return { win, box: () => win.document.querySelector("[data-push-optin]"), calls, asked: () => permissionAsks, sub, subscribed: () => current !== null, until, run };
}
const head = (p: Page) => [...p.win.document.head.children].map((e: any) => `${e.tagName.toLowerCase()} ${e.getAttribute("href") ?? e.getAttribute("src") ?? ""}`.trim());
const btn = (p: Page, cls: string) => p.box().querySelector("." + cls);

describe("the three client files are the service's, unchanged", () => {
  for (const [f, h] of Object.entries(HASHES)) test(`${f} is byte-for-byte the file at corporate-push ${PINNED.slice(0, 12)}`, () => {
    expect(sha(readFileSync(join(PUB, f)))).toBe(h);
  });
  test("the check has teeth: one added space changes the hash", () => {
    expect(sha(pub("push-optin.js") + " ")).not.toBe(HASHES["push-optin.js"]);
  });
});

describe("dark (as shipped): nothing shows, nothing is loaded, no call is made", () => {
  test("push-config.js holds no address", () => {
    expect(pushApiOf(pub("push-config.js"))).toBe("");
    expect(pub("push-config.js")).toMatch(/window\.CBPushConfig\s*=\s*\{\s*api:\s*""\s*\}/);
  });
  test("with the shipped (empty) address the page gets no block, no push-optin file is requested, no fetch, no permission question", async () => {
    const p = page();
    await new Promise((r) => setTimeout(r, 30));
    expect(p.box()).toBeNull(); expect(head(p)).toEqual([]); expect(p.calls).toEqual([]); expect(p.asked()).toBe(0);
    expect(p.win.document.body.innerHTML).not.toMatch(/notify|Notif/i);
  });
  for (const bad of ["", "   ", "http://push.example.com", "https://REPLACE-WITH-PUSH-SERVICE-ADDRESS", "https://push.example.com/send", "https://push.example.com?x=1", "javascript:alert(1)", "//push.example.com", "https://localhost", "push.example.com"]) {
    test(`an address that is not a plain https address stays dark: ${JSON.stringify(bad)}`, () => {
      const p = page({ api: bad });
      expect(p.box()).toBeNull(); expect(head(p)).toEqual([]); expect(p.calls).toEqual([]);
    });
  }
  test("no configuration object at all stays dark and throws nothing", () => {
    const p = page({ api: null });
    expect(p.box()).toBeNull(); expect(head(p)).toEqual([]);
  });
  test("the free demo is never a place to be notified: dark even with an address", () => {
    const p = page({ api: PUSH, demo: true });
    expect(p.box()).toBeNull(); expect(head(p)).toEqual([]);
  });
  test("no game id in the link (and no remembered game) or an odd one: no block", () => {
    for (const q of ["", "?e=", "?e=<b>x</b>", "?e=a%20b", "?e=" + "x".repeat(129)]) { const p = page({ api: PUSH, query: q }); expect([q, p.box()]).toEqual([q, null]); }
  });
});

describe("lit: the block is made for this game, and loads only the two client files", () => {
  test("the block carries the game's own id, the privacy page and the game's service worker; the two files are requested once each; still no request and no question", async () => {
    const p = page({ api: PUSH + "/" });
    const b = p.box();
    expect(b).not.toBeNull();
    expect(Object.fromEntries([...b.attributes].map((a: any) => [a.name, a.value]))).toEqual({
      "data-push-optin": "", "data-push-api": PUSH, "data-push-site": "game", "data-push-game-id": "GAME1", "data-push-privacy": "/privacy.html", "data-push-sw": "/zsw.js", "data-push-ended": "false",
    });
    expect(head(p)).toEqual(["link /push-optin.css", "script /push-optin.js"]);
    expect(p.win.document.getElementById("app").nextElementSibling).toBe(b); // under the game, outside the part the game redraws
    expect(p.calls).toEqual([]); expect(p.asked()).toBe(0);
  });
  test("the game id also comes from the part after #, and from the last game this phone opened", () => {
    expect(page({ api: PUSH, query: "#ABC-9" }).box().getAttribute("data-push-game-id")).toBe("ABC-9");
    const w: any = new Window({ url: "https://bingo.test/z.html" }); open.push(w);
    // (the stored id is read the way z.js stores it: the key cb-last-eid)
    expect(pub("push-boot.js")).toContain('"cb-last-eid"'); expect(pub("z.js")).toContain('LAST = "cb-last-eid"');
  });
  test("a game that is already over when the page opens: the block starts with data-push-ended true", () => {
    expect(page({ api: PUSH, ended: true }).box().getAttribute("data-push-ended")).toBe("true");
  });
  test("when z.js says the game is over the block is told, and offers 'Keep notifying me about new games' once it is on", async () => {
    const p = page({ api: PUSH, permission: "default" });
    p.run("push-optin.js");
    await p.until(() => !!btn(p, "cp-optin__btn"));
    btn(p, "cp-optin__btn").click();
    await p.until(() => p.box().querySelector(".cp-optin").getAttribute("data-state") === "on");
    expect(btn(p, "cp-optin__keep").hidden).toBe(true);
    p.win.dispatchEvent(new p.win.Event("cb:game-ended"));
    expect(p.box().getAttribute("data-push-ended")).toBe("true");
    expect(btn(p, "cp-optin__keep").hidden).toBe(false);
    expect(btn(p, "cp-optin__keep").textContent).toBe("Keep notifying me about new games");
  });
  test("z.js tells the page the game is over (or will never begin) exactly through the window event and flag push-boot.js listens to", () => {
    const z = pub("z.js"), boot = pub("push-boot.js");
    expect(z).toContain('window.dispatchEvent(new Event("cb:game-ended"))'); expect(z).toContain("window.__cbGameEnded = true");
    expect((z.match(/tellEnded\(\)/g) ?? []).length).toBeGreaterThanOrEqual(4); // dns, cancelled, ended + its own definition
    expect(boot).toContain('"cb:game-ended"'); expect(boot).toContain("__cbGameEnded");
  });
});

describe("the client, run in a fake browser", () => {
  test("on load: the button and 'Stop notifications' are there, the privacy words and link are there, and there is NO browser question and NO request", async () => {
    const p = page({ api: PUSH });
    p.run("push-optin.js");
    await p.until(() => !!btn(p, "cp-optin__btn"));
    expect(btn(p, "cp-optin__btn").textContent).toBe("Yes, notify me when this game begins");
    expect(btn(p, "cp-optin__stop").textContent).toBe("Stop notifications"); expect(btn(p, "cp-optin__stop").hidden).toBe(false);
    const text = p.box().textContent as string;
    expect(text).toContain("a browser address, not your name, e-mail or phone"); expect(text).toContain("deleted with the game, within 24 hours");
    expect(p.box().querySelector("a").getAttribute("href")).toBe("/privacy.html");
    expect(p.box().querySelector("input[type=checkbox]")).toBeNull(); // no tick box, no "I agree"
    await new Promise((r) => setTimeout(r, 40));
    expect(p.asked()).toBe(0); expect(p.calls).toEqual([]); expect(p.subscribed()).toBe(false);
  });
  test("the tap asks the browser once, then saves ONE subscription for this game's own scope, with only the address and keys (no name, e-mail, phone or cookie)", async () => {
    const p = page({ api: PUSH, query: "?e=GAME-77" });
    p.run("push-optin.js");
    await p.until(() => !!btn(p, "cp-optin__btn"));
    btn(p, "cp-optin__btn").click();
    await p.until(() => p.calls.some((c) => c.url.endsWith("/subscribe")));
    expect(p.asked()).toBe(1);
    const subs = p.calls.filter((c) => c.url.endsWith("/subscribe"));
    expect(subs.length).toBe(1);
    expect(JSON.parse(subs[0]!.init.body)).toEqual({ subscription: { endpoint: p.sub.endpoint, keys: { p256dh: "P256", auth: "AUTH" } }, scope: "game:GAME-77" });
    expect(subs[0]!.init.credentials).toBe("omit"); expect(subs[0]!.init.referrerPolicy).toBe("no-referrer");
    for (const c of p.calls) expect(new URL(c.url).origin).toBe(PUSH); // it talks to the service and to nobody else
    await p.until(() => p.box().querySelector(".cp-optin").getAttribute("data-state") === "on");
    expect(btn(p, "cp-optin__stop").hidden).toBe(false); // Stop is there in every state
  });
  test("'Stop notifications' deletes the saved address at the service and switches the browser's own subscription off", async () => {
    const p = page({ api: PUSH });
    p.run("push-optin.js");
    await p.until(() => !!btn(p, "cp-optin__btn"));
    btn(p, "cp-optin__btn").click();
    await p.until(() => p.subscribed());
    btn(p, "cp-optin__stop").click();
    await p.until(() => p.calls.some((c) => c.url.endsWith("/unsubscribe")));
    expect(JSON.parse(p.calls.find((c) => c.url.endsWith("/unsubscribe"))!.init.body)).toEqual({ endpoint: p.sub.endpoint });
    await p.until(() => !p.subscribed());
  });
  test("a person who says no to the browser's question is not saved and nothing is sent", async () => {
    const p = page({ api: PUSH });
    p.win.Notification.requestPermission = async () => "denied";
    p.run("push-optin.js");
    await p.until(() => !!btn(p, "cp-optin__btn"));
    btn(p, "cp-optin__btn").click();
    await p.until(() => /blocked/i.test(p.box().textContent));
    expect(p.calls).toEqual([]); expect(p.subscribed()).toBe(false);
  });
});

describe("the game page keeps its locked-down scripts and its saved set", () => {
  test("z.html loads the two small files in order and has no inline script (script-src stays 'self')", () => {
    const h = pub("z.html");
    expect(h.indexOf("/push-config.js")).toBeGreaterThan(0); expect(h.indexOf("/push-boot.js")).toBeGreaterThan(h.indexOf("/push-config.js"));
    for (const m of h.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) { expect(m[1]).toMatch(/\bsrc=/); expect(m[2]!.trim()).toBe(""); }
    expect(h).not.toMatch(/push-optin/); // the two client files are only ever loaded by push-boot.js, and only when lit
  });
  test("the service worker saves the two small files but not the client files (so a dark site requests nothing extra), and keeps working if the snippet cannot be read", () => {
    const sw = pub("zsw.js");
    const files: string[] = JSON.parse(sw.match(/const FILES = (\[[\s\S]*?\]);/)![1]!);
    expect(files).toContain("/push-config.js"); expect(files).toContain("/push-boot.js");
    for (const f of files) expect(f).not.toMatch(/push-optin|sw-push-snippet/);
    expect(sw).toMatch(/try \{ importScripts\("\/sw-push-snippet\.js"\); \} catch/);
    expect(Number(/const CACHE = "cb-game-v(\d+)"/.exec(sw)![1])).toBeGreaterThanOrEqual(34);
  });
  test("the build ships all five files and each is under the build's rules", () => {
    const build = readFileSync(join(ROOT, "pages/build.mjs"), "utf8");
    for (const f of ["push-config.js", "push-boot.js", "push-optin.js", "push-optin.css", "sw-push-snippet.js"]) expect(build).toContain(`"${f}"`);
  });
});

describe("the service worker: push and click handlers from the snippet, without a second handler on the same click", () => {
  const snippet = pub("sw-push-snippet.js"), zsw = pub("zsw.js");
  function worker(opts: { importFails?: boolean } = {}) {
    const listeners: Record<string, ((e: any) => void)[]> = {}; const pending: Promise<any>[] = [];
    const shown: any[] = [], opened: string[] = [], navigated: string[] = [], focused: string[] = [];
    const clientList: any[] = [];
    const self: any = {
      addEventListener: (t: string, f: any) => { (listeners[t] ??= []).push(f); },
      location: { origin: "https://bingo.test", href: "https://bingo.test/zsw.js" },
      registration: { showNotification: async (title: string, o: any) => { shown.push({ title, o }); } },
      clients: { matchAll: async () => clientList, openWindow: async (u: string) => { opened.push(u); return {}; }, claim: async () => {} },
    };
    const importScripts = (f: string) => { if (opts.importFails) throw new Error("NetworkError"); expect(f).toBe("/sw-push-snippet.js"); new Function("self", snippet)(self); };
    new Function("self", "importScripts", "caches", "location", zsw)(self, importScripts, {}, self.location);
    const fire = async (type: string, e: any) => { let stopped = false; const ev = { ...e, waitUntil: (p: Promise<any>) => pending.push(Promise.resolve(p)), stopImmediatePropagation: () => { stopped = true; } }; for (const f of listeners[type] ?? []) { if (stopped) break; f(ev); } await Promise.all(pending.splice(0)); };
    const client = (url: string) => { const c = { url, focus: async () => { focused.push(url); }, navigate: async (u: string) => { navigated.push(u); } }; clientList.push(c); return c; };
    return { listeners, shown, opened, navigated, focused, fire, client };
  }
  const click = (tag: string | undefined, url: string) => ({ notification: { tag, data: { url }, close: () => {} } });

  test("a push message is shown with the service's title, text and tag", async () => {
    const w = worker();
    await w.fire("push", { data: { json: () => ({ title: "The game is starting", body: "Tap to join the game now.", url: "https://bingo.corporatetambola.com/z.html?e=G1", tag: "game:G1" }) } });
    expect(w.shown.length).toBe(1);
    expect(w.shown[0].title).toBe("The game is starting"); expect(w.shown[0].o.body).toBe("Tap to join the game now."); expect(w.shown[0].o.tag).toBe("game:G1");
  });
  test("a tap on a 'game begins' notification opens the game ONCE: the snippet handles it and the game's own news handler stands aside", async () => {
    const w = worker();
    await w.fire("notificationclick", click("game:G1", "https://bingo.corporatetambola.com/z.html?e=G1"));
    expect(w.opened).toEqual(["https://bingo.corporatetambola.com/z.html?e=G1"]);
    const other = w.client("https://bingo.test/something-else"); void other;
    await w.fire("notificationclick", click("game:G1", "https://bingo.corporatetambola.com/z.html?e=G1"));
    expect(w.navigated).toEqual([]); // the news handler would have sent the open window there
    expect(w.opened.length).toBe(2); // one new window for the second tap, never two for one tap
  });
  test("a link to any other site opens the home page, never that site", async () => {
    const w = worker();
    await w.fire("notificationclick", click("game:G1", "https://evil.example/x"));
    expect(w.opened).toEqual(["https://bingo.test/"]);
  });
  test("the game's own news notifications still work as before (the open window is taken to the page)", async () => {
    const w = worker(); w.client("https://bingo.test/z.html?e=G1");
    await w.fire("notificationclick", click("news-7", "/pricing.html"));
    expect(w.navigated).toEqual(["/pricing.html"]); expect(w.opened).toEqual([]); // one handler acted: the snippet's click handler did not also open a window
  });
  test("if the snippet cannot be loaded the game's service worker still starts with everything else it does", () => {
    const w = worker({ importFails: true });
    for (const t of ["install", "activate", "fetch", "message", "periodicsync", "notificationclick"]) expect([t, (w.listeners[t] ?? []).length > 0]).toEqual([t, true]);
    expect(w.listeners["push"]).toBeUndefined();
  });
});

describe("the player page's connect-src gets the push address only when one is set, and only that one", () => {
  const CSP = "default-src 'self'; script-src 'self'; connect-src 'self' https://api.drand.sh; frame-ancestors 'none'";
  test("empty: unchanged. Set: the one address is added to connect-src, nothing else is touched (script-src stays 'self')", () => {
    expect(withPushConnect(CSP, "")).toBe(CSP);
    const lit = withPushConnect(CSP, PUSH);
    expect(lit).toBe(CSP.replace("connect-src 'self'", `connect-src 'self' ${PUSH}`));
    expect(lit).toContain("script-src 'self';"); expect(lit.split(PUSH).length).toBe(2);
  });
  test("pushApiOf: empty is dark; a plain https address passes (a trailing slash is dropped); anything else stops the build", () => {
    expect(pushApiOf('window.CBPushConfig = { api: "" };')).toBe("");
    expect(pushApiOf(`window.CBPushConfig = { api: "${PUSH}/" };`)).toBe(PUSH);
    expect(pushApiOf(`window.CBPushConfig = { api: "https://push.example.com:8443" };`)).toBe("https://push.example.com:8443");
    for (const bad of ["http://push.example.com", "https://push.example.com/path", "https://*.example.com", "https://x", "https://a.example.com https://evil.example", "data:text/plain,x", "https://push.example.com;"]) expect(() => pushApiOf(`window.CBPushConfig = { api: "${bad}" };`)).toThrow();
    expect(() => pushApiOf("window.CBPushConfig = {};")).toThrow();
  });
  test("the build reads the same file and adds the address to the player page (/z) only; the other pages keep their rules", () => {
    const b = readFileSync(join(ROOT, "pages/build.mjs"), "utf8");
    expect(b).toContain('pushApiOf(readFileSync(join(SRC, "push-config.js"), "utf8"))');
    expect(b).toContain("const ZCSP = withPushConnect(GAMECSP, PUSH_API)");
    expect(b).toContain('["/z", ZCSP, true]'); expect(b).toContain('["/preview", GAMECSP, true]'); expect(b).toContain('["/demo", GAMECSP, true]');
    expect(b.split("withPushConnect(").length).toBe(2); // called once (the import has no bracket)
  });
  test("while dark, neither headers file mentions a push address, and script-src stays 'self' for the player page", () => {
    const h = pub("_headers");
    const z = h.split("\n").find((l) => l.includes("Content-Security-Policy") && h.indexOf(l) > h.indexOf("/z.html"))!;
    expect(z).toContain("script-src 'self';"); expect(z).not.toMatch(/push/i);
    expect(h).toContain("push-config.js"); // the note that says where the address comes from
  });
});
