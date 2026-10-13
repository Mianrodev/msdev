import "../opportunities/opportunities.css";
import Link from "next/link";
import { BRANDS, brandCss, type ColorTokens } from "@/brand/brands";
import { DEFAULT_COPY } from "@/brand/copy";
import { AreaMap } from "@/components/opportunities/area-map";
import { Icon } from "@/components/opportunities/icons";
import { ResultCard } from "@/components/opportunities/results";
import { Banner, Chip, EmptyState, FieldRow, LogoMark, ModeChip, ScoreBreakdown, ScoreRing } from "@/components/opportunities/ui";
import { one, type SearchParams } from "@/components/ui";
import { combine, known, unknown } from "@/core/opportunities/fields";
import { parseDeadline } from "@/core/opportunities/dates";
import { parseMoney } from "@/core/opportunities/money";
import { moduleDef } from "@/core/opportunities/modules";
import type { Evidence, MatchResult } from "@/core/opportunities/types";
import type { OppItemRow } from "@/db/schema";
import { getSession } from "@/services/request";

export const dynamic = "force-dynamic";

const ev = (kind: Evidence["kind"], label: string): Evidence => ({ kind, provider: "preview", sourceUrl: "https://source.example/preview", retrievedAt: "2026-10-09T09:00:00.000Z", publishedAt: "2026-10-01", quote: null, label });

const SAMPLE_MATCH: MatchResult = {
  score: 78.5,
  coverage: 0.8,
  components: [
    { key: "keywords", label: "Search keywords", weight: 20, score: 1, detail: "Matched 2 of 2: accessibility, website" },
    { key: "services", label: "Your services (profile)", weight: 25, score: 0.67, detail: "Matches your services: website design, accessibility" },
    { key: "budget", label: "Budget fit", weight: 10, score: null, detail: "Not published" },
    { key: "deadline", label: "Time to prepare", weight: 15, score: 0.6, detail: "9 days left" },
  ],
  reasons: ["Mentions “accessibility”, “website”.", "You hold Cyber Essentials, which the notice mentions."],
  flags: ["Budget not published — no value was assumed.", "Only 9 days to prepare (you need about 14)."],
};

function sampleItem(): OppItemRow {
  const dl = parseDeadline("2026-11-02T12:00:00Z")!;
  return {
    id: "preview",
    workspaceId: "preview",
    module: "tenders",
    mode: "demo",
    dedupKey: "preview",
    provider: "demo-tender-portal",
    title: "Website redesign and accessibility improvements",
    subtitle: "Harbourside City Council (fictional)",
    sourceUrl: "https://notices.demo-portal.example/notice/DEMO-2026-0141",
    retrievedAt: "2026-10-09T09:00:00.000Z",
    publishedAt: "2026-10-03",
    fields: {
      buyer: known("Harbourside City Council", ev("published", "Notice")),
      deadline: known(dl, ev("published", "Notice"), dl.raw),
      budget: unknown("Budget not published"),
      geography: known(["Northshire", "United Kingdom"], ev("published", "Notice")),
      opportunityType: known("Services", ev("published", "Notice")),
    } as unknown as Record<string, unknown>,
    links: [],
    enrichment: null,
    lastMatch: null,
    lastSearchId: null,
    savedAt: "2026-10-09T09:00:00.000Z",
    status: "reviewing",
    createdAt: "2026-10-09T09:00:00.000Z",
    updatedAt: "2026-10-09T09:00:00.000Z",
  };
}

const TOKEN_KEYS: (keyof ColorTokens)[] = ["bg", "surface", "surface2", "text", "muted", "border", "accent", "accentSoft", "ok", "okBg", "warn", "warnBg", "bad", "badBg", "demo", "demoBg", "focus"];

