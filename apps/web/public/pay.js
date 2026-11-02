/* Corporate Bingo: the page where an organizer pays to publish a draft engagement. Opens after they confirm their email and mobile number.
   The organizer key comes from this browser tab (set when the console was opened). The SERVER decides the pack and verifies the payment.
   The look and the behaviour are the shared payment kit (paykit.js), the same in all six games; what was typed is kept for this tab (the draft). */
(function () {
  const TB = window.TB, PK = window.PK, esc = TB.esc, $app = document.getElementById("app");
  const eid = TB.qs("e") || "";
  let secret = ""; try { secret = CTK.get("cbz-org") || ""; } catch {}
  const ss = (k) => { try { return sessionStorage.getItem(k) || ""; } catch { return ""; } };
  const nf = (n) => Number(n).toLocaleString("en-IN");
  const KEYS = ["name", "email", "phone", "pcode", "org", "tax", "country"];
  const draft = PK.draft("pay");
  const S = { credited: 0, info: null, mode: "", cur: "INR", err: "", busy: false, done: null, wait: "", ...(() => { const v = PK.payerState(); return { email: ss("cbz-email") || v.email, phone: ss("cbz-phone") || v.phone, name: ss("cbz-name") || v.name, org: v.org, tax: v.tax, pcode: v.pcode }; })(), country: "IN" }; // India and +91 unless they change them: fewest taps to pay
  PK.persist($app, S, draft, KEYS);
  const curOf = () => (S.country === "IN" ? "INR" : "USD");
  S.cur = curOf();

  const call = async (method, path, body) => {
    const r = await fetch(path, { method, headers: { "content-type": "application/json", "x-organizer": secret }, body: body === undefined ? undefined : JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { const err = Object.assign(new Error(j.error || "Something went wrong. Please try again."), { status: r.status }); if (window.CTG) { CTG.wrap(err, { what: method + " " + path.split("?")[0].replace(/\/[0-9a-f]{16,}/gi, "/...") }); if (method !== "GET") { err.guided = true; CTG.watch(err, { retry: () => call(method, path, body) }); } } throw err; }
    return j;
  };
  const back = () => `<p style="margin:0 0 6px"><a class="pk-link" id="pkback" href="/zc.html?e=${encodeURIComponent(eid)}">← Back to my game</a></p>`;
  const head = (title, lead) => `<h1 class="pk-h1" id="pk-h1" tabindex="-1">${esc(title)}</h1>${lead ? `<p class="pk-lead">${lead}</p>` : ""}`;
  const packFor = (cap) => { const p = TB.PACKS.find((x) => x[0] >= cap); return p ? p[0] : null; };
  const when = (ms) => ms ? `${PK.istDate(ms)}, ${PK.istTime(ms)}` : "";

  /** calm card while a payment may be on its way: no pay form, no second payment */
  const waitCard = () => `${back()}${head("We are checking your payment")}<section class="pk-card" id="paywait" role="status"><p class="pk-sub">${S.busy ? "Please keep this page open. This can take a few minutes." : "A payment for this game is still being confirmed. If money left your account, the game starts as soon as the bank confirms. Please do not pay again."}</p>${PK.errBox()}<button class="pk-btn${S.busy ? " is-busy" : ""}" id="chkpay" type="button"${S.busy ? " disabled" : ""}>${S.busy ? "Checking…" : "Check my payment"}</button>${S.wait === "hold" && !S.busy ? '<p class="pk-note"><button type="button" class="pk-link" id="payagain">No money was taken. Let me pay again.</button></p>' : ""}</section>${PK.live()}`;
  const open = (label) => `<a class="pk-btn" href="/zc.html?e=${encodeURIComponent(label)}">Open my engagement</a>`;

  function view() {
    if (!secret) return `${head("Please sign in first")}<section class="pk-card"><p class="pk-sub">Open your console from the home page, or sign in with your e-mail: we send you a 6-digit code.</p><a class="pk-btn" href="/#login" id="goLogin">Sign in with email</a></section>`;
    if (S.done) {
      const d = S.done, gid = d.eid || eid, pack = d.pack || (S.info && packFor(S.info.cap)) || 0;
      return PK.layout({
        title: "Payment received", step: 3, finished: true,
        aside: PK.summary({ game: { id: gid, name: (S.info && S.info.name) || gid, startMs: S.info && S.info.startMs, participants: pack || null }, price: d.total ? { total: d.total, base: d.total, gst: 0, currency: d.currency || S.cur } : null, paid: true, totalLabel: "Paid" }) + PK.trust(),
        col: PK.receipt(d, {
          title: "Payment received. Your engagement will begin on time.", email: S.email, forHtml: `Game ID <span class="pk-mono">${esc(gid)}</span>`,
          lead: `${d.paidFromCredit ? "Paid from your credit. " : ""}Thank you. Your engagement for up to <b>${nf(pack)}</b> participants is confirmed.${d.restartedAtMs ? ` It begins at <b>${esc(new Date(d.restartedAtMs).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }))}</b>, for everyone already waiting.` : " Share the link with your participants from your console if you have not already."}`,
          after: `${d.invoiceUrl ? '<p class="pk-note">We also emailed it to you and to the organizer.</p>' : ""}<div class="pk-btns">${open(gid)}</div>`,
        }),
      });
    }
    if (!S.info) return `${back()}${S.err ? head("We could not open this engagement", esc(S.err)) : PK.layout({ title: "Publish your game", lead: "Loading the game details…", wait: 1, step: 1, aside: PK.summarySkeleton(), col: '<section class="pk-card" aria-busy="true"><div class="pk-skel l1"></div><div class="pk-skel l2"></div><div class="pk-skel l3"></div></section>' })}`;
    if (S.wait) return waitCard();
    const pack = packFor(S.info.cap);
    if (!S.info.draft && !S.info.unpaid) return `${back()}${head("This engagement is already paid and published")}<section class="pk-card pk-single"><a class="pk-btn" href="/zc.html?e=${encodeURIComponent(eid)}">Open my engagement</a></section>`;
    if (!pack) return `${back()}${head("A custom arrangement is needed", "An engagement for more than 10,000 participants is arranged with us directly. Please write to us from the contact page.")}`;
    const x = TB.price(pack, S.cur);
    const applied = S.cur === "INR" ? Math.max(Number(S.credited) || 0, Number(S.info.creditApplied) || 0) : 0; // credit already put on this game (by you, or by a Host); it comes off what you pay
    const toPay = Math.max(0, Math.round((x.total - applied) * 100) / 100);
    const avail = S.cur === "INR" && !applied && Number(S.info.credit) > 0 ? Number(S.info.credit) : 0;
    const until = S.info.creditExpiresMs ? new Date(S.info.creditExpiresMs - 1).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" }) : "";
    const off = S.mode === "off", due = applied ? toPay : x.total;
    const starts = S.info.startMs ? when(S.info.startMs) : "";
    const pending = S.info.startMs ? `<p class="pk-note"><b>Payment pending.</b> The game does not begin until it is paid for. Starts ${esc(starts)}. You can pay at any time until the guest data is auto-deleted${S.info.erasureMs ? ` (${esc(when(S.info.erasureMs))})` : ""}.${S.info.locked ? " It is waiting for your payment now: pay and it starts 2 minutes after your payment is confirmed." : " If you pay after the start time, it starts 2 minutes after your payment is confirmed."}</p>` : "";
    return `${back()}${PK.layout({
      title: "Publish your game", step: S.busy ? 2 : 1,
      lead: `Payment is for Game ID <b class="pk-mono">${esc(eid)}</b>; Amount <b>${esc(TB.money(due, S.cur))}</b>;`,
      aside: PK.summary({ game: { id: eid, name: S.info.name || eid, startMs: S.info.startMs, participants: pack }, price: { total: due, base: x.base, gst: x.tax, currency: S.cur }, listTotal: applied ? x.total : null, creditUsed: applied || 0, totalLabel: applied ? "To pay now" : "Total to pay" }) + PK.trust(),
      col: `${off ? '<div class="pk-msg info" role="status">' + PK.icons.info + '<span><b>Online payment opens soon.</b> Your engagement is saved and nothing is lost. Come back to this page when payment is switched on. Until then it stays held at its start time.</span></div>' : ""}
        <section class="pk-card"><h2>About this payment</h2><p class="pk-sub">Every participant gets their own ticket on their phone. Participants never pay: you give the rewards. A paid game cancelled before it starts stays with you as credit for your next game, valid for 365 days. Unused credit lapses at the end of day 365. The credit belongs to your organizer account.</p>${pending}</section>
        ${avail ? `<section class="pk-card done"><h2>Use your credit</h2><p class="pk-sub">You have credit of <b>${esc(TB.money(avail, "INR"))}</b>${until ? ` (valid until ${esc(until)})` : ""}. Use it for this game.</p>${S.err && S.creditErr ? `<div class="pk-msg bad" role="alert">${PK.icons.alert}<span>${esc(S.err)}</span></div>` : ""}<button class="pk-btn" id="usecredit" type="button" ${S.busy ? "disabled" : ""}>Use my credit</button></section>` : ""}
        ${TB.proformaBox()}
        <section class="pk-card"><h2>Details</h2><p class="pk-sub">The invoice is emailed to this address.</p>
          ${PK.payerFields(S, { country: true, countryLabel: "Country of your organization", openMore: true })}
          ${PK.errBox()}${PK.busyBox("Confirming your payment with Razorpay. Please keep this page open. Your game starts only after Razorpay confirms.")}
          <button class="pk-btn" id="paygo" type="button" ${off || S.busy ? 'disabled aria-disabled="true"' : 'aria-disabled="false"'}>${off ? "Payment opens soon" : "Pay " + esc(TB.money(due, S.cur)) + " securely with Razorpay"}</button>
          ${CBConsent.html("K3")}
          <p class="pk-note">Secure payment by Razorpay. Payment to <a href="https://itservices-rajat-agarwal.pages.dev/" rel="noopener" target="_blank">${esc(PK.BRAND.payee)}</a>. An invoice is emailed to you. See the <a href="/legal.html#privacy">privacy policy</a>.</p></section>${PK.live()}`,
    })}`;
  }
  // The server answers 202 {confirming:true} while Razorpay still says the payment is only created or authorized. We ask every 4 seconds, for up to 5 minutes, until the game itself says Paid.
  async function waitForConfirm() {
    const t0 = Date.now();
    while (Date.now() - t0 < 300000) {
      await new Promise((ok) => setTimeout(ok, 4000));
      let st = null;
      try { st = (await call("GET", `/api/z/${eid}/summary`)).payment; } catch { try { st = (await call("GET", `/api/z/${eid}/cohost`)).payment; } catch { /* keep asking */ } }
      if (st && st.status === "paid") return { ok: true, eid, pack: (S.info && packFor(S.info.cap)) || 0, total: 0, currency: S.cur };
    }
    throw new Error("We are still waiting for Razorpay to confirm your payment. Nothing is lost: your game starts as soon as it is confirmed. You can close this page and open your game to see the status.");
  }
  function draw(focus) { PK.page($app, view(), focus); bind(); if (S.done && TB.invoiceWire) TB.invoiceWire(S.done); else if (TB.proformaWire && S.info && !S.wait) TB.proformaWire(() => call("POST", "/api/proforma", { eid, currency: S.cur, name: S.name || "", email: S.email || "", phone: S.phone || "", org: S.org || "", taxId: S.tax || "", country: S.country })); }

  function bind() {
    const $ = (id) => document.getElementById(id);
    if ($("cty")) $("cty").onchange = () => { PK.sync($app, S, KEYS); S.country = $("cty").value; S.cur = curOf(); draw(); };
    if ($("goLogin")) $("goLogin").onclick = () => { try { sessionStorage.setItem("cbz-next", "/pay.html?e=" + encodeURIComponent(eid)); } catch {} };
    if ($("chkpay")) $("chkpay").onclick = async () => { S.err = ""; S.busy = true; draw(); try { S.done = await waitForConfirm(); } catch (e) { S.err = e.message; } S.busy = false; draw(!!S.done); if (S.err && !S.done) PK.setError($app, S.err); };
    if ($("payagain")) $("payagain").onclick = () => { S.wait = ""; S.err = ""; draw(true); };
    if ($("usecredit")) $("usecredit").onclick = async () => {
      S.err = ""; S.creditErr = false; S.busy = true; draw();
      try {
        const r = await call("POST", `/api/z/${encodeURIComponent(eid)}/pay-with-credit`, {});
        S.credited = r.usedInr || 0;
        if (r.paid) S.done = { ok: true, eid, pack: packFor(S.info.cap) || 0, paidFromCredit: true, restartedAtMs: r.restartedAtMs || null };
        else S.info.creditApplied = r.usedInr; // the rest is paid below, in the usual way, for the same game
      } catch (e) { S.err = e.message; S.creditErr = true; }
      S.busy = false; draw(!!S.done);
    };
    if ($("paygo")) $("paygo").onclick = async () => {
      PK.setError($app, "");
      PK.sync($app, S, KEYS);
      const bad = PK.validate(S);
      if (bad) return PK.setError($app, bad.msg, bad.id);
      TB.payer.save(S);
      const due = $("paygo").textContent;
      S.busy = true; PK.busy($app, true, "paygo", { on: "Confirming your payment…", off: due });
      try {
        let ref = ""; try { const v = JSON.parse(localStorage.getItem("cbz-ref") || "null"); if (v && Date.now() - v.at < 30 * 86400000) ref = v.code; } catch {}
        const b = PK.payerBody(S);
        let r = await call("POST", "/api/checkout", { consent: CBConsent.payload($app, "K3"), eid, name: b.name, org: b.org || "", email: b.email, country: S.country, taxId: b.taxId || "", currency: S.cur, phone: S.phone, phoneCode: S.pcode, ref });
        if (r.mode === "razorpay") r = await TB.pay(r.razorpay, r.paymentId, r.hop); // opens Razorpay Checkout; the server verifies the payment
        else if (r.result) r = r.result; // local test mode answers with the finished order
        try { CTK.set("cbz-email", b.email); sessionStorage.setItem("cbz-name", b.name); } catch {}
        if (r && r.confirming) r = await waitForConfirm(); // Razorpay has not confirmed yet: keep asking, never mark it paid early
        S.done = r; S.busy = false; draw(true);
      } catch (e) {
        S.busy = false; PK.busy($app, false, "paygo", { on: "", off: due });
        PK.setError($app, e.cancelled ? PK.friendly(e) : PK.friendly(e));
      }
    };
    PK.refill($app, S, KEYS); // what was typed always shows in the boxes (the country code too), whatever the browser does with the markup
    PK.markFilled($app);
  }

  (async () => {
    if (!secret) return draw();
    draw();
    if (!eid) { S.err = "No engagement was chosen."; return draw(); }
    try {
      const st = await fetch("/api/payments/status").then((r) => r.json()); S.mode = st.mode;
      const h = await call("GET", `/api/z/${eid}/cohost`); S.wait = (h.payment && (h.payment.status || h.payment)) === "confirming" ? "load" : ""; // only the Organizer, a Host or a Co-host of THIS game's account passes; anyone else gets a 403 and a calm message
      try { S.info = await call("GET", `/api/z/${eid}/info`); }
      catch (e0) { // a Co-host may pay but cannot read the game: use the small game header they are allowed
        if (e0.status !== 403) throw e0;
        S.info = { cap: h.cap, startMs: h.startMs, draft: !h.inviteLink, unpaid: !h.payment || h.payment.status !== "paid", credit: h.credit, creditExpiresMs: h.creditExpiresMs, creditApplied: h.creditApplied, erasureMs: h.erasureMs };
      }
    } catch (e) { S.err = e.status === 403 || e.status === 404 ? "We could not open this engagement with your sign-in. Open it from your console." : e.message; }
    draw();
  })();
})();
