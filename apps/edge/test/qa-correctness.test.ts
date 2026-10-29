// Findings of the correctness audit of 2026-10-29 that were fixed (one describe per finding; each test failed before the fix).
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
const start = async (email = "boss@acme.com") => (await j(await handle(new Request("http://x/api/start", { method: "POST", headers: { "content-type": "application/json", "cf-connecting-ip": `9.8.7.${++ip}` }, body: JSON.stringify({ email }) }), env, T))).token as string;
const PUB = { email: "boss@acme.com", phone: "98765 43210" };
const row = (sql: string, ...a: unknown[]) => raw.prepare(sql).get(...a) as any;
beforeEach(() => { const d = makeD1(); raw = d.raw; env = { DB: d.db, ORGANIZER_SECRET: "plat", DAILY_WRITE_BUDGET: "1000000", PUBLIC_ORIGIN: "https://bingo.test", DATA_KEY: "k", PHONE_SALT: "s" } as unknown as Env; });
afterEach(() => {});
/** A pack of `pack` bought earlier and not used yet. */
const giveBoughtPack = (id: string, pack: number) => raw.prepare("INSERT INTO entitlement(id,org,pack,payment_id,eid,created_ms) VALUES(?,(SELECT org FROM engagement WHERE id=?),?,'p',NULL,?)").run("ent_" + id, id, pack, T);

describe("C10: a game for 10 people or fewer never uses up a bought pack", () => {
  test("made and published with a 500 pack waiting: Rs 0, the pack is still there; a bigger game does use it", async () => {
    const master = await start();
    expect((await call("POST", "/api/z", { id: "C10-SEED", startRound: FAR_START, callSeconds: 12, cap: 100 }, master)).status).toBe(200);
    giveBoughtPack("C10-SEED", 500);
    const small = await j(await call("POST", "/api/z", { id: "C10-A", startRound: FAR_START, callSeconds: 12, cap: 10 }, master));
    expect(small.draft).toBe(true); // old code: false, the 500 pack was attached to a 10-person game
    expect(row("SELECT eid FROM entitlement WHERE id='ent_C10-SEED'").eid).toBeNull();
    const pub = await j(await call("POST", "/api/z/C10-A/publish", PUB, master)); expect(pub.paid).toBe(true);
    expect(row("SELECT pack FROM engagement WHERE id='C10-A'").pack).toBe(10); // the free pack of its own size
    expect(row("SELECT eid FROM entitlement WHERE id='ent_C10-SEED'").eid).toBeNull(); // old code: the publish used it
    const big = await j(await call("POST", "/api/z", { id: "C10-B", startRound: FAR_START, callSeconds: 12, cap: 100 }, master));
    expect(big.draft).toBe(false); expect(row("SELECT eid FROM entitlement WHERE id='ent_C10-SEED'").eid).toBe("C10-B"); // a 100-person game still takes it
  });
});
