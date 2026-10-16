/** The Forge Demo screens: sign-in, new demo + list, demo ready, settings. Plain HTML, no framework. */
import { esc } from "../../../src/forge/render";
import type { Demo, Intake } from "../../../src/forge/schema";
import type { Listed } from "./db";

const CSS = `
:root{--bg:#f5f6f8;--surface:#fff;--ink:#172033;--muted:#5a6478;--line:#dde1e8;--ember:#d9601f;--ember-soft:#fbe9dd;--steel:#1d4f8c;--steel-soft:#e3ecf7;--ok:#217a4b;--ok-soft:#e1f2e8;--bad:#a32b2b;--bad-soft:#fbe4e4;--chrome:#e9ecf1;
--display:"Bricolage Grotesque","Figtree",system-ui,sans-serif;--body:"Figtree",system-ui,-apple-system,"Segoe UI",sans-serif;--mono:"JetBrains Mono",ui-monospace,Menlo,monospace}
@media (prefers-color-scheme:dark){:root{--bg:#11151d;--surface:#181e29;--ink:#e8ecf3;--muted:#9aa4b6;--line:#2a3242;--ember:#f08447;--ember-soft:#3a2418;--steel:#7fb0ea;--steel-soft:#1c2a3e;--ok:#6fd19c;--ok-soft:#173326;--bad:#f19a9a;--bad-soft:#3a1c1c;--chrome:#222a38;color-scheme:dark}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.55 var(--body)}
a{color:var(--steel)}
h1,h2,h3{font-family:var(--display);line-height:1.15;letter-spacing:-.01em;margin:0;text-wrap:balance}
h1{font-size:clamp(1.7rem,4vw,2.2rem);font-weight:800}h2{font-size:1.25rem;font-weight:700}
.top{background:var(--surface);border-bottom:1px solid var(--line)}
.top-in,.main{max-width:980px;margin:0 auto;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px))}
.top-in{display:flex;align-items:center;gap:22px;flex-wrap:wrap;padding-block:12px}
.brand{font-family:var(--display);font-weight:800;font-size:1.15rem;color:var(--ink);text-decoration:none;display:flex;align-items:center;gap:8px}
.brand i{width:26px;height:26px;border-radius:8px;background:var(--ember);display:inline-block}
.nav{display:flex;gap:18px;font-size:.92rem}.nav a{color:var(--muted);text-decoration:none}.nav a.on{color:var(--steel);font-weight:600}
.nav form{margin:0}.linkbtn{background:none;border:0;color:var(--muted);font:inherit;cursor:pointer;padding:0}
.main{padding-block:32px 64px;display:grid;gap:28px}
.card{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:22px;display:grid;gap:16px;min-width:0}
.lead{color:var(--muted);max-width:65ch;margin:6px 0 0}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:14px}
label{display:grid;gap:6px;font-size:.85rem;font-weight:600}
input,textarea,select{font:inherit;font-weight:400;border:1px solid var(--line);border-radius:9px;padding:10px 12px;background:var(--bg);color:var(--ink);width:100%}
input:focus,textarea:focus{outline:2px solid var(--steel-soft);border-color:var(--steel)}
.full{grid-column:1/-1}
details summary{cursor:pointer;color:var(--steel);font-size:.92rem;font-weight:600}
details[open] summary{margin-bottom:14px}
.btn{display:inline-flex;align-items:center;gap:8px;background:var(--steel);color:#fff;border:0;border-radius:9px;padding:11px 18px;font:600 .95rem var(--body);cursor:pointer;text-decoration:none}
.btn:hover{filter:brightness(1.1)}.btn:disabled{opacity:.6;cursor:wait}
.btn.ember{background:var(--ember)}.btn.ghost{background:transparent;color:var(--ink);border:1px solid var(--line);padding:7px 12px;font-size:.85rem}
.btn.danger{background:transparent;color:var(--bad);border:1px solid var(--line);font-size:.85rem;padding:7px 12px}
.row{display:flex;gap:12px;align-items:center;flex-wrap:wrap}
.flash{border-radius:10px;padding:12px 16px;font-weight:600}.flash.ok{background:var(--ok-soft);color:var(--ok)}.flash.bad{background:var(--bad-soft);color:var(--bad)}
.share{display:grid;gap:10px}
.share-row{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:12px 14px;border:1px solid var(--line);border-radius:10px;flex-wrap:wrap}
.share-row div{min-width:0;display:grid;gap:2px}.share-row b{font-size:.9rem}
.share-row span{font:.8rem var(--mono);color:var(--muted);overflow-wrap:anywhere;white-space:pre-wrap}
.note{font-size:.88rem;color:var(--muted)}
.table{overflow-x:auto;border:1px solid var(--line);border-radius:12px;background:var(--surface)}
table{border-collapse:collapse;width:100%;font-size:.92rem}th,td{text-align:left;padding:11px 14px;border-bottom:1px solid var(--line);white-space:nowrap}
th{font-size:.75rem;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}tr:last-child td{border-bottom:0}
.preview{width:100%;height:72vh;border:1px solid var(--line);border-radius:12px;background:#fff}
pre{font:.78rem/1.5 var(--mono);background:var(--steel-soft);border-radius:10px;padding:14px;overflow-x:auto;margin:0}
.pill{font:600 .72rem var(--body);letter-spacing:.06em;text-transform:uppercase;padding:3px 9px;border-radius:999px;background:var(--ember-soft);color:var(--ember)}
.login{max-width:380px;margin:12vh auto;padding-inline:16px}
.empty{color:var(--muted);text-align:center;padding:28px}
`;

