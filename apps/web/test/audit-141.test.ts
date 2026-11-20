// Bingo 1.4.1 audit fixes, the page side (docs/TEST_HANDOFF.md "1.4.1 audit fixes", items 3, 7, 8, 9).
// Real page scripts in a DOM, talking to the real Worker code. Each test names the product line that breaks it; the breaks are applied by docs/audit141-break-checks.sh.
import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { newWorld, openPage, roundAt, T, type Page } from "./harness";
import { PRIZE_HOUSES } from "../../../packages/beacon/src/config";
import { EMP_CLEAN_FROM_MS, EMP_LOOKS_LIKE_EMAIL, badIdMessage } from "../../edge/src/people";

setDefaultTimeout(60_000);
const PUB = join(import.meta.dir, "../public");
const EDGE = join(import.meta.dir, "../../edge/src");
const START = roundAt(T) + 1200;
const INCOMPLETE = "Please check your Email ID. It looks incomplete.";
const ZC_SCRIPTS = "zgame.js control.js zc.js".split(" ");
let open: Page[] = [];
afterEach(async () => { for (const p of open) await p.close(); open = []; });

async function organizer() {
  const w = newWorld(); const s = await w.json(await w.api("POST", "/api/start", { email: "boss@acme.com" }));
  return { ...w, token: s.token as string, aiKey: s.aiKey as string, aiMessage: s.aiMessage as string };
}
type O = Awaited<ReturnType<typeof organizer>>;
/** a published game; `kind` is what people are asked for; `createdMs` dates the game (the new employee-ID rule starts at EMP_CLEAN_FROM_MS) */
async function game(o: O, id: string, kind: "emp-new" | "emp-old" | "email" | "mobile", createdMs?: number) {
  await o.api("POST", "/api/z", { id, startRound: START, callSeconds: 9, cap: 100, join: "phone" }, o.aiKey);
  if (kind !== "mobile") expect((await o.api("PATCH", `/api/z/${id}/settings`, { verify: "id", employeesOnly: true, idKind: kind === "email" ? "email" : "emp" }, o.token)).status).toBe(200);
  await o.api("POST", `/api/z/${id}/publish`, { email: "boss@acme.com", phone: "98765 43210" }, o.token);
  const when = createdMs ?? (kind === "emp-new" ? EMP_CLEAN_FROM_MS : undefined);
  if (when !== undefined) o.world.raw.prepare("UPDATE engagement SET created_ms=? WHERE id=?").run(when, id);
}
const setField = (p: Page, sel: string, v: string) => { const el = p.$(sel) as any; el.value = v; el.dispatchEvent(new p.win.Event("input", { bubbles: true })); };
const listOf = async (o: O, id: string) => o.json(await o.api("GET", `/api/z/${id}/people`, undefined, o.token));

