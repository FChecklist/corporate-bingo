// Bingo 1.4.1 v3: a streamed matrix of 1,000,000 distinct EMPLOYEE-ID inputs against the owner rule:
//   NFKC, upper case, keep A-Z and 0-9, at most 30 after cleaning, nothing typed = empty (refused by the routes), an e-mail typed in an employee-ID game is refused (never mangled).
// Every input is BUILT from a unique core (its number in base 36 plus a filler), so the expected answer comes from the construction, never from the code under test.
// A second, independent rule (oracleEmp, code point by code point, no regex) is checked on every input as well. Distinct raw inputs are counted exactly (a Set), repeats are skipped and reported.
// The Email ID matrix (1,000,000 more inputs, now with U+0085 / U+2028 / U+2029) is audit-141-matrix.test.ts.
import { afterEach, beforeEach, describe, expect, test, setDefaultTimeout } from "bun:test";
import { normEmp, normId, EMP_CLEAN_FROM_MS } from "../src/people";
import { type Env } from "../src/worker";
import { handle } from "./with-terms";
import { makeD1 } from "./d1-sqlite";

setDefaultTimeout(180_000);
const N = 1_000_000;
const NEW = EMP_CLEAN_FROM_MS;
const FILL = "ABCDEFGHJKLMNPQRSTUVWXYZ0123456789";
const SEPS = ["-", "/", ".", "_", " ", "\t", "\u00a0", "\u3000", ",", ";", ":"];
const JUNK = ["#", "!", "*", "(", ")", "$", "%", "&", "+", "="];
const ZW = ["\u200b", "\u200c", "\u200d", "\u2060", "\ufeff", "\u0085", "\u2028", "\u2029"];
const SYM = ["!", "#", "%", "&", "*", "+", ",", ":", ";", "<", "=", ">", "?", "^", "~"];
const rng = (seed: number) => () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const fullWidth = (c: string) => (c >= "A" && c <= "Z" ? String.fromCharCode(c.charCodeAt(0) + 0xfee0) : c >= "0" && c <= "9" ? String.fromCharCode(c.charCodeAt(0) + 0xfee0) : c);
const circled = (c: string) => (c >= "1" && c <= "9" ? String.fromCharCode(0x2460 + c.charCodeAt(0) - 49) : c === "0" ? "⓪" : c);
/** the rule, a second way: code point by code point */
function oracleEmp(typed: string): string { let out = ""; for (const ch of typed.normalize("NFKC").toUpperCase()) { const c = ch.codePointAt(0)!; if ((c >= 48 && c <= 57) || (c >= 65 && c <= 90)) out += ch; } return out; }

