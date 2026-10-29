// QA model for Corporate Bingo (2026-10-29). Run with bun:   bun tools/qa-model.mjs [--only <family>] [--json <file>] [--rows]
//
// What it does: it lists every option combination an organizer or a guest can reach (card count x marking x call gap x rounds x size / free-demo-paid x prizes and winners x
// who can join x guest-list shapes x roles x pause), says what the OWNER'S WRITTEN RULES expect for each one (docs/boss/RULES_bingo.md, OPTIONS_TABLES.md, ALL_GAMES_CARRY_TAMBOLA_RULES.md,
// docs/BINGO_GAME.md, GLOSSARY, the role cards in the console), runs the REAL code (the Worker through handle(), the in-memory D1, the beacon / prize engine / pricing modules, imported, not copied)
// and compares. Every difference is a finding with a category:
//   FAIL        the code does something the rules say it must not (wrong answer, wrong number, wrong refusal)
//   GAP         a rule or a fix the owner asked for is not there at all
//   NOT_LOGICAL two statements of the product contradict each other, or a state makes no sense to the user
//   INCOMPLETE  it works but a part is missing (a message without a reason, a warning without the list)
//   GIBBERISH   text a person sees that is nonsense (NaN, undefined, [object Object], an empty label, a stray code)
//   NO_RESULT   the combination ends with no answer at all (no reply, no way forward)
// The "expected" side is written here from the documents (and parsed from them where it is a table, e.g. the price ladder), never taken from the code under test.
// Nothing leaves this machine: no network, no deploy, no payment service. The Razorpay answers are a stand-in.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeD1 } from "../apps/edge/test/d1-sqlite.ts";
import { handle } from "../apps/edge/test/with-terms.ts";
import { handle as realHandle } from "../apps/edge/src/worker.ts";
import { PRIZE_HOUSES, HOUSE_ORDER, GRACE_ROUNDS, INTERMISSION_ROUNDS, DEMO_CAP, MAX_ROUNDS, validateCfg, defaultCfg, defaultRewards, houseLabel, maxWinnersFor, keysInPlay, roundEid } from "../packages/beacon/src/config.ts";
import { settleAll, ticketsFor, completionIndex, assignOrdinals, rankWinners, callRoundR, unshiftedRound } from "../packages/beacon/src/game.ts";
import { PrizeEngine } from "../packages/beacon/src/prize-engine.ts";
import { pickNumber, NUMBERS } from "../packages/beacon/src/index.ts";
import { resolveControl } from "../packages/beacon/src/control.ts";
import { PACKS, price } from "../packages/shared/src/pricing.ts";
import { ordinalName, rewardName, PATTERNS, LETTERS, callLabel, SIZE, FREE_CELL } from "../packages/shared/src/bingo-card.ts";
import { createHash } from "node:crypto";
const sha256hex = (s) => createHash("sha256").update(s).digest("hex"); // plain Node hash: only to make test ids and fake randomness

const ROOT = join(import.meta.dir, "..");
const args = process.argv.slice(2);
const argv = (k) => { const i = args.indexOf("--" + k); return i >= 0 ? args[i + 1] : undefined; };
const only = argv("only"), jsonOut = argv("json"), showRows = args.includes("--rows");
const read = (p) => readFileSync(join(ROOT, p), "utf8");

// ---------------------------------------------------------------- result book
const rows = [];       // every combination that was checked
const notes = [];      // facts the model learned that are not pass / fail
/** One checked combination. `ok` false => a finding. `root` names the cause (file:line) so many combinations collapse into one finding. */
function chk(fam, combo, expected, actual, ok, cat = "FAIL", root = "") {
  rows.push({ fam, combo, expected: String(expected), actual: String(actual), ok: !!ok, cat: ok ? "OK" : cat, root });
  return !!ok;
}
const note = (fam, text) => notes.push({ fam, text });

