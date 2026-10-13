/**
 * The Forge Demo site template: one page, built from `SiteContent`.
 *
 * `renderSite` returns self-contained markup (its own <style>, no scripts) whose
 * CSS is scoped under `.fg`, so the same output works as a standalone page
 * (/p/<slug>) and injected into a GoHighLevel page by the loader snippet.
 */
import { icon } from "./icons";
import type { Demo } from "./schema";

const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const esc = (s: string | null | undefined) => String(s ?? "").replace(/[&<>"']/g, (c) => ESC[c]);

const telHref = (phone: string) => {
  const digits = phone.replace(/[^\d+]/g, "");
  return digits ? `tel:${digits.length === 10 ? `+1${digits}` : digits}` : "#fg-contact";
};

/** A #rrggbb colour (also accepts #rgb), or the fallback. Keeps CSS injection out of the style block. */
export function safeHex(v: string, fallback: string): string {
  const t = v.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(t)) return t;
  if (/^#[0-9a-fA-F]{3}$/.test(t)) return `#${[...t.slice(1)].map((ch) => ch + ch).join("")}`;
  return fallback;
}

function rgb(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter((w) => /^[A-Za-z0-9]/.test(w))
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
}

/** Safe for a CSS url("…") inside a style attribute. Only http(s) URLs are used. */
const cssUrl = (u: string) => (/^https?:\/\//.test(u) ? u.replace(/["\\\n\r()]/g, encodeURIComponent) : "");

export interface Rendered {
  title: string;
  description: string;
  /** <style> + markup, ready to place in a page or a GHL custom-code block. */
  html: string;
}

export function renderSite(demo: Demo): Rendered {
  const c = demo.content;
  const i = demo.intake;
  const name = i.businessName;
  const phone = i.phone;
  const call = telHref(phone);
  const cta = (label: string, cls = "fg-btn") => `<a class="${cls}" href="#fg-contact">${esc(label)}</a>`;
  const callBtn = (cls = "fg-btn fg-btn-ghost") =>
    phone ? `<a class="${cls}" href="${call}">${icon("phone", 18)}<span>${esc(phone)}</span></a>` : "";

  const logo = i.logoUrl
    ? `<img class="fg-logo-img" src="${esc(i.logoUrl)}" alt="${esc(name)}">`
    : `<span class="fg-mark">${esc(initials(name))}</span><span class="fg-logo-name">${esc(name)}</span>`;
  const heroBg = cssUrl(i.heroImageUrl);

  const section = (id: string, cls: string, head: { eyebrow?: string; headline: string; intro?: string }, body: string) => `
<section id="fg-${id}" class="fg-sec ${cls}">
  <div class="fg-wrap">
    <div class="fg-head">${head.eyebrow ? `<p class="fg-eyebrow">${esc(head.eyebrow)}</p>` : ""}<h2>${esc(head.headline)}</h2>${head.intro ? `<p class="fg-lead">${esc(head.intro)}</p>` : ""}</div>
    ${body}
  </div>
</section>`;

  const html = `<style>${css(safeHex(c.theme.primary, "#2563eb"), safeHex(c.theme.dark, "#0f172a"))}</style>
<div class="fg">
  <div class="fg-top"><div class="fg-wrap fg-top-in">
    <span>${icon("home", 14)} ${esc(c.topBar.location)}</span>
    <span class="fg-top-hl">${icon("clock", 14)} ${esc(c.topBar.highlight)}</span>
    ${phone ? `<a href="${call}" class="fg-top-phone">${icon("phone", 14)} ${esc(phone)}</a>` : ""}
  </div></div>

  <header class="fg-nav"><div class="fg-wrap fg-nav-in">
    <a class="fg-logo" href="#fg-home">${logo}</a>
    <nav class="fg-links"><a href="#fg-services">Services</a><a href="#fg-why">Why us</a><a href="#fg-areas">Areas</a><a href="#fg-reviews">Reviews</a><a href="#fg-contact">Contact</a></nav>
    <div class="fg-nav-cta">${phone ? `<a class="fg-nav-phone" href="${call}">${icon("phone", 16)} ${esc(phone)}</a>` : ""}${cta(c.hero.primaryCta, "fg-btn fg-btn-sm")}</div>
  </div></header>

  <section id="fg-home" class="fg-hero"${heroBg ? ` style="--fg-hero-img:url('${heroBg}')"` : ""}>
    <div class="fg-wrap fg-hero-in">
      <p class="fg-badge"><span></span>${esc(c.hero.badge)}</p>
      <h1>${esc(c.hero.headlineLead)} <em>${esc(c.hero.headlineAccent)}</em></h1>
      <p class="fg-hero-sub">${esc(c.hero.subheadline)}</p>
      <div class="fg-row">${cta(c.hero.primaryCta)}<a class="fg-btn fg-btn-ghost" href="#fg-services">${esc(c.hero.secondaryCta)}</a></div>
      <ul class="fg-trust">${c.trustBadges.map((b) => `<li>${icon("check", 18)} ${esc(b)}</li>`).join("")}</ul>
    </div>
  </section>

  <div class="fg-alert"><div class="fg-wrap fg-alert-in">
    <div><strong>${esc(c.emergency.headline)}</strong><p>${c.emergency.items.map(esc).join(" &nbsp;•&nbsp; ")}</p></div>
    ${phone ? `<a class="fg-btn fg-btn-light" href="${call}">${icon("phone", 18)} Call ${esc(phone)}</a>` : cta("Request Service Now", "fg-btn fg-btn-light")}
  </div></div>

  ${section(
    "services",
    "",
    { eyebrow: "What we do", headline: c.services.headline, intro: c.services.intro },
    `<div class="fg-grid fg-grid-3">${c.services.items
      .map(
        (s) =>
          `<article class="fg-card fg-service"><div class="fg-ico">${icon(s.icon)}</div><h3>${esc(s.title)}</h3><p>${esc(s.description)}</p><a href="#fg-contact" class="fg-more">Request service →</a></article>`,
      )
      .join("")}</div>`,
  )}

  ${section(
    "problems",
    "fg-alt",
    { eyebrow: "Sound familiar?", headline: c.painPoints.headline, intro: c.painPoints.intro },
    `<div class="fg-split"><ul class="fg-pains">${c.painPoints.items.map((p) => `<li><span>✕</span>${esc(p)}</li>`).join("")}</ul>
     <div class="fg-resolve"><div class="fg-ico fg-ico-lg">${icon("check", 30)}</div><p>${esc(c.painPoints.resolution)}</p>${phone ? callBtn("fg-btn") : cta("Request Service Now")}</div></div>`,
  )}

  ${section(
    "why",
    "",
    { eyebrow: `Why ${name}`, headline: c.whyUs.headline, intro: c.whyUs.intro },
    `<div class="fg-grid fg-grid-4">${c.whyUs.items
      .map((w) => `<article class="fg-why"><div class="fg-ico">${icon(w.icon)}</div><h3>${esc(w.title)}</h3><p>${esc(w.description)}</p></article>`)
      .join("")}</div>`,
  )}

  ${section(
    "process",
    "fg-dark",
    { eyebrow: "Our process", headline: c.process.headline, intro: c.process.intro },
    `<ol class="fg-steps">${c.process.steps
      .map((s, n) => `<li><span class="fg-step-n">${n + 1}</span><h3>${esc(s.title)}</h3><p>${esc(s.description)}</p></li>`)
      .join("")}</ol>`,
  )}

  ${
    c.areas.places.length
      ? section(
          "areas",
          "fg-alt",
          { eyebrow: "Service area", headline: c.areas.headline, intro: c.areas.intro },
          `<ul class="fg-chips">${c.areas.places.map((p) => `<li>${icon("home", 16)} ${esc(p)}</li>`).join("")}</ul><div class="fg-center">${cta("Check Availability")}</div>`,
        )
      : ""
  }

  ${section(
    "reviews",
    "",
    { eyebrow: "Reviews", headline: c.reviews.headline, intro: c.reviews.intro },
    `<div class="fg-grid fg-grid-3">${c.reviews.items
      .map(
        (r) =>
          `<figure class="fg-card fg-review"><div class="fg-stars">★★★★★</div><blockquote>“${esc(r.quote)}”</blockquote><figcaption><span class="fg-avatar">${esc(initials(r.name) || "★")}</span><span><strong>${esc(r.name)}</strong>${r.context ? `<small>${esc(r.context)}</small>` : ""}</span></figcaption></figure>`,
      )
      .join("")}</div>${c.reviews.real ? "" : '<p class="fg-note">Sample reviews shown for this preview.</p>'}`,
  )}

  ${section(
    "offers",
    "fg-alt",
    { eyebrow: "Specials", headline: c.offers.headline, intro: c.offers.intro },
    `<div class="fg-grid fg-grid-2">${c.offers.items
      .map(
        (o) =>
          `<article class="fg-coupon"><span class="fg-tag">${esc(o.tag)}</span><h3>${esc(o.title)}</h3><p class="fg-coupon-sub">${esc(o.subtitle)}</p><p class="fg-fine">${esc(o.fineprint)}</p>${cta("Claim Offer", "fg-btn fg-btn-sm")}</article>`,
      )
      .join("")}</div>`,
  )}

  ${section(
    "about",
    "",
    { eyebrow: "About us", headline: c.about.headline },
    `<div class="fg-about">${c.about.paragraphs.map((p) => `<p>${esc(p)}</p>`).join("")}<ul class="fg-trust fg-trust-dark">${c.trustBadges
      .map((b) => `<li>${icon("check", 18)} ${esc(b)}</li>`)
      .join("")}</ul></div>`,
  )}

  ${section(
    "faq",
    "fg-alt",
    { eyebrow: "FAQ", headline: c.faq.headline },
    `<div class="fg-faq">${c.faq.items
      .map((f) => `<details><summary>${esc(f.question)}<span>+</span></summary><p>${esc(f.answer)}</p></details>`)
      .join("")}</div>`,
  )}

  <section class="fg-final"><div class="fg-wrap fg-center">
    <h2>${esc(c.finalCta.headline)}</h2><p class="fg-lead">${esc(c.finalCta.text)}</p>
    <div class="fg-row fg-row-center">${phone ? callBtn("fg-btn") : ""}${cta("Get a Free Estimate", phone ? "fg-btn fg-btn-ghost" : "fg-btn")}</div>
  </div></section>

  ${section(
    "contact",
    "",
    { eyebrow: "Contact", headline: c.contact.headline, intro: c.contact.intro },
    `<div class="fg-contact">
      <div class="fg-contact-info">
        ${phone ? `<a class="fg-info" href="${call}"><span class="fg-ico">${icon("phone")}</span><span><small>Call us</small><strong>${esc(phone)}</strong></span></a>` : ""}
        <div class="fg-info"><span class="fg-ico">${icon("home")}</span><span><small>Service area</small><strong>${esc(c.topBar.location)}</strong></span></div>
        <div class="fg-info"><span class="fg-ico">${icon("clock")}</span><span><small>Availability</small><strong>${esc(c.topBar.highlight)}</strong></span></div>
      </div>
      <form class="fg-form" onsubmit="event.preventDefault();this.innerHTML='<p class=&quot;fg-thanks&quot;>Thanks! This is a preview. On your live site, this form goes straight to your inbox and CRM.</p>'">
        <label>Full name<input name="name" required autocomplete="name"></label>
        <label>Phone<input name="phone" type="tel" required autocomplete="tel"></label>
        <label>Email<input name="email" type="email" autocomplete="email"></label>
        <label>Service needed<select name="service">${c.contact.serviceOptions.map((o) => `<option>${esc(o)}</option>`).join("")}</select></label>
        <label class="fg-span">How can we help?<textarea name="message" rows="3"></textarea></label>
        <button class="fg-btn fg-span" type="submit">Send Message</button>
      </form>
    </div>`,
  )}

  <footer class="fg-foot"><div class="fg-wrap fg-foot-in">
    <span class="fg-logo">${i.logoUrl ? logo : `<span class="fg-mark">${esc(initials(name))}</span><span class="fg-logo-name">${esc(name)}</span>`}</span>
    <span>${esc(c.topBar.location)}${phone ? ` · <a href="${call}">${esc(phone)}</a>` : ""}</span>
    <span>© ${new Date().getFullYear()} ${esc(name)}</span>
  </div></footer>

  ${phone ? `<a class="fg-callbar" href="${call}">${icon("phone", 18)} Call ${esc(phone)}</a>` : ""}
</div>`;

  return { title: c.seo.title, description: c.seo.description, html };
}

/** The whole page, for the standalone preview link. */
export function renderPage(demo: Demo): string {
  const r = renderSite(demo);
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(r.title)}</title><meta name="description" content="${esc(r.description)}"><meta name="robots" content="noindex">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Plus+Jakarta+Sans:wght@600;700;800&display=swap">
<style>html{scroll-behavior:smooth}body{margin:0;background:#fff}</style>
</head><body>${r.html}</body></html>`;
}

function css(primary: string, dark: string): string {
  const p = rgb(primary);
  return `
.fg{--p:${primary};--pr:${p};--d:${dark};--ink:#0f172a;--mut:#5b6474;--line:#e6e9ef;--soft:#f6f8fb;font:16px/1.6 Inter,system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--ink);background:#fff;width:100%;overflow-x:hidden;-webkit-font-smoothing:antialiased}
.fg *,.fg *::before,.fg *::after{box-sizing:border-box;margin:0;padding:0}
.fg a{color:inherit;text-decoration:none}
.fg img{max-width:100%;display:block}
.fg h1,.fg h2,.fg h3{font-family:"Plus Jakarta Sans",Inter,system-ui,sans-serif;line-height:1.15;letter-spacing:-.02em;color:inherit}
.fg h2{font-size:clamp(1.75rem,3.2vw,2.6rem);font-weight:800}
.fg h3{font-size:1.15rem;font-weight:700}
.fg ul,.fg ol{list-style:none}
.fg-wrap{max-width:1180px;margin:0 auto;padding:0 20px}
.fg-row{display:flex;flex-wrap:wrap;gap:12px}.fg-row-center{justify-content:center}.fg-center{text-align:center}
.fg-btn{display:inline-flex;align-items:center;gap:8px;background:var(--p);color:#fff!important;font-weight:600;padding:14px 26px;border-radius:999px;border:2px solid var(--p);box-shadow:0 10px 24px -10px rgba(var(--pr),.7);transition:transform .15s,filter .15s;cursor:pointer;font:600 1rem/1.2 Inter,system-ui,sans-serif}
.fg-btn:hover{transform:translateY(-1px);filter:brightness(1.08)}
.fg-btn-sm{padding:10px 18px;font-size:.92rem}
.fg-btn-ghost{background:transparent;border-color:rgba(255,255,255,.35);box-shadow:none}
.fg-btn-light{background:#fff;color:var(--d)!important;border-color:#fff;box-shadow:none}
.fg-top{background:var(--d);color:#cbd5e1;font-size:.82rem}
.fg-top-in{display:flex;gap:22px;align-items:center;min-height:36px}
.fg-top-in span,.fg-top-in a{display:inline-flex;align-items:center;gap:6px}
.fg-top-hl{color:#fca5a5}.fg-top-phone{margin-left:auto;color:#fff;font-weight:600}
.fg-nav{position:sticky;top:0;z-index:20;background:rgba(255,255,255,.96);backdrop-filter:blur(8px);border-bottom:1px solid var(--line)}
.fg-nav-in{display:flex;align-items:center;gap:24px;min-height:74px}
.fg-logo{display:inline-flex;align-items:center;gap:10px;font-weight:800;font-family:"Plus Jakarta Sans",Inter,sans-serif}
.fg-logo-img{max-height:48px;width:auto}
.fg-mark{display:grid;place-items:center;width:42px;height:42px;border-radius:12px;background:var(--p);color:#fff;font-size:1rem;letter-spacing:.02em}
.fg-logo-name{font-size:1.1rem;color:var(--ink)}
.fg-links{display:flex;gap:26px;margin:0 auto;color:var(--mut);font-weight:500}
.fg-links a:hover{color:var(--p)}
.fg-nav-cta{display:flex;align-items:center;gap:16px}
.fg-nav-phone{display:inline-flex;align-items:center;gap:6px;font-weight:600;color:var(--ink)}
.fg-nav-phone svg{color:var(--p)}
.fg-hero{position:relative;color:#fff;background:radial-gradient(1100px 520px at 85% 10%,rgba(var(--pr),.38),transparent 60%),radial-gradient(700px 400px at 5% 100%,rgba(var(--pr),.22),transparent 60%),linear-gradient(160deg,var(--d) 0%,#05070c 100%);overflow:hidden}
.fg-hero::before{content:"";position:absolute;inset:0;background:var(--fg-hero-img,none) center/cover no-repeat;opacity:.35}
.fg-hero::after{content:"";position:absolute;inset:0;background-image:linear-gradient(rgba(255,255,255,.04) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.04) 1px,transparent 1px);background-size:56px 56px;mask-image:linear-gradient(180deg,#000,transparent 85%)}
.fg-hero-in{position:relative;z-index:1;padding:110px 20px 96px;max-width:1180px}
.fg-badge{display:inline-flex;align-items:center;gap:10px;padding:7px 16px;border:1px solid rgba(255,255,255,.18);border-radius:999px;font-size:.78rem;font-weight:600;letter-spacing:.14em;text-transform:uppercase;background:rgba(255,255,255,.05)}
.fg-badge span{width:8px;height:8px;border-radius:50%;background:var(--p);box-shadow:0 0 0 4px rgba(var(--pr),.25)}
.fg-hero h1{font-size:clamp(2.6rem,6.2vw,4.6rem);font-weight:800;margin:26px 0 22px;max-width:15ch}
.fg-hero h1 em{font-style:normal;color:var(--p);filter:brightness(1.25);display:block}
.fg-hero-sub{font-size:1.18rem;color:#cbd5e1;max-width:620px;margin-bottom:34px}
.fg-trust{display:flex;flex-wrap:wrap;gap:12px 28px;margin-top:46px;color:#e2e8f0;font-weight:500;font-size:.95rem}
.fg-trust li{display:inline-flex;align-items:center;gap:8px}.fg-trust svg{color:var(--p);filter:brightness(1.3)}
.fg-trust-dark{color:var(--ink);margin-top:28px}.fg-trust-dark svg{filter:none}
.fg-alert{background:var(--p);color:#fff}
.fg-alert-in{display:flex;align-items:center;justify-content:space-between;gap:24px;padding:26px 20px;flex-wrap:wrap}
.fg-alert-in>div{flex:1 1 480px}
.fg-alert strong{font-size:1.2rem;font-family:"Plus Jakarta Sans",Inter,sans-serif}
.fg-alert p{opacity:.9;font-size:.95rem;margin-top:4px}
.fg-sec{padding:96px 0}
.fg-alt{background:var(--soft)}
.fg-dark{background:var(--d);color:#fff}.fg-dark .fg-lead{color:#94a3b8}
.fg-head{max-width:720px;margin:0 auto 52px;text-align:center}
.fg-eyebrow{color:var(--p);font-weight:700;font-size:.8rem;letter-spacing:.16em;text-transform:uppercase;margin-bottom:12px}
.fg-dark .fg-eyebrow{filter:brightness(1.3)}
.fg-lead{color:var(--mut);font-size:1.1rem;margin-top:14px}
.fg-grid{display:grid;gap:22px}
.fg-grid-2{grid-template-columns:repeat(2,1fr)}.fg-grid-3{grid-template-columns:repeat(3,1fr)}.fg-grid-4{grid-template-columns:repeat(4,1fr)}
.fg-card{background:#fff;border:1px solid var(--line);border-radius:20px;padding:30px;transition:transform .2s,box-shadow .2s}
.fg-card:hover{transform:translateY(-3px);box-shadow:0 22px 44px -24px rgba(15,23,42,.28)}
.fg-ico{display:grid;place-items:center;width:52px;height:52px;border-radius:14px;background:rgba(var(--pr),.1);color:var(--p);flex:none}
.fg-ico-lg{width:68px;height:68px;border-radius:50%}
.fg-service h3{margin:20px 0 8px}.fg-service p,.fg-why p{color:var(--mut)}
.fg-more{display:inline-block;margin-top:16px;color:var(--p)!important;font-weight:600;font-size:.95rem}
.fg-split{display:grid;grid-template-columns:1.3fr 1fr;gap:28px;align-items:stretch}
.fg-pains{display:grid;grid-template-columns:repeat(2,1fr);gap:14px}
.fg-pains li{display:flex;gap:12px;align-items:flex-start;background:#fff;border:1px solid var(--line);border-radius:14px;padding:18px;font-weight:500}
.fg-pains li span{color:#dc2626;font-weight:800}
.fg-resolve{background:var(--d);color:#fff;border-radius:22px;padding:36px;display:flex;flex-direction:column;gap:20px;justify-content:center;align-items:flex-start}
.fg-resolve p{font-size:1.4rem;font-weight:700;font-family:"Plus Jakarta Sans",Inter,sans-serif;line-height:1.3}
.fg-resolve .fg-ico{background:rgba(var(--pr),.2);filter:brightness(1.3)}
.fg-why{padding:26px;border-radius:18px;border:1px solid var(--line)}
.fg-why h3{margin:18px 0 6px}
.fg-steps{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:22px;counter-reset:s}
.fg-steps li{position:relative;padding:30px;border:1px solid rgba(255,255,255,.1);border-radius:20px;background:rgba(255,255,255,.03)}
.fg-steps p{color:#94a3b8;margin-top:8px}
.fg-step-n{display:grid;place-items:center;width:44px;height:44px;border-radius:50%;background:var(--p);font-weight:800;margin-bottom:18px}
.fg-chips{display:flex;flex-wrap:wrap;justify-content:center;gap:12px;margin-bottom:36px}
.fg-chips li{display:inline-flex;align-items:center;gap:8px;padding:12px 20px;background:#fff;border:1px solid var(--line);border-radius:999px;font-weight:600}
.fg-chips svg{color:var(--p)}
.fg-review blockquote{margin:14px 0 22px;color:#334155}
.fg-stars{color:#f59e0b;letter-spacing:3px}
.fg-review figcaption{display:flex;gap:12px;align-items:center}
.fg-review small{display:block;color:var(--mut)}
.fg-avatar{display:grid;place-items:center;width:42px;height:42px;border-radius:50%;background:rgba(var(--pr),.12);color:var(--p);font-weight:700}
.fg-note{text-align:center;color:var(--mut);font-size:.85rem;margin-top:22px}
.fg-coupon{position:relative;border:2px dashed rgba(var(--pr),.45);border-radius:22px;padding:34px;background:#fff;text-align:center}
.fg-tag{display:inline-block;background:var(--p);color:#fff;font-size:.72rem;font-weight:700;letter-spacing:.12em;text-transform:uppercase;padding:5px 12px;border-radius:999px}
.fg-coupon h3{font-size:2.3rem;margin:16px 0 4px;color:var(--p)}
.fg-coupon-sub{font-weight:600;font-size:1.1rem}
.fg-fine{color:var(--mut);font-size:.85rem;margin:10px 0 20px}
.fg-about{max-width:780px;margin:-20px auto 0;font-size:1.08rem;color:#334155;display:grid;gap:16px;text-align:center}
.fg-about .fg-trust{justify-content:center}
.fg-faq{max-width:820px;margin:0 auto;display:grid;gap:12px}
.fg-faq details{background:#fff;border:1px solid var(--line);border-radius:16px;padding:20px 24px}
.fg-faq summary{cursor:pointer;font-weight:600;font-size:1.05rem;list-style:none;display:flex;justify-content:space-between;gap:16px}
.fg-faq summary::-webkit-details-marker{display:none}
.fg-faq summary span{color:var(--p);font-size:1.4rem;line-height:1;transition:transform .2s}
.fg-faq details[open] summary span{transform:rotate(45deg)}
.fg-faq p{color:var(--mut);margin-top:12px}
.fg-final{padding:96px 0;color:#fff;background:radial-gradient(800px 360px at 50% 0%,rgba(var(--pr),.45),transparent 70%),var(--d)}
.fg-final .fg-lead{color:#cbd5e1;margin-bottom:30px}
.fg-contact{display:grid;grid-template-columns:1fr 1.4fr;gap:28px}
.fg-contact-info{display:grid;gap:14px;align-content:start}
.fg-info{display:flex;gap:14px;align-items:center;padding:20px;border:1px solid var(--line);border-radius:16px}
.fg-info small{display:block;color:var(--mut)}
.fg-form{display:grid;grid-template-columns:1fr 1fr;gap:16px;padding:32px;border:1px solid var(--line);border-radius:22px;box-shadow:0 24px 50px -32px rgba(15,23,42,.3)}
.fg-form label{display:grid;gap:6px;font-weight:600;font-size:.9rem}
.fg-form input,.fg-form select,.fg-form textarea{font:inherit;font-weight:400;padding:12px 14px;border:1px solid #cfd5df;border-radius:12px;background:#fff;color:var(--ink);width:100%}
.fg-form input:focus,.fg-form select:focus,.fg-form textarea:focus{outline:2px solid rgba(var(--pr),.4);border-color:var(--p)}
.fg-span{grid-column:1/-1}.fg-form .fg-btn{justify-content:center}
.fg-thanks{grid-column:1/-1;font-weight:600;font-size:1.1rem;text-align:center;padding:30px 0}
.fg-foot{background:#05070c;color:#94a3b8;font-size:.9rem}
.fg-foot-in{display:flex;flex-wrap:wrap;gap:16px;justify-content:space-between;align-items:center;padding:30px 20px}
.fg-foot .fg-logo-name{color:#fff}
.fg-callbar{display:none}
@media (max-width:980px){.fg-links,.fg-nav-phone{display:none}.fg-grid-3,.fg-grid-4{grid-template-columns:repeat(2,1fr)}.fg-split,.fg-contact{grid-template-columns:1fr}}
@media (max-width:640px){.fg-top-in span:not(.fg-top-hl){display:none}.fg-nav-in{min-height:64px}.fg-nav-cta .fg-btn{display:none}.fg-hero-in{padding:72px 20px 64px}.fg-sec,.fg-final{padding:68px 0}.fg-grid-2,.fg-grid-3,.fg-grid-4,.fg-pains,.fg-form{grid-template-columns:1fr}.fg-callbar{display:flex;position:fixed;left:12px;right:12px;bottom:12px;z-index:30;justify-content:center;align-items:center;gap:8px;background:var(--p);color:#fff!important;font-weight:700;padding:15px;border-radius:999px;box-shadow:0 14px 30px -10px rgba(0,0,0,.45)}.fg-foot{padding-bottom:72px}}
`;
}