const COPY_JS = `document.addEventListener("click",async e=>{const b=e.target.closest("[data-copy]");if(!b)return;const t=b.getAttribute("data-copy");try{await navigator.clipboard.writeText(t);b.textContent="Copied";setTimeout(()=>b.textContent="Copy",1500)}catch{prompt("Copy this:",t)}});
document.addEventListener("submit",e=>{const b=e.target.querySelector("button[data-busy]");if(b){b.disabled=true;b.textContent=b.getAttribute("data-busy")}});`;

export function page(title: string, body: string, opts: { nav?: "new" | "settings" | null } = {}): Response {
  const nav =
    opts.nav === undefined || opts.nav === null
      ? ""
      : `<header class="top"><div class="top-in"><a class="brand" href="/"><i></i>Forge Demo</a><nav class="nav">
<a href="/" class="${opts.nav === "new" ? "on" : ""}">Demos</a><a href="/settings" class="${opts.nav === "settings" ? "on" : ""}">GoHighLevel setup</a>
<form method="post" action="/logout"><button class="linkbtn">Sign out</button></form></nav></div></header>`;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(title)} · Forge Demo</title><meta name="robots" content="noindex">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,700;12..96,800&family=Figtree:wght@400;600;700&family=JetBrains+Mono&display=swap">
<style>${CSS}</style></head><body>${nav}${body}<script>${COPY_JS}</script></body></html>`;
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-frame-options": "SAMEORIGIN" } });
}

const flash = (ok?: string, err?: string) =>
  `${ok ? `<div class="flash ok" role="status">✓ ${esc(ok)}</div>` : ""}${err ? `<div class="flash bad" role="alert">${esc(err)}</div>` : ""}`;

export function loginPage(error?: string, needsSetup = false): Response {
  return page(
    "Sign in",
    `<main class="login card"><a class="brand" href="/"><i></i>Forge Demo</a>
${needsSetup ? `<div class="flash bad">The team password isn't set yet. Add the FORGE_PASSWORD secret in Cloudflare.</div>` : ""}
${flash(undefined, error)}
<form method="post" action="/login" class="card" style="padding:0;border:0;gap:14px">
<label for="pw">Team password<input id="pw" name="password" type="password" autocomplete="current-password" required autofocus></label>
<button class="btn" type="submit">Sign in</button></form></main>`,
    { nav: null },
  );
}

function fields(v?: Partial<Intake>): string {
  const t = (name: keyof Intake, label: string, ph: string, required = false, type = "text") =>
    `<label for="f-${name}">${label}<input id="f-${name}" name="${name}" type="${type}" value="${esc((v?.[name] as string) ?? "")}" placeholder="${esc(ph)}"${required ? " required" : ""}></label>`;
  const a = (name: keyof Intake, label: string, ph: string) =>
    `<label class="full" for="f-${name}">${label}<textarea id="f-${name}" name="${name}" rows="3" placeholder="${esc(ph)}">${esc((v?.[name] as string) ?? "")}</textarea></label>`;
  return `<div class="grid">${t("businessName", "Business name *", "e.g. Vanguard Pipe & Water", true)}${t("industry", "Trade", "e.g. Plumbing, HVAC, Roofing")}${t("city", "City", "e.g. Myrtle Beach, SC")}${t("phone", "Phone", "e.g. (646) 594-9379")}</div>
<details><summary>More details (optional; the more you add, the more tailored the site)</summary><div class="grid">
${a("services", "Services", "Comma or line separated, e.g. Drain cleaning, Water heaters")}
${a("serviceAreas", "Service areas", "e.g. Myrtle Beach, Conway, Surfside Beach")}
${a("reviews", "Real reviews to quote", "One per paragraph, optionally ending — Name, Town. Leave empty for clearly-marked sample reviews.")}
${a("notes", "Other facts about the business", "e.g. Family owned since 2009, owner Matt, free estimates, 24/7")}
${t("logoUrl", "Logo image link", "https://…", false, "url")}${t("heroImageUrl", "Hero photo link", "https://…", false, "url")}${t("primaryColor", "Brand colour", "#1673c9")}
</div></details>`;
}

export function homePage(demos: Listed[], siteUrl: (slug: string) => string, aiOn: boolean, err?: string, ok?: string): Response {
  const rows = demos.length
    ? `<div class="table"><table><thead><tr><th>Business</th><th>Trade</th><th>City</th><th>Made</th><th></th></tr></thead><tbody>${demos
        .map(
          (d) =>
            `<tr><td><a href="/demos/${esc(d.slug)}">${esc(d.businessName)}</a></td><td>${esc(d.industry)}</td><td>${esc(d.city)}</td><td class="note">${esc(d.createdAt.slice(0, 10))}</td><td><a href="${esc(siteUrl(d.slug))}" target="_blank" rel="noreferrer">Open ↗</a> &nbsp;<button class="btn ghost" data-copy="${esc(siteUrl(d.slug))}">Copy</button></td></tr>`,
        )
        .join("")}</tbody></table></div>`
    : `<div class="card empty">No demos yet. Build the first one above.</div>`;
  return page(
    "Demos",
    `<main class="main">${flash(ok, err)}
