# SEO test handoff (branch `feat/seo-2026-10-30`)

Coder note: no tests were written or run. Static public files only; `apps/edge` and `apps/*/test` are untouched. Existing tests that read these files may now fail on purpose (see "Tests that will need updating").

## Changed or added files
- `apps/web/public/*.html` (all indexable pages): title and description limits, canonical and `og:url` without `.html` (Cloudflare Pages redirects `.html` to the clean path), OG/Twitter image `/img/og-bingo.png` with width, height, type and alt, BreadcrumbList JSON-LD on inner pages, `favicon.ico` link, `site.webmanifest` link, the footer Tambola link points at `https://corporatetambola.com/` instead of a `pages.dev` address.
- `apps/web/public/index.html`: new title, description and H1 (main phrase first), Organization + WebSite + SoftwareApplication + FAQPage JSON-LD (prices unchanged), hero image preload.
- `apps/web/public/virtual-bingo-for-remote-teams.html`: NEW use-case page (H1, demo button, visible FAQ, FAQPage + BreadcrumbList JSON-LD).
- `apps/web/public/404.html`: extra link back; still `noindex`.
- `apps/web/public/robots.txt`: new crawler policy (allow list, block list, utility pages disallowed in both `/x.html` and `/x` form, no `.js`/`.css` block, old "not for AI training" comment removed).
- `apps/web/public/sitemap.xml` and `tools/make-sitemap.mjs`: clean absolute URLs, use-case page added, `lastmod` from git.
- `apps/web/public/llms.txt` (links fixed, use-case and full-text links added, link to the noindex video page removed), `llms-full.txt` (new).
- `apps/web/public/cfe25c19fa5aaf541ae0b611b2169261.txt` (IndexNow key) and `tools/indexnow.mjs`.
- `apps/web/public/.well-known/security.txt`, `site.webmanifest` (copy of `manifest.webmanifest`, which stays for the service worker), `favicon.ico`, `img/og-bingo.png` (1200x630 PNG).
- `pages/build.mjs` (build list only): ships the new files, copies `.well-known`, adds the headers rule for the new page, and drops the `noai, noimageai` header from public pages (it contradicts the AI-crawler decision). Without this the new files never deploy.
- `docs/SEO_TEST_HANDOFF.md`: this file.

## What a tester should check
1. Every indexable page (sitemap list): one `<h1>`, title <= 60 characters, description <= 155, unique title and description, `lang="en"`, one canonical equal to the sitemap URL, `og:image` absolute https and the file is 1200x630 PNG under 300 KB, Twitter card present, every `<img>` has alt, width and height.
2. JSON-LD parses on every page. Home: Organization, WebSite, SoftwareApplication (INR low, high and offer count equal the real packs), FAQPage whose questions are all visible on the page. Inner pages: BreadcrumbList. No rating or review markup anywhere.
3. Use-case page `/virtual-bingo-for-remote-teams`: 300-450 words, one H1 with the main phrase, a visible demo button, visible FAQ equal to its FAQPage JSON-LD, links to home, pricing, trust, terms, privacy.
4. `robots.txt`: allowed bots (Googlebot, Bingbot, Applebot, DuckDuckBot, OAI-SearchBot, ChatGPT-User, GPTBot, ClaudeBot, Claude-User, Claude-SearchBot, anthropic-ai, Google-Extended, PerplexityBot, Perplexity-User, GrokBot, xAI-Bot, `*`) can fetch public pages; CCBot, Bytespider, Diffbot, omgili, img2dataset, PetalBot, Timpibot get `Disallow: /`; no `Disallow` on `.js` or `.css`; the Sitemap line is present; no public page is disallowed.
5. Every utility page (`pay`, `paytest`, `paylink`, `signin`, `z`, `zc`, `big`, `preview`, `demo`, `report`, `ai-link`, `helpdesk-accept`, `helpdesk-approve`, `offline`, `404`, and any `host`) has `noindex` in the page and is not in the sitemap. Owner pages are noindex too and are deliberately not named in robots.txt.
6. `sitemap.xml`: only public indexable pages, absolute URLs, real `lastmod` dates, use-case page present.
7. After `bun pages/build.mjs`: `pages/public` holds `llms-full.txt`, `site.webmanifest`, `favicon.ico`, the IndexNow key file, `.well-known/security.txt` and the use-case page; `_headers` has the new page rule and no `noai` on public pages.
8. `node tools/indexnow.mjs --dry-run` lists the sitemap URLs, the host and the key; `https://bingo.corporatetambola.com/cfe25c19fa5aaf541ae0b611b2169261.txt` returns the key text once live.
9. Live after deploy: `/.well-known/security.txt` contact is hello@corporatetambola.com; the `*.pages.dev` address still answers 301 to `https://bingo.corporatetambola.com`; the 404 page is friendly and `noindex`.
10. Mobile (390 px): no sideways scroll on home and the use-case page; fonts and hero image are preloaded; no layout jump.

## Tests that will need updating (not touched by this branch)
- `apps/web/test/seo.test.ts`: expects `.html` canonicals and sitemap URLs, a sitemap without the use-case page, and the old robots rules.
- Any test that matches the old home title, description or H1 text, or the footer Tambola `pages.dev` link.

## Notes for the owner
- The branch was cut from `master` (the default branch; there is no `main`).
- Visible copy elsewhere on the site that says "private" (for example "Private by design", "private work link") was not changed. The owner copy rule says "closed group"; please decide.
- The home FAQ was left as it was; the use-case page FAQ adds the "how many players" and "colleagues" questions.
