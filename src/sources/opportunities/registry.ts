/**
 * Which providers serve which module in which mode. Swapping a data source means editing this list —
 * the rest of the product only sees normalised items.
 */
import type { DataMode, ModuleId } from "@/core/opportunities/types";
import { demoBusinessRegister, demoStatisticsOffice } from "./demo/expansion";
import { demoBrandDirectory, demoPartnershipsIndex } from "./demo/sponsors";
import { demoSupplierDirectory, demoTradeCatalogue } from "./demo/suppliers";
import { demoTenderBulletin, demoTenderPortal } from "./demo/tenders";
import { findATender } from "./find-a-tender";
import type { Provider, ProviderInfo } from "./types";

type AnyProvider = Provider<Record<string, unknown>>;
const p = (x: unknown) => x as AnyProvider;

const PROVIDERS: AnyProvider[] = [
  p(demoTenderPortal),
  p(demoTenderBulletin),
  p(findATender),
  p(demoBrandDirectory),
  p(demoPartnershipsIndex),
  p(demoSupplierDirectory),
  p(demoTradeCatalogue),
  p(demoStatisticsOffice),
  p(demoBusinessRegister),
];

/** Live sources that are planned but need a credential or a data-provider decision. Shown on the Sources page. */
export const PLANNED_LIVE: { module: ModuleId; name: string; needs: string }[] = [
  { module: "tenders", name: "Contracts Finder (UK, below-threshold notices)", needs: "Keyless OCDS API, but rate-limited to a few requests per minute — add once a background fetch/queue is acceptable." },
  { module: "tenders", name: "SAM.gov (US federal opportunities)", needs: "A free SAM.gov API key (SAM_GOV_API_KEY) and acceptance of its terms." },
  { module: "tenders", name: "TED (EU tenders)", needs: "Decision on TED API v3 search usage and its reuse terms." },
  { module: "sponsors", name: "Company / brand data", needs: "A licensed company-data provider (e.g. a business-information API) — no free source permits this use." },
  { module: "suppliers", name: "Supplier directories and certifier registers", needs: "A licensed supplier-data provider; certification checks need each certifier's register terms." },
  { module: "expansion", name: "US Census (ACS demographics, County Business Patterns)", needs: "A free Census API key (CENSUS_API_KEY) — the API now refuses keyless requests." },
  { module: "expansion", name: "UK ONS / Nomis small-area statistics", needs: "Choice of datasets and geography (LSOA/MSOA) and boundary centroids." },
];

export function providersFor(module: ModuleId, mode: DataMode): AnyProvider[] {
  return PROVIDERS.filter((x) => x.module === module && x.mode === mode);
}

export function allProviders(): AnyProvider[] {
  return PROVIDERS;
}

export function providerInfo(id: string): ProviderInfo | undefined {
  return PROVIDERS.find((x) => x.id === id);
}

/** Can this module search live right now? */
export function liveAvailability(module: ModuleId): { ok: boolean; reason: string } {
  const live = providersFor(module, "live");
  if (!live.length) return { ok: false, reason: "No live data source is connected for this module yet." };
  const avail = live.map((x) => x.available());
  if (avail.some((a) => a.ok)) return { ok: true, reason: "" };
  return { ok: false, reason: avail.map((a) => (a.ok ? "" : a.reason)).join("; ") };
}
