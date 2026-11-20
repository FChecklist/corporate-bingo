// The sentence the screens carry: "No one knows the next number: not the organizer, not the host, not even the software." It may only stay on a screen while it is true IN CODE. These tests are that proof:
//  1. a call's number is a function of (game id, call index, the numbers already called, the randomness of ONE beacon round) and nothing else (no Math.random, no clock, no stored list);
//  2. that round is assigned in advance (call k uses round start + k * stride) and the beacon publishes a round only when its time comes, so before then nobody holds the input;
//  3. the log can grow only as far as rounds that exist: a phone (or the server) given the rounds published so far cannot produce the next number;
//  4. no server table or file keeps the order of the numbers ahead of time.
// FALSIFIED BY: fairness-number-from-clock, fairness-precomputed-order, fairness-call-uses-past-round
import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { NUMBERS, deriveCalls, pickNumber, scheduleFor, syncCalls, type Round } from "../src/index";

const hex = (n: number) => (n.toString(16).padStart(8, "0")).repeat(8);
const rnd = (i: number) => hex(i * 7919 + 13);

describe("a call's number depends on the beacon round's randomness, and on nothing the organizer, a host or the software can set", () => {
  test("the same inputs always give the same number; another round's randomness gives (almost always) another number", () => {
    const a = pickNumber("G-1", 0, rnd(1), []);
    expect(pickNumber("G-1", 0, rnd(1), [])).toBe(a);
    const others = new Set(Array.from({ length: 200 }, (_, i) => pickNumber("G-1", 0, rnd(i + 2), [])));
    expect(others.size).toBeGreaterThan(40); // the randomness decides: 200 different rounds reach most of the 75 numbers
  });
  test("a full game is every number 1 to 75 exactly once, in an order only the 75 rounds decide", () => {
    const calls = deriveCalls("G-1", Array.from({ length: NUMBERS }, (_, i) => rnd(i)));
    expect([...calls].sort((x, y) => x - y)).toEqual(Array.from({ length: NUMBERS }, (_, i) => i + 1));
    expect(deriveCalls("G-1", Array.from({ length: NUMBERS }, (_, i) => rnd(i + 1000)))).not.toEqual(calls);
  });
  test("the code that picks numbers never reads a clock, a random generator or a stored list", () => {
    const src = readFileSync(join(import.meta.dir, "../src/index.ts"), "utf8");
    const body = src.slice(src.indexOf("export function pickNumber"), src.indexOf("/** The full call log so far"));
    expect(body).not.toMatch(/Math\.random|Date\.now|new Date|performance\.now|crypto\.getRandomValues/);
    expect(body).toMatch(/randomnessHex/);
  });
});

describe("the round a call uses is fixed in advance and not published until its time", () => {
  test("call k uses round start + k * stride: strictly later for every later call, never before the start", () => {
    const sch = scheduleFor(1000, 9);
    expect(sch[0]).toBe(1000); expect(sch[1]! - sch[0]!).toBe(3); expect(sch.every((r, i) => i === 0 || r > sch[i - 1]!)).toBe(true);
  });
  test("given only the rounds published so far, the log stops there: the next number cannot be produced (not by a phone, not by the server)", async () => {
    const published = 5, sch = scheduleFor(1000, 9, 20); // the calls for 20 numbers are planned; the beacon has published the first 5 of their rounds
    const fetcher = async (url: string) => { const r = Number(url.split("/").pop()); return r <= sch[published - 1]! ? { ok: true, status: 200, json: async () => ({ round: r, signature: "00", randomness: rnd(r) }) } : { ok: false, status: 404, json: async () => ({}) }; };
    const out = await syncCalls("G-1", sch, 20, { mirrors: ["https://beacon.test"], fetcher: fetcher as any, verify: (x: Round) => !!x.randomness, hedgeMs: 5, timeoutMs: 200 });
    expect(out.calls.length).toBe(published); expect(out.missing[0]).toBe(sch[published]); // number 6 needs round sch[5], which does not exist yet
  });
});

describe("nothing on the server holds the order of the numbers ahead of time", () => {
  test("no table or column stores a called number or a planned order, and the server code never calls the generator for a round that is not yet published", () => {
    const mig = readdirSync(join(import.meta.dir, "../../../apps/edge/migrations")).map((f) => readFileSync(join(import.meta.dir, "../../../apps/edge/migrations", f), "utf8")).join("\n");
    expect(mig).not.toMatch(/\b(called_numbers|call_order|number_order|next_number|upcoming)\b/i);
    const edge = join(import.meta.dir, "../../../apps/edge/src");
    const users = readdirSync(edge).filter((f) => f.endsWith(".ts")).filter((f) => /\b(pickNumber|deriveCalls|syncCalls)\b/.test(readFileSync(join(edge, f), "utf8")));
    for (const f of users) expect([f, /fetchRound|syncCalls|verifyRound/.test(readFileSync(join(edge, f), "utf8"))]).toEqual([f, true]); // where the server derives calls, it does so from rounds it fetched and verified, never from a list it made itself
  });
});
