// The console's "paid" notice (owner order 20 Nov 2026): home -> console -> Moneypenny -> IT Services -> Razorpay. An organizer pays in the console only.
// The console tells this game, with a SIGNED assertion (act "paid", 60 seconds, one use), that a Moneypenny order for ONE game is paid. The game marks itself PAID once per order id
// and only then can the game start (an unpaid game stays locked at its start time: worker.ts `locked`). The signed-notice machinery is the bridge copied byte for byte from the
// console repo (console-bridge/, contract v1, docs/PAY_STEP.md). This file is the game's side of it: the adapter's `markPaid`, and the old pay screens behind a flag.
//   * DARK: without CONSOLE_PUBKEYS the route does not exist (the normal 404). Only /api/console/paid is open here; the rest of the bridge (session, games, hand-off) is not built into this game yet.
//   * PAY_VIA_CONSOLE = "1": the old pay pages and routes answer with a redirect to the console (pages) or a plain refusal (API). Nothing is deleted: the code and the data stay behind the flag.
//     Razorpay's own notice to this game (/api/payments/webhook) is never redirected: money that was already paid must still be recorded.
import { handleConsole, legacyPayRedirect, type Adapter, type KeyAuth } from "./console-bridge/bridge";
import { parseKeyList, verifyAssertion } from "./console-bridge/assertion";
import { ensureBridgeSchema } from "./console-bridge/schema";
import type { D1 as BridgeD1 } from "./console-bridge/d1";
import { GRACE_ROUNDS } from "../../../packages/beacon/src/config";
import { packFor } from "./paylink";
import { ipGroup } from "./ipkey";
import { LATE_PAY_LEAD_ROUNDS } from "./pay";
import type { Env } from "./worker";

export interface ConsoleEnv extends Env { LEGACY_OPEN_GAMES?: string; CONSOLE_PUBKEYS?: string; PAY_VIA_CONSOLE?: string; LOGIN_VIA_CONSOLE?: string; CONSOLE_ORIGIN?: string; HOME_ORIGIN?: string; PUBLIC_ORIGIN?: string }
export const CONSOLE_ORIGIN_DEFAULT = "https://console.corporatetambola.com";
export const HOME_ORIGIN_DEFAULT = "https://home.corporatetambola.com";
/** Owner rule (20 Nov 2026, audit 22 Nov 2026): every game is for the people on its list, by ID. The server itself refuses "anyone with the link" and makes a game that says nothing a game for its list.
 *  LEGACY_OPEN_GAMES="1" brings the old open behaviour back (it exists for old tests and old callers; it is never set on the live site). */
export const openGamesAllowed = (env: { LEGACY_OPEN_GAMES?: string }) => env.LEGACY_OPEN_GAMES === "1";
export const LIST_ONLY_MSG = "This game is for the people on your list. Each person types their ID, and you say yes or no to anyone who is not on it. Please choose \"list\".";
export const consoleOrigin = (env: { CONSOLE_ORIGIN?: string }) => (env.CONSOLE_ORIGIN || CONSOLE_ORIGIN_DEFAULT).replace(/\/$/, "");
export const homeOrigin = (env: { HOME_ORIGIN?: string }) => (env.HOME_ORIGIN || HOME_ORIGIN_DEFAULT).replace(/\/$/, "");

const refuse = (m: string) => Object.assign(new Error(m), { definite: true });
const notOpen = () => { throw new Error("This part of the console link is not open in this game yet."); };

/** The words the organizer may see when the game cannot take a payment. Soft, no blame, no jargon. */
export const MARK_PAID_WORDS = {
  notYours: "This game does not belong to the person who paid.",
  wrongSize: "The size that was paid for is not the size of this game.",
  closed: "This game was cancelled or did not start, so it cannot take a payment.",
  already: "This game is already paid.",
  unknown: "This game could not be found.",
};

/**
 * Marks ONE game paid because the console says a Moneypenny order for it is paid. The bridge has already checked the signature, the audience (this game), the purpose ("paid"), the
 * age and that the notice was never used before, and it keeps one row per order id, so this runs once per order. Here the game decides from its OWN tables: it exists, it belongs to the
 * account of the person who paid (`sub` is the hash of their e-mail), it is not cancelled, the size paid for is the size of the game, and it is not paid yet. A refusal is `definite`
 * (nothing was changed). The same effects as a payment made here, minus the invoice: the console side (Moneypenny, IT Services) keeps the money record and the invoice.
 */
