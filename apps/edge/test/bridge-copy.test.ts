// The bridge (apps/edge/src/console-bridge) is copied byte for byte from the console repo (packages/bridge, branch claude/console-game-pay-step-91b60a, commit 2db8168). Nobody edits it here:
// a change is made there and copied again with tools/vendor-bridge.mjs. This test fails if a copied file no longer matches the hash written when it was copied.
// FALSIFIED BY: bridge-copy-edited
import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const dir = join(import.meta.dir, "../src/console-bridge");
const hash = (f: string) => createHash("sha256").update(readFileSync(join(dir, f), "utf8").replace(/\r\n/g, "\n")).digest("hex");
describe("the console bridge copy", () => {
  const manifest = JSON.parse(readFileSync(join(dir, "MANIFEST.json"), "utf8")) as { files: Record<string, string> };
  test("every copied file matches its recorded hash, and no other file hides in the folder", () => {
    const files = readdirSync(dir).filter((f) => f.endsWith(".ts")).sort();
    expect(files).toEqual(Object.keys(manifest.files).sort());
    for (const f of files) expect([f, hash(f)]).toEqual([f, manifest.files[f]!]);
  });
});
