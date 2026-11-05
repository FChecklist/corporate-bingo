// ID-ONLY JOINING (owner order, 1 Nov 2026), the same design as Tambola: name, location and an Employee, Associate, Vendor or Member ID; no mobile number or e-mail address is asked for,
// taken or kept. An ID that is not on the list waits on "People asking to join" until the Organizer confirms it. Off unless env.ID_ONLY === "1".
import { beforeEach, describe, expect, test } from "bun:test";
import { type Env } from "../src/worker";
import { handle } from "./with-terms";
import { openPii, sealPii } from "../src/pii";
import { makeD1 } from "./d1-sqlite";

const T = Date.UTC(2026, 9, 1, 10, 0, 0);
const GEN = 1692803367;
const roundAt = (ms: number) => Math.floor((ms / 1000 - GEN) / 3) + 1;
const START = roundAt(T) + 1200;
let env: Env; let raw: ReturnType<typeof makeD1>["raw"]; let n = 0;
const call = (method: string, path: string, body?: unknown, headers: Record<string, string> = {}, now = T) =>
  handle(new Request("http://x" + path, { method, headers: { "content-type": "application/json", ...headers }, body: body === undefined ? undefined : JSON.stringify(body) }), env, now);
const j = async (r: Response) => (await r.json()) as any;
const dev = (i: number) => String(i).padStart(2, "0").repeat(16);
async function game(id: string) {
  const r = await j(await call("POST", "/api/start", { email: `o${++n}@acme.com` }, { "cf-connecting-ip": `10.0.0.${n}` }));
  const h = { "x-organizer": r.token as string };
  expect((await call("POST", "/api/z", { id, startRound: START, callSeconds: 6, cap: 100 }, h)).status).toBe(200);
  expect((await call("POST", `/api/z/${id}/publish`, { email: "boss@acme.com", phone: "98765 43210" }, h)).status).toBe(200);
  return h;
}
const base = () => ({ DB: undefined as any, ORGANIZER_SECRET: "plat", RUNNER_KEY: "test-runner-key-test-runner-key-test0000", DAILY_WRITE_BUDGET: "1000000", PUBLIC_ORIGIN: "https://bingo.test", PHONE_SALT: "salt", DATA_KEY: "k" });
beforeEach(() => { const d = makeD1(); raw = d.raw; env = { ...base(), DB: d.db, ID_ONLY: "1" } as unknown as Env; n = 0; });

