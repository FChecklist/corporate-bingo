// Cloudflare Pages middleware: (1) the old *.pages.dev address redirects page requests (301) to the real address; /api/* keeps working as before.
// (2) Payment and sign-in live in the console and at home: with PAY_VIA_CONSOLE=1 the old pay pages answer a redirect to the console, and with LOGIN_VIA_CONSOLE=1 the old sign-in page answers a redirect to home. Both flags are off until they are switched on.
import { domainRedirect } from "../../apps/edge/src/domain-redirect";
import { BRAND } from "../../apps/edge/src/brand";
import { legacyPayGate, loginGate } from "../../apps/edge/src/console-pay";

export const onRequest = (ctx: { request: Request; env: any; next: () => Promise<Response> }) =>
  domainRedirect(ctx.request, ctx.env.PUBLIC_ORIGIN || BRAND.defaultOrigin) ?? ((ctx.request.method === "GET" || ctx.request.method === "HEAD") && !new URL(ctx.request.url).pathname.startsWith("/api/") ? legacyPayGate(ctx.request, ctx.env) ?? loginGate(ctx.request, ctx.env) : null) ?? ctx.next();