type Case = { raw: string; want: string | null; kind: string };
/** the core: `len` characters of A-Z0-9 that end in the number of the case in base 36 (unique) */
function core(i: number, len: number): string { const n = i.toString(36).toUpperCase().padStart(4, "0"); let c = ""; for (let k = 0; k < len - n.length; k++) c += FILL[(i * 7 + k * 5) % FILL.length]; return c + n; }
function build(i: number): Case {
  const r = rng(i + 7), pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)]!;
  const k = i % 24, len = 4 + Math.floor(r() * 20); // 4..23
  let c = core(i, len), raw = "", want: string | null = c, kind = "";
  const lower = (s: string) => s.toLowerCase();
  const between = (s: string, f: () => string, every: number) => Array.from(s).map((ch, n) => (n > 0 && n % every === 0 ? f() + ch : ch)).join("");
  switch (k) {
    case 0: kind = "plain-upper"; raw = c; break;
    case 1: kind = "lower"; raw = lower(c); break;
    case 2: kind = "hyphens"; raw = between(lower(c), () => "-", 2 + Math.floor(r() * 3)); break;
    case 3: kind = "separators"; raw = between(c, () => pick(SEPS), 1 + Math.floor(r() * 3)); break;
    case 4: kind = "spaces-tabs"; raw = "  " + between(lower(c), () => pick([" ", "\t", "  "]), 2) + "\t "; break;
    case 5: kind = "full-width"; raw = Array.from(r() < 0.5 ? c : lower(c)).map((ch) => (/[A-Z0-9]/i.test(ch) ? (ch >= "a" && ch <= "z" ? String.fromCharCode(ch.charCodeAt(0) + 0xfee0) : fullWidth(ch)) : ch)).join(""); break;
    case 6: kind = "zero-width"; raw = between(lower(c), () => pick(ZW), 2); break;
    case 7: kind = "circled-digits"; raw = Array.from(c).map(circled).join(""); break;
    case 8: kind = "junk-around"; raw = pick(JUNK) + pick(JUNK) + lower(c) + pick(JUNK); break;
    case 9: kind = "mixed"; raw = " " + between(Array.from(c).map((ch, n) => (n % 3 === 0 ? fullWidth(ch) : n % 3 === 1 ? ch.toLowerCase() : ch)).join(""), () => pick(SEPS.concat(ZW)), 2) + pick(JUNK); break;
    case 10: kind = "exactly-30"; c = core(i, 30); want = c; raw = r() < 0.5 ? lower(c) : c; break;
    case 11: kind = "30-with-punctuation"; c = core(i, 30); want = c; raw = between(lower(c), () => pick(SEPS), 1) + "  ---  "; break; // about 60 typed characters, 30 cleaned
    case 12: kind = "31-plain"; c = core(i, 31); want = null; raw = c; break;
    case 13: kind = "31-40-punctuation"; c = core(i, 31 + Math.floor(r() * 10)); want = null; raw = between(lower(c), () => pick(SEPS), 2); break;
    case 14: kind = "symbols-only"; { let n = i, s = ""; do { s += SYM[n % SYM.length]; n = Math.floor(n / SYM.length); } while (n > 0); raw = "#" + s + "#"; want = null; } break;
    case 15: kind = "nothing-typed"; { let n = i, s = ""; do { s += n % 3 === 0 ? " " : n % 3 === 1 ? "\t" : ZW[(n >> 2) % ZW.length]; n = Math.floor(n / 3); } while (n > 0); raw = " " + s; want = ""; } break;
    case 16: kind = "email-shaped"; raw = lower(c) + "@" + pick(["acme.com", "x.co", "s.ss"]); want = null; break;
    case 17: kind = "ligature-fi"; c = "FI" + core(i, len); raw = "ﬁ" + lower(core(i, len)); want = c; break;
    case 18: kind = "sharp-s"; c = "SS" + core(i, len); raw = "ß" + core(i, len); want = c; break;
    case 19: kind = "accents-dropped"; raw = lower(c) + "é" + "É"; break;
    case 20: kind = "kelvin-sign"; c = "K" + core(i, len); raw = "K" + lower(core(i, len)); want = c; break;
    case 21: kind = "fullwidth-at-email"; raw = Array.from(lower(c)).map(fullWidth).join("") + "＠x.com"; want = null; break;
    case 22: kind = "29-plus-separator"; c = core(i, 29); want = c; raw = lower(c) + "-"; break;
    default: kind = "32-plus"; c = core(i, 32 + (i % 5)); want = null; raw = lower(c); break;
  }
  return { raw, want, kind };
}

