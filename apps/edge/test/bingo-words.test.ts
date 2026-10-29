// Words from the sister product (Corporate Tambola) must not be in Bingo's help for organizers, AI assistants and the guide (QA 2026-10-29).
// The AI function map told an AI that "Full House has 10 winners, Top, Middle and Bottom Line 2, and Unlucky is ..."; Bingo has none of these houses, so an AI that followed it
// sent houses the server refuses ("Unknown house in the rewards.") or promised the organizer a prize that does not exist. The manual promised a "Full Two-Ticket House" for two cards.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { HOUSES_LINE, PRIZE_HOUSES } from "../../../packages/beacon/src/config";
import { manualText } from "../src/ai-link";
import { mapText } from "../src/ai-functions";
import { handle } from "../src/worker";
import { makeD1 } from "./d1-sqlite";

const STALE = /Full Two-Ticket House|\bFull House\b|Top, Middle and Bottom Line|\bEarly Five\b|\bUnlucky\b|\bJaldi\b/;
const now = Date.UTC(2026, 9, 29);
const find = (t: string) => { const m = STALE.exec(t); return m ? t.slice(Math.max(0, m.index - 60), m.index + 60) : null; };

describe("Bingo's help talks about Bingo's houses only", () => {
  test("the AI function map names no Tambola house and states Bingo's own houses with their real most winners", () => {
    const t = mapText("https://bingo.test/api", "https://bingo.test");
    expect(find(t)).toBeNull();
    expect(t).toContain(HOUSES_LINE);
    for (const h of PRIZE_HOUSES) expect(t).toContain(`${h.id} = ${h.label}`);
  });
  test("the AI manual (AI key and Host key) and the manifest name no Tambola house or reward", async () => {
    const env: any = { DB: makeD1().db, ORGANIZER_SECRET: "plat", PUBLIC_ORIGIN: "https://bingo.test" };
    const manifest = await (await handle(new Request("http://x/api/z/ai-manifest"), env, now)).text();
    for (const t of [manifest, manualText("https://bingo.test", "cba_x", "ai", now), manualText("https://bingo.test", "cbh_x", "host", now)]) expect(find(t)).toBeNull();
  });
  test("two cards per person: the manual says what it is (two different cards), not a reward Bingo does not have", () => {
    const t = manualText("https://bingo.test", "cba_x", "ai", now);
    expect(t).not.toMatch(/Two-Ticket/); expect(t).toMatch(/Cards per person: 1 \(simple\) or 2 \(more chances/);
  });
  test("the length of a game told to the AI is for 75 numbers, not 90 (6, 9, 12, 15 seconds = about 8, 11, 15, 19 minutes)", () => {
    const mins = [6, 9, 12, 15].map((g) => Math.round((75 * g) / 60));
    expect(mins).toEqual([8, 11, 15, 19]);
    const t = manualText("https://bingo.test", "cba_x", "ai", now);
    expect(t).toContain(`about ${mins.slice(0, 3).join(", ")} or ${mins[3]} minutes of calling`); expect(t).not.toContain("9, 14, 18 or 22 minutes");
  });
  test("the speed the AI recommends is the owner's 12 seconds, and the example call uses it", () => {
    const t = manualText("https://bingo.test", "cba_x", "ai", now);
    expect(t).toContain("6 seconds fast, 9 lively, 12 normal (recommended), 15 slow"); expect(t).toContain("callSeconds%22%3A12");
  });
  test("the guide's example prize is a Bingo prize (Line), not Full House", () => {
    const g = readFileSync(join(import.meta.dir, "../../web/public/guide.js"), "utf8");
    expect(find(g)).toBeNull();
    expect(g).toContain("Tick a prize, for example Line.");
  });
});
