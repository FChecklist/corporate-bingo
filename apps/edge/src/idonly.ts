// ID-only joining (owner order, 1 Nov 2026), the same design as Tambola: a person joins with name, location and an Employee, Associate, Vendor or Member ID.
// No mobile number or e-mail address is asked for, taken or kept for taking part. An ID on the Organizer's list goes straight in; any other ID waits on the
// "People asking to join" screen until the Organizer, a Host or a Co-host confirms it. Off unless env.ID_ONLY === "1" (the Worker reads it once per request).
let on = false;
export const setIdOnly = (env: any) => { on = env?.ID_ONLY === "1"; };
export const idOnlyNow = () => on;
export const cleanPlace = (n: unknown): string | null => { const t = typeof n === "string" ? Array.from(n).filter((ch) => { const c = ch.codePointAt(0)!; return c >= 32 && c !== 127 && !(c >= 0x80 && c <= 0x9f) && !(c >= 0x200b && c <= 0x200f) && !(c >= 0x2028 && c <= 0x202e) && c !== 0xfeff && !"<>&\"".includes(ch); }).join("").replace(/\s+/g, " ").trim().slice(0, 60) : ""; return t.length >= 2 ? t.replace(/^[=+@\-]+/, "").trim() || null : null; };
