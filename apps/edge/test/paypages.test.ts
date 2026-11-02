// The three payment pages (pay, paylink, paytest) and the Worker answers behind them (docs: Boss order 2 Nov 2026, "payment pages redesign", pilot on Bingo):
//   - the owner key is checked by the real server BEFORE any payment (GET /api/payments/paytest/key), and a wrong key is the same plain 404 on every address (ONE switch: paytest-gate.ts)
//   - the game block (name, game ID, participants, start time, organizer with a MASKED e-mail) comes from the server for the pay link and for the owner's test
//   - the browser field names (payfields.js) are exactly the Worker's (payfields.ts), so the work that records the game ID on a payment merges without touching these lines
// Everything runs through the real Worker with a real SQLite D1.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { type Env } from "../src/worker";
import { handle } from "./with-terms";
import type { PayEnv } from "../src/pay";
import { PAY_FIELDS, GAME_ID_RE } from "../src/payfields";
import { PAYTEST_OWNER_ONLY, paytestBlocked } from "../src/paytest-gate";
import { maskEmail, startMsOfRound } from "../src/paysummary";
import { packFor } from "../src/paylink";
import { makeD1 } from "./d1-sqlite";

const T = Date.UTC(2026, 9, 8, 10, 0, 0), H = 3_600_000;
const START = Math.floor(((T + 3 * H) / 1000 - 1692803367) / 3) + 1; // the game starts 3 hours after T
let env: PayEnv; let raw: ReturnType<typeof makeD1>["raw"]; let ipN = 0;
const call = (method: string, path: string, body?: unknown, key?: string, extra: Record<string, string> = {}) =>
  handle(new Request("http://x" + path, { method, headers: { "content-type": "application/json", "cf-connecting-ip": "2.2.2.2", ...(key ? { "x-organizer": key } : {}), ...extra }, body: body === undefined ? undefined : JSON.stringify(body) }), env as Env, T);
const j = async (r: Response) => (await r.json()) as any;

beforeEach(() => {
  const d = makeD1(); raw = d.raw;
  env = { DB: d.db, ORGANIZER_SECRET: "plat", DAILY_WRITE_BUDGET: "1000000", RAZORPAY_KEY_ID: "rzp_test_x", RAZORPAY_KEY_SECRET: "sek", RAZORPAY_WEBHOOK_SECRET: "whsec", RAZORPAY_BASE_URL: "https://rzp.test/v1", PUBLIC_ORIGIN: "https://bingo.test", OWNER_EMAIL: "owner@platform.test", DATA_KEY: "dk" } as PayEnv;
});
afterEach(() => {});

/** An organizer with one game, GAME-ONE (300 people), named "Diwali Bingo". */
const organizer = async () => {
  const st = await j(await handle(new Request("http://x/api/start", { method: "POST", headers: { "content-type": "application/json", "cf-connecting-ip": `9.9.9.${++ipN}` }, body: JSON.stringify({ email: "jaya.menon@company.com" }) }), env as Env, T));
  const master = st.token as string;
  const made = await call("POST", "/api/z", { id: "GAME-ONE", startRound: START, callSeconds: 9, cap: 300, name: "Diwali Bingo" }, master);
  expect(made.status, JSON.stringify(await made.clone().json())).toBe(200);
  return master;
};

describe("the one switch and the field names", () => {
  test("the owner-only switch is on, and refuses exactly the paytest addresses to anybody but the owner", () => {
    expect(PAYTEST_OWNER_ONLY).toBe(true);
    for (const p of ["/api/payments/paytest", "/api/payments/paytest/key", "/api/payments/paytest/game/ABCD-1", "/api/payments/paytest/pay_0000000000000000"]) { expect([p, paytestBlocked(p, false)]).toEqual([p, true]); expect([p, paytestBlocked(p, true)]).toEqual([p, false]); }
    for (const p of ["/api/payments/verify", "/api/payments/paytestx", "/api/paylink/abc", "/api/z/GAME-ONE/info"]) expect([p, paytestBlocked(p, false)]).toEqual([p, false]);
  });
  test("the browser file lists exactly the field names the Worker uses (payfields.js = payfields.ts)", () => {
    const win: any = {}; new Function("window", readFileSync(new URL("../../web/public/payfields.js", import.meta.url), "utf8"))(win);
    expect(win.PAYFIELDS).toBeDefined();
    expect({ ...win.PAYFIELDS }).toEqual({ ...PAY_FIELDS });
    expect(PAY_FIELDS.gameId).toBe("gameId");
  });
  test("a game ID is 4 to 40 letters, digits, - or _", () => {
    for (const ok of ["ABCD", "GAME-ONE", "acme_diwali-2026", "x".repeat(40)]) expect([ok, GAME_ID_RE.test(ok)]).toEqual([ok, true]);
    for (const bad of ["abc", "", "x".repeat(41), "has space", "a/b/c/d", "é-game"]) expect([bad, GAME_ID_RE.test(bad)]).toEqual([bad, false]);
  });
});

