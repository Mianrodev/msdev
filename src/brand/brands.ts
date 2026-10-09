/**
 * Brand configurations. One deployment = one brand, chosen with the BRAND environment variable
 * (server-side). Everything visual is a token here; components only read CSS variables, so a new
 * brand never needs a code change outside this folder. See docs/DESIGNERS.md.
 */

export interface ColorTokens {
  bg: string;
  surface: string;
  surface2: string;
  text: string;
  muted: string;
  border: string;
  accent: string;
  accentSoft: string;
  accentText: string;
  ok: string;
  okBg: string;
  warn: string;
  warnBg: string;
  bad: string;
  badBg: string;
  /** Used only for "demo data" labelling — keep it distinct from status colours. */
  demo: string;
  demoBg: string;
  focus: string;
}

export interface Brand {
  id: string;
  /** Shown in the top bar and page titles. */
  appName: string;
  /** Name of the opportunity-discovery workspace inside the app. */
  productName: string;
  tagline: string;
  /** Two letters for the logo mark (or replace LogoMark in components/opportunities/ui.tsx with an SVG). */
  logoMark: string;
  fonts: { body: string; heading: string; mono: string; baseSize: string };
  radius: { sm: string; md: string; lg: string; pill: string };
  shadow: { sm: string; md: string; lg: string };
  /** Base spacing unit; the scale is 0.25×, 0.5×, 1×, 1.5×, 2×, 3× of it. */
  space: string;
  light: ColorTokens;
  dark: ColorTokens;
  /** Interface copy overrides (see brand/copy.ts for every key). */
  copy?: Partial<Record<string, string>>;
}

const SYSTEM_SANS = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

/** The existing Prospect CRM look — the default, so current users see no change. */
export const defaultBrand: Brand = {
  id: "default",
  appName: "Prospect CRM",
  productName: "Opportunity Desk",
  tagline: "Find tenders, sponsors, suppliers and locations — with the evidence behind every fact.",
  logoMark: "PC",
  fonts: { body: SYSTEM_SANS, heading: SYSTEM_SANS, mono: MONO, baseSize: "16px" },
  radius: { sm: "8px", md: "10px", lg: "16px", pill: "999px" },
  shadow: { sm: "0 1px 2px rgb(0 0 0 / .06)", md: "0 4px 14px rgb(0 0 0 / .08)", lg: "0 12px 32px rgb(0 0 0 / .12)" },
  space: "1rem",
  light: {
    bg: "#f6f6f3", surface: "#ffffff", surface2: "#efefea", text: "#1b1b19", muted: "#5f5f59", border: "#deded7",
    accent: "#2b55cc", accentSoft: "#e8eefc", accentText: "#ffffff", ok: "#17693f", okBg: "#e3f3ea", warn: "#7d5200", warnBg: "#fcf1d8",
    bad: "#a8231b", badBg: "#fbe7e5", demo: "#6b2fa8", demoBg: "#f1e8fb", focus: "#2b55cc",
  },
  dark: {
    bg: "#141413", surface: "#1d1d1b", surface2: "#272724", text: "#ededea", muted: "#a8a8a0", border: "#35352f",
    accent: "#86a4f7", accentSoft: "#1f2940", accentText: "#0e1320", ok: "#86d8a8", okBg: "#15301f", warn: "#f2c870", warnBg: "#33290f",
    bad: "#f4a39b", badBg: "#3b1d1a", demo: "#d2b2f5", demoBg: "#2c1d3d", focus: "#86a4f7",
  },
};

/** Example 1: a formal, bid-focused brand for consultancies (navy + teal, serif headings, tight radii). */
export const meridianBrand: Brand = {
  id: "meridian",
  appName: "Meridian",
  productName: "Meridian Bid Intelligence",
  tagline: "Public-sector opportunities, sponsors and suppliers — sourced, dated and explained.",
  logoMark: "Me",
  fonts: { body: '"Inter", ' + SYSTEM_SANS, heading: 'Georgia, "Times New Roman", serif', mono: MONO, baseSize: "15px" },
  radius: { sm: "3px", md: "5px", lg: "8px", pill: "4px" },
  shadow: { sm: "0 1px 0 rgb(12 30 60 / .08)", md: "0 2px 8px rgb(12 30 60 / .10)", lg: "0 10px 24px rgb(12 30 60 / .14)" },
  space: "0.95rem",
  light: {
    bg: "#f3f5f8", surface: "#ffffff", surface2: "#e9edf3", text: "#0f1d33", muted: "#4f5d73", border: "#d3dae5",
    accent: "#0d6e75", accentSoft: "#e0f1f2", accentText: "#ffffff", ok: "#1b6b3a", okBg: "#e2f2e7", warn: "#80530a", warnBg: "#fbf0dc",
    bad: "#a1251f", badBg: "#f9e5e3", demo: "#5b3aa6", demoBg: "#ece6fa", focus: "#0d6e75",
  },
  dark: {
    bg: "#0b1422", surface: "#111d2f", surface2: "#1a2940", text: "#e7edf6", muted: "#9eabc0", border: "#2a3b55",
    accent: "#5cc3c9", accentSoft: "#123438", accentText: "#06181a", ok: "#8fd6a7", okBg: "#12301e", warn: "#f0c777", warnBg: "#33280e",
    bad: "#f2a29a", badBg: "#3a1c19", demo: "#c9b5f5", demoBg: "#271d40", focus: "#5cc3c9",
  },
  copy: {
    "workspace.intro": "Search public tenders, potential sponsors, suppliers and locations. Every fact links to its source; every score shows its working.",
    "module.tenders.name": "Bids & tenders",
    "module.expansion.name": "Site selection",
  },
};

