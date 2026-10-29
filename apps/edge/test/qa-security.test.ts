// Findings of the security audit of 2026-10-29 that were fixed (one describe per finding; each test failed on the code of the live commit bd66d3c).
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { withDevice } from "./device";
import { type Env } from "../src/worker";
import { handle } from "./with-terms";
import { makeD1 } from "./d1-sqlite";

const T = Date.UTC(2026, 9, 1, 10, 0, 0);
const FAR_START = Math.floor(((T + 2 * 86_400_000) / 1000 - 1692803367) / 3) + 1;
let env: Env; let raw: ReturnType<typeof makeD1>["raw"];
const call = (method: string, path: string, body?: unknown, key?: string, extra: Record<string, string> = {}, now = T) =>
  handle(new Request("http://x" + path, { method, headers: { "content-type": "application/json", ...(key ? { "x-organizer": key } : {}), ...extra }, body: withDevice(method, path, body) }), env, now);
const j = async (r: Response) => (await r.json()) as any;
let ip = 0;
const start = async (email: string) => (await j(await handle(new Request("http://x/api/start", { method: "POST", headers: { "content-type": "application/json", "cf-connecting-ip": `9.9.9.${++ip}` }, body: JSON.stringify({ email }) }), env, T))).token as string;
beforeEach(() => { const d = makeD1(); raw = d.raw; env = { DB: d.db, ORGANIZER_SECRET: "plat", DAILY_WRITE_BUDGET: "1000000", PUBLIC_ORIGIN: "https://bingo.test", DATA_KEY: "k", PHONE_SALT: "s" } as unknown as Env; });
afterEach(() => {});

const team = async (gid = "SEC-1", cap = 300) => {
  const master = await start("boss@acme.com");
  expect((await call("POST", "/api/z", { id: gid, startRound: FAR_START, callSeconds: 12, cap }, master)).status).toBe(200);
  const host = (await j(await call("POST", "/api/org/host", { mobile: "9876500009", label: "Priya", email: "priya@acme.com" }, master))).hostKey as string;
  return { master, host };
};

describe("S3: a Host's AI work link never gets the report address (it opens every guest's name and number)", () => {
  test("the Host in the console and the Organizer get it; the Host's AI link and the Organizer's AI key do not", async () => {
    const t = await team();
    raw.prepare("INSERT INTO kv(k,v) VALUES(?,?)").run("rpt/SEC-1", JSON.stringify({ stage: "done" })); // the report is ready
    const asMaster = await j(await call("GET", "/api/z/SEC-1/reportlink", undefined, t.master)); expect(asMaster.url).toMatch(/report\.html\?e=SEC-1&k=/);
    const asHost = await j(await call("GET", "/api/z/SEC-1/reportlink", undefined, t.host)); expect(asHost.url).toMatch(/report\.html\?e=SEC-1&k=/);
    const viaLink = await call("GET", "/api/z/SEC-1/reportlink", undefined, t.host, { "x-cb-link": "1" });
    const l = await j(viaLink); expect(l.url).toBeNull(); expect(JSON.stringify(l)).not.toContain("report.html"); expect(l.note).toMatch(/e-mailed to them|organizer/i);
  });
});

describe("S10: the organizer's AI key cannot put a game live, even when a bought pack is waiting", () => {
  test("a game made by the AI key is a draft; the organizer publishes it (consent, report e-mail) and the pack is applied then", async () => {
    const r = await j(await handle(new Request("http://x/api/start", { method: "POST", headers: { "content-type": "application/json", "cf-connecting-ip": "9.9.8.1" }, body: JSON.stringify({ email: "boss@acme.com" }) }), env, T));
    const master = r.token as string, ai = r.aiKey as string;
    expect((await call("POST", "/api/z", { id: "SEC-M", startRound: FAR_START, callSeconds: 12, cap: 100 }, master)).status).toBe(200);
    const org = (raw.prepare("SELECT org FROM engagement WHERE id='SEC-M'").get() as any).org;
    raw.prepare("INSERT INTO entitlement(id,org,pack,payment_id,eid,created_ms) VALUES('ent_s10',?,250,'p',NULL,?)").run(org, T); // a pack bought earlier, not used yet
    const made = await j(await call("POST", "/api/z", { id: "SEC-AI", startRound: FAR_START, callSeconds: 12, cap: 100 }, ai));
    expect(made.draft).toBe(true); // old code: false, the game was live at once
    expect((raw.prepare("SELECT pack FROM engagement WHERE id='SEC-AI'").get() as any).pack).toBe(0);
    expect((raw.prepare("SELECT eid FROM entitlement WHERE id='ent_s10'").get() as any).eid).toBeNull(); // the pack is not used up
    expect((await call("POST", "/api/z/SEC-AI/join", { name: "Stranger" })).status).toBe(403); // nobody can join a draft
    expect(raw.prepare("SELECT 1 FROM kv WHERE k='contact/SEC-AI'").get()).toBeNull();
    const pub = await j(await call("POST", "/api/z/SEC-AI/publish", { email: "boss@acme.com", phone: "98765 43210" }, master)); // the organizer, with the Terms ticked
    expect(pub.published).toBe(true); expect(pub.paid).toBe(true); // the waiting pack is applied at publishing
    expect((raw.prepare("SELECT eid FROM entitlement WHERE id='ent_s10'").get() as any).eid).toBe("SEC-AI");
    expect(raw.prepare("SELECT 1 FROM kv WHERE k='contact/SEC-AI'").get()).not.toBeNull(); // the report goes to this address
  });
});

describe("S15: a Co-host can open the small game header of a free 10-person game (it crashed with a 500)", () => {
  test("the header answers 200 with a price of 0 for a 10-person game, drafted or published", async () => {
    const master = await start("boss@acme.com");
    expect((await call("POST", "/api/z", { id: "SEC-10", startRound: FAR_START, callSeconds: 12, cap: 10 }, master)).status).toBe(200);
    const cohost = (await j(await call("POST", "/api/org/cohost", { label: "Ravi", phone: "9876500001", e: "SEC-10" }, master))).cohostKey as string;
    const draft = await call("GET", "/api/z/SEC-10/cohost", undefined, cohost); expect(draft.status).toBe(200); expect((await j(draft)).price).toBe(0); // old code: Rs 2,399, the 100-person price
    expect((await call("POST", "/api/z/SEC-10/publish", { email: "boss@acme.com", phone: "98765 43210" }, master)).status).toBe(200);
    const live = await call("GET", "/api/z/SEC-10/cohost", undefined, cohost); expect(live.status).toBe(200); expect((await j(live)).price).toBe(0); // old code: 500
  });
});