describe("masking the organizer's e-mail", () => {
  test("first letter, three stars, the domain; anything that is not an address gives nothing", () => {
    expect(maskEmail("jaya.menon@company.com")).toBe("j***@company.com");
    expect(maskEmail("  Rajat@x.in ")).toBe("R***@x.in");
    for (const bad of ["", "nobody", "@x.com", "a@", null, undefined, 42]) expect([String(bad), maskEmail(bad)]).toEqual([String(bad), ""]);
  });
});

describe("the owner key is checked by the server before any payment", () => {
  test("the owner's key is accepted: 200, and nothing is written or paid", async () => {
    const before = (raw.prepare("SELECT COUNT(*) c FROM payment").get() as any).c;
    const r = await call("GET", "/api/payments/paytest/key", undefined, "plat");
    expect(r.status).toBe(200); expect((await j(r)).ok).toBe(true);
    expect((raw.prepare("SELECT COUNT(*) c FROM payment").get() as any).c).toBe(before);
  });
  test("no key, a wrong key, an ordinary organizer's key and a work link all get the same plain 404 Not found, on every paytest address", async () => {
    const k = await organizer();
    const paths: [string, string][] = [["GET", "/api/payments/paytest/key"], ["GET", "/api/payments/paytest/game/GAME-ONE"], ["POST", "/api/payments/paytest"], ["GET", "/api/payments/paytest/pay_0000000000000000"]];
    const seen = new Set<string>();
    for (const [m, p] of paths) {
      for (const [key, extra] of [[undefined, {}], ["wrong", {}], [k, {}], ["plat", { "x-cb-link": "1" }]] as [string | undefined, Record<string, string>][]) {
        const r = await call(m, p, m === "POST" ? { name: "A B", email: "a@b.in", country: "IN" } : undefined, key, extra);
        seen.add(r.status + " " + JSON.stringify(await r.json()));
      }
    }
    expect([...seen]).toEqual(['404 {"error":"Not found"}']); // one answer everywhere: nothing tells a guesser whether a key was close
  });
});

describe("the owner's test can show the game it is for", () => {
  test("a game ID shows the game: name, ID, participants (the pack), the start time, and the organizer with the e-mail masked; the full address never leaves", async () => {
    const k = await organizer();
    raw.prepare("INSERT INTO kv(k,v) VALUES(?,?)").run("contact/GAME-ONE", JSON.stringify({ name: "Jaya Menon", email: "jaya.menon@company.com" }));
    const r = await call("GET", "/api/payments/paytest/game/GAME-ONE", undefined, "plat");
    const b = await j(r); expect(r.status, JSON.stringify(b)).toBe(200);
    expect(b.game).toMatchObject({ id: "GAME-ONE", name: "Diwali Bingo", participants: packFor(300), startMs: startMsOfRound(START), organizer: { name: "Jaya Menon", email: "j***@company.com" } });
    expect(JSON.stringify(b)).not.toContain("jaya.menon@company.com");
    expect(k).toBeTruthy();
  });
  test("an unknown or malformed game ID is a calm 404 with the code no-game (different from a wrong key, which has none)", async () => {
    await organizer();
    for (const id of ["NOPE-9999", "ab", "bad%20id%21"]) {
      const r = await call("GET", "/api/payments/paytest/game/" + id, undefined, "plat");
      expect([id, r.status]).toEqual([id, 404]);
      const b = await j(r); expect(b.code).toBe("no-game"); expect(b.error).toMatch(/game ID/i);
    }
  });
  test("a game with no organizer e-mail on file still shows, without an organizer line", async () => {
    await organizer();
    raw.prepare("DELETE FROM kv WHERE k LIKE 'orgmail/%'").run();
    const b = await j(await call("GET", "/api/payments/paytest/game/GAME-ONE", undefined, "plat"));
    expect(b.game.id).toBe("GAME-ONE"); expect(b.game.organizer.email).toBeUndefined();
  });
});

describe("the payment-link page gets the same game block", () => {
  test("GET /api/paylink/<token> carries the game ID and the masked organizer, and still the price and status as before; no full address, no discount word", async () => {
    const k = await organizer();
    raw.prepare("INSERT INTO kv(k,v) VALUES(?,?)").run("contact/GAME-ONE", JSON.stringify({ name: "Jaya Menon", email: "jaya.menon@company.com" }));
    const l = await j(await call("POST", "/api/z/GAME-ONE/paylink", {}, k));
    const token = new URL(l.url).searchParams.get("t")!;
    const r = await call("GET", `/api/paylink/${token}`);
    const b = await j(r); expect(r.status, JSON.stringify(b)).toBe(200);
    expect(b.game).toMatchObject({ id: "GAME-ONE", name: "Diwali Bingo", organizer: { name: "Jaya Menon", email: "j***@company.com" } });
    expect(b.status).toBe("open"); expect(b.price.total).toBeGreaterThan(0);
    const text = JSON.stringify(b);
    expect(text).not.toContain("jaya.menon@company.com"); expect(text).not.toMatch(/coupon|discount|reduced/i);
  });
});
