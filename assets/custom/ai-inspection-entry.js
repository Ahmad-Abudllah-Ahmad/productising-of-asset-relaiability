/* Module 02 entry: open the inspection app on its own landing page.
   The app's router shows its landing page at "/", but on this site "/" is the NEXUS homepage, so the app is
   served at /ai-inspection instead. This classic script runs before the app's module bundle: it presents the
   path as "/" while the router starts, then puts /ai-inspection back in the address bar once the first screen
   has rendered, so a refresh comes back here. The app's own code is unchanged. */
(function () {
  var path = location.pathname.replace(/\/+$/, "");
  if (path !== "/ai-inspection") return;
  var entry = "/ai-inspection" + location.search + location.hash;
  history.replaceState(history.state, "", "/" + location.search + location.hash);
  function restore() {
    // only if the app has not navigated somewhere else in the meantime
    if (location.pathname === "/") history.replaceState(history.state, "", entry);
  }
  function watch() {
    var root = document.getElementById("root");
    if (!root) { setTimeout(restore, 1500); return; }
    if (root.children.length) { requestAnimationFrame(restore); return; }
    var mo = new MutationObserver(function () {
      if (root.children.length) { mo.disconnect(); requestAnimationFrame(function () { requestAnimationFrame(restore); }); }
    });
    mo.observe(root, { childList: true });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", watch); else watch();
})();
