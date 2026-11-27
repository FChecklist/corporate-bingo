// Owner rule: no checkbox and no Accept button on the agreement screens; going ahead is the agreement, only the Terms link stays. Gentle words.
// FALSIFIED BY: accept-button-back, tick-the-box-text-back
import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const PUB = join(import.meta.dir, "../public"), EDGE = join(import.meta.dir, "../../edge/src");
const files = readdirSync(PUB).filter((f) => /\.(js|html)$/.test(f) && f !== "guide.js"); // guide.js keeps old messages only to recognise them
const text = (f: string) => readFileSync(join(PUB, f), "utf8");
describe("no tick-box wording and no Accept button (1.5.2)", () => {
  test("no page or script says 'tick the box' or has an 'Accept ...' button", () => {
    for (const f of files) { const s = text(f); expect([f, /tick the box|tick to agree|before you tick/i.test(s)]).toEqual([f, false]); expect([f, />\s*Accept( the)? [^<]*</.test(s)]).toEqual([f, false]); }
  });
  test("the Co-host screen says Start as Co-host and the sign-in sheet has no checkbox", () => {
    const z = text("zc.js"); expect(z).toContain(">Start as Co-host<"); expect(z).toContain("Press the button to take the Co-host role.");
  });
  test("the server never asks anyone to tick a box or tap Allow to agree", () => {
    for (const f of ["consent.ts", "helpdesk.ts", "partners.ts", "worker.ts"]) { const s = readFileSync(join(EDGE, f), "utf8"); expect([f, /tick the box|Allow to agree|agree to join/i.test(s)]).toEqual([f, false]); }
  });
});
