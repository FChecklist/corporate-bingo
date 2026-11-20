// The console's "paid" notice (owner order 20 Nov 2026): home -> console -> Moneypenny -> IT Services -> Razorpay. An organizer pays in the console only.
// The console tells this game, with a SIGNED assertion (act "paid", 60 seconds, one use), that a Moneypenny order for ONE game is paid. The game marks itself PAID once per order id
// and only then can the game start (an unpaid game stays locked at its start time: worker.ts `locked`). The signed-notice machinery is the bridge copied byte for byte from the
// console repo (console-bridge/, contract v1, docs/PAY_STEP.md). This file is the game's side of it: the adapter's `markPaid`, and the old pay screens behind a flag.
//   * DARK: without CONSOLE_PUBKEYS the route does not exist (the normal 404). Only /api/console/paid is open here; the rest of the bridge (session, games, hand-off) is not built into this game yet.
//   * PAY_VIA_CONSOLE = "1": the old pay pages and routes answer with a redirect to the console (pages) or a plain refusal (API). Nothing is deleted: the code and the data stay behind the flag.
//     Razorpay's own notice to this game (/api/payments/webhook) is never redirected: money that was already paid must still be recorded.
import { handleConsole, legacyPayRedirect, type Adapter, type KeyAuth } from "./console-bridge/bridge";
import type { D1 as BridgeD1 } from "./console-bridge/d1";
import { GRACE_ROUNDS } from "../../../packages/beacon/src/config";
import { packFor } from "./paylink";
import { LATE_PAY_LEAD_ROUNDS } from "./pay";
import type { Env } from "./worker";

export interface ConsoleEnv extends Env { CONSOLE_PUBKEYS?: string; PAY_VIA_CONSOLE?: string; LOGIN_VIA_CONSOLE?: string; CONSOLE_ORIGIN?: string; HOME_ORIGIN?: string; PUBLIC_ORIGIN?: string }
export const CONSOLE_ORIGIN_DEFAULT = "https://console.corporatetambola.com";
export const HOME_ORIGIN_DEFAULT = "https://home.corporatetambola.com";
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
  if (Number(e.pack) > 0) throw refuse(MARK_PAID_WORDS.already);
  const pack = packFor(Number(e.cap));
  if (!pack || String(pack) !== o.item) throw refuse(MARK_PAID_WORDS.wrongSize);
  const up = await db.prepare("UPDATE engagement SET pack=? WHERE id=? AND org=? AND pack=0 AND cancelled_ms IS NULL AND unplayed_ms IS NULL").bind(pack, o.eid, e.org).run();
  if ((up.meta?.changes ?? 0) === 0) throw refuse(MARK_PAID_WORDS.already); // another call won the race: nothing was changed by this one
  await db.prepare("INSERT OR IGNORE INTO entitlement(id,org,pack,payment_id,eid,created_ms) VALUES(?,?,?,?,?,?)").bind("ent_console_" + o.orderRef, e.org, pack, "console:" + o.orderRef, o.eid, o.nowMs).run();
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
    game: "bingo", gameName: "Corporate Bingo", gameVersion: "1.4.0",
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
  return handleConsole(consoleAdapter(now), req, env);
}

/** The old pay routes of THIS game, besides the ones the bridge already knows (its LEGACY_PAY_ROUTES). Razorpay's webhook is NOT here on purpose. */
export const BINGO_PAY_ROUTES: RegExp[] = [/^\/api\/(checkout|proforma)$/, /^\/api\/payments\/(test|paytest|verify)(\/|$)/, /^\/api\/paylink\//, /^\/api\/z\/[^/]+\/(paylink|credit|apply-credit)(\/|$)/];

/** With PAY_VIA_CONSOLE=1 a request for an old pay page or route is turned away. A page gets the bridge's redirect to the console; a program gets a short refusal it can show. Null = not a pay route (or the flag is off). */
export function legacyPayGate(req: Request, env: ConsoleEnv): Response | null {
  const r = legacyPayRedirect(req, { flag: env.PAY_VIA_CONSOLE, consoleOrigin: consoleOrigin(env), extra: BINGO_PAY_ROUTES });
  if (!r) return null;
  if (!new URL(req.url).pathname.startsWith("/api/")) return r;
  return new Response(JSON.stringify({ error: "Payment is made in your console now. Please open your console and press Pay.", code: "pay-in-console", console: consoleOrigin(env) + "/" }), { status: 409, headers: { "content-type": "application/json", "cache-control": "no-store" } });
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