export async function consoleMarkPaid(env: Env, o: { eid: string; sub: string; item: string; orderRef: string; nowMs: number }): Promise<void> {
  const db = env.DB;
  const e = await db.prepare("SELECT id, org, cap, pack, start_round, cancelled_ms, unplayed_ms FROM engagement WHERE id=?").bind(o.eid).first<any>();
  if (!e) throw refuse(MARK_PAID_WORDS.unknown);
  const who = await db.prepare("SELECT org FROM organizer_email WHERE email_hash=?").bind(o.sub).first<{ org: string }>();
  if (!who || !e.org || who.org !== e.org) throw refuse(MARK_PAID_WORDS.notYours);
  if (e.cancelled_ms || e.unplayed_ms) throw refuse(MARK_PAID_WORDS.closed);
  const pack = packFor(Number(e.cap)), entId = "ent_console_" + o.orderRef;
  // A retry of an order that failed half way (a one-off database error): THIS order's entitlement is written FIRST, so its presence says "this order started the job" and the retry finishes the
  // missing steps instead of answering "already paid". Every step below is safe to repeat.
  const mine = await db.prepare("SELECT id FROM entitlement WHERE id=? AND eid=?").bind(entId, o.eid).first<{ id: string }>();
  if (!mine && Number(e.pack) > 0) throw refuse(MARK_PAID_WORDS.already);
  if (Number(e.pack) === 0 && (!pack || String(pack) !== o.item)) throw refuse(MARK_PAID_WORDS.wrongSize);
  const finalPack = Number(e.pack) > 0 ? Number(e.pack) : pack!;
  await db.prepare("INSERT OR IGNORE INTO entitlement(id,org,pack,payment_id,eid,created_ms) VALUES(?,?,?,?,?,?)").bind(entId, e.org, finalPack, "console:" + o.orderRef, o.eid, o.nowMs).run();
  if (Number(e.pack) === 0) {
    const up = await db.prepare("UPDATE engagement SET pack=? WHERE id=? AND org=? AND pack=0 AND cancelled_ms IS NULL AND unplayed_ms IS NULL").bind(pack, o.eid, e.org).run();
    if ((up.meta?.changes ?? 0) === 0) { if (!mine) await db.prepare("DELETE FROM entitlement WHERE id=?").bind(entId).run(); throw refuse(MARK_PAID_WORDS.already); } // another call won the race: nothing stays from this one
  }
  await db.prepare("INSERT OR IGNORE INTO kv(k,v) VALUES(?,?)").bind(`pub/${o.eid}`, String(o.nowMs)).run(); // paying also publishes, as a payment made here does
  await db.prepare("INSERT OR IGNORE INTO kv(k,v) VALUES(?,?)").bind(`paidby/${o.eid}`, JSON.stringify({ by: "organizer", ms: o.nowMs, via: "console" })).run();
  if ((1692803367 + (Number(e.start_round) - 1) * 3) * 1000 <= o.nowMs) { // it was held because it was not paid at its start time: the first number now comes 2 minutes after the payment was confirmed
    const restart = Math.floor((o.nowMs / 1000 - 1692803367) / 3) + 2 + LATE_PAY_LEAD_ROUNDS - GRACE_ROUNDS; // the same rule as pay.ts
    await db.prepare("UPDATE engagement SET start_round=? WHERE id=?").bind(restart, o.eid).run();
  }
}

/** The adapter the bridge needs. Only `markPaid` is used (the route is /api/console/paid alone); every other method refuses, so nothing else of the bridge can be reached by mistake. */
export function consoleAdapter(now: number): Adapter<ConsoleEnv> {
  return {
    game: "bingo", gameName: "Corporate Bingo", gameVersion: "1.5.1",
    nowMs: () => now,
    origin: (env) => (env.PUBLIC_ORIGIN || "").replace(/\/$/, ""),
    pubkeys: (env) => env.CONSOLE_PUBKEYS,
    db: (env) => env.DB as unknown as BridgeD1,
    organizerOf: async (env, h) => { const r = await env.DB.prepare("SELECT org FROM organizer_email WHERE email_hash=?").bind(h).first<{ org: string }>(); return r ? { org: r.org } : null; },
    createOrganizer: async () => notOpen(),
    mintKey: async () => notOpen(),
    revokeKeys: async () => notOpen(),
    authOfKey: async (): Promise<KeyAuth | null> => null,
    engagement: async (env, eid) => { const r = await env.DB.prepare("SELECT org, config, cancelled_ms, unplayed_ms FROM engagement WHERE id=?").bind(eid).first<any>(); if (!r) return null; let name = eid; try { name = JSON.parse(r.config || "{}").name || eid; } catch { /* keep the id */ } return { org: r.org, name, ended: !!(r.cancelled_ms || r.unplayed_ms) }; },
    listGames: async () => notOpen(),
    billing: async () => notOpen(),
    invitedCards: async () => notOpen(),
    purgePerson: async () => notOpen(),
    live: async () => notOpen(),
    capabilities: async () => notOpen(),
    sendRoleInvite: async () => notOpen(),
    seal: async () => notOpen(),
    unseal: async () => notOpen(),
    markPaid: (env, o) => consoleMarkPaid(env, o),
  };
}

