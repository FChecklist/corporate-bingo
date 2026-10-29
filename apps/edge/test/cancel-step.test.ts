// A published game is cancelled in step 7 (Check and publish: the Cancel button is in stepPublish of the console). Step 10 (After the game) only erases data.
// The refusal to delete a published game and the help entry for it both said "step 10" (QA 2026-10-29).
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { handle } from "./with-terms";
import { makeD1 } from "./d1-sqlite";

const T = Date.UTC(2026, 9, 29, 10), START = Math.floor((T / 1000 - 1692803367) / 3) + 1 + 2400;
describe("where a published game is cancelled", () => {
  test("the refusal to delete a published game points to step 7", async () => {
    const d = makeD1(); const env: any = { DB: d.db, ORGANIZER_SECRET: "plat", DAILY_WRITE_BUDGET: "1000000", PUBLIC_ORIGIN: "https://bingo.test", DATA_KEY: "k", PHONE_SALT: "s" };
    const call = async (m: string, p: string, b?: unknown, hd: Record<string, string> = {}) => { const r = await handle(new Request("http://x" + p, { method: m, headers: { "content-type": "application/json", ...hd }, body: b === undefined ? undefined : JSON.stringify(b) }), env, T); return { status: r.status, j: (await r.json()) as any }; };
    const s = await call("POST", "/api/start", { email: "boss@acme.com" }, { "cf-connecting-ip": "5.5.5.5" }); const key = { "x-organizer": s.j.token };
    expect((await call("POST", "/api/z", { id: "CANCEL-1", startRound: START, callSeconds: 12, cap: 10 }, key)).status).toBe(200);
    expect((await call("POST", "/api/z/CANCEL-1/publish", { email: "boss@acme.com", phone: "98765 43210" }, key)).status).toBe(200);
    const r = await call("POST", "/api/z/CANCEL-1/discard", undefined, key);
    expect(r.status).toBe(409); expect(r.j.code).toBe("not-a-draft");
    expect(r.j.error).toContain("step 7"); expect(r.j.error).not.toContain("step 10");
  });
  test("the console really has the Cancel button in step 7, and the help entry says so", () => {
    const zc = readFileSync(join(import.meta.dir, "../../web/public/zc.js"), "utf8");
    const publish = zc.slice(zc.indexOf("function stepPublish()"), zc.indexOf("function stepPay()"));
    expect(publish).toContain("cancelBlock()");
    const after = zc.slice(zc.indexOf("function stepAfter()"), zc.indexOf("function stepAfter()") + 4000);
    expect(after).not.toContain("cancelBlock()");
    const g = readFileSync(join(import.meta.dir, "../../web/public/guide.js"), "utf8");
    const line = g.split("\n").find((l) => l.includes("Only a game that is not published yet can be deleted here")) ?? "";
    expect(line).toContain("step 7"); expect(line).not.toContain("step 10 (After the game) to cancel");
  });
});
