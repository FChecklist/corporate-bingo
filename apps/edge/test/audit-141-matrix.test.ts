// Bingo 1.4.1 audit: a streamed Email ID matrix of 1,000,000 distinct addresses (nothing is kept in memory but a bit map).
// Every address carries its own number in base 36 (letters incl. s, digits), so all 1,000,000 raw inputs are different, and a bit map proves each one came back exactly once.
// The raw text is decorated on purpose: upper case, full-width at-sign and letters, inner spaces, tabs, no-break spaces, the five zero-width characters, plus tags, very long parts.
// Expected results come from the way the address was BUILT (and are cross-checked by a second, independent rule written below), never from the code under test.
import { afterEach, beforeEach, describe, expect, test, setDefaultTimeout } from "bun:test";
import { normId } from "../src/people";
import { emailKey, accountEmail } from "../src/emailkey";
import { type Env } from "../src/worker";
import { handle } from "./with-terms";
import { makeD1 } from "./d1-sqlite";

setDefaultTimeout(180_000);
const N = 1_000_000;
const WORDS = ["sales", "assist", "rahul.sharma", "s", "ss", "info", "x.y.z", "support", "susan", "ops", "hr", "boss", "Mr.Sam"];
const DOMAINS = ["acme.com", "x.co", "gmail.com", "sales.example.org", "s.ss", "mail.co.in", "a.b.cc", "ss.ss.ss", "assist.io", "z9.net"];
const TAGS = ["", "", "", "+news", "+a.b", "+s5"];
const ZWS = ["\u200b", "\u200c", "\u200d", "\u2060", "\ufeff", "\u0085", "\u2028", "\u2029"]; // v3: the owner added U+0085, U+2028 and U+2029 to the invisible set
const BLANKS = [" ", " ", "\t", "\u00a0", "\u3000", " ", "\n"];

/** a small deterministic random stream per index (mulberry32) */
const rng = (seed: number) => () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

/** the independent rule from docs/TEST_HANDOFF.md item 1, written without any regex: one @, local 1..64, a dot in the part after the @ with something before it and 2+ characters after it, 254 at most, no white space */
function oracle(canon: string): boolean {
  if (canon.length > 254 || /\s/.test(canon)) return false;
  const at = canon.indexOf("@"); if (at < 1 || at !== canon.lastIndexOf("@") || at > 64) return false;
  const dom = canon.slice(at + 1); if (dom.length > 255 + 1 + 1000) return false;
  for (let p = 1; p <= dom.length - 3; p++) if (dom[p] === ".") return true;
  return false;
}

