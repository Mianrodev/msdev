import Link from "next/link";
import { notFound } from "next/navigation";
import { addToListAction, aiSummaryAction, createListAction, noteAction, removeFromListAction, saveAction, statusAction, unsaveAction } from "../../actions";
import { copyFor } from "@/brand/copy";
import { AutoSubmitSelect, PendingButton } from "@/components/opportunities/client";
import { Banner, Chip, DemoBanner, ExtLink, FieldRow, ModeChip, ScoreBreakdown, ScoreRing, StatusChip } from "@/components/opportunities/ui";
import { BackLink, Flash, one, type SearchParams } from "@/components/ui";
import { fmtWhen } from "@/components/plain";
import { checkDeadline, fmtDate, type Deadline } from "@/core/opportunities/dates";
import { completeness, sourcesOf, valueOf } from "@/core/opportunities/fields";
import { moduleDef } from "@/core/opportunities/modules";
import { suggestedAngle, sponsorQuery } from "@/core/opportunities/modules/sponsors";
import { EVIDENCE_LABELS, isModuleId, type MatchResult } from "@/core/opportunities/types";
import { getItem, listLists, listNotes, listsForItem, NotFoundError, toNormalized } from "@/services/opportunities/items";
import { getSearch } from "@/services/opportunities/search";
import { getCtx } from "@/services/request";
import { aiEnrichmentStatus } from "@/sources/opportunities/ai-enricher";
import { providerInfo } from "@/sources/opportunities/registry";

export const dynamic = "force-dynamic";