describe("ID-only joining", () => {
  test("the page is told: ID-only, the ID is asked for, no mobile number", async () => {
    await game("IDO-1");
    const info = await j(await call("GET", "/api/z/IDO-1/info"));
    expect(info.idOnly).toBe(true); expect(info.verify).toBe("id"); expect(info.employeesOnly).toBe(true);
  });
  test("an ID, a name and a location are all needed; each is asked for kindly", async () => {
    await game("IDO-2");
    const ask = async (body: any) => { const r = await call("POST", "/api/z/IDO-2/join", { device: dev(1), ...body }); return [r.status, (await j(r)).error] as const; };
    expect(await ask({ name: "Maya Lopez", location: "Pune" })).toEqual([400, "Please type your Employee, Associate, Vendor or Member ID."]);
    expect(await ask({ empId: "E1001", location: "Pune" })).toEqual([400, "Please type your name."]);
    expect(await ask({ empId: "E1001", name: "Maya Lopez" })).toEqual([400, "Please type your location."]);
    expect((raw.query("SELECT COUNT(*) c FROM seat").get() as any).c).toBe(0);
  });
  test("an ID that is not on the list waits; the Organizer sees Name, Location and ID, confirms it, and the person gets a card; no mobile number is kept anywhere", async () => {
    const h = await game("IDO-3");
    const r = await call("POST", "/api/z/IDO-3/join", { name: "Maya Lopez", location: "Pune", empId: "E1001", phone: "98765 43210", device: dev(1) });
    expect(r.status).toBe(403); const w = await j(r); expect(w.waiting).toBe(true); expect(typeof w.wid).toBe("string");
    const list = await j(await call("GET", "/api/z/IDO-3/waiting", undefined, h));
    expect(list.waiting.length).toBe(1);
    expect(list.waiting[0]).toMatchObject({ name: "Maya Lopez", loc: "Pune", empId: "E1001", last4: "" });
    expect((await call("POST", `/api/z/IDO-3/waiting/${list.waiting[0].id}`, { decision: "admit" }, h)).status).toBe(200);
    const me = await j(await call("GET", `/api/z/IDO-3/me?wid=${w.wid}`)); expect(me.state).toBe("admitted");
    const ok = await call("POST", "/api/z/IDO-3/join", { name: "Maya Lopez", location: "Pune", empId: "E1001", device: dev(1) }); expect(ok.status).toBe(200);
    const a = await j(ok);
    const row = raw.query("SELECT pii FROM participant WHERE pid=?").get(a.pid) as any;
    expect(await openPii(env as any, row.pii)).toEqual({ phone: "", name: "Maya Lopez", empId: "E1001", loc: "Pune" });
    for (const t of ["person", "waiting", "participant"]) for (const x of raw.query(`SELECT pii FROM ${t}`).all() as any[]) expect((await openPii(env as any, x.pii))?.phone ?? "").toBe("");
  });
  test("Confirm all lets everyone waiting in", async () => {
    const h = await game("IDO-4");
    for (const [i, id] of ["E1", "E2", "E3"].entries()) expect((await call("POST", "/api/z/IDO-4/join", { name: "Person " + id, location: "Delhi", empId: id, device: dev(i + 1) })).status).toBe(403);
    const r = await j(await call("POST", "/api/z/IDO-4/waiting/all", { decision: "admit" }, h)); expect(r.admitted).toBe(3);
    for (const [i, id] of ["E1", "E2", "E3"].entries()) expect((await call("POST", "/api/z/IDO-4/join", { name: "Person " + id, location: "Delhi", empId: id, device: dev(i + 1) })).status).toBe(200);
  });
  test("the prize hand-over never takes a mobile number", async () => {
    await game("IDO-5");
    const w = await j(await call("POST", "/api/z/IDO-5/join", { name: "Maya", location: "Pune", empId: "E9", device: dev(1) })); expect(w.waiting).toBe(true);
    const wr = raw.query("SELECT id FROM waiting").get() as any;
    raw.query("UPDATE waiting SET status='admitted' WHERE id=?").run(wr.id);
    raw.query("INSERT INTO person(eid,id,ph,pii,inviter,status,added_ms) SELECT eid,'p1',ph,pii,'o','invited',0 FROM waiting WHERE id=?").run(wr.id);
    const a = await j(await call("POST", "/api/z/IDO-5/join", { name: "Maya", location: "Pune", empId: "E9", device: dev(1) }));
    const sealed = await sealPii(env as any, { phone: "", name: "Maya", empId: "E9", loc: "Pune" });
    raw.query("INSERT INTO prize(eid,round,pattern,ordinal,seat,pii,orig) VALUES('IDO-5',3,'line',1,1,?,?)").run(sealed, sealed);
    const c = await call("POST", "/api/z/IDO-5/confirm", { pid: a.pid, device: dev(1), name: "Maya L", phone: "98765 43210" }); expect(c.status).toBe(200);
    const mine = await j(await call("GET", `/api/z/IDO-5/myprizes?pid=${a.pid}&device=${dev(1)}`));
    expect(mine).toMatchObject({ name: "Maya L", phone: "", empId: "E9", confirmed: true });
    const row = raw.query("SELECT pii FROM prize WHERE eid='IDO-5'").get() as any; expect(await openPii(env as any, row.pii)).toEqual({ phone: "", name: "Maya L", empId: "E9", loc: "Pune" });
  });
  test("Bring your family: a guest adds family members by name only; each joins under the guest's ID, by a personal link; the 5th is refused politely", async () => {
    const h = await game("IDO-7");
    expect((await call("PATCH", "/api/z/IDO-7/settings", { guestInvites: { on: true, per: 4 } }, h)).status).toBe(200);
    expect((await call("POST", "/api/z/IDO-7/join", { name: "Maya Lopez", location: "Pune", empId: "E1001", device: dev(1) })).status).toBe(403);
    await call("POST", "/api/z/IDO-7/waiting/all", { decision: "admit" }, h);
    const a = await j(await call("POST", "/api/z/IDO-7/join", { name: "Maya Lopez", location: "Pune", empId: "E1001", device: dev(1) }));
    const q = `?me=${a.pid}&device=${dev(1)}`;
    const r = await j(await call("POST", `/api/z/IDO-7/people${q}`, { people: [{ name: "Ravi" }, { name: "Tara" }] }));
    expect(r.added).toBe(2); expect(r.people.length).toBe(2);
    const mine = await j(await call("GET", `/api/z/IDO-7/people${q}`));
    expect(mine.people.map((p: any) => [p.name, p.empId, p.maskedPhone])).toEqual([["Ravi", "E1001F1", ""], ["Tara", "E1001F2", ""]]);
    expect(mine.people.every((p: any) => /\/j\//.test(p.link) && p.waLink === null)).toBe(true);
    const tok = String(mine.people[0].link).split("/j/")[1];
    const fam = await call("POST", "/api/z/IDO-7/join", { token: tok, device: dev(2) }); expect(fam.status).toBe(200);
    expect((await call("POST", `/api/z/IDO-7/people${q}`, { people: [{ name: "A" }, { name: "B" }] })).status).toBe(200);
    const fifth = await call("POST", `/api/z/IDO-7/people${q}`, { people: [{ name: "Fifth" }] }); expect(fifth.status).toBe(409);
    expect((await j(fifth)).error).toMatch(/full|limit/i);
  });
  test("with the flag off the game joins as before (a name is enough)", async () => {
    const d = makeD1(); raw = d.raw; env = { ...base(), DB: d.db } as unknown as Env;
    await game("IDO-6");
    expect((await j(await call("GET", "/api/z/IDO-6/info"))).idOnly).toBeUndefined();
    expect((await call("POST", "/api/z/IDO-6/join", { name: "Maya Lopez", device: dev(1) })).status).toBe(200);
  });
});