export default async function DesignPage({ searchParams }: { searchParams: SearchParams }) {
  await getSession();
  const sp = await searchParams;
  const brand = BRANDS[one(sp.brand) ?? ""] ?? BRANDS[process.env.BRAND ?? "default"] ?? BRANDS.default;
  const scope = `.brand-preview-${brand.id}`;
  const tenders = moduleDef("tenders");
  const suppliers = moduleDef("suppliers");
  const deadline = parseDeadline("14 November 2026, 17:00 GMT")!;
  const fields = {
    known: known("Harbourside City Council", ev("published", "Notice")),
    unknown: unknown("Not published in the notice data"),
    critical: known(deadline, ev("published", "Notice"), deadline.raw),
    conflict: combine(known(parseMoney("£30,000"), ev("published", "Portal A"), "£30,000"), known(parseMoney("£35,000"), ev("published", "Portal B"), "£35,000")),
    certs: known(
      [
        { name: "GOTS", status: "independently_verified", sourceUrl: "https://register.example/gots", checkedAt: "2026-10-01" },
        { name: "ISO 9001", status: "supplier_claim", sourceUrl: "https://supplier.example/certs", checkedAt: null },
      ],
      [ev("independently_verified", "Certifier register"), ev("supplier_claim", "Supplier's certificates page")],
    ),
  };

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: brandCss(brand, scope) }} />
      <h1>Design system preview</h1>
      <p className="intro">
        Every reusable component and variant used by the opportunity workspace, rendered with a brand&apos;s tokens. Switch brands to see the same components restyled. Tokens live in <code>src/brand/brands.ts</code>; copy in <code>src/brand/copy.ts</code>; see <code>docs/DESIGNERS.md</code>.
      </p>
      <nav className="op-seg" aria-label="Brand" style={{ marginBottom: "var(--space-4)" }}>
        {Object.values(BRANDS).map((b) => (
          <Link key={b.id} href={`/design?brand=${b.id}`} aria-current={b.id === brand.id ? "true" : undefined}>
            {b.productName}
          </Link>
        ))}
      </nav>

      <div className={`op-brand-preview ${scope.slice(1)}`}>
        <div className="op-gallery">
          <section>
            <div className="op-head">
              <div className="row" style={{ gap: "var(--space-3)" }}>
                <LogoMark brand={brand} />
                <div>
                  <div className="op-eyebrow">{brand.appName}</div>
                  <h2 style={{ margin: 0, fontSize: "1.6rem" }}>{brand.productName}</h2>
                </div>
              </div>
            </div>
            <p className="muted">{brand.tagline}</p>
          </section>

          <section aria-labelledby="g-colours">
            <h2 id="g-colours">Colour tokens (light; dark mode follows the system setting)</h2>
            <div className="op-swatches">
              {TOKEN_KEYS.map((k) => (
                <div key={k} className="op-swatch">
                  <i style={{ background: brand.light[k] }} />
                  <span>
                    {k}
                    <br />
                    {brand.light[k]}
                  </span>
                </div>
              ))}
            </div>
          </section>

          <section aria-labelledby="g-type">
            <h2 id="g-type">Typography, radii, shadows</h2>
            <h1 style={{ margin: 0 }}>Heading 1 — {brand.fonts.heading.split(",")[0]}</h1>
            <h2 style={{ margin: ".3rem 0" }}>Heading 2</h2>
            <h3 style={{ margin: ".3rem 0" }}>Heading 3</h3>
            <p>Body text at {brand.fonts.baseSize}. Unknown values look like <span className="op-unknown">Unknown — not published</span>; conflicts like <span className="op-conflict">⚠ Conflicting: £30,000 vs £35,000</span>.</p>
            <div className="row">
              {(["sm", "md", "lg"] as const).map((s) => (
                <div key={s} style={{ width: 120, height: 64, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: brand.radius[s], boxShadow: brand.shadow[s], display: "grid", placeItems: "center" }} className="small">
                  radius/shadow {s}
                </div>
              ))}
            </div>
          </section>

          <section aria-labelledby="g-controls">
            <h2 id="g-controls">Buttons, chips and badges</h2>
            <div className="row">
              <button className="primary">Primary</button>
              <button>Secondary</button>
              <button className="small">Small</button>
              <button className="danger">Danger</button>
              <button disabled>Disabled</button>
            </div>
            <div className="row" style={{ marginTop: "var(--space-2)" }}>
              <ModeChip mode="demo" />
              <ModeChip mode="live" />
              {(["neutral", "info", "ok", "warn", "bad"] as const).map((t) => (
                <Chip key={t} tone={t}>
                  Chip · {t}
                </Chip>
              ))}
            </div>
            <div className="row" style={{ marginTop: "var(--space-2)" }}>
              {["overview", "tenders", "sponsors", "suppliers", "expansion", "saved", "profile", "sources", "search", "alert", "design"].map((n) => (
                <span key={n} title={n} style={{ display: "inline-flex", width: 28, height: 28, color: "var(--accent)" }}>
                  <Icon name={n} />
                </span>
              ))}
            </div>
          </section>

          <section aria-labelledby="g-banners">
            <h2 id="g-banners">Banners (search states)</h2>
            <Banner tone="demo" title="Demo data">{DEFAULT_COPY["demo.banner"]}</Banner>
            <Banner tone="warn" title="Partial results" icon="alert">
              1 of 2 sources didn&apos;t answer, so some matches may be missing.
            </Banner>
            <Banner tone="bad" title="This search didn't complete" icon="alert">
              No source answered. No demo data was used.
            </Banner>
            <Banner tone="ok" title="Deadline: 24 days left">Published as “2026-11-02T12:00:00Z” (UTC).</Banner>
            <Banner tone="info" title="Tip">Add your company profile for better matches.</Banner>
          </section>

          <section aria-labelledby="g-score">
            <h2 id="g-score">Scores</h2>
            <div className="row" style={{ gap: "var(--space-4)" }}>
              <ScoreRing match={SAMPLE_MATCH} />
              <ScoreRing match={{ ...SAMPLE_MATCH, score: 34, coverage: 0.45 }} />
              <ScoreRing match={{ ...SAMPLE_MATCH, score: null, coverage: 0 }} />
            </div>
            <div className="op-panel" style={{ marginTop: "var(--space-3)" }}>
              <ScoreBreakdown match={SAMPLE_MATCH} />
            </div>
          </section>

          <section aria-labelledby="g-fields">
            <h2 id="g-fields">Field rows (evidence variants)</h2>
            <div className="op-panel">
              <dl className="op-fields">
                <FieldRow def={tenders} k="buyer" field={fields.known} />
                <FieldRow def={tenders} k="deadline" field={fields.critical} />
                <FieldRow def={tenders} k="budget" field={fields.conflict} />
                <FieldRow def={tenders} k="eligibility" field={fields.unknown} />
                <FieldRow def={suppliers} k="certifications" field={fields.certs} />
              </dl>
            </div>
          </section>

          <section aria-labelledby="g-card">
            <h2 id="g-card">Result card</h2>
            <ul className="op-results">
              <ResultCard module="tenders" def={tenders} row={{ item: sampleItem(), match: SAMPLE_MATCH, rank: 1 }} back="/design" />
            </ul>
          </section>

          <section aria-labelledby="g-map">
            <h2 id="g-map">Map</h2>
            <AreaMap
              caption="Example areas"
              points={[
                { id: "a", name: "Old Town", lat: 52.408, lng: -1.51, rank: 1, score: 81, href: "/design" },
                { id: "b", name: "Canal Quarter", lat: 52.414, lng: -1.488, rank: 2, score: 64, href: "/design" },
                { id: "c", name: "Hillcrest", lat: 52.395, lng: -1.47, rank: 3, score: 41, href: "/design" },
                { id: "d", name: "Riverside", lat: 52.425, lng: -1.455, rank: 4, score: null, href: "/design" },
              ]}
            />
          </section>

          <section aria-labelledby="g-empty">
            <h2 id="g-empty">Empty and loading states</h2>
            <EmptyState title={DEFAULT_COPY["search.empty.title"]}>
              <p>{DEFAULT_COPY["search.empty.body"]}</p>
            </EmptyState>
            <div style={{ display: "grid", gap: ".6rem", marginTop: "var(--space-3)" }} aria-hidden="true">
              <div className="op-skel" style={{ height: "1.4rem", width: "50%" }} />
              <div className="op-skel" style={{ height: "6rem" }} />
            </div>
            <ol className="op-progress">
              <li className="done">
                <span className="dot" /> Contacting sources
              </li>
              <li className="on">
                <span className="dot" /> Ranking against your criteria…
              </li>
              <li>
                <span className="dot" /> Saving evidence
              </li>
            </ol>
          </section>
        </div>
      </div>
    </>
  );
}
