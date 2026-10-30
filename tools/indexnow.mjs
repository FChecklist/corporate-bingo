// Tells Bing, Yandex and the other IndexNow search engines which pages are new or changed, so they come back sooner (Google does not use IndexNow: it reads the sitemap).
// Run after a deploy:  node tools/indexnow.mjs            (sends every page in sitemap.xml)
//                      node tools/indexnow.mjs --dry-run  (prints what would be sent, sends nothing)
//                      node tools/indexnow.mjs https://HOST/page ...  (sends only the pages you name)
// The key file apps/web/public/<key>.txt must be live at the site root first (it proves the site is ours).
import { readFileSync, readdirSync } from "node:fs";
const PUB = new URL("../apps/web/public/", import.meta.url);
const key = readdirSync(PUB).map((f) => f.match(/^([0-9a-f]{32})[.]txt$/)).find(Boolean)?.[1];
if (!key) throw new Error("no IndexNow key file (a 32-character .txt) in apps/web/public");
const sitemap = readFileSync(new URL("sitemap.xml", PUB), "utf8");
const all = [...sitemap.matchAll(/<loc>([^<]+)<[/]loc>/g)].map((m) => m[1]);
const args = process.argv.slice(2), dry = args.includes("--dry-run"), named = args.filter((a) => a.startsWith("https://"));
const urlList = named.length ? named : all;
const host = new URL(all[0]).host;
const body = { host, key, keyLocation: `https://${host}/${key}.txt`, urlList };
if (dry) { console.log(JSON.stringify(body, null, 2)); process.exit(0); }
const res = await fetch("https://api.indexnow.org/indexnow", { method: "POST", headers: { "content-type": "application/json; charset=utf-8" }, body: JSON.stringify(body) });
console.log(res.status, res.statusText, urlList.length + " URLs"); // 200 or 202 = accepted
if (!res.ok && res.status !== 202) process.exit(1);