describe("Employee ID matrix: 1,000,000 distinct raw inputs through normEmp / normId (new rule)", () => {
  test("every input is accepted, emptied or refused exactly as built, and agrees with the second rule; accepted IDs are A-Z0-9, at most 30, unique, and cleaning twice changes nothing", () => {
    const seen = new Set<string>(); let generated = 0, skipped = 0;
    const cleaned = new Set<string>();
    const per: Record<string, number> = {};
    let nextLineOnly = 0, accepted = 0, emptied = 0, refused = 0, wrong = 0, badChars = 0, over30 = 0, notIdempotent = 0, oracleDisagree = 0, normIdDisagree = 0, longest = 0, nonAscii = 0, withLower = 0, withSep = 0, withZw = 0, withFull = 0, over30Typed = 0;
    const examples: string[] = [];
    for (let i = 0; generated < N; i++) {
      if (i > N * 2) throw new Error("could not make enough distinct inputs");
      const c = build(i);
      if (seen.has(c.raw)) { skipped++; continue; } // a repeat of an earlier raw input: skipped, not counted
      seen.add(c.raw); generated++;
      per[c.kind] = (per[c.kind] ?? 0) + 1;
      if (c.raw.length > longest) longest = c.raw.length; if (c.raw.length > 30) over30Typed++;
      if (/[a-z]/.test(c.raw)) withLower++; if (/[-/._ \t,;:]/.test(c.raw)) withSep++; if (/[\u200b-\u200d\u2060\ufeff\u0085\u2028\u2029]/.test(c.raw)) withZw++; if (/[０-ｚ]/.test(c.raw)) withFull++; if (/[^\x00-\x7f]/.test(c.raw)) nonAscii++;
      const got = normEmp(c.raw, NEW), viaId = normId(c.raw, "emp", NEW);
      const want = c.want;
      // nothing typed that holds a U+0085 (next line): the employee-ID "nothing typed" test (people.ts) does not strip U+0085, so it answers refused (null) instead of empty (""). Both are refused by the routes: counted as emptied, reported as an observation.
      if (c.kind === "nothing-typed" && got === null && c.raw.includes("\u0085") && viaId === null) { emptied++; nextLineOnly++; continue; }
      if (got !== want && !(c.kind === "email-shaped" || c.kind === "fullwidth-at-email")) { wrong++; if (examples.length < 8) examples.push(`${c.kind} #${i}: ${JSON.stringify(c.raw)} -> ${JSON.stringify(got)} wanted ${JSON.stringify(want)}`); continue; }
      // normId is the entry used by the routes: an e-mail is refused there, everything else equals normEmp
      if (c.kind === "email-shaped" || c.kind === "fullwidth-at-email") { if (viaId !== null) { normIdDisagree++; if (examples.length < 8) examples.push(`${c.kind} #${i}: normId gave ${JSON.stringify(viaId)}`); } refused++; continue; }
      if (viaId !== want) normIdDisagree++;
      // the second rule: when the cleaned text is 1..30 characters it is the answer; empty after cleaning with something typed is refused; nothing typed is ''
      const o = oracleEmp(c.raw);
      if (want !== null && want !== "") { if (o !== want) oracleDisagree++; } else if (want === null) { if (o.length !== 0 && o.length <= 30) oracleDisagree++; }
      if (want === null) { refused++; continue; }
      if (want === "") { emptied++; continue; }
      accepted++;
      if (!/^[A-Z0-9]+$/.test(got!)) badChars++; if (got!.length > 30) over30++; if (normEmp(got, NEW) !== got) notIdempotent++;
      if (cleaned.has(got!)) { wrong++; if (examples.length < 8) examples.push(`two inputs cleaned to the same ID ${got}`); } cleaned.add(got!);
    }
    const summary = { nothingTypedWithU0085AnsweredRefused: nextLineOnly, generated, skippedRepeats: skipped, distinctRaw: seen.size, accepted, emptied, refused, wrong, badChars, over30, notIdempotent, oracleDisagree, normIdDisagree, distinctCleaned: cleaned.size, withLower, withSep, withZw, withFull, nonAscii, over30Typed, longestRaw: longest, kinds: Object.keys(per).length };
    console.log("EMP MATRIX " + JSON.stringify(summary)); console.log("EMP MATRIX per kind " + JSON.stringify(per));
    expect(examples).toEqual([]);
    expect(generated).toBe(N); expect(seen.size).toBe(N);
    expect(wrong).toBe(0); expect(badChars).toBe(0); expect(over30).toBe(0); expect(notIdempotent).toBe(0); expect(oracleDisagree).toBe(0); expect(normIdDisagree).toBe(0);
    expect(accepted + emptied + refused).toBe(N);
    expect(cleaned.size).toBe(accepted); // every accepted ID is a different one
    expect(Object.keys(per).length).toBe(24);
    // built: kinds 0-11, 17-20, 22 are accepted (16 of 24), 15 is "nothing typed", 12-14, 16, 21, 23 are refused (6 of 24)
    const inKind = (k: number) => Math.floor((N - 1 - k) / 24) + 1;
    const accKinds = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 17, 18, 19, 20, 22];
    expect(accepted).toBe(accKinds.reduce((n, k) => n + inKind(k), 0)); expect(emptied).toBe(inKind(15)); expect(refused).toBe(N - accepted - emptied);
    // the inputs were varied enough to mean something
    expect(withLower).toBeGreaterThan(300_000); expect(withSep).toBeGreaterThan(150_000); expect(withZw).toBeGreaterThan(40_000); expect(withFull).toBeGreaterThan(40_000); expect(nonAscii).toBeGreaterThan(150_000); expect(over30Typed).toBeGreaterThan(100_000);
  });
});

