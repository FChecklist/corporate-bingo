// Claim hold (owner order, 1 Nov 2026): while a claim is being checked the game waits for everyone, then goes on for everyone, a moment after the check ends.
// Written like Tambola's claimhold.ts: the hold is plain pause intervals (beacon rounds) published with the control file every phone already polls, so every phone and
// the server work out the same call times. It starts a few rounds after the claim (the same lead a Pause has, so no phone shows a number the hold should have stopped),
// ends when the claim is accepted (a prize settled) or when its check window is over, and never lasts more than 60 seconds. Off unless env.CLAIM_HOLD === "1".
// Bingo difference: winners are decided by the phones' quorum and a wrong claim leaves no record, so a claim that no prize follows is "checked" when its window ends.
import { MAX_HOLD_ROUNDS, readPublished, type PauseInterval } from "../../../packages/beacon/src/control";
import { roundAt } from "../../../packages/beacon/src/index";

export const CHECK_ROUNDS = 5; // 15 s: how long the phones are given to agree on a claim before it counts as checked
export const RESTART_ROUNDS = 1; // the game goes on about 2.4 to 3 s after the check ends
interface Hold { start: number; cap: number; base: number; k: number; tLast: number; end?: number }
interface Rec { iv: Hold[] }
const key = (eid: string) => `chold/${eid}`;
export const claimHoldOn = (env: any) => env?.CLAIM_HOLD === "1";
const kvOf = (env: any) => ({ get: async (k: string) => (await env.DB.prepare("SELECT v FROM kv WHERE k=?").bind(k).first())?.v ?? null, put: async () => {} });

async function load(db: any, eid: string): Promise<Rec> {
  try { const r = await db.prepare("SELECT v FROM kv WHERE k=?").bind(key(eid)).first(); return r ? (JSON.parse(r.v) as Rec) : { iv: [] }; } catch { return { iv: [] }; }
}
const save = (db: any, eid: string, rec: Rec) => db.prepare("INSERT INTO kv(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v").bind(key(eid), JSON.stringify({ iv: rec.iv.slice(-20) })).run();
async function settledCount(db: any, eid: string): Promise<number> {
  return Number((await db.prepare("SELECT COUNT(*) AS c FROM settled WHERE eid=?").bind(eid).first())?.c ?? 0);
}
const asIv = (rec: Rec): PauseInterval[] => rec.iv.map((h) => ({ start: h.start, end: h.end ?? h.cap })).filter((i) => i.end > i.start);

/** A claim was stored: open a hold (or, if one is open, queue this claim behind it). */
export async function startClaimHold(env: any, eid: string, nowMs: number): Promise<boolean> {
  if (!claimHoldOn(env)) return false;
  const f = await readPublished(kvOf(env), eid);
  if (!f) return false; // phones can hear a hold only through the control file
  const rec = await load(env.DB, eid), r = roundAt(nowMs), lead = f.leadRounds || 10, open = rec.iv.find((h) => h.end === undefined);
  if (open) { open.k++; open.tLast = nowMs; open.cap = Math.min(Math.max(open.cap, r + lead + MAX_HOLD_ROUNDS - 1), open.start + MAX_HOLD_ROUNDS); } // queue: the hold waits for every claim, but never more than 60 s in all
  else { const start = r + lead; rec.iv.push({ start, cap: start + MAX_HOLD_ROUNDS, base: await settledCount(env.DB, eid), k: 1, tLast: nowMs }); }
  await save(env.DB, eid, rec);
  return true;
}

/** Closes a hold whose claims are all checked (the game goes on, for everyone, a moment later) or whose 60 seconds are up. Returns the hold intervals now in force. */
export async function claimHolds(env: any, eid: string, nowMs: number): Promise<PauseInterval[]> {
  const rec = await load(env.DB, eid); if (!rec.iv.length) return [];
  const open = rec.iv.find((h) => h.end === undefined);
  if (open) {
    const r = roundAt(nowMs), deadline = Math.min(open.cap, open.start + CHECK_ROUNDS * open.k), accepted = (await settledCount(env.DB, eid)) - open.base >= open.k;
    if (accepted && r >= open.start) { open.end = Math.min(deadline, Math.max(open.start + 1, r + RESTART_ROUNDS)); await save(env.DB, eid, rec); }
    else if (r >= deadline) { open.end = Math.max(open.start + 1, deadline); await save(env.DB, eid, rec); }
  }
  return asIv(rec);
}
/** The holds as last stored (no clock): what the server's own call times use. */
export async function storedHolds(env: any, eid: string): Promise<PauseInterval[]> { return asIv(await load(env.DB, eid)); }
