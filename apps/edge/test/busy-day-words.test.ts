// When the day's write allowance is used up, a winner or a phone is told to try again later. The text said "after midnight UTC": a guest does not know UTC.
// The allowance restarts at 00:00 UTC, which is 05:30 in India (QA 2026-10-29). The sentence starts "Busy day." as before, because the help (guide.js) recognises it by that.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const src = (f: string) => readFileSync(join(import.meta.dir, "../src", f), "utf8");
describe("the busy-day message is in words a guest knows", () => {
  test("no 'Busy day.' sentence mentions UTC, and the ones that say when to come back say it in India time", () => {
    const hits = ["winners.ts", "lifecycle.ts", "worker.ts", "pay.ts"].flatMap((f) => [...src(f).matchAll(/"(Busy day\.[^"]*)"/g)].map((m) => ({ f, text: m[1] })));
    expect(hits.length).toBeGreaterThanOrEqual(7);
    for (const h of hits) expect(h.text).not.toMatch(/UTC|midnight/i);
    const later = hits.filter((h) => /try again/i.test(h.text) && !/kept on your phone|payment is safe/i.test(h.text));
    expect(later.length).toBe(4); for (const h of later) expect(h.text).toBe("Busy day. Please try again after 6 am India time.");
  });
  test("the help still recognises the sentence by its first words", () => {
    expect(readFileSync(join(import.meta.dir, "../../web/public/guide.js"), "utf8")).toContain('"Busy day"');
  });
});