/** Only the paid notice (and its browser pre-flight) is handed to the bridge. Anything else under /api/console/ is none of this game's business yet: null = the normal 404. */
export async function consolePaidRoute(req: Request, env: ConsoleEnv, now: number): Promise<Response | null> {
  const path = new URL(req.url).pathname.replace(/\/+$/, "");
  if (path !== "/api/console/paid") return null;
  if (req.method !== "POST" && req.method !== "OPTIONS") return null;
  if (env.CONSOLE_PUBKEYS && !env.PUBLIC_ORIGIN) return new Response(JSON.stringify({ ok: false, code: "not_set_up", error: "This game's public address (PUBLIC_ORIGIN) is not set, so it cannot take the console's paid notice yet." }), { status: 503, headers: { "content-type": "application/json", "cache-control": "no-store" } }); // fails closed AND says why (an empty address would refuse every real notice as "wrong game")
  if (req.method === "POST" && env.CONSOLE_PUBKEYS) await releaseStaleMarking(req.clone(), env, now); // never for a dark route: an unsigned request cannot cause a database write there
  return handleConsole(consoleAdapter(now), req, env);
}

/**
 * payInfo (audit 22 Nov 2026, finding 2): "what must be paid for this game, and can it be paid at all?", asked BEFORE the console takes any money, so a wrong size is found out before payment and not after.
 * The console's pay-step contract (corporate-console docs/PAY_STEP.md, bridge v1) has no such call, so this is THIS GAME's own read-only answer, built so the console can adopt it:
 *   POST /api/console/payinfo  { assertion, eid }  ->  { ok, eid, name, startMs, cap, paid, payable, item, reason }
 * `assertion` is a signed console assertion for this game's address (the same checks as the paid notice: signature, audience, 60 seconds, one use). The bridge's closed list of purposes has no "payinfo",
 * so the purpose "games" is used (it is the read-only "show this person's games" purpose); the bridge file is not edited here. `item` is the pack size the console must charge for (the same string
 * `markPaid` later checks); no price is given: every number of money is Moneypenny's. Only the owner of the game gets an answer; anybody else gets the same "not found" as for a game that is not there.
 * Dark without CONSOLE_PUBKEYS (the normal 404), like the paid notice. It changes nothing in the game.
 */
