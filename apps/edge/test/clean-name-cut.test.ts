// Found by the 100-million smoke test (rules P-10 / P-11 for Bingo, T-73 for Snakes, 2026-11-04): cleanName trimmed the name BEFORE cutting it to 60 characters, so a cut could leave a blank at the end
// or half an emoji (a lone surrogate), and cleaning the result again changed it. A cleaned name never ends in a blank or half an emoji, and cleaning is stable.
// FALSIFIED BY: clean-name-cut-before-trim (cleanName: .trim().slice(0, 60) with nothing after the cut)
import { expect, test } from "bun:test";
import { cleanName } from "../src/people";

const hex = (n: number) => "0123456789abcdef".repeat(8).slice(0, n);
const lone = (s: string) => /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(s);

test("a name whose 60th character is a blank does not end in a blank", () => {
  const out = cleanName(hex(58) + "z" + " " + hex(10));
  expect(out).toBe(hex(58) + "z");
  expect(cleanName(out)).toBe(out);
});
test("a name with an emoji across character 60 does not end in half an emoji", () => {
  const out = cleanName(hex(58) + "z" + "\u{1F600}" + hex(6));
  expect(lone(out)).toBe(false);
  expect(out.length).toBeLessThanOrEqual(60);
  expect(cleanName(out)).toBe(out);
});
test("a name that fits is unchanged, and many blanks at the cut leave no blank", () => {
  expect(cleanName("  Priya   Kumar ")).toBe("Priya Kumar");
  expect(cleanName(hex(59) + " " + " ".repeat(5) + "tail")).toBe(hex(59));
});
