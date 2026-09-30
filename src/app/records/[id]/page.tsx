import Link from "next/link";
import { notFound } from "next/navigation";
import {
  archiveAction,
  decideAction,
  reviewAction,
  fitTierAction,
  holdAction,
  outreachAction,
  restoreAction,
  sourceVerificationAction,
  updateRecordAction,
} from "../../actions";
import { ApplicationSelect, CopyButton, SubmitButton } from "@/components/client";
import {
  actorName,
  APPLICATION_CHOICES,
  DECISION_NAMES,
  DECISION_STEP_TITLES,
  eventName,
  fmtDay,
  fmtWhen,
  humanize,
  listOf,
  LISTS,
  SOURCE_NAMES,
  statusPhrase,
  TIER_NAMES,
} from "@/components/plain";
import { AttributeFields, RecordFields } from "@/components/record-fields";
import { BackLink, Checks, Ext, Flash, StatusPill, type SearchParams } from "@/components/ui";
import { FIT_TIERS, SOURCE_VERIFICATION, VERDICTS } from "@/core/types";
import { getAnswers } from "@/services/answers";
import { listHistory } from "@/services/history";
import { evaluateRecord, getRecord, NotFoundError, pendingDecision } from "@/services/records";
import { getCtx } from "@/services/request";

export const dynamic = "force-dynamic";

const JOB_FACTS: [string, string][] = [
  ["genuine", "Is it genuine?"],
  ["postingLocation", "Location on the listing"],
  ["openToYourRegion", "Open to your region?"],
  ["workplaceType", "Remote / office"],
  ["employmentType", "Type"],
  ["compensation", "Pay (as listed)"],
  ["postedOn", "Posted"],
  ["foundOn", "Found on"],
];