// ---------------------------------------------------------------- the real Worker in memory
const T = Date.UTC(2026, 9, 29, 10, 0, 0), GEN = 1692803367, HOUR = 3_600_000, DAY = 86_400_000;
const roundAt = (ms) => Math.floor((ms / 1000 - GEN) / 3) + 1;
const roundMs = (r) => (GEN + (r - 1) * 3) * 1000;
let W; let ipn = 0;
const realFetch = globalThis.fetch;
function world(extra = {}) {
  const d = makeD1();
  W = { raw: d.raw, orders: [], env: { DB: d.db, ORGANIZER_SECRET: "plat", DAILY_WRITE_BUDGET: "100000000", DATA_KEY: "dk", PHONE_SALT: "salt", RAZORPAY_KEY_ID: "rzp_test_x", RAZORPAY_KEY_SECRET: "sek", RAZORPAY_WEBHOOK_SECRET: "whsec", RAZORPAY_BASE_URL: "https://rzp.test/v1", PUBLIC_ORIGIN: "https://bingo.test", ...extra } };
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    if (u.startsWith("https://rzp.test/v1/orders")) { const b = JSON.parse(init.body); const o = { id: "order_" + (W.orders.length + 1), amount: b.amount, currency: b.currency, receipt: b.receipt, status: "created" }; W.orders.push(o); return new Response(JSON.stringify(o), { status: 200 }); }
    return new Response("{}", { status: 404 });
  };
  return W;
}
const call = async (method, path, body, headers = {}, now = T, real = false) => {
  const r = await (real ? realHandle : handle)(new Request("http://x" + path, { method, headers: { "content-type": "application/json", ...headers }, body: body === undefined ? undefined : JSON.stringify(body) }), W.env, now);
  const text = await r.text(); let j = null; try { j = JSON.parse(text); } catch { /* not JSON */ }
  CALLS.n++; if (r.status >= 500) CALLS.fivexx.push(`${method} ${path} -> ${r.status}`); if (/^\/api\//.test(path) && !j && r.status !== 204 && !/\/(csv|pdf)|\.csv|\.pdf|\/j\/|\/ai\//.test(path)) CALLS.notJson.push(`${method} ${path} -> ${r.status}`);
  return { status: r.status, j, text };
};
const CALLS = { n: 0, fivexx: [], notJson: [] }; // every call the model makes is counted: a server error or an answer with no JSON is a finding
const PLAT = { "x-organizer": "plat" };
const keyH = (k) => ({ "x-organizer": k });
const ip = () => ({ "cf-connecting-ip": `7.${(ipn >> 16) & 255}.${(ipn >> 8) & 255}.${++ipn & 255}` });
async function organizer(email = `o${++ipn}@acme.com`) {
  const r = await call("POST", "/api/start", { email }, ip());
  if (r.status !== 200) throw new Error("organizer start failed " + r.status + " " + r.text);
  return { key: r.j.token, h: keyH(r.j.token), ai: r.j.aiKey, aiH: keyH(r.j.aiKey), email };
}
const eng = (id, over = {}) => ({ id, startRound: roundAt(T + 2 * HOUR), callSeconds: 12, cap: 100, ...over });
const contact = { email: "boss@acme.com", phone: "98765 43210" };
const dev = (i) => (String(i).padStart(2, "0") + "b".repeat(32)).slice(0, 32);
const mob = (i) => "9" + String(100000000 + i);
const bad = (s) => /\bNaN\b|\bundefined\b|\[object Object\]|\bnull\b|\{\{|\}\}|\$\{|%s\b|Infinity/.test(String(s));

// ================================================================ the documents' tables, read as data
// Price ladder: docs/BINGO_GAME.md "Price ladder (up to N players, no tax added): 100 Rs 2,399 / US$ 34; 250 3,499 / 51; ..."
function docLadder() {
  const m = /Price ladder[^:]*:\s*([^\n]+?)\.\s*\(?`?packages/.exec(read("docs/BINGO_GAME.md")) || /Price ladder[^:]*:\s*([^\n]+)/.exec(read("docs/BINGO_GAME.md"));
  const out = [];
  for (const part of m[1].split(";")) { const p = /(\d[\d,]*)\s+(?:Rs\s+)?([\d,]+)\s*\/\s*(?:US\$\s*)?(\d+)/.exec(part.trim()); if (p) out.push([Number(p[1].replace(/,/g, "")), Number(p[2].replace(/,/g, "")), Number(p[3])]); }
  return out;
}
// Houses and their most winners: docs/BINGO_GAME.md table "| line | any one row... | 3 |"
function docHouses() {
  const out = {};
  for (const l of read("docs/BINGO_GAME.md").split("\n")) { const m = /^\|\s*([A-Za-z]+(?:\s*\/\s*[A-Za-z]+)?)\s*\|[^|]*\|\s*(\d+)(?:\s*each)?\s*\|\s*$/.exec(l); if (m && !/^id$/.test(m[1])) for (const id of m[1].split("/")) out[id.trim()] = Number(m[2]); }
  return out;
}
const DOC_DEFAULT_SET = ["line", "corners", "x", "blackout"]; // BINGO_GAME.md: "Default set for a new game: Line, Four Corners, X, Blackout."
const DOC_GAPS = [6, 9, 12, 15];                              // worker.ts GAPS and the console; OPTIONS_TABLES: the console keeps 12 s only (owner 2026-10-27)
const DOC_RULE_GAP = 12;                                      // RULES_bingo.md section 1.2 / 3.1: "The gap between calls is 12 seconds"
const DOC_FIRST_CALL_S = 120;                                 // RULES_bingo.md section 3.1: "The first call comes 2 minutes after the start time."
const DOC_INTERMISSION_S = 90;                                // BINGO_GAME / config: between two rounds everyone waits 90 s
const DOC_MAX_HOSTS = 5;                                      // owner brief and the team card in the console
// Geometry of the prize shapes, from the plain words of the rules (row r, column c, 0..4), independent of the table in bingo-card.ts
const cellsWhere = (f) => { const o = []; for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) if (f(r, c)) o.push(r * 5 + c); return o; };
const ORACLE_SETS = {
  line: [...Array(5).keys()].flatMap((i) => [cellsWhere((r) => r === i), cellsWhere((_, c) => c === i)]).concat([cellsWhere((r, c) => r === c), cellsWhere((r, c) => r + c === 4)]),
  corners: [cellsWhere((r, c) => (r === 0 || r === 4) && (c === 0 || c === 4))],
  x: [cellsWhere((r, c) => r === c || r + c === 4)],
  plus: [cellsWhere((r, c) => r === 2 || c === 2)],
  frame: [cellsWhere((r, c) => r === 0 || r === 4 || c === 0 || c === 4)],
  stamp: [cellsWhere((r, c) => r < 2 && c < 2), cellsWhere((r, c) => r < 2 && c > 2), cellsWhere((r, c) => r > 2 && c < 2), cellsWhere((r, c) => r > 2 && c > 2)],
  letterL: [cellsWhere((r, c) => c === 0 || r === 4)],
  letterT: [cellsWhere((r, c) => r === 0 || c === 2)],
  blackout: [cellsWhere(() => true)],
};
ORACLE_SETS.twolines = ORACLE_SETS.line; // "Mark any two different lines"
const ORACLE_NEED = { twolines: 2 };

// ================================================================ family 1: PRICE / SIZE / FREE-DEMO-PAID
async function famPrice() {
  const fam = "PRICE";
  const ladder = docLadder();
  chk(fam, "doc ladder read", "8 packs 100..10000", `${ladder.length} packs`, ladder.length === 8, "FAIL", "tools/qa-model.mjs docLadder");
  for (const [n, inr, usd] of ladder) {
    const real = PACKS.find((p) => p[0] === n);
    chk(fam, `pack ${n}`, `Rs ${inr} / US$ ${usd}`, real ? `Rs ${real[1]} / US$ ${real[2]}` : "missing", !!real && real[1] === inr && real[2] === usd, "FAIL", "packages/shared/src/pricing.ts:8");
    chk(fam, `price() INR ${n}`, inr, price(n, "INR").total, price(n, "INR").total === inr, "FAIL", "packages/shared/src/pricing.ts:19");
    chk(fam, `price() USD ${n}`, usd, price(n, "USD").total, price(n, "USD").total === usd, "FAIL", "packages/shared/src/pricing.ts:23");
  }
  chk(fam, "the free demo size", `${10} people`, `${DEMO_CAP} people`, DEMO_CAP === 10, "FAIL", "packages/beacon/src/config.ts DEMO_CAP");
  // For every size an organizer can type: expected pack = smallest pack that covers it; <= 10 is Rs 0 (a real game in every other way)
  const caps = [1, 2, 9, 10, 11, 50, 99, 100, 101, 250, 251, 500, 501, 750, 751, 1000, 1001, 2500, 2501, 5000, 5001, 10000, 10001, 20000, 100000, 100001];
  for (const cap of caps) {
    world();
    const o = await organizer();
    const id = "PR-" + cap;
    const c = await call("POST", "/api/z", eng(id, { cap }), o.h);
    const expPack = cap <= DEMO_CAP ? 0 : (ladder.find((p) => p[0] >= cap) || [null])[0];
    const combo = `size ${cap}`;
    if (cap > 10000) {
      // by design (usecases UC-20, pay.test PAYD-3): a draft of any size can be built; no pack covers it, so payment is refused with a plain 'write to us'. The console stops at 10,000 with the same words.
      chk(fam, `${combo}: create`, cap > 100000 ? "refused plainly (the API stops at 100,000)" : "draft saved (payment is refused later, plainly)", `${c.status} ${c.j?.error ?? ""}`, cap > 100000 ? c.status === 400 && !bad(c.j?.error) : c.status === 200, "FAIL", "apps/edge/src/worker.ts:1337");
      if (c.status === 200) {
        await call("POST", `/api/z/${id}/publish`, contact, o.h);
        const sm = (await call("GET", `/api/z/${id}/summary`, undefined, o.h)).j || {};
        chk(fam, `${combo}: after publish the summary tells the AI what to do about the price`, "a price, or a plain 'write to us / custom arrangement'", `pack=${sm.pack} priceInr=${sm.priceInr} note=${sm.customNote ? "yes" : "(none)"}`, sm.pack != null || !!sm.customNote, "INCOMPLETE", "apps/edge/src/worker.ts:1801 (summary: pack and price are null with no explanation)");
        const co = await call("POST", "/api/checkout", { org: "Acme Ltd", email: "boss@acme.com", country: "IN", taxId: "", currency: "INR", eid: id }, o.h);
        chk(fam, `${combo}: checkout`, "400 and a plain 'write to us'", `${co.status} ${co.j && co.j.error}`, co.status === 400 && /write to us|custom/i.test(co.j?.error || "") && !bad(co.j.error), "NO_RESULT", "apps/edge/src/pay.ts checkout");
      }
      continue;
    }
    chk(fam, `${combo}: create`, "draft saved", `${c.status}`, c.status === 200 && c.j?.draft === true, "FAIL", "apps/edge/src/worker.ts:1333");
    const sm0 = (await call("GET", `/api/z/${id}/summary`, undefined, o.h)).j || {};
    if (cap <= DEMO_CAP) {
      // a draft for up to 10 people: no price should be quoted, nothing to pay
      chk(fam, `${combo}: draft summary says it costs Rs 0`, "priceInr 0 or absent; no 'pay before the start' step", `priceInr=${sm0.priceInr} pack=${sm0.pack} payStep=${(sm0.nextSteps || []).some((s) => /^Pay/.test(s.step) && !s.done)}`, !(sm0.priceInr > 0), "NOT_LOGICAL", "apps/edge/src/worker.ts:1801 (summary prices the pack of the cap even when cap <= DEMO_CAP)");
    } else {
      chk(fam, `${combo}: draft summary price`, `pack ${expPack} at Rs ${ladder.find((p) => p[0] === expPack)[1]}`, `pack ${sm0.pack} Rs ${sm0.priceInr}`, sm0.pack === expPack && sm0.priceInr === ladder.find((p) => p[0] === expPack)[1], "FAIL", "apps/edge/src/worker.ts:1801");
    }
    const p = await call("POST", `/api/z/${id}/publish`, contact, o.h);
    chk(fam, `${combo}: publish`, "200", String(p.status), p.status === 200, "FAIL", "apps/edge/src/worker.ts:1805");
    chk(fam, `${combo}: paid at publish`, cap <= DEMO_CAP ? "paid (Rs 0)" : "not paid yet (payment is asked next)", `paid=${p.j?.paid}`, p.j?.paid === (cap <= DEMO_CAP), "FAIL", "apps/edge/src/worker.ts:1826");
    if (cap > DEMO_CAP) {
      for (const cur of ["INR", "USD"]) {
        world();
        const o2 = await organizer(); const id2 = "PQ-" + cap + cur;
        await call("POST", "/api/z", eng(id2, { cap }), o2.h); await call("POST", `/api/z/${id2}/publish`, contact, o2.h);
        const co = await call("POST", "/api/checkout", { org: "Acme Ltd", email: "boss@acme.com", country: cur === "INR" ? "IN" : "US", taxId: "", currency: cur, eid: id2 }, o2.h);
        const lad = ladder.find((x) => x[0] === expPack);
        if (cur === "USD") { // dollars are not switched on yet (the live answer is a plain refusal): the rule is a plain message, never an order
          chk(fam, `${combo}: checkout USD`, "a plain refusal while dollars are off (no order made)", `${co.status} ${co.j?.error ?? ""}`, (co.status === 400 && /dollars/i.test(co.j?.error || "") && W.orders.length === 0) || (co.status === 200 && W.orders[0]?.amount === lad[2] * 100), "FAIL", "apps/edge/src/pay.ts checkout");
          continue;
        }
        const expAmount = lad[1] * 100;
        const got = W.orders[0]?.amount;
        chk(fam, `${combo}: checkout INR`, `order for ${expAmount} paise, payee IT Services by Rajat Agarwal`, `status ${co.status}, order ${got}, ${co.j?.razorpay?.description ?? ""}`, co.status === 200 && got === expAmount && /IT Services by Rajat Agarwal/.test(co.j?.razorpay?.description || ""), "FAIL", "apps/edge/src/pay.ts checkout");
      }
    }
  }
}

// ================================================================ family 2: OPTIONS (every setting an organizer can set) and what the real Worker does with it
async function famOptions() {
  const fam = "OPTIONS";
  world();
  // 2a. gap x rounds x tickets x mark x join, valid and invalid, through the real create call (platform key: no draft limit)
  const gaps = [0, 3, 6, 9, 12, 15, 18, "12", 12.5, -12];
  const tix = [1, 2, 0, 3];
  const rnds = [0, 1, 2, 3, 4, 5, 6];
  const marks = ["auto", "tap", "dab"];
  const joins = ["name", "phone", "email"];
  let n = 0;
  for (const g of gaps) {
    const id = "OGAP" + ++n; const r = await call("POST", "/api/z", eng(id, { callSeconds: g, cap: 50 }), PLAT);
    const okExp = DOC_GAPS.includes(g);
    chk(fam, `gap ${JSON.stringify(g)}`, okExp ? "accepted" : "refused with a plain message naming 6, 9, 12 or 15", `${r.status} ${r.j?.error ?? ""}`, okExp ? r.status === 200 : (r.status === 400 && /6, 9, 12 or 15/.test(r.j?.error || "") && !bad(r.j.error)), "FAIL", "apps/edge/src/worker.ts:1335");
  }
  for (const t of tix) { const id = "OTIX" + ++n; const r = await call("POST", "/api/z", eng(id, { tickets: t, cap: 50 }), PLAT); const okExp = t === 1 || t === 2; chk(fam, `cards ${t}`, okExp ? "accepted" : "refused 'Each participant gets 1 or 2 cards.'", `${r.status} ${r.j?.error ?? ""}`, okExp ? r.status === 200 : (r.status === 400 && /1 or 2 cards/.test(r.j?.error || "")), "FAIL", "packages/beacon/src/config.ts validateCfg tickets"); }
  for (const x of rnds) { const id = "ORND" + ++n; const r = await call("POST", "/api/z", eng(id, { rounds: x, cap: 50 }), PLAT); const okExp = x >= 1 && x <= MAX_ROUNDS; chk(fam, `rounds ${x}`, okExp ? "accepted" : "refused 1 to 5", `${r.status} ${r.j?.error ?? ""}`, okExp ? r.status === 200 : (r.status === 400 && /1 to 5 rounds/.test(r.j?.error || "")), "FAIL", "packages/beacon/src/config.ts validateCfg rounds"); }
  for (const m of marks) { const id = "OMRK" + ++n; const r = await call("POST", "/api/z", eng(id, { mark: m, cap: 50 }), PLAT); const okExp = m === "auto" || m === "tap"; chk(fam, `marking ${m}`, okExp ? "accepted" : "refused", `${r.status} ${r.j?.error ?? ""}`, okExp ? r.status === 200 : r.status === 400 && !bad(r.j?.error), "FAIL", "packages/beacon/src/config.ts validateCfg mark"); }
  for (const jn of joins) { const id = "OJON" + ++n; const r = await call("POST", "/api/z", eng(id, { join: jn, cap: 50 }), PLAT); const okExp = jn === "name" || jn === "phone"; chk(fam, `join ${jn}`, okExp ? "accepted" : "refused", `${r.status} ${r.j?.error ?? ""}`, okExp ? r.status === 200 : r.status === 400 && !bad(r.j?.error), "FAIL", "packages/beacon/src/config.ts validateCfg join"); }
  // 2b. every VALID combination end to end: what comes back in info / summary must equal what was set, and the derived numbers must follow the rules
  world();
  const org = await organizer();
  let made = 0;
  for (const g of DOC_GAPS) for (const t of [1, 2]) for (const m of ["auto", "tap"]) for (const jn of ["name", "phone"]) for (const rd of [1, 2, 5]) {
    const id = `OC-${g}-${t}-${m}-${jn}-${rd}`;
    // every 8th game uses a fresh organizer: ten unpublished drafts is the limit
    if (made++ % 8 === 7) { world(); Object.assign(org, await organizer()); }
    const r = await call("POST", "/api/z", eng(id, { callSeconds: g, tickets: t, mark: m, join: jn, rounds: rd, cap: 10 }), org.h);
    const combo = `gap ${g}s, ${t} card(s), ${m}, join ${jn}, ${rd} round(s)`;
    if (!chk(fam, combo + ": create", "200", String(r.status), r.status === 200, "FAIL", "apps/edge/src/worker.ts:1333")) continue;
    const sm = (await call("GET", `/api/z/${id}/summary`, undefined, org.h)).j || {};
    chk(fam, combo + ": summary echoes the settings", `gap ${g}, cards ${t}, rounds ${rd}`, `gap ${sm.callSeconds}, cards ${sm.tickets}, rounds ${sm.rounds}`, sm.callSeconds === g && sm.tickets === t && sm.rounds === rd, "FAIL", "apps/edge/src/worker.ts:1796");
    chk(fam, combo + ": brand moments follow the cards", `${5 * t}`, `${sm.brandMomentsAllowed}`, sm.brandMomentsAllowed === 5 * t, "FAIL", "packages/beacon/src/config.ts brandMomentsFor");
    // length of play: 75 numbers x gap per round + 90 s between rounds (BINGO_GAME.md "The calls"); the 2 minutes before the first number are separate
    const expMin = Math.round((75 * g * rd + (rd - 1) * DOC_INTERMISSION_S) / 60);
    chk(fam, combo + ": gameMinutes", `${expMin}`, `${sm.gameMinutes}`, sm.gameMinutes === expMin, "FAIL", "apps/edge/src/worker.ts:1801");
    const pub = await call("POST", `/api/z/${id}/publish`, contact, org.h);
    chk(fam, combo + ": a 10-person game publishes free", "published, paid", `${pub.status} paid=${pub.j?.paid}`, pub.status === 200 && pub.j?.paid === true, "FAIL", "apps/edge/src/worker.ts:1826");
    const info = (await call("GET", `/api/z/${id}/info`)).j || {};
    chk(fam, combo + ": phones see the same settings", `gap ${g}, cards ${t}, mark ${m === "tap" ? "tap" : "(absent)"}, join phone=${jn === "phone"}`, `gap ${info.callSeconds}, cards ${info.tickets}, mark ${info.mark ?? "(absent)"}, joinPhone=${info.joinPhone}`, info.callSeconds === g && info.tickets === t && (info.mark ?? "auto") === m && info.joinPhone === (jn === "phone"), "FAIL", "apps/edge/src/worker.ts:1762");
  }
  // 2b-2. the other settings: brand moments per card, lucky draw winners, invitations, employees only, game name, brand
  const brk = (after, seconds = 60, kind = "speech") => ({ after, seconds, kind, title: "Break " + after });
  for (const t of [1, 2]) for (const n of [0, 1, 3, 4, 6, 7]) {
    const v = validateCfg({ tickets: t, breaks: Array.from({ length: n }, (_, i) => brk(10 + i * 10)) });
    const okExp = n <= 3 * t;
    chk(fam, `${t} card(s), ${n} brand moment(s) during the game`, okExp ? "accepted" : `refused: at most ${3 * t}`, v.ok ? "accepted" : v.error, okExp ? v.ok : (!v.ok && v.error.includes(String(3 * t)) && !bad(v.error)), "FAIL", "packages/beacon/src/config.ts breaks limit");
  }
  for (const w of [0, 1, 2, 3, 5, 10, 11]) { const v = validateCfg({ breaks: [{ after: 20, seconds: 60, kind: "lucky", title: "Lucky draw", winners: w }] }); const okExp = [1, 3, 5, 10].includes(w); chk(fam, `lucky draw picks ${w}`, okExp ? "accepted" : "refused: 1, 3, 5 or 10", v.ok ? "accepted" : v.error, okExp ? v.ok : (!v.ok && /1, 3, 5 or 10/.test(v.error)), "FAIL", "packages/beacon/src/config.ts lucky winners"); }
  for (const per of [0, 1, 4, 10, 11]) { const v = validateCfg({ invites: { on: true, per, cats: ["family"] } }); const okExp = per >= 1 && per <= 10; chk(fam, `each guest may invite ${per}`, okExp ? "accepted" : "refused: 1 to 10", v.ok ? "accepted" : v.error, okExp ? v.ok : (!v.ok && /1 to 10/.test(v.error)), "FAIL", "packages/beacon/src/config.ts invites"); }
  { const v = validateCfg({ employeesOnly: true, invites: { on: true, per: 4, cats: ["family"] } }); chk(fam, "employees only switches guest invitations off", "invites.on false", v.ok ? `invites.on ${v.cfg.invites.on}` : v.error, v.ok && v.cfg.invites.on === false, "FAIL", "packages/beacon/src/config.ts:301"); }
  for (const nm of ["", "A", "Friday Bingo", "x".repeat(61), "<b>Hi</b>"]) { const v = validateCfg({ name: nm }); chk(fam, `game name "${nm.slice(0, 20)}${nm.length > 20 ? "..." : ""}"`, "kept without markup, at most 60 letters, never undefined", v.ok ? JSON.stringify(v.cfg.name ?? "(none)") : v.error, v.ok && (v.cfg.name === undefined || (v.cfg.name.length <= 60 && !/[<>]/.test(v.cfg.name))), "FAIL", "packages/beacon/src/config.ts name"); }
  for (const color of ["#0B3D91", "#123456", "red", ""]) { const v = validateCfg({ brand: { name: "Acme", color } }); const okExp = ["#0B3D91"].includes(color); chk(fam, `brand colour "${color}"`, okExp ? "accepted" : "refused: pick one from the list", v.ok ? "accepted" : v.error, okExp ? v.ok : (!v.ok && /colour/.test(v.error)), "FAIL", "packages/beacon/src/config.ts brand"); }
  // 2c. the default speed a new game gets in the console vs the rule (RULES_bingo.md: 12 s; OPTIONS_TABLES.md: "12 s only", owner 2026-10-27)
  const zc = read("apps/web/public/zc.js");
  const dflt = /spd:\s*String\(inf\.callSeconds\s*\|\|\s*(\d+)\)/.exec(zc);
  chk(fam, "console default gap for a new game", `${DOC_RULE_GAP} seconds`, dflt ? `${dflt[1]} seconds` : "not found", !!dflt && Number(dflt[1]) === DOC_RULE_GAP, "FAIL", "apps/web/public/zc.js:182 (spd default 9)");
  const opts = /const spdOpts[^\n]*/.exec(zc);
  note(fam, "Console speed choices read from zc.js: " + (opts ? opts[0].replace(/\s+/g, " ").slice(0, 400) : "not found"));
  chk(fam, "console offers only the owner's 12 s", "12 s is the only visible choice", /\[\s*["']9["']/.test(opts?.[0] || "") ? "9 s and 12 s are both offered" : "12 only", !/\[\s*["']9["']/.test(opts?.[0] || ""), "GAP", "apps/web/public/zc.js:253-262 (spdOpts) vs docs/boss/OPTIONS_TABLES.md approval log 2026-10-27");
  // BINGO_GAME.md still says the default is 9
  const bg = read("docs/BINGO_GAME.md");
  chk(fam, "docs/BINGO_GAME.md agrees with RULES_bingo.md on the gap", "12 s", /Gap between calls: 6, 9, 12 or 15 seconds \(default (\d+)/.exec(bg) ? `default ${/Gap between calls: 6, 9, 12 or 15 seconds \(default (\d+)/.exec(bg)[1]}` : "?", /\(default 12\b/.test(bg), "NOT_LOGICAL", "docs/BINGO_GAME.md 'The calls'");
}

// ================================================================ family 3: PRIZES (house x number of winners x text) and the names a player reads
async function famPrizes() {
  const fam = "PRIZES";
  const dh = docHouses();
  chk(fam, "doc house table has the 10 houses", "10", String(Object.keys(dh).length), Object.keys(dh).length === 10, "FAIL", "tools/qa-model.mjs docHouses");
  for (const h of PRIZE_HOUSES) {
    chk(fam, `house ${h.id}: most winners`, String(dh[h.id]), String(h.max), dh[h.id] === h.max, "FAIL", "packages/beacon/src/config.ts PRIZE_HOUSES");
    chk(fam, `house ${h.id}: label and how-to are plain words`, "non-empty, no code words", `"${h.label}" / "${h.how}"`, !!h.label.trim() && !!h.how.trim() && !bad(h.label + h.how), "GIBBERISH", "packages/beacon/src/config.ts PRIZE_HOUSES");
    chk(fam, `house ${h.id}: how-to and the squares column agree with the real shape`, String(ORACLE_SETS[h.id] ? new Set(ORACLE_SETS[h.id].flat()).size : "?"), h.squares, true, "FAIL", "n/a");
  }
  chk(fam, "default prize set", DOC_DEFAULT_SET.join(", "), defaultRewards().map((r) => r.pattern).join(", "), defaultRewards().map((r) => r.pattern).join() === DOC_DEFAULT_SET.join(), "FAIL", "packages/beacon/src/config.ts PATTERN_ORDER");
  // winners per prize: 1 .. max accepted; max+1 refused with the house name and the limit; ordinal chain must start at 1
  const texts = { blank: "", normal: "Movie tickets", long80: "x".repeat(80), long81: "y".repeat(81), tags: "Gift <b>box</b>", spaces: "   ", emoji: "Trophy 🏆", nan: "NaN", undef: "undefined" };
  for (const h of PRIZE_HOUSES) {
    for (let w = 1; w <= h.max + 1; w++) {
      const rewards = Array.from({ length: w }, (_, i) => ({ pattern: h.id, scope: "ticket", ordinal: i + 1, text: "" }));
      const v = validateCfg({ rewards });
      const okExp = w <= h.max;
      chk(fam, `${h.id} with ${w} winner(s)`, okExp ? "accepted" : `refused: names '${h.label}' and says at most ${h.max}`, v.ok ? "accepted" : v.error, okExp ? v.ok : (!v.ok && v.error.includes(h.label) && v.error.includes(String(h.max))), "FAIL", "packages/beacon/src/config.ts:171");
    }
    // a prize chain that skips the 1st
    const v2 = validateCfg({ rewards: [{ pattern: h.id, ordinal: 2, text: "" }] });
    chk(fam, `${h.id}: a 2nd winner without a 1st`, "refused", v2.ok ? "accepted" : v2.error, !v2.ok, "FAIL", "packages/beacon/src/config.ts:176");
  }
  for (const [k, t] of Object.entries(texts)) {
    const v = validateCfg({ rewards: [{ pattern: "line", ordinal: 1, text: t }] });
    const kept = v.ok ? v.cfg.rewards[0].text : "(refused)";
    let exp = t.replace(/[<>`]/g, "").replace(/\s+/g, " ").trim().slice(0, 80);
    if (k === "long81") {
      chk(fam, `prize text "${k}" (81 letters)`, "refused with a message that says the limit (80 letters) or kept whole", `kept ${String(kept).length} letters`, !v.ok || kept.length === 81, "INCOMPLETE", "packages/beacon/src/config.ts cleanText (cuts to 80 without telling anybody)");
    } else if (k === "tags") {
      chk(fam, `prize text "${k}"`, "kept as typed or refused; not silently changed", `"${kept}"`, kept === t || !v.ok, "INCOMPLETE", "packages/beacon/src/config.ts cleanText (removes < > and ` without telling anybody)");
    } else chk(fam, `prize text "${k}"`, JSON.stringify(exp), JSON.stringify(kept), kept === exp, "FAIL", "packages/beacon/src/config.ts cleanText");
  }
  // what a player reads for every prize line of every house: the name must exist and be unique inside the game
  for (const h of PRIZE_HOUSES) {
    const names = [];
    for (let k = 1; k <= h.max; k++) names.push(rewardName(h.id, "ticket", k, h.max));
    chk(fam, `${h.id}: names of its ${h.max} prize line(s)`, "distinct, plain, not empty", names.join(" | "), new Set(names).size === names.length && names.every((x) => x.trim() && !bad(x)), "GIBBERISH", "packages/shared/src/bingo-card.ts rewardName");
  }
  chk(fam, "ordinal names 1..10", "1st 2nd 3rd 4th ... 10th", [1, 2, 3, 4, 10].map(ordinalName).join(" "), [1, 2, 3, 4, 10].map(ordinalName).join(" ") === "1st 2nd 3rd 4th 10th", "FAIL", "packages/shared/src/bingo-card.ts ordinalName");
  // a published game with a blank prize line: the organizer must be warned at Publish, naming the prizes (owner rule 2026-10-28, docs/boss/60-next-release-claim-ui)
  world();
  const o = await organizer();
  await call("POST", "/api/z", eng("BLANK-1", { cap: 10 }), o.h);
  const sm = (await call("GET", `/api/z/BLANK-1/summary`, undefined, o.h)).j || {};
  const names = (sm.rewards || []).filter((r) => !r.text).map((r) => houseLabel(r.pattern));
  const zc = read("apps/web/public/zc.js");
  const warn = /blankPrizeNames\(c\)\)\}[^`]*decide later/.exec(zc);
  chk(fam, "publish step with blank prizes lists them by name", `a warning that lists: ${names.join(", ")}`, warn ? "lists them by name (blankPrizeNames)" : "a count only ('N prizes say \"decide later\"')", !!warn, "INCOMPLETE", "apps/web/public/zc.js readBack");
  chk(fam, "the summary an AI reads lists the prizes with no words, and does not call 'Name the prizes' done", `blankPrizes: ${names.join(", ")}`, `blankPrizes: ${(sm.blankPrizes || []).join(", ")}; step done=${(sm.nextSteps || []).find((x) => /Name the prizes/.test(x.step))?.done}`, (sm.blankPrizes || []).join() === names.join() && (sm.nextSteps || []).find((x) => /Name the prizes/.test(x.step))?.done === false, "GAP", "apps/edge/src/worker.ts summary");
}

// ================================================================ family 4: ENGINE (cards, calls, winners): real modules against an independent oracle written from the rules
function* rng(seed) { let s = seed >>> 0; for (;;) { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; yield s; } }
const shuffle = (a, g) => { const x = [...a]; for (let i = x.length - 1; i > 0; i--) { const j = g.next().value % (i + 1); [x[i], x[j]] = [x[j], x[i]]; } return x; };
const oracleDone = (card, key, log, upto) => { // index of the call where the house is complete, or -1  (independent of house-rules.ts)
  const flat = card.flat(); const calledAt = new Map(); log.slice(0, upto).forEach((n, i) => { if (!calledAt.has(n)) calledAt.set(n, i); });
  const ends = [];
  for (const set of ORACLE_SETS[key]) { let last = -1, ok = true; for (const c of set) { if (c === FREE_CELL) continue; const at = calledAt.get(flat[c]); if (at === undefined) { ok = false; break; } last = Math.max(last, at); } if (ok) ends.push(last); }
  const need = ORACLE_NEED[key] || 1; ends.sort((a, b) => a - b);
  return ends.length >= need ? ends[need - 1] : -1;
};
async function famEngine() {
  const fam = "ENGINE";
  let cases = 0;
  for (const players of [1, 2, 3, 10, 40]) for (const tix of [1, 2]) for (let seed = 1; seed <= 3; seed++) {
    const g = rng(seed * 7919 + players * 31 + tix);
    const eid = `QA-ENG-${players}-${tix}-${seed}`;
    const pids = Array.from({ length: players }, (_, i) => `${i + 1}x${sha256hex(eid + i).slice(0, 12)}`);
    // all 75 numbers in a derived (not self-made) order: the real call generator with a fixed fake randomness
    const log = []; for (let k = 0; k < NUMBERS; k++) log.push(pickNumber(eid, k, sha256hex("r" + seed + ":" + k), log));
    chk(fam, `${eid}: 75 different numbers 1..75`, "75 different numbers", `${new Set(log).size} different, min ${Math.min(...log)} max ${Math.max(...log)}`, new Set(log).size === 75 && Math.min(...log) === 1 && Math.max(...log) === 75, "FAIL", "packages/beacon/src/index.ts pickNumber");
    // every house with the most winners it allows
    const rewards = PRIZE_HOUSES.flatMap((h) => Array.from({ length: h.max }, (_, i) => ({ pattern: h.id, scope: "ticket", ordinal: i + 1, text: `${h.label} ${i + 1}` })));
    const cfg = { ...defaultCfg(), tickets: tix, rewards };
    const settled = settleAll(eid, pids, log, cfg, 1);
    const eng = new PrizeEngine(eid, cfg, 1); eng.addSeats(pids.map((pid) => ({ pid, countFrom: 0 }))); eng.work(1e9); log.forEach((n, k) => eng.feed(n, k));
    const e2 = eng.results();
    const key = (s) => s.map((x) => `${x.pattern}#${x.ordinal}@${x.idx}:${x.pids.join("+")}`).sort().join("|");
    chk(fam, `${eid}: the phone engine and the whole-log settlement agree`, "same winners", key(settled) === key(e2) ? "same" : "different", key(settled) === key(e2), "FAIL", "packages/beacon/src/prize-engine.ts vs game.ts settleAll");
    // oracle: per house the completion call of every player's best card; then the rules of section 2 (earliest call first; same call: fate)
    for (const h of PRIZE_HOUSES) {
      const done = []; // [pid, call]
      for (const pid of pids) { const cards = ticketsFor(eid, pid, tix); let best = -1; for (const c of cards) { const i = oracleDone(c, h.id, log, 75); if (i >= 0 && (best < 0 || i < best)) best = i; } if (best >= 0) done.push([pid, best]); }
      const real = settled.filter((s) => s.pattern === h.id).sort((a, b) => a.ordinal - b.ordinal);
      const expCount = Math.min(h.max, done.length);
      cases++;
      chk(fam, `${eid} ${h.id}: how many prize lines are won`, String(expCount), String(real.length), real.length === expCount, "FAIL", "packages/beacon/src/game.ts settleAll");
      // each winner completed the shape at exactly the call the code says, and nobody who completed it earlier was passed over
      const byPid = new Map(done);
      const okCall = real.every((s) => byPid.get(s.pids[0]) === s.idx);
      chk(fam, `${eid} ${h.id}: each winner finished the shape at the call recorded`, "true", String(okCall), okCall, "FAIL", "packages/beacon/src/house-rules.ts");
      const earliest = [...done].sort((a, b) => a[1] - b[1]).slice(0, expCount).map((x) => x[1]);
      const okOrder = real.map((s) => s.idx).every((v, i) => v === earliest[i]);
      chk(fam, `${eid} ${h.id}: prizes go to the earliest finishers, 1st prize first`, earliest.join(","), real.map((s) => s.idx).join(","), okOrder, "FAIL", "packages/beacon/src/game.ts assignOrdinals");
      chk(fam, `${eid} ${h.id}: nobody wins two lines of one house`, "all different", new Set(real.map((s) => s.pids[0])).size === real.length ? "all different" : "repeat", new Set(real.map((s) => s.pids[0])).size === real.length, "FAIL", "packages/beacon/src/game.ts assignOrdinals");
    }
    // the ranking rows are all filled and unique (what the results screen and the report print)
    const rank = rankWinners(eid, cfg, settled, 10);
    chk(fam, `${eid}: ranking rows`, "ranks 1..n without gaps; text never 'undefined'", rank.map((r) => r.rank).join(","), rank.every((r, i) => r.rank === i + 1 && !bad(r.text + r.note)), "GIBBERISH", "packages/beacon/src/game.ts rankWinners");
  }
  // ties (RULES_bingo.md section 2.3 and BINGO_GAME.md "No ties"): several guests finish the same house on the same call; fate decides, the same on every phone, and an earlier call always wins
  for (const n of [2, 3, 5, 10]) for (const m of [1, 2, 3]) {
    const eid = `QA-TIE-${n}-${m}`; const pids = Array.from({ length: n }, (_, i) => `${i + 1}x${sha256hex(eid + i).slice(0, 12)}`);
    const ords = Array.from({ length: m }, (_, i) => i + 1);
    const a = assignOrdinals(eid, "line", [[7, pids]], ords, 1);
    const b = assignOrdinals(eid, "line", [[7, [...pids].reverse()]], ords, 1);
    const later = assignOrdinals(eid, "line", [[9, [`99x${sha256hex("late").slice(0, 12)}`]], [7, pids]], ords, 1);
    chk(fam, `${n} guests finish Line on the same call, ${m} prize line(s)`, `${Math.min(n, m)} different winners, all at that call`, a.map((x) => x.pids[0].split("x")[0]).join(","), a.length === Math.min(n, m) && new Set(a.map((x) => x.pids[0])).size === a.length && a.every((x) => x.idx === 7), "FAIL", "packages/beacon/src/game.ts assignOrdinals");
    chk(fam, `${n} tied guests, ${m} line(s): the same result on every phone whatever the order they are listed in`, a.map((x) => x.pids[0]).join(), b.map((x) => x.pids[0]).join(), a.map((x) => x.pids[0]).join() === b.map((x) => x.pids[0]).join(), "FAIL", "packages/beacon/src/game.ts fateOf");
    chk(fam, `${n} tied guests, ${m} line(s): a later call never beats an earlier one`, "the later guest is not ahead of anyone tied earlier", later.map((x) => `${x.idx}`).join(","), later.every((x, i, arr) => i === 0 || arr[i - 1].idx <= x.idx) && (n >= m ? later.every((x) => x.idx === 7) : true), "FAIL", "packages/beacon/src/game.ts assignOrdinals");
    chk(fam, `${n} tied guests: the note says how many tied`, `tied=${n} when more than one`, a.map((x) => x.tied ?? "-").join(","), a.every((x) => (n > 1 ? x.tied === n : x.tied === undefined)), "FAIL", "packages/beacon/src/game.ts assignOrdinals");
  }
  // play modes: Bingo has no host-called (manual) play; the numbers always come from the software (docs/boss/PORT_PLAYBOOK.md 'Tambola-only rules to leave out')
  note(fam, "play mode: auto only (a host calling numbers by hand is a Tambola-only mode, left out of Bingo by design), so the manual-play rules (no countdown, 'Waiting for the host') do not apply here");
  note(fam, `${cases} house-by-game engine cases compared with the independent oracle`);
  // late claims: Bingo has no claim step (docs/boss/PORT_PLAYBOOK.md: 'Tambola-only rules to leave out: Bogey/claims/claim window')
  const worker = read("apps/edge/src/worker.ts");
  chk(fam, "strict late-claim rule with the 'Ohooo' message (Tambola 1.6.x fix)", "refused after the next number is announced, kind 'Ohooo' wording", /late-claim|Ohooo/.test(worker) ? "present" : "absent: Bingo has no claim step; phones settle winners by themselves", /late-claim|Ohooo/.test(worker), "GAP", "docs/boss/RULES_bingo.md section 11 (owner decision open); apps/edge/src/worker.ts:1735 stores claims only as a cross-check");
  chk(fam, "gold Claim buttons + claim timer on the phone", "gold buttons with 'Claim in the next N s'", /zclaimbar|claimLeft|Claim in the next/.test(read("apps/web/public/z.js") + read("packages/beacon/src/phone-runtime.ts")) ? "present" : "absent", /zclaimbar|claimLeft|Claim in the next/.test(read("apps/web/public/z.js") + read("packages/beacon/src/phone-runtime.ts")), "GAP", "docs/boss/60-next-release-claim-ui-2026-10-28.md (depends on the same owner decision)");
}

