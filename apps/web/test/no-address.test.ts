// Owner order 1 Nov 2026: no street, city, state or pin code anywhere. Only "India".
// Every file that ships (pages, scripts, Worker source, legal fragments, settings) is read; none may carry these words.
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..", "..", "..");
const SHIPPED = ["apps/web/public", "apps/edge/src", "apps/edge/wrangler.toml", "packages", "tools/legal", "pages/build.mjs", "docs"];
const SKIP = new Set(["node_modules", ".git", "test", "__pycache__"]);
const TEXT = /\.(html|js|mjs|ts|json|md|txt|toml|py|svg|css|xml|sql)$/;
const BANNED = /Ghaziabad|Uttar Pradesh|Indirapuram|Shipra|B-1105|\b201014\b/i;

function* walk(p: string): Generator<string> {
  const s = statSync(p, { throwIfNoEntry: false });
  if (!s) return;
  if (s.isFile()) { if (TEXT.test(p)) yield p; return; }
  for (const n of readdirSync(p)) if (!SKIP.has(n)) yield* walk(join(p, n));
}

describe("no address, city or state in anything that ships", () => {
  test("the shipped files name India only", () => {
    const hits: string[] = []; let files = 0;
    for (const r of SHIPPED) for (const f of walk(join(ROOT, r))) { files++; const m = readFileSync(f, "utf8").match(BANNED); if (m) hits.push(`${f.slice(ROOT.length + 1)}: ${m[0]}`); }
    expect(files).toBeGreaterThan(50);
    expect(hits).toEqual([]);
  });
  test("the company details carry no address lines and no state name", () => {
    const b = readFileSync(join(ROOT, "packages/billing/src/index.ts"), "utf8");
    expect(b).toContain('stateName: "", addressLines: []');
    expect(readFileSync(join(ROOT, "apps/edge/wrangler.toml"), "utf8")).not.toMatch(/addressLines|stateName/);
  });
  test("the footer and the terms say India and nothing more specific", () => {
    for (const f of ["terms.html", "privacy.html", "legal-position.html", "index.html"]) {
      const t = readFileSync(join(ROOT, "apps/web/public", f), "utf8");
      expect(t).toContain("sole proprietorship");
    }
    expect(readFileSync(join(ROOT, "apps/web/public/terms.html"), "utf8")).toContain("The courts in India have exclusive jurisdiction");
  });
});
