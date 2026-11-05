// First-party sales FUNNEL (boss order 1 Nov 2026): where people get to, from the first look at the site to a finished game.
// Our own Worker and D1 only, no third-party script. An event carries ONLY the fields core's cleanProps lets through (game kind, size, mode, reason): never a name, a mobile number, an e-mail or an IP address.
// The page events (viewed, size_chosen, signup_started, payment_page_opened) arrive from /funnel.js (core makeReporter) at POST /api/f/e, once per visit (the visit id is random, kept in the page's memory only).
// The server events (game_created ... game_completed) are written by recordFun from the code that does the thing; they are keyed by a keyed hash of the game or payment id, so the same game counts once.
// Global Privacy Control and Do Not Track: the page script sends nothing, and the server drops any request that carries Sec-GPC: 1 or DNT: 1.
// FLAG: FUNNEL_ENABLED is false until the owner has audited the numbers. While false nothing is stored, the route answers 204 and the table is not even created.
import { FUNNEL_EVENTS, cleanProps, type FunnelEvent, type FunnelProps } from "../../../vendor/game-core/packages/core/src/funnel";
import { orgIsTest } from "./mode";
import type { D1 } from "./worker";

export let FUNNEL_ENABLED = false;
/** Test hook and the flip point: the shipped value above is the only switch. */
export const setFunnelEnabled = (on: boolean): void => { FUNNEL_ENABLED = on; };

export const FUNNEL_LABELS: Record<FunnelEvent, string> = {
  viewed: "Site viewed", size_chosen: "Size chosen", signup_started: "Sign-up started", game_created: "Game created", game_published: "Game published",
  payment_page_reached: "Payment page reached", payment_page_opened: "Payment page opened", payment_link_copied: "Payment link copied", payment_started: "Payment started",
  payment_succeeded: "Payment succeeded", payment_failed: "Payment failed", game_started: "Game started", game_completed: "Game completed",
};
/** What a visitor's own browser may report. The server steps can never be sent from outside. */
export const CLIENT_EVENTS: readonly FunnelEvent[] = ["viewed", "size_chosen", "signup_started", "payment_page_opened"];
export const SERVER_EVENTS: readonly FunnelEvent[] = FUNNEL_EVENTS.filter((e) => !CLIENT_EVENTS.includes(e));

type FEnv = { DB: D1; DATA_KEY?: string };
let ensured: WeakSet<object> | null = null;
export async function ensureFunnelTable(db: D1): Promise<void> {
  ensured ??= new WeakSet();
  if (ensured.has(db as object)) return;
  await db.prepare("CREATE TABLE IF NOT EXISTS funnel_event(event TEXT NOT NULL, ref TEXT NOT NULL, day TEXT NOT NULL, at_ms INTEGER NOT NULL, src TEXT NOT NULL, game TEXT, size INTEGER, mode TEXT, reason TEXT, PRIMARY KEY(event, ref))").run();
  await db.prepare("CREATE INDEX IF NOT EXISTS funnel_event_at ON funnel_event(at_ms)").run();
  ensured.add(db as object);
}

const dayOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);
/** Opt-out headers: Global Privacy Control and Do Not Track. */
export const optedOut = (req?: Request | null): boolean => !!req && (req.headers.get("sec-gpc") === "1" || req.headers.get("dnt") === "1");
const enc = new TextEncoder();
/** A game or payment id becomes a short keyed hash, so the funnel table never holds the id itself. */
export async function refOf(env: { DATA_KEY?: string }, id: string): Promise<string> {
  const k = await crypto.subtle.importKey("raw", enc.encode("corporate-bingo/funnel/v1|" + (env.DATA_KEY ?? "no-key")), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return Array.from(new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode(id))).slice(0, 8), (b) => b.toString(16).padStart(2, "0")).join("");
}

async function put(db: D1, event: FunnelEvent, ref: string, src: "web" | "srv", now: number, p: FunnelProps): Promise<void> {
  await ensureFunnelTable(db);
  await db.prepare("INSERT OR IGNORE INTO funnel_event(event,ref,day,at_ms,src,game,size,mode,reason) VALUES(?,?,?,?,?,?,?,?,?)")
    .bind(event, ref, dayOf(now), now, src, p.game ?? null, p.size ?? null, p.mode ?? null, p.reason ?? null).run();
}

/**
 * One server step for one game or payment (`id`), counted once. `org` lets a test game be left out. Never throws: counting must never break a game or a payment.
 * `req` is the request that caused the step, when there is one (a webhook or the timer has none).
 */
export async function recordFun(env: FEnv, org: string | null | undefined, event: FunnelEvent, id: string, now: number, props: Record<string, unknown> = {}, req?: Request | null): Promise<void> {
  try {
    if (!FUNNEL_ENABLED || !id || !SERVER_EVENTS.includes(event) || optedOut(req) || (org && (await orgIsTest(env as never, org)))) return;
    await put(env.DB, event, await refOf(env, id), "srv", now, cleanProps({ game: "bingo", ...props }));
  } catch { /* tracking must never break a game or a payment */ }
}

