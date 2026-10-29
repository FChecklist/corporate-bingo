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
