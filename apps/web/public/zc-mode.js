/* Which organizer screens open at /zc. Bingo ships the new screens as OPT-IN (DEFAULT_NEW = false): /zc.html opens the previous screens unless ?flow=new is in the address or this browser remembered "new".
   When the owner approves, ONE change makes the new screens the default: DEFAULT_NEW = true. ?flow=old opens the previous screens and is remembered on this browser; ?flow=new switches back.
   Links only the previous screens understand (demo game, pass, quick start, new game from the card page, cap, do, k = a Host / AI key link, api) always open the previous screens and the choice is NOT stored.
   A game that needs controls the new screens do not have (manual start, host-called numbers, or live right now) also opens the previous screens, not stored.
   It runs first and only puts flow=new or flow=old into the address, so zc.js (previous screens) and pack/zc-flow.js (new screens) are not touched. */
(function () {
  var DEFAULT_NEW = false;
  try {
    var q = new URLSearchParams(location.search), f = q.get("flow"), s = null;
    try { s = localStorage.getItem("cbz-zcflow"); } catch (e) {}
    if (f === "new" || f === "old") { try { localStorage.setItem("cbz-zcflow", f); } catch (e) {} }
    else {
      var OLD = ["demo", "pass", "quick", "quickform", "new", "cap", "do", "k", "api"], forced = false;
      for (var i = 0; i < OLD.length; i++) if (q.has(OLD[i])) forced = true;
      var gid = q.get("e");
      if (!forced && gid && /^[A-Za-z0-9_-]{4,40}$/.test(gid)) {
        try {
          var x = new XMLHttpRequest(); x.open("GET", "/api/z/" + encodeURIComponent(gid) + "/info", false); x.send(null);
          if (x.status === 200) {
            var j = JSON.parse(x.responseText), now = Date.now();
            if (j.startMode === "manual" || j.callMode === "host") forced = true;
            if (typeof j.startMs === "number" && now >= j.startMs - 15 * 60000 && now <= j.startMs + 4 * 3600000) forced = true;
          }
        } catch (e) { /* no answer: the default */ }
      }
      window.CT_ZCFORCED = forced;
      f = forced ? "old" : s === "new" ? "new" : s === "old" ? "old" : DEFAULT_NEW ? "new" : "old";
      if (f === "new" || DEFAULT_NEW) { q.set("flow", f); try { history.replaceState(null, "", location.pathname + "?" + q.toString() + location.hash); } catch (e) {} }
    }
    window.CT_ZCFLOW = f;
  } catch (e) { /* the page then opens as before */ }
})();
