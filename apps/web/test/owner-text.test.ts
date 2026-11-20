// 20 Nov 2026 (owner): prices use the rupee sign; never "100% secure", "most secure gateway" or "played by major companies"; the billing line is only "We keep billing data for audit and tax reasons.";
// the privacy line is "designed to follow US privacy laws, the EU GDPR and India's DPDP"; the fairness sentence is on the screens only because packages/beacon/test/fairness.test.ts proves it in code;
// no PDF e-mail is promised unless it exists (here the organizer's report is a LINK in an e-mail and the PDF is made on their own device; the pages must not say "attached" or "as a PDF e-mail").
// FALSIFIED BY: ownertext-rs-returns, ownertext-banned-phrase, ownertext-privacy-line-changed
import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const PUB = join(import.meta.dir, "../public"), SRC = join(import.meta.dir, "../../edge/src");
const shipped = readdirSync(PUB).filter((f) => /\.(html|js|txt)$/.test(f) && !/^(zgame|reportgen)\.js$/.test(f)).map((f) => [f, readFileSync(join(PUB, f), "utf8")] as const);
const server = readdirSync(SRC).filter((f) => f.endsWith(".ts")).map((f) => [f, readFileSync(join(SRC, f), "utf8")] as const);
const all = [...shipped, ...server];

describe("owner wording rules", () => {
  test("prices are written with the rupee sign: no 'Rs 1,000', 'Rs. 5' or 'INR 10,000' on a screen, in a mail or in the AI's own sentences (the PDF writer's own Rs fallback for fonts without the sign is the one exception)", () => {
    const hits = all.filter(([f]) => f !== "pdf.ts").flatMap(([f, s]) => [...s.matchAll(/\b(Rs\.? ?|INR )\d/g)].map((m) => `${f}: ${s.slice(Math.max(0, m.index! - 20), m.index! + 20).replace(/\s+/g, " ")}`));
    const allowed = hits.filter((h) => /replace\(\/\^\(Rs/.test(h) || /\/\^\(Rs/.test(h));
    expect(hits.filter((h) => !allowed.includes(h))).toEqual([]);
  });
  test("none of the forbidden claims is written anywhere that ships", () => {
    const bad = /100\s?%\s*secure|most secure (payment )?(gateway|platform)|played by (major|leading|top|fortune)/i;
    expect(all.filter(([, s]) => bad.test(s)).map(([f]) => f)).toEqual([]);
  });
  test("the billing line is exactly 'We keep billing data for audit and tax reasons.' wherever billing data is mentioned", () => {
    const mentions = shipped.filter(([, s]) => /billing data/i.test(s));
    expect(mentions.length).toBeGreaterThan(2);
    for (const [f, s] of mentions) for (const m of s.matchAll(/[^.<>]{0,40}billing data[^.<>]{0,60}/gi)) if (/^(We|we) keep billing data/.test(m[0].trim()) || /keep billing data/.test(m[0])) expect([f, /We keep billing data for audit and tax reasons/.test(s)]).toEqual([f, true]);
  });
  test("the privacy line: 'designed to follow US privacy laws, the EU GDPR and India's DPDP' (home page and the AI's facts)", () => {
    expect(readFileSync(join(PUB, "index.html"), "utf8")).toContain("designed to follow US privacy laws, the EU GDPR and India&rsquo;s DPDP");
    expect(readFileSync(join(SRC, "ai-facts.ts"), "utf8")).toContain("designed to follow US privacy laws, the EU GDPR and India's DPDP");
    expect(readFileSync(join(PUB, "trust.html"), "utf8")).toContain("designed to follow US privacy laws, the EU GDPR and India's DPDP");
  });
  test("the fairness sentence is on the console and the home page, word for word", () => {
    const S = "No one knows the next number: not the organizer, not the host, not even the software.";
    expect(readFileSync(join(PUB, "zc.js"), "utf8")).toContain(S); expect(readFileSync(join(PUB, "index.html"), "utf8")).toContain(S);
  });
  test("no page promises a PDF by e-mail: the report e-mail carries a link and the PDF is made on the organizer's own device", () => {
    const hits = shipped.filter(([f]) => !/^(terms|privacy|dpa|legal|legal-position)\.html$/.test(f)).filter(([, s]) => /(PDF|report)[^.<>]{0,40}(attached|as an attachment)|attached[^.<>]{0,30}(PDF|report)|send[^.<>]{0,30}details[^.<>]{0,30}as a PDF/i.test(s)).map(([f]) => f);
    expect(hits).toEqual([]);
  });
});
