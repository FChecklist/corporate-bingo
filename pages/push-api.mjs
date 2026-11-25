// "Notify me when this game begins" (corporate-push): reads the ONE address the player page may call, from apps/web/public/push-config.js.
// Empty (today) = dark: the build adds nothing to any page's connect-src. Otherwise it must be a plain https address (a real host name, optional port, no path),
// and the build stops if it is anything else, so a typo can never open the page's connect-src to something unintended.
export const PUSH_ADDRESS = /^https:\/\/(?:[a-z0-9-]+\.)+[a-z]{2,}(?::\d{1,5})?$/i;

/** The text of push-config.js -> "" (dark) or the plain https address. Throws when the file does not say it the way the build reads it, or the address is not a plain https address. */
export function pushApiOf(src) {
  const m = /\bapi\s*:\s*"([^"]*)"/.exec(src);
  if (!m) throw new Error('push-config.js: api is not written the way the build reads it (api: "...")');
  const v = m[1].trim().replace(/\/+$/, "");
  if (v !== "" && !PUSH_ADDRESS.test(v)) throw new Error("push-config.js: api must be empty or a plain https address with no path");
  return v;
}

/** The connect-src of the player page: unchanged while dark, with the one push address added once it is set. */
export function withPushConnect(csp, api) {
  if (!api) return csp;
  if (!csp.includes("connect-src 'self'")) throw new Error("the player page's connect-src is not in the form the build expects");
  return csp.replace("connect-src 'self'", "connect-src 'self' " + api);
}
