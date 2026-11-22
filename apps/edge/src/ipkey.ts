// One key per network, for abuse counters. IPv4: the full address. IPv6: the first 64 bits (a /64), because one home or office network is handed a whole /64 and can turn through
// billions of addresses inside it. Counting each address alone would let a person start again from zero on every request. (visits.ts keeps a /48 for display only; that is not a limit key.)
/** The part of a network address that stands for one network. Unreadable text is returned unchanged (it still counts, under its own key). */
export function ipGroup(ip: string | null | undefined): string {
  const v = (ip ?? "").trim().toLowerCase();
  if (!v) return "local";
  const m4 = v.match(/^(?:::ffff:)?(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m4) return m4.slice(1).map((x) => String(Number(x))).join(".");
  if (!v.includes(":") || !/^[0-9a-f:]+$/.test(v)) return v;
  let g: string[];
  if (v.includes("::")) {
    const parts = v.split("::"); if (parts.length !== 2) return v;
    const h = parts[0] ? parts[0].split(":") : [], t = parts[1] ? parts[1].split(":") : [], fill = 8 - h.length - t.length;
    if (fill < 1) return v;
    g = [...h, ...Array(fill).fill("0"), ...t];
  } else g = v.split(":");
  if (g.length !== 8 || g.some((x) => !/^[0-9a-f]{1,4}$/.test(x))) return v;
  return "v6/" + g.slice(0, 4).map((x) => parseInt(x, 16).toString(16)).join(":");
}