type Case = { raw: string; canon: string; want: boolean; kind: string; idx: number };
function build(i: number): Case {
  const r = rng(i + 1), pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)]!;
  const k = i % 24;
  const i36 = i.toString(36);
  const word = pick(WORDS), tag = pick(TAGS), dom = pick(DOMAINS);
  let local = `${i36}.${word}${tag}`, domain = dom, canon = "", want = true, kind = "plain";
  switch (k) {
    case 0: kind = "plain"; break;
    case 1: kind = "upper"; break;
    case 2: kind = "fullwidth-at"; break;
    case 3: kind = "inner-spaces"; break;
    case 4: kind = "zero-width"; break;
    case 5: kind = "plus-tag"; local = `${i36}.${word}+tag${i % 97}`; break;
    case 6: kind = "digits"; local = `${i36}.${i}${word}`; break;
    case 7: kind = "local-64"; local = (i36 + "." + "s".repeat(64)).slice(0, 64); break;
    case 8: kind = "total-254"; { const l = `${i36}.${word}`; local = l.slice(0, 64); const room = 254 - local.length - 1; domain = "s".repeat(room - 4) + ".com"; } break;
    case 9: kind = "mixed-everything"; break;
    case 10: kind = "nbsp-tab"; break;
    case 11: kind = "full-width-letters"; break;
    case 12: kind = "no-at"; want = false; break;
    case 13: kind = "no-dot"; want = false; domain = dom.replace(/\./g, "") + "com"; break;
    case 14: kind = "tld-1"; want = false; domain = "acme.c"; break;
    case 15: kind = "empty-local"; want = false; local = ""; domain = i36 + "." + dom; break;
    case 16: kind = "double-at"; want = false; break;
    case 17: kind = "local-65"; want = false; local = (i36 + "." + "s".repeat(65)).slice(0, 65); break;
    case 18: kind = "total-255"; want = false; { local = `${i36}.${word}`.slice(0, 64); const room = 255 - local.length - 1; domain = "s".repeat(room - 4) + ".com"; } break;
    case 19: kind = "dot-first"; want = false; domain = ".com"; break;
    case 20: kind = "trailing-dot"; want = false; domain = "acme."; break;
    case 21: kind = "plain-s-heavy"; local = `${i36}.sssssss`; domain = "sss.sss"; break;
    case 22: kind = "plus-upper-full"; local = `${i36}.${word}${tag || "+n"}`; break;
    default: kind = "plain-2"; break;
  }
  canon = kind === "no-at" ? `${local}${domain}`.toLowerCase() : kind === "double-at" ? `${local}@x@${domain}`.toLowerCase() : `${local}@${domain}`.toLowerCase();
  // decorate the raw text
  let ch = Array.from(canon);
  const upper = ["upper", "mixed-everything", "plus-upper-full", "full-width-letters"].includes(kind) || r() < 0.3;
  if (upper) ch = ch.map((c) => (r() < (kind === "upper" ? 1 : 0.5) ? c.toUpperCase() : c));
  const fullAt = kind === "fullwidth-at" || kind === "mixed-everything" || r() < 0.15;
  if (fullAt) ch = ch.map((c) => (c === "@" ? "＠" : c));
  if (kind === "full-width-letters" || kind === "mixed-everything") ch = ch.map((c) => (/[0-9A-Za-z.+]/.test(c) && r() < 0.6 ? String.fromCharCode(c.charCodeAt(0) + 0xfee0) : c));
  const nInsert = kind === "inner-spaces" ? 1 + Math.floor(r() * 4) : kind === "zero-width" ? 1 + Math.floor(r() * 4) : kind === "nbsp-tab" ? 2 + Math.floor(r() * 3) : kind === "mixed-everything" ? 3 + Math.floor(r() * 5) : r() < 0.2 ? 1 : 0;
  for (let n = 0; n < nInsert; n++) {
    const pos = Math.floor(r() * (ch.length + 1));
    const useZw = kind === "zero-width" ? true : kind === "inner-spaces" ? false : kind === "nbsp-tab" ? false : r() < 0.5;
    ch.splice(pos, 0, useZw ? pick(ZWS) : kind === "nbsp-tab" ? pick(BLANKS.slice(2)) : pick(BLANKS));
  }
  if (r() < 0.25) ch.unshift(" "); if (r() < 0.25) ch.push("\t");
  const raw = ch.join("");
  expectOracle(canon, want, kind);
  return { raw, canon, want, kind, idx: i };
}
let oracleChecked = 0;
function expectOracle(canon: string, want: boolean, kind: string) {
  if (oracle(canon) !== want) throw new Error(`the matrix itself is wrong for kind ${kind}: ${canon.slice(0, 80)} built as ${want} but the independent rule says ${!want}`);
  oracleChecked++;
}