// --- the guest's join page (z.js) ---
async function joinPage(o: O, id: string) {
  const p = await openPage(o.world, { url: `http://localhost/z?e=${id}`, html: "z.html", scripts: ["audio.js", "zgame.js", "z.js"] }); open.push(p);
  await p.waitFor((x) => /Join the game/.test(x)); return p;
}
describe("3a. the join page (z.js:92): 'The system will read this as ...' only where the server really cleans", () => {
  const hint = async (o: O, id: string, typed: string) => { const p = await joinPage(o, id); setField(p, "#emp", typed); return (p.$("#empHint") as any).textContent as string; };
  test("Email-ID game: spaces removed, lower case, full-width at-sign mended", async () => {
    const o = await organizer(); await game(o, "H-EML", "email");
    expect(await hint(o, "H-EML", "Rajat1＠Demo.com ")).toBe("The system will read this as rajat1@demo.com");
    expect(await hint(o, "H-EML", "Ra jat@Demo.com")).toBe("The system will read this as rajat@demo.com");
    expect(await hint(o, "H-EML", "rajat1@demo.com")).toBe(""); // already clean: nothing to say
    expect(await hint(o, "H-EML", "sales＠acme.com")).toBe("The system will read this as sales@acme.com");
  });
  test("employee-ID game on the new rule: letters and numbers; an e-mail typed here gets NO 'read this as' line", async () => {
    const o = await organizer(); await game(o, "H-NEW", "emp-new");
    const p = await joinPage(o, "H-NEW"); expect((await o.json(await o.api("GET", "/api/z/H-NEW/info"))).idClean).toBe(true);
    setField(p, "#emp", "1b-678"); expect((p.$("#empHint") as any).textContent).toBe("The system will read this as 1B678");
    setField(p, "#emp", "1B678"); expect((p.$("#empHint") as any).textContent).toBe("");
    for (const mail of ["rajat1@demo.com", "RAJAT1＠DEMO.COM", "ra jat@x.com", "sales@acme.com"]) { setField(p, "#emp", mail); const t = (p.$("#empHint") as any).textContent as string; expect([mail, t]).toEqual([mail, ""]); expect(t).not.toMatch(/read this as/i); }
  });
  test("employee-ID game made BEFORE the new rule: no hint at all (the server reads it the old way)", async () => {
    const o = await organizer(); await game(o, "H-OLD", "emp-old");
    const p = await joinPage(o, "H-OLD"); expect((await o.json(await o.api("GET", "/api/z/H-OLD/info"))).idClean).toBe(false);
    for (const typed of ["1b-678", "1B 678", "rajat1@demo.com"]) { setField(p, "#emp", typed); expect([typed, (p.$("#empHint") as any).textContent]).toEqual([typed, ""]); }
  });
  test("what the server then says to an e-mail typed in an employee-ID game is the plain refusal, on the page", async () => {
    const o = await organizer(); await game(o, "H-REF", "emp-new");
    const r = await o.api("POST", "/api/z/H-REF/join", { name: "Raj", empId: "rajat1@demo.com", device: "01" + "b".repeat(30) }); expect(r.status).toBe(400);
    const m = ((await r.json()) as any).error as string; expect(m).toBe(EMP_LOOKS_LIKE_EMAIL); expect(m).not.toMatch(/read this as/i);
  });
});

// --- the organizer's console (zc.js:500-556, 627): add one person, paste, CSV, and the summary line ---
async function consoleAt(o: O, id: string) {
  const afterLoad = (win: any, f: string) => { if (f === "zgame.js" && win.ZG && !win.ZG.PRIZE_HOUSES) win.ZG.PRIZE_HOUSES = PRIZE_HOUSES; };
  const posts: any[] = [];
  const hook = (win: any, f: string) => { afterLoad(win, f); if (f !== "control.js") return; const real = win.fetch; win.fetch = async (input: any, init?: any) => { const u = new URL(String(input), "http://localhost"); if ((init?.method || "GET").toUpperCase() === "POST" && u.pathname.endsWith("/people")) posts.push(JSON.parse(init.body)); return real(input, init); }; };
  const p = await openPage(o.world, { url: `http://localhost/zc?e=${id}`, html: "zc.html", scripts: ZC_SCRIPTS, session: { "cbz-org": o.token, "cbz-aimsg": o.aiMessage, "cbz-email": "boss@acme.com" }, afterLoad: hook }); open.push(p);
  await p.waitFor((x) => /Hello|Last step|Your game|Hi\./i.test(x));
  p.click('.zc-dot[data-open="6"]'); await p.waitFor((x) => /My people/.test(x) && /people are on my list|person is on my list/.test(x));
  return { p, posts };
}
const paste = async (c: Awaited<ReturnType<typeof consoleAt>>, text: string, expectSummary: RegExp) => { c.p.click('[data-mode="paste"]'); (c.p.$("#rosterTxt") as any).value = text; c.p.click("#rosterGo"); return c.p.waitFor((x) => expectSummary.test(x)); };