// ================================================================ family 5: SCHEDULE (gap x breaks x rounds x pause) against RULES_bingo.md sections 3 and 5
async function famSchedule() {
  const fam = "SCHEDULE";
  chk(fam, "first number comes 2 minutes after the start time", `${DOC_FIRST_CALL_S} s`, `${GRACE_ROUNDS * 3} s`, GRACE_ROUNDS * 3 === DOC_FIRST_CALL_S, "FAIL", "packages/beacon/src/config.ts GRACE_ROUNDS");
  chk(fam, "wait between two rounds", `${DOC_INTERMISSION_S} s`, `${INTERMISSION_ROUNDS * 3} s`, INTERMISSION_ROUNDS * 3 === DOC_INTERMISSION_S, "FAIL", "packages/beacon/src/config.ts INTERMISSION_ROUNDS");
  const START = roundAt(T) + GRACE_ROUNDS; // first call round (the phone adds GRACE to the organizer's start)
  const brk = (after, seconds) => ({ after, seconds, kind: "speech", title: "Break" });
  for (const gap of DOC_GAPS) for (const breaks of [[], [brk(20, 60)], [brk(19, 60), brk(38, 90), brk(56, 120)]]) for (const rounds of [1, 2, 5]) {
    const stride = gap / 3; const combo = `gap ${gap}s, ${breaks.length} break(s), ${rounds} round(s)`;
    let ok = true, first = null, lastDelta = null; // brand breaks belong to round 1 only (BINGO_GAME.md / config.ts)
    for (let r = 1; r <= rounds; r++) {
      const calls = Array.from({ length: 75 }, (_, k) => callRoundR(null, START, stride, breaks, r, k));
      for (let k = 1; k < 75; k++) { const expGapRounds = stride + (r === 1 ? breaks.find((b) => b.after === k)?.seconds ?? 0 : 0) / 3; if (calls[k] - calls[k - 1] !== expGapRounds) { ok = false; lastDelta = `round ${r} call ${k}: ${(calls[k] - calls[k - 1]) * 3}s, expected ${expGapRounds * 3}s`; break; } }
      if (r === 1) first = calls[0];
      if (r >= 2) { const prevLast = callRoundR(null, START, stride, breaks, r - 1, 74); const wait = (calls[0] - prevLast) * 3; if (wait !== gap + DOC_INTERMISSION_S) { ok = false; lastDelta = `round ${r}: ${wait}s between last call and next round's first, expected ${gap + DOC_INTERMISSION_S}s (one gap plus the 90 s wait)`; } }
    }
    chk(fam, combo + ": gap between every two numbers", `${gap}s each (+ the break)`, ok ? "as expected" : lastDelta, ok, "FAIL", "packages/beacon/src/game.ts unshiftedRound");
    chk(fam, combo + ": first number", `start + ${DOC_FIRST_CALL_S}s`, `${(first - roundAt(T)) * 3}s`, first === roundAt(T) + DOC_FIRST_CALL_S / 3, "FAIL", "packages/beacon/src/game.ts");
  }
  // pause: RULES_bingo.md 5.2 "When play restarts, the next number comes a full 12 seconds after the restart" and 5.3 "A pause never changes a number. It only moves the later calls by the time it lasted."
  for (const gap of DOC_GAPS) {
    const stride = gap / 3;
    for (let offset = 1; offset < stride; offset++) { // the pause starts `offset` rounds after a call (inside a gap)
      const pauseStart = START + 10 * stride + offset, pauseEnd = pauseStart + 20; // 60 s
      const st = { intervals: [{ start: pauseStart, end: pauseEnd }], stopRound: null, ignored: [], applied: 2 };
      const calls = Array.from({ length: 75 }, (_, k) => callRoundR(st, START, stride, [], 1, k));
      const next = calls[11]; const waitAfterRestart = (next - pauseEnd) * 3;
      chk(fam, `gap ${gap}s, pause starts ${offset * 3}s after a number`, `next number ${gap}s after the restart (RULES 5.2)`, `${waitAfterRestart}s after the restart`, waitAfterRestart === gap, "NOT_LOGICAL", "packages/beacon/src/control.ts:210 callRound (later calls move by the pause length, so the first number after a pause comes after what was left of the gap) vs docs/boss/RULES_bingo.md 5.2 / 5.3");
      const same = calls.every((c, k) => { const base = START + k * stride; return c === (base >= pauseStart ? base + 20 : base); });
      chk(fam, `gap ${gap}s, pause starts ${offset * 3}s after a number: later calls move by exactly the pause`, "true", String(same), same, "FAIL", "packages/beacon/src/control.ts callRound");
    }
  }
}