describe("Email ID matrix: 1,000,000 distinct addresses through the participant Email ID cleaner", () => {
  test("every address is accepted or refused exactly as built; every accepted Email ID is lower case, free of white space and zero-width characters, and comes back once", () => {
    const rawHashes = new BigUint64Array(N); // a 64-bit hash of every raw input, to prove that all of them are different
    const seenOnce = new Uint8Array(N); // the bit map: index i was returned exactly once
    const perKind: Record<string, { accepted: number; refused: number }> = {};
    let accepted = 0, refused = 0, wrongResult = 0, upperLeft = 0, spaceLeft = 0, zwLeft = 0, tooLong = 0, dupIdx = 0, nonDistinctRaw = 0, withS = 0, withUpper = 0, withFullAt = 0, withSpace = 0, withZw = 0, withPlus = 0, longest = 0;
    const examples: string[] = [];
    let prevRaw = "";
    for (let i = 0; i < N; i++) {
      const c = build(i);
      rawHashes[i] = Bun.hash.wyhash(c.raw) as bigint;
      const got = normId(c.raw, "email");
      (perKind[c.kind] ||= { accepted: 0, refused: 0 });
      if (/s/i.test(c.canon)) withS++; if (/[A-Z]/.test(c.raw)) withUpper++; if (c.raw.includes("＠")) withFullAt++; if (/[ \t\u00a0\u3000 \n]/.test(c.raw.trim())) withSpace++; if (/[\u0085\u200b-\u200d\u2028\u2029\u2060\ufeff]/.test(c.raw)) withZw++; if (c.raw.includes("+") || c.raw.includes("＋")) withPlus++;
      if (c.raw.length > longest) longest = c.raw.length;
      if (c.raw === prevRaw) nonDistinctRaw++; prevRaw = c.raw;
      if (c.want) {
        if (got !== c.canon) { wrongResult++; if (examples.length < 8) examples.push(`${c.kind} #${i}: ${JSON.stringify(c.raw)} -> ${JSON.stringify(got)} wanted ${JSON.stringify(c.canon)}`); continue; }
        accepted++; perKind[c.kind]!.accepted++;
        if (got !== got.toLowerCase()) upperLeft++; if (/\s/.test(got)) spaceLeft++; if (/[\u0085\u200b-\u200d\u2028\u2029\u2060\ufeff]/.test(got)) zwLeft++; if (got.length > 254) tooLong++;
        const back = parseInt(got.slice(0, got.indexOf(".")), 36); if (back !== i) wrongResult++; else if (seenOnce[i]) dupIdx++; else seenOnce[i] = 1;
      } else {
        if (got !== null) { wrongResult++; if (examples.length < 8) examples.push(`${c.kind} #${i}: ${JSON.stringify(c.raw)} -> ${JSON.stringify(got)} wanted refusal`); continue; }
        refused++; perKind[c.kind]!.refused++;
      }
    }
    rawHashes.sort(); let distinctRaw = N; for (let i = 1; i < N; i++) if (rawHashes[i] === rawHashes[i - 1]) distinctRaw--;
    const built = oracleChecked; // before the spot check below builds a few again
    let marked = 0; for (let i = 0; i < N; i++) marked += seenOnce[i]!;
    // the two cleaners must also agree on every accepted address (spot check by stride, all kinds)
    let agree = 0; for (let i = 0; i < N; i += 997) { const c = build(i); if (c.want) { expect(emailKey(c.raw)).toBe(c.canon); expect(accountEmail(c.raw).replace(/\s+/g, "")).toBe(c.canon); agree++; } }
    const summary = { generated: N, accepted, refused, wrongResult, upperLeft, spaceLeft, zwLeft, tooLong, dupIdx, nonDistinctRaw, markedDistinctAccepted: marked, distinctRaw, oracleChecked: built, withS, withUpper, withFullAt, withSpace, withZw, withPlus, longestRawLength: longest, agree, kinds: Object.keys(perKind).length };
    console.log("MATRIX " + JSON.stringify(summary)); console.log("MATRIX per kind " + JSON.stringify(perKind));
    expect(examples).toEqual([]);
    expect(wrongResult).toBe(0); expect(upperLeft).toBe(0); expect(spaceLeft).toBe(0); expect(zwLeft).toBe(0); expect(tooLong).toBe(0); expect(dupIdx).toBe(0); expect(nonDistinctRaw).toBe(0);
    expect(accepted + refused).toBe(N);
    expect(marked).toBe(accepted); // every accepted Email ID is a different one and each came back once
    expect(built).toBe(N); expect(distinctRaw).toBe(N);
    // 24 kinds in turn: 15 are built valid (kinds 0-11 and 21-23), 9 are built invalid (kinds 12-20)
    const inKind = (k: number) => Math.floor((N - 1 - k) / 24) + 1, validKinds = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 21, 22, 23]; // 1,000,000 is not a multiple of 24, so the first 16 kinds have one more
    const wantAccepted = validKinds.reduce((n, k) => n + inKind(k), 0);
    expect(accepted).toBe(wantAccepted); expect(refused).toBe(N - wantAccepted); expect(wantAccepted).toBe(625002);
    expect(Object.keys(perKind).length).toBeGreaterThanOrEqual(23);
    // the inputs really were varied (so the matrix is not trivially easy)
    expect(withS).toBeGreaterThan(300_000); expect(withUpper).toBeGreaterThan(300_000); expect(withFullAt).toBeGreaterThan(100_000); expect(withSpace).toBeGreaterThan(100_000); expect(withZw).toBeGreaterThan(100_000); expect(withPlus).toBeGreaterThan(100_000); expect(longest).toBeGreaterThan(250);
  });
  test("a nothing-typed input is '' (not refused) whatever mix of blanks and zero-width characters it is made of", () => {
    let n = 0;
    for (const a of BLANKS.concat(ZWS, [""])) for (const b of BLANKS.concat(ZWS, [""])) for (const c of BLANKS.concat(ZWS, [""])) { expect(normId(a + b + c, "email")).toBe(""); n++; }
    expect(n).toBe((BLANKS.length + ZWS.length + 1) ** 3);
  });
});

