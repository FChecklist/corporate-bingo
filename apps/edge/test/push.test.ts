// "Notify me when this game begins" (1.6.0), the game's side: ONE "game begins" message per game when it really starts, a purge when its data is deleted, and NOTHING at all
// unless both PUSH_URL and PUSH_ADMIN_KEY are set. The push service is a fake that records every call it gets; no real message is ever sent.
// FALSIFIED BY: send-without-both-settings, second-send-for-one-game, no-purge-on-delete, key-in-body-or-database, send-for-unpaid-cancelled-test-or-old-game
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { makeD1 } from "./d1-sqlite";
import { eraseEverything, erasePersonal, lifecycleTick, GENESIS } from "../src/lifecycle";
import { gameLink, pushStartPass, pushTarget, PUSH_WINDOW_MS, sendGameBegins } from "../src/push";

const KEY = "push-admin-key-for-the-test-0123456789abcdef";
const URL_ = "https://push.test";
const NOW = Date.UTC(2026, 10, 25, 9, 0, 0);
const roundAt = (ms: number) => Math.floor((ms / 1000 - GENESIS) / 3) + 1;
const real = globalThis.fetch;

type Call = { url: string; path: string; auth: string | null; body: any };
let calls: Call[]; let subs: Record<string, number>; let down: boolean; let raw: ReturnType<typeof makeD1>["raw"]; let db: ReturnType<typeof makeD1>["db"]; let sqls: string[];
const settings = { PUSH_URL: URL_, PUSH_ADMIN_KEY: KEY, PUBLIC_ORIGIN: "https://bingo.corporatetambola.com" } as Record<string, string | undefined>;
const envOf = (over: Record<string, string | undefined> = {}) => ({ DB: db, ...settings, ...over }) as any;

/** The fake push service: /send pages of 40 over `subs[scope]` browsers, /purge. Answers like the real one (ok, sent, next_after_id). */
function fakeService() {
  (globalThis as any).fetch = async (input: any, init: any) => {
    const u = new URL(String(input));
    if (u.origin !== URL_) return real(input, init);
    const body = JSON.parse(init.body);
    calls.push({ url: String(input), path: u.pathname, auth: new Headers(init.headers).get("authorization"), body });
    if (down) return new Response("{}", { status: 500 });
    if (u.pathname === "/purge") { const had = subs[body.scope] ?? 0; delete subs[body.scope]; return Response.json({ ok: true, deleted: had }); }
    if (u.pathname === "/send") {
      const total = subs[body.scope] ?? 0, after = body.after_id ?? 0, n = Math.max(0, Math.min(40, total - after));
      return Response.json({ ok: true, sent: n, gone: 0, failed: 0, campaign: null, next_after_id: n === 40 && after + 40 < total ? after + 40 : null });
    }
    return new Response("{}", { status: 404 });
  };
}
function game(id: string, o: { startMs?: number; pack?: number | null; cancelled?: number | null; test?: number } = {}) {
  raw.prepare("INSERT INTO engagement(id,org,cap,pack,start_round,call_seconds,created_ms,is_test,cancelled_ms) VALUES(?,?,?,?,?,?,?,?,?)")
    .run(id, "org1", 100, o.pack === undefined ? 100 : o.pack, roundAt(o.startMs ?? NOW - 60_000), 12, NOW - 86_400_000, o.test ?? 0, o.cancelled ?? null);
}
const flag = (id: string) => (raw.prepare("SELECT push_sent_ms AS p FROM engagement WHERE id=?").get(id) as any).p as number | null;
const sends = () => calls.filter((c) => c.path === "/send");
const purges = () => calls.filter((c) => c.path === "/purge");

beforeEach(() => { const d = makeD1(); raw = d.raw; db = d.db; calls = []; subs = {}; down = false; sqls = []; const p = db.prepare.bind(db); db.prepare = (s: string) => { sqls.push(s); return p(s); }; fakeService(); });
afterEach(() => { globalThis.fetch = real; });

