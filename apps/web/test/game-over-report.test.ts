// The phone tells the store once that the game is over for it (the end-of-game clock relies on it). The store answers counted:false when it is too early to
// count a report (before number 20); the phone used to treat any answer as done and never asked again (correctness audit 2026-10-29, C9).
import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { closeAll, joined, setup, sleep, START } from "./phone-world";
import { roundMs } from "./harness";

setDefaultTimeout(90_000);
afterEach(closeAll);
describe("the phone's 'game over' report", () => {
  test("an answer 'counted: false' is not the end of it: the phone asks again, and stops once it is counted", async () => {
    const w = await setup("auto"); const p = await joined(w);
    const realRandom = Math.random; Math.random = () => 0; // no waiting before the report (it is spread over up to 45 seconds so a crowd does not ask at once)
    try {
      const origFetch = p.win.fetch; const answers: string[] = [];
      p.win.fetch = async (u: any, init?: any) => {
        if (/\/api\/z\/TAP-1\/over$/.test(String(u)) && init?.method === "POST") { answers.push(answers.length === 0 ? "early" : "real"); if (answers.length === 1) return new Response(JSON.stringify({ ok: true, counted: false }), { status: 200, headers: { "content-type": "application/json" } }); }
        return origFetch(u, init);
      };
      const end = roundMs(START + 40) + 75 * 12_000 + 5000; p.win.__skew += end - w.world.now; w.world.now = end; // the 75th number has been called
      const t0 = Date.now(); while (answers.length < 2 && Date.now() - t0 < 60_000) await sleep(300);
      expect(answers.length).toBeGreaterThanOrEqual(2); // old code: 1, the early answer was taken for "done"
      const n = answers.length; await sleep(4000); expect(answers.length).toBe(n); // counted: it does not ask again
    } finally { Math.random = realRandom; }
  });
});
