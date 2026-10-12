# Corporate Bingo

75-ball Bingo for company events and teams. A separate product, built as a one-time copy of another game's source and then renamed and rebuilt. Nothing here imports from, links to or shares anything with that other product.

Everything is local. Nothing is deployed, no cloud resource exists, no secret is set, no real payment is taken.

- Game rules and code map: `docs/BINGO_GAME.md`
- Running it on this laptop: `docs/RUNNING.md`
- The specification this was built from (history note, mentions the origin product): `docs/history/BINGO_SPEC_origin.md`
- Cloudflare config for a NEW project `corporate-bingo` and D1 database `corporate-bingo`: `pages/wrangler.toml`, `apps/edge/wrangler.toml` (database ids are `REPLACE_ME`)

Layout: `packages/shared` (card, patterns, pricing), `packages/beacon` (calls, engine, phone runtime), `packages/billing`, `apps/edge` (Worker API), `apps/web/public` (all pages), `apps/cron`, `pages/` (Pages build and functions), `tools/sim2` (simulation harness).