describe("dark: nothing is sent, called or queried unless BOTH PUSH_URL and PUSH_ADMIN_KEY are set", () => {
  test("the settings check itself: both needed, an https address with a real host name and no path", () => {
    expect(pushTarget({ PUSH_URL: URL_, PUSH_ADMIN_KEY: KEY })).toEqual({ base: URL_, key: KEY });
    expect(pushTarget({ PUSH_URL: URL_ + "/", PUSH_ADMIN_KEY: KEY })?.base).toBe(URL_);
    for (const bad of [{}, { PUSH_URL: URL_ }, { PUSH_ADMIN_KEY: KEY }, { PUSH_URL: "", PUSH_ADMIN_KEY: KEY }, { PUSH_URL: URL_, PUSH_ADMIN_KEY: "  " }, { PUSH_URL: "http://push.test", PUSH_ADMIN_KEY: KEY }, { PUSH_URL: "https://push.test/x", PUSH_ADMIN_KEY: KEY }, { PUSH_URL: "https://localhost", PUSH_ADMIN_KEY: KEY }, { PUSH_URL: "https://REPLACE-ME", PUSH_ADMIN_KEY: KEY }]) expect(pushTarget(bad)).toBeNull();
  });
  for (const [name, over] of [["neither setting", { PUSH_URL: undefined, PUSH_ADMIN_KEY: undefined }], ["only the address", { PUSH_ADMIN_KEY: undefined }], ["only the key", { PUSH_URL: undefined }], ["an address that is not https", { PUSH_URL: "http://push.test" }]] as const) {
    test(`${name}: a started, paid game is not sent to, nothing is called, the flag stays empty and the database is not even asked`, async () => {
      game("G1"); subs["game:G1"] = 5;
      await lifecycleTick(envOf(over), NOW);
      expect(calls).toEqual([]); expect(flag("G1")).toBeNull();
      expect(sqls.filter((s) => /push_sent_ms/.test(s))).toEqual([]);
      await erasePersonal(envOf(over), "G1", NOW, "auto");
      expect(calls).toEqual([]);
    });
  }
  test("the same game IS sent to once both settings are there (so the tests above prove something)", async () => {
    game("G1"); subs["game:G1"] = 5;
    await lifecycleTick(envOf(), NOW);
    expect(sends().length).toBe(1);
  });
});

describe("one message per game, when it really starts", () => {
  test("a started, paid, live game: exactly one /send to its own scope, with the key as a header only, a link to its own player page, and nothing personal", async () => {
    game("G1"); subs["game:G1"] = 7;
    const r = await lifecycleTick(envOf(), NOW) as any;
    expect(r.pushed).toBe(1);
    expect(sends().length).toBe(1);
    const c = sends()[0]!;
    expect(c.url).toBe(URL_ + "/send"); expect(c.auth).toBe("Bearer " + KEY);
    expect(c.body).toEqual({ scope: "game:G1", kind: "game_begins", title: "The game is starting", body: "Tap to join the game now.", url: "https://bingo.corporatetambola.com/z.html?e=G1", limit: 40 });
    expect(JSON.stringify(c.body)).not.toContain(KEY);
    expect(flag("G1")).toBe(NOW);
  });
  test("ticks after that, even many and at once, never send a second time for the same game", async () => {
    game("G1"); subs["game:G1"] = 7;
    await Promise.all([pushStartPass(envOf(), NOW, roundAt), pushStartPass(envOf(), NOW, roundAt)]); // two ticks at the same moment: one wins the flag
    await lifecycleTick(envOf(), NOW + 60_000); await lifecycleTick(envOf(), NOW + 120_000); await pushStartPass(envOf(), NOW + 180_000, roundAt);
    expect(sends().length).toBe(1);
  });
  test("a game that has not started yet, is not paid, is cancelled, is a TEST game, or began more than half an hour ago is not sent to", async () => {
    game("SOON", { startMs: NOW + 10 * 60_000 }); game("UNPAID", { pack: 0 }); game("CANCELLED", { cancelled: NOW - 3_600_000 }); game("TESTING", { test: 1 }); game("OLD", { startMs: NOW - PUSH_WINDOW_MS - 120_000 });
    for (const id of ["SOON", "UNPAID", "CANCELLED", "TESTING", "OLD"]) subs["game:" + id] = 3;
    await lifecycleTick(envOf(), NOW);
    expect(calls).toEqual([]);
    for (const id of ["SOON", "UNPAID", "CANCELLED", "TESTING", "OLD"]) expect([id, flag(id)]).toEqual([id, null]);
    await lifecycleTick(envOf(), NOW + 11 * 60_000); // SOON has now started
    expect(sends().map((c) => c.body.scope)).toEqual(["game:SOON"]);
  });
  test("more than 40 browsers: the pages follow each other with after_id until the service says there is no next page, and the game is still marked sent once", async () => {
    game("G1"); subs["game:G1"] = 85;
    await lifecycleTick(envOf(), NOW);
    expect(sends().map((c) => c.body.after_id)).toEqual([undefined, 40, 80]);
    await lifecycleTick(envOf(), NOW + 60_000);
    expect(sends().length).toBe(3);
  });
  test("when the service is down the first page is refused: the flag is given back and the next tick tries again, until the half hour is over", async () => {
    game("G1"); subs["game:G1"] = 4; down = true;
    await lifecycleTick(envOf(), NOW);
    expect(sends().length).toBe(1); expect(flag("G1")).toBeNull();
    await lifecycleTick(envOf(), NOW + 60_000);
    expect(sends().length).toBe(2);
    down = false;
    await lifecycleTick(envOf(), NOW + 120_000);
    expect(sends().length).toBe(3); expect(flag("G1")).toBe(NOW + 120_000);
    await lifecycleTick(envOf(), NOW + 180_000);
    expect(sends().length).toBe(3);
    // a different game that the service never answers for: after the half hour no more tries
    game("G2", { startMs: NOW + 5 * 60_000 }); down = true;
    await lifecycleTick(envOf(), NOW + 6 * 60_000); await lifecycleTick(envOf(), NOW + 5 * 60_000 + PUSH_WINDOW_MS + 60_000);
    const g2 = sends().filter((c) => c.body.scope === "game:G2").length;
    await lifecycleTick(envOf(), NOW + 5 * 60_000 + PUSH_WINDOW_MS + 120_000);
    expect(sends().filter((c) => c.body.scope === "game:G2").length).toBe(g2);
  });
  test("an id that the service cannot take as a scope is never sent", async () => {
    expect(await sendGameBegins(envOf(), "has a space")).toEqual({ first: false, done: false, sent: 0 });
    expect(calls).toEqual([]);
    expect(gameLink({}, "A B")).toBe("https://bingo.corporatetambola.com/z.html?e=A%20B");
  });
});