export default async function LeadPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SearchParams }) {
  const { id } = await params;
  const sp = await searchParams;
  const ctx = await getCtx();
  let r;
  try {
    r = await getRecord(ctx, id);
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }
  const [pending, overall, hist, answers] = await Promise.all([
    pendingDecision(ctx, r),
    evaluateRecord(ctx, r, "all"),
    listHistory(ctx, { entityType: "record", entityId: id, limit: 200 }),
    getAnswers(ctx),
  ]);
  const list = listOf(r);
  const link = r.nextStepUrl ?? r.sourceUrl;
  const bind = <T,>(fn: (id: string, f: FormData) => Promise<T>) => fn.bind(null, id);

  const facts: [string, string | null][] = [
    ["Effort to apply", typeof r.attributes.effortToApply === "string" ? r.attributes.effortToApply : null],
    ["Location / remote notes", r.location],
    ["Found", r.dateFound ? fmtDay(r.dateFound) : null],
    ["Found on", r.sourceBoard],
    ["Location fit", r.locationFit],
    ["Pay / value fit", r.valueFit],
    ["Requirements", r.requirements],
    ["Gaps (must-haves missing)", r.gapsHard],
    ["Gaps (nice-to-haves missing)", r.gapsSoft],
    ["Why it fits", r.fitRationale],
    ["How to proceed / next action", r.nextAction],
    ["Notes", r.notes],
    ["Response notes", r.responseNotes],
  ];

  return (
    <>
      <Flash sp={sp} />
      <BackLink href={`/records?list=${list}`}>Back to {LISTS[list].title}</BackLink>
      <div className="spread">
        <div style={{ flex: "1 1 420px" }}>
          <h1>{r.opportunity}</h1>
          <p style={{ fontSize: "1.1rem", margin: ".1rem 0 .6rem" }}>
            <strong>{r.account}</strong>
          </p>
          <div className="row" style={{ alignItems: "center", gap: ".8rem" }}>
            <StatusPill r={r} />
            <ApplicationSelect action={bind(outreachAction)} value={r.outreachStatus} choices={APPLICATION_CHOICES} />
          </div>
        </div>
        {link && (
          <a className="button" href={/^https?:\/\//i.test(link) ? link : `https://${link}`} target="_blank" rel="noreferrer noopener">
            Open the listing ↗
          </a>
        )}
      </div>

      {/* ---------------- What to do next ---------------- */}
      <section className="next-box" style={{ margin: "1.2rem 0" }}>
        <h2>What to do next</h2>
        {list === "ready" && (
          <>
            <ol style={{ margin: ".2rem 0 .8rem", paddingLeft: "1.2rem" }}>
              <li>
                {r.preparedBrief || r.preparedAnswers ? (
                  "Read the prepared brief and answers below (use the Copy buttons)."
                ) : answers.length ? (
                  "Read about the job below. Use your saved answers below (Copy buttons) to fill in the application."
                ) : (
                  <>
                    Read about the job below. Tip: write your usual answers once on <Link href="/answers">My answers</Link> and
                    they&apos;ll appear here with Copy buttons.
                  </>
                )}
              </li>
              <li>Open the listing and apply yourself. This app never applies or sends anything for you.</li>
              <li>
                Then set <strong>Your application</strong> (top of this page) to &quot;Applied&quot;. It moves to your Applied
                list.
              </li>
            </ol>
          </>
        )}

        {list === "applied" && (
          <>
            <p>
              {r.outreachStatus === "sent_manually" &&
                "You've applied. When they get back to you, change \"Your application\" at the top of this page."}
              {r.outreachStatus === "responded" && "They got back to you. If it's an interview, set it to \"Interviewing\"."}
              {r.outreachStatus === "interviewing" &&
                "Interviewing — read the job and your prepared material again before each conversation. Note what was discussed in Response notes (Details)."}
              {r.outreachStatus === "offer" && "Congratulations on the offer! Note the details in Response notes (Details)."}
              {r.outreachStatus === "rejected" &&
                "Not successful this time. It stays on your Applied list for your records — nothing is deleted."}
              {r.outreachStatus === "closed" && "You withdrew or stopped. It stays on your Applied list for your records."}
            </p>
            {typeof r.attributes.appliedOn === "string" && (
              <p className="small muted" style={{ margin: 0 }}>
                Applied on {fmtDay(r.attributes.appliedOn)}.
              </p>
            )}
          </>
        )}

        {list === "review" && (
          <>
            <p>
              The app found this job on {r.account}&apos;s job board and it passes your rules. Read about it below (or open the
              listing), then decide:
            </p>
            <div className="row" style={{ marginTop: ".6rem" }}>
              {(
                [
                  ["yes", "Yes — worth applying", "primary"],
                  ["hold", "Not sure — hold", ""],
                  ["no", "No — not for me", "danger"],
                ] as const
              ).map(([choice, label, cls]) => (
                <form key={choice} action={bind(reviewAction)}>
                  <input type="hidden" name="choice" value={choice} />
                  <SubmitButton className={cls} pending="Saving…">
                    {label}
                  </SubmitButton>
                </form>
              ))}
            </div>
            <p className="small muted" style={{ marginTop: ".6rem" }}>
              &quot;Yes&quot; moves it to Ready. You still apply yourself — the app never applies for you.
            </p>
          </>
        )}

        {list === "checking" && pending && (
          <>
            <p>
              This lead is still being checked. <strong>Easiest:</strong> run the weekly check on the Home page and it will be
              sorted for you. Or make the decision yourself:
            </p>
            <form action={bind(decideAction)} className="stack" style={{ marginTop: ".6rem" }}>
              <input type="hidden" name="stage" value={pending.stage} />
              <div>
                <strong>{DECISION_STEP_TITLES[pending.stage].title}:</strong> {DECISION_STEP_TITLES[pending.stage].question}
              </div>
              <div className="fields">
                <label>
                  Your decision {pending.suggested && <span className="hint">(suggested: {DECISION_NAMES[pending.suggested]})</span>}
                  <select name="verdict" defaultValue={pending.suggested}>
                    {VERDICTS[pending.stage].map((v) => (
                      <option key={v} value={v}>
                        {DECISION_NAMES[v]}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Why? <span className="hint">(a few words — required)</span>
                  <input name="reason" required placeholder="e.g. Remote and pay looks right" />
                </label>
              </div>
              <div>
                <SubmitButton pending="Saving…">Save decision</SubmitButton>
              </div>
            </form>
          </>
        )}

        {list === "hold" && (
          <>
            <p>
              <strong>Why it&apos;s on hold:</strong> {r.holdReason ?? "No reason given."}
            </p>
            {r.nextAction && (
              <p>
                <strong>What&apos;s needed:</strong> {r.nextAction}
              </p>
            )}
            <p>
              When you have the missing information, update the details below
              {r.stage === "verify" ? ' and set "Is the link still open?"' : ""}, then put it back.
            </p>
            <form action={bind(restoreAction)} className="inline" style={{ marginTop: ".5rem" }}>
              <input type="hidden" name="reason" value="Put back by you" />
              <SubmitButton pending="Putting it back…">Put it back</SubmitButton>
            </form>
          </>
        )}

        {list === "archive" && (
          <>
            <p>
              <strong>Why it was archived:</strong> {r.archiveReason ?? "No reason given."}
            </p>
            <p>Archived leads are kept for your records. Changed your mind?</p>
            <form action={bind(restoreAction)} className="inline" style={{ marginTop: ".5rem" }}>
              <input type="hidden" name="reason" value="Put back by you" />
              <SubmitButton className="" pending="Putting it back…">
                Put it back
              </SubmitButton>
            </form>
          </>
        )}
      </section>

      {/* ---------------- About this job (found automatically) ---------------- */}
      {(r.origin === "discovery" || typeof r.extra.postingSummary === "string") && (
        <section className="card" style={{ marginBottom: "1rem" }}>
          <h2>About this job</h2>
          <dl className="kv">
            {JOB_FACTS.filter(([k]) => typeof r.attributes[k] === "string").map(([k, label]) => (
              <div key={k} style={{ display: "contents" }}>
                <dt>{label}</dt>
                <dd>{k === "postedOn" ? fmtDay(r.attributes[k] as string) : String(r.attributes[k])}</dd>
              </div>
            ))}
          </dl>
          {typeof r.extra.postingSummary === "string" && (
            <>
              <h3>What the listing says (start)</h3>
              <div className="package">{r.extra.postingSummary}</div>
            </>
          )}
          <p className="small muted">Taken word for word from the company&apos;s job board. Open the listing for the full text.</p>
        </section>
      )}

      {/* ---------------- Prepared package ---------------- */}
      {(r.preparedBrief || r.preparedAnswers) && (
        <section className="card" style={{ marginBottom: "1rem" }}>
          <h2>Prepared package</h2>
          {r.preparedBrief && (
            <>
              <div className="spread">
                <h3>Brief (cover letter)</h3>
                <CopyButton text={r.preparedBrief} label="Copy brief" />
              </div>
              <div className="package">{r.preparedBrief}</div>
            </>
          )}
          {r.preparedAnswers && (
            <>
              <div className="spread">
                <h3>Prepared answers</h3>
                <CopyButton text={r.preparedAnswers} label="Copy answers" />
              </div>
              <div className="package">{r.preparedAnswers}</div>
            </>
          )}
        </section>
      )}

      {/* ---------------- Earlier versions (text replaced by your AI is never lost) ---------------- */}
      {Array.isArray(r.extra.earlierVersions) && r.extra.earlierVersions.length > 0 && (
        <details className="card" style={{ marginBottom: "1rem" }}>
          <summary>Earlier versions of the brief and answers ({r.extra.earlierVersions.length})</summary>
          {(r.extra.earlierVersions as { at?: string; brief?: string; answers?: string }[]).map((v, i) => (
            <div key={i} style={{ marginTop: ".8rem" }}>
              <p className="small muted" style={{ margin: 0 }}>
                Replaced {v.at ? fmtWhen(v.at) : ""}
              </p>
              {v.brief && (
                <>
                  <div className="spread">
                    <h3 style={{ margin: 0 }}>Brief</h3>
                    <CopyButton text={v.brief} />
                  </div>
                  <div className="package">{v.brief}</div>
                </>
              )}
              {v.answers && (
                <>
                  <div className="spread">
                    <h3 style={{ margin: 0 }}>Answers</h3>
                    <CopyButton text={v.answers} />
                  </div>
                  <div className="package">{v.answers}</div>
                </>
              )}
            </div>
          ))}
        </details>
      )}

      {/* ---------------- Saved answers (same on every lead) ---------------- */}
      {list === "ready" && answers.length > 0 && (
        <details className="card" style={{ marginBottom: "1rem" }} open={!(r.preparedBrief || r.preparedAnswers)}>
          <summary>Your saved answers ({answers.length})</summary>
          {answers.map((a, i) => (
            <div key={i} style={{ marginTop: ".8rem" }}>
              <div className="spread">
                <h3 style={{ margin: 0 }}>{a.title}</h3>
                <CopyButton text={a.text} />
              </div>
              <div className="package">{a.text}</div>
            </div>
          ))}
          <p className="small muted">
            <Link href="/answers">Change your saved answers</Link>
          </p>
        </details>
      )}

      <div className="grid cols-2">
        {/* ---------------- Checks ---------------- */}
        <section className="card">
          <h2>Checks against your rules</h2>
          <p className="muted small">
            ✓ OK · ✗ fails (it will be archived) · ! needs a look (it goes on hold) · ? not known yet (never counts against it)
          </p>
          <Checks results={overall.results} />
        </section>

        {/* ---------------- Link status ---------------- */}
        <section className="card">
          <h2>Is the link still open?</h2>
          <p className="muted small">
            A lead can only be Ready once you (or your research) have checked the listing is still open. Currently:{" "}
            <strong>{SOURCE_NAMES[r.sourceVerification]}</strong>.
          </p>
          <form action={bind(sourceVerificationAction)} className="inline">
            <label style={{ flex: "1 1 200px" }}>
              Link status
              <select name="value" defaultValue={r.sourceVerification}>
                {SOURCE_VERIFICATION.map((s) => (
                  <option key={s} value={s}>
                    {SOURCE_NAMES[s]}
                  </option>
                ))}
              </select>
            </label>
            <input type="hidden" name="reason" value="Updated by you" />
            <SubmitButton className="" pending="Saving…">
              Save
            </SubmitButton>
          </form>
          <p className="small" style={{ marginTop: ".6rem" }}>
            Links: <Ext href={r.sourceUrl} label="listing" /> {r.nextStepUrl && r.nextStepUrl !== r.sourceUrl && <> · <Ext href={r.nextStepUrl} label="apply page" /></>}
          </p>
        </section>
      </div>

      {/* ---------------- Details ---------------- */}
      <section className="card" style={{ marginTop: "1rem" }}>
        <h2>Details</h2>
        <dl className="kv">
          {facts
            .filter(([, v]) => v)
            .map(([k, v]) => (
              <div key={k} style={{ display: "contents" }}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          {r.fitTier && (
            <>
              <dt>Fit rating</dt>
              <dd>{TIER_NAMES[r.fitTier]}</dd>
            </>
          )}
        </dl>
        {facts.every(([, v]) => !v) && <p className="muted">No details yet.</p>}

        <details style={{ marginTop: "1rem" }}>
          <summary>Edit details</summary>
          <form action={bind(updateRecordAction)} className="stack">
            <RecordFields r={r} />
            <h3>Details the rules check</h3>
            <p className="muted small">
              These are what your rules look at. If you don&apos;t know something, leave it empty or type &quot;unknown&quot; —
              never guess.
            </p>
            <AttributeFields attributes={r.attributes} />
            <div>
              <SubmitButton pending="Saving…">Save changes</SubmitButton>
            </div>
          </form>
        </details>
      </section>

      {/* ---------------- More actions ---------------- */}
      <details className="card" style={{ marginTop: "1rem" }}>
        <summary>More actions (hold, archive, fit rating)</summary>
        <div className="grid cols-2">
          {r.status !== "hold" && (
            <form action={bind(holdAction)} className="stack">
              <h3>Put on hold</h3>
              <label>
                Why? <span className="hint">(required)</span>
                <input name="reason" required placeholder="e.g. Pay not listed" />
              </label>
              <label>
                What&apos;s needed? <span className="hint">(optional)</span>
                <input name="nextAction" placeholder="e.g. Ask the recruiter about pay" />
              </label>
              <div>
                <SubmitButton className="" pending="Saving…">
                  Move to On hold
                </SubmitButton>
              </div>
            </form>
          )}
          {r.status !== "archived" && (
            <form action={bind(archiveAction)} className="stack">
              <h3>Archive</h3>
              <label>
                Why? <span className="hint">(required)</span>
                <input name="reason" required placeholder="e.g. Position filled" />
              </label>
              <p className="muted small">Nothing is deleted — you can put it back any time.</p>
              <div>
                <SubmitButton className="danger" pending="Saving…">
                  Archive
                </SubmitButton>
              </div>
            </form>
          )}
          {r.stage === "verify" && (
            <form action={bind(fitTierAction)} className="stack">
              <h3>Fit rating</h3>
              <label>
                How good a fit is it?
                <select name="tier" defaultValue={r.fitTier ?? ""}>
                  <option value="">No rating</option>
                  {FIT_TIERS.map((t) => (
                    <option key={t} value={t}>
                      {TIER_NAMES[t]}
                    </option>
                  ))}
                </select>
              </label>
              <input type="hidden" name="reason" value="Changed by you" />
              <div>
                <SubmitButton className="" pending="Saving…">
                  Save rating
                </SubmitButton>
              </div>
            </form>
          )}
        </div>
      </details>

      {/* ---------------- History ---------------- */}
      <details className="card" style={{ marginTop: "1rem" }}>
        <summary>History of this lead ({hist.length})</summary>
        <ul className="plain small">
          {hist.map((h) => (
            <li key={h.id}>
              <strong>{eventName(h.event)}</strong>
              {h.newStatus && h.priorStatus !== h.newStatus && <> → {statusPhrase(h.newStatus)}</>}
              <span className="muted">
                {" "}
                · {fmtWhen(h.occurredAt)} · {actorName(h.actor)}
              </span>
              {h.reason && <div className="muted">{humanizeReason(h.reason)}</div>}
            </li>
          ))}
        </ul>
      </details>
    </>
  );
}

/** Stored reasons can contain internal verdict codes; show their plain names. */
function humanizeReason(reason: string): string {
  return reason
    .replace(/\b(screen|triage|verify): /, "")
    .replace(/\[[^\]]*criteria verified\]/, "")
    .replace(/\b[a-z]+(?:_[a-z]+)+\b/g, (m) => DECISION_NAMES[m] ?? humanize(m))
    .trim();
}
