# Changelog: Corporate Bingo

Reconstructed on 20 Nov 2026 from git history, tags and the live `/version.json` (https://bingo.corporatetambola.com/version.json). Before this file there was no changelog and no version policy; entries below the live one are approximate (dates from tags and commits). Unknown values are written "unknown", not guessed. From now on follow the standard: marketing-ledger plans/VERSION-AND-KNOWLEDGE-STANDARD-2026-11-20.md section 2.2 (newest first; Added/Changed/Fixed; what, where, PR, two audit PASS ids, rollback id).

## Live now
Version unknown (no version field in /version.json yet); commit `f17d1906d8a7`; built 2026-11-05 17:35 UTC.

## History (newest first)
- Live version: unknown (no version field yet). Live build commit f17d1906d8a7 built 2026-11-05 17:35 UTC: "publish: record 'e-mail owed' in the same all-or-nothing step, send it on the next visit" (runner branch from 5 Nov 2026; for Lucky Draw: draw tail resumable, publish records 'e-mail owed'). Where: apps/edge/src (publish path). Audit ids and rollback id: unknown.
- 2026-11-14: docs/knowledge map (head of the default branch).
- Release tags (date, commit): bingo-private-2026-11-01 2026-11-01 4e0e210; bingo-2026-11-01 2026-11-01 50247a8; bingo-cache-2026-10-31 2026-10-31 122ed27; bingo-release-2026-10-31 2026-10-31 a0335de.
- 2026-10-31 and 2026-11-01 releases: first live releases, funnel statistics, cache rule, private-site headers. Details: `git log` and docs/DEPLOYS.md.