describe("when the game's data is deleted, its saved browser addresses are deleted with it", () => {
  test("erasePersonal (the 24-hour clean-up, the organizer's delete, the e-mail request) calls /purge for that game and no other", async () => {
    game("G1"); game("G2"); subs["game:G1"] = 3; subs["game:G2"] = 3;
    await erasePersonal(envOf(), "G1", NOW, "auto");
    expect(purges().length).toBe(1); expect(purges()[0]!.body).toEqual({ scope: "game:G1" }); expect(purges()[0]!.auth).toBe("Bearer " + KEY);
    expect(subs["game:G1"]).toBeUndefined(); expect(subs["game:G2"]).toBe(3);
  });
  test("eraseEverything (the 365-day delete and a manual delete) purges too", async () => {
    game("G9"); subs["game:G9"] = 2;
    await eraseEverything(envOf(), "G9", NOW);
    expect(purges().map((c) => c.body.scope)).toEqual(["game:G9"]);
  });
  test("the 24-hour clean-up of a played game, run by the scheduled tick, purges it (end of the game + 20 hours)", async () => {
    game("G3", { startMs: NOW - 30 * 3_600_000 }); subs["game:G3"] = 2;
    raw.prepare("INSERT INTO participant(eid,pid,phone_hash,name,joined_ms) VALUES('G3','p1','h1','Asha',?)").run(NOW - 31 * 3_600_000);
    raw.prepare("INSERT INTO life(eid,end_ms,end_src) VALUES('G3',?, 'phones')").run(NOW - 22 * 3_600_000);
    await lifecycleTick(envOf(), NOW);
    expect(purges().map((c) => c.body.scope)).toEqual(["game:G3"]);
  });
  test("a service that is down never stops the deletion of the game's own data", async () => {
    game("G1"); raw.prepare("INSERT INTO participant(eid,pid,phone_hash,name,joined_ms) VALUES('G1','p1','h1','Asha',?)").run(NOW);
    down = true;
    await erasePersonal(envOf(), "G1", NOW, "auto");
    expect(purges().length).toBe(1);
    expect((raw.prepare("SELECT COUNT(*) AS c FROM participant WHERE eid='G1'").get() as any).c).toBe(0);
  });
});

describe("the key stays out of everything but the Authorization header", () => {
  test("after a full cycle the key is in no table of the database", async () => {
    game("G1"); subs["game:G1"] = 90;
    await lifecycleTick(envOf(), NOW); await erasePersonal(envOf(), "G1", NOW + 1000, "auto");
    expect(calls.length).toBeGreaterThan(3);
    for (const c of calls) { expect(c.auth).toBe("Bearer " + KEY); expect(JSON.stringify(c.body)).not.toContain(KEY); expect(c.url).not.toContain(KEY); }
    const tables = (raw.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as any[]).map((t) => t.name as string);
    for (const t of tables) expect([t, JSON.stringify(raw.prepare(`SELECT * FROM "${t}"`).all()).includes(KEY)]).toEqual([t, false]);
  });
});
