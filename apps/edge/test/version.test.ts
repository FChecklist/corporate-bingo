// Mandatory version numbering (owner rule): one version, written the same everywhere, with a plain-English CHANGELOG entry and a line in the knowledge file.
// FALSIFIED BY: version-bumped-in-one-place-only, changelog-entry-missing
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import RELEASES from "../src/releases.json";
import { consoleAdapter } from "../src/console-pay";

const root = (f: string) => readFileSync(new URL("../../../" + f, import.meta.url), "utf8");
describe("one version number everywhere", () => {
  const v = JSON.parse(root("version.json")).version as string;
  test("version.json, package.json, the edge package, the newest release, the console link and the CHANGELOG agree", () => {
    expect(v).toMatch(/^\d+\.\d+\.\d+$/);
    expect(JSON.parse(root("package.json")).version).toBe(v);
    expect(JSON.parse(root("apps/edge/package.json")).version).toBe(v);
    expect((RELEASES as any[])[0].version).toBe(v);
    expect(consoleAdapter(0).gameVersion).toBe(v);
    expect(root("CHANGELOG.md")).toMatch(new RegExp("^## " + v.replace(/\./g, "\\.") + " ", "m"));
    expect(root("docs/KNOWLEDGE.md")).toContain(v);
  });
  test("the build writes the version into /version.json", () => {
    expect(root("pages/build.mjs")).toMatch(/version\.json"\), "utf8"\)\)\.version/);
  });
});
