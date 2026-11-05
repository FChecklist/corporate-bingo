// Sales-funnel reporter for the public pages (bundled to apps/web/public/funnel.js, exposes window.CBF). Built with: bun run build:funnel
// It is core's makeReporter, nothing more: first-party endpoint, no cookies, no storage, a random visit id kept in memory only, and nothing sent when Global Privacy Control or Do Not Track is on.
import { makeReporter } from "../../../vendor/game-core/packages/core/src/funnel";
const nav = navigator as unknown as { globalPrivacyControl?: boolean; doNotTrack?: string; msDoNotTrack?: string; sendBeacon?: (u: string, d: string) => boolean };
const w = window as unknown as { doNotTrack?: string; CBF?: unknown };
const optOut = nav.globalPrivacyControl === true || nav.doNotTrack === "1" || w.doNotTrack === "1" || nav.msDoNotTrack === "1";
const r = makeReporter({ endpoint: "/api/f/e", game: "bingo", nav: optOut ? { globalPrivacyControl: true } : nav });
w.CBF = { report: r.report, visit: r.visit, off: optOut };
