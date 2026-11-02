/* Corporate Bingo: the page behind a "payment link" (docs/ROLES_AND_CONSOLE_SPEC_2.md, item 13). Anyone who holds the link can open it, with no sign-in. It is a payment INFORMATION page first:
   the game (name, game ID, number of participants, date and start time in India time, the organizer's name and masked e-mail) and the price, then the payer's name and e-mail, then Pay.
   Only after Pay does Razorpay open, and it pays for THAT game and no other. The server decides the price and verifies the payment; nothing here writes anything else.
   The look and the behaviour are the shared payment kit (paykit.js), the same in all six games; what the payer typed is kept for this tab (the draft) and put back after any failure or reload. */
(function () {
  const TB = window.TB, PK = window.PK, esc = TB.esc, $app = document.getElementById("app");
  let token = (TB.qs("t") || "").trim();
  if (token) { try { sessionStorage.setItem("cbz-pl", token); } catch {} } else { try { token = sessionStorage.getItem("cbz-pl") || ""; } catch {} } // a refresh of this tab still works
  if (!/^[0-9a-f]{48}$/.test(token)) token = ""; // anything else is not one of our links (and never goes into an address)
  try { history.replaceState(null, "", location.pathname); } catch {} // the secret leaves the address bar at once
  const KEYS = ["name", "email", "phone", "pcode", "org", "tax"];
  const draft = PK.draft("paylink");
  const S = { info: null, err: "", busy: false, done: null, gone: false, hold: false, country: "IN", ...PK.payerState() };
  PK.persist($app, S, draft, KEYS);
  const call = async (method, path, body) => {
    let r;
    try { r = await fetch(path, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) }); }
    catch { const err = Object.assign(new Error("We could not reach the service. Please check your internet and try again."), { status: 0 }); if (window.CTG) { CTG.wrap(err, { what: method + " " + path.split("?")[0] }); if (method !== "GET") { err.guided = true; CTG.watch(err, { retry: () => call(method, path, body) }); } } throw err; }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { const err = Object.assign(new Error(j.error || "Something went wrong. Please try again."), { status: r.status, body: j }); if (window.CTG) { CTG.wrap(err, { what: method + " " + path.split("?")[0].replace(/\/[0-9a-f]{16,}/gi, "/...") }); if (method !== "GET") { err.guided = true; CTG.watch(err, { retry: () => call(method, path, body) }); } } throw err; }
    return j;
  };
  const head = (title, lead) => `<h1 class="pk-h1" id="pk-h1" tabindex="-1">${esc(title)}</h1>${lead ? `<p class="pk-lead">${lead}</p>` : ""}`;
  const calm = (title, text) => `${head(title, esc(text))}<div class="pk-single">${S.info && S.info.game ? PK.summary({ game: S.info.game, price: null, paid: S.info.status === "paid" }) : ""}</div>`;

  const holdCard = () => `${head("We are checking your payment")}<section class="pk-card" id="paywait" role="status"><p class="pk-sub">${S.busy ? "Please keep this page open. This can take a few minutes." : "Your payment is still being confirmed. If money left your account, the game is marked paid as soon as the bank confirms. Please do not pay again."}</p>${PK.errBox()}<button class="pk-btn${S.busy ? " is-busy" : ""}" id="chkpay" type="button"${S.busy ? " disabled" : ""}>${S.busy ? "Checking…" : "Check my payment"}</button>${S.busy ? "" : '<p class="pk-note"><button type="button" class="pk-link" id="payagain">No money was taken. Let me pay again.</button></p>'}</section>${PK.live()}`;
  const skeleton = () => PK.layout({ title: "Payment for your game", lead: "Loading the game details…", wait: 3, step: 1, aside: PK.summarySkeleton(), col: '<section class="pk-card" aria-busy="true"><div class="pk-skel l1"></div><div class="pk-skel l2"></div><div class="pk-skel l2"></div><div class="pk-skel l3"></div></section>' });

  function view() {
    if (!token || S.gone) return head("This payment link is not working", "It may be incomplete or it may have been replaced. Please ask the person who sent it for a new link.");
    if (S.done) {
      const g = S.info && S.info.game, p = S.info && S.info.price, d = S.done;
      return PK.layout({
        title: "Payment received", step: 3, finished: true, aside: PK.summary({ game: g, price: p, paid: true, totalLabel: "Paid" }) + PK.trust(),
        col: PK.receipt(Object.assign({ total: p && p.total, currency: p && p.currency }, d), {
          title: "Payment received. Thank you.", lead: "The game is paid for. You can close this page.", email: S.email,
          forHtml: g ? `${esc(g.name || "Your game")}<small>game ID ${esc(g.id || "")}</small>` : "Your game",
          after: `<p class="pk-note">${d.invoiceUrl ? "We also e-mailed the invoice to you and to the organizer." : "We e-mail the invoice to the address you gave."}</p>`,
        }),
      });
    }
    if (!S.info) return S.err ? head("We could not load this payment link", esc(S.err)) : skeleton();
    if (S.hold) return holdCard();
    const i = S.info, st = i.status;
    if (st === "paid") return calm("This game is already paid for", "Nothing more is needed. You can close this page.");
    if (st === "expired") return calm("This payment link has run out", "A payment link works for 7 days, and a newer link stops the older one. Please ask the person who sent it for the newest link.");
    if (st === "cancelled") return calm("This game was cancelled", "There is nothing to pay. Please speak to the organizer.");
    if (st === "closed") return calm("This game did not start", "This game did not start and is closed. There is nothing to pay. Please speak to the organizer.");
    if (st === "confirming" && !S.busy) return calm("Confirming a payment", "A payment for this game is being confirmed. Please wait a few minutes. If it goes through, this page will say the game is paid.");
    if (!i.price) return calm("A custom arrangement is needed", "A game this big is arranged with us directly. Please write to us from the contact page.");
    const p = i.price, cur = p.currency || "INR";
    return PK.layout({
      title: "Payment for your game", step: S.busy ? 2 : 1, aside: PK.summary({ game: i.game, price: p }) + PK.trust(),
      lead: `Payment is for Game <b>${esc(i.game && i.game.name ? i.game.name : "Your game")}</b>; Amount <b>${esc(TB.money(p.total, cur))}</b>;<br>Please check the game below, then add your name and e-mail and pay. You are paying for this one game only. Players never pay.`,
      col: `<section class="pk-card"><h2>Your details</h2><p class="pk-sub">The invoice is sent to this e-mail address.</p>
          ${PK.payerFields(S)}
          ${PK.errBox()}${PK.busyBox("Confirming your payment with Razorpay. Please keep this page open.")}
          <button class="pk-btn" id="paygo" type="button" aria-disabled="false">Pay ${esc(TB.money(p.total, cur))} securely with Razorpay</button>
          ${CBConsent.html("K3")}
          <p class="pk-note">Secure payment by Razorpay. Payment to <a href="https://itservices-rajat-agarwal.pages.dev/" rel="noopener" target="_blank">${esc(PK.BRAND.payee)}</a>. An invoice is e-mailed to you. See the <a href="/legal.html#privacy">privacy policy</a>.</p></section>
        ${TB.proformaBox()}${PK.live()}`,
    });
  }
  function draw(focus) { PK.page($app, view(), focus); bind(); if (S.done && TB.invoiceWire) TB.invoiceWire(S.done); else if (TB.proformaWire && S.info && S.info.price && !S.hold) TB.proformaWire(() => call("POST", "/api/proforma", { link: token, currency: (S.info.price.currency || "INR"), name: S.name || "", email: S.email || "", phone: S.phone || "", org: S.org || "", taxId: S.tax || "", country: S.country })); }

  // Razorpay may say the payment is only created for a while: ask this link every 4 seconds, for up to 5 minutes, until the server says paid. Never mark it paid early.
  async function waitForConfirm() {
    const t0 = Date.now();
    while (Date.now() - t0 < 300000) {
      await new Promise((ok) => setTimeout(ok, 4000));
      try { const j = await call("GET", `/api/paylink/${token}`); if (j.status === "paid") return { ok: true }; } catch { /* keep asking */ }
    }
    throw new Error("We are still waiting for Razorpay to confirm your payment. Nothing is lost: the game is marked paid as soon as it is confirmed. You can close this page and open the link again later to see the status.");
  }
  const paidNow = (r) => { S.done = r || { ok: true }; S.busy = false; draft.clear(); draw(true); };
  function bind() {
    const $ = (id) => document.getElementById(id);
    if ($("chkpay")) $("chkpay").onclick = async () => { S.err = ""; S.busy = true; draw(); try { return paidNow(await waitForConfirm()); } catch (e) { S.err = e.message; } S.busy = false; draw(); PK.setError($app, S.err); };
    if ($("payagain")) $("payagain").onclick = () => { S.hold = false; S.err = ""; draw(true); };
    if ($("paygo")) $("paygo").onclick = async () => {
      PK.setError($app, "");
      PK.sync($app, S, KEYS);
      const bad = PK.validate(S);
      if (bad) return PK.setError($app, bad.msg, bad.id);
      TB.payer.save(S);
      const labels = { on: "Confirming your payment…", off: "Pay " + TB.money(S.info.price.total, S.info.price.currency || "INR") + " securely with Razorpay" };
      S.busy = true; PK.busy($app, true, "paygo", labels);
      try {
        const body = Object.assign(PK.payerBody(S), { consent: CBConsent.payload($app, "K3") });
        let r = await call("POST", `/api/paylink/${token}/checkout`, body);
        if (r.mode === "razorpay") r = await TB.pay(r.razorpay, r.paymentId, r.hop); // opens Razorpay Checkout; the SERVER verifies the payment
        else if (r.result) r = r.result; // local test mode answers with the finished order
        if (r && r.confirming) r = await waitForConfirm();
        return paidNow(r);
      } catch (e) {
        if (e && e.maybePaid) { try { return paidNow(await waitForConfirm()); } catch (e2) { S.hold = true; S.busy = false; S.err = e2.message; return draw(true); } } /* money may have left: ask until paid */
        if (e && e.status === 409 && e.body && e.body.status) { try { S.info = await call("GET", `/api/paylink/${token}`); S.busy = false; return draw(true); } catch { /* shown below */ } } // already paid, expired or cancelled meanwhile: show that calm screen
        S.busy = false; PK.busy($app, false, "paygo", labels); PK.setError($app, PK.friendly(e));
      }
    };
    PK.refill($app, S, KEYS); // what was typed always shows in the boxes (the country code too), whatever the browser does with the markup
    PK.markFilled($app);
  }
  (async () => {
    draw();
    if (!token) return;
    try { S.info = await call("GET", `/api/paylink/${token}`); }
    catch (e) { if (e.status === 404) S.gone = true; else S.err = e.message; }
    draw();
  })();
})();
