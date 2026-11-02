/* Corporate Bingo: Payment testing. A real payment of ₹ 1 (India) or US$ 1 (abroad) that buys nothing, so the owner can see that paying and the invoice work. Any number of times.
   Owner only: the owner key opens it. The look and the behaviour are the shared payment kit (paykit.js), the same in all six games.
   Everything typed stays: it is kept for this tab as it is typed (paykit.js draft) and put back after a wrong key, a failed or closed Razorpay window, or a reload. */
(function () {
  const TB = window.TB, PK = window.PK, F = window.PAYFIELDS, esc = TB.esc, $app = document.getElementById("app");
  const KEYS = ["key", "gameId", "name", "email", "phone", "pcode", "org", "tax", "country"];
  const draft = PK.draft("paytest");
  const S = { key: "", keyOk: null, gameId: "", game: null, country: "IN", err: "", busy: false, done: null, ...PK.payerState() };
  PK.persist($app, S, draft, KEYS);
  const GAME_ID = /^[A-Za-z0-9_-]{4,40}$/;
  const cur = () => (S.country === "IN" ? "INR" : "USD");
  const label = () => "Pay " + TB.money(1, cur()) + " (test)";
  let seq = 0, timer = 0;

  const asideHtml = () => PK.summary({
    game: S.game, test: true, paid: !!S.done, price: { total: 1, base: 1, gst: 0, currency: cur() }, priceLabel: "Payment test (nothing is bought)", totalLabel: S.done ? "Paid" : "Total to pay",
    emptyTitle: "Payment test (no game)", emptyText: "Nothing is bought. A receipt numbered PAYTEST is sent to the e-mail you give.",
  }) + PK.trust();

  function formHtml() {
    return `<section class="pk-card"><h2>Owner key</h2><p class="pk-sub">Only the owner's key opens this page.</p>${PK.keyBox(S)}</section>
      <section class="pk-card"><h2>Game <span class="opt">(optional)</span></h2><p class="pk-sub">Type a game ID to see its details beside this form, or leave it empty to test without a game.</p>
        <div class="pk-f"><label for="gid">Game ID</label><input class="pk-in pk-mono" id="gid" data-f="gameId" value="${esc(S.gameId)}" autocomplete="off" autocapitalize="off" spellcheck="false" maxlength="40" placeholder="For example ACME-DIWALI" aria-describedby="gid-s"><p class="pk-keystat" id="gid-s" role="status"></p></div></section>
      <section class="pk-card"><h2>Your details</h2><p class="pk-sub">The receipt and the invoice are sent here.</p>
        ${PK.payerFields(S, { country: true })}
        ${PK.errBox()}${PK.busyBox("Confirming your payment with Razorpay. Please keep this page open.")}
        <button class="pk-btn" id="go" type="button" aria-disabled="false">${label()}</button>
        ${CBConsent.html("K3")}
        <p class="pk-note">Secure payment by Razorpay to ${esc(PK.BRAND.payee)}. Billing data is kept for audit and tax reasons. A test payment is only for trying the payment, and stays as that record.</p></section>${PK.live()}`;
  }
  function doneHtml() {
    const d = S.done, g = S.game;
    return PK.layout({
      title: "Payment received", tag: "Test", step: 3, finished: true, formFirst: true, aside: asideHtml(),
      col: PK.receipt(d, {
        title: "Payment received. The test worked.", lead: `You paid <b>${esc(TB.money(d.total, d.currency))}</b>. Nothing was bought and nothing else will happen. We also e-mailed it to you.`,
        forLabel: g ? `${g.name} (game ID ${g.id}), payment test` : "Payment test (no game)", email: S.email,
        after: '<div class="pk-btns"><button class="pk-btn" id="again" type="button">Test again</button></div>',
      }),
    });
  }
  function view() {
    if (S.done) return doneHtml();
    return PK.layout({
      title: "Payment test", tag: "Owner only", step: 1, formFirst: true, aside: asideHtml(), col: formHtml(),
      lead: `A real payment of <b>${esc(TB.money(1, cur()))}</b> (₹ 1 in India, US$ 1 abroad) that buys nothing, so you can see that paying and the invoice work. It is recorded as a payment test, so this site, the central record and Razorpay can be matched.`,
    });
  }
  const draw = (focus) => { PK.page($app, view(), focus); bind(); if (S.done && TB.invoiceWire) TB.invoiceWire(S.done); };
  const aside = () => { const a = $app.querySelector(".pk-aside"); if (a) a.innerHTML = asideHtml(); };
  const gstat = (kind, text) => { const e = $app.querySelector("#gid-s"); if (e) { e.className = "pk-keystat" + (kind ? " " + kind : ""); e.textContent = text ? (kind === "ok" ? "✓ " : "") + text : ""; } };

  /** Looks the typed game ID up (owner key needed). Returns the game or null; says what happened under the box. */
  async function lookup() {
    PK.sync($app, S, ["gameId", "key"]);
    const id = (S.gameId || "").trim(), mine = ++seq;
    S.game = null; S.gameErr = "";
    if (!id) { gstat("", ""); aside(); return null; }
    if (!GAME_ID.test(id)) { S.gameErr = "A game ID has 4 to 40 letters, digits, - or _."; gstat("bad", S.gameErr); aside(); return null; }
    const key = PK.cleanKey(S.key);
    if (!key) { gstat("", "Paste the owner key above, and the game's details appear here."); aside(); return null; }
    gstat("", "Looking for the game…");
    try {
      const r = await TB.api("GET", "/api/payments/paytest/game/" + encodeURIComponent(id), undefined, { key });
      if (mine !== seq) return null;
      S.game = r.game; S.keyOk = true; gstat("ok", "Game found: " + r.game.name); aside(); return S.game;
    } catch (e) {
      if (mine !== seq) return null;
      if (e.status === 404 && !e.code) { S.keyOk = false; S.gameErr = "This key does not match. Please paste it again."; PK.setKeyStatus($app, "bad", S.gameErr); }
      else S.gameErr = e.code === "no-game" ? e.message : PK.friendly(e);
      gstat("bad", S.gameErr); aside(); return null;
    }
  }
  const later = () => { clearTimeout(timer); timer = setTimeout(lookup, 600); };

  async function waitForConfirm(paymentId) {
    const t0 = Date.now();
    while (Date.now() - t0 < 300000) {
      await new Promise((ok) => setTimeout(ok, 4000));
      try { const r = await TB.api("GET", "/api/payments/paytest/" + paymentId, undefined, { key: PK.cleanKey(S.key) }); if (r && !r.confirming) return r; } catch (e) { if (e.status && e.status < 500) throw e; }
    }
    throw new Error("Razorpay has not confirmed yet. If money was taken, your invoice will be e-mailed to you once it is.");
  }
  async function pay() {
    PK.setError($app, "");
    PK.sync($app, S, KEYS);
    S.key = PK.cleanKey(S.key);
    const bad = PK.validate(S, { key: true });
    if (bad) return PK.setError($app, bad.msg, bad.id);
    if ((S.gameId || "").trim() && (!S.game || S.game.id !== S.gameId.trim())) {
      await lookup();
      if (!S.game) return PK.setError($app, S.gameErr || "Please check the game ID, or empty the box to test without a game.", "gid");
    }
    TB.payer.save(S); // name, e-mail and so on are remembered in this browser; the owner key never is
    S.busy = true; PK.busy($app, true, "go", { on: "Confirming your payment…", off: label() });
    let pid = "";
    try {
      const body = Object.assign(PK.payerBody(S), { consent: CBConsent.payload($app, "K3") });
      if ((S.gameId || "").trim()) body[F.gameId] = S.gameId.trim();
      const r = await TB.api("POST", "/api/payments/paytest", body, { key: S.key });
      pid = r.paymentId;
      let res = await TB.pay(r.razorpay, r.paymentId, r.hop); // opens Razorpay Checkout; the server verifies the payment
      if (res && res.confirming) res = await waitForConfirm(r.paymentId);
      S.done = res; S.busy = false; draw(true); return;
    } catch (e) {
      if (e && e.maybePaid && pid) { try { S.done = await waitForConfirm(pid); S.busy = false; draw(true); return; } catch (e2) { e = e2; } }
      S.busy = false;
      PK.busy($app, false, "go", { on: "", off: label() });
      if (e && e.status === 404 && !e.code) { S.keyOk = false; PK.setKeyStatus($app, "bad", "This key does not match. Please paste it again."); PK.setError($app, "This key does not match. Please paste it again. What you typed is kept.", "okey"); }
      else PK.setError($app, PK.friendly(e));
    }
  }
  function bind() {
    const $ = (id) => document.getElementById(id);
    if ($("go")) $("go").onclick = pay;
    if ($("again")) $("again").onclick = () => { S.done = null; S.err = ""; draw(true); if (S.gameId && S.key) lookup(); };
    if ($("cty")) $("cty").addEventListener("change", () => { const g = $("go"); if (g && !S.busy) g.textContent = label(); aside(); });
    if ($("gid")) { $("gid").addEventListener("input", later); $("gid").addEventListener("blur", () => { clearTimeout(timer); lookup(); }); }
    PK.wireKey($app, S, (ok) => { if (ok) { PK.setError($app, ""); if (S.gameId) lookup(); } });
    PK.refill($app, S, KEYS); // what was typed always shows in the boxes (the country code too), whatever the browser does with the markup
    PK.markFilled($app);
  }
  draw();
  if (S.key && S.gameId) lookup(); // a reload: show the game again
})();
