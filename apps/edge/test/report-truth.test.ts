// What the end-of-game report says must be true (QA 2026-10-29, found by tools/qa-model.mjs in the 10-person demo run).
//   1. The organizer's company name and logo are printed on the report (owner order 2026-10-09). The report data was built from a copy of the settings that dropped the brand.
//   2. A game that ended because every prize was won must say so and give the real number of numbers called, not "All numbers were called" and 75.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { endBoundMs, lifecycleTick, cfgOfRow, roundMs } from "../src/lifecycle";
import { GRACE_ROUNDS } from "../../../packages/beacon/src/config";
import { callRoundR } from "../../../packages/beacon/src/game";
import { publicKeyFromSecret, signControlWithSecret } from "../../../packages/beacon/src/control";
import { lazyTickReset } from "../src/worker";
import { sentReports } from "../src/pay";
import { HOUR, MIN, T, W, call, create, j, join, one, reset, restore, startIn, uid } from "./param-harness";

beforeEach(() => { reset(); lazyTickReset(); sentReports.length = 0; });
afterEach(restore);

const BRAND = { name: "Acme Foods", color: "#B3261E" };
/** A game that was played (it began two hours before T) with `n` players, an organizer e-mail on record and the given settings. */
async function played(over: Record<string, unknown> = {}, n = 3) {
  const id = uid("RPT");
  expect((await create(undefined, id, { startRound: startIn(-2 * HOUR), callSeconds: 12, cap: 100, ...over })).status).toBe(200);
  await W.env.DB.prepare("INSERT INTO kv(k,v) VALUES(?,?)").bind(`contact/${id}`, JSON.stringify({ email: "boss@acme.com", phone: "9811122233" })).run();
  for (let i = 1; i <= n; i++) expect((await join(id, i, {}, T - 3 * HOUR)).status).toBe(200);
  return { id, bound: await endBoundMs(W.env as any, one("SELECT * FROM engagement WHERE id=?", id)) };
}
/** Ticks until the report mail is sent, then opens the report's base data the way the report page does. */
async function openReport(id: string, at: number) {
  let guard = 0; while (!sentReports.length && guard++ < 20) await lifecycleTick(W.env as any, at + 5 * MIN);
  expect(sentReports.length).toBe(1);
  const m = sentReports[0]!.text.match(/report\.html\?e=([A-Za-z0-9_-]+)&k=([0-9a-f]+)/)!; expect(m[1]).toBe(id);
  const r = await call("GET", `/api/report/${id}?k=${m[2]}&part=base`, undefined, {}, at + 10 * MIN); expect(r.status).toBe(200);
  return (await j(r)).base;
}

describe("the report carries the organizer's brand", () => {
  test("cfgOfRow (the settings the report is built from) keeps the game name, the brand and the brand moments", () => {
    const row = { tickets: 1, config: JSON.stringify({ name: "Friday Bingo", brand: BRAND, opening: [{ kind: "speech", title: "Welcome", seconds: 30 }], closing: [{ kind: "speech", title: "Thanks" }], rewards: [{ pattern: "line", scope: "ticket", ordinal: 1, text: "Hamper" }] }) };
    const c = cfgOfRow(row);
    expect(c.name).toBe("Friday Bingo"); expect(c.brand?.name).toBe("Acme Foods"); expect(c.opening.length).toBe(1); expect(c.closing.length).toBe(1);
  });
  test("the report data of a played game has the brand name", async () => {
    const g = await played({ brand: BRAND, name: "Friday Bingo" });
    const base = await openReport(g.id, g.bound);
    expect(base.brand?.name).toBe("Acme Foods");
  });
  test("a game with no brand has none (nothing invented)", async () => {
    const g = await played({});
    const base = await openReport(g.id, g.bound);
    expect(base.brand).toBeUndefined();
  });
});

describe("the report says how the game really ended", () => {
  /** The phones agreed the game ended with call number `k` (1-based) of 75; one prize was won at that call. */
  async function endedAtCall(k: number, sec = 5) {
    const g = await played({ rewards: [{ pattern: "line", ordinal: 1, text: "Hamper" }] });
    const e = one("SELECT * FROM engagement WHERE id=?", g.id);
    const callAt = roundMs(e.start_round + GRACE_ROUNDS) + (k - 1) * 12_000; // call k happens (k - 1) gaps after the first number
    W.raw.prepare("INSERT OR REPLACE INTO life(eid,end_ms,end_src) VALUES(?,?, 'phones')").run(g.id, callAt + sec * 1000);
    W.raw.prepare("INSERT INTO winner(eid,round,pattern,ordinal,seat,idx,at_ms,src) VALUES(?,?,?,?,?,?,?,?)").run(g.id, 1, "line", 1, 1, k - 1, callAt, "phones");
    return { g, base: await openReport(g.id, callAt + sec * 1000) };
  }
  test("every prize won at number 63 of 75: the report says it ended early and that 63 numbers were called", async () => {
    const { base } = await endedAtCall(63);
    expect(base.endReason).toMatch(/Every prize was awarded/); expect(base.numbersCalled).toBe(63);
  });
  test("won at number 40: the same (the old five-minute margin missed games that ended up to 24 numbers early at 12 s)", async () => {
    const { base } = await endedAtCall(40);
    expect(base.endReason).toMatch(/Every prize was awarded/); expect(base.numbersCalled).toBe(40);
  });
  test("the last prize won at the last number: all 75 were called, no 'ended early'", async () => {
    const { base } = await endedAtCall(75);
    expect(base.endReason).toMatch(/All numbers were called/); expect(base.numbersCalled).toBe(75);
  });
  test("won at number 74, one number short: it did end early, and the report says 74", async () => {
    const { base } = await endedAtCall(74);
    expect(base.endReason).toMatch(/Every prize was awarded/); expect(base.numbersCalled).toBe(74);
  });
});

