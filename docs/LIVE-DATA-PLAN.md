# Live-data plan for the opportunity workspace

Researched 9 October 2026 against official provider pages (links inline). Prices, limits and terms change:
re-check each before signing up. “Not verified” means the official page didn't confirm the point. Nothing was
purchased, enabled or signed up for. **None of the modules is production-ready**; this is a plan.

## Principles that shape every module

1. **Discover ≠ verify.** Discovery sources find *candidates* (search APIs, open datasets, news). Verification
   sources confirm a specific *claim* about one candidate: a registry entry, a certifier's database, the
   organisation's own page. The data model already separates these (`Evidence.kind`: published, supplier_claim,
   independently_verified, third_party, computed).
2. **Store what we may store.** Many search APIs forbid keeping or reselling their results. The safe pattern is:
   use search only to find URLs → fetch the source page directly (respecting robots.txt and site terms) → store
   our own extracted fact + short quote + source URL + date.
3. **Prefer open licences for anything shown to paying customers or exported:** CC0 (Wikidata, GLEIF),
   OGL v3 (UK government data), Census Bureau terms (with the required notice), Apache-2.0/CDLA (Foursquare OS
   Places / Overture). Share-alike licences (ODbL, CC BY-SA) need a legal decision before use in a resold product.
4. **Read-at-search-time does not scale for live sources.** Every module should move to a scheduled background
   sync into a local index (the app already runs a Vercel cron), so searches are fast, complete for the indexed
   window, and stay within provider rate limits.
5. **No invented contacts.** Only business contact channels the organisation publishes itself, each with a source
   link. UK PECR: corporate subscribers can be emailed, but sole traders and some partnerships count as individuals
   ([ICO](https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guide-to-pecr/electronic-and-telephone-marketing/electronic-mail-marketing/)).
   The app never sends outreach.

## Cross-cutting: web search APIs (discovery only)