export async function consolePayInfoRoute(req: Request, env: ConsoleEnv, now: number): Promise<Response | null> {
  if (new URL(req.url).pathname.replace(/\/+$/, "") !== "/api/console/payinfo") return null;
  if (req.method !== "POST" && req.method !== "OPTIONS") return null;
  const keys = parseKeyList(env.CONSOLE_PUBKEYS);
  if (!keys.length) return null; // dark
  const H = { "content-type": "application/json", "cache-control": "no-store", "access-control-allow-origin": "*", "access-control-allow-headers": "content-type", "access-control-allow-methods": "POST, OPTIONS" };
  const out = (status: number, o: Record<string, unknown>) => new Response(JSON.stringify(o), { status, headers: H });
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: H });
  if (!env.PUBLIC_ORIGIN) return out(503, { ok: false, code: "not_set_up", error: "This game's public address (PUBLIC_ORIGIN) is not set, so it cannot answer the console yet." });
  const netKey = ipGroup(req.headers.get("cf-connecting-ip")); // one network is one key (an IPv6 /64 counts as one, see ipkey.ts)
  if (payInfoOver(netKey, now)) return new Response(JSON.stringify({ ok: false, code: "rate_limited", message: "Too many requests that could not be checked. Please wait a minute." }), { status: 429, headers: { ...H, "retry-after": "60" } });
  const body: any = await readJsonLimited(req, PAYINFO_BODY_MAX); // a real request is a few hundred bytes (one assertion and one game id): a big body is refused before it is parsed
  if (body === TOO_BIG) { payInfoMiss(netKey, now); return out(413, { ok: false, code: "too_big", message: "The request is too large." }); }
  if (!body || typeof body.assertion !== "string" || typeof body.eid !== "string" || !/^[A-Za-z0-9_-]{3,40}$/.test(body.eid)) { payInfoMiss(netKey, now); return out(400, { ok: false, code: "invalid", message: "The request is not complete." }); }
  const db = env.DB as unknown as BridgeD1; await ensureBridgeSchema(db);
  const nowS = Math.floor(now / 1000), v = await verifyAssertion(body.assertion, { keys, aud: env.PUBLIC_ORIGIN.replace(/\/$/, ""), nowS, act: "games" });
  if (!v.ok) { payInfoMiss(netKey, now); return out(401, { ok: false, code: v.error, message: "This sign-in could not be checked. Please sign in again." }); }
  const used = await db.prepare("INSERT OR IGNORE INTO console_jti(jti, exp_s) VALUES(?,?)").bind(v.payload.jti, v.payload.exp).run();
  if (used.meta.changes !== 1) { payInfoMiss(netKey, now); return out(401, { ok: false, code: "replayed", message: "This sign-in was already used. Please try again." }); }
  const e = await env.DB.prepare("SELECT id, org, cap, pack, start_round, config, cancelled_ms, unplayed_ms FROM engagement WHERE id=?").bind(body.eid).first<any>();
  const who = await env.DB.prepare("SELECT org FROM organizer_email WHERE email_hash=?").bind(v.payload.sub).first<{ org: string }>();
  if (!e || !who || !e.org || who.org !== e.org) return out(404, { ok: false, code: "not_found", message: "That game could not be found." });
  const pack = packFor(Number(e.cap)), paid = Number(e.pack) > 0, closed = !!(e.cancelled_ms || e.unplayed_ms);
  const reason = closed ? "closed" : paid ? "already_paid" : !pack ? "too_big" : null; // too_big: more people than the biggest pack; it needs a custom arrangement, not a console payment
  let name = body.eid; try { name = JSON.parse(e.config || "{}").name || name; } catch { /* keep the id */ }
  return out(200, { ok: true, eid: body.eid, name, startMs: (1692803367 + (Number(e.start_round) - 1) * 3) * 1000, cap: Number(e.cap), paid, payable: reason === null, item: pack ? String(pack) : null, reason });
}

/** payInfo: the biggest body the route reads (bytes). The assertion plus the game id are a few hundred bytes. */
export const PAYINFO_BODY_MAX = 4096;
/** payInfo: how many requests that could not be checked (no valid signature, bad body, a repeat) one network may send in a minute before it is told to wait. */
export const PAYINFO_MISSES_PER_MINUTE = 20;
const TOO_BIG = Symbol("too-big");
/** Reads a JSON object from the request but never more than `max` bytes: it stops reading at the limit instead of loading the whole body. Null = not JSON (or not an object). */
async function readJsonLimited(req: Request, max: number): Promise<any | null | typeof TOO_BIG> {
  if (Number(req.headers.get("content-length") ?? 0) > max) return TOO_BIG;
  let text = "";
  if (req.body) {
    const reader = req.body.getReader(), dec = new TextDecoder(); let got = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      got += value.byteLength;
      if (got > max) { try { await reader.cancel(); } catch { /* already closed */ } return TOO_BIG; }
      text += dec.decode(value, { stream: true });
    }
    text += dec.decode();
  }
  try { const v = JSON.parse(text); return v && typeof v === "object" ? v : null; } catch { return null; }
}
/** A small count per Worker instance (no database write, so a flood of bad calls cannot burn the game's daily write budget): bad requests per network per minute. */
const payInfoMisses = new Map<string, { w: number; n: number }>();
export const resetPayInfoMisses = () => payInfoMisses.clear();
const payInfoOver = (k: string, now: number): boolean => { const r = payInfoMisses.get(k); return !!r && r.w === Math.floor(now / 60_000) && r.n >= PAYINFO_MISSES_PER_MINUTE; };
function payInfoMiss(k: string, now: number): void {
  const w = Math.floor(now / 60_000), r = payInfoMisses.get(k);
  if (payInfoMisses.size > 5000) payInfoMisses.clear();
  if (!r || r.w !== w) payInfoMisses.set(k, { w, n: 1 }); else r.n++;
}

