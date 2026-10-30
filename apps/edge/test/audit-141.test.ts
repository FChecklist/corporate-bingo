// Bingo 1.4.1 audit fixes (branch fix/bingo-1.4.1-audit-2026-10-30, docs/TEST_HANDOFF.md "1.4.1 audit fixes").
// Items covered here: 1 (Email ID shape check + real backslashes), 2 (account e-mail keeps inner spaces, participant Email ID removes them), 3 (server side of the ID hints:
// e-mail in an employee-ID game, idClean in /info and the summary, /who), 4 (id-kind-locked), 5 (the two deploy-instant constants), 6 (rehearsal created_ms, safe column add, 0030).
// Every test says which product line breaks it (the break is applied and undone by docs/audit141-break-checks.sh; results are in TESTER_REPORT.md).
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { readdirSync, readFileSync } from "node:fs";
import { join as pjoin } from "node:path";
import { type Env, type D1 } from "../src/worker";
import { handle, consentFor } from "./with-terms";
import type { PayEnv } from "../src/pay";
import { normId, normEmp, badIdMessage, looksLikeEmail, EMP_CLEAN_FROM_MS, EMP_LOOKS_LIKE_EMAIL } from "../src/people";
import { accountEmail, emailKey } from "../src/emailkey";
import { APPROVAL_RULES_FROM_MS, approvalRulesOn, waitSince, WAIT_LIMIT_MS } from "../src/approvals";
import { REHEARSAL_SCHEMA, ensureRehearsalColumns, resetRehearsalColumnsFlag, startRehearsal } from "../src/rehearsal";
import { makeD1 } from "./d1-sqlite";

const SRC = pjoin(import.meta.dir, "../src");
const MIG = pjoin(import.meta.dir, "../migrations");
const PUBLIC = pjoin(import.meta.dir, "../../web/public");
const T = Date.UTC(2026, 9, 1, 10, 0, 0);
const GEN = 1692803367;
const roundAt = (ms: number) => Math.floor((ms / 1000 - GEN) / 3) + 1;
const START = roundAt(T) + 1200; // one hour after T
const INCOMPLETE = "Please check your Email ID. It looks incomplete.";
const OLD_EMP_MSG = "An employee ID has letters and numbers only (up to 30).";
const LOCKED_MSG = "You already have people listed. Start a new game to use a different kind of ID.";
const ZW = "​‌‍⁠﻿";
let env: PayEnv; let raw: Database; let ipN = 0;
const realFetch = globalThis.fetch;
const call = (method: string, path: string, body?: unknown, key?: string, now = T, extra: Record<string, string> = {}) =>
  handle(new Request("http://x" + path, { method, headers: { "content-type": "application/json", "cf-connecting-ip": `8.8.${Math.floor(++ipN / 250)}.${ipN % 250}`, ...(key ? { "x-organizer": key } : {}), ...extra }, body: body === undefined ? undefined : JSON.stringify(body) }), env as Env, now);
const j = async (r: Response) => (await r.json()) as any;
const mob = (i: number) => "9" + String(100000000 + i);
const dev = (i: number) => (String(i).padStart(2, "0") + "b".repeat(32)).slice(0, 32);
const join = (id: string, body: Record<string, unknown>, now = T) => call("POST", `/api/z/${id}/join`, body, undefined, now);
const joinAs = (id: string, i: number, extra: Record<string, unknown> = {}, now = T) => join(id, { phone: mob(i), name: "G" + i, device: dev(i), ...extra }, now);
const rows = (sql: string, ...v: unknown[]) => raw.prepare(sql).all(...(v as any[])) as any[];
const count = (sql: string, ...v: unknown[]) => (raw.prepare(sql).get(...(v as any[])) as any).c as number;

async function setup(opts: { closed?: boolean; verify?: string; employeesOnly?: boolean; idKind?: string; createdMs?: number; id?: string } = {}) {
  const id = opts.id ?? "PPL-1";
  const st = await j(await handle(new Request("http://x/api/start", { method: "POST", headers: { "content-type": "application/json", "cf-connecting-ip": `7.7.7.${++ipN % 250}` }, body: JSON.stringify({ email: `o${ipN}@acme.com` }) }), env as Env, T));
  const master = st.token as string;
  await call("POST", "/api/z", { id, startRound: START, callSeconds: 6, cap: 100, ...(opts.closed ? { whoCanJoin: "list" } : {}) }, master);
  await call("POST", `/api/z/${id}/publish`, { email: "boss@acme.com", phone: "98765 43210" }, master);
  const body = { ...(opts.verify ? { verify: opts.verify } : {}), ...(opts.idKind ? { idKind: opts.idKind } : {}), ...(opts.employeesOnly !== undefined ? { employeesOnly: opts.employeesOnly } : {}) };
  if (Object.keys(body).length) expect((await call("PATCH", `/api/z/${id}/settings`, body, master)).status).toBe(200);
  if (opts.createdMs !== undefined) raw.prepare("UPDATE engagement SET created_ms=? WHERE id=?").run(opts.createdMs, id);
  return { master, id };
}
const add = (key: string, people: unknown[], id = "PPL-1") => call("POST", `/api/z/${id}/people`, { people }, key);
const patch = (key: string, body: unknown, id = "PPL-1") => call("PATCH", `/api/z/${id}/settings`, body, key);

