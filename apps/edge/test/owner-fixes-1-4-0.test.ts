// Audit findings of PR 9 that need a test of their own: the AI helper makes ID-only games (finding 5), the paid route says why when it is not set up (finding 9), wider forbidden claims (finding 11).
// FALSIFIED BY: ai-route-offers-open-games, ai-route-sends-no-id-rule, paid-route-silent-without-public-origin, forbidden-claim-unhackable
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { W, callRaw, j, reset, restore, T } from "./param-harness";

const EDGE = join(import.meta.dir, "../src"), PUB = join(import.meta.dir, "../../web/public");
const src = (f: string) => readFileSync(join(EDGE, f), "utf8");
beforeEach(() => reset()); afterEach(restore);

describe("the AI helper only makes invite-only (ID) games", () => {
  test("its screens never offer or say 'anyone with the link'; the game it saves says whoCanJoin list and verify id; the speed default is 12 seconds", () => {
    for (const f of ["ai-go.ts", "ai-link.ts", "ai-functions.ts"]) expect([f, /(Anyone|anyone|Open to anyone)[^"`]{0,20}with the link/.test(src(f))]).toEqual([f, false]);
    expect(src("ai-go.ts")).toMatch(/whoCanJoin: "list", verify: "id"/);
    expect(src("ai-go.ts")).not.toMatch(/\|\| 9\b/);
  });
});

describe("the console's paid route says why when the game's own address is not set", () => {
  test("CONSOLE_PUBKEYS set but PUBLIC_ORIGIN empty: 503 'not set up' (not a confusing 'wrong game' for every real notice)", async () => {
    (W.env as any).CONSOLE_PUBKEYS = "k1:AAAA"; delete (W.env as any).PUBLIC_ORIGIN;
    const r = await callRaw("POST", "/api/console/paid", { assertion: "x", eid: "ABC-123", item: "100", orderRef: "ORD-0001" }, {}, T);
    expect(r.status).toBe(503); expect((await j(r)).code).toBe("not_set_up");
  });
});

describe("forbidden claims (wider than the first three)", () => {
  const files = [...readdirSync(PUB).filter((f) => /\.(html|js|txt)$/.test(f) && !/^(zgame|reportgen)\.js$/.test(f)).map((f) => join(PUB, f)), ...readdirSync(EDGE).filter((f) => f.endsWith(".ts")).map((f) => join(EDGE, f))];
  const bad = /unhackable|hack[- ]proof|unbreakable|bank[- ]grade|military[- ]grade|100\s?%\s*(safe|private|compliant|guaranteed|secure)|completely (secure|safe)|guaranteed (secure|safe|compliance)|zero risk|fully compliant with|impossible to (hack|breach)/i;
  test("none of them is written anywhere that ships", () => {
    const keep = (t: string) => t.split("\n").filter((l) => !/never (say|claim|write|promise)/i.test(l)).join("\n"); // the AI's own rule "Never say 100% safe, unhackable..." forbids the claim; it is not the claim
    expect(files.filter((f) => bad.test(keep(readFileSync(f, "utf8")))).map((f) => f.split("/").pop())).toEqual([]);
  });
  test("the check itself catches them", () => { for (const s of ["It is unhackable.", "bank-grade security", "100% safe", "completely secure"]) expect(bad.test(s)).toBe(true); });
});
