/* ONE ID RULE (owner rule, 20 Nov 2026): "Invite people with just an ID". An ID (employee, associate, vendor or customer ID: these are only words, not choices) is ONE alphanumeric field.
   ONE function cleans it everywhere: what a person types on the join page, and what the organizer types, pastes or uploads. At upload, join, approval and matching it is the same.
   NFKC first (full-width letters and digits become plain ASCII), then EVERY character that is not A-Z, a-z or 0-9 is removed (spaces, dashes, slashes, dots, underscores, symbols, accents,
   other alphabets, emoji, zero-width characters), then upper case. "A-1101", "A 1101", "A/1101", "a.1101" are all A1101.
   Why: people type IDs in many ways and the owner wants one ID to be one person; no name, mobile number or e-mail is asked.
   Old games: before this rule an ID kept . _ - / and dropped only spaces (people.ts, before 20 Nov 2026). A game made before EMP_LEGACY_BEFORE_MS may therefore hold IDs stored under the old rule. For those games an ID is
   ALSO looked up in its old form (legacyEmpFor), so nobody who is already on a list is locked out. Nothing that is stored is rewritten. */

/** A game made before this instant (ms) may hold IDs stored under the old rule. Left generous on purpose (1 Jan 2027): the extra look-up costs one hash and can never let a wrong person in, while a date set too early would lock out
    people on a list made with the old rule between that date and the real deploy. The release may lower it to the exact deploy time. */
export const EMP_LEGACY_BEFORE_MS = Date.UTC(2027, 0, 1);
export const EMP_MAX = 30;

/** The one cleaning function: only A-Z and 0-9 are left, in upper case. Always a string (empty when nothing usable was typed). */
export const cleanEmpId = (raw: unknown): string => String(raw ?? "").normalize("NFKC").replace(/[^A-Za-z0-9]/g, "").toUpperCase();

/** A letter or digit of another script (Arabic-Indic digits, accented or non-English letters) is refused, never converted or dropped: an ID is English letters and digits. Full-width forms become plain ASCII first (NFKC). */
export const hasForeignChars = (raw: unknown): boolean => /[\p{L}\p{N}]/u.test(String(raw ?? "").normalize("NFKC").replace(/[A-Za-z0-9]/g, ""));
/** An e-mail address typed where an ID is asked is refused, never turned into letters and digits. */
export const looksLikeEmail = (raw: unknown): boolean => String(raw ?? "").normalize("NFKC").includes("@");

export const EMP_ENGLISH = "Please use English letters and numbers only.";
export const EMP_BAD = "An ID has letters and numbers only. Spaces, dashes and symbols are ignored. It may be up to 30 characters.";
export const EMP_LOOKS_LIKE_EMAIL = "This looks like an e-mail address. Please type your ID: letters and numbers only.";
export const EMP_TOO_LONG = "This ID is too long. An ID may be up to 30 characters.";
/** The sentence shown when an ID cannot be used. */
export const badIdMessage = (raw: unknown): string => (looksLikeEmail(raw) ? EMP_LOOKS_LIKE_EMAIL : hasForeignChars(raw) ? EMP_ENGLISH : cleanEmpId(raw).length > EMP_MAX ? EMP_TOO_LONG : EMP_BAD);

/** An ID as typed. "" = nothing typed, null = not a usable ID. */
export function normEmpFor(raw: unknown): string | null {
  if (String(raw ?? "").trim() === "") return "";
  if (looksLikeEmail(raw) || hasForeignChars(raw)) return null;
  const c = cleanEmpId(raw);
  return c && c.length <= EMP_MAX ? c : null;
}

/** Could this game hold IDs stored under the old rule? */
export const isLegacyGame = (e: { created_ms?: number | null } | null | undefined): boolean => !e || e.created_ms == null || Number(e.created_ms) < EMP_LEGACY_BEFORE_MS;
/** The old-rule form of an ID (spaces dropped, upper case, letters, digits and . _ - / kept, 30 characters), only for a game that may still hold such IDs, and only when it differs from the cleaned form. null = nothing more to try. */
export function legacyEmpFor(raw: unknown, e: { created_ms?: number | null } | null | undefined): string | null {
  if (!isLegacyGame(e)) return null;
  const s = String(raw ?? "").replace(/\s+/g, "").toUpperCase();
  if (!s || !/^[A-Z0-9][A-Z0-9._\-/]{0,29}$/.test(s)) return null;
  return s === cleanEmpId(raw) ? null : s;
}
