// A small JavaScript string reader for the wording tests: every text string of a source file (single quotes, double quotes and backticks, template pieces included, the code inside ${} left out).
// Comments are skipped. A regular expression literal is skipped by a simple rule (it follows ( , = : [ ! & | ? { } ; ). It exists because the screens put HTML with quotes inside template strings, which a
// plain "find the quotes" scan reads wrongly (found 20 Nov 2026: the first version of the voice test missed most of the text).
export interface Str { line: number; text: string }
export function textStrings(src: string): Str[] {
  const out: Str[] = []; const n = src.length; let i = 0, line = 1;
  const regexStart = (at: number) => /[(,=:\[!&|?{};]\s*$/.test(src.slice(Math.max(0, at - 6), at)) || at === 0;
  const skipRegex = () => { i++; let cls = false; while (i < n && (src[i] !== "/" || cls)) { if (src[i] === "\\") i++; else if (src[i] === "[") cls = true; else if (src[i] === "]") cls = false; i++; } i++; };
  const skipComments = (): boolean => {
    if (src[i] === "/" && src[i + 1] === "/") { while (i < n && src[i] !== "\n") i++; return true; }
    if (src[i] === "/" && src[i + 1] === "*") { i += 2; while (i < n && !(src[i] === "*" && src[i + 1] === "/")) { if (src[i] === "\n") line++; i++; } i += 2; return true; }
    return false;
  };
  function quoted(q: string) {
    let buf = ""; const start = line; i++;
    while (i < n && src[i] !== q) { if (src[i] === "\\") { buf += src[i + 1] === "n" ? " " : src[i + 1]; i += 2; continue; } if (src[i] === "\n") break; buf += src[i++]; }
    i++; out.push({ line: start, text: buf });
  }
  function template() {
    let buf = ""; const start = line; i++;
    while (i < n) {
      const c = src[i]!;
      if (c === "\\") { buf += src[i + 1]; i += 2; continue; }
      if (c === "`") { i++; break; }
      if (c === "\n") line++;
      if (c === "$" && src[i + 1] === "{") {
        buf += " "; i += 2; let depth = 1;
        while (i < n && depth > 0) {
          const d = src[i]!;
          if (d === "{") { depth++; i++; } else if (d === "}") { depth--; i++; }
          else if (d === "'" || d === '"') quoted(d);
          else if (d === "`") template();
          else if (skipComments()) continue;
          else if (d === "/" && regexStart(i)) skipRegex();
          else { if (d === "\n") line++; i++; }
        }
        continue;
      }
      buf += c; i++;
    }
    out.push({ line: start, text: buf });
  }
  while (i < n) {
    const c = src[i]!;
    if (c === "\n") { line++; i++; continue; }
    if (skipComments()) continue;
    if (c === "'" || c === '"') { quoted(c); continue; }
    if (c === "`") { template(); continue; }
    if (c === "/" && regexStart(i)) { skipRegex(); continue; }
    i++;
  }
  return out;
}
/** What a person reads: the tags and entities of a string are taken out. */
export const readable = (s: string) => s.replace(/<[^>]*>/g, " ").replace(/&[a-z#0-9]+;/gi, " ").replace(/\s+/g, " ").trim();
/** First person in text that speaks TO an organizer: I, I'm, I'll, my, me, myself, mine. */
export const FIRST = /(^|[\s>(“"'])(I|I'm|I'll|I've|I'd|my|My|me|Me|myself|mine)($|[\s.,?!:;)<"'”’])/;
