/* Corporate Bingo: the ONE place the "notify me when this game begins" service address is set.
   EMPTY (as it is today) = the button is not drawn, push-optin.js and push-optin.css are not even requested, and the page makes no call to anybody.
   To light it: put the service's https address here (an address only, no path, for example https://push.example.com) and release.
   pages/build.mjs reads this same value to allow that one address in the game page's connect-src; it stops the build if the value is not empty or a plain https address. */
window.CBPushConfig = { api: "" };