describe("the same matrix, a slice of it, through the real list-add route", () => {
  const T = Date.UTC(2026, 9, 1, 10, 0, 0), GEN = 1692803367, START = Math.floor((T / 1000 - GEN) / 3) + 1 + 1200;
  let env: any; const realFetch = globalThis.fetch;
  beforeEach(() => { const d = makeD1(); env = { DB: d.db, ORGANIZER_SECRET: "plat", DAILY_WRITE_BUDGET: "1000000", PUBLIC_ORIGIN: "https://bingo.test", PHONE_SALT: "salt" }; (globalThis as any).fetch = async () => new Response("{}", { status: 404 }); });
  afterEach(() => { globalThis.fetch = realFetch; });
  test("90 valid and 10 refused spellings: the list keeps each Email ID lower case with no spaces", async () => {
    const call = (m: string, p: string, b?: unknown, k?: string) => handle(new Request("http://x" + p, { method: m, headers: { "content-type": "application/json", "cf-connecting-ip": "6.6.6.6", ...(k ? { "x-organizer": k } : {}) }, body: b === undefined ? undefined : JSON.stringify(b) }), env as Env, T);
    const st = await (await call("POST", "/api/start", { email: "o@acme.com" })).json() as any;
    await call("POST", "/api/z", { id: "MTX-1", startRound: START, callSeconds: 6, cap: 100 }, st.token); await call("POST", "/api/z/MTX-1/publish", { email: "boss@acme.com", phone: "98765 43210" }, st.token);
    expect((await call("PATCH", "/api/z/MTX-1/settings", { verify: "id", employeesOnly: true, idKind: "email" }, st.token)).status).toBe(200);
    const good: Case[] = [], bad: Case[] = [];
    for (let i = 0; good.length < 90 || bad.length < 10; i++) { const c = build(i); if (c.want && good.length < 90) good.push(c); else if (!c.want && bad.length < 10) bad.push(c); }
    const r = await (await call("POST", "/api/z/MTX-1/people", { people: [...good, ...bad].map((c, n) => ({ name: "P" + n, empId: c.raw })) }, st.token)).json() as any;
    expect(r.added).toBe(90); expect(r.invalid.length).toBe(10); expect(r.duplicates ?? 0).toBe(0);
    const list = ((await (await call("GET", "/api/z/MTX-1/people", undefined, st.token)).json()) as any).people.map((p: any) => p.empId as string).sort();
    expect(list).toEqual(good.map((c) => c.canon).sort());
    for (const e of list) { expect(e).toBe(e.toLowerCase()); expect(e).not.toMatch(/\s/); expect(e).not.toMatch(/[\u200b-\u200d\u2060\ufeff]/); }
  });
});
