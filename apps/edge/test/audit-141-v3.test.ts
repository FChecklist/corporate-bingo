// Bingo 1.4.1 v3 test pass (tester branch tests/bingo-1.4.1-v3-2026-10-31). Gap tests written against the OWNER RULES, not against what the code does:
//   A. employee ID: NFKC, upper case, keep A-Z and 0-9, at most 30 after cleaning, empty refused, duplicates after cleaning flagged, the hints
//   B. participant Email ID: NFKC, trim, inner spaces and invisible characters removed (U+200B-U+200D, U+2060, U+FEFF, U+0085, U+2028, U+2029), lower case
//   C. account / sign-in / Host / payment e-mails REFUSE inner spaces and invisible characters
//   D. id-kind lock: both sentences, only people who hold an ID hash lock
//   E. PRODUCT DEFECTS: tests named "PRODUCT DEFECT Dn" encode the rule and are RED on purpose (see docs/TESTER_REPORT.md). They are not bent to the code.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { type Env } from "../src/worker";
import { handle, consentFor } from "./with-terms";
import type { PayEnv } from "../src/pay";
import { normId, normEmp, empClean, EMP_CLEAN_FROM_MS } from "../src/people";
import { accountEmail, emailKey, INVISIBLE_RE } from "../src/emailkey";
import { makeD1 } from "./d1-sqlite";

