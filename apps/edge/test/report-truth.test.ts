// What the end-of-game report says must be true (QA 2026-10-29, found by tools/qa-model.mjs in the 10-person demo run).
//   1. The organizer's company name and logo are printed on the report (owner order 2026-10-09). The report data was built from a copy of the settings that dropped the brand.
//   2. A game that ended because every prize was won must say so and give the real number of numbers called, not "All numbers were called" and 75.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { endBoundMs, lifecycleTick, cfgOfRow } from "../src/lifecycle";
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
