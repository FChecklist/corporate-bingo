/* Corporate Bingo: puts the "notify me when this game begins" block on the player page (z.html), and only when push-config.js holds a real https address.
   Until then this file does nothing at all: nothing is drawn, push-optin.js and push-optin.css are not requested, and no call goes to any service (dark).
   The block itself is the corporate-push client, copied unchanged (push-optin.js, push-optin.css; the service worker part is sw-push-snippet.js, loaded by zsw.js).
   Rules kept here: the browser's permission question is never asked here (only by a tap inside push-optin.js); the game id is only the one in the game link; the page keeps one script of its own (no inline script). */
(function () {
  "use strict";
  if (window.__cbPushBoot) return;
  window.__cbPushBoot = true;

  var cfg = window.CBPushConfig;
  var api = cfg && typeof cfg.api === "string" ? cfg.api.trim() : "";
  // A real address only: https, a real host name with a dot (so a placeholder such as https://REPLACE-ME is dark too), optional port, no path.
  if (!/^https:\/\/(?:[a-z0-9-]+\.)+[a-z]{2,}(?::\d{1,5})?\/?$/i.test(api)) return;
  api = api.replace(/\/+$/, "");
  if (window.__CB_DEMO) return; // the free demo is not a real game: nobody can be told when it begins

  // The game id is read the same way the phone page reads it (z.js): the link's ?e=, or the part after #, or the last game this phone opened.
  var id = "";
  try {
    var q = new URLSearchParams(window.location.search);
    id = String(q.get("e") || window.location.hash.replace(/^#/, "") || "").trim();
    if (!id) id = String(window.localStorage.getItem("cb-last-eid") || "").trim();
  } catch (e) { /* no storage: the link alone decides */ }
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) return;

  // The address of this file carries ?v=<release>: the two files loaded below carry the same one, so a new release never meets an old copy.
  var ver = "";
  try { var me = document.currentScript; if (me && me.src && me.src.indexOf("?") > -1) ver = "?" + me.src.split("?")[1].split("#")[0]; } catch (e) { /* no version: plain addresses */ }

  var box = document.createElement("div");
  box.setAttribute("data-push-optin", "");
  box.setAttribute("data-push-api", api);
  box.setAttribute("data-push-site", "game");
  box.setAttribute("data-push-game-id", id);
  box.setAttribute("data-push-privacy", "/privacy.html");
  box.setAttribute("data-push-sw", "/zsw.js"); // only used if pwa.js has not registered the game's service worker yet
  box.setAttribute("data-push-ended", window.__cbGameEnded ? "true" : "false");
  var app = document.getElementById("app");
  if (app && app.parentNode) app.parentNode.insertBefore(box, app.nextSibling); else document.body.appendChild(box);

  // After the game (z.js says so): the block offers "Keep notifying me about new games".
  function ended() {
    box.setAttribute("data-push-ended", "true");
    try { box.dispatchEvent(new Event("corporatepush:game-ended")); } catch (e) { /* the attribute is enough for a block not yet drawn */ }
  }
  window.addEventListener("cb:game-ended", ended);
  if (window.__cbGameEnded) ended();

  var css = document.createElement("link");
  css.rel = "stylesheet";
  css.href = "/push-optin.css" + ver;
  document.head.appendChild(css);
  var js = document.createElement("script");
  js.src = "/push-optin.js" + ver;
  js.async = true;
  js.onload = function () { try { if (window.CorporatePush) window.CorporatePush.mount(box); } catch (e) { /* the block draws itself on load as well */ } };
  document.head.appendChild(js);
})();