/** Example 2: a friendly growth brand for small businesses and event organisers (green + amber, rounded). */
export const fieldstoneBrand: Brand = {
  id: "fieldstone",
  appName: "Fieldstone",
  productName: "Fieldstone Growth Finder",
  tagline: "Grow with confidence: sponsors, suppliers and new locations, with sources you can check.",
  logoMark: "Fs",
  fonts: { body: '"Nunito Sans", ' + SYSTEM_SANS, heading: '"Trebuchet MS", ' + SYSTEM_SANS, mono: MONO, baseSize: "16px" },
  radius: { sm: "10px", md: "16px", lg: "24px", pill: "999px" },
  shadow: { sm: "0 1px 3px rgb(40 50 20 / .08)", md: "0 6px 18px rgb(40 50 20 / .10)", lg: "0 16px 40px rgb(40 50 20 / .14)" },
  space: "1.05rem",
  light: {
    bg: "#f7f5ef", surface: "#fffdf8", surface2: "#efebe0", text: "#22251c", muted: "#5f6455", border: "#e0dbcd",
    accent: "#2f7d4a", accentSoft: "#e3f2e7", accentText: "#ffffff", ok: "#2a6e3c", okBg: "#e2f1e6", warn: "#8a5a00", warnBg: "#fdefd2",
    bad: "#a33a1f", badBg: "#fbe6df", demo: "#7a3d9a", demoBg: "#f3e7f8", focus: "#c77d0a",
  },
  dark: {
    bg: "#151712", surface: "#1d2019", surface2: "#272b22", text: "#eeeee6", muted: "#aab0a0", border: "#363b2f",
    accent: "#7fcf97", accentSoft: "#1b3324", accentText: "#0b1a10", ok: "#8fd6a3", okBg: "#14301d", warn: "#f3c66d", warnBg: "#34290d",
    bad: "#f2a690", badBg: "#3a1e16", demo: "#dcb6ef", demoBg: "#2e1d38", focus: "#f3b54a",
  },
  copy: {
    "workspace.intro": "Find sponsors, suppliers, tenders and new locations for your business — every result shows where its facts come from.",
    "module.sponsors.name": "Sponsors & partners",
    "module.expansion.name": "New locations",
  },
};

export const BRANDS: Record<string, Brand> = { default: defaultBrand, meridian: meridianBrand, fieldstone: fieldstoneBrand };

/** The deployment's brand (server-side). Unknown values fall back to the default. */
export function activeBrand(): Brand {
  return BRANDS[process.env.BRAND ?? "default"] ?? defaultBrand;
}

const kebab = (s: string) => s.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);

function colorVars(c: ColorTokens): string {
  // Short names keep the existing stylesheet's variables (--bg, --accent, --ok-bg …) working.
  return Object.entries(c)
    .map(([k, v]) => `--${kebab(k).replace(/^surface2$/, "surface-2").replace("surface2", "surface-2")}:${v};`)
    .join("");
}

function scaleVars(b: Brand): string {
  const s = b.space;
  return [
    `--font-body:${b.fonts.body};`,
    `--font-heading:${b.fonts.heading};`,
    `--font-mono:${b.fonts.mono};`,
    `--font-size-base:${b.fonts.baseSize};`,
    `--radius:${b.radius.md};`,
    `--radius-sm:${b.radius.sm};`,
    `--radius-lg:${b.radius.lg};`,
    `--radius-pill:${b.radius.pill};`,
    `--shadow-sm:${b.shadow.sm};`,
    `--shadow-md:${b.shadow.md};`,
    `--shadow-lg:${b.shadow.lg};`,
    `--space-1:calc(${s} * .25);`,
    `--space-2:calc(${s} * .5);`,
    `--space-3:${s};`,
    `--space-4:calc(${s} * 1.5);`,
    `--space-5:calc(${s} * 2);`,
    `--space-6:calc(${s} * 3);`,
  ].join("");
}

/** CSS custom properties for a brand, scoped to `selector` (":root" for the app; a wrapper for previews). */
export function brandCss(b: Brand, selector = ":root"): string {
  return `${selector}{${scaleVars(b)}${colorVars(b.light)}color-scheme:light;}@media (prefers-color-scheme: dark){${selector}{${colorVars(b.dark)}color-scheme:dark;}}`;
}
