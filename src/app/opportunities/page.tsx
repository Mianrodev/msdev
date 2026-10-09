import Link from "next/link";
import { activeBrand } from "@/brand/brands";
import { copyFor } from "@/brand/copy";
import { Banner, Chip, LogoMark, ModeChip, ModuleCard } from "@/components/opportunities/ui";
import { fmtWhen } from "@/components/plain";
import { MODULE_IDS, type ModuleId } from "@/core/opportunities/types";
import { savedCounts } from "@/services/opportunities/items";
import { getProfile } from "@/services/opportunities/profile";
import { recentSearches } from "@/services/opportunities/search";
import { getCtx } from "@/services/request";
import { liveAvailability } from "@/sources/opportunities/registry";
import { aiEnrichmentStatus } from "@/sources/opportunities/ai-enricher";

export const dynamic = "force-dynamic";

export default async function OpportunitiesHome() {
  const ctx = await getCtx();
  const brand = activeBrand();
  const { t, mod } = copyFor();
  const [counts, recent, profile] = await Promise.all([savedCounts(ctx), recentSearches(ctx, undefined, 8), getProfile(ctx)]);
  const live = MODULE_IDS.filter((m) => liveAvailability(m).ok);
  const ai = aiEnrichmentStatus();
  return (
    <>
      <div className="op-head">
        <div className="row" style={{ gap: "var(--space-3)" }}>
          <LogoMark brand={brand} />
          <div>
            <div className="op-eyebrow">{brand.productName}</div>
            <h1>{t("workspace.title")}</h1>
          </div>
        </div>
      </div>
      <p className="intro">{t("workspace.intro")}</p>

      {!profile.services.length && (
        <Banner tone="info" title="Add your company profile for better tender matches">
          <p style={{ margin: ".2rem 0" }}>
            Tender results explain how each one fits your services, regions, contract sizes and certifications. <Link href="/opportunities/profile">Set up your profile →</Link>
          </p>
        </Banner>
      )}

      <div className="op-modules" style={{ marginBottom: "var(--space-5)" }}>
        {MODULE_IDS.map((id) => (
          <ModuleCard key={id} id={id} saved={counts[id] ?? 0} />
        ))}
      </div>

      <div className="grid cols-2">
        <section className="op-panel" aria-labelledby="recent-h">
          <h2 id="recent-h">Recent searches</h2>
          {recent.length ? (
            <ul className="plain">
              {recent.map((s) => (
                <li key={s.id}>
                  <div className="spread" style={{ gap: ".5rem" }}>
                    <Link href={`/opportunities/${s.module}?search=${s.id}`}>
                      {mod(s.module as ModuleId, "name")}: {s.summary}
                    </Link>
                    <span className="row" style={{ gap: ".3rem" }}>
                      <ModeChip mode={s.mode} />
                      <Chip tone={s.status === "complete" ? "ok" : s.status === "partial" ? "warn" : "bad"}>
                        {s.status === "complete" ? `${s.resultCount} results` : s.status === "partial" ? `Partial · ${s.resultCount}` : "Failed"}
                      </Chip>
                    </span>
                  </div>
                  <div className="muted small">{fmtWhen(s.startedAt)}</div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">No searches yet. Pick a module above — demo mode works straight away.</p>
          )}
        </section>
        <section className="op-panel" aria-labelledby="data-h">
          <h2 id="data-h">Data in this workspace</h2>
          <ul className="op-list-plain">
            <li>
              <ModeChip mode="demo" /> All four modules have fictional demo sources, clearly labelled everywhere.
            </li>
            <li>
              <ModeChip mode="live" /> {live.length ? `Live search available for: ${live.map((m) => mod(m, "name")).join(", ")}.` : "No live sources are switched on."}
            </li>
            <li>
              <Chip tone={ai.enabled ? "ok" : "neutral"}>AI summaries {ai.enabled ? "on" : "off"}</Chip> {ai.enabled ? `On request, using ${ai.model}; always labelled.` : ai.reason}
            </li>
          </ul>
          <p className="small" style={{ marginTop: "var(--space-3)" }}>
            <Link href="/opportunities/sources">See every source, its licence and what it needs →</Link>
          </p>
        </section>
      </div>
    </>
  );
}
