// The home page must not promise what the game does not do (QA 2026-10-29).
// It said "Ties share the prize." Bingo has one winner per prize line: when several cards finish on the same call, fate orders them (docs/BINGO_GAME.md "No ties").
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const home = readFileSync(join(import.meta.dir, "../public/index.html"), "utf8");
describe("the home page and the tie rule", () => {
  test("it does not say ties share the prize, and it says fate decides", () => {
    expect(home).not.toMatch(/ties share|share the prize/i);
    expect(home).toContain("If two cards finish together, fate decides who is first.");
  });
});