describe("the report counts the numbers that were really called (correctness audit C1)", () => {
  const playedLong = async (over: Record<string, unknown>) => { // began 5 hours before T so that two rounds fit
    const id = uid("RPT");
    expect((await create(undefined, id, { startRound: startIn(-5 * HOUR), callSeconds: 12, cap: 100, ...over })).status).toBe(200);
    await W.env.DB.prepare("INSERT INTO kv(k,v) VALUES(?,?)").bind(`contact/${id}`, JSON.stringify({ email: "boss@acme.com", phone: "9811122233" })).run();
    for (let i = 1; i <= 3; i++) expect((await join(id, i, {}, T - 6 * HOUR)).status).toBe(200);
    return { id, e: one("SELECT * FROM engagement WHERE id=?", id) };
  };
  test("the organizer stopped the game at number 30: it says so, 30 numbers, and the timeline has no row after the stop", async () => {
    const { id, e } = await playedLong({ rewards: [{ pattern: "line", ordinal: 1, text: "Hamper" }] });
    const first = e.start_round + GRACE_ROUNDS, stride = 4, stopAt = first + 30 * stride, secret = "11".repeat(32), lead = 20;
    const msg = signControlWithSecret(secret, { engagementId: id, seq: 1, action: "stop", atBeaconRound: stopAt, signedAtRound: stopAt - lead });
    await W.env.DB.prepare("INSERT INTO kv(k,v) VALUES(?,?)").bind(`control/${id}.json`, JSON.stringify({ v: 1, engagementId: id, pubKey: publicKeyFromSecret(secret), maxPauseRounds: 600, leadRounds: lead, messages: [msg] })).run();
    const stopMs = roundMs(stopAt);
    W.raw.prepare("INSERT OR REPLACE INTO life(eid,end_ms,end_src) VALUES(?,?, 'phones')").run(id, stopMs + 5000);
    const base = await openReport(id, stopMs + 5000);
    expect(base.endReason).toMatch(/organizer ended the game/i); expect(base.numbersCalled).toBe(30);
    expect(base.timeline.length).toBeGreaterThan(0); for (const t of base.timeline) { expect(t.atMs).toBeGreaterThan(Date.UTC(2020, 0, 1)); expect(t.callNo).toBeLessThanOrEqual(30); } // old code: six rows dated 1970
  });
  test("two rounds, the second ended at number 41: 41 numbers in the last round (not the highest number of either round)", async () => {
    const { id, e } = await playedLong({ rounds: 2, rewards: [{ pattern: "line", ordinal: 1, text: "Hamper" }] });
    const start = e.start_round + GRACE_ROUNDS, at = (round: number, idx: number) => roundMs(callRoundR(null, start, 4, [], round, idx)!);
    W.raw.prepare("INSERT OR REPLACE INTO life(eid,end_ms,end_src) VALUES(?,?, 'phones')").run(id, at(2, 40) + 5000);
    W.raw.prepare("INSERT INTO winner(eid,round,pattern,ordinal,seat,idx,at_ms,src) VALUES(?,?,?,?,?,?,?,?)").run(id, 1, "line", 1, 1, 70, at(1, 70), "phones");
    W.raw.prepare("INSERT INTO winner(eid,round,pattern,ordinal,seat,idx,at_ms,src) VALUES(?,?,?,?,?,?,?,?)").run(id, 2, "line", 1, 2, 40, at(2, 40), "phones");
    const base = await openReport(id, at(2, 40) + 5000);
    expect(base.numbersCalled).toBe(41); // old code: 71
  });
  test("the phones ended the game at number 40 but no winner was recorded: it does not claim every prize was awarded", async () => {
    const { id, e } = await playedLong({ rewards: [{ pattern: "line", ordinal: 1, text: "Hamper" }] });
    const start = e.start_round + GRACE_ROUNDS, at = roundMs(callRoundR(null, start, 4, [], 1, 39)!);
    W.raw.prepare("INSERT OR REPLACE INTO life(eid,end_ms,end_src) VALUES(?,?, 'phones')").run(id, at + 5000);
    const base = await openReport(id, at + 5000);
    expect(base.numbersCalled).toBe(40); expect(base.endReason).not.toMatch(/Every prize was awarded/); expect(base.endReason).toMatch(/ended early/i); // old code: "Every prize was awarded" and 1
  });
  test("the people table counts from number 1 to number 75 (it printed 0 to 74)", async () => {
    const g = await played({});
    const base = await openReport(g.id, g.bound);
    expect(base.timeline.map((t: any) => t.callNo)).toEqual([1, 9, 17, 25, 33, 41, 49, 57, 65, 75]);
  });
});