describe("3b/9. console: the typing hint, paste, CSV; duplicates after cleaning are NAMED in the summary", () => {
  test("typing hint (zc.js:627) follows the same three rules as the join page", async () => {
    const o = await organizer(); await game(o, "C-EML", "email"); await game(o, "C-NEW", "emp-new"); await game(o, "C-OLD", "emp-old");
    const hintAt = async (id: string, typed: string) => { const c = await consoleAt(o, id); setField(c.p, "#gemp", typed); return (c.p.$("#gemphint") as any).textContent as string; };
    expect(await hintAt("C-EML", "Ra jat＠Demo.com")).toBe("The system will read this as rajat@demo.com");
    expect(await hintAt("C-EML", "a@b")).toBe(INCOMPLETE); // refused before it is sent
    expect(await hintAt("C-NEW", "1b-678")).toBe("The system will read this as 1B678");
    const em = await hintAt("C-NEW", "rajat1@demo.com"); expect(em).toBe(EMP_LOOKS_LIKE_EMAIL); expect(em).not.toMatch(/read this as/i); // the refusal, never "read this as RAJAT1DEMOCOM"
    expect(await hintAt("C-OLD", "1B678")).toBe(""); // nothing to mend: no hint (the old-game hints for other typings are pinned below)
  });
  // Handoff item 3: "older games get no hint". Round 3 fixed the console (zc.js:627); this was a pin plus a test.failing and is now one plain test.
  test("handoff item 3: an older game gets NO hint in the console either, and an e-mail typed there gets no 'read this as' line", async () => {
    const o = await organizer(); await game(o, "C-OLD3", "emp-old"); const c = await consoleAt(o, "C-OLD3");
    setField(c.p, "#gemp", "rajat1@demo.com"); expect((c.p.$("#gemphint") as any).textContent).not.toMatch(/read this as/i);
    setField(c.p, "#gemp", "1b-678"); expect((c.p.$("#gemphint") as any).textContent).toBe("");
  });
  test("Email-ID game, paste: the e-mail cleaner is used (never the employee-ID cleaner); two spellings of one address are NAMED; an incomplete address goes to the 'look wrong' list with the plain message", async () => {
    const o = await organizer(); await game(o, "P-EML", "email"); const c = await consoleAt(o, "P-EML");
    const t = await paste(c, ["Asha, Asha.Sharma＠Acme.com", "Bala, asha.sharma@acme.com", "Chitra, Sales@X.com", "Dev, a@b", "Esha, ra jat＠x.com", "Farid, ASSIST＠GMAIL.COM"].join("\n"), /\d good, .* look(s)? wrong/);
    expect(t).toMatch(/Same Email ID after cleaning: asha\.sharma@acme\.com \(read as asha\.sharma@acme\.com\)\. 4 good, 1 duplicate removed, 1 looks wrong/);
    expect(c.posts[0].people.map((x: any) => x.empId)).toEqual(["asha.sharma@acme.com", "sales@x.com", "rajat@x.com", "assist@gmail.com"]); // what the server keeps: lower case, no spaces, plain at-sign
    expect((c.p.$("#wronglist") as any).textContent).toMatch(/Dev/); expect((c.p.$("#wronglist") as any).textContent).toContain(INCOMPLETE);
    expect((await listOf(o, "P-EML")).people.map((x: any) => x.empId).sort()).toEqual(["asha.sharma@acme.com", "assist@gmail.com", "rajat@x.com", "sales@x.com"]);
    expect(c.p.errors).toEqual([]);
  });
  test("Email-ID game, CSV upload with a header row: the same cleaning, and an address already on the list (the server's sameAfterCleaning) is named too", async () => {
    const o = await organizer(); await game(o, "F-EML", "email"); const c = await consoleAt(o, "F-EML");
    await paste(c, "Asha, asha@acme.com", /1 good, 0 duplicates removed, 0 look wrong/);
    c.p.click('[data-mode="file"]'); const inp = c.p.$("#gfile") as any;
    Object.defineProperty(inp, "files", { value: [{ text: async () => "Name,Email ID\nAsha again,ASHA＠Acme.com\nBala,bala@acme.com\nBala twice,Bala@ACME.com\nChitra,c@d\n" }], configurable: true }); inp.dispatchEvent(new c.p.win.Event("change", { bubbles: true }));
    const t = await c.p.waitFor((x) => /Same Email ID after cleaning/.test(x));
    // found inside the file: Bala twice is NAMED. ASHA＠Acme.com is cleaned on the page to the address already on the list, so the server sees a plain repeat: it is counted (2 duplicates) but not named (observation, TESTER_REPORT.md)
    expect(t).toMatch(/Already on the list: Asha again \(asha@acme\.com\)\. Same Email ID after cleaning: Bala@ACME\.com \(read as bala@acme\.com\)\. 1 good, 2 duplicates removed, 1 looks wrong/);
    // round 3: the server now NAMES a row it found already on the list ("Already on the list: Asha again (asha@acme.com)"); it used to be counted but not named
    expect(c.posts[1].people.map((x: any) => x.empId)).toEqual(["asha@acme.com", "bala@acme.com"]); // the page sent the clean forms; the server found the first one already listed
    expect((await listOf(o, "F-EML")).people.map((x: any) => x.empId).sort()).toEqual(["asha@acme.com", "bala@acme.com"]);
  });
  test("employee-ID game on the new rule, paste: letters and numbers; 1b-678 and 1B 678 are one person and NAMED; an e-mail row goes to 'look wrong' with the plain message and is never sent", async () => {
    const o = await organizer(); await game(o, "P-NEW", "emp-new"); const c = await consoleAt(o, "P-NEW");
    const t = await paste(c, ["Asha, 1b-678", "Bala, 1B 678", "Chitra, rajat@x.com", "Dev, E101", "Esha, 2c/9"].join("\n"), /\d good, .* look(s)? wrong/);
    expect(t).toMatch(/Same employee ID after cleaning: 1B 678 \(read as 1B678\)\. 3 good, 1 duplicate removed, 1 looks wrong/);
    expect(c.posts[0].people.map((x: any) => x.empId)).toEqual(["1B678", "E101", "2C9"]);
    const wl = (c.p.$("#wronglist") as any).textContent as string; expect(wl).toMatch(/Chitra/); expect(wl).toContain(EMP_LOOKS_LIKE_EMAIL); expect(wl).not.toMatch(/read this as/i);
    expect((await listOf(o, "P-NEW")).people.map((x: any) => x.empId).sort()).toEqual(["1B678", "2C9", "E101"]);
  });
  test("employee-ID game made BEFORE the new rule: capitals and no spaces only (the dash stays); an e-mail row is sent and the SERVER refuses it with the old words", async () => {
    const o = await organizer(); await game(o, "P-OLD", "emp-old"); const c = await consoleAt(o, "P-OLD");
    const t = await paste(c, ["Asha, 1b-678", "Bala, 1B 678", "Chitra, rajat@x.com"].join("\n"), /\d good, .* look(s)? wrong/);
    expect(c.posts[0].people.map((x: any) => x.empId)).toEqual(["1B-678", "1B678", "RAJAT@X.COM"]); // different people in the old rule; nothing is mangled into RAJATXCOM
    expect(t).toMatch(/2 good, 0 duplicates removed, 1 looks wrong/); expect(t).not.toMatch(/Same employee ID after cleaning/);
    const wl = (c.p.$("#wronglist") as any).textContent as string; expect(wl).toContain("An employee ID has letters and numbers only (up to 30)."); expect(wl).not.toContain(EMP_LOOKS_LIKE_EMAIL);
    expect(wl).toMatch(/Chitra/); // round 3: a row the SERVER refuses keeps the person's name (it used to come back as "No name")
  });
  test("one person at a time in an Email-ID game: the typed address is cleaned and sent; a half address is refused on the page and nothing is sent", async () => {
    const o = await organizer(); await game(o, "T-EML", "email"); const c = await consoleAt(o, "T-EML");
    setField(c.p, "#gname", "Raj"); setField(c.p, "#gemp", "Ra jat＠X.com"); c.p.click("#gadd"); await c.p.waitFor((x) => /1 good, 0 duplicates removed, 0 look wrong/.test(x));
    expect(c.posts[0].people).toEqual([{ name: "Raj", empId: "rajat@x.com" }]);
    setField(c.p, "#gname", "Bad"); setField(c.p, "#gemp", "nobody@"); c.p.click("#gadd"); await c.p.waitFor((x) => /0 good, 0 duplicates removed, 1 looks wrong/.test(x));
    expect(c.posts.length).toBe(1); expect((c.p.$("#wronglist") as any).textContent).toContain(INCOMPLETE);
  });
  test("round 4: a line with only an Email ID (no name) in an Email-ID game is accepted and sent as that Email ID", async () => {
    const o = await organizer(); await game(o, "B-EML", "email"); const c = await consoleAt(o, "B-EML");
    const t = await paste(c, "asha@acme.com\nbala@acme.com", /\d good, .* look(s)? wrong/);
    expect(t).toMatch(/2 good, 0 duplicates removed, 0 look wrong/);
    expect(c.posts[0].people.map((x: any) => x.empId)).toEqual(["asha@acme.com", "bala@acme.com"]);
    expect((await listOf(o, "B-EML")).people.map((x: any) => x.empId).sort()).toEqual(["asha@acme.com", "bala@acme.com"]);
  });
});