beforeEach(() => {
  const d = makeD1(); raw = d.raw; resetRehearsalColumnsFlag();
  env = { DB: d.db, ORGANIZER_SECRET: "plat", DAILY_WRITE_BUDGET: "1000000", PUBLIC_ORIGIN: "https://bingo.test", PHONE_SALT: "salt", TEST_MODE: "1" } as PayEnv;
  (globalThis as any).fetch = async () => new Response("{}", { status: 404 });
});
afterEach(() => { globalThis.fetch = realFetch; });

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------
describe("1. EMAIL_ID_RE (people.ts) and the cleaners: real backslashes", () => {
  test("Email IDs that contain the letter s are ACCEPTED (the lost-backslash bug refused them)", () => {
    for (const ok of ["sales＠acme.com", "rahul.sharma＠x.com", "assist＠gmail.com", "SALES＠ACME.COM", "sss@sss.ss", "s@s.ss", "Susan.Stones+news@Starsys.co.in"])
      expect([ok, normId(ok, "email")]).toEqual([ok, emailKey(ok)]);
    expect(normId("sales＠acme.com", "email")).toBe("sales@acme.com");
    expect(normId("rahul.sharma＠x.com", "email")).toBe("rahul.sharma@x.com");
    expect(normId("assist＠gmail.com", "email")).toBe("assist@gmail.com");
    expect(normId("SALES＠ACME.COM", "email")).toBe("sales@acme.com");
  });
  test("incomplete addresses are refused (null), nothing typed is '' (not an error)", () => {
    for (const bad of ["a@b", "a@bcom", "x@.com", "@acme.com", "a@@b.com", "a@b@c.com", "a@b.c", "acme.com", "sales", "sales@", "s@s", "a@b.", "plain text", "a".repeat(65) + "@acme.com", "a@" + "b".repeat(250) + ".com"])
      expect([bad, normId(bad, "email")]).toEqual([bad, null]);
    for (const nothing of ["", "   ", "\t\n", ZW, " " + ZW + " ", null, undefined]) expect([nothing, normId(nothing as any, "email")]).toEqual([nothing, ""]);
    expect(badIdMessage("a@b", "email")).toBe(INCOMPLETE);
  });
  test("the dot before the last part is a real dot (not 'any character')", () => {
    expect(normId("a@bxcom", "email")).toBeNull(); expect(normId("a@bscom", "email")).toBeNull(); expect(normId("a@b-com", "email")).toBeNull(); expect(normId("a@b_com", "email")).toBeNull();
    expect(normId("a@b.com", "email")).toBe("a@b.com");
  });
  test("inner spaces of every kind are removed from a participant Email ID; the result is lower case and has no white space", () => {
    expect(normId("a b@c.com", "email")).toBe("ab@c.com");
    expect(normId("ra jat＠acme.com", "email")).toBe("rajat@acme.com");
    expect(normId(" S a l e s @ A c m e . c o m ", "email")).toBe("sales@acme.com");
    for (const ws of ["\t", "\n", "\r", " ", "　", " ", "\v", "\f"]) expect([ws, normId(`sa${ws}les@ac${ws}me.com`, "email")]).toEqual([ws, "sales@acme.com"]);
  });
  test("zero-width characters are stripped (all five), and ONLY those: the letters u, B, F, E, C, D and the digits 2, 0, 6 stay", () => {
    for (const z of ["​", "‌", "‍", "⁠", "﻿"]) expect([z.charCodeAt(0).toString(16), normId(`sa${z}les@ac${z}me.com`, "email"), emailKey(`sa${z}les@acme.com`), accountEmail(`sa${z}les@acme.com`)]).toEqual([z.charCodeAt(0).toString(16), "sales@acme.com", "sales@acme.com", "sales@acme.com"]);
    // a regex that lost its backslash would treat the text "u200B-u200D" as a character range (B to u: most capital and lower-case letters) and eat the address
    const tricky = "Bu200Dfeff2060CE@Dubai-U200B.com";
    expect(emailKey(tricky)).toBe("bu200dfeff2060ce@dubai-u200b.com");
    expect(accountEmail(tricky)).toBe("bu200dfeff2060ce@dubai-u200b.com");
    expect(normId(tricky, "email")).toBe("bu200dfeff2060ce@dubai-u200b.com");
    expect(normId(ZW + "s" + ZW + "@" + ZW + "s.ss" + ZW, "email")).toBe("s@s.ss");
    // the employee-ID presence test (people.ts:21) uses the same strip: only zero-width text means "nothing typed"
    expect(normEmp(ZW, EMP_CLEAN_FROM_MS)).toBe(""); expect(normEmp("u200B", EMP_CLEAN_FROM_MS)).toBe("U200B");
  });
  test("full-width letters, digits, dot and at-sign (NFKC) become the plain address", () => {
    expect(normId("ＳＡＬＥＳ１＠ＡＣＭＥ．ＣＯＭ", "email")).toBe("sales1@acme.com");
  });
  test("accountEmail KEEPS inner spaces (trim, NFKC, lower case, zero-width dropped); emailKey removes them", () => {
    expect(accountEmail("  Ra jat＠Acme.COM \t")).toBe("ra jat@acme.com");
    expect(accountEmail(`s${ZW}ales＠acme.com`)).toBe("sales@acme.com");
    expect(emailKey("  Ra jat＠Acme.COM \t")).toBe("rajat@acme.com");
    expect(accountEmail(undefined)).toBe(""); expect(accountEmail(null)).toBe(""); expect(emailKey(12 as any)).toBe("12");
  });
  test("source scan: no regex in the edge or page code lost a backslash (the letter s, the zero-width list and the dot)", () => {
    const files = [...readdirSync(SRC).filter((f) => f.endsWith(".ts")).map((f) => pjoin(SRC, f)), ...["z.js", "zc.js", "zc-flow.js", "zc-flow-game.js", "guide.js", "z-join.js"].map((f) => pjoin(PUBLIC, f)).filter((f) => { try { readFileSync(f); return true; } catch { return false; } })];
    expect(files.length).toBeGreaterThan(40);
    const hits: string[] = [];
    for (const f of files) readFileSync(f, "utf8").split("\n").forEach((l, i) => {
      if (/\[\^s@\]/.test(l)) hits.push(`${f}:${i + 1} class [^s@] (the letter s, not white space)`);
      if (/(?<!\\)u(200[BCD]|2060|FEFF)/i.test(l) && /\[[^\]]*(?<!\\)u200[BCD]/i.test(l)) hits.push(`${f}:${i + 1} u200B without its backslash inside a character class`);
      if (/\[s\\u|\[su200|\[s\\\\u/i.test(l)) hits.push(`${f}:${i + 1} [s...] where [\\s...] was meant`);
      if (/\{1,255\}\.\[\^/.test(l)) hits.push(`${f}:${i + 1} the dot before the last part is not escaped`);
    });
    expect(hits).toEqual([]);
    // and the exact shape lives where the handoff says
    expect(readFileSync(pjoin(SRC, "people.ts"), "utf8")).toContain("const EMAIL_ID_RE = /^[^\\s@]{1,64}@[^\\s@]{1,255}\\.[^\\s@]{2,}$/;");
    expect(readFileSync(pjoin(SRC, "emailkey.ts"), "utf8")).toContain("replace(/[\\u200B-\\u200D\\u2060\\uFEFF]/g, \"\")");
    expect(readFileSync(pjoin(SRC, "emailkey.ts"), "utf8")).toContain("replace(/\\s+/g, \"\")");
    for (const f of ["hostsetup.ts", "google.ts", "helpdesk.ts", "pay.ts", "worker.ts", "partners.ts"]) expect([f, readFileSync(pjoin(SRC, f), "utf8").includes("[^\\s@]{1,64}@[^\\s@]{1,255}\\.[^\\s@]{2,}$")]).toEqual([f, true]);
    expect(readFileSync(pjoin(PUBLIC, "zc.js"), "utf8")).toContain("/^[^\\s@]{1,64}@[^\\s@]{1,255}\\.[^\\s@]{2,}$/");
    const zc = readFileSync(pjoin(PUBLIC, "zc.js"), "utf8"), z = readFileSync(pjoin(PUBLIC, "z.js"), "utf8");
    expect(zc).toContain("replace(/[\\s\\u200B-\\u200D\\u2060\\uFEFF]/g, \"\")"); expect(z).toContain("replace(/[\\s\\u200B-\\u200D\\u2060\\uFEFF]/g, \"\")");
  });
  test("the same words through the real game: an Email-ID game ACCEPTS sales／rahul.sharma／assist and refuses a half address", async () => {
    const t = await setup({ verify: "id", employeesOnly: true, idKind: "email" });
    const r = await j(await add(t.master, [{ name: "A", empId: "sales＠acme.com" }, { name: "B", empId: "rahul.sharma＠x.com" }, { name: "C", empId: "assist＠gmail.com" }, { name: "D", empId: "a@b" }, { name: "E", empId: "a@bcom" }, { name: "F", empId: "x@.com" }]));
    expect(r.added).toBe(3); expect(r.invalid.length).toBe(3);
    const list = (await j(await call("GET", "/api/z/PPL-1/people", undefined, t.master))).people.map((p: any) => p.empId).sort();
    expect(list).toEqual(["assist@gmail.com", "rahul.sharma@x.com", "sales@acme.com"]);
    expect((await joinAs("PPL-1", 1, { phone: undefined, empId: "SALES＠ACME.COM" })).status).toBe(200);
    const bad = await joinAs("PPL-1", 2, { phone: undefined, empId: "a@b" }); expect(bad.status).toBe(400); expect((await j(bad)).error).toBe(INCOMPLETE);
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------
describe("2. account / sign-in / Host / payment / form e-mails REFUSE inner spaces; the participant Email ID removes them", () => {
  const SPACED = ["ra jat＠acme.com", "ra jat@acme.com", "rajat@ac me.com", " ra jat@acme.com "];
  test("sign-up (/api/start) and sign-in (/api/auth/email): refused with the plain message, no account is made", async () => {
    for (const e of SPACED) {
      for (const path of ["/api/start", "/api/auth/email"]) { const r = await call("POST", path, { email: e }); expect([e, path, r.status]).toEqual([e, path, 400]); expect((await j(r)).error).toBe("Please enter a valid e-mail address."); }
    }
    expect(count("SELECT COUNT(*) c FROM organizer_email")).toBe(0);
  });
  test("one account, many spellings: 'Rajat1＠Demo.com ' and 'rajat1@demo.com' are the same account", async () => {
    const a = await j(await call("POST", "/api/start", { email: "Rajat1＠Demo.com " })); expect(a.ok).toBe(true); expect(a.exists).toBeUndefined();
    const b = await j(await call("POST", "/api/start", { email: "rajat1@demo.com" })); expect(b.exists).toBe(true);
    const c = await j(await call("POST", "/api/start", { email: "RAJAT1＠DEMO.COM" })); expect(c.exists).toBe(true);
    expect(count("SELECT COUNT(*) c FROM organizer_email")).toBe(1);
    const d = await call("POST", "/api/auth/email", { email: "Rajat1＠Demo.com " }); expect(d.status).toBe(200);
  });
  test("Host add: an e-mail with an inner space is refused; the same e-mail without it is taken", async () => {
    const o = await j(await call("POST", "/api/start", { email: "boss@acme.com" })), key = o.token as string;
    for (const e of ["ho st@acme.com", "host@ac me.com"]) { const r = await call("POST", "/api/org/host", { label: "Anita", email: e }, key); expect([e, r.status]).toEqual([e, 400]); expect((await j(r)).error).toBe("That e-mail address does not look right. Please check it."); }
    expect(count("SELECT COUNT(*) c FROM organizer_key WHERE kind='host'")).toBe(0);
    expect((await call("POST", "/api/org/host", { label: "Anita", email: "Host＠Acme.com " }, key)).status).toBe(200);
  });
  test("Host first-open e-mail (/api/host/setup/email): an inner space is refused", async () => {
    const o = await j(await call("POST", "/api/start", { email: "boss@acme.com" })), key = o.token as string;
    const h = await j(await call("POST", "/api/org/host", { label: "Anita", mobile: "9822200011" }, key)); expect(h.hostKey).toBeTruthy();
    for (const e of ["ho st@acme.com", "host@ac me.com"]) { const r = await call("POST", "/api/host/setup/email", { email: e }, h.hostKey); expect([e, r.status, (await j(r)).error]).toEqual([e, 400, "Please enter a valid e-mail address."]); }
  });
  test("payment forms (/api/checkout, /api/payments/paytest) refuse an inner space", async () => {
    Object.assign(env, { RAZORPAY_KEY_ID: "rzp_test_x", RAZORPAY_KEY_SECRET: "sek", RAZORPAY_BASE_URL: "https://rzp.test/v1" }); // payments switched on, so the refusal comes from the e-mail check
    const o = await j(await call("POST", "/api/start", { email: "boss@acme.com" })), key = o.token as string;
    await call("POST", "/api/z", { id: "PAY-1", startRound: START, callSeconds: 6, cap: 100 }, key);
    for (const e of ["pa yer@acme.com", "payer@ac me.com"]) {
      const r = await call("POST", "/api/checkout", { eid: "PAY-1", org: "Acme", name: "Boss", email: e, country: "IN", taxId: "", currency: "INR" }, key); expect([e, r.status]).toEqual([e, 400]); expect((await j(r)).error).toBe("Enter a valid e-mail address.");
      const p = await call("POST", "/api/payments/paytest", { name: "Boss", email: e, country: "IN", currency: "INR" }); expect([e, p.status]).toEqual([e, 400]);
    }
  });
  test("form e-mails: Refer & earn enrolment and the helpdesk helper refuse an inner space", async () => {
    for (const e of ["as ha@partner.example", "asha@part ner.example"]) {
      const r = await call("POST", "/api/partner/enroll", { phone: "98111 22233", name: "Asha", email: e, consent: true }); expect([e, r.status]).toEqual([e, 400]); expect((await j(r)).error).toBe("Enter a valid e-mail address. We send you a code.");
    }
    const a = await j(await call("POST", "/api/partner/enroll", { phone: "98111 22233", name: "Asha", email: "asha@partner.example", consent: true })); expect(a.ok).toBe(true);
    const v = await j(await call("POST", "/api/partner/enroll/verify", { email: "asha@partner.example", code: a.devCode })); expect(v.partnerKey).toBeTruthy();
    const h = await call("POST", "/api/helpdesk/join", { email: "as ha@partner.example" }, undefined, T, { "x-partner": v.partnerKey }); expect(h.status).toBe(400);
  });
  test("the participant Email ID is the opposite: 'ra jat＠acme.com' becomes rajat@acme.com on the list and at join", async () => {
    const t = await setup({ verify: "id", employeesOnly: true, idKind: "email" });
    const r = await j(await add(t.master, [{ name: "Raj", empId: "ra jat＠acme.com" }])); expect(r.added).toBe(1);
    expect((await j(await call("GET", "/api/z/PPL-1/people", undefined, t.master))).people[0].empId).toBe("rajat@acme.com");
    expect((await joinAs("PPL-1", 1, { phone: undefined, empId: " R A J A T@ACME.com" })).status).toBe(200);
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------
describe("3. employee-ID game vs Email ID: plain refusal, no 'The system will read this as'; Email-ID games use the e-mail cleaner; idClean; /who", () => {
  const EMAILS = ["rajat1@demo.com", "RAJAT1＠DEMO.COM", "ra jat@x.com", "sales@acme.com"];
  test("looksLikeEmail / normId / badIdMessage: in a game on the new rule an e-mail is refused, never mangled", () => {
    expect(looksLikeEmail("a＠b.com")).toBe(true); expect(looksLikeEmail("1B-678")).toBe(false);
    for (const e of EMAILS) { expect([e, normId(e, "emp", EMP_CLEAN_FROM_MS)]).toEqual([e, null]); expect(badIdMessage(e, "emp", EMP_CLEAN_FROM_MS)).toBe(EMP_LOOKS_LIKE_EMAIL); expect(badIdMessage(e, "emp", EMP_CLEAN_FROM_MS)).not.toMatch(/read this as/i); }
    for (const e of EMAILS) { expect(normId(e, "emp", EMP_CLEAN_FROM_MS - 1)).toBeNull(); expect(badIdMessage(e, "emp", EMP_CLEAN_FROM_MS - 1)).toBe(OLD_EMP_MSG); } // an older game: old words, old rule
    expect(EMP_LOOKS_LIKE_EMAIL).toBe("This looks like an Email ID. This game asks for an employee ID: letters and numbers only.");
  });
  test("new-rule employee-ID game: join and the people list answer with the plain refusal; /who answers the same 400 (code bad-id)", async () => {
    const t = await setup({ verify: "id", employeesOnly: true, createdMs: EMP_CLEAN_FROM_MS });
    await add(t.master, [{ name: "Asha", empId: "RAJAT1DEMOCOM" }]);
    for (const e of EMAILS) {
      const r = await joinAs("PPL-1", 1, { phone: undefined, empId: e }); expect([e, r.status]).toEqual([e, 400]);
      const m = (await j(r)).error as string; expect(m).toBe(EMP_LOOKS_LIKE_EMAIL); expect(m).not.toMatch(/read this as/i);
      const w = await call("POST", "/api/z/PPL-1/who", { empId: e, consent: consentFor("K4") }); expect([e, w.status]).toEqual([e, 400]);
      const wj = await j(w); expect(wj.code).toBe("bad-id"); expect(wj.error).toBe(EMP_LOOKS_LIKE_EMAIL); expect(wj.known).toBeUndefined();
    }
    // nothing was mangled into RAJAT1DEMOCOM: the listed person has not come in
    expect(count("SELECT COUNT(*) c FROM participant WHERE eid='PPL-1'")).toBe(0);
    const r = await j(await add(t.master, [{ name: "X", empId: "x@y.com" }])); expect(r.added).toBe(0); expect(r.invalid.length).toBe(1);
    expect(JSON.stringify(r.invalid)).toContain("Email ID"); expect(JSON.stringify(r)).not.toMatch(/read this as/i);
    // an empty ID is not an error, and a plain unknown employee ID is 'known: false' as before
    const empty = await j(await call("POST", "/api/z/PPL-1/who", { empId: "  ", consent: consentFor("K4") })); expect(empty).toEqual({ known: false });
    const unk = await call("POST", "/api/z/PPL-1/who", { empId: "ZZ99", consent: consentFor("K4") }); expect(unk.status).toBe(200); expect((await j(unk)).known).toBe(false);
  });
  test("a game made BEFORE the new rule keeps the old words and old rule (no email hint), also through /who", async () => {
    const t = await setup({ verify: "id", employeesOnly: true, createdMs: EMP_CLEAN_FROM_MS - 1 });
    const r = await joinAs("PPL-1", 1, { phone: undefined, empId: "rajat1@demo.com" }); expect(r.status).toBe(400); expect((await j(r)).error).toBe(OLD_EMP_MSG);
    const w = await call("POST", "/api/z/PPL-1/who", { empId: "rajat1@demo.com", consent: consentFor("K4") }); expect(w.status).toBe(400); const wj = await j(w); expect(wj.code).toBe("bad-id"); expect(wj.error).toBe(OLD_EMP_MSG);
    void t;
  });
  test("Email-ID game: /who refuses an incomplete address with the same plain 400 as join; a complete unknown one is 'known: false'; known one gives the name", async () => {
    const t = await setup({ verify: "id", employeesOnly: true, idKind: "email" });
    await add(t.master, [{ name: "Rahul Sharma", empId: "rahul.sharma@x.com" }]);
    const ck = { consent: consentFor("K4") };
    for (const bad of ["a@b", "rahul", "x@.com"]) { const w = await call("POST", "/api/z/PPL-1/who", { empId: bad, ...ck }); expect([bad, w.status]).toEqual([bad, 400]); const wj = await j(w); expect(wj.code).toBe("bad-id"); expect(wj.error).toBe(INCOMPLETE); }
    expect(await j(await call("POST", "/api/z/PPL-1/who", { empId: "other@x.com", ...ck }))).toEqual({ known: false });
    expect(await j(await call("POST", "/api/z/PPL-1/who", { empId: "RAHUL.SHARMA＠X.COM", ...ck }))).toEqual({ known: true, name: "Rahul S." });
    expect(await j(await call("POST", "/api/z/PPL-1/who", { empId: "", ...ck }))).toEqual({ known: false });
  });
  test("Email-ID game cleaner is used at join (any case, spaces, full-width) and when listing; employee cleaner is not (rajat1@demo.com is not turned into RAJAT1DEMOCOM)", async () => {
    const t = await setup({ verify: "id", employeesOnly: true, idKind: "email" });
    await add(t.master, [{ name: "Asha", empId: "RAJAT1DEMOCOM@x.com" }]);
    expect((await joinAs("PPL-1", 1, { phone: undefined, empId: "rajat1demoCOM＠x.com" })).status).toBe(200);
    const p = (await j(await call("GET", "/api/z/PPL-1/people", undefined, t.master))).people; expect(p.map((x: any) => x.empId)).toEqual(["rajat1democom@x.com"]);
    expect(p[0].empId).not.toMatch(/[A-Z]/);
  });
  test("/info (public) and the summary (organizer) both return idClean: false before the deploy instant, true from it; the Email-ID kind is not date-gated", async () => {
    const o = await setup({ verify: "id", employeesOnly: true, id: "OLD-1", createdMs: EMP_CLEAN_FROM_MS - 1 });
    const n = await setup({ verify: "id", employeesOnly: true, id: "NEW-1", createdMs: EMP_CLEAN_FROM_MS });
    const e = await setup({ verify: "id", employeesOnly: true, idKind: "email", id: "EML-1", createdMs: EMP_CLEAN_FROM_MS - 1 });
    const d = await setup({ id: "DEF-1" }); // a game made today, before the constants are set: on the old rules
    for (const [id, key, want] of [["OLD-1", o.master, false], ["NEW-1", n.master, true], ["EML-1", e.master, false], ["DEF-1", d.master, false]] as const) {
      const info = await j(await call("GET", `/api/z/${id}/info`)); expect([id, "info", info.idClean]).toEqual([id, "info", want]);
      const sum = await j(await call("GET", `/api/z/${id}/summary`, undefined, key)); expect([id, "summary", sum.idClean]).toEqual([id, "summary", want]);
    }
    expect((await j(await call("GET", "/api/z/EML-1/info"))).idKind).toBe("email"); // not date-gated: an old-dated game still takes the Email ID
    expect((await joinAs("EML-1", 1, { phone: undefined, empId: "a@b.com" })).status).not.toBe(400);
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------
describe("4. PATCH idKind / verify: 409 id-kind-locked once anyone is LISTED (person) or JOINED (participant)", () => {
  const expectLocked = async (r: Response) => { expect(r.status).toBe(409); const b = await j(r); expect(b.code).toBe("id-kind-locked"); expect(b.error).toBe(LOCKED_MSG); };
  const cfgOf = async (t: { master: string }) => { const s = await j(await call("GET", "/api/z/PPL-1/summary", undefined, t.master)); return { verify: s.verify, idKind: s.idKind }; };
  test("nobody listed, nobody joined: idKind and verify can be changed, again and again", async () => {
    const t = await setup({ verify: "id" });
    expect(count("SELECT COUNT(*) c FROM person WHERE eid='PPL-1'")).toBe(0); expect(count("SELECT COUNT(*) c FROM participant WHERE eid='PPL-1'")).toBe(0);
    expect((await patch(t.master, { idKind: "email" })).status).toBe(200); expect(await cfgOf(t)).toEqual({ verify: "id", idKind: "email" });
    expect((await patch(t.master, { idKind: "emp" })).status).toBe(200); expect((await patch(t.master, { verify: "both", idKind: "email" })).status).toBe(200);
    expect((await patch(t.master, { verify: "mobile" })).status).toBe(200); expect(await cfgOf(t)).toEqual({ verify: "mobile", idKind: "email" });
  });
  test("one person LISTED (table person, nobody joined): changing idKind or verify is refused with the exact sentence; same values and other settings are fine", async () => {
    const t = await setup({ verify: "id", employeesOnly: true });
    expect((await j(await add(t.master, [{ name: "Asha", empId: "E101" }]))).added).toBe(1);
    expect(count("SELECT COUNT(*) c FROM person WHERE eid='PPL-1'")).toBe(1); expect(count("SELECT COUNT(*) c FROM participant WHERE eid='PPL-1'")).toBe(0);
    await expectLocked(await patch(t.master, { idKind: "email" }));
    await expectLocked(await patch(t.master, { verify: "both" }));
    await expectLocked(await patch(t.master, { verify: "mobile" }));
    expect(await cfgOf(t)).toEqual({ verify: "id", idKind: "emp" }); // nothing was written
    expect((await patch(t.master, { idKind: "emp", verify: "id" })).status).toBe(200); // the same values again
    expect((await patch(t.master, { name: "Renamed" })).status).toBe(200); // an unrelated change
  });
  test("one person JOINED (table participant, nobody listed): the same refusal", async () => {
    const t = await setup({ verify: "id" }); // not employees only: a name alone comes in
    expect((await join("PPL-1", { name: "Outsider", device: dev(9) })).status).toBe(200);
    expect(count("SELECT COUNT(*) c FROM participant WHERE eid='PPL-1'")).toBe(1);
    expect(count("SELECT COUNT(*) c FROM person WHERE eid='PPL-1'")).toBe(1); // joining also writes the person row; take it away so only the PARTICIPANT row can be what locks the game
    raw.prepare("DELETE FROM person WHERE eid='PPL-1'").run(); expect(count("SELECT COUNT(*) c FROM person WHERE eid='PPL-1'")).toBe(0);
    await expectLocked(await patch(t.master, { idKind: "email" }));
    await expectLocked(await patch(t.master, { verify: "both" }));
    expect(await cfgOf(t)).toEqual({ verify: "id", idKind: "emp" });
    expect((await patch(t.master, { verify: "id" })).status).toBe(200);
  });
  test("a mobile-number game: a joined guest locks it too", async () => {
    const t = await setup({});
    expect((await joinAs("PPL-1", 1)).status).toBe(200);
    await expectLocked(await patch(t.master, { verify: "id" })); await expectLocked(await patch(t.master, { idKind: "email" }));
  });
  test("a Host with the key gets the same refusal (the lock is not only for the Organizer)", async () => {
    const t = await setup({ verify: "id", employeesOnly: true });
    await add(t.master, [{ name: "Asha", empId: "E101" }]);
    const h = await j(await call("POST", "/api/org/host", { label: "Anita", mobile: "9822200011", email: "host@acme.com" }, t.master)); raw.prepare("UPDATE host_state SET verified_ms=1, mobile_ok=1").run();
    await expectLocked(await patch(h.hostKey, { idKind: "email" }));
  });
  test("pin: a person who was REMOVED from the list does not lock it (the server counts status<>'removed')", async () => {
    const t = await setup({ verify: "id", employeesOnly: true });
    await add(t.master, [{ name: "Asha", empId: "E101" }]); raw.prepare("UPDATE person SET status='removed' WHERE eid='PPL-1'").run();
    expect((await patch(t.master, { idKind: "email" })).status).toBe(200);
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------
describe("5. EMP_CLEAN_FROM_MS and APPROVAL_RULES_FROM_MS: 2099-01-01 until the release session sets them", () => {
  test("both default to 2099-01-01 (this test is the pre-release state: the release session changes the constants AND this expectation together)", () => {
    expect(EMP_CLEAN_FROM_MS).toBe(Date.UTC(2099, 0, 1)); expect(APPROVAL_RULES_FROM_MS).toBe(Date.UTC(2099, 0, 1));
    expect(Date.UTC(2099, 0, 1)).toBe(4070908800000);
  });
  test("employee ID rule, both sides of EMP_CLEAN_FROM_MS (old games keep the old rule)", () => {
    // old rule: spaces dropped, capitals, then must look like A-Z 0-9 . _ - / ; new rule: everything but A-Z 0-9 dropped
    for (const [typed, oldWant, newWant] of [["1b-678", "1B-678", "1B678"], ["1B/678", "1B/678", "1B678"], ["1B 678", "1B678", "1B678"], ["ab_12.3", "AB_12.3", "AB123"]] as const) {
      expect([typed, "old", normEmp(typed, EMP_CLEAN_FROM_MS - 1)]).toEqual([typed, "old", oldWant]);
      expect([typed, "new", normEmp(typed, EMP_CLEAN_FROM_MS)]).toEqual([typed, "new", newWant]);
      expect([typed, "unknown date", normEmp(typed, undefined)]).toEqual([typed, "unknown date", newWant]); // no date given: the new rule
    }
    expect(normEmp("!!!", EMP_CLEAN_FROM_MS)).toBeNull(); expect(normEmp("!!!", EMP_CLEAN_FROM_MS - 1)).toBeNull();
    expect(normEmp("A".repeat(31), EMP_CLEAN_FROM_MS)).toBeNull(); expect(normEmp("A".repeat(30), EMP_CLEAN_FROM_MS)).toBe("A".repeat(30));
  });
  test("a real game made today (before the constants are set) is on the OLD rule; the same game dated at the constant is on the new rule", async () => {
    const t = await setup({ verify: "id", employeesOnly: true });
    await add(t.master, [{ name: "Asha", empId: "1B-678" }]);
    expect((await j(await call("GET", "/api/z/PPL-1/people", undefined, t.master))).people[0].empId).toBe("1B-678"); // old rule keeps the dash
    const u = await setup({ verify: "id", employeesOnly: true, id: "PPL-2", createdMs: EMP_CLEAN_FROM_MS });
    await add(u.master, [{ name: "Asha", empId: "1B-678" }], "PPL-2");
    expect((await j(await call("GET", "/api/z/PPL-2/people", undefined, u.master))).people[0].empId).toBe("1B678");
    expect((await joinAs("PPL-2", 1, { phone: undefined, empId: "1b 678" }, T)).status).toBe(200); // listed as 1B678, typed another way
  });
  test("approval rules, both sides of APPROVAL_RULES_FROM_MS (30-minute wait limit, family cutoff, polite messages)", () => {
    expect(approvalRulesOn({ created_ms: APPROVAL_RULES_FROM_MS - 1 })).toBe(false); expect(approvalRulesOn({ created_ms: APPROVAL_RULES_FROM_MS })).toBe(true);
    expect(approvalRulesOn({ created_ms: T })).toBe(false); expect(approvalRulesOn({ created_ms: null })).toBe(false); expect(approvalRulesOn(undefined)).toBe(false); expect(approvalRulesOn({})).toBe(false);
    expect(waitSince({ created_ms: APPROVAL_RULES_FROM_MS - 1 }, T)).toBe(0); expect(waitSince({ created_ms: APPROVAL_RULES_FROM_MS }, T)).toBe(T - WAIT_LIMIT_MS);
  });
  test("end to end: an unlisted person waits for an old game for hours; for a game dated at APPROVAL_RULES_FROM_MS the wait lapses after the limit", async () => {
    const make = async (id: string, createdMs: number) => { const t = await setup({ id, closed: true }); raw.prepare("UPDATE engagement SET created_ms=? WHERE id=?").run(createdMs, id); return t; };
    const old = await make("WAIT-OLD", APPROVAL_RULES_FROM_MS - 1), nw = await make("WAIT-NEW", APPROVAL_RULES_FROM_MS);
    const wid: Record<string, string> = {};
    for (const id of ["WAIT-OLD", "WAIT-NEW"]) { const r = await join(id, { phone: mob(1), name: "Late", device: dev(1) }); const rj = await j(r); expect([id, r.status, rj.code]).toEqual([id, 403, "waiting"]); wid[id] = rj.wid; }
    const stateAt = async (id: string, ms: number) => (await j(await call("GET", `/api/z/${id}/me?wid=${wid[id]}`, undefined, undefined, ms))).state;
    expect([await stateAt("WAIT-OLD", T + 60_000), await stateAt("WAIT-NEW", T + 60_000)]).toEqual(["waiting", "waiting"]); // just now: both wait
    const later = T + WAIT_LIMIT_MS + 5 * 60_000; // still before the game starts
    expect(await stateAt("WAIT-OLD", later)).toBe("waiting"); // old game: waits as long as it takes (the 1.7.1 behaviour)
    expect(await stateAt("WAIT-NEW", later)).toBe("lapsed"); // game on the new rules: the request lapses
    void old; void nw;
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------
describe("6. rehearsal inherits created_ms; ensureRehearsalColumns adds only what is missing; migration 0030 and the runtime do not collide", () => {
  const OLD_CREATED = EMP_CLEAN_FROM_MS - 5 * 86_400_000;
  const paidGame = async (opts: Parameters<typeof setup>[0] = {}) => { const t = await setup(opts); raw.prepare("UPDATE engagement SET pack=100 WHERE id=?").run(t.id); return t; };
  const real = (id: string) => raw.prepare("SELECT * FROM engagement WHERE id=?").get(id) as any;
  const start = (id: string, now: number, b: unknown = {}) => startRehearsal(env as Env, real(id), b, now, "https://bingo.test", async () => true, (o, st) => new Response(JSON.stringify(o), { status: st ?? 200 }));
  test("a rehearsal is created with the REAL game's created_ms, not the clock", async () => {
    const t = await paidGame({ verify: "id", employeesOnly: true, createdMs: OLD_CREATED });
    await add(t.master, [{ name: "Asha", empId: "1B-678" }]);
    const later = T + 15 * 60_000; // before the start, so a rehearsal can begin
    const r = await start("PPL-1", later); const rj = await j(r); expect([r.status, rj.id]).toEqual([200, "PPL-1-R1"]);
    const row = rows("SELECT created_ms, rehearsal_of, run_no FROM engagement WHERE id='PPL-1-R1'")[0];
    expect(row.created_ms).toBe(OLD_CREATED); expect(row.created_ms).not.toBe(later); expect(row.rehearsal_of).toBe("PPL-1"); expect(row.run_no).toBe(1);
    // the rehearsal is on the same ID rule as its real game: old, so idClean false and the dash is kept
    expect((await j(await call("GET", "/api/z/PPL-1-R1/info", undefined, undefined, later))).idClean).toBe(false);
    expect(rj.people).toBe(1); expect(rows("SELECT COUNT(*) c FROM person WHERE eid='PPL-1-R1'")[0].c).toBe(1);
  });
  test("a rehearsal of a game on the NEW rule is on the new rule", async () => {
    const t = await paidGame({ verify: "id", employeesOnly: true, createdMs: EMP_CLEAN_FROM_MS + 1 });
    expect((await start("PPL-1", T + 60_000)).status).toBe(200); void t;
    expect(rows("SELECT created_ms FROM engagement WHERE id='PPL-1-R1'")[0].created_ms).toBe(EMP_CLEAN_FROM_MS + 1);
    expect((await j(await call("GET", "/api/z/PPL-1-R1/info"))).idClean).toBe(true);
  });
  // PRODUCT BUG (found 30 Oct, see TESTER_REPORT.md): the three rehearsal routes are handled in worker.ts (lines ~1549-1560) but "rehearsal", "rehearsals" and "rehearsalclose" are missing from the
  // route regex at worker.ts:1486, so every call answers 404 before it gets there. test.failing = this passes while the bug exists; the day the route works it turns red: delete the marker then.
  test.failing("the HTTP routes POST /rehearsal, GET /rehearsals and POST /rehearsalclose are reachable (they answer 404 today)", async () => {
    const t = await paidGame({ verify: "id", employeesOnly: true });
    expect((await call("GET", "/api/z/PPL-1/rehearsals", undefined, t.master, T + 60_000)).status).toBe(200);
    expect((await call("POST", "/api/z/PPL-1/rehearsal", {}, t.master, T + 60_000)).status).toBe(200);
  });
  test("pin (the bug above): today the three routes answer 404 Not found", async () => {
    const t = await paidGame({ verify: "id", employeesOnly: true });
    for (const [m, p] of [["GET", "/api/z/PPL-1/rehearsals"], ["POST", "/api/z/PPL-1/rehearsal"], ["POST", "/api/z/PPL-1/rehearsalclose"]] as const) expect([m, p, (await call(m, p, m === "POST" ? {} : undefined, t.master, T + 60_000)).status]).toEqual([m, p, 404]);
  });

  // a database as it was BEFORE 0030 / as it is AFTER it, built from the real migration files
  const migrationFiles = () => readdirSync(MIG).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort();
  const dbFrom = (files: string[]) => { const r = new Database(":memory:"); for (const f of files) r.exec(readFileSync(pjoin(MIG, f), "utf8")); return r; };
  const d1Over = (r: Database, log: string[] = []): D1 => { const stmt = (sql: string, vals: unknown[] = []): any => ({ bind: (...v: unknown[]) => stmt(sql, v), run: async () => { log.push(sql); const x = r.query(sql).run(...(vals as any[])); return { meta: { changes: x.changes } }; }, all: async () => ({ results: r.query(sql).all(...(vals as any[])) as any[] }), first: async () => (r.query(sql).get(...(vals as any[])) as any) ?? null }); return { prepare: (s: string) => stmt(s), batch: async (xs: any[]) => Promise.all(xs.map((x) => x.run())) } as D1; };
  const cols = (r: Database) => (r.query("SELECT name FROM pragma_table_info('engagement')").all() as any[]).map((x) => x.name as string);
  const NEW_COLS = ["rehearsal_of", "run_no", "rehearsal_closed_ms"];

  test("migration files apply cleanly on an empty database and 0030 is the one that adds the three columns", () => {
    const files = migrationFiles(); expect(files[files.length - 1]).toBe("0030_rehearsal.sql");
    const before = dbFrom(files.slice(0, -1)); for (const c of NEW_COLS) expect(cols(before)).not.toContain(c);
    const after = dbFrom(files); for (const c of NEW_COLS) expect(cols(after)).toContain(c);
    expect((after.query("SELECT name FROM sqlite_master WHERE type='index' AND name='engagement_rehearsal'").all() as any[]).length).toBe(1);
  });
  test("runtime AFTER the migration: no ALTER is run at all (nothing collides)", async () => {
    const r = dbFrom(migrationFiles()), log: string[] = []; resetRehearsalColumnsFlag();
    await ensureRehearsalColumns(d1Over(r, log));
    expect(log.filter((s) => /ALTER TABLE/.test(s))).toEqual([]);
    expect(cols(r).filter((c) => NEW_COLS.includes(c))).toEqual(NEW_COLS);
    await ensureRehearsalColumns(d1Over(r, log)); expect(log.filter((s) => /ALTER TABLE/.test(s))).toEqual([]); // and once the flag is set it asks nothing again
  });
  test("runtime BEFORE the migration: adds all three columns once; running the real 0030 file afterwards would collide, which is why the handoff says mark it applied by hand", async () => {
    const r = dbFrom(migrationFiles().slice(0, -1)), log: string[] = []; resetRehearsalColumnsFlag();
    await ensureRehearsalColumns(d1Over(r, log));
    expect(log.filter((s) => /ALTER TABLE/.test(s)).length).toBe(3); expect(cols(r).filter((c) => NEW_COLS.includes(c))).toEqual(NEW_COLS);
    expect(() => r.exec(readFileSync(pjoin(MIG, "0030_rehearsal.sql"), "utf8"))).toThrow(/duplicate column name/);
  });
  test("only the MISSING columns are added: with two of the three already there, exactly one ALTER runs, for the one that is missing", async () => {
    for (const missing of NEW_COLS) {
      const r = dbFrom(migrationFiles().slice(0, -1)), log: string[] = []; resetRehearsalColumnsFlag();
      const type: Record<string, string> = { rehearsal_of: "TEXT", run_no: "INTEGER", rehearsal_closed_ms: "INTEGER" };
      for (const c of NEW_COLS) if (c !== missing) r.run(`ALTER TABLE engagement ADD COLUMN ${c} ${type[c]}`);
      await ensureRehearsalColumns(d1Over(r, log));
      const alters = log.filter((s) => /ALTER TABLE/.test(s)); expect([missing, alters]).toEqual([missing, [`ALTER TABLE engagement ADD COLUMN ${missing} ${type[missing]}`]]);
      expect(cols(r).filter((c) => NEW_COLS.includes(c)).sort()).toEqual([...NEW_COLS].sort());
    }
  });
  test("REHEARSAL_SCHEMA is the same set of statements as the migration file", () => {
    const norm = (s: string) => s.split("\n").filter((l) => !l.trim().startsWith("--")).join(" ").replace(/\s+/g, " ").replace(/;\s*/g, ";").trim();
    expect(norm(readFileSync(pjoin(MIG, "0030_rehearsal.sql"), "utf8"))).toBe(REHEARSAL_SCHEMA.map((s) => s + ";").join(""));
  });
  test("the runtime also copes with a table that already has everything and a first call that raced another (second call finds them all)", async () => {
    const r = dbFrom(migrationFiles()); resetRehearsalColumnsFlag();
    await Promise.all([ensureRehearsalColumns(d1Over(r)), ensureRehearsalColumns(d1Over(r))]);
    expect(cols(r).filter((c) => NEW_COLS.includes(c))).toEqual(NEW_COLS);
  });
});
