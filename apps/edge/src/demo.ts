// FREE DEMO GAME (boss order 1 Nov 2026): a real game, same rules and engine, for up to 10 people, Rs 0, clearly labelled "Demo" on every screen.
// It never uses a bought pack and never creates a payment or ledger row. The guests' data is erased like any game's, within 24 hours of the end.
// Abuse limit: at most DEMO_PER_DAY demo games per organizer account and per IP address, per day (IST). The IP is only ever kept as a keyed hash, for that day.
// FLAG: DEMO_GAME is false until the owner has audited it. While false the create route refuses a demo and nothing else changes.
import { DEMO_CAP } from "../../../packages/beacon/src/config";
import type { D1 } from "./worker";

export let DEMO_GAME = false;
/** Test hook and the flip point: the shipped value above is the only switch. */
export const setDemoGame = (on: boolean): void => { DEMO_GAME = on; };
export const DEMO_PER_DAY = 3;
export { DEMO_CAP };
export const DEMO_LABEL = "Demo";
const IST = 5.5 * 3_600_000;
export const demoDay = (now: number): string => new Date(now + IST).toISOString().slice(0, 10);

/** The name every screen shows: "Demo: <name>" (or just "Demo game"). Idempotent. */
export function demoName(name: string | undefined | null): string {
  const n = (name ?? "").trim();
  if (/^demo\b/i.test(n)) return n.slice(0, 60);
  return (n ? `${DEMO_LABEL}: ${n}` : `${DEMO_LABEL} game`).slice(0, 60);
}

const enc = new TextEncoder();
async function keyed(secret: string | undefined, text: string): Promise<string> {
  const k = await crypto.subtle.importKey("raw", enc.encode("corporate-bingo/demo/v1|" + (secret ?? "no-key")), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return Array.from(new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode(text))).slice(0, 10), (b) => b.toString(16).padStart(2, "0")).join("");
}
/** The kv key for a demo marker of one game. */
export const demoKey = (eid: string): string => `demo/${eid}`;
export async function isDemo(db: D1, eid: string): Promise<boolean> {
  return !!(await db.prepare("SELECT 1 AS x FROM kv WHERE k=?").bind(demoKey(eid)).first());
}
async function take(db: D1, k: string): Promise<boolean> {
  // one atomic step: a new day-key starts at 1; an existing one counts up only while it is below the limit
  const r: any = await db.prepare("INSERT INTO kv(k,v) VALUES(?,'1') ON CONFLICT(k) DO UPDATE SET v=CAST(CAST(v AS INTEGER)+1 AS TEXT) WHERE CAST(v AS INTEGER) < ?").bind(k, DEMO_PER_DAY).run();
  return (r?.meta?.changes ?? 0) > 0;
}
/** Takes one of today's demo places for this organizer account and this IP. false = a limit is used up (nothing is taken from the other one). */
export async function takeDemoPlace(env: { DB: D1; DATA_KEY?: string }, org: string, req: Request, now: number): Promise<boolean> {
  const day = demoDay(now), ip = req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for") ?? "no-ip";
  const ko = `dlim/${day}/org/${await keyed(env.DATA_KEY, "org|" + org)}`, ki = `dlim/${day}/ip/${await keyed(env.DATA_KEY, "ip|" + ip)}`;
  if (!(await take(env.DB, ko))) return false;
  if (!(await take(env.DB, ki))) { await env.DB.prepare("UPDATE kv SET v=CAST(CAST(v AS INTEGER)-1 AS TEXT) WHERE k=?").bind(ko).run(); return false; }
  return true;
}
export const DEMO_LIMIT_MSG = `A free demo is limited to ${DEMO_PER_DAY} a day for each organizer and each internet connection. Please try again tomorrow, or buy a game.`;
export const DEMO_OFF_MSG = "The free demo game is not switched on yet.";
export const DEMO_CAP_MSG = `A demo game is for up to ${DEMO_CAP} people.`;