// --- v3: the too-long sentence (owner rule: over 30 after cleaning shows 'This ID is too long. An employee ID may be up to 30 characters once cleaned.') ---
describe("PRODUCT DEFECT D1 (pages): an employee ID over 30 characters once cleaned shows the too-long sentence while typing", () => {
  const TOO_LONG = "This ID is too long. An employee ID may be up to 30 characters once cleaned.";
  test("PRODUCT DEFECT D1: the join page (z.js) hint for 31 cleaned characters is the too-long sentence; 30 is a normal hint", async () => {
    const o = await organizer(); await game(o, "L-NEW", "emp-new"); const p = await joinPage(o, "L-NEW");
    setField(p, "#emp", "a".repeat(30)); expect((p.$("#empHint") as any).textContent).toBe("The system will read this as " + "A".repeat(30));
    setField(p, "#emp", "a-".repeat(31)); expect((p.$("#empHint") as any).textContent).toBe(TOO_LONG);
  });
  test("PRODUCT DEFECT D1: the console typing hint (zc.js) for 31 cleaned characters is the too-long sentence", async () => {
    const o = await organizer(); await game(o, "L-CON", "emp-new"); const c = await consoleAt(o, "L-CON");
    setField(c.p, "#gemp", "a".repeat(30)); expect((c.p.$("#gemphint") as any).textContent).toBe("The system will read this as " + "A".repeat(30));
    setField(c.p, "#gemp", "a-".repeat(31)); expect((c.p.$("#gemphint") as any).textContent).toBe(TOO_LONG);
  });
});

