// Owner order 20 Nov 2026: no game page has its own sign-in; sign-in is only at home.corporatetambola.com and the work is in console.corporatetambola.com.
// With the flag LOGIN_VIA_CONSOLE=1 the console page of this game shows a calm "Please sign in at home" with two links and no e-mail box; with the flag off nothing changes (the owner switches it on).
// FALSIFIED BY: login-flag-shows-form
import { afterEach, describe, expect, test } from "bun:test";
import { newWorld, openPage, type Page } from "./harness";
let open: Page[] = [];
afterEach(async () => { for (const p of open) await p.close(); open = []; });
const signedOut = async (extra: Record<string, string>) => {
  const w = newWorld(extra);
  const p = await openPage(w.world, { url: "http://localhost/zc", html: "zc.html", scripts: "zgame.js control.js idlist.js zc.js".split(" ") }); open.push(p); return p;
};
describe("the console page of this game and the one sign-in", () => {
  test("flag off: the page still has its sign-in (e-mail box)", async () => {
    const p = await signedOut({}); await p.waitFor((x) => /Sign in to your console/.test(x));
    expect(!!p.$("#lem")).toBe(true); expect(/Please sign in at home/.test(p.text())).toBe(false);
  });
  test("flag on: no e-mail box; two links, to home and to the console", async () => {
    const p = await signedOut({ LOGIN_VIA_CONSOLE: "1" }); await p.waitFor((x) => /Please sign in at home/.test(x));
    expect(!!p.$("#lem")).toBe(false); expect(/Type your e-mail/.test(p.text())).toBe(false);
    expect((p.$("#gohome") as any).getAttribute("href")).toBe("https://home.corporatetambola.com/"); expect((p.$("#goconsole") as any).getAttribute("href")).toBe("https://console.corporatetambola.com/");
    expect(p.errors).toEqual([]);
  });
});
