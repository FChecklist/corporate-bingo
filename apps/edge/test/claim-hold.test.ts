// CLAIM HOLD (owner order, 1 Nov 2026): while a claim is checked the game waits for everyone, then goes on for everyone. Off unless CLAIM_HOLD=1.
// Every phone gets the same hold intervals through the control file, so every phone works out the same call times (identical logs).
import { beforeEach, describe, expect, setDefaultTimeout, test } from "bun:test";
setDefaultTimeout(60_000);
import { withDevice } from "./device";
import { type Env } from "../src/worker";
import { handle } from "./with-terms";
import { makeD1 } from "./d1-sqlite";
import { ControlTracker, SAFETY_STANDARD, callRound, nextMessage, publicKeyFromSecret, readPublished, signControlWithSecret, type KV } from "../../../packages/beacon/src/control";
import { CHECK_ROUNDS } from "../src/claimhold";
import { callTimeMs } from "../src/lifecycle";

const T = Date.UTC(2026, 9, 1, 10, 0, 0);
const roundAt = (ms: number) => Math.floor((ms / 1000 - 1692803367) / 3) + 1;
const START = roundAt(T) + 2400, AT = T + 2 * 3_600_000, ORG = "11".repeat(32);
let env: Env; let raw: ReturnType<typeof makeD1>["raw"];
const call = (method: string, path: string, body?: unknown, headers: Record<string, string> = {}, now = T) =>
  handle(new Request("http://x" + path, { method, headers: { "content-type": "application/json", ...headers }, body: withDevice(method, path, body) }), env, now);
const j = async (r: Response) => (await r.json()) as any;
const P = { "x-organizer": "plat" };
const kv = (): KV => ({ get: async (k) => (raw.query("SELECT v FROM kv WHERE k=?").get(k) as any)?.v ?? null, put: async () => {} });
const setup = async (flag: boolean, id = "CH-1") => {
  const d = makeD1(); raw = d.raw; env = { DB: d.db, ORGANIZER_SECRET: "plat", RUNNER_KEY: "test-runner-key-test-runner-key-test0000", DAILY_WRITE_BUDGET: "1000000", PUBLIC_ORIGIN: "http://localhost", JOIN_PER_IP_DAY: "1000000", JOIN_PER_IP_MINUTE: "1000000", ...(flag ? { CLAIM_HOLD: "1" } : {}) } as any;
  expect((await call("POST", "/api/z", { id, startRound: START, callSeconds: 9, cap: 100 }, P)).status).toBe(200);
  raw.prepare("UPDATE engagement SET pack=100 WHERE id=?").run(id);
  expect((await call("PUT", `/api/z/${id}/control/key`, { publicKey: publicKeyFromSecret(ORG) }, P)).status).toBe(200);
  const pids: string[] = []; for (let i = 1; i <= 3; i++) pids.push((await j(await call("POST", `/api/z/${id}/join`, { phone: "981000000" + i, name: "P" + i }))).pid);
  return pids;
};
const claim = (pid: string, idx: number, now: number, id = "CH-1") => call("POST", `/api/z/${id}/claims`, { pid, device: "0".repeat(32), claims: [{ pattern: "line", idx }] }, {}, now);
const control = async (now: number, id = "CH-1") => j(await call("GET", `/api/z/${id}/control`, undefined, {}, now));
const settle = () => raw.prepare("INSERT INTO settled(eid,pattern,ordinal,round,idx,pids) VALUES('CH-1','line',1,1,1,'[]')").run();
const NOW = AT + 10_000;

describe("claim hold", () => {
  test("off by default: a claim changes nothing for the game", async () => {
    const [a] = await setup(false); expect((await claim(a!, 1, NOW)).status).toBe(200);
    expect((await control(NOW + 1000)).holds).toBeUndefined();
  });
  test("a claim pauses the game for 3 phones alike: the same hold, the same call times, no number while the claim is checked", async () => {
    const [a] = await setup(true); expect((await claim(a!, 1, NOW)).status).toBe(200);
    const body = await control(NOW + 1000); expect(body.holds).toHaveLength(1);
    const h = body.holds[0], lead = body.leadRounds; expect(h.start).toBe(roundAt(NOW) + lead); expect(h.end - h.start).toBe(20); // starts after the safe lead, 60 s at most
    const phones = [0, 1, 2].map((i) => new ControlTracker({ pubKey: body.pubKey, maxPauseRounds: body.maxPauseRounds, leadRounds: lead }, "CH-1", SAFETY_STANDARD, h.start - 5 + i));
    for (const p of phones) expect(await p.ingest(roundAt(NOW), body)).toBe(true);
    const logs = phones.map((p) => Array.from({ length: 75 }, (_, k) => callRound(p.state, START, 3, k)));
    expect(logs[1]).toEqual(logs[0]); expect(logs[2]).toEqual(logs[0]);
    const base = (k: number) => START + k * 3, inside = logs[0]!.filter((r, k) => base(k) >= h.start && base(k) < h.end);
    expect(inside.length).toBeGreaterThan(0); for (const r of inside) expect(r! >= h.end).toBe(true);
    expect(phones[0]!.holds).toEqual([h]);
  });
  test("accepted: a prize is settled, the hold ends and the game goes on for everyone a moment later", async () => {
    const [a] = await setup(true); await claim(a!, 1, NOW);
    const open = (await control(NOW + 1000)).holds[0]; expect(open.end - open.start).toBe(20);
    settle(); const t = open.start * 3 * 1000 + 1692803367 * 1000 + 1000, after = (await control(t)).holds[0];
    expect(after.end).toBeLessThan(open.end); expect(after.end).toBeGreaterThan(after.start); expect(after.end - roundAt(t)).toBeLessThanOrEqual(1);
  });
  test("checked and not accepted: when the check window is over the game goes on by itself, so it can never stay stuck", async () => {
    const [a] = await setup(true); await claim(a!, 1, NOW);
    const first = (await control(NOW + 2000)).holds[0], later = (await control(NOW + 3 * 60_000)).holds[0];
    expect(later.start).toBe(first.start); expect(later.end - later.start).toBeLessThanOrEqual(CHECK_ROUNDS + 1);
    const e = raw.query("SELECT * FROM engagement WHERE id='CH-1'").get() as any;
    const t75 = await callTimeMs(env as any, e, 1, 74); expect(t75).not.toBeNull(); // the schedule is finite again
  });
  test("two claims at once wait in line: one hold, and it holds a longer check window", async () => {
    const [a, b] = await setup(true); await claim(a!, 1, NOW); await claim(b!, 2, NOW + 500);
    expect((await control(NOW + 1000)).holds).toHaveLength(1);
    const rec = JSON.parse((raw.query("SELECT v FROM kv WHERE k='chold/CH-1'").get() as any).v); expect(rec.iv[0].k).toBe(2);
    const mid = (await control(NOW + 1500)).holds[0]; expect(mid.end - mid.start).toBe(20);
  });
  test("the Organizer's pause is untouched: a signed pause still works beside a hold", async () => {
    const [a] = await setup(true); await claim(a!, 1, NOW);
    const m = signControlWithSecret(ORG, nextMessage((await readPublished(kv(), "CH-1"))!, roundAt(NOW), { action: "pause", pauseForRounds: 5 }));
    expect((await call("POST", "/api/z/CH-1/control", { message: m }, {}, NOW)).status).toBe(200);
    const body = await control(NOW + 1000); expect(body.messages).toHaveLength(1); expect(body.holds).toHaveLength(1);
  });
});
