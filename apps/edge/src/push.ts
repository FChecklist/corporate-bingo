// "Notify me when this game begins": this game's side of the corporate-push service (FChecklist/corporate-push, a small Worker of its own).
// A player taps the button on the game link; the browser's push address is saved BY THAT SERVICE, never by this game (no name, e-mail or phone, and nothing about a person is written here).
// This file does two small things, and only when BOTH settings are present (PUSH_URL, a plain https address; PUSH_ADMIN_KEY, a secret). With either one missing it does nothing at all: no call, no query.
//   1. When the game really starts (lifecycle.ts pushStartPass): ONE "game begins" message to that game's scope, once per game (the flag is engagement.push_sent_ms).
//   2. When the game's data is deleted (lifecycle.ts erasePersonal, which every deletion goes through): a purge of that game's scope, so the saved browser addresses go with the game, within 24 hours.
// The key is sent only as the Authorization header. It is never written to the database, a log line or an error.
import type { D1 } from "./worker";

export interface PushEnv { PUSH_URL?: string; PUSH_ADMIN_KEY?: string; PUBLIC_ORIGIN?: string }

/** The new column (0032_push_sent.sql): when the "game begins" message for this game was started. NULL = not yet. */
export const PUSH_SCHEMA: string[] = [`ALTER TABLE engagement ADD COLUMN push_sent_ms INTEGER`];

/** A "game begins" message is only useful at the start: a game that is older than this is never notified (and a failed first try is repeated only inside this time). */
export const PUSH_WINDOW_MS = 30 * 60_000;
const PAGE_LIMIT = 40, MAX_PAGES = 20; // the service sends to at most 40 browsers per call; 20 calls (800 browsers) per game keeps one tick inside the Worker's limit of outside calls
const GAME_ID = /^[A-Za-z0-9_-]{1,128}$/;
const PUSH_ADDRESS = /^https:\/\/(?:[a-z0-9-]+\.)+[a-z]{2,}(?::\d{1,5})?$/i;

/** The service address and key when BOTH settings are there and the address is a plain https address; otherwise null (dark). */
export function pushTarget(env: PushEnv): { base: string; key: string } | null {
  const base = String(env.PUSH_URL ?? "").trim().replace(/\/+$/, ""), key = String(env.PUSH_ADMIN_KEY ?? "").trim();
  if (!key || !PUSH_ADDRESS.test(base)) return null;
  return { base, key };
}

async function post(t: { base: string; key: string }, path: string, body: unknown): Promise<{ ok: boolean; json: any }> {
  try {
    const r = await fetch(t.base + path, { method: "POST", redirect: "error", headers: { authorization: "Bearer " + t.key, "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(8000) });
    let json: any = null; try { json = await r.json(); } catch { /* no body */ }
    return { ok: r.ok && !!json && json.ok === true, json };
  } catch { return { ok: false, json: null }; }
}

/** The link the message opens: the game's own player page, on this site (PUBLIC_ORIGIN, or the live address). */
export const gameLink = (env: PushEnv, eid: string) => `${String(env.PUBLIC_ORIGIN || "https://bingo.corporatetambola.com").replace(/\/+$/, "")}/z.html?e=${encodeURIComponent(eid)}`;

/**
 * Sends the one "game begins" message of a game: page after page (40 browsers a page) until the service says there is no next page.
 * Returns how far it got: `first` = the first page was accepted (so the message has started to go out and must not be started again), `done` = every page was accepted.
 */
export async function sendGameBegins(env: PushEnv, eid: string): Promise<{ first: boolean; done: boolean; sent: number }> {
  const t = pushTarget(env);
  if (!t || !GAME_ID.test(eid)) return { first: false, done: false, sent: 0 };
  const out = { first: false, done: false, sent: 0 };
  let after = 0;
  for (let page = 0; page < MAX_PAGES; page++) {
    const r = await post(t, "/send", { scope: `game:${eid}`, kind: "game_begins", title: "The game is starting", body: "Tap to join the game now.", url: gameLink(env, eid), limit: PAGE_LIMIT, ...(after ? { after_id: after } : {}) });
    if (!r.ok) return out;
    out.first = true; out.sent += Number(r.json.sent) || 0;
    const next = r.json.next_after_id;
    if (!Number.isInteger(next) || next <= after) { out.done = true; return out; }
    after = next;
  }
  return out; // more than 20 pages of browsers: the rest are not sent (documented in docs/KNOWLEDGE.md)
}

/** Deletes every saved browser address of a game (POST /purge). Best effort: the service itself also ends a game's rows within 24 hours. A no-op without both settings. */
export async function purgeGameScope(env: PushEnv, eid: string): Promise<boolean> {
  const t = pushTarget(env);
  if (!t || !GAME_ID.test(eid)) return false;
  return (await post(t, "/purge", { scope: `game:${eid}` })).ok;
}

/**
 * The pass the lifecycle tick runs: for each paid, live (not test), not cancelled game whose scheduled start has just come (inside PUSH_WINDOW_MS), send the "game begins" message ONCE.
 * The flag is taken first, in one statement that only one caller can win, so two ticks at the same moment can never both send. If the very first page is refused (the service is down),
 * the flag is given back and the next tick tries again, until the window closes. Without both settings: returns 0 and touches nothing, not even the database.
 */
export async function pushStartPass(env: PushEnv & { DB: D1 }, now: number, roundAtMs: (ms: number) => number): Promise<number> {
  if (!pushTarget(env)) return 0;
  const rows = (await env.DB.prepare("SELECT id FROM engagement WHERE pack IS NOT 0 AND is_test = 0 AND cancelled_ms IS NULL AND unplayed_ms IS NULL AND push_sent_ms IS NULL AND start_round <= ? AND start_round > ? ORDER BY start_round LIMIT 10")
    .bind(roundAtMs(now), roundAtMs(now - PUSH_WINDOW_MS)).all<{ id: string }>()).results ?? [];
  let n = 0;
  for (const e of rows) {
    const claimed = await env.DB.prepare("UPDATE engagement SET push_sent_ms=? WHERE id=? AND push_sent_ms IS NULL").bind(now, e.id).run();
    if (claimed.meta?.changes !== 1) continue; // another tick took it
    const r = await sendGameBegins(env, e.id);
    if (!r.first) { await env.DB.prepare("UPDATE engagement SET push_sent_ms=NULL WHERE id=? AND push_sent_ms=?").bind(e.id, now).run(); continue; } // nothing went out: try again at the next tick
    n++;
  }
  return n;
}
