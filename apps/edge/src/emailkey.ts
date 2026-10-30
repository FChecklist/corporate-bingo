/** Two forms of an e-mail address (owner rule 2026-10-30). Never use the employee ID cleaner (A-Z 0-9 only) for an e-mail address.
 *  accountEmail: the address of an ACCOUNT, sign-in, Host or Co-host, payment or form: NFKC (full-width "@" becomes "@"), trim, lower case, invisible zero-width characters dropped.
 *  Inner spaces are KEPT on purpose, so the shape checks refuse "a b@c.com" instead of quietly mending it.
 *  emailKey: the Email ID of a PARTICIPANT (the Email ID criterion): the same, and every space removed as well, so two spellings of one address are one person. */
export const accountEmail = (raw: unknown): string => String(raw ?? "").normalize("NFKC").replace(/[\u200B-\u200D\u2060\uFEFF]/g, "").trim().toLowerCase();
export const emailKey = (raw: unknown): string => accountEmail(raw).replace(/\s+/g, "");
