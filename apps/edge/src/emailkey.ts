/** THE one form of an e-mail address for comparing, storing and hashing (owner rule 2026-10-30): NFKC (full-width "＠" becomes "@"), spaces and zero-width characters removed, lower case.
 *  RAJAT1＠DEMO.COM, Rajat1＠Demo.com and rajat1@demo.com are the same address. Never use the employee ID cleaner (A-Z 0-9 only) for an e-mail address. */
export const emailKey = (raw: unknown): string => String(raw ?? "").normalize("NFKC").replace(/[\s​-‍⁠﻿]/g, "").toLowerCase();