<div><h1>New demo website</h1><p class="lead">Type in a business and get a ready-to-show website in about a minute.${aiOn ? "" : " (AI copy is off until GEMINI_API_KEY is set, so sites use the trade template's wording.)"}</p></div>
<form method="post" action="/demos" class="card">${fields()}<div><button class="btn ember" type="submit" data-busy="${aiOn ? "Writing the site… up to a minute" : "Building…"}">Build demo website</button></div></form>
<section style="display:grid;gap:14px"><h2>All demos (${demos.length})</h2>${rows}</section></main>`,
    { nav: "new" },
  );
}

export function demoPage(d: Demo, links: { site: string; ghl: string }, aiOn: boolean, ok?: string, err?: string): Response {
  const i = d.intake;
  const link = links.ghl || links.site;
  const chat = `✅ Demo site ready: *${i.businessName}*${i.city ? ` (${i.city})` : ""}\n${link}`;
  const sheet = [new Date().toISOString().slice(0, 10), i.businessName, d.content.industry, i.city, i.phone, link].join("\t");
  const row = (title: string, shown: string, copy: string) =>
    `<div class="share-row"><div><b>${title}</b><span>${esc(shown)}</span></div>${copy ? `<button class="btn ghost" data-copy="${esc(copy)}">Copy</button>` : ""}</div>`;
  return page(
    i.businessName,
    `<main class="main">${flash(ok, err)}
<div class="row" style="justify-content:space-between"><div><h1>${esc(i.businessName)}</h1>
<p class="lead">${esc(d.content.industry)}${i.city ? ` · ${esc(i.city)}` : ""} · <span class="pill">${d.writtenBy === "ai" ? "Written by Gemini" : "Template wording"}</span> · updated ${esc(d.updatedAt.slice(0, 16).replace("T", " "))} UTC</p></div>
<a class="btn" href="${esc(links.site)}" target="_blank" rel="noreferrer">Open site ↗</a></div>
<section class="card"><h2>Share it</h2><div class="share">
${row("Website link", links.site, links.site)}
${links.ghl ? row("On your GoHighLevel page", links.ghl, links.ghl) : row("On your GoHighLevel page", "Set up your GoHighLevel page first (GoHighLevel setup, top menu).", "")}
${row("Google Chat message", chat, chat)}
${row("Sheet row (date · business · trade · city · phone · link)", sheet.replace(/\t/g, " · "), sheet)}
</div></section>
<iframe class="preview" src="${esc(links.site)}" title="Preview of ${esc(i.businessName)}"></iframe>
<form method="post" action="/demos/${esc(d.slug)}/rewrite" class="card"><h2>Edit &amp; rewrite</h2><p class="note">Change the details and rebuild the site. The links stay the same.</p>${fields(i)}
<div><button class="btn" type="submit" data-busy="${aiOn ? "Rewriting… up to a minute" : "Rebuilding…"}">Rewrite site</button></div></form>
<form method="post" action="/demos/${esc(d.slug)}/archive"><button class="btn danger" type="submit">Archive demo (its links stop working)</button></form>
</main>`,
    { nav: "new" },
  );
}

export function settingsPage(ghlPage: string, snippet: string, ok?: string, err?: string): Response {
  return page(
    "GoHighLevel setup",
    `<main class="main">${flash(ok, err)}
<div><h1>Show demos on your GoHighLevel page</h1><p class="lead">Set this up once. After that every demo also opens on your own domain at <span class="pill">your-page?d=demo-name</span>.</p></div>
<section class="card"><h2>1. Make the page in GoHighLevel</h2>
<ol class="note" style="margin:0;padding-left:1.2rem;display:grid;gap:6px"><li>In Mianro Systems, create a blank funnel or website page with no header or footer, e.g. <b>/demo</b>.</li>
<li>Add one full-width <b>Custom JS/HTML</b> element and paste the code below. Save and publish.</li></ol>
<div class="row" style="justify-content:space-between"><b>Code for the Custom JS/HTML element</b><button class="btn ghost" data-copy="${esc(snippet)}">Copy</button></div>
<pre>${esc(snippet)}</pre></section>
<form method="post" action="/settings" class="card"><h2>2. Paste the page's address</h2>
<label for="ghl">Published page address<input id="ghl" name="ghlPageUrl" type="url" value="${esc(ghlPage)}" placeholder="https://mianrosystems.com/demo"></label>
<div><button class="btn" type="submit">Save</button></div></form></main>`,
    { nav: "settings" },
  );
}
