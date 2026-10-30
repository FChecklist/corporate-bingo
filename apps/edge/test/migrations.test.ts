import { expect, test } from "bun:test";
import { readdirSync } from "node:fs";
import { Database } from "bun:sqlite";
import { SCHEMA } from "../src/worker";
import { REHEARSAL_SCHEMA } from "../src/rehearsal";

// The SQL files wrangler applies must say exactly what the code expects, so a schema change cannot be forgotten at deploy time.
const FILES = ["0001_init.sql", "0002_seat.sql", "0003_seat_join_round.sql", "0004_privacy.sql", "0005_winners.sql", "0006_link_expiry.sql", "0007_login_link.sql", "0008_terms.sql", "0009_partner_hashes.sql", "0010_audit.sql", "0011_participant_shred.sql", "0012_visits.sql", "0013_test_live_mode.sql", "0014_roles.sql", "0015_cancel_refund.sql", "0016_people.sql", "0017_brand_paylink_google.sql", "0018_credit_retention_clone.sql", "0019_legal_party.sql", "0020_payment_ledger.sql", "0021_consent.sql", "0022_ledger_c.sql", "0023_data_request.sql", "0024_admin.sql", "0025_helpdesk.sql", "0026_partner_key.sql", "0028_game_record.sql", "0029_game_log.sql"];
test("the migration files (0001 to 0029) match SCHEMA in the Worker", async () => {
  const sql = (await Promise.all(FILES.map((f) => Bun.file(new URL("../migrations/" + f, import.meta.url)).text()))).join("\n");
  const norm = (s: string) => s.split("\n").filter((l) => !l.trim().startsWith("--")).join(" ").replace(/\s+/g, " ").trim();
  expect(norm(sql)).toBe(norm(SCHEMA.map((s) => s + ";").join("\n")));
});

// 1.4.1: migration 0030 (rehearsals) and the runtime safety net in rehearsal.ts (ensureRehearsalColumns) must say the same thing and must not collide (docs/TEST_HANDOFF.md item 7).
const SQL = (f: string) => Bun.file(new URL("../migrations/" + f, import.meta.url)).text();
const stmts = (sql: string) => sql.split("\n").filter((l) => !l.trim().startsWith("--")).join(" ").split(";").map((x) => x.replace(/\s+/g, " ").trim()).filter(Boolean);
const engagementCols = (r: Database) => (r.query("SELECT name, type FROM pragma_table_info('engagement')").all() as { name: string; type: string }[]);
test("every file in migrations/ is listed above (none is forgotten) and 0030 is the last one", () => {
  const onDisk = readdirSync(new URL("../migrations/", import.meta.url)).filter((f) => f.endsWith(".sql")).sort();
  expect(onDisk).toEqual([...FILES].sort()); expect(FILES[FILES.length - 1]).toBe("0030_rehearsal.sql"); expect(onDisk[onDisk.length - 1]).toBe("0030_rehearsal.sql");
});
test("0030_rehearsal.sql: exactly the three columns and the index, nothing else, equal to REHEARSAL_SCHEMA in rehearsal.ts", async () => {
  const s = stmts(await SQL("0030_rehearsal.sql"));
  expect(s).toEqual(["ALTER TABLE engagement ADD COLUMN rehearsal_of TEXT", "ALTER TABLE engagement ADD COLUMN run_no INTEGER", "ALTER TABLE engagement ADD COLUMN rehearsal_closed_ms INTEGER", "CREATE INDEX IF NOT EXISTS engagement_rehearsal ON engagement(rehearsal_of)"]);
  expect(REHEARSAL_SCHEMA).toEqual(s);
  expect(SCHEMA.filter((x) => REHEARSAL_SCHEMA.includes(x))).toEqual(REHEARSAL_SCHEMA); // and the Worker's SCHEMA carries them, in the same order
});
test("applying the files 0001 to 0030 in order to an empty database gives the same engagement table as SCHEMA", async () => {
  const viaFiles = new Database(":memory:"); for (const f of FILES) viaFiles.exec(await SQL(f));
  const viaSchema = new Database(":memory:"); for (const s of SCHEMA) viaSchema.run(s);
  expect(engagementCols(viaFiles)).toEqual(engagementCols(viaSchema));
  expect(engagementCols(viaFiles).map((c) => c.name)).toEqual(expect.arrayContaining(["rehearsal_of", "run_no", "rehearsal_closed_ms"]));
  const tbl = (r: Database) => (r.query("SELECT name FROM sqlite_master WHERE type IN ('table','index') AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as { name: string }[]).map((x) => x.name);
  expect(tbl(viaFiles)).toEqual(tbl(viaSchema));
  // 0030 is the migration that adds them: without it they are absent
  const without = new Database(":memory:"); for (const f of FILES.slice(0, -1)) without.exec(await SQL(f));
  expect(engagementCols(without).map((c) => c.name)).not.toContain("rehearsal_of");
});
