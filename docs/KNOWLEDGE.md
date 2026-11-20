# Knowledge: Corporate Bingo (corporate-bingo)

Written 20 Nov 2026 for a future AI session that has never seen this repo (standard: marketing-ledger plans/VERSION-AND-KNOWLEDGE-STANDARD-2026-11-20.md). It describes the CURRENT state only, from the code and existing docs. Anything not found is marked "unknown". Do not publish this file on the website.

## 1. What this is
75-ball Bingo for company events. A separate product copied from the Tambola source, then rebuilt (docs/BINGO_GAME.md).
- Live site: https://bingo.corporatetambola.com (Cloudflare Pages project `corporate-bingo`). Live version now (from `/version.json`, read 20 Nov 2026): **unknown (no version field in /version.json yet)**, commit `f17d1906d8a7`, built 2026-11-05 17:35 UTC.
- Other repos and what they are for: `KNOWLEDGE-MAP.md` in the repo root.

## 2. How it connects
Players and organizers reach the suite like this: home.corporatetambola.com (login gate) -> console.corporatetambola.com (set up, invite, pay) -> moneypenny.corporatetambola.com (credits; the single payment gate) -> IT Services by Rajat Agarwal -> Razorpay. Each game is its own website and takes settings from the console by API; a game calls ONLY Moneypenny for payment, never IT Services or Razorpay. The console-to-game contract is `docs/CONTRACT_V1.md` and `contract/` in corporate-console; the pay contract is `GAME_PAY_CONTRACT.md` (in the console pay-step branch: unknown on the default branch). Moneypenny chat: moneypennychat.corporatetambola.com.

## 3. Map of folders and the files that matter
apps/edge (pay.ts, paylink.ts, people.ts, pii.ts, lifecycle.ts, ledger.ts, report-layout.ts, ai-*.ts, migrations up to 0028_game_record.sql), apps/web/public, apps/cron, packages/beacon, packages/billing, packages/shared, pages/ (build.mjs, version.mjs, wrangler.toml), tools/ (control-worker, sim2, make-*), docs/ (README, BINGO_GAME, DEPLOYS, GATES, PRIVACY_AND_LIFECYCLE, RETENTION, ZERO_SERVER_DESIGN, ROLES_AND_CONSOLE_SPEC 1..6).

Files that matter: apps/edge/src/pay.ts; apps/edge/src/people.ts; apps/edge/src/lifecycle.ts; apps/edge/src/releases.json; pages/version.mjs; docs/BINGO_GAME.md; docs/DEPLOYS.md; docs/PRIVACY_AND_LIFECYCLE.md.

## 4. Rules in force
- Suite rules version 1.1 (20 Nov 2026): `docs/SUITE_RULES.md` (on branch docs/suite-rules-v1-1-2026-11-20 until merged); source in the ledger `plans/SUITE-RULES-VERSION-2026-11-20.md`.
- One login (home), one console, one credit/payment system (Moneypenny), one chatbot system; no game or console has its own login, payment or chat; pay only via Moneypenny.
- Invite by ID only: one alphanumeric ID field, no names or personal details; strip every non-alphanumeric and uppercase before matching; not-on-list people need organizer/host approval; optional family invites (default 4) with approval.
- Console voice = "you", polite, simple English; privacy line "designed to follow US privacy laws, EU GDPR and India's DPDP"; all participant information including IDs deleted within 24 hours after the game; billing line only "We keep billing data for audit and tax reasons."
- Fairness wording: "No one knows the next number: not the organizer, not the host, not even the software." Prices with the rupee sign. Prizes: "You (the company) give the prizes directly to the winners."
- Do not claim "100% secure", "most secure gateway", "played by major companies".

## 5. How to run the tests
`bun test packages apps tools/control-worker`; `tsc --noEmit -p tsconfig.json`. Heavy runs under the heavy lock.
RAM on the owner's laptop is tight: no full builds or browsers without the heavy lock (C:/ct/HEAVY_JOB_PROTOCOL.md).

## 6. Deploy and roll back
Cloudflare Pages project corporate-bingo (docs/DEPLOYS.md; deploy script in package.json). Rollback: Cloudflare dashboard (every deployment is kept); id of previous deploy: unknown.
Nothing is deployed from a docs-only change. Cloudflare only, no Vercel. Every deploy needs a version bump and a CHANGELOG entry (standard section 1).

## 7. Known issues and open failures
unknown (no smoke failure map found in this repo). Open PR #9 is another session's work.

## 8. Owner-only steps still open
Secrets and keys are the owner's (names only in config/SECRETS_NAMES.md where present). Deploy, domain, payment live mode and the Rs 1 payment test are the owner's decisions via BOSS. Versioning work still to do in this repo: `docs/VERSIONING-TODO.md`.
