/**
 * The snippet pasted once into a GoHighLevel page (one full-width Custom Code
 * element). It reads ?d=<slug> from the page address, fetches that demo from
 * this app and draws it, so one GHL page shows every demo.
 */
export function loaderSnippet(appBaseUrl: string): string {
  const api = `${appBaseUrl.replace(/\/+$/, "")}/api/forge/`;
  return `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Plus+Jakarta+Sans:wght@600;700;800&display=swap">
<div id="forge-site" style="position:relative;width:100vw;left:50%;margin-left:-50vw;min-height:100vh"></div>
<script>
(function () {
  var el = document.getElementById("forge-site");
  var d = new URLSearchParams(location.search).get("d");
  function note(t) { el.innerHTML = '<p style="font:16px system-ui,sans-serif;text-align:center;padding:80px 20px;color:#475569">' + t + "</p>"; }
  if (!d) return note("Open this page from a Forge demo link (it ends in ?d=…).");
  note("Loading…");
  fetch(${JSON.stringify(api)} + encodeURIComponent(d))
    .then(function (r) { if (!r.ok) throw new Error(); return r.json(); })
    .then(function (s) { el.innerHTML = s.html; document.title = s.title; })
    .catch(function () { note("This demo isn't available."); });
})();
</script>`;
}