// --- 7. 'Which ID?' ---
describe("7. 'Which ID?' is hidden in Bingo's new flow (zc-flow-game.js:8), and still works in the console when it is true", () => {
  test("the game descriptor says idKind: false, and the pack's step-2 settings then carry no idKind", () => {
    const win: any = {}; new Function("window", readFileSync(join(PUB, "zc-flow-game.js"), "utf8")).call(win, win);
    expect(win.ZFLOW_GAME.idKind).toBe(false); expect(win.ZFLOW_GAME.rehearsal).toBe(true);
    const pack = readFileSync(join(PUB, "pack/zc-flow.js"), "utf8");
    const lines = pack.split("\n"); const hits = lines.map((l, i) => [i + 1, l] as const).filter(([, l]) => /Which ID\?/.test(l));
    const heading = hits.filter(([, l]) => /text: "Which ID\?"/.test(l)); expect(heading.length).toBe(1); // the one heading (the other hit is the comment above it), drawn only under `if (G.idKind) {`
    const at = heading[0]![0]; expect(lines.slice(Math.max(0, at - 3), at).some((l) => /if \(G\.idKind\)/.test(l))).toBe(true);
    expect(pack).toContain("audienceSettings(who.card, who.upTo, G.idKind ? who.idKind : undefined)"); // and what is saved: idKind only when the game declares it
  });
  test("round 5: the new screens are hidden for this release: ?flow=new opens the previous screens, so no 'Which ID?' is drawn by the pack", async () => {
    expect(readFileSync(join(PUB, "zc-mode.js"), "utf8")).toContain("var NEW_SCREENS_ENABLED = false;");
    const o = await organizer(); await game(o, "W-ONE", "mobile");
    const scripts = "zgame.js control.js zc-mode.js zc.js zc-flow-game.js pack/zc-flow.js".split(" ");
    const p = await openPage(o.world, { url: "http://localhost/zc?flow=new&e=W-ONE", html: "zc.html", scripts, session: { "cbz-org": o.token, "cbz-aimsg": o.aiMessage, "cbz-email": "boss@acme.com" }, afterLoad: (win: any, f: string) => { if (f === "zgame.js" && win.ZG && !win.ZG.PRIZE_HOUSES) win.ZG.PRIZE_HOUSES = PRIZE_HOUSES; } }); open.push(p);
    await p.waitFor((x) => /Hello|Last step|Your game|Hi\./i.test(x));
    expect(p.win.CT_ZCFLOW).toBe("old"); expect(p.win.location.search).toContain("flow=old"); expect(p.win.location.search).not.toContain("flow=new");
    expect(p.$(".zc-dot")).toBeTruthy(); expect(p.$('[class*="zf-"]')).toBeNull(); expect(p.text()).not.toMatch(/Which ID\?/); expect(p.errors).toEqual([]);
    expect(p.$("#trynewtop")).toBeNull(); // the "Try the new screens" link is gone from zc.html
  });
  test("Bingo's own console 'Which ID?' (zc.js:289) is shown only when what a person must give is not just a mobile number", async () => {
    const zc = readFileSync(join(PUB, "zc.js"), "utf8");
    expect(zc).toContain('(f.ver === "mobile" ? "" : grp("idk", "Which ID?", [["emp", "Employee ID"], ["email", "Email ID"]]))');
    const o = await organizer(); await game(o, "WM-1", "mobile");
    const m = await consoleAt(o, "WM-1"); m.p.click('.zc-dot[data-open="2"]'); await m.p.waitFor((x) => /What must a person give to get in/.test(x));
    expect(m.p.text()).not.toMatch(/Which ID\?/);
    m.p.click('[data-ck="ver"][data-v="id"]'); expect(m.p.text()).toMatch(/Which ID\?/); expect(m.p.$('[data-ck="idk"][data-v="email"]')).toBeTruthy();
    m.p.click('[data-ck="ver"][data-v="mobile"]'); expect(m.p.text()).not.toMatch(/Which ID\?/);
  });
});