export default async function DetailPage({ params, searchParams }: { params: Promise<{ module: string; id: string }>; searchParams: SearchParams }) {
  const { module, id } = await params;
  if (!isModuleId(module)) notFound();
  const sp = await searchParams;
  const ctx = await getCtx();
  let row;
  try {
    row = await getItem(ctx, id);
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }
  if (row.module !== module) notFound();
  const def = moduleDef(module);
  const { t } = copyFor();
  const it = toNormalized(row);
  const match = row.lastMatch as unknown as MatchResult | null;
  const searchId = one(sp.search) ?? row.lastSearchId ?? undefined;
  const search = row.lastSearchId ? await getSearch(ctx, row.lastSearchId) : null;
  const [notes, lists, inLists] = await Promise.all([listNotes(ctx, id), listLists(ctx, module), listsForItem(ctx, id)]);
  const back = `/opportunities/${module}/${id}${searchId ? `?search=${searchId}` : ""}`;
  const providers = row.provider.split("+").map((p) => providerInfo(p));
  const comp = completeness(it.fields, def.keyFields);
  const ai = aiEnrichmentStatus();
  const enr = row.enrichment as { summary?: string; keyPoints?: string[]; caveats?: string[]; model?: string; generatedAt?: string } | null;
  const deadline = module === "tenders" ? (valueOf(it.fields.deadline) as Deadline | null) : null;
  const dl = module === "tenders" ? checkDeadline(deadline) : null;
  const angle = module === "sponsors" && search ? suggestedAngle(it, sponsorQuery.parse(search.query)) : null;
  const statusOptions = [{ value: "", label: "Not saved" }, ...def.statuses.map((s) => ({ value: s.id, label: s.label }))];

  return (
    <>
      <Flash sp={sp} />
      <BackLink href={searchId ? `/opportunities/${module}?search=${searchId}` : `/opportunities/${module}`}>Back to results</BackLink>
      <div className="op-head" style={{ alignItems: "flex-start" }}>
        <div style={{ minWidth: 0 }}>
          <div className="row" style={{ gap: ".35rem", marginBottom: ".3rem" }}>
            <ModeChip mode={row.mode} />
            <StatusChip module={module} status={row.status} />
          </div>
          <h1>{row.title}</h1>
          {row.subtitle && <p className="intro" style={{ margin: 0 }}>{row.subtitle}</p>}
        </div>
      </div>
      {row.mode === "demo" && <DemoBanner />}

      <div className="op-detail">
        <div>
          {dl && (
            <Banner tone={dl.status === "passed" ? "bad" : dl.status === "open" ? "ok" : "warn"} title={`Deadline: ${dl.label}`}>
              <p style={{ margin: ".2rem 0" }}>
                {deadline ? (
                  <>
                    Published as “{deadline.raw}”{deadline.timezone ? ` (${deadline.timezone})` : ""}. {deadline.notes.join(". ")}
                  </>
                ) : (
                  "No deadline was published in the source data."
                )}{" "}
                Status according to the source: {def.formatField("noticeStatus", it.fields.noticeStatus)}. Always confirm on the original notice before preparing a bid.
              </p>
            </Banner>
          )}

          {match && (
            <section className="op-panel" aria-labelledby="why-h">
              <div className="spread">
                <h2 id="why-h" style={{ margin: 0 }}>
                  Why it&apos;s here
                </h2>
                <ScoreRing match={match} />
              </div>
              {match.excluded && <p style={{ color: "var(--bad)", fontWeight: 600 }}>{match.excluded}</p>}
              {match.reasons.length > 0 && (
                <>
                  <h3>{module === "expansion" ? "Strengths" : "Matches"}</h3>
                  <ul>
                    {match.reasons.map((r) => (
                      <li key={r}>{r}</li>
                    ))}
                  </ul>
                </>
              )}
              {match.tradeoffs && match.tradeoffs.length > 0 && (
                <>
                  <h3>Tradeoffs</h3>
                  <ul>
                    {match.tradeoffs.map((r) => (
                      <li key={r}>{r}</li>
                    ))}
                  </ul>
                </>
              )}
              {match.flags.length > 0 && (
                <>
                  <h3>Check before relying on this</h3>
                  <ul>
                    {match.flags.map((r) => (
                      <li key={r}>{r}</li>
                    ))}
                  </ul>
                </>
              )}
              {match.gaps && match.gaps.length > 0 && (
                <details>
                  <summary>Research gaps ({match.gaps.length})</summary>
                  <ul>
                    {match.gaps.map((g) => (
                      <li key={g}>{g}</li>
                    ))}
                  </ul>
                </details>
              )}
              <h3>Score breakdown</h3>
              <ScoreBreakdown match={match} />
              <p className="muted small">
                {t("results.scoreHelp")} {search ? <>Scored for your search “{search.summary}” on {fmtWhen(search.finishedAt)}.</> : null}
              </p>
            </section>
          )}

          {angle && (
            <section className="op-panel" aria-labelledby="angle-h">
              <h2 id="angle-h">
                Suggested angle <Chip tone="info">Suggestion</Chip>
              </h2>
              <p>{angle}</p>
              <p className="muted small">Built by rules from the public evidence below and your search. It is not a claim about what the brand wants. {t("detail.noOutreach")}</p>
            </section>
          )}

          <section className="op-panel" aria-labelledby="facts-h">
            <div className="spread">
              <h2 id="facts-h" style={{ margin: 0 }}>
                Facts and evidence
              </h2>
              <Chip tone={comp.ratio >= 0.8 ? "ok" : comp.ratio >= 0.5 ? "warn" : "bad"} title={`Unknown: ${comp.missing.map((k) => def.fieldLabels[k] ?? k).join(", ") || "none"}`}>
                Evidence completeness {Math.round(comp.ratio * 100)}%
              </Chip>
            </div>
            <p className="muted small">
              {t("detail.evidenceHelp")} Fields marked <span style={{ color: "var(--accent)" }}>●</span> are consequential: their original wording is kept next to any normalised value.
            </p>
            <dl className="op-fields">
              {Object.keys(def.fieldLabels).map((k) => (
                <FieldRow key={k} def={def} k={k} field={it.fields[k]} />
              ))}
            </dl>
          </section>

          <section className={`op-panel${enr?.summary ? " op-ai" : ""}`} aria-labelledby="ai-h">
            <h2 id="ai-h">AI summary</h2>
            {enr?.summary ? (
              <>
                <Chip tone="neutral">{EVIDENCE_LABELS.ai_summary} · {enr.model} · {fmtWhen(enr.generatedAt)}</Chip>
                <p>{enr.summary}</p>
                {enr.keyPoints && enr.keyPoints.length > 0 && (
                  <ul>
                    {enr.keyPoints.map((k) => (
                      <li key={k}>{k}</li>
                    ))}
                  </ul>
                )}
                {enr.caveats && enr.caveats.length > 0 && (
                  <>
                    <h3>The AI suggests checking</h3>
                    <ul>
                      {enr.caveats.map((k) => (
                        <li key={k}>{k}</li>
                      ))}
                    </ul>
                  </>
                )}
                <p className="muted small">Written by an AI model from the published text above. It may contain mistakes and never overrides published dates, amounts or requirements.</p>
              </>
            ) : ai.enabled ? (
              <form action={aiSummaryAction.bind(null, id)}>
                <input type="hidden" name="back" value={back} />
                <p className="muted small">Generates a short plain-language summary from the published text only. Uses your AI quota.</p>
                <PendingButton pending="Summarising…">Generate AI summary</PendingButton>
              </form>
            ) : (
              <p className="muted">{ai.reason} The facts above come straight from the sources.</p>
            )}
          </section>
        </div>

        <aside className="op-side" aria-label="Tracking">
          <section className="op-panel">
            <h2 style={{ fontSize: "1.05rem" }}>Track</h2>
            {row.savedAt ? (
              <>
                <form action={statusAction.bind(null, id)}>
                  <input type="hidden" name="back" value={back} />
                  <AutoSubmitSelect name="status" label="Status" defaultValue={row.status ?? def.statuses[0].id} options={statusOptions.slice(1)} />
                  <noscript>
                    <button type="submit" className="small">
                      Save status
                    </button>
                  </noscript>
                </form>
                <p className="muted small">Saved {fmtWhen(row.savedAt)}. Statuses marked “(by you)” record something you did outside the app.</p>
                <form action={unsaveAction.bind(null, id)}>
                  <input type="hidden" name="back" value={back} />
                  <PendingButton className="small danger" confirm="Remove from saved items and all lists? Notes are kept.">
                    Remove from saved
                  </PendingButton>
                </form>
              </>
            ) : (
              <form action={saveAction.bind(null, id)}>
                <input type="hidden" name="back" value={back} />
                <PendingButton className="primary" pending="Saving…">
                  Save
                </PendingButton>
              </form>
            )}

            <h3>Lists</h3>
            {inLists.length > 0 && (
              <ul className="op-list-plain">
                {lists
                  .filter((l) => inLists.includes(l.id))
                  .map((l) => (
                    <li key={l.id} className="spread" style={{ alignItems: "center" }}>
                      <Link href={`/opportunities/saved?module=${module}&list=${l.id}`}>{l.name}</Link>
                      <form action={removeFromListAction}>
                        <input type="hidden" name="back" value={back} />
                        <input type="hidden" name="listId" value={l.id} />
                        <input type="hidden" name="itemId" value={id} />
                        <PendingButton className="small">Remove</PendingButton>
                      </form>
                    </li>
                  ))}
              </ul>
            )}
            {lists.some((l) => !inLists.includes(l.id)) && (
              <form action={addToListAction} className="inline" style={{ marginTop: ".5rem" }}>
                <input type="hidden" name="back" value={back} />
                <input type="hidden" name="itemId" value={id} />
                <label style={{ flex: "1 1 140px" }}>
                  <span className="sr-only">List</span>
                  <select name="listId">
                    {lists
                      .filter((l) => !inLists.includes(l.id))
                      .map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.name}
                        </option>
                      ))}
                  </select>
                </label>
                <PendingButton className="small">Add</PendingButton>
              </form>
            )}
            <form action={createListAction.bind(null, module)} className="inline" style={{ marginTop: ".5rem" }}>
              <input type="hidden" name="back" value={back} />
              <input type="hidden" name="itemId" value={id} />
              <label style={{ flex: "1 1 140px" }}>
                <span className="sr-only">New list name</span>
                <input name="name" placeholder="New list name" required maxLength={120} />
              </label>
              <PendingButton className="small">Create & add</PendingButton>
            </form>

            <h3>Notes</h3>
            <form action={noteAction.bind(null, id)} className="stack">
              <input type="hidden" name="back" value={back} />
              <label>
                <span className="sr-only">New note</span>
                <textarea name="note" rows={3} required maxLength={5000} placeholder="Add a private note" />
              </label>
              <PendingButton className="small">Add note</PendingButton>
            </form>
            {notes.length > 0 && (
              <ul className="op-notes">
                {notes.map((n) => (
                  <li key={n.id}>
                    <time dateTime={n.createdAt}>{fmtWhen(n.createdAt)}</time>
                    {n.body}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="op-panel">
            <h2 style={{ fontSize: "1.05rem" }}>Sources</h2>
            <ul className="op-list-plain">
              {it.links.map((l) => (
                <li key={l.url}>
                  <ExtLink href={l.url}>{l.label}</ExtLink>
                </li>
              ))}
            </ul>
            <details style={{ marginTop: ".5rem" }}>
              <summary>All evidence sources ({sourcesOf(it.fields).length})</summary>
              <ul className="op-list-plain small">
                {sourcesOf(it.fields).map((e, i) => (
                  <li key={i}>
                    {e.sourceUrl ? <ExtLink href={e.sourceUrl}>{e.label ?? e.sourceUrl}</ExtLink> : e.label ?? e.provider} <span className="muted">· {EVIDENCE_LABELS[e.kind]}</span>
                  </li>
                ))}
              </ul>
            </details>
            <dl className="kv small" style={{ marginTop: ".6rem" }}>
              <dt>Provider</dt>
              <dd>{providers.map((p, i) => p?.name ?? row.provider.split("+")[i]).join(" + ")}</dd>
              <dt>Retrieved</dt>
              <dd>{fmtWhen(row.retrievedAt)}</dd>
              <dt>Published</dt>
              <dd>{row.publishedAt ? fmtDate(row.publishedAt) : "Not stated"}</dd>
            </dl>
            {providers.map((p) => p?.attribution && <p key={p.id} className="muted small">{p.attribution}</p>)}
            <p className="muted small">{t("detail.noOutreach")}</p>
          </section>
        </aside>
      </div>
    </>
  );
}
