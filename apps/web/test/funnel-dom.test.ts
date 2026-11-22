// The sales-funnel reporter as a browser runs it: the real v.js on the real pages, with the real built funnel.js (core's makeReporter) loaded the way the flipped flag loads it,
// and every message it sends handed to the real Worker. Also: with the flag as shipped (funnel.js not loaded) the pages send nothing to the funnel.
import { afterEach, beforeEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { handle } from "../../edge/src/worker";
import { resetRate } from "../../edge/src/visits";
import { setFunnelEnabled } from "../../edge/src/funnel";
import { newWorld, openPage, T, type Page } from "./harness";

setDefaultTimeout(30_000);
let open: Page[] = [];
beforeEach(() => setFunnelEnabled(true));
afterEach(async () => { setFunnelEnabled(false); for (const p of open) await p.close(); open = []; });

/** Opens a public page with a recording sendBeacon; `funnel` loads funnel.js before v.js, which is what the flipped flag does (the page script finds window.CBF). */
async function site(o: { url?: string; html?: string; funnel?: boolean; gpc?: boolean; dnt?: boolean } = {}) {
  resetRate();
  const w = newWorld({ DATA_KEY: "k" });
  const msgs: any[] = [], pending: Promise<unknown>[] = [];
  const p = await openPage(w.world, {
    url: "http://localhost" + (o.url ?? "/"), html: o.html ?? "index.html", scripts: ["common.js", "site.js", ...(o.funnel === false ? [] : ["funnel.js"]), "v.js"],
    afterLoad: (win, file) => {
      if (file !== "common.js") return;
      Object.defineProperty(win.navigator, "sendBeacon", { configurable: true, value: (u: string, data: string | Blob) => {
        const text = typeof data === "string" ? Promise.resolve(data) : data.text();
        pending.push(text.then((t) => { if (u === "/api/f/e") msgs.push(JSON.parse(t)); return handle(new Request("http://localhost" + u, { method: "POST", body: t, headers: { "content-type": "text/plain" } }), w.world.env, w.world.now); }));
        return true;
      } });
      if (o.gpc) Object.defineProperty(win.navigator, "globalPrivacyControl", { configurable: true, value: true });
      if (o.dnt) Object.defineProperty(win.navigator, "doNotTrack", { configurable: true, value: "1" });
    },
  });
  open.push(p);
  const drain = async () => { await new Promise((r) => setTimeout(r, 15)); await Promise.all(pending.splice(0)); };
  const rows = () => (w.world.raw.prepare("SELECT name FROM sqlite_master WHERE name='funnel_event'").get() ? (w.world.raw.prepare("SELECT * FROM funnel_event ORDER BY at_ms, rowid").all() as any[]) : []);
  return { p, drain, msgs, rows };
}
const change = (p: Page, sel: string, v: string) => { const el = p.$(sel); el.value = v; el.dispatchEvent(new p.win.Event("change", { bubbles: true })); };

describe("funnel.js with v.js on the public pages", () => {
  test("viewed on load; choosing a size in the drop-down and in the price card tells size_chosen with the size; Create tells size_chosen and signup_started", async () => {
    const s = await site(); await s.drain();
    expect(s.rows().map((r) => r.event)).toEqual(["viewed"]);
    change(s.p, "#pack", "250"); await new Promise((r) => setTimeout(r, 10)); change(s.p, "#pack2", "2500"); await new Promise((r) => setTimeout(r, 10));
    s.p.click(".pcta"); await s.drain();
    const r = s.rows();
    expect(r.map((x) => x.event).sort()).toEqual(["signup_started", "size_chosen", "viewed"]); // each step once per visit; the second size choice does not count again
    expect(r.find((x) => x.event === "size_chosen")!.size).toBe(250);
    expect(r.every((x) => x.src === "web" && x.game === "bingo" && x.ref === s.msgs[0].visit)).toBe(true);
    expect(s.p.errors).toEqual([]);
  });
  test("the payment page tells payment_page_opened", async () => {
    const s = await site({ url: "/pay", html: "pay.html" }); await s.drain();
    expect(s.rows().map((r) => r.event).sort()).toEqual(["payment_page_opened", "viewed"]);
  });
  test("a message holds only the event, the time, the visit and the allowed fields: the visit id is kept nowhere, no page address", async () => {
    const s = await site(); change(s.p, "#pack", "250"); await new Promise((r) => setTimeout(r, 10)); await s.drain();
    expect(s.msgs.length).toBeGreaterThanOrEqual(2);
    for (const m of s.msgs) { expect(Object.keys(m).every((k) => ["event", "at", "visit", "game", "size", "mode", "reason"].includes(k))).toBe(true); expect(m.visit).toMatch(/^[a-z0-9]{12}$/); }
    expect(JSON.stringify(s.msgs)).not.toMatch(/localhost|http|@|utm_|ref=/);
    const visit = s.msgs[0].visit, ls = s.p.win.localStorage, ss = s.p.win.sessionStorage; // v.js keeps its own visit id for the old visit report; the funnel visit id is kept nowhere
    const stored = [s.p.win.document.cookie, ...Array.from({ length: ls.length }, (_: unknown, i: number) => ls.key(i) + "=" + ls.getItem(ls.key(i))), ...Array.from({ length: ss.length }, (_: unknown, i: number) => ss.key(i) + "=" + ss.getItem(ss.key(i)))].join("|");
    expect(stored).not.toContain(visit); expect(stored).not.toMatch(/funnel|cbf/i);
  });
  test("Global Privacy Control, and Do Not Track: nothing is sent to the funnel and nothing is stored", async () => {
    for (const o of [{ gpc: true }, { dnt: true }]) {
      const s = await site(o); await s.drain(); change(s.p, "#pack", "250"); s.p.click(".pcta"); await s.drain();
      expect(s.msgs).toEqual([]); expect(s.rows()).toEqual([]); expect(s.p.win.CBF.off).toBe(true);
    }
  });
  test("as shipped (funnel.js not loaded) the pages send nothing to the funnel, even with the server flag on", async () => {
    const s = await site({ funnel: false }); change(s.p, "#pack", "250"); s.p.click(".pcta"); await s.drain();
    expect(s.msgs).toEqual([]); expect(s.rows()).toEqual([]);
  });
});