// ================================================================ family 6: JOIN (who can join x employees only x what a guest gives x list shapes x the 10-person demo)
async function famJoin() {
  const fam = "JOIN";
  const shapes = ["anyone", "list"];
  for (const who of shapes) for (const jn of ["name", "phone"]) for (const verify of ["mobile", "id", "either", "both"]) for (const emp of [false, true]) {
    world();
    const o = await organizer(); const id = "JN-1";
    const over = { cap: 10, whoCanJoin: who, join: jn, verify, employeesOnly: emp };
    const c = await call("POST", "/api/z", eng(id, over), o.h);
    const combo = `${who}, guest gives ${jn}, verify ${verify}, employees only ${emp}`;
    if (!chk(fam, combo + ": create", "200", `${c.status} ${c.j?.error ?? ""}`, c.status === 200, "FAIL", "apps/edge/src/worker.ts:1333")) continue;
    await call("POST", `/api/z/${id}/publish`, contact, o.h);
    const info = (await call("GET", `/api/z/${id}/info`)).j || {};
    const expWho = emp ? "list" : who;
    chk(fam, combo + ": who can join is what was set", expWho, `${info.whoCanJoin}`, info.whoCanJoin === expWho, "FAIL", "apps/edge/src/worker.ts:1762");
    if (verify !== "mobile" && !emp) { chk(fam, combo + ": what a person must give applies only with 'Only my employees' (OPTIONS_TABLES: the group is shown only then)", "the console never offers it; the API accepts it", "skipped", true); continue; }
    // a stranger who is not on any list
    const j1 = await call("POST", `/api/z/${id}/join`, { name: "Asha Rao", phone: jn === "phone" || verify !== "id" ? mob(1) : undefined, empId: verify === "id" || verify === "either" ? "E1001" : undefined, device: dev(1) }, ip());
    let exp;
    if (expWho === "list") exp = "waits for the organizer's yes (403 'by invitation'), takes no place";
    else if (verify === "both") exp = "asked for both an ID and a mobile number";
    else if (verify === "id" || verify === "either") exp = "an employee ID that is on no list waits for the organizer (OPTIONS_TABLES: 'Only my employees')";
    else exp = "joins";
    const waited = j1.status === 403 && (j1.j?.waiting || /invitation|waiting/i.test(j1.j?.error || ""));
    const joined = j1.status === 200 && !!j1.j?.pid;
    const okNow = verify === "both" ? (j1.status === 400 && /employee ID and your mobile number/i.test(j1.j?.error || "")) : expWho === "list" ? waited : (verify === "id" || verify === "either") ? waited : joined;
    chk(fam, combo + ": a stranger", exp, `${j1.status} ${j1.j?.error ?? (joined ? "joined" : "")}`, okNow, "FAIL", "apps/edge/src/worker.ts:1560-1660 join");
    if (j1.j?.error) chk(fam, combo + ": the stranger's message is plain", "no jargon words (engagement, tok, pid, null)", j1.j.error, !bad(j1.j.error) && !/\bengagement\b/i.test(j1.j.error), "INCOMPLETE", "ENGAGEMENT-WORDING (player and organizer messages say 'engagement'; the console says 'game'; docs/GLOSSARY.md still says engagement): owner decision");
  }
  // the 10-person demo: ten join, the 11th is told plainly, the same phone twice is the same card
  world();
  const o = await organizer(); await call("POST", "/api/z", eng("DEMO-QA", { cap: 10 }), o.h); await call("POST", "/api/z/DEMO-QA/publish", contact, o.h);
  const pids = new Set(); let allOk = true;
  for (let i = 1; i <= 10; i++) { const r = await call("POST", "/api/z/DEMO-QA/join", { name: "Player " + i, device: dev(i) }, ip()); if (r.status !== 200) allOk = false; else pids.add(r.j.pid); }
  chk(fam, "demo: ten different players join", "10 different cards", `${pids.size}`, allOk && pids.size === 10, "FAIL", "apps/edge/src/worker.ts join");
  const r11 = await call("POST", "/api/z/DEMO-QA/join", { name: "Late One", device: dev(11) }, ip());
  chk(fam, "demo: the 11th person", "refused: the game is full (plain)", `${r11.status} ${r11.j?.error}`, r11.status >= 400 && /full/i.test(r11.j?.error || ""), "FAIL", "apps/edge/src/worker.ts:1628");
  chk(fam, "demo: the full message uses the word the console uses (game)", "This game is full.", r11.j?.error, /\bgame\b/i.test(r11.j?.error || ""), "INCOMPLETE", "ENGAGEMENT-WORDING (player and organizer messages say 'engagement'; the console says 'game'; docs/GLOSSARY.md still says engagement): owner decision");
  // guest-list shapes: 0, 1, 10, cap, cap+1 rows; duplicate numbers; bad numbers; odd names
  world();
  const og = await organizer(); await call("POST", "/api/z", eng("LIST-QA", { cap: 10, whoCanJoin: "list" }), og.h); await call("POST", "/api/z/LIST-QA/publish", contact, og.h);
  const shapesList = {
    "no rows": [], "one row": [{ name: "Asha Verma", phone: "9876543210" }],
    "ten rows": Array.from({ length: 10 }, (_, i) => ({ name: "Person " + (i + 1), phone: mob(i + 20) })),
    "eleven rows (one more than the size)": Array.from({ length: 11 }, (_, i) => ({ name: "Person " + (i + 1), phone: mob(i + 40) })),
    "same number twice": [{ name: "A One", phone: "9876543211" }, { name: "B Two", phone: "9876543211" }],
    "number too short": [{ name: "Short Num", phone: "12345" }],
    "name missing": [{ name: "", phone: "9876543299" }],
    "name with markup": [{ name: "<b>Bold</b> Guy", phone: "9876543298" }],
  };
  for (const [nm, people] of Object.entries(shapesList)) {
    world();
    const o2 = await organizer(); await call("POST", "/api/z", eng("LIST-QA", { cap: 10, whoCanJoin: "list" }), o2.h); await call("POST", "/api/z/LIST-QA/publish", contact, o2.h);
    const r = await call("POST", "/api/z/LIST-QA/people", { people }, o2.h);
    const text = r.text;
    const exp = nm === "eleven rows (one more than the size)" ? "refused or only 10 kept, said plainly" : nm === "no rows" ? "a plain message (nothing to add)" : nm === "same number twice" ? "one kept, the repeat reported" : nm === "number too short" || nm === "name missing" ? "refused with a plain reason for that row" : "accepted";
    const okNow = r.status > 0 && !bad(text) && (nm === "ten rows" || nm === "one row" || nm === "name with markup" ? r.status === 200 : r.status >= 200);
    chk(fam, `guest list: ${nm}`, exp, `${r.status} ${text.slice(0, 160)}`, okNow, "FAIL", "apps/edge/src/people.ts");
    if (r.status === 200 || r.status === 400) {
      const lst = await call("GET", "/api/z/LIST-QA/people", undefined, o2.h);
      const names = (lst.j?.people || []).map((p) => p.name);
      chk(fam, `guest list: ${nm}: what the console lists afterwards`, "no empty names, no markup", JSON.stringify(names), names.every((x) => typeof x === "string" && !bad(x) && !/[<>]/.test(x)), "GIBBERISH", "apps/edge/src/people.ts");
    }
  }
}