const T = Date.UTC(2026, 9, 1, 10, 0, 0);
const GEN = 1692803367;
const roundAt = (ms: number) => Math.floor((ms / 1000 - GEN) / 3) + 1;
const START = roundAt(T) + 1200;
const NEW = EMP_CLEAN_FROM_MS; // a game dated at the deploy instant is on the new employee-ID rule
const TOO_LONG = "This ID is too long. An employee ID may be up to 30 characters once cleaned.";
const LOCKED_KIND = "You already have people listed. Start a new game to use a different kind of ID.";
const LOCKED_VERIFY = "You already have people listed. Start a new game to use a different way of asking for IDs.";
/** every invisible character the owner named (as code points, so no editor can drop a backslash) */
const INVIS = [0x0085, 0x200b, 0x200c, 0x200d, 0x2028, 0x2029, 0x2060, 0xfeff].map((c) => String.fromCodePoint(c));
let env: PayEnv; let raw: Database; let ipN = 0;
const realFetch = globalThis.fetch;
const call = (method: string, path: string, body?: unknown, key?: string, now = T) =>
  handle(new Request("http://x" + path, { method, headers: { "content-type": "application/json", "cf-connecting-ip": `9.9.${Math.floor(++ipN / 250)}.${ipN % 250}`, ...(key ? { "x-organizer": key } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) }), env as Env, now);
const j = async (r: Response) => (await r.json()) as any;
const dev = (i: number) => (String(i).padStart(2, "0") + "b".repeat(32)).slice(0, 32);
const count = (sql: string, ...v: unknown[]) => (raw.prepare(sql).get(...(v as any[])) as any).c as number;
const join = (id: string, body: Record<string, unknown>, now = T) => call("POST", `/api/z/${id}/join`, body, undefined, now);
const patch = (key: string, body: unknown, id = "PPL-1") => call("PATCH", `/api/z/${id}/settings`, body, key);
const add = (key: string, people: unknown[], id = "PPL-1") => call("POST", `/api/z/${id}/people`, { people }, key);

async function setup(opts: { verify?: string; employeesOnly?: boolean; idKind?: string; createdMs?: number; id?: string } = {}) {
  const id = opts.id ?? "PPL-1";
  const st = await j(await handle(new Request("http://x/api/start", { method: "POST", headers: { "content-type": "application/json", "cf-connecting-ip": `7.7.7.${++ipN % 250}` }, body: JSON.stringify({ email: `o${ipN}@acme.com` }) }), env as Env, T));
  const master = st.token as string;
  await call("POST", "/api/z", { id, startRound: START, callSeconds: 6, cap: 100 }, master);
  await call("POST", `/api/z/${id}/publish`, { email: "boss@acme.com", phone: "98765 43210" }, master);
  const body = { verify: opts.verify ?? "id", idKind: opts.idKind ?? "emp", employeesOnly: opts.employeesOnly ?? true };
  expect((await call("PATCH", `/api/z/${id}/settings`, body, master)).status).toBe(200);
  raw.prepare("UPDATE engagement SET created_ms=? WHERE id=?").run(opts.createdMs ?? NEW, id);
  return { master, id };
}
beforeEach(() => {
  const d = makeD1(); raw = d.raw;
  env = { DB: d.db, ORGANIZER_SECRET: "plat", DAILY_WRITE_BUDGET: "1000000", PUBLIC_ORIGIN: "https://bingo.test", PHONE_SALT: "salt", TEST_MODE: "1" } as PayEnv;
  (globalThis as any).fetch = async () => new Response("{}", { status: 404 });
});
afterEach(() => { globalThis.fetch = realFetch; });

/** the cleaning rule written a second way: code point by code point, no regex */
function oracleEmp(typed: string): string { let out = ""; for (const ch of typed.normalize("NFKC").toUpperCase()) { const c = ch.codePointAt(0)!; if ((c >= 48 && c <= 57) || (c >= 65 && c <= 90)) out += ch; } return out; }

describe("A. employee ID: NFKC, upper case, keep A-Z and 0-9, cap 30 after cleaning, empty refused", () => {
  test("every kind of typing becomes the same letters and numbers", () => {
    for (const [typed, want] of [["1b-678", "1B678"], ["1B/678", "1B678"], ["1B 678", "1B678"], ["1b_6.78", "1B678"], ["  e101  ", "E101"], ["a-b-c", "ABC"], ["ＡＢ－１２", "AB12"], ["①②ab", "12AB"], ["ﬁx9", "FIX9"], ["K9", "K9"], ["x\u200b9", "X9"], ["x\t9\n", "X9"], ["#12#", "12"], ["straße1", "STRASSE1"], ["é1", "1"]] as const) {
      expect([typed, normEmp(typed, NEW), normId(typed, "emp", NEW), empClean(typed)]).toEqual([typed, want, want, want]);
      expect(oracleEmp(typed)).toBe(want);
    }
  });
  test("the cleaned ID is only A-Z and 0-9, and cleaning twice changes nothing", () => {
    for (const typed of ["1b-678", "ＡＢ－１２", "x y z", "é1é", "a.b/c_d"]) { const c = normEmp(typed, NEW)!; expect(c).toMatch(/^[A-Z0-9]{1,30}$/); expect(normEmp(c, NEW)).toBe(c); }
  });
  test("the 30-character cap counts the CLEANED ID: 30 is fine, 31 is refused, and a long typing that cleans to 30 or less is fine", () => {
    expect(normEmp("A".repeat(30), NEW)).toBe("A".repeat(30)); expect(normEmp("A".repeat(31), NEW)).toBeNull(); expect(normEmp("A".repeat(300), NEW)).toBeNull();
    expect(normEmp("1".repeat(31), NEW)).toBeNull(); expect(normEmp("a".repeat(15) + "-" + "b".repeat(15), NEW)).toBe("A".repeat(15) + "B".repeat(15));
    expect(normEmp(("AB-").repeat(10) + "  ".repeat(20), NEW)).toBe("AB".repeat(10)); // 80+ typed characters, 20 once cleaned
    expect(normEmp(("A-").repeat(30), NEW)).toBe("A".repeat(30)); // 60 typed, 30 cleaned
    expect(normEmp(("A-").repeat(31), NEW)).toBeNull(); // 62 typed, 31 cleaned
    expect(normEmp("A".repeat(29) + "-", NEW)).toBe("A".repeat(29)); expect(normEmp("A".repeat(30) + "-", NEW)).toBe("A".repeat(30));
  });
  test("nothing typed is '' (empty, to be refused by the route); only symbols is refused (null)", () => {
    for (const nothing of ["", "   ", "\t\n", "\u200b\u200c\u200d\u2060\ufeff", null, undefined]) expect([nothing, normEmp(nothing as any, NEW)]).toEqual([nothing, ""]);
    for (const symbols of ["!!!", "---", "///", "_._"]) expect([symbols, normEmp(symbols, NEW)]).toEqual([symbols, null]);
  });
  test("an old game (before the deploy instant) keeps the old rule; the new rule needs the date or no date", () => {
    expect(normEmp("1b-678", NEW - 1)).toBe("1B-678"); expect(normEmp("1b-678", NEW)).toBe("1B678"); expect(normEmp("1b-678", undefined)).toBe("1B678"); expect(normEmp("1b-678", null)).toBe("1B678");
  });
  test("routes: empty is refused at join and when listing; 1b-678 / 1B 678 / 1B/678 are ONE person and the duplicate is NAMED", async () => {
    const t = await setup();
    const e = await j(await add(t.master, [{ name: "Blank", empId: "" }, { name: "Spaces", empId: "   " }, { name: "Symbols", empId: "---" }]));
    expect(e.added).toBe(0); expect(e.invalid.length).toBe(3);
    const r = await j(await add(t.master, [{ name: "Asha", empId: "1b-678" }, { name: "Bala", empId: "1B 678" }, { name: "Chitra", empId: "1B/678" }, { name: "Dev", empId: "E101" }]));
    expect(r.added).toBe(2); expect(r.duplicates).toBe(2); expect(r.sameAfterCleaning.length + (r.duplicateRows?.length ?? 0)).toBeGreaterThanOrEqual(2);
    expect(JSON.stringify(r)).toContain("1B678"); expect(JSON.stringify(r)).toMatch(/1B 678|1B\/678/); // the other spellings are named, not dropped silently
    const list = (await j(await call("GET", "/api/z/PPL-1/people", undefined, t.master))).people.map((p: any) => p.empId).sort(); expect(list).toEqual(["1B678", "E101"]);
    // a second add of the same person in another spelling is flagged too (the server sees the clean form on the list)
    const again = await j(await add(t.master, [{ name: "Asha again", empId: "1b 678" }])); expect(again.added).toBe(0); expect(again.duplicates).toBe(1);
    for (const empty of ["", "  ", "---"]) { const jr = await join("PPL-1", { name: "N", empId: empty, device: dev(1) }); expect([empty, jr.status]).toEqual([empty, 400]); }
    expect((await join("PPL-1", { name: "A", empId: "1b 678", device: dev(2) })).status).toBe(200); // listed as 1B678, typed another way
  });
  test("30 cleaned is accepted and 31 refused through the real routes (listing and joining), however much punctuation is typed", async () => {
    const t = await setup();
    const ok30 = ("a-").repeat(30), bad31 = ("a-").repeat(31);
    const r = await j(await add(t.master, [{ name: "Ok", empId: ok30 }, { name: "Long", empId: bad31 }]));
    expect(r.added).toBe(1); expect(r.invalid.length).toBe(1); expect(r.invalid[0].name).toBe("Long");
    expect((await join("PPL-1", { name: "Ok", empId: ok30, device: dev(3) })).status).toBe(200);
    expect((await join("PPL-1", { name: "Long", empId: bad31, device: dev(4) })).status).toBe(400);
  });
  test("an e-mail typed in an employee-ID game gets the plain refusal and never any letters from it (see also audit-141.test.ts, item 3)", async () => {
    const t = await setup();
    for (const mail of ["rajat1@demo.com", "RAJAT＠DEMO.COM", "a@b"]) {
      const jr = await join("PPL-1", { name: "R", empId: mail, device: dev(5) }); expect([mail, jr.status]).toEqual([mail, 400]);
      const m = (await j(jr)).error as string; expect(m).toBe("This looks like an Email ID. This game asks for an employee ID: letters and numbers only."); expect(m).not.toMatch(/read this as/i);
    }
    const r = await j(await add(t.master, [{ name: "R", empId: "rajat1@demo.com" }])); expect(r.added).toBe(0); expect(JSON.stringify(r.invalid)).toContain("This looks like an Email ID.");
    expect(count("SELECT COUNT(*) c FROM person WHERE eid='PPL-1'")).toBe(0);
  });
});

describe("B. participant Email ID: NFKC, trim, remove inner spaces and invisible characters, lower case", () => {
  test("each invisible character on its own, inside and at the ends, is removed (U+0085, U+200B-U+200D, U+2028, U+2029, U+2060, U+FEFF)", () => {
    for (const c of INVIS) {
      const hex = c.codePointAt(0)!.toString(16);
      for (const typed of [`sa${c}les@acme.com`, `${c}sales@acme.com`, `sales@acme.com${c}`, `sales@ac${c}me.${c}com`, `${c}s${c}a${c}l${c}e${c}s${c}@${c}acme.com`])
        expect([hex, typed, normId(typed, "email"), emailKey(typed)]).toEqual([hex, typed, "sales@acme.com", "sales@acme.com"]);
    }
  });
  test("white space of every kind, NFKC and lower case: one Email ID however it was typed", () => {
    for (const typed of ["  Sales@Acme.COM  ", "SALES\u3000@ACME.COM", "sales\u00a0@\u00a0acme.com", "s a l e s @ a c m e . c o m", "ＳＡＬＥＳ＠ＡＣＭＥ．ＣＯＭ", "sales\u0085@acme.com\u2028"]) expect([typed, normId(typed, "email")]).toEqual([typed, "sales@acme.com"]);
    expect(emailKey("S\u200b A\u2028L@X.com")).toBe("sal@x.com");
  });
  test("the letters of the escape names stay (a lost backslash would eat them): u200B, 2028, FEFF, 0085 as TEXT are kept", () => {
    expect(emailKey("u200B.2028.FEFF.0085@Ex.com")).toBe("u200b.2028.feff.0085@ex.com"); expect(normId("u2028s@s.ss", "email")).toBe("u2028s@s.ss");
  });
  test("through the real routes: the list and the join both store the clean form for every invisible character", async () => {
    const t = await setup({ verify: "id", idKind: "email" });
    const people = INVIS.map((c, i) => ({ name: "P" + i, empId: `p${i}${c}x@Acme${c}.com ` }));
    const r = await j(await add(t.master, people)); expect(r.added).toBe(INVIS.length);
    const list = (await j(await call("GET", "/api/z/PPL-1/people", undefined, t.master))).people.map((p: any) => p.empId).sort();
    expect(list).toEqual(INVIS.map((_, i) => `p${i}x@acme.com`).sort());
    expect((await join("PPL-1", { name: "P0", empId: `P0${INVIS[0]}X@ACME.com`, device: dev(6) })).status).toBe(200);
  });
});

describe("C. account / sign-in / Host / payment e-mails REFUSE inner spaces and invisible characters", () => {
  test("accountEmail turns every inner invisible character into a space (kept), so the shape check refuses it; the ends are trimmed", () => {
    for (const c of INVIS) {
      const hex = c.codePointAt(0)!.toString(16);
      expect([hex, accountEmail(`ra${c}jat@acme.com`)]).toEqual([hex, "ra jat@acme.com"]);
      expect([hex, accountEmail(`rajat@acme.com`)]).toEqual([hex, "rajat@acme.com"]);
      expect([hex, /\s/.test(accountEmail(`ra${c}jat@acme.com`))]).toEqual([hex, true]);
    }
    expect(accountEmail("  Ra jat＠Acme.COM ")).toBe("ra jat@acme.com"); expect(INVISIBLE_RE.source).toContain("\\u0085"); expect(INVISIBLE_RE.source).toContain("\\u2028");
  });
  test("sign-up and sign-in refuse each one (no account is made), and a clean address is taken", async () => {
    for (const c of INVIS) for (const e of [`ra${c}jat@acme.com`, `rajat@ac${c}me.com`, `rajat${c}＠acme.com ${c}x`]) for (const path of ["/api/start", "/api/auth/email"]) {
      const r = await call("POST", path, { email: e }); expect([e.codePointAt(2)!.toString(16), path, r.status]).toEqual([e.codePointAt(2)!.toString(16), path, 400]); expect((await j(r)).error).toBe("Please enter a valid e-mail address.");
    }
    for (const s of ["ra jat@acme.com", "rajat@ac me.com", "ra\tjat@acme.com", "ra\u3000jat@acme.com", "ra\u00a0jat@acme.com"]) expect([s, (await call("POST", "/api/start", { email: s })).status]).toEqual([s, 400]);
    expect(count("SELECT COUNT(*) c FROM organizer_email")).toBe(0);
    expect((await call("POST", "/api/start", { email: "rajat@acme.com" })).status).toBe(200);
  });
  test("Host add refuses each invisible character inside the address; no Host key is made", async () => {
    const o = await j(await call("POST", "/api/start", { email: "boss@acme.com" })), key = o.token as string;
    for (const c of INVIS) { const r = await call("POST", "/api/org/host", { label: "Anita", email: `ho${c}st@acme.com` }, key); expect([c.codePointAt(0)!.toString(16), r.status]).toEqual([c.codePointAt(0)!.toString(16), 400]); }
    expect(count("SELECT COUNT(*) c FROM organizer_key WHERE kind='host'")).toBe(0);
  });
});

describe("D. id-kind lock (the sentences, who counts)", () => {
  const locked = async (r: Response, msg: string) => { expect(r.status).toBe(409); const b = await j(r); expect([b.code, b.error]).toEqual(["id-kind-locked", msg]); };
  test("kind of ID changed -> 'different kind of ID'; only verify changed -> 'different way of asking for IDs'; both changed -> the kind sentence", async () => {
    const t = await setup(); await add(t.master, [{ name: "Asha", empId: "E101" }]);
    await locked(await patch(t.master, { idKind: "email" }), LOCKED_KIND);
    await locked(await patch(t.master, { verify: "both" }), LOCKED_VERIFY);
    await locked(await patch(t.master, { verify: "mobile" }), LOCKED_VERIFY);
    await locked(await patch(t.master, { verify: "mobile", idKind: "email" }), LOCKED_KIND);
    expect((await patch(t.master, { verify: "id", idKind: "emp", name: "Renamed" })).status).toBe(200);
  });
  test("it is checked for the Email-ID kind too, and the person LISTED (nobody joined) is enough", async () => {
    const t = await setup({ idKind: "email" }); await add(t.master, [{ name: "Asha", empId: "asha@acme.com" }]);
    await locked(await patch(t.master, { idKind: "emp" }), LOCKED_KIND); await locked(await patch(t.master, { verify: "either" }), LOCKED_VERIFY);
  });
  test("nobody holding an ID hash (a game with nobody, or only removed people): free to change both ways", async () => {
    const t = await setup(); expect((await patch(t.master, { idKind: "email" })).status).toBe(200); expect((await patch(t.master, { verify: "mobile" })).status).toBe(200);
    expect((await patch(t.master, { verify: "id", idKind: "emp" })).status).toBe(200);
    await add(t.master, [{ name: "Asha", empId: "E101" }]); raw.prepare("UPDATE person SET status='removed' WHERE eid='PPL-1'").run();
    expect((await patch(t.master, { idKind: "email" })).status).toBe(200);
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------
// PRODUCT DEFECTS. These encode the owner rules. They are RED today. Do not change them to match the code; the product coder fixes the code (see docs/TESTER_REPORT.md).
describe("E. PRODUCT DEFECT D1: an employee ID over 30 characters once cleaned must say 'This ID is too long...'", () => {
  test("PRODUCT DEFECT D1 (join): 31 cleaned characters -> 400 with the too-long sentence", async () => {
    await setup(); const r = await join("PPL-1", { name: "Long", empId: "A".repeat(31), device: dev(7) });
    expect(r.status).toBe(400); expect((await j(r)).error).toBe(TOO_LONG);
  });
  test("PRODUCT DEFECT D1 (list add): the 'why' of a 31-character row is the too-long sentence", async () => {
    const t = await setup(); const r = await j(await add(t.master, [{ name: "Long", empId: "A".repeat(31) }]));
    expect(r.added).toBe(0); expect(r.invalid[0].why).toBe(TOO_LONG);
  });
  test("PRODUCT DEFECT D1 (/who): the same sentence", async () => {
    await setup(); const w = await call("POST", "/api/z/PPL-1/who", { empId: "A".repeat(31), consent: consentFor("K4") });
    expect(w.status).toBe(400); expect((await j(w)).error).toBe(TOO_LONG);
  });
  test("a symbol-only ID keeps the 'letters and numbers only' sentence (this is NOT the too-long case)", async () => {
    await setup(); const r = await join("PPL-1", { name: "S", empId: "---", device: dev(8) }); expect(r.status).toBe(400); expect((await j(r)).error).not.toBe(TOO_LONG);
  });
});

describe("E. PRODUCT DEFECT D2: endedAtMs (real end of game) is not returned by the Worker", () => {
  // The rule: endedAtMs is the real end of the game. Phones-confirmed or organizer end: returned whatever the clock. Scheduled end: recomputed at read time (+60 s), returned only once now >= bound.
  // Absent while the game can be live. Never moves once returned. A purge/erase is not an end. A cancel is not an end. The nearest thing today is GET /api/z/:id/life, which has `endMs` (always present).
  const life = async (key: string, now: number) => j(await call("GET", "/api/z/PPL-1/life", undefined, key, now));
  test("PRODUCT DEFECT D2: the answer of /life never has an `endedAtMs` key (today it has `endMs`, present even while the game can be live)", async () => {
    const t = await setup(); const early = await life(t.master, T);
    expect("endMs" in early).toBe(true); // what exists today
    expect(early.started).toBe(false);
    expect("endedAtMs" in early).toBe(false); // absent while the game can be live (this part of the rule holds only because the key does not exist at all)
    const bound = early.endMs as number;
    const after = await life(t.master, bound);
    expect(after.endedAtMs).toBe(bound); // RED: returned once now >= bound
  });
  test("PRODUCT DEFECT D2: a phones-confirmed end is returned whatever the clock, and never moves", async () => {
    const t = await setup(); const early = await life(t.master, T);
    raw.prepare("INSERT INTO life(eid,end_ms,end_src) VALUES('PPL-1',?,'phones')").run(T + 1234);
    const a = await life(t.master, T), b = await life(t.master, early.endMs + 10 * 86400_000);
    expect([a.endedAtMs, b.endedAtMs]).toEqual([T + 1234, T + 1234]); // RED
  });
  test("PRODUCT DEFECT D2: a scheduled end never moves once returned", async () => {
    const t = await setup(); const bound = (await life(t.master, T)).endMs as number;
    const a = await life(t.master, bound), b = await life(t.master, bound + 3 * 86400_000);
    expect([a.endedAtMs, b.endedAtMs]).toEqual([bound, bound]); // RED
  });
  test("a purge/erase is not an end: a purged game with no real end has no endedAtMs (true today only because the key does not exist)", async () => {
    const t = await setup(); raw.prepare("INSERT INTO life(eid,end_ms,end_src,purged_ms) VALUES('PPL-1',?,'organizer',?)").run(T + 5, T + 5);
    const p = await life(t.master, T + 10); expect(p.purged).toBe(true); expect(p.endedAtMs).toBeUndefined();
  });
});
