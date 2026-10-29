// The join form must ask for what the game needs (correctness audit 2026-10-29, C7).
// "Employees only" with the default way of verifying (a mobile number) or "mobile number or employee ID": the server refuses a join without a mobile number
// ("Enter a valid mobile number."), but the form showed only a Name box, so a guest could not get in.
import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { closeAll, phone, START } from "./phone-world";
import { newWorld } from "./harness";

setDefaultTimeout(60_000);
afterEach(closeAll);
async function game(over: Record<string, unknown>) {
  const w = newWorld();
  const s = await w.json(await w.api("POST", "/api/start", { email: "boss@acme.com" }));
  expect((await w.api("POST", "/api/z", { id: "TAP-1", startRound: START, callSeconds: 12, cap: 10, ...over }, s.aiKey)).status).toBe(200);
  expect((await w.api("POST", "/api/z/TAP-1/publish", { email: "boss@acme.com", phone: "98765 43210" }, s.token)).status).toBe(200);
  return w;
}
describe("the join form of an employees-only game", () => {
  for (const [label, over] of [["employees only, verified by mobile number", { employeesOnly: true, verify: "mobile", whoCanJoin: "list" }], ["employees only, mobile number or employee ID", { employeesOnly: true, verify: "either" }]] as const) {
    test(label + ": there is a box for the mobile number", async () => {
      const p = await phone(await game(over as any)); await p.waitFor((x) => /Join the game/.test(x));
      expect(p.$("#ph")).not.toBeNull(); // old code: no mobile box, and the join was refused for want of a number
    });
  }
  test("an open game with a name-only join still asks for the name alone", async () => {
    const p = await phone(await game({})); await p.waitFor((x) => /Join the game/.test(x));
    expect(p.$("#nm")).not.toBeNull(); expect(p.$("#ph")).toBeNull();
  });
  test("employees only, verified by employee ID: the ID box is there, as before", async () => {
    const p = await phone(await game({ employeesOnly: true, verify: "id" })); await p.waitFor((x) => /Join the game/.test(x));
    expect(p.$("#emp")).not.toBeNull();
  });
});