| Provider | Status / price | Storage & redistribution |
|---|---|---|
| Google Custom Search JSON API | **Closed to new customers; discontinued 1 Jan 2027** ([Google](https://developers.google.com/custom-search/v1/overview)) | Don't build on it |
| Bing Search APIs | **Retired 11 Aug 2025** ([Microsoft](https://learn.microsoft.com/en-us/lifecycle/announcements/bing-search-api-retirement)) | Don't build on it |
| Brave Search API | $5 per 1,000 requests, $5 free credit/month ([Brave](https://brave.com/search/api/)) | ToS (updated 1 Sep 2026) prohibits storing results / building a database except transiently, and resale; a storage-rights plan is needed ([terms](https://api-dashboard.search.brave.com/terms-of-service)) |
| Exa | ~$7 per 1,000 searches, $10 free/month ([Exa](https://exa.ai/pricing)) | ToS §4.2 restricts displaying results and resale without written permission ([terms](https://exa.ai/terms)) |
| Tavily | 1,000 free credits/month, then $0.008/credit ([Tavily](https://www.tavily.com/pricing)) | Terms (4 May 2026) look more permissive for customer applications; Tavily may train on inputs/outputs — legal review needed ([terms](https://www.tavily.com/terms)) |
| Firecrawl | Free 1,000 credits; paid from ~$16/month ([pricing](https://www.firecrawl.dev/pricing)) | ToS (7 Oct 2026) §5.d.1: commercial use needs express authorisation ([terms](https://www.firecrawl.dev/terms-of-service)) |
| SERP scrapers | — | Avoid: legal risk (Google sued SerpApi in Dec 2025) |

**Recommendation:** don't start with a paid search API. If recall needs one later, pick one only after written
confirmation of storage/display rights for a resold app; use it to find URLs, never as stored evidence.

---

## 1. Sponsor Finder

| Source | Geography | Useful fields / gaps | Access & price | Store / show / export | Discover vs verify |
|---|---|---|---|---|---|
| **Wikidata** — property P859 “sponsor” | Global, skewed to notable organisations | Sponsor ↔ event/team/organisation links, often with references; website, country via other properties. Usually no dates or values; grassroots coverage thin (not measured) | Free SPARQL; 60 s/query, 5 parallel queries/IP, descriptive User-Agent ([manual](https://www.mediawiki.org/wiki/Wikidata_Query_Service/User_Manual), [P859](https://www.wikidata.org/wiki/Property:P859)) | **CC0** — yes ([licensing](https://www.wikidata.org/wiki/Wikidata:Licensing)) | Discovery seed; references help verification |
| **GDELT DOC 2.0** | Global news, rolling 3 months | Article URL, title, date, domain; ≤250 records/call; no company IDs | Free, no key (endpoint returned 503 during research) ([GDELT](https://blog.gdeltproject.org/gdelt-doc-2-0-api-debuts/)) | Commercial use and redistribution allowed with citation + link; article rights stay with publishers ([about](https://www.gdeltproject.org/about.html)) | Recent discovery; links to evidence |
| **Brand's own pages** (partnerships, community, press; schema.org `sponsor`) | Global | Primary dated evidence; the only good source of a published business contact | Direct fetch, robots.txt, site terms | Store URL, date, own summary, short quote | **Best verification** |
| **UK Companies House API** | UK | Name, number, status, SIC codes, registered office. **No website/email/phone** ([profile resource](https://developer-specs.company-information.service.gov.uk/companies-house-public-data-api/resources/companyprofile?v=latest)) | Free key; 600 requests / 5 min ([guidelines](https://developer.company-information.service.gov.uk/developer-guidelines)) | Company data is generally reused under OGL v3, but the API guidelines don't state the licence — confirm with Companies House; officer personal data makes you a UK GDPR controller | Verifies UK entity, industry, region |
| SEC EDGAR / GLEIF | US filers / global LEI holders | Entity facts; filings sometimes mention sponsorships | Free (EDGAR 10 req/s with contact User-Agent) | GLEIF CC0; EDGAR public | Entity matching |
| Wikipedia | Global | Sponsor sections in prose | Free API | CC BY-SA — store links/facts, not copied text | Discovery pointers |
| OpenCorporates | 140+ jurisdictions | Normalised registries | From £2,250/yr; free keys are share-alike ([pricing](https://opencorporates.com/pricing/)) | Paid terms needed for proprietary use | Verification only; costly |
| SponsorUnited / SponsorPitch | Mostly US sports & media / not verified | Deals, contacts | No public API or pricing | Not verified | Benchmark/partnership only |
| Apollo / PDL / Crunchbase | Global | Person-level contacts / firmographics | Custom / enterprise | Personal-data risk | **Out of scope** — conflicts with “never invent or broker contacts” |

**Recommended first integration: Wikidata P859 + Companies House**, joined through an evidence-first model:
free, live, and storable/exportable without licence friction (CC0 + OGL). Wikidata seeds “brand X sponsored Y”
with references; Companies House confirms the UK entity, status, SIC industry and region. Every sponsorship claim
is a row with source URL, publication date, retrieval date and source type; “no public evidence” stays explicit.
Expect thin SME/grassroots coverage — it's a seed, not a census.

**Second:** GDELT for recent “X sponsors Y” news, plus a polite fetcher for brands' own partnership/press/contact
pages (dated evidence, schema.org, published contact channel). Then GLEIF/EDGAR for US/EU entity matching.

## 2. Supplier and Manufacturer Finder

| Source | Geography / content | Access & price | Store / show / export | Discover vs verify |
|---|---|---|---|---|
| **UK Companies House** — advanced search by `sic_codes` (manufacturing = SIC 10–33), `location`, `company_status`; up to 5,000 results/page ([spec](https://developer-specs.company-information.service.gov.uk/companies-house-public-data-api/reference/search/advanced-company-search)) | UK legal entities | Free key, 600 req / 5 min | OGL v3, with attribution | Verifies identity/status; coarse discovery (SIC is self-declared; registered office ≠ factory) |
| **Supplier websites** (product pages, schema.org Organization/Product) | Any | Direct fetch | Store snippets + URL + date, not full pages | **Main source of claims**: products, MOQ, lead time, pricing, certifications claimed, contact page |
| **IAF CertSearch** (accredited ISO certificates) | Global | API; credits charged only on exact match; plan price/currency **not verified** ([credits](https://support.iafcertsearch.org/verification-users-api-developer-guide/api-integration/api-credit-consumption)) | Not verified | **Verifies ISO 9001/14001/45001…** |
| **BRCGS Directory** | Global food & packaging sites (current certificates only) | Directory Pro from £149; API add-on £499 (Commercial) / £1,049 (Enterprise) ([BRCGS](https://www.brcgs.com/product/directory-api/p-32872/)) | Contract terms; redistribution not verified | **Verifies via API** |
| GOTS, OEKO-TEX Label Check, FLOCERT (Fairtrade), UKAS CertCheck, FSC | Global / UK | Web lookup; no public API confirmed (FSC's new search in beta) ([GOTS](https://global-standards.org/suppliers/certified-suppliers), [OEKO-TEX](https://www.oeko-tex.com/en/label-check/), [UKAS](https://ukas.com/certcheck), [FSC](https://connect.fsc.org/fsc-public-certificate-search)) | Terms for automated access not stated | Verification by **guided manual check** (deep link; user records the result) |
| **Open Supply Hub** | Global production facilities, apparel-heavy | Search free; API $2,700–$21,300/yr ([OS Hub](https://info.opensupplyhub.org/api)) | CC BY-SA 4.0; ToS limits integration/competing registries ([terms](https://info.opensupplyhub.org/terms-of-service)) | Discovery; certification fields are claims |
| OpenCorporates / GLEIF / SAM.gov / EDGAR | Global / US | £2,250+/yr / free / free (SAM.gov personal key 10 req/day) ([SAM](https://open.gsa.gov/api/entity-api/)) | Share-alike / CC0 / not verified | Identity verification |
| Alibaba, Thomasnet, Europages, Global Sources | Marketplaces / directories | No usable official data licence found; anti-bot / ToS restrictions | Assume prohibited | **Link-out only** |
| Kompass; ImportYeti / ImportGenius / Panjiva (US customs bills of lading) | Global / US imports | Quote-based (third-party estimates not verified) | Usually restricted | Strong shipment evidence; later, licensed phase |
| US Census CBP | US aggregates | Free | No company lists by law | Not usable for supplier names |

**Recommended first integration: Companies House (identity) + supplier-website claim capture.** Free, commercially
reusable (OGL), and it delivers the core promise on day one: a verified legal identity anchor, with every
product/MOQ/lead-time/certification statement stored as a **supplier claim** with URL and capture time.
Certification status stays “Claimed”, “Not found” or “Not checkable automatically” until a scheme database confirms it.

**Second:** IAF CertSearch API for ISO certificates (pay per exact match), BRCGS API if food/packaging customers
matter, guided manual checks for GOTS/OEKO-TEX/FSC/Fairtrade/UKAS. Then evaluate Open Supply Hub (after legal review
of CC BY-SA and its ToS) and, if needed, one search API with storage rights for broader discovery.

## 3. Local Expansion Finder

| Source | Geography & finest level | Fields / gaps | Access & price | Store / show / export |
|---|---|---|---|---|
| **Nomis API (ONS)** | Great Britain; Census 2021 to OA, BRES to LSOA, **UK Business Counts by 5-digit SIC to MSOA** ([UKBC](https://www.nomisweb.co.uk/sources/ukbc)) | Population, age, households; registered enterprises/local units by SIC (VAT/PAYE-registered only); employment by industry | Free; 25,000 cells/query without a key, free Unique ID removes cap ([help](https://www.nomisweb.co.uk/api/v01/help)) | OGL v3 with the ONS attribution line ([licences](https://www.ons.gov.uk/methodology/geography/licences)) |
| ONS small-area population, Open Geography (boundaries, population-weighted centroids), Postcodes.io | UK | Mid-2024 LSOA/MSOA estimates; geometry | Free; Postcodes.io MIT, self-hostable | OGL + OS/Royal Mail attribution; **NI postcodes need an LPS licence for commercial use** |
| NRS (Scotland), NISRA (NI) | Data zones / OAs | Mostly CSV/ArcGIS; API not verified | Free | OGL |
| **US Census Data API** — ACS 5-year (tract/ZCTA), Population Estimates (county), County/ZIP Business Patterns by NAICS | US | Population, income, age, households; establishments by industry (suppressed where identifying). No business names | **Key now mandatory**, free; 50 variables/query ([key](https://www.census.gov/data/developers/guidance/api-user-guide.API_Key.html)) | Allowed with the required notice: “This product uses the Census Bureau Data API but is not endorsed or certified by the Census Bureau” ([ToS](https://www.census.gov/data/developers/about/terms-of-service.html)) |
| Census Geocoder / TIGER, BLS QCEW | US | Geometry; county establishments & wages | Free (BLS API 500 queries/day with registration) | Allowed |
| **Overture Places** | Global, monthly releases | POIs with `confidence` (existence only), new `taxonomy`; Overture warns of duplicates and junk ([guide](https://docs.overturemaps.org/guides/places/)) | Free download | CDLA-Permissive-2.0 / Apache-2.0 / CC0 by source ([attribution](https://docs.overturemaps.org/attribution/)) |
| **Foursquare OS Places** | Global | `date_closed`, `date_refreshed`, categories | Free portal token | Apache 2.0 ([docs](https://docs.foursquare.com/data-products/docs/fsq-places-open-source)) |
| OSM via Overpass | Global | Shop/amenity tags; completeness varies | Public server: “commercial use should use self-hosted or paid Overpass” ([wiki](https://wiki.openstreetmap.org/wiki/Overpass_API)) | ODbL; exported extracts may be share-alike derivative databases — legal review |
| Google Places API (New) incl. **Places Aggregate** (counts in an area) | Global, best coverage | Aggregate: 5,000 free then $10/1,000 ([pricing](https://developers.google.com/maps/billing-and-pricing/pricing)) | Billing account | Store place IDs only (lat/lng ≤30 days); no storing names/addresses; Google map only; **no CSV export** ([policies](https://developers.google.com/maps/documentation/places/web-service/policies)) |
| Yelp Places API, Mapbox Search | — | — | Yelp from $229/month | Yelp: no third-party/commercial database use; Mapbox: temporary use only — **excluded** |
| Map tiles | — | — | OSM tiles not for commercial products; Mapbox 50k free loads/month; MapTiler/Stadia paid plans for commercial use | — |

**Recommended first integrations:**
- **UK: Nomis API** — one free OGL source gives demographics (Census 2021), population change (mid-year estimates)
  and *registered* businesses by 5-digit SIC at MSOA, plus ONS boundaries/centroids for the map. Scotland and
  Northern Ireland need NRS/NISRA later; UK small-area income needs a separate source decision.
- **US: Census Data API** (free key) — ACS 5-year at tract or ZCTA, Population Estimates for growth, CBP/ZBP by
  NAICS for business density, TIGER for geometry, with the mandatory non-endorsement notice.

**Second step — competitor counts:** ingest Overture Places cross-checked with Foursquare OS Places into our own
database (storable and exportable with attribution); show “≥ N places found” next to the official registered-
business count with the data date, and never call an area low-competition when the POI count is well below the
official count. Optionally, Google Places Aggregate for on-screen-only live counts (no storage/export).

---

## 4. Tenders (already live) — next steps

Find a Tender is live and was fixed in this review (see `docs/OPPORTUNITIES.md`). To make it complete:
a scheduled sync of all open notices into a local index (instead of reading 3 days at search time), then
Contracts Finder (legacy below-threshold; strict rate limits), devolved portals where they publish OCDS,
TED (EU) and SAM.gov (US, free key).

## 5. Prioritised implementation plan

Effort is rough engineering time for one developer, excluding legal review.

| # | Work | Why first | Effort | Needs from you |
|---|---|---|---|---|
| 1 | **Background sync framework**: provider “sync” jobs on the existing cron, a local index table per module with source/licence/retrieved-at, freshness shown in UI, per-provider quotas | Every live module needs it; makes tender coverage complete and searches fast | 3–5 days | Approve cron frequency & hosting plan limits |
| 2 | **Tenders: full Find a Tender index** (incremental `updatedFrom`, keep open notices until deadline/award) | Biggest coverage gain for an already-working module | 2–3 days | — |
| 3 | **Expansion UK: Nomis + ONS geography** (MSOA/LSOA candidate areas, Census 2021, MYE, UK Business Counts by SIC, centroids; category→SIC mapping table) | Free, open licence, official; replaces the demo region with real areas | 5–8 days | Nomis Unique ID; decide GB-only vs UK; income source; category→SIC mapping review |
| 4 | **Expansion US: Census API** (ACS tract/ZCTA, PEP, CBP/ZBP, TIGER; NAICS mapping) | Same model, second market | 4–6 days | Census API key; tract vs ZCTA |
| 5 | **Suppliers: Companies House identity + website claim capture** (SIC 10–33 search, polite fetcher with robots.txt, schema.org/extraction into supplier-claim evidence; optional AI extraction behind the existing guard) | Delivers claims-vs-verified with zero licence risk | 6–9 days | Companies House API key; crawl policy (rate, robots, retention); decide whether AI extraction is allowed |
| 6 | **Sponsors: Wikidata P859 + Companies House + brand-page evidence** | Free CC0/OGL evidence base; honest “no public evidence” | 5–8 days | Contact policy (business channels only), User-Agent contact email |
| 7 | **Certification verification**: IAF CertSearch (ISO), BRCGS (food/packaging), guided manual checks for other schemes | Turns supplier claims into verified facts where possible | 4–6 days + vendor onboarding | Quotes & approval for IAF CertSearch / BRCGS; confirm their terms allow showing results to end customers |
| 8 | **Competitor counts**: Overture + Foursquare OS Places ingestion, dedupe, category mapping, lower-bound display | Needed for credible expansion comparisons | 5–7 days | Foursquare token; storage/refresh cadence; attribution text |
| 9 | **News discovery for sponsors** (GDELT) and, only if needed, one licensed search API | Recall beyond Wikidata | 3–5 days | Choice of search API after written storage/redistribution confirmation |
| 10 | Legal & product hardening: per-source attribution in UI/CSV, export policy per licence, data-retention, takedown/opt-out, DPIA where personal data appears | Required before reselling | ongoing | Legal sign-off |

## 6. Credentials and decisions needed from you

**Credentials (all free; you create them, add them as server-side environment variables, never share them in chat):**
- Companies House API key (suppliers, sponsors).
- Nomis Unique ID (UK expansion).
- US Census API key (US expansion).
- Foursquare Places Portal token (competitor counts, step 8).
- Optional later: SAM.gov API key (US tenders), Anthropic API key (AI summaries — billed per use).

**Decisions:**
1. Launch geography: UK only, GB only, or UK + US.
2. Whether a background sync on Vercel cron is acceptable (plan limits, run time), or a separate worker.
3. Crawl policy for business websites: rate limits, robots.txt, user-agent contact, snippet length, retention, opt-out.
4. Contact policy: only business channels published by the organisation itself; PECR handling for sole traders.
5. Licence policy: whether share-alike sources (ODbL/OSM, CC BY-SA/Open Supply Hub, Wikipedia text) are acceptable
   in a resold product, and per-source CSV export rules.
6. Whether to request quotes for IAF CertSearch and BRCGS Directory API (no purchase until you approve).
7. Whether any paid search API or Google Places is in scope (each needs written storage/display terms).
8. Category mapping ownership (business category → SIC2007 / NAICS / Overture / Foursquare taxonomies).
