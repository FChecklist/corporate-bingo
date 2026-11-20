// Owner rule 2026-10-28: the games are online and CLOSE GROUP. The word "private" is never used in anything a person reads: the site, e-mails, reports, WhatsApp texts, store copy.
// Say "close group" for the game, "personal" for a link that is only for one person, "protected" or "confidential" for data (QA 2026-10-29).
import { describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { aiLinkMail, coHostLinkMail, hostLinkMail, signInMail } from "../src/mails";
import { manualText } from "../src/ai-link";
import { mapText } from "../src/ai-functions";
import { factsText } from "../src/ai-facts";
import { llmsTxt, trustHtml } from "../src/trust-page";

const ROOT = join(import.meta.dir, "../../..");
const PRIVATE = /\bprivate\b/i;
const around = (t: string) => { const m = PRIVATE.exec(t); return m ? t.slice(Math.max(0, m.index - 70), m.index + 50).replace(/\s+/g, " ") : null; };
const now = Date.UTC(2026, 9, 29);

/** Text a person can read in a source file: for a script, only what is inside quotes or backticks and not after //; for a page, everything. */
function visible(file: string): string[] {
  const src = readFileSync(join(ROOT, file), "utf8"); if (file.endsWith(".html") || file.endsWith(".txt")) return [src];
  return src.split("\n").filter((l) => PRIVATE.test(l)).filter((l) => { const i = l.search(PRIVATE); const head = l.slice(0, i).replace(/https?:\/\//g, ""); if (/\/\/|^\s*\*|^\s*\/\*/.test(head)) return false; let q = 0; for (const c of head) if (c === '"' || c === "'" || c === "`") q++; return q % 2 === 1; });
}

describe("the word 'private' is not in anything a person reads", () => {
  const files = execFileSync("git", ["ls-files", "apps/web/public"], { cwd: ROOT, encoding: "utf8" }).split("\n").filter((f) => /\.(html|js|txt)$/.test(f) && !/vendor\/|zgame\.js|reportgen\.js|control\.js|\.min\./.test(f));
  test("no page or script of the site (rules, privacy, terms, guide, console, phone page, home) uses it", () => {
    const hits = files.flatMap((f) => visible(f).filter((t) => PRIVATE.test(t)).map((t) => `${f}: ${around(t)}`));
    expect(hits).toEqual([]);
  });
  test("no e-mail uses it (Host link, Co-host link, AI link, sign-in)", () => {
    const mails = [hostLinkMail("https://bingo.test", "cbh_" + "a".repeat(48), "Ravi", "GAME-1"), coHostLinkMail("https://bingo.test", "cbc_" + "b".repeat(48), "boss@acme.com", now + 1e6), aiLinkMail("https://bingo.test", "cba_" + "c".repeat(48), "start", now + 1e6), signInMail("https://bingo.test", "123456", "tok")];
    for (const m of mails) { expect(around(m.subject)).toBeNull(); expect(around(m.text)).toBeNull(); expect(around(m.html)).toBeNull(); }
  });
  test("no AI text, facts or Trust page uses it", () => {
    const texts = [manualText("https://bingo.test", "cba_x", "ai", now), manualText("https://bingo.test", "cbh_x", "host", now), mapText("https://bingo.test/api", "https://bingo.test"), factsText("https://bingo.test/trust.html"), trustHtml(), llmsTxt()];
    for (const t of texts) expect(around(t)).toBeNull();
  });
  test("no sentence in the server code (messages, mails, AI screens) uses it", () => {
    const src = execFileSync("git", ["ls-files", "apps/edge/src", "packages/beacon/src", "packages/shared/src"], { cwd: ROOT, encoding: "utf8" }).split("\n").filter((f) => /\.ts$/.test(f) && !/pdf\.ts$/.test(f)); // pdf.ts is the TypeScript keyword "private"
    const hits = src.flatMap((f) => visible(f).filter((t) => PRIVATE.test(t)).map((t) => `${f}: ${around(t)}`));
    expect(hits).toEqual([]);
  });
  test("the message that shows an organizer key once says 'keep it safe', not 'private'", () => {
    const src = readFileSync(join(ROOT, "apps/edge/src/pay.ts"), "utf8"); expect(src).not.toMatch(/keep it private/); expect(src).toContain("keep it safe, it is shown only once");
  });
});