describe("the same matrix, a slice of it, through the real list-add route (employeesOnly game on the new rule)", () => {
  const T = Date.UTC(2026, 9, 1, 10, 0, 0), GEN = 1692803367, START = Math.floor((T / 1000 - GEN) / 3) + 1 + 1200;
  let env: any; let raw: any; const realFetch = globalThis.fetch;
  beforeEach(() => { const d = makeD1(); raw = d.raw; env = { DB: d.db, ORGANIZER_SECRET: "plat", DAILY_WRITE_BUDGET: "1000000", PUBLIC_ORIGIN: "https://bingo.test", PHONE_SALT: "salt" }; (globalThis as any).fetch = async () => new Response("{}", { status: 404 }); });
  afterEach(() => { globalThis.fetch = realFetch; });
  test("every kind, 3 inputs each: the list keeps exactly the cleaned IDs; nothing typed, symbols only, over 30 and e-mails are refused; the response flags no duplicate", async () => {
    const call = (m: string, p: string, b?: unknown, k?: string) => handle(new Request("http://x" + p, { method: m, headers: { "content-type": "application/json", "cf-connecting-ip": "6.6.6.7", ...(k ? { "x-organizer": k } : {}) }, body: b === undefined ? undefined : JSON.stringify(b) }), env as Env, T);
    const st = await (await call("POST", "/api/start", { email: "o@acme.com" })).json() as any;
    await call("POST", "/api/z", { id: "EMX-1", startRound: START, callSeconds: 6, cap: 100 }, st.token); await call("POST", "/api/z/EMX-1/publish", { email: "boss@acme.com", phone: "98765 43210" }, st.token);
    expect((await call("PATCH", "/api/z/EMX-1/settings", { verify: "id", employeesOnly: true, idKind: "emp" }, st.token)).status).toBe(200);
    raw.prepare("UPDATE engagement SET created_ms=?, cap=1000 WHERE id='EMX-1'").run(NEW);
    const cases: Case[] = []; const take: Record<string, number> = {};
    for (let i = 0; cases.length < 72; i++) { const c = build(i); if ((take[c.kind] ?? 0) < 3) { take[c.kind] = (take[c.kind] ?? 0) + 1; cases.push(c); } }
    const good = cases.filter((c) => c.want), bad = cases.filter((c) => !c.want);
    const r = await (await call("POST", "/api/z/EMX-1/people", { people: cases.map((c, n) => ({ name: "P" + n, empId: c.raw })) }, st.token)).json() as any;
    expect(r.added).toBe(good.length); expect(r.invalid.length).toBe(bad.length); expect(r.duplicates ?? 0).toBe(0);
    const list = ((await (await call("GET", "/api/z/EMX-1/people", undefined, st.token)).json()) as any).people.map((p: any) => p.empId as string).sort();
    expect(list).toEqual(good.map((c) => c.want as string).sort());
    for (const e of list) { expect(e).toMatch(/^[A-Z0-9]{1,30}$/); }
  });
});