/** POST /api/f/e: one page event from funnel.js. Always answers 204 (the page never waits on it or learns anything from it). */
export async function funnelBeacon(req: Request, env: FEnv, now: number, spend: (n: number) => Promise<boolean>): Promise<Response> {
  const done = new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
  try {
    if (req.method !== "POST" || !FUNNEL_ENABLED || optedOut(req)) return done;
    const text = await req.text();
    if (text.length > 400) return done;
    const b = JSON.parse(text) as Record<string, unknown>;
    const event = b.event as FunnelEvent;
    if (!CLIENT_EVENTS.includes(event) || typeof b.visit !== "string" || !/^[a-z0-9]{12}$/.test(b.visit)) return done;
    if (!(await spend(1))) return done;
    await put(env.DB, event, b.visit, "web", now, cleanProps({ game: "bingo", size: b.size, mode: b.mode }));
  } catch { /* a bad message is simply dropped */ }
  return done;
}

const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null);
/** Monday of the week (UTC), as a date. */
export const weekOf = (day: string) => { const d = new Date(day + "T00:00:00Z"), k = (d.getUTCDay() + 6) % 7; return dayOf(d.getTime() - k * 86_400_000); };
export interface FunRow { event: FunnelEvent; label: string; count: number; ofPrevious: number | null; ofFirst: number | null }
/** Counts to rows in funnel order. payment_failed is a side branch (not a step towards the next one), so it has no "of previous". Pure. */
export function funnelRows(counts: Record<string, number>): FunRow[] {
  const first = counts.viewed ?? 0; let prev: number | null = null;
  return FUNNEL_EVENTS.map((event) => {
    const count = counts[event] ?? 0, side = event === "payment_failed";
    const row: FunRow = { event, label: FUNNEL_LABELS[event], count, ofPrevious: side || prev === null ? null : pct(count, prev), ofFirst: pct(count, first) };
    if (!side) prev = count;
    return row;
  });
}

/** The funnel for events in [from, to): total, per day and per week, and the sizes people chose. */
export async function funnelReport(env: { DB: D1 }, from: number, to: number) {
  await ensureFunnelTable(env.DB);
  const rs = ((await env.DB.prepare("SELECT event, day, COUNT(*) AS n FROM funnel_event WHERE at_ms>=? AND at_ms<? GROUP BY event, day").bind(from, to).all<{ event: string; day: string; n: number }>()).results ?? []);
  const sizes = ((await env.DB.prepare("SELECT size, COUNT(*) AS n FROM funnel_event WHERE at_ms>=? AND at_ms<? AND event='size_chosen' AND size IS NOT NULL GROUP BY size ORDER BY n DESC, size LIMIT 15").bind(from, to).all<{ size: number; n: number }>()).results ?? []);
  const total: Record<string, number> = {}, days = new Map<string, Record<string, number>>(), weeks = new Map<string, Record<string, number>>();
  const bump = (m: Map<string, Record<string, number>>, k: string, e: string, n: number) => { const o = m.get(k) ?? {}; o[e] = (o[e] ?? 0) + n; m.set(k, o); };
  for (const r of rs) { total[r.event] = (total[r.event] ?? 0) + r.n; bump(days, r.day, r.event, r.n); bump(weeks, weekOf(r.day), r.event, r.n); }
  const periods = (m: Map<string, Record<string, number>>) => [...m.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([period, c]) => ({ period, rows: funnelRows(c) }));
  return {
    from, to, flag: FUNNEL_ENABLED ? "on" : "off", total: funnelRows(total), days: periods(days), weeks: periods(weeks), sizes: sizes.map((s) => ({ size: s.size, count: s.n })),
    note: "A step is counted once per visit (page steps) or once per game or payment (server steps). Visitors with Global Privacy Control or Do Not Track are not counted. No name, mobile number or e-mail is kept.",
  };
}
const q = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
/** The same report as CSV: scope (total, day or week), the period, the step, its count and the two percentages. */
export function funnelCsv(r: Awaited<ReturnType<typeof funnelReport>>): string {
  const L = ["scope,period,event,label,count,percent_of_previous,percent_of_first"];
  const add = (scope: string, period: string, rows: FunRow[]) => { for (const x of rows) L.push([scope, period, x.event, q(x.label), x.count, x.ofPrevious ?? "", x.ofFirst ?? ""].join(",")); };
  add("total", "all", r.total); for (const d of r.days) add("day", d.period, d.rows); for (const w of r.weeks) add("week", w.period, w.rows);
  return L.join("\n") + "\n";
}