/** How long an order may sit in the bridge's "marking" state before it is treated as stuck. A live call finishes in well under a second. */
export const MARKING_STUCK_MS = 30_000;
/**
 * The bridge (copied, not edited) leaves an order row in "marking" when `markPaid` fails with a one-off error, and then answers every retry of that order id with 409 "in progress", for ever.
 * Here, before the bridge runs, a row that has been "marking" for over 30 seconds is cleared. The retry then goes through the bridge's full checks again (signature, audience, purpose, age, one use)
 * and runs `markPaid` again, which is safe to repeat (see `consoleMarkPaid`). A row that is "paid" is never touched, so once per order id still holds. Nothing here trusts the request: it only
 * removes a stale marker that the bridge would put back.
 */
export async function releaseStaleMarking(req: Request, env: ConsoleEnv, now: number): Promise<void> {
  try {
    const body: any = await req.json();
    const ref = body && typeof body.orderRef === "string" && /^[A-Za-z0-9_-]{4,100}$/.test(body.orderRef) ? body.orderRef : "";
    if (!ref) return;
    await env.DB.prepare("DELETE FROM console_paid WHERE order_ref=? AND state='marking' AND at_ms<?").bind(ref, now - MARKING_STUCK_MS).run();
  } catch { /* not JSON, or the table is not there: the bridge answers as it always did */ }
}

/** The old pay routes of THIS game, besides the ones the bridge already knows (its LEGACY_PAY_ROUTES). Razorpay's webhook is NOT here on purpose. */
export const BINGO_PAY_ROUTES: RegExp[] = [/^\/api\/(checkout|proforma)$/, /^\/api\/payments\/(test|paytest|verify)(\/|$)/, /^\/api\/paylink\//, /^\/api\/z\/[^/]+\/(paylink|credit|apply-credit)(\/|$)/];

/** With PAY_VIA_CONSOLE=1 a request for an old pay page or route is turned away. A page gets the bridge's redirect to the console; a program gets a short refusal it can show. Null = not a pay route (or the flag is off). */
export function legacyPayGate(req: Request, env: ConsoleEnv): Response | null {
  const r = legacyPayRedirect(req, { flag: env.PAY_VIA_CONSOLE, consoleOrigin: consoleOrigin(env), extra: BINGO_PAY_ROUTES });
  if (!r) return null;
  const u = new URL(req.url), e = u.searchParams.get("e") || (u.pathname.match(/^\/api\/z\/([^/]+)\//) || [])[1] || "";
  const to = consoleOrigin(env) + "/" + (/^[A-Za-z0-9_-]{1,64}$/.test(e) ? "?game=bingo&eid=" + encodeURIComponent(e) : ""); // a page sends the person to THEIR game's payment in the console, not to the console's front door
  if (!u.pathname.startsWith("/api/")) return new Response(null, { status: 302, headers: { location: to, "cache-control": "no-store" } });
  return new Response(JSON.stringify({ error: "Payment is made in your console now. Please open your console and press Pay.", code: "pay-in-console", console: to }), { status: 409, headers: { "content-type": "application/json", "cache-control": "no-store" } });
}

/** The pages (and routes) where this game used to have its own sign-in. With LOGIN_VIA_CONSOLE=1 they send the person to the one sign-in (home) and the console. */
export const LOGIN_PAGES = /^\/signin(\.html)?$/;
export const LOGIN_API = /^\/api\/(start|auth\/(email|verify|google|link))$/;
export function loginGate(req: Request, env: ConsoleEnv): Response | null {
  if (env.LOGIN_VIA_CONSOLE !== "1") return null;
  const path = new URL(req.url).pathname.replace(/\/+$/, "") || "/";
  if (LOGIN_PAGES.test(path)) return new Response(null, { status: 302, headers: { location: homeOrigin(env) + "/", "cache-control": "no-store" } });
  if (LOGIN_API.test(path)) return new Response(JSON.stringify({ error: "Please sign in at home.corporatetambola.com. Your console is at console.corporatetambola.com.", code: "login-at-home", home: homeOrigin(env) + "/", console: consoleOrigin(env) + "/" }), { status: 409, headers: { "content-type": "application/json", "cache-control": "no-store" } });
  return null;
}
