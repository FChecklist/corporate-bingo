import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

// Guard: every page carries the approved small mark "१३९" exactly once, with the approved look. See README / release 1.3.3.
const ROOT = join(import.meta.dir, "../../..");
const PUB = join(ROOT, "apps/web/public");
const MARK = '<div class="mark139" lang="hi" aria-hidden="true"><span>१३९</span></div>';
const RULE1 = '.mark139{position:absolute;top:0;left:0;right:0;margin:0;padding:1px 0 0;text-align:center;line-height:1;pointer-events:none;user-select:none;z-index:2147483647;font-family:"Noto Sans Devanagari","Mukta","Nirmala UI","Mangal","Kohinoor Devanagari","Devanagari Sangam MN",sans-serif;font-size:6px;font-weight:700;color:#0B2A6B}';
const RULE2 = ".mark139 span{display:inline-block;border-bottom:.5px solid #7A1010;padding-bottom:.5px}";
const read = (p: string) => readFileSync(p, "utf8");
const count = (s: string, needle: string) => s.split(needle).length - 1;
const squash = (s: string) => s.replace(/\r?\n/g, "");

// Pages built as strings in code: file -> number of full pages in it. (HTML e-mails in brand.ts and dev-only tool servers are not pages.)
const CODE_PAGES: Record<string, number> = {
  "apps/edge/src/trust-page.ts": 1,
  "apps/edge/src/admin.ts": 1,
  "apps/edge/src/people.ts": 2,
  "packages/billing/src/index.ts": 1,
};

describe("the १३९ mark is on every page", () => {
  const files = readdirSync(PUB).filter((f) => f.endsWith(".html"));
  test("there are static pages to check", () => { expect(files.length).toBeGreaterThan(30); });

  for (const f of files) {
    test(`${f}: exactly one mark, approved markup and CSS`, () => {
      const html = read(join(PUB, f));
      expect(count(html, 'class="mark139"')).toBe(1);
      expect(count(html, MARK)).toBe(1);
      // the CSS: inline in the page, or in a stylesheet the page loads
      let css = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join("\n");
      for (const m of html.matchAll(/href="\/([\w.-]+\.css)[^"]*"/g)) if (existsSync(join(PUB, m[1]!))) css += "\n" + read(join(PUB, m[1]!));
      css = squash(css);
      expect(css).toContain(RULE1);
      expect(css).toContain(RULE2);
    });
  }

  for (const [f, n] of Object.entries(CODE_PAGES)) {
    test(`${f}: ${n} page(s) built in code carry the mark and its CSS`, () => {
      const src = read(join(ROOT, f));
      expect(count(src, "<!doctype html")).toBe(n);
      expect(count(src, 'class="mark139"')).toBe(n);
      expect(count(src, MARK)).toBe(n);
      if (src.includes('href="/app.css"')) return; // the page loads app.css, which carries the rules (checked below)
      expect(count(src, RULE1)).toBeGreaterThanOrEqual(1);
      expect(count(src, RULE2)).toBeGreaterThanOrEqual(1);
    });
  }

  test("the approved numerals, size, weight and colours are exactly as ordered", () => {
    expect(MARK).toContain("१३९");
    for (const part of ["font-size:6px", "font-weight:700", "color:#0B2A6B", "border-bottom:.5px solid #7A1010", "padding-bottom:.5px", "pointer-events:none", "user-select:none", "position:absolute"]) expect(RULE1 + RULE2).toContain(part);
    for (const f of ["app.css", "big.css"]) expect(squash(read(join(PUB, f)))).toContain(RULE1 + RULE2.replace(/^/, ""));
  });
});
