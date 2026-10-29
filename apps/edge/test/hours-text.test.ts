// The deadlines that organizers and AI assistants are told must be the ones the code keeps (QA 2026-10-29).
// The code erases guest data PURGE_AFTER_MS (20 h) after the end, closes the organizer's report link REPORT_LINK_MS (19 h) after the end, and a game can be paid until the erasure.
// Older text still said 22 and 23 hours: "pay until 23 hours" and "the report opens for 22 hours" make an organizer miss a deadline that has already passed.
// Not covered here on purpose: the legal pages (Terms, Privacy, DPA, Rules, Trust). They are the owner's final legal wording ("within 24 hours", and "23 hours" in places, which is the safe side of the
// real 20); the legal wording pass changes them, not a test.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PURGE_AFTER_MS, REPORT_LINK_MS } from "../src/lifecycle";
import { manualText } from "../src/ai-link";
import { mapText } from "../src/ai-functions";
import { handle } from "../src/worker";
import { makeD1 } from "./d1-sqlite";

const H = 3_600_000, ERASE = PURGE_AFTER_MS / H, LINK = REPORT_LINK_MS / H;
const page = (f: string) => readFileSync(join(import.meta.dir, "../../web/public", f), "utf8");
const OLD = /\b(22|23)[ -]hours?\b/;
// the ten facts (ai-facts.ts, also the Trust page) are the owner's legal-adjacent wording and are left to the legal wording pass; the AI manual carries them, so they are taken out before looking
const FACTS = ["(the job runs at 23 hours)", "erased 23 hours after the time it was meant to end"];
const near = (t: string) => { let x = t; for (const f of FACTS) x = x.split(f).join(""); const m = OLD.exec(x); return m ? x.slice(Math.max(0, m.index - 80), m.index + 40) : null; };

describe("the deadlines people are told match the code", () => {
  test("the code's own hours are 20 (erase) and 19 (report link), inside the 24-hour promise", () => { expect(ERASE).toBe(20); expect(LINK).toBe(19); });
  test("the organizer guide tells how long the report link works: the real 19 hours", () => {
    const t = page("organizer-guide.html"); expect(near(t)).toBeNull(); expect(t).toContain(`Your report link works for ${LINK} hours`);
  });
  test("the AI manual, the AI function map and the manifest never say 22 or 23 hours, and the report deadline is the real 19", async () => {
    const d = makeD1(); const env: any = { DB: d.db, ORGANIZER_SECRET: "plat", PUBLIC_ORIGIN: "https://bingo.test" }; const now = Date.UTC(2026, 9, 29);
    const manifest = await (await handle(new Request("http://x/api/z/ai-manifest"), env, now)).text();
    const map = mapText("https://bingo.test/api", "https://bingo.test");
    for (const t of [manifest, manualText("https://bingo.test", "cba_x", "ai", now), manualText("https://bingo.test", "cbh_x", "host", now), map]) expect(near(t)).toBeNull();
    expect(map).toContain(`opens for ${LINK} hours`); expect(map).toContain(`erased at ${ERASE} hours`);
    expect(manifest).toContain(`erased (${ERASE} hours after the game was meant to end)`);
  });
  test("the reminder the organizer gets for a game that is published but not paid says the real payment deadline", async () => {
    const d = makeD1(); const env: any = { DB: d.db, ORGANIZER_SECRET: "plat", DAILY_WRITE_BUDGET: "1000000", PUBLIC_ORIGIN: "https://bingo.test", DATA_KEY: "k", PHONE_SALT: "s" };
    const { handle: h } = await import("./with-terms"); const { remindUnpaid } = await import("../src/worker");
    const T = Date.UTC(2026, 9, 29, 10), start = Math.floor((T / 1000 - 1692803367) / 3) + 1 + 5 * 1200; // five hours after T
    const call = async (m: string, p: string, b?: unknown, hd: Record<string, string> = {}) => (await h(new Request("http://x" + p, { method: m, headers: { "content-type": "application/json", ...hd }, body: b === undefined ? undefined : JSON.stringify(b) }), env, T));
    const s = await (await call("POST", "/api/start", { email: "boss@acme.com" }, { "cf-connecting-ip": "5.5.5.5" })).json() as any; const key = { "x-organizer": s.token };
    expect((await call("POST", "/api/z", { id: "HRS-1", startRound: start, callSeconds: 12, cap: 100 }, key)).status).toBe(200);
    expect((await call("POST", "/api/z/HRS-1/publish", { email: "boss@acme.com", phone: "98765 43210" }, key)).status).toBe(200);
    await d.db.prepare("INSERT OR REPLACE INTO kv(k,v) VALUES('contact/HRS-1', ?)").bind(JSON.stringify({ email: "boss@acme.com", phone: "9876543210" })).run();
    await remindUnpaid(env, T + 3 * H); // three hours after publishing, five hours before the start
    const mail = d.raw.query("SELECT body FROM outbox WHERE subject LIKE '%Payment pending%HRS-1%'").get() as any;
    expect(mail).toBeTruthy(); expect(near(mail.body)).toBeNull(); expect(mail.body).toContain(`erased (${ERASE} hours after the game was meant to end)`);
  });
});
