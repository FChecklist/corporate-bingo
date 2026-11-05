// /fair.html: the plain page on how the game is kept fair (six facts and the honest limit), linked from the join page; third person; shipped by the build.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
const rd = (f: string) => readFileSync(new URL("../public/" + f, import.meta.url), "utf8");
test("fair.html: six facts, the honest limit, third person, no mobile number or e-mail, linked from the join page and built", () => {
  const h = rd("fair.html"), text = h.replace(/<[^>]+>/g, " ");
  expect((h.match(/<li>/g) ?? []).length).toBe(6);
  expect(text).toContain("very hard, not impossible");
  expect(text).not.toMatch(/\b(we|our|us|Bogey|Tambola|housie)\b/i);
  expect(text).not.toMatch(/@|mobile number/i);
  expect(h).toContain('rel="canonical" href="https://bingo.corporatetambola.com/fair.html"');
  expect(rd("z.js")).toContain('href="/fair.html"');
  expect(readFileSync(new URL("../../../pages/build.mjs", import.meta.url), "utf8")).toContain('"fair.html"');
});