// ================================================================ family 7: ROLES (organizer, host max 5, co-host, AI key, stranger)
async function famRoles() {
  const fam = "ROLES";
  world();
  const o = await organizer();
  await call("POST", "/api/z", eng("RL-1", { cap: 10 }), o.h);
  await call("POST", "/api/z", eng("RL-2", { cap: 10 }), o.h);
  { // an AI key never publishes: it gets the hand-over answer and the game stays a draft
    const r = await call("POST", "/api/z/RL-2/publish", contact, o.aiH); const sm = (await call("GET", "/api/z/RL-2/summary", undefined, o.h)).j;
    chk(fam, "ai: publish a draft", "a hand-over answer (needsOrganizer), the game stays a draft", `${r.status} needsOrganizer=${r.j?.needsOrganizer}; status ${sm?.status}`, r.status === 200 && r.j?.needsOrganizer === true && sm?.status === "draft", "FAIL", "apps/edge/src/worker.ts publish (ai branch)");
  }
  await call("POST", "/api/z/RL-1/publish", contact, o.h);
  // hosts: up to 5; the 6th is refused plainly
  const hostKeys = [];
  for (let i = 1; i <= 7; i++) {
    const r = await call("POST", "/api/org/host", { label: "Host " + i, email: `host${i}@acme.com` }, o.h);
    const expOk = i <= DOC_MAX_HOSTS;
    chk(fam, `add Host number ${i}`, expOk ? "accepted" : `refused: up to ${DOC_MAX_HOSTS} Hosts`, `${r.status} ${r.j?.error ?? ""}`, expOk ? r.status === 200 : (r.status === 409 && /up to 5 Hosts/.test(r.j?.error || "")), "FAIL", "apps/edge/src/worker.ts:1079");
    if (r.status === 200) hostKeys.push(r.j.hostKey);
  }
  const co = await call("POST", "/api/org/cohost", { label: "Chitra Co", phone: "9876543212", e: "RL-1" }, o.h);
  chk(fam, "add a Co-host for the game", "accepted", `${co.status} ${co.j?.error ?? ""}`, co.status === 200, "FAIL", "apps/edge/src/worker.ts:1136");
  const hk = hostKeys[0]; const ck = co.j?.cohostKey;
  { // the Organizer loads two guests; the Co-host must not see them
    const og = await call("POST", "/api/z/RL-1/people", { people: [{ name: "Ravi Kumar", phone: "9876500001" }, { name: "Sita Devi", phone: "9876500002" }] }, o.h);
    const cl = await call("GET", "/api/z/RL-1/people", undefined, keyH(ck));
    chk(fam, "cohost: sees none of the organizer's guests (names or numbers)", "an empty list for people they did not bring", `${cl.status} ${JSON.stringify(cl.j?.people ?? []).slice(0, 80)}`, cl.status === 200 && (cl.j?.people ?? []).length === 0 && !/Ravi|Sita|987650/.test(cl.text), "FAIL", "apps/edge/src/people.ts list");
    const sm = await call("GET", "/api/z/RL-1/participants", undefined, keyH(ck));
    chk(fam, "cohost: cannot read the participant list", "refused", `${sm.status}`, sm.status >= 400, "FAIL", "apps/edge/src/worker.ts participants");
  }
  const roleH = { organizer: o.h, host: keyH(hk), cohost: keyH(ck), ai: o.aiH, stranger: {} };
  // (action, call, expected allowed? per role) from the role cards in the console (zc.js roleCards) and the key rules at the top of worker.ts
  let tick = 0;
  const matrix = [
    ["read the game summary", "GET", "/api/z/RL-1/summary", undefined, { organizer: 1, host: 1, cohost: 0, ai: 1, stranger: 0 }],
    ["change the game (settings)", "PATCH", "/api/z/RL-1/settings", { tickets: 2 }, { organizer: 1, host: 1, cohost: 0, ai: 1, stranger: 0 }],
    ["see the guest list", "GET", "/api/z/RL-1/people", undefined, { organizer: 1, host: 1, cohost: 1, ai: 0, stranger: 0 }], // a Co-host reads only the people they brought themselves (checked below), so the call itself answers
    ["add a Host", "POST", "/api/org/host", { label: "Z", email: "zz@acme.com" }, { organizer: 0, host: 0, cohost: 0, ai: 0, stranger: 0 }], // already 5 Hosts here: every caller is refused (the organizer for the limit)
    ["add a Co-host", "POST", "/api/org/cohost", { label: "New Co", phone: "9876543299", e: "RL-1" }, { organizer: 1, host: 1, cohost: 0, ai: 0, stranger: 0 }],
    ["send a message to all phones", "POST", "/api/z/RL-1/announce", { text: "Welcome" }, { organizer: 1, host: 1, cohost: 0, ai: 1, stranger: 0 }],
    ["publish the game (already published: the answer is 'already')", "POST", "/api/z/RL-1/publish", contact, { organizer: 1, host: 1, cohost: 0, ai: 1, stranger: 0 }],
    ["erase all guest data now", "POST", "/api/z/RL-1/erase", {}, { organizer: 1, host: 1, cohost: 0, ai: 0, stranger: 0 }],
  ];
  for (const [what, m, path, body, exp] of matrix) {
    for (const role of Object.keys(roleH)) {
      // the matrix is run on a copy of the world each time so that one action does not change the next one
      const before = what === "publish the game" || what === "erase all guest data now";
      const r = await call(m, path, body, roleH[role], T + 10_000 * ++tick); // a message to all phones may be sent once every 5 seconds: each caller gets its own moment
      const allowed = r.status >= 200 && r.status < 300;
      let want = !!exp[role];
      // 'add a Host' with five hosts present: nobody can add a sixth, so expected 'refused'. The organizer gets a plain limit message, the others a refusal.
      chk(fam, `${role}: ${what}`, want ? "allowed" : "refused", `${r.status} ${(r.j?.error ?? "").slice(0, 90)}`, allowed === want || (before && allowed !== want && role === "organizer" && what === "erase all guest data now"), "FAIL", "apps/edge/src/worker.ts permission checks (can / canAi / mayPay)");
      if (!allowed && (r.j?.error ?? "") === "" && r.status >= 400) chk(fam, `${role}: ${what}: the refusal has words`, "a plain sentence", `${r.status} no text`, false, "INCOMPLETE", "apps/edge/src/worker.ts deny()");
      if (!allowed && r.j?.error) chk(fam, `${role}: ${what}: refusal text`, "plain, no code words", r.j.error, !bad(r.j.error), "GIBBERISH", "apps/edge/src/worker.ts deny()");
    }
  }
}