// --- found while testing item 4: the console form does not know the saved setting ---
describe("4b. console step 2 opens on the game's saved 'what a person must give' and saves it back unchanged (fixed in round 3; before that it started from defaults)", () => {
  const stepTwo = async (id: string, people: boolean) => {
    const o = await organizer(); await game(o, id, "email"); if (people) expect((await o.json(await o.api("POST", `/api/z/${id}/people`, { people: [{ name: "Asha", empId: "asha@acme.com" }] }, o.token))).added).toBe(1);
    const c = await consoleAt(o, id); const patches: any[] = [], answers: any[] = []; const rf = c.p.win.fetch;
    c.p.win.fetch = async (i: any, init?: any) => { const r = await rf(i, init); if ((init?.method || "") === "PATCH") { patches.push(JSON.parse(init.body)); answers.push({ status: r.status, body: await r.clone().json() }); } return r; };
    c.p.click('.zc-dot[data-open="2"]'); await c.p.waitFor((x) => /What must a person give to get in/.test(x)); await new Promise((r) => setTimeout(r, 300));
    return { o, c, patches, answers, pressed: (k: string, v: string) => (c.p.$(`[data-ck="${k}"][data-v="${v}"]`) as any)?.getAttribute("aria-pressed") };
  };
  test("step 2 of a saved Email-ID game shows the saved choice (Employee ID or Email ID pressed, Email ID chosen)", async () => {
    const s = await stepTwo("S2-A", false);
    expect([s.pressed("ver", "id"), s.pressed("idk", "email")]).toEqual(["true", "true"]);
  });
  test("saving step 2 without touching 'what a person must give' sends verify id / idKind email / employeesOnly true, and the game keeps them", async () => {
    const s = await stepTwo("S2-B", false); s.c.p.click('[data-save="2"]'); await s.c.p.waitFor(() => s.patches.length > 0);
    expect(s.patches[0]).toMatchObject({ verify: "id", idKind: "email", employeesOnly: true }); expect(s.answers[0].status).toBe(200);
    const sum = await s.o.json(await s.o.api("GET", "/api/z/S2-B/summary", undefined, s.o.token)); expect([sum.verify, sum.idKind, sum.employeesOnly]).toEqual(["id", "email", true]);
  });
  test("with one person listed the same untouched save is NOT refused (same values are not a change), so the organizer can still save the other step-2 settings", async () => {
    const s = await stepTwo("S2-D", true); s.c.p.click('[data-save="2"]'); await s.c.p.waitFor(() => s.patches.length > 0);
    expect(s.patches[0]).toMatchObject({ verify: "id", idKind: "email", employeesOnly: true }); expect(s.answers[0].status).toBe(200);
    const sum = await s.o.json(await s.o.api("GET", "/api/z/S2-D/summary", undefined, s.o.token)); expect([sum.verify, sum.idKind, sum.employeesOnly]).toEqual(["id", "email", true]);
  });
});

