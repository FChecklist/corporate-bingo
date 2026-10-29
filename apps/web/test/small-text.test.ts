// No text under 12 px on any page (the owner's phone-fit rule, checked in a real browser by tools/sim2 scenarios S08 and S11). The console's step arrow and the sign-in eyebrow were 11 px (QA 2026-10-29).
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const PUB = join(import.meta.dir, "../public");
describe("text size in the style sheets", () => {
  for (const f of readdirSync(PUB).filter((x) => x.endsWith(".css"))) {
    test(`${f}: no font-size below 12px`, () => {
      const css = readFileSync(join(PUB, f), "utf8"), small: string[] = [];
      for (const m of css.matchAll(/([^{}]*)\{([^{}]*)\}/g)) for (const d of m[2]!.matchAll(/font-size:\s*([0-9.]+)px/g)) if (Number(d[1]) < 12) small.push(`${m[1]!.trim().slice(0, 60)} { font-size: ${d[1]}px }`);
      expect(small).toEqual([]);
    });
  }
});
