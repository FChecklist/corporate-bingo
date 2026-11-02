/* The payment kit: ONE set of parts for the three payment pages (paytest, paylink, pay), the same in all six games. Vanilla JS, no build. Loads after common.js and payfields.js.
   What it gives the pages: the three-step bar, the order summary (game name, game ID, participants, date and start time in India time, the organizer, the price), the trust marks,
   the fields, the owner-key box (show / hide, trimmed, "Check key"), the receipt, the proforma fold, friendly error words, and the DRAFT: everything typed is kept for this browser tab
   (sessionStorage, gone when the tab closes; the owner key too, never localStorage, never in an address) and put back after a wrong key, a closed or failed Razorpay window, a reload or an
   automatic page update. The per-game words are the BRAND lines below: the only lines that differ between the six games. */
(function () {
  const TB = window.TB, esc = TB.esc, F = window.PAYFIELDS || {};
  const PK = (window.PK = {});
  PK.BRAND = { name: "Corporate Bingo", kind: "closed-group bingo software", payee: "IT Services by Rajat Agarwal", payeeCaps: "IT SERVICES BY RAJAT AGARWAL" };
  const nf = (n) => Number(n).toLocaleString("en-IN");
  const money = (n, cur) => TB.money(n, cur || "INR");

  const svg = (d, extra) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"${extra || ""}>${d}</svg>`;
  const I = PK.icons = {
    lock: svg('<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>'),
    shield: svg('<path d="M12 3l8 3v6c0 4.5-3.2 8-8 9-4.8-1-8-4.5-8-9V6z"/><path d="M8.5 12l2.5 2.5L15.5 10"/>'),
    card: svg('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18"/><path d="M7 15h4"/>'),
    receipt: svg('<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>'),
    check: svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
    eye: svg('<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
    eyeoff: svg('<path d="M3 3l18 18"/><path d="M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.2M6.6 6.6C3.9 8.3 2 12 2 12s3.5 7 10 7c1.5 0 2.9-.4 4.1-.9"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>'),
    alert: svg('<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18h.01"/>'),
    info: svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5h.01"/>'),
  };

  // ---- India time (the games run on India time; the page says so) ----
  const parts = (ms, o) => { const r = {}; for (const p of new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", ...o }).formatToParts(new Date(ms))) r[p.type] = p.value; return r; };
  PK.istDate = (ms) => { const p = parts(ms, { weekday: "short", day: "numeric", month: "short", year: "numeric" }); return `${p.weekday}, ${p.day} ${p.month} ${p.year}`; };
  PK.istTime = (ms) => { const p = parts(ms, { hour: "numeric", minute: "2-digit", hour12: true }); return `${p.hour}:${p.minute} ${String(p.dayPeriod || "").toUpperCase()} IST`; };
  /** j***@company.com (the Worker already sends it masked; this is for anything typed on the page) */
  PK.maskEmail = (e) => { const s = String(e || "").trim(), at = s.lastIndexOf("@"); return at < 1 || at === s.length - 1 ? "" : Array.from(s)[0] + "***" + s.slice(at); };

  // ---- page parts ----
  PK.steps = (n, finished) => {
    const li = ["Details", "Pay", "Receipt"].map((t, i) => {
      const done = finished || i + 1 < n, now = !finished && i + 1 === n;
      return `<li class="${done ? "is-done" : now ? "is-now" : ""}"${now ? ' aria-current="step"' : ""}><span class="n" aria-hidden="true">${done ? I.check : i + 1}</span>${t}${done ? '<span class="pk-sr"> (done)</span>' : ""}</li>`;
    }).join("");
    return `<ol class="pk-steps" aria-label="Progress">${li}</ol>`;
  };
  /** title, optional tag, lead; the steps; then the form column and the aside (summary). DOM order = reading order: the summary comes first unless formFirst. */
  PK.layout = (o) => `<h1 class="pk-h1" id="pk-h1" tabindex="-1">${esc(o.title)}${o.tag ? `<span class="pk-tag">${esc(o.tag)}</span>` : ""}</h1>${o.lead ? `<p class="pk-lead${o.wait ? " w" + o.wait : ""}">${o.lead}</p>` : ""}${PK.steps(o.step, o.finished)}
    <div class="pk-grid${o.formFirst ? " ff" : ""}${o.wait ? " ld" : ""}">${o.formFirst ? `<div class="pk-col">${o.col}</div><div class="pk-aside">${o.aside}</div>` : `<div class="pk-aside">${o.aside}</div><div class="pk-col">${o.col}</div>`}</div>`;
  PK.row = (label, valueHtml, cls) => `<dt>${esc(label)}</dt><dd${cls ? ` class="${cls}"` : ""}>${valueHtml}</dd>`;

  /** The order summary. o.game = {id, name, startMs, participants, organizer:{name, email}} or null; o.price = {total, base, gst, currency}; o.test / o.paid add a badge. */
  PK.summary = (o) => {
    const g = o.game, p = o.price, cur = (p && p.currency) || "INR", B = PK.BRAND;
    const badge = o.paid ? '<span class="pk-badge paid">Paid</span>' : o.test ? '<span class="pk-badge test">Test</span>' : "";
    let body;
    if (g) {
      const r = [];
      if (g.id) r.push(PK.row("Game ID", esc(g.id), "mono"));
      if (g.participants) r.push(PK.row("Participants", "Up to " + esc(nf(g.participants))));
      if (g.startMs) { r.push(PK.row("Game date", esc(PK.istDate(g.startMs)))); r.push(PK.row("Start time", esc(PK.istTime(g.startMs)))); }
      if (g.organizer && g.organizer.name) r.push(PK.row("Organizer", esc(g.organizer.name)));
      if (g.organizer && g.organizer.email) r.push(PK.row("Organizer e-mail", esc(g.organizer.email)));
      body = `<p class="pk-gname">${esc(g.name || g.id || "Your game")}</p><dl class="pk-dl">${r.join("")}</dl>`;
    } else body = `<p class="pk-gname">${esc(o.emptyTitle || "Your game")}</p>${o.emptyText ? `<p class="pk-empty">${esc(o.emptyText)}</p>` : ""}`;
    let price = "";
    if (p) {
      const label = o.priceLabel || (g && g.participants ? `Game pack, up to ${nf(g.participants)} participants` : "Amount");
      const rows = [], list = o.listTotal != null ? o.listTotal : p.total;
      if (cur === "INR" && Number(p.gst) > 0 && o.listTotal == null) rows.push(`<div class="r"><span>${esc(label)} (before GST)</span><span>${money(p.base, cur)}</span></div><div class="r"><span>GST</span><span>${money(p.gst, cur)}</span></div>`);
      else if (o.priceLabel || (g && g.participants)) rows.push(`<div class="r"><span>${esc(label)}</span><span>${money(list, cur)}</span></div>`);
      if (o.creditUsed) rows.push(`<div class="r"><span>Your credit used</span><span>- ${money(o.creditUsed, cur)}</span></div>`);
      rows.push(`<div class="r t"><span>${esc(o.totalLabel || "Total to pay")}</span><span>${money(p.total, cur)}</span></div>`);
      price = `<div class="pk-price">${rows.join("")}</div>${cur === "INR" ? "" : '<p class="pk-note">No tax added. Billed in US dollars.</p>'}`;
    }
    return `<section class="pk-card" aria-labelledby="pk-sum-h"><div class="pk-sum-top"><h2 class="pk-kicker" id="pk-sum-h">Order summary</h2>${badge}</div>${body}${price}
      <p class="pk-owner">Software owned and made by<b>${esc(B.payeeCaps)}</b>Your payment is made to ${esc(B.payee)}.</p></section>`;
  };
  /** The same game block, as the loading frame: same size, so nothing jumps when the real answer comes. */
  PK.summarySkeleton = () => '<section class="pk-card" aria-busy="true" aria-label="Loading the game details"><div class="pk-sum-top"><p class="pk-kicker">Order summary</p></div><div class="pk-skel l1"></div><div class="pk-skel l2"></div><div class="pk-skel l2"></div><div class="pk-skel l2"></div><div class="pk-skel l3"></div></section>';
  PK.trust = () => `<section class="pk-card pk-trustcard" aria-label="Why this payment is safe"><ul class="pk-trust">
    <li>${I.lock}<div><b>Secure payment by Razorpay</b><span>Your card, UPI or bank details go to Razorpay only.</span></div></li>
    <li>${I.shield}<div><b>RBI-regulated payment gateway</b><span>Trusted by businesses across the world.</span></div></li>
    <li>${I.card}<div><b>Your card and UPI details are never seen by us</b><span>${esc(PK.BRAND.name)} never sees or stores them.</span></div></li>
    <li>${I.receipt}<div><b>Tax invoice by e-mail</b><span>Sent to you as soon as the payment is confirmed.</span></div></li></ul>
    <p class="pk-fine">All data is handled as required by India's DPDP Act, US privacy laws and the EU GDPR.</p></section>`;

  // ---- fields ----
  /** o: id, f (the state name), label, type, value, auto, opt, hint, ph, max, cls, mode */
  PK.field = (o) => `<div class="pk-f"><label for="${o.id}">${esc(o.label)}${o.opt ? ' <span class="opt">(optional)</span>' : ""}</label><input class="pk-in${o.cls ? " " + o.cls : ""}" id="${o.id}" data-f="${o.f}" type="${o.type || "text"}" value="${esc(o.value || "")}"${o.auto ? ` autocomplete="${o.auto}"` : ""}${o.ph ? ` placeholder="${esc(o.ph)}"` : ""}${o.max ? ` maxlength="${o.max}"` : ""}${o.mode ? ` inputmode="${o.mode}"` : ""} aria-describedby="${o.id}-h ${o.id}-e"><p class="pk-hint" id="${o.id}-h"${o.hint ? "" : " hidden"}>${o.hint ? esc(o.hint) : ""}</p><p class="pk-ferr" id="${o.id}-e" hidden></p></div>`;
  PK.phoneRow = (S) => `<div class="pk-f"><label for="ph">Mobile <span class="opt">(optional)</span></label><div class="pk-row"><select class="pk-sel" id="pcode" data-f="pcode" aria-label="Country code">${TB.COUNTRIES.map(([c, n, d]) => `<option value="${d}"${String(d) === String(S.pcode) ? " selected" : ""}>${c} +${d}</option>`).join("")}</select><input class="pk-in" id="ph" data-f="phone" type="tel" inputmode="tel" autocomplete="tel-national" value="${esc(S.phone || "")}" placeholder="Mobile number" aria-describedby="ph-e"></div><p class="pk-ferr" id="ph-e" hidden></p></div>`;
  /** name and e-mail, then (folded, opened when something is in them) mobile, company and GST number, then the country when o.country */
  PK.payerFields = (S, o) => {
    o = o || {};
    const open = S.phone || S.org || S.tax || o.openMore;
    return PK.field({ id: "nm", f: "name", label: "Your name", auto: "name", value: S.name, ph: "Full name" })
      + PK.field({ id: "em", f: "email", label: "E-mail (the invoice comes here)", type: "email", auto: "email", value: S.email, ph: "name@company.com", mode: "email" })
      + `<details class="pk-more"${open ? " open" : ""}><summary>Mobile, company name and GST number (optional)</summary><div>`
      + PK.phoneRow(S)
      + PK.field({ id: "org", f: "org", label: "Company name", opt: true, auto: "organization", value: S.org, ph: "Company name" })
      + PK.field({ id: "tax", f: "tax", label: "GST / Tax number", opt: true, value: S.tax, max: 30, cls: "pk-up", ph: "For example 27ABCDE1234F1Z5" })
      + "</div></details>"
      + (o.country ? `<div class="pk-f"><label for="cty">${esc(o.countryLabel || "Your country")}</label><select class="pk-sel" id="cty" data-f="country">${TB.countryOpts(S.country)}</select></div>` : "");
  };
  PK.errBox = () => `<div class="pk-msg bad" id="pk-err" role="alert" hidden>${I.alert}<span></span></div>`;
  PK.busyBox = (text) => `<div class="pk-msg info" id="pk-busy" role="status" hidden>${I.info}<span>${esc(text)}</span></div>`;
  PK.live = () => '<div id="pk-live" class="pk-sr" role="status" aria-live="polite"></div>';

  /** The first thing wrong with the typed details: {id, msg} or null. o.key / o.gstOnly are set by the page. */
  PK.validate = (S, o) => {
    o = o || {};
    if (o.key) { const m = PK.keyProblem(PK.cleanKey(S.key)); if (m) return { id: "okey", msg: m }; }
    if ((S.name || "").trim().length < 2) return { id: "nm", msg: "Please enter your name." };
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test((S.email || "").trim())) return { id: "em", msg: "Please enter a valid e-mail address, like name@company.com." };
    const tax = (S.tax || "").trim().toUpperCase();
    if ((S.country || "IN") === "IN" && tax && !/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(tax)) return { id: "tax", msg: "Please enter a valid 15-character GSTIN, like 27ABCDE1234F1Z5." };
    return null;
  };
  PK.clearErrors = (root) => {
    const b = root.querySelector("#pk-err"); if (b) { b.hidden = true; b.querySelector("span").textContent = ""; }
    root.querySelectorAll("[aria-invalid]").forEach((e) => e.removeAttribute("aria-invalid"));
    root.querySelectorAll(".pk-ferr").forEach((e) => { e.hidden = true; e.textContent = ""; });
  };
  /** Shows one message in the alert box; with a field id it also marks that field and moves the cursor there. */
  PK.setError = (root, msg, fieldId) => {
    PK.clearErrors(root);
    const b = root.querySelector("#pk-err"); if (b) { b.querySelector("span").textContent = msg; b.hidden = !msg; }
    if (!msg || !fieldId) return;
    const f = root.querySelector("#" + fieldId), e = root.querySelector("#" + fieldId + "-e");
    if (f) { f.setAttribute("aria-invalid", "true"); try { f.focus(); } catch (x) { /* fine */ } }
    if (e) { e.textContent = msg; e.hidden = false; }
  };
  PK.say = (root, text) => { const l = root.querySelector("#pk-live"); if (l) l.textContent = text || ""; };
  PK.busy = (root, on, btnId, labels) => {
    const b = root.querySelector("#" + btnId), box = root.querySelector("#pk-busy");
    if (b) { b.disabled = !!on; b.setAttribute("aria-disabled", on ? "true" : "false"); b.classList.toggle("is-busy", !!on); b.textContent = on ? labels.on : labels.off; }
    if (box) box.hidden = !on;
    PK.say(root, on ? labels.on : "");
  };
  /** words for what went wrong; the typed details are always kept, and the message says so */
  PK.friendly = (e) => {
    if (e && e.cancelled) return "The payment window was closed, so nothing was charged. What you typed is kept: press the button to try again.";
    if (e && e.status === 0) return "We could not reach the service. Please check your internet connection and try again. What you typed is kept.";
    if (e && e.status === 429) return "That was a few too many tries. Please wait a little and try again. What you typed is kept.";
    const m = String((e && e.message) || "").trim() || "Something went wrong.";
    return m + " What you typed is kept.";
  };

  // ---- the owner key ----
  PK.cleanKey = (s) => String(s || "").replace(/^[\s​-‍⁠﻿]+|[\s​-‍⁠﻿]+$/g, "");
  PK.keyProblem = (k) => !k ? "Please paste the owner key." : /[^\x20-\x7e]/.test(k) ? "This key has a character that cannot be sent (for example a curly quote). Please paste it again." : "";
  PK.keyBox = (S) => `<div class="pk-f"><label for="okey">Owner key</label><div class="pk-row"><div class="pk-keywrap"><input class="pk-in" id="okey" data-f="key" type="password" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" value="${esc(S.key || "")}" placeholder="Paste the owner key" aria-describedby="okey-h okey-s okey-e"><button type="button" class="pk-eye" id="okeyeye" aria-label="Show the key" aria-pressed="false">${I.eye}</button></div><button type="button" class="pk-btn alt sm" id="okeychk">Check key</button></div><p class="pk-hint" id="okey-h">Pasting is fine: spaces before or after the key are removed.</p><p class="pk-keystat" id="okey-s" role="status"></p><p class="pk-ferr" id="okey-e" hidden></p></div>`;
  /** Asks the real server whether the key opens the payment test (no payment, nothing written). {ok} or {ok:false, status, message}. */
  PK.checkKey = async (key) => {
    const bad = PK.keyProblem(key); if (bad) return { ok: false, status: -1, message: bad };
    try { await TB.api("GET", "/api/payments/paytest/key", undefined, { key }); return { ok: true }; }
    catch (e) { return { ok: false, status: e.status, message: e.status === 404 ? "This key does not match. Please paste it again." : e.status === 0 ? e.message : "The key could not be checked just now. Please try again." }; }
  };
  PK.setKeyStatus = (root, kind, text) => { const s = root.querySelector("#okey-s"); if (!s) return; s.className = "pk-keystat" + (kind ? " " + kind : ""); s.textContent = text ? (kind === "ok" ? "✓ " : "") + text : ""; };
  /** show / hide, trim on paste and on leaving the box, the Check key button. onResult(ok) is told the answer. */
  PK.wireKey = (root, S, onResult) => {
    const inp = root.querySelector("#okey"), eye = root.querySelector("#okeyeye"), chk = root.querySelector("#okeychk"); if (!inp) return;
    const trim = () => { const c = PK.cleanKey(inp.value); if (c !== inp.value) inp.value = c; S.key = c; };
    inp.addEventListener("paste", () => setTimeout(() => { trim(); inp.dispatchEvent(new Event("input", { bubbles: true })); }, 0));
    inp.addEventListener("blur", trim);
    inp.addEventListener("input", () => { S.keyOk = null; PK.setKeyStatus(root, "", ""); });
    if (eye) eye.addEventListener("click", () => { const show = inp.type === "password"; inp.type = show ? "text" : "password"; eye.setAttribute("aria-pressed", show ? "true" : "false"); eye.setAttribute("aria-label", show ? "Hide the key" : "Show the key"); eye.innerHTML = show ? I.eyeoff : I.eye; inp.focus(); });
    if (chk) chk.addEventListener("click", async () => {
      trim(); chk.disabled = true; chk.textContent = "Checking…"; PK.setKeyStatus(root, "", "");
      const r = await PK.checkKey(S.key);
      chk.disabled = false; chk.textContent = "Check key";
      S.keyOk = r.ok;
      PK.setKeyStatus(root, r.ok ? "ok" : "bad", r.ok ? "Key accepted" : r.message);
      if (!r.ok) try { inp.focus(); } catch (e) { /* fine */ }
      if (onResult) onResult(r.ok, r);
    });
  };

  // ---- the draft: everything typed, kept for this tab ----
  PK.draft = (page) => {
    const slot = "cbz-paydraft-" + page;
    return {
      load() { try { const v = JSON.parse(sessionStorage.getItem(slot) || "{}"); return v && typeof v === "object" ? v : {}; } catch (e) { return {}; } },
      save(o) { try { sessionStorage.setItem(slot, JSON.stringify(o)); } catch (e) { /* storage blocked: the page still works */ } },
      clear() { try { sessionStorage.removeItem(slot); } catch (e) { /* fine */ } },
    };
  };
  const TEXT_KEYS = ["name", "email", "phone", "org", "tax", "key", "gameId"];
  /** Puts the saved draft into S, then keeps it up to date on every keystroke and change (listeners on the root, which never changes, so a redraw loses nothing). Returns save(). */
  PK.persist = (root, S, draft, keys) => {
    const saved = draft.load();
    for (const k of keys) if (typeof saved[k] === "string" && saved[k] !== "") { S[k] = saved[k].slice(0, 200); S.touched = true; } // typed earlier in this tab: the automatic page update waits for it too
    const save = () => { const o = {}; for (const k of keys) if (typeof S[k] === "string") o[k] = S[k]; draft.save(o); };
    const take = (e) => { const t = e.target, f = t && t.dataset ? t.dataset.f : ""; if (!f || keys.indexOf(f) < 0) return; S[f] = t.value; S.touched = true; if (t.classList) t.classList.remove("pk-fill"); save(); };
    root.addEventListener("input", take); root.addEventListener("change", take);
    window.addEventListener("pagehide", save);
    document.addEventListener("visibilitychange", () => { if (document.hidden) save(); });
    window.addEventListener("pageshow", (e) => { if (e.persisted) { const s2 = draft.load(); for (const k of keys) if (typeof s2[k] === "string") S[k] = s2[k]; PK.refill(root, S, keys); } });
    // the automatic page update (autoupdate.js) waits while typed details are not yet paid for; the draft above covers the case where it does reload
    window.__ctDirty = () => !S.done && !!S.touched && TEXT_KEYS.some((k) => keys.indexOf(k) >= 0 && S[k]);
    return save;
  };
  /** Reads what is in the boxes into S (a browser fills boxes in ways that do not always fire an input event; the pay buttons call this first). */
  PK.sync = (root, S, keys) => { for (const k of keys) { const e = root.querySelector('[data-f="' + k + '"]'); if (e && typeof e.value === "string") S[k] = e.value; } };
  PK.refill = (root, S, keys) => { for (const k of keys) { const e = root.querySelector('[data-f="' + k + '"]'); if (e && typeof S[k] === "string" && e.value !== S[k]) e.value = S[k]; } };
  /** the remembered payer (this browser, after an earlier payment) in grey until the person types over it */
  PK.markFilled = (root) => { const v = TB.payer.load(); for (const [id, k] of [["nm", "name"], ["em", "email"], ["ph", "phone"], ["org", "org"], ["tax", "tax"]]) { const e = root.querySelector("#" + id); if (!e || !v[k] || e.value !== v[k]) continue; e.classList.add("pk-fill"); } };
  /** the details that go to the Worker, spelled with the shared field names (payfields.js) */
  PK.payerBody = (S) => {
    const b = {}, tax = (S.tax || "").trim().toUpperCase();
    b[F.name || "name"] = (S.name || "").trim(); b[F.email || "email"] = (S.email || "").trim().toLowerCase(); b[F.country || "country"] = S.country || "IN";
    if ((S.phone || "").trim()) { b[F.phone || "phone"] = S.phone.trim(); b[F.phoneCode || "phoneCode"] = S.pcode || "91"; }
    if ((S.org || "").trim()) b[F.org || "org"] = S.org.trim();
    if (tax) b[F.taxId || "taxId"] = tax;
    return b;
  };
  /** the remembered payer (name, e-mail, ...) of this browser, as state */
  PK.payerState = () => { const v = TB.payer.load(); return { name: v.name || "", email: v.email || "", phone: v.phone || "", pcode: v.pcode || "91", org: v.org || "", tax: v.tax || "" }; };

  // ---- the receipt ----
  PK.invoice = (d, email) => !d || !d.invoiceUrl ? "" : `<div class="pk-inv"><h3>Your invoice ${esc(d.invoiceNumber || "")}</h3><div class="pk-invbody" id="invbody">Loading your invoice...</div>
    <div class="pk-btns"><a class="pk-btn alt" id="invpdf" href="${esc(d.invoiceUrl)}.pdf" download>Download PDF</a><a class="pk-btn alt" id="invprint" href="${esc(d.invoiceUrl)}" target="_blank" rel="noopener">Open / print</a><a class="pk-btn alt" id="invwa" href="#">Send by WhatsApp</a><button class="pk-btn alt" id="invcopy" type="button">Copy invoice link</button></div>
    <div class="pk-invto"><label for="invto">E-mail this invoice to</label><input class="pk-in" id="invto" type="email" autocomplete="email" value="${esc(email || "")}"><button class="pk-btn sm" id="invsend" type="button">E-mail it</button></div><p class="pk-note" id="invmsg" role="status"></p></div>`;
  /** o: title, lead, forLabel (what it was for), email, rows (more [label, html] rows), after (html below the invoice) */
  PK.receipt = (d, o) => {
    const B = PK.BRAND, r = [];
    r.push(PK.row("For", o.forHtml || esc(o.forLabel || "")));
    if (d.total != null) r.push(PK.row("Amount paid", money(d.total, d.currency || "INR")));
    r.push(PK.row("Paid to", `${esc(B.payee)}<small>through Razorpay</small>`));
    r.push(PK.row("Razorpay transaction ID", esc(d.razorpayPaymentId || "being confirmed, see your e-mail"), "mono"));
    if (d.orderId) r.push(PK.row(`${B.name} payment confirmation ID`, esc(d.orderId), "mono"));
    if (d.invoiceNumber) r.push(PK.row("Invoice number", esc(d.invoiceNumber), "mono"));
    for (const x of o.rows || []) r.push(PK.row(x[0], x[1], x[2]));
    return `<section class="pk-card done" role="status"><div class="pk-done-head"><span class="tick">${I.check}</span><div><h2>${esc(o.title || "Payment received")}</h2><p>${o.lead || ""}</p></div></div><dl class="pk-dl">${r.join("")}</dl>${PK.invoice(d, o.email)}${o.after || ""}</section>`;
  };
  /** the proforma invoice (not paid), folded away until asked for; same ids as before so TB.proformaWire still works */
  PK.proforma = () => '<details class="pk-pf"><summary>Proforma invoice (not paid)</summary><div class="in"><div class="pk-invbody" id="pfbody">Preparing your proforma invoice...</div><div class="pk-btns"><button class="pk-btn alt" id="pfpay" type="button">Pay now</button></div></div></details>';
  PK.page = (root, html, focus) => { root.innerHTML = html; if (focus) { const h = root.querySelector("#pk-h1"); if (h) try { h.focus({ preventScroll: false }); } catch (e) { /* fine */ } } };

  // older callers (and any page not yet moved to the kit) get the new look through the old names
  TB.payBrand = () => "";
  TB.payReceipt = (d, gameId) => PK.receipt(d, { forLabel: gameId || d.eid || "", lead: "" });
  TB.invoiceBox = PK.invoice;
  TB.proformaBox = PK.proforma;
})();