// --- 8. guide.js ---
describe("8. guide.js: no duplicate entry, no template syntax, the three new cards match what the Worker really sends", () => {
  const guide = readFileSync(join(PUB, "guide.js"), "utf8");
  const page = async () => { const o = await organizer(); const p = await openPage(o.world, { url: "http://localhost/pricing.html", html: "pricing.html", scripts: ["guide.js"] }); open.push(p); return { p, o, CTG: p.win.CTG }; };
  test("the 'game has ended' row exists once, and none of the three new cards repeats a message fragment of another entry", async () => {
    expect(guide.split("The game has ended, so no one can be added").length - 1).toBe(1);
    const { CTG } = await page(); const C = CTG.catalog as any[];
    const idx = (frag: string) => C.map((e, i) => (e.m as string[]).some((f) => f.includes(frag) || frag.includes(f)) ? i : -1).filter((i) => i >= 0);
    for (const frag of ["The game has ended, so no one can be added", "This looks like an Email ID. This game asks for an employee ID", "Please check your Email ID. It looks incomplete", "You already have people listed. Start a new game to use a different"]) expect([frag, idx(frag).length]).toEqual([frag, 1]);
    // an exact copy (same fragments, same words, same steps) of another entry is a duplicate row
    const sig = C.map((e) => JSON.stringify([e.m, e.s ?? null, e.t, e.w, e.d, e.g])); expect(sig.filter((x, i) => sig.indexOf(x) !== i)).toEqual([]);
  });
  test("the new rows contain no template syntax (${ }, {{ }}, <% %>, backtick), and every catalog entry has a message, a title, what happened and at least one step", async () => {
    const { CTG } = await page();
    const bad: string[] = [];
    for (const e of CTG.catalog as any[]) { const txt = [...e.m, e.t, e.w, ...e.d, e.g?.label ?? "", e.g?.field ?? "", e.g?.href ?? ""].join(" | "); if (/\$\{|\{\{|\}\}|<%|%>|`|\bundefined\b|\[object|\bnull\b/.test(txt)) bad.push(e.t); if (!e.t || !e.w || !e.m?.length || !e.d?.length) bad.push("incomplete: " + e.t); }
    expect(bad).toEqual([]);
    const rows = guide.split("\n").filter((l) => /This looks like an Email ID\. This game asks|Please check your Email ID\. It looks incomplete|You already have people listed\. Start a new game/.test(l)); expect(rows.length).toBe(3); // e-mail in an employee-ID game, incomplete Email ID, the lock
    for (const r of rows) expect(r).not.toMatch(/\$\{|\{\{|<%|`/);
  });
  test("card 1 and card 2 match the strings the Worker REALLY sends (a real join answer), card 3 matches the constant in approvals.ts", async () => {
    const { CTG, o } = await page();
    await game(o, "G-NEW", "emp-new"); await game(o, "G-EML", "email");
    const a = await o.api("POST", "/api/z/G-NEW/join", { name: "Raj", empId: "rajat1@demo.com", device: "01" + "b".repeat(30) }); expect(a.status).toBe(400);
    const b = await o.api("POST", "/api/z/G-EML/join", { name: "Raj", empId: "rajat1@demo", device: "02" + "b".repeat(30) }); expect(b.status).toBe(400);
    const am = ((await a.json()) as any).error as string, bm = ((await b.json()) as any).error as string;
    expect(am).toBe(EMP_LOOKS_LIKE_EMAIL); expect(bm).toBe(INCOMPLETE); expect(badIdMessage("x", "email")).toBe(INCOMPLETE);
    const fa = CTG.find({ status: 400, message: am }), fb = CTG.find({ status: 400, message: bm }), fl = CTG.find({ status: 409, message: "You already have people listed. Start a new game to use a different kind of ID." }), fv = CTG.find({ status: 409, message: "You already have people listed. Start a new game to use a different way of asking for IDs." });
    expect([fa.matched, fa.entry.t]).toEqual([true, "This game asks for your employee ID"]);
    expect([fb.matched, fb.entry.t]).toEqual([true, "Please check your Email ID"]);
    expect([fl.matched, fl.entry.t]).toEqual([true, "You already have people listed"]); expect([fv.matched, fv.entry.t]).toEqual([true, "You already have people listed"]); // both lock sentences (id-kind-locked) have their card
    // the cards send the person to the right box and say the right thing
    expect(fa.entry.g.field).toBe("#emp"); expect(fb.entry.g.field).toBe("#emp"); expect(fa.entry.d.join(" ")).toMatch(/letters and numbers/); expect(fb.entry.d.join(" ")).toMatch(/name@company\.com/);
    // an old catalog entry must not swallow them first: they match their own entry, not "Your employee ID is needed"
    expect(fa.entry.t).not.toBe("Your employee ID is needed"); expect(fb.entry.t).not.toBe("Your employee ID is needed");
    // the same words in the same place for the 400 status with a differing tail
    expect(CTG.find({ status: 400, message: EMP_LOOKS_LIKE_EMAIL + " (extra words)" }).matched).toBe(true);
  });
  test("every message the Worker sends about an Email ID or employee ID in people.ts/worker.ts has a guide (no new unguided message)", async () => {
    const { CTG } = await page(); const missing: string[] = [];
    for (const f of readdirSync(EDGE).filter((x) => x.endsWith(".ts"))) readFileSync(join(EDGE, f), "utf8").split("\n").forEach((l, i) => {
      for (const m of l.matchAll(/error:\s*("(?:[^"\\]|\\.)*")/g)) { const msg = m[1]!.slice(1, -1); if (/Email ID|employee ID|email ID/.test(msg) && !CTG.apiOnly(msg) && !CTG.find({ status: 400, message: msg }).matched) missing.push(`${f}:${i + 1} ${msg.slice(0, 80)}`); }
    });
    expect(missing).toEqual([]);
  });
  test("round 3: the dead 'could not use this email ID' message is gone from the server and from the guide", () => {
    for (const f of readdirSync(EDGE).filter((x) => x.endsWith(".ts"))) expect([f, /EMAIL_UNUSABLE_MESSAGE|could not use this email ID/i.test(readFileSync(join(EDGE, f), "utf8"))]).toEqual([f, false]);
    expect(/could not use this email ID/i.test(guide)).toBe(false);
  });
});