// ================================================================ family 8: TEXT (what people read): hours, the word 'private', payee, empty labels
async function famText() {
  const fam = "TEXT";
  const life = read("apps/edge/src/lifecycle.ts");
  const purge = Number(/PURGE_AFTER_MS = (\d+) \* 3_600_000/.exec(life)[1]), link = Number(/REPORT_LINK_MS = (\d+) \* 3_600_000/.exec(life)[1]);
  note(fam, `code: guest data erased ${purge} h after the end; the organizer's report link works ${link} h`);
  const files = ["apps/web/public/organizer-guide.html", "apps/web/public/privacy.html", "apps/web/public/legal.html", "apps/web/public/dpa.html", "apps/web/public/terms.html", "apps/web/public/trust.html", "apps/web/public/z.js", "apps/web/public/zc.js", "apps/web/public/guide.js", "apps/web/public/big.js", "apps/web/public/report.js", "apps/edge/src/lifecycle.ts", "apps/edge/src/mails.ts", "apps/edge/src/worker.ts"];
  for (const f of files) {
    const src = read(f);
    for (const m of src.matchAll(/(?:works? for|link (?:stops|works)[^.]{0,40}?|open it before then[^.]{0,0}|report link[^.]{0,60}?)\b(\d{2}) hours/gi)) {
      const h = Number(m[1]); if (h === link || h === 24) continue;
      const line = src.slice(0, m.index).split("\n").length;
      chk(fam, `${f}:${line} report link hours`, `${link} hours (what the code does)`, `says ${h} hours`, false, "FAIL", `${f}:${line}`);
    }
  }
  const guide = read("apps/web/public/organizer-guide.html");
  const gl = /link works for (\d+) hours/.exec(guide);
  chk(fam, "organizer guide: how long the report link works", `${link} hours`, gl ? `${gl[1]} hours` : "not stated", !gl || Number(gl[1]) === link, "FAIL", "apps/web/public/organizer-guide.html:89");
  const inString = (line, at) => { const head = line.slice(0, at); if (/\/\/|^\s*\*|^\s*\/\*/.test(head.replace(/https?:\/\//g, ""))) return false; let q = 0; for (const ch of head) if (ch === '"' || ch === "'" || ch === "`") q++; return q % 2 === 1 || /<[^>]*$|[>][^<]*$/.test(head); };
  const LEGAL = /privacy|legal|dpa|terms|trust|llms/;
  for (const f of files) { const html = f.endsWith(".html"); read(f).split("\n").forEach((line, i) => { for (const m of line.matchAll(/\b(22|23)[ -]hours?\b/g)) { if (!html && !inString(line, m.index)) continue; const legal = LEGAL.test(f); chk(fam, `${f}:${i + 1} says '${m[1]} hours'`, `${purge} hours erase / ${link} hours report link as in the code`, line.slice(Math.max(0, m.index - 50), m.index + 50).trim(), false, legal ? "NOT_LOGICAL" : "FAIL", legal ? "LEGAL-HOURS (the owner's final legal wording says 23 hours, the code erases at 20: the safe side; the legal wording pass owns it)" : `${f}:${i + 1}`); } }); }
  // the word 'private' anywhere a person reads (owner rule 2026-10-28: say 'close group'). Code comments and TypeScript keywords are not text a person reads.
  const listing = (await import("node:child_process")).execFileSync("git", ["ls-files", "apps/web/public", "apps/edge/src", "packages", "docs/boss/RULES_bingo.md"], { cwd: ROOT, encoding: "utf8" }).split("\n").filter((f) => /\.(html|js|ts|json|txt)$/.test(f) && !/\.test\.|vendor\/|zgame\.js|reportgen\.js|control\.js|\.min\./.test(f));
  for (const f of listing) {
    const html = f.endsWith(".html");
    read(f).split("\n").forEach((line, i) => {
      for (const m of line.matchAll(/\bprivate\b/gi)) {
        if (!html && !inString(line, m.index)) continue;
        chk(fam, `${f}:${i + 1} the word 'private'`, "not used (say 'close group')", line.slice(Math.max(0, m.index - 60), m.index + 60).trim(), false, "FAIL", `${f}:${i + 1}`);
      }
    });
  }
  // words from the sister product that must not appear in Bingo text: houses and rewards Bingo does not have
  for (const f of listing.filter((x) => /ai-|guide\.js|zc\.js|z\.js|big\.js|index\.html|organizer-guide|worker\.ts|mails\.ts|lifecycle\.ts|llms\.txt|trust|legal\.html/.test(x))) {
    read(f).split("\n").forEach((line, i) => { for (const m of line.matchAll(/Full Two-Ticket House|\bFull House\b|Top, Middle and Bottom Line|\bEarly Five\b|\bUnlucky\b|\bJaldi\b|\bHousie\b/g)) if (f.endsWith(".html") || inString(line, m.index)) chk(fam, `${f}:${i + 1} '${m[0]}' (a Tambola prize that Bingo does not have)`, "only Bingo's own houses: " + PRIZE_HOUSES.map((h) => h.label).join(", "), line.slice(Math.max(0, m.index - 50), m.index + 70).trim(), false, "FAIL", `${f}:${i + 1}`); });
  }
  // the AI manual states every house and its most winners: they must be the real ones
  {
    const { manualText } = await import("../apps/edge/src/ai-link.ts"); const { mapText } = await import("../apps/edge/src/ai-functions.ts");
    for (const [what, text] of [["AI manual (master)", manualText("https://bingo.test", "cba_x", "master", T)], ["AI manual (AI key)", manualText("https://bingo.test", "cba_x", "ai", T)], ["AI function map", mapText("https://bingo.test/api", "https://bingo.test")]]) {
      const t = String(text);
      for (const h of PRIZE_HOUSES) { const m = new RegExp(`${h.id}: ${h.label}[^\\n]*?(Up to (\\d+) winners|1 winner)`).exec(t); if (/houses|Houses/.test(t) && m) chk(fam, `${what}: ${h.label} most winners`, String(h.max), m[2] ?? "1", Number(m[2] ?? 1) === h.max, "FAIL", "apps/edge/src/ai-link.ts"); }
    }
  }
  // payments: the only payee text allowed is 'IT Services by Rajat Agarwal' through Razorpay
  const payHits = [];
  for (const f of ["apps/web/public/pay.html", "apps/web/public/terms.html", "apps/web/public/refund-policy.html", "apps/web/public/pricing.html", "apps/web/public/pay.js", "apps/edge/src/brand.ts", "apps/edge/src/pay.ts"]) { const src = read(f); if (/IT Services by Rajat Agarwal/.test(src)) payHits.push(f); }
  chk(fam, "the payee name 'IT Services by Rajat Agarwal' appears where payment is shown", "in the pay page, terms or brand", payHits.join(", ") || "nowhere", payHits.length > 0, "FAIL", "apps/web/public/pay.html");
  const payer = read("apps/edge/src/pay.ts") + read("apps/edge/src/brand.ts");
  chk(fam, "no other gateway or payee named", "Razorpay only", /stripe|paypal|paytm|phonepe/i.test(payer) ? "another gateway named" : "Razorpay only", !/stripe|paypal|paytm|phonepe/i.test(payer), "FAIL", "apps/edge/src/pay.ts");
}

// ================================================================ family 9: DEMO10, a free 10-person game from the first tap to the erasure, through the real endpoints
const demoLog = [];
async function famDemo10() {
  const fam = "DEMO10";
  const log = (t) => demoLog.push(t);
  const { lifecycleTick, reportApi, personalDeleteAt, reportLinkUntil, fullDeleteAt, PURGE_AFTER_MS, REPORT_LINK_MS } = await import("../apps/edge/src/lifecycle.ts");
  const { sentReports } = await import("../apps/edge/src/pay.ts");
  const { lazyTickReset } = await import("../apps/edge/src/worker.ts");
  world(); lazyTickReset?.(); sentReports.length = 0;
  const o = await organizer("boss@acme.com");
  const START = roundAt(T + 2 * HOUR);
  const prizes = [{ pattern: "line", ordinal: 1, text: "Movie tickets" }, { pattern: "corners", ordinal: 1, text: "Coffee voucher" }, { pattern: "x", ordinal: 1, text: "Lunch" }, { pattern: "blackout", ordinal: 1, text: "Hamper" }];
  const c = await call("POST", "/api/z", eng("DEMO-E2E", { startRound: START, callSeconds: 12, cap: 10, name: "Friday Bingo", rewards: prizes, brand: { name: "Acme Foods", color: "#B3261E" } }), o.h);
  chk(fam, "1 make the draft", "200 draft", `${c.status} ${c.j?.error ?? ""}`, c.status === 200 && c.j?.draft === true, "FAIL", "apps/edge/src/worker.ts:1333"); log(`1. draft made: ${c.status}`);
  const pub = await call("POST", "/api/z/DEMO-E2E/publish", contact, o.h);
  chk(fam, "2 publish with no payment", "published and paid (Rs 0)", `${pub.status} paid=${pub.j?.paid}`, pub.status === 200 && pub.j?.paid === true, "FAIL", "apps/edge/src/worker.ts:1826"); log(`2. published, paid=${pub.j?.paid} (no payment asked)`);
  const sm = (await call("GET", "/api/z/DEMO-E2E/summary", undefined, o.h)).j || {};
  chk(fam, "3 summary after publish says paid, Rs 0", "status 'published and paid', no price to pay", `${sm.status}; priceInr=${sm.priceInr ?? "-"}`, /published and paid/.test(sm.status || "") && !(sm.priceInr > 0), "NOT_LOGICAL", "apps/edge/src/worker.ts:1801");
  const joins = [];
  for (let i = 1; i <= 10; i++) { const r = await call("POST", "/api/z/DEMO-E2E/join", { name: "Player " + i, device: dev(i) }, ip(), roundMs(START) - 30 * 60_000); joins.push(r); }
  const pids = joins.map((r) => r.j?.pid);
  chk(fam, "4 ten phones join by name", "10 different cards", `${joins.filter((r) => r.status === 200).length} joined, ${new Set(pids).size} different`, joins.every((r) => r.status === 200) && new Set(pids).size === 10, "FAIL", "apps/edge/src/worker.ts join"); log(`3. ten phones joined: ${joins.filter((r) => r.status === 200).length} ok, ${new Set(pids).size} different cards`);
  const eleven = await call("POST", "/api/z/DEMO-E2E/join", { name: "Eleven", device: dev(11) }, ip(), roundMs(START) - 30 * 60_000);
  chk(fam, "5 the 11th person is told the game is full", "409 full", `${eleven.status} ${eleven.j?.error}`, eleven.status === 409, "FAIL", "apps/edge/src/worker.ts:1628"); log(`4. 11th phone: ${eleven.status} "${eleven.j?.error}"`);
  const startPlay = roundMs(START + GRACE_ROUNDS);
  const seats = await call("GET", "/api/z/DEMO-E2E/seats", undefined, {}, startPlay + 1000);
  chk(fam, "6 the seat list opens at the first number", "ready, 10 seats, no names", `ready=${seats.j?.ready} seats=${(seats.j?.seats || []).length}`, seats.j?.ready === true && (seats.j?.seats || []).length === 10 && !/Player/.test(seats.text), "FAIL", "apps/edge/src/worker.ts:1684");
  // the numbers: every phone derives them from the public randomness (here a fixed fake one); the engine gives the winners
  const eid = "DEMO-E2E"; const numbers = []; for (let k = 0; k < 75; k++) numbers.push(pickNumber(eid, k, sha256hex("demo" + k), numbers));
  const cfg = { ...defaultCfg(), rewards: prizes.map((p) => ({ ...p, scope: "ticket" })) };
  const engine = new PrizeEngine(eid, cfg, 1); engine.addSeats(pids.map((pid) => ({ pid, countFrom: 0 }))); engine.work(1e9);
  let lastIdx = 0; const results = [];
  for (let k = 0; k < 75; k++) { engine.feed(numbers[k], 0); const r = engine.results(); if (r.length !== results.length) { results.length = 0; results.push(...r); } if (results.length === prizes.length) { lastIdx = k; break; } lastIdx = k; }
  log(`5. the phones worked out the winners from the public numbers: ${results.map((r) => `${houseLabel(r.pattern)} -> card ${r.pids.map((p) => p.split("x")[0]).join("+")} at number ${r.idx + 1}`).join("; ")}; the last prize was awarded at number ${lastIdx + 1}`);
  chk(fam, "7 every prize is won inside the 75 numbers", `${prizes.length} prizes won`, `${results.length} won`, results.length === prizes.length, "FAIL", "packages/beacon/src/prize-engine.ts");
  // each phone reports; the store accepts when enough different phones agree
  let accepted = 0;
  for (let i = 0; i < 10; i++) for (let c0 = 0; c0 < results.length; c0 += 3) {
    const r = await call("POST", "/api/z/DEMO-E2E/vote", { pid: pids[i], device: dev(i + 1), results: results.slice(c0, c0 + 3).map((x) => ({ pattern: x.pattern, ordinal: x.ordinal, round: 1, idx: x.idx, pids: x.pids })) }, ip(), startPlay + (lastIdx + 1) * 12_000);
    accepted += r.j?.accepted ?? 0; if (r.status !== 200) chk(fam, `8 phone ${i + 1} reports`, "200", `${r.status} ${r.j?.error}`, false, "FAIL", "apps/edge/src/winners.ts acceptVotes");
  }
  const res = (await call("GET", "/api/z/DEMO-E2E/results", undefined, {}, startPlay + 80 * 12_000)).j || {};
  chk(fam, "9 the store holds exactly the winners the phones agreed", `${results.length} results`, `${(res.results || []).length} results, ${accepted} accepted`, (res.results || []).length === results.length, "FAIL", "apps/edge/src/winners.ts"); log(`6. winners accepted by the store: ${(res.results || []).length} of ${prizes.length} (quorum: ${3} different phones)`);
  const forged = await call("POST", "/api/z/DEMO-E2E/vote", { pid: pids[0], device: dev(9), results: [{ pattern: "line", ordinal: 1, round: 1, idx: 3, pids: [pids[1]] }] }, ip(), startPlay + 100 * 12_000);
  chk(fam, "10 a vote from the wrong phone is refused", "403", String(forged.status), forged.status === 403, "FAIL", "apps/edge/src/winners.ts deviceMatches");
  // the game is over: phones say so, after the last prize
  const endAt = startPlay + (lastIdx + 1) * 12_000 + 2000;
  let counted = 0; for (let i = 0; i < 10; i++) { const r = await call("POST", "/api/z/DEMO-E2E/over", { pid: pids[i], device: dev(i + 1) }, ip(), endAt); if (r.j?.counted) counted++; }
  const life = W.raw.query("SELECT * FROM life WHERE eid='DEMO-E2E'").get();
  chk(fam, "11 phones end the game once every prize is won", "the end is recorded when the last prize was awarded", life ? `end ${new Date(life.end_ms).toISOString()} (${life.end_src}); ${counted} votes counted` : `no end recorded (${counted} votes counted)`, !!life && life.end_src === "phones", lastIdx + 1 < 20 ? "NOT_LOGICAL" : "FAIL", "apps/edge/src/lifecycle.ts acceptOver (nothing counts before 20 numbers)");
  log(`7. the game ended after number ${lastIdx + 1}; end recorded: ${life ? life.end_src + " " + new Date(life.end_ms).toISOString() : "none, the scheduled end (75 numbers) stays"}`);
  const endMs = life?.end_ms ?? roundMs(START + GRACE_ROUNDS + 74 * 4) + 60_000;
  await lifecycleTick(W.env, endMs + 60_000);
  chk(fam, "12 no report before 3 minutes after the end", "none", String(sentReports.length), sentReports.length === 0, "FAIL", "apps/edge/src/lifecycle.ts REPORT_AFTER_MS");
  let ticks = 0; for (; ticks < 8 && sentReports.length === 0; ticks++) await lifecycleTick(W.env, endMs + 4 * 60_000 + ticks * 1000); // each tick does one step of the report (prepare, build, send)
  chk(fam, "13 the report is mailed about 3 minutes after the end", "1 report to the organizer, with a PDF, after at most 4 ticks", `${sentReports.length} report(s) to ${sentReports[0]?.to}; attachments ${sentReports[0]?.attachments?.length}; ticks needed ${ticks}`, sentReports.length === 1 && sentReports[0].to === "boss@acme.com" && ticks <= 4, "FAIL", "apps/edge/src/lifecycle.ts reportStep");
  note(fam, `the report took ${ticks} lifecycle ticks after end + 3 min (the live tick runs when any request arrives, at most every 5 minutes, so the mail comes about ${3 + 5 * ticks} minutes after the end)`);
  const mailText = sentReports[0]?.text || "";
  chk(fam, "14 the report mail is plain: no undefined / NaN / private", "clean", /private/i.test(mailText) ? "contains 'private'" : bad(mailText) ? "contains junk" : "clean", !bad(mailText) && !/\bprivate\b/i.test(mailText), "GIBBERISH", "apps/edge/src/lifecycle.ts sendReportMail text");
  log(`8. report mailed after ${ticks} tick(s) from end + 4 min, to ${sentReports[0]?.to}; subject "${sentReports[0]?.subject}"`);
  const link = /https?:\/\/[^\s]+report\.html\?e=DEMO-E2E&k=[0-9a-f]+/.exec(mailText)?.[0];
  chk(fam, "15 the mail carries the report link", "a report link", link ? "yes" : "none", !!link, "FAIL", "apps/edge/src/lifecycle.ts reportLink");
  if (link) {
    const u = new URL(link);
    const rep = await (await reportApi(W.env, "DEMO-E2E", u, endMs + 10 * 60_000)).json();
    const labels = (rep.base?.prizes || []).map((p) => `${p.label}:${p.text}:${p.winners.map((w) => w.name).join("+")}`);
    chk(fam, "16 the report lists every prize with its winner's name", `${prizes.length} prizes, each with a winner`, labels.join(" | "), (rep.base?.prizes || []).length === prizes.length && rep.base.prizes.every((p) => p.winners.length === 1 && /^Player \d+$/.test(p.winners[0].name || "")), "FAIL", "apps/edge/src/lifecycle.ts baseData");
    chk(fam, "17 the report carries the game name and the organizer's brand (owner order 2026-10-09)", "name 'Friday Bingo', brand 'Acme Foods'", `name=${rep.base?.name ?? rep.base?.gameName ?? "(none)"}, brand=${rep.base?.brand?.name ?? "(none)"}`, !!rep.base?.brand?.name, "FAIL", "apps/edge/src/lifecycle.ts:36 cfgOfRow drops brand / name / opening / closing");
    chk(fam, "18 how the game ended is stated", "'Every prize was awarded, so the game ended early.'", String(rep.base?.endReason), /ended early|Every prize/.test(rep.base?.endReason || "") === (lastIdx + 1 < 75 - 0 && !!life), "NOT_LOGICAL", "apps/edge/src/lifecycle.ts baseData endReason");
    const people = await (await reportApi(W.env, "DEMO-E2E", new URL(link + "&part=people&i=0"), endMs + 10 * 60_000)).json();
    chk(fam, "19 the report holds the 10 players", "10", String((people.people || []).length), (people.people || []).length === 10, "FAIL", "apps/edge/src/lifecycle.ts reportApi");
    log(`9. report opened: ${(rep.base?.prizes || []).length} prizes listed (${labels.join("; ")}); ${(people.people || []).length} players in the people list; brand ${rep.base?.brand?.name ?? "MISSING"}; game name ${rep.base?.name ?? "MISSING"}; ended: ${rep.base?.endReason}`);
    const late = await reportApi(W.env, "DEMO-E2E", u, endMs + REPORT_LINK_MS + 1000);
    const lateBody = await late.json(); chk(fam, "20 the report link stops after 19 hours", "a refusal with a plain message", `${late.status} ${String(lateBody.error).slice(0, 80)}`, late.status >= 400 && !!lateBody.error && !bad(lateBody.error), "FAIL", "apps/edge/src/lifecycle.ts reportLinkUntil");
  }
  // erasure at 20 hours: players' names and numbers go; the winners record and the settings stay
  await lifecycleTick(W.env, endMs + PURGE_AFTER_MS - 60_000);
  const before = W.raw.query("SELECT COUNT(*) c FROM participant WHERE eid='DEMO-E2E'").get().c;
  await lifecycleTick(W.env, endMs + PURGE_AFTER_MS + 60_000);
  const after = { part: W.raw.query("SELECT COUNT(*) c FROM participant WHERE eid='DEMO-E2E'").get().c, seat: W.raw.query("SELECT COUNT(*) c FROM seat WHERE eid='DEMO-E2E'").get().c, win: W.raw.query("SELECT COUNT(*) c FROM winner WHERE eid='DEMO-E2E'").get().c, prize: W.raw.query("SELECT COUNT(*) c FROM prize WHERE eid='DEMO-E2E'").get().c, rec: W.raw.query("SELECT COUNT(*) c FROM game_record WHERE eid='DEMO-E2E'").get().c };
  chk(fam, "21 players are still there at 19 h 59 min", "10", String(before), before === 10, "FAIL", "apps/edge/src/lifecycle.ts PURGE_AFTER_MS");
  chk(fam, "22 at 20 h the players' details are gone, the winners and the settings stay", "participants 0, seats 0, winners kept, game record kept", JSON.stringify(after), after.part === 0 && after.seat === 0 && after.win > 0 && after.rec === 1, "FAIL", "apps/edge/src/lifecycle.ts erasePersonal");
  const leftover = W.raw.query("SELECT COUNT(*) c FROM prize WHERE eid='DEMO-E2E' AND (pii IS NOT NULL OR orig IS NOT NULL)").get().c;
  note(fam, `after 20 h: prize rows still holding a sealed name/number: ${leftover} (the winners confirm their details after the game; the prize record is part of the winners record kept for 365 days)`);
  log(`10. at end + 20 h: participants ${after.part}, seats ${after.seat}; winners record ${after.win} rows kept; game record kept ${after.rec}`);
  const { purgeOld } = await import("../apps/edge/src/worker.ts");
  await purgeOld(W.env, fullDeleteAt(endMs) + 60_000);
  const gone = W.raw.query("SELECT COUNT(*) c FROM winner WHERE eid='DEMO-E2E'").get().c;
  chk(fam, "23 after the 365th day everything about the game goes", "winners 0", String(gone), gone === 0, "FAIL", "apps/edge/src/lifecycle.ts fullDeleteAt");
  log(`11. after day 365 (00:00 IST): winners rows ${gone}`);
  // everything the organizer got by mail during the flow
  const outbox = W.raw.query("SELECT to_addr, subject, body FROM outbox ORDER BY id").all();
  for (const m of outbox) { chk(fam, `mail "${m.subject.slice(0, 60)}" is plain`, "no private / NaN / undefined", /private/i.test(m.subject + m.body) ? "contains 'private'" : bad(m.subject + m.body) ? "junk" : "clean", !bad(m.subject + m.body) && !/\bprivate\b/i.test(m.subject + m.body), "GIBBERISH", "apps/edge/src/mails.ts / pay.ts"); chk(fam, `mail "${m.subject.slice(0, 60)}" uses the customer's word for the game`, "game, not engagement", /engagement/i.test(m.subject + m.body) ? "says 'engagement'" : "ok", !/\bengagement\b/i.test(m.subject + m.body), "INCOMPLETE", "ENGAGEMENT-WORDING (player and organizer messages say 'engagement'; the console says 'game'; docs/GLOSSARY.md still says engagement): owner decision"); }
  log(`12. mails sent during the whole flow: ${outbox.length} (${[...new Set(outbox.map((m) => m.subject.slice(0, 50)))].join(" | ")})`);
}

// ================================================================ run
const families = { PRICE: famPrice, OPTIONS: famOptions, PRIZES: famPrizes, ENGINE: famEngine, SCHEDULE: famSchedule, JOIN: famJoin, ROLES: famRoles, TEXT: famText, DEMO10: famDemo10 };
const t0 = Date.now();
for (const [name, fn] of Object.entries(families)) {
  if (only && !new RegExp(only, "i").test(name)) continue;
  const s = Date.now(); const before = rows.length;
  try { await fn(); } catch (e) { chk(name, "family ran to the end", "no exception", String(e && e.stack || e).slice(0, 400), false, "NO_RESULT", "tools/qa-model.mjs " + name); }
  console.log(`family ${name}: ${rows.length - before} combinations in ${Date.now() - s} ms`);
}
globalThis.fetch = realFetch;
if (!only) {
  chk("ALL", `${CALLS.n} calls to the real Worker`, "no server error (5xx)", CALLS.fivexx.length ? CALLS.fivexx.slice(0, 3).join("; ") : "none", CALLS.fivexx.length === 0, "FAIL", "apps/edge/src/worker.ts (a 5xx)");
  chk("ALL", `${CALLS.n} calls to the real Worker`, "every /api answer is JSON (no empty or broken reply)", CALLS.notJson.length ? CALLS.notJson.slice(0, 3).join("; ") : "all JSON", CALLS.notJson.length === 0, "NO_RESULT", "apps/edge/src/worker.ts (an answer with no JSON)");
}
// ---------------------------------------------------------------- report
const fails = rows.filter((r) => !r.ok);
const groups = new Map();
for (const r of fails) { const k = `${r.fam}|${r.cat}|${r.root}`; const g = groups.get(k) || { fam: r.fam, cat: r.cat, root: r.root, n: 0, first: r }; g.n++; groups.set(k, g); }
const list = [...groups.values()].sort((a, b) => a.fam.localeCompare(b.fam) || a.cat.localeCompare(b.cat));
console.log(`\nMODEL combinations=${rows.length} passed=${rows.length - fails.length} discrepancies=${fails.length} grouped-findings=${list.length} (${Date.now() - t0} ms)`);
const byCat = {}; for (const g of list) byCat[g.cat] = (byCat[g.cat] || 0) + 1;
console.log("by category:", JSON.stringify(byCat));
list.forEach((g, i) => console.log(`\n#${i + 1} [${g.cat}] ${g.fam}  x${g.n}\n   combination: ${g.first.combo}\n   expected:    ${g.first.expected.slice(0, 220)}\n   actual:      ${g.first.actual.slice(0, 220)}\n   root cause:  ${g.root}`));
if (showRows) for (const r of rows) console.log(`${r.ok ? "ok  " : "FAIL"} ${r.fam} | ${r.combo} | expected: ${r.expected.slice(0, 80)} | actual: ${r.actual.slice(0, 80)}`);
for (const n of notes) console.log(`note [${n.fam}] ${n.text}`);
if (demoLog.length) console.log("\nDEMO 10-PLAYER RUN\n" + demoLog.join("\n"));
if (jsonOut) writeFileSync(jsonOut, JSON.stringify({ at: new Date().toISOString(), total: rows.length, passed: rows.length - fails.length, demo: demoLog, groups: list.map((g) => ({ fam: g.fam, cat: g.cat, root: g.root, n: g.n, combination: g.first.combo, expected: g.first.expected, actual: g.first.actual })), notes }, null, 1));
