/**
 * What the owner's own AI (connected through "Connect your AI") can see and do.
 *
 * Read: an explanation of the app, the owner's leads, one lead in full, the
 * last search (including jobs that couldn't be confirmed), saved answers.
 * Write: prepared brief/answers and notes on a lead, new leads it found, and
 * sorting jobs still waiting in New to review (Ready / On hold / Archived), as
 * the owner asked. Never: say you applied, change rules or settings, contact
 * anyone. Everything it does is recorded in Activity as "Your AI".
 */
import {
  applied,
  describeSearch,
  LIST_TO_VIEW,
  LISTS,
  listOf,
  OUTREACH_NAMES,
  TIER_NAMES,
  whereItIs,
  type ListKey,
} from "@/components/plain";
import type { RecordRow } from "@/db/schema";
import { FIT_TIERS, type FitTier } from "@/core/types";
import { getAnswers, getProfile } from "./answers";
import { asSystem, type Ctx } from "./context";
import { getDiscoverySettings, lastDiscovery, reviewFoundJob } from "./discovery";
import { listHistory } from "./history";
import { dedupKey, normalizeText } from "@/core/dedup";
import { countsByView, evaluateRecord, findByDedupKey, getRecord, listRecords, updateRecord, upsertLead } from "./records";

export const AI_ACTOR = "your-ai";
export const AI_ORIGIN = "ai";

type Json = Record<string, unknown>;
export interface AiTool {
  name: string;
  title: string;
  description: string;
  inputSchema: Json;
  readOnly: boolean;
  run: (ctx: Ctx, args: Json) => Promise<string>;
}

const LIST_KEYS = Object.keys(LISTS) as ListKey[];
const s = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const attr = (r: RecordRow, k: string) => (typeof r.attributes[k] === "string" ? (r.attributes[k] as string) : null);

function row(r: RecordRow) {
  return {
    id: r.id,
    company: r.account,
    job: r.opportunity,
    list: LISTS[listOf(r)].title,
    where: whereItIs(r),
    application: applied(r) ? OUTREACH_NAMES[r.outreachStatus] : "Not applied yet",
    fit: r.fitTier ? TIER_NAMES[r.fitTier] : listOf(r) === "ready" ? "Not yet rated" : null,
    why: r.fitRationale,
    checks: {
      remote: attr(r, "remoteCheck"),
      openToYourRegion: attr(r, "openToYourRegion"),
      whoCanApply: attr(r, "whoCanApply"),
      stillListed: attr(r, "verifiedOpen"),
      employer: attr(r, "employer"),
    },
    location: attr(r, "postingLocation") ?? r.location,
    link: r.nextStepUrl ?? r.sourceUrl,
    found: r.dateFound,
    hasPreparedBrief: !!r.preparedBrief,
  };
}

const ABOUT = `This is the owner's personal job-search tracker ("Prospect CRM"). It replaces an Excel tracker.
How it works:
- Every Monday (or when the owner presses "Find new leads") it reads the public careers pages of companies it watches
  (Lever, Greenhouse, Ashby, Workable, Recruitee, SmartRecruiters) and remote-job sites (to discover new companies).
  A job is only added if it's on the company's OWN careers page, so added jobs are genuine.
- Every found job is checked automatically: really remote? open to the owner's region? does the whole posting
  limit who can apply to another country? still listed? posted by the employer (not a recruiter)? Jobs that pass
  go to "Ready" marked "Not yet rated"; recruiter postings go "On hold"; the rest are archived with the reason.
- YOUR main job: rate the Ready (and New to review) jobs against the owner's profile with sort_lead — fit +
  why — so the owner can apply to the best ones first. Move poor fits to archive with the reason.
- "Ready" = the owner applies personally, then marks "Applied" in the app.
- "Applied" tracks each application: Applied → Heard back → Interviewing → Offer / Not successful.
- "On hold" leads need more information; "Archived" ones were rejected or closed. Nothing is ever deleted.
- Rules (remote-only, open to the owner's region, etc.) are applied automatically.

Your role as the owner's AI assistant:
- Read their profile first (get_my_profile): it is the source of truth for fit, deal-breakers and their voice.
- Help them decide and prepare: summarise leads, compare them against their profile and saved answers, and write a
  tailored cover letter ("brief") and application answers with save_prepared_package. Only use facts from the lead, the
  listing and the owner's saved answers / existing briefs — never invent experience, numbers or employers.
- You can add notes (add_note) and add jobs you find elsewhere, e.g. LinkedIn (add_lead). Always check a job is on the
  company's own website before adding it, and say so in the notes.
- You can NOT: apply or contact anyone, choose Yes/No for the owner, mark anything as applied, or change rules/settings.
  Tell the owner what to click instead.
- Personal details in briefs are the owner's own; never put them anywhere else.`;

export const AI_TOOLS: AiTool[] = [
  {
    name: "about_this_app",
    title: "About this job tracker",
    description:
      "Read first. Explains what this job-search tracker does, how the owner uses it, what you may and may not do, and gives a live overview (how many leads on each list, what the search looks for).",
    inputSchema: { type: "object", properties: {} },
    readOnly: true,
    run: async (ctx) => {
      const [counts, settings, last] = await Promise.all([countsByView(ctx), getDiscoverySettings(ctx), lastDiscovery(ctx)]);
      const lists = LIST_KEYS.filter((k) => k !== "all")
        .map((k) => `- ${LISTS[k].title}: ${counts[LIST_TO_VIEW[k]]} — ${LISTS[k].help}`)
        .join("\n");
      return [
        ABOUT,
        "",
        "Right now:",
        lists,
        "",
        `Job titles it looks for: ${settings.titleWords.join(", ")}`,
        `Skips titles with: ${settings.skipWords.join(", ")}`,
        `Places that work for the owner: ${settings.regionWords.join(", ")}`,
        last
          ? `\nLast search (${last.finishedAt.slice(0, 10)}):\n- ${describeSearch(last).join("\n- ")}`
          : "\nNo search has run yet.",
      ].join("\n");
    },
  },
  {
    name: "list_leads",
    title: "List leads",
    description:
      "List the owner's leads on one list. Lists: review (New to review), ready, applied, checking (Being checked), hold, archive, all. Returns id, company, job, where it is, application status, fit, location and link.",
    inputSchema: {
      type: "object",
      properties: {
        list: { type: "string", enum: LIST_KEYS, description: "Which list. Default: ready." },
        search: { type: "string", description: "Optional words to match company, job, location or notes." },
        limit: { type: "integer", minimum: 1, maximum: 100, description: "How many (default 25)." },
      },
    },
    readOnly: true,
    run: async (ctx, a) => {
      const list = (LIST_KEYS as string[]).includes(s(a.list)) ? (s(a.list) as ListKey) : "ready";
      const limit = Math.min(Math.max(Number(a.limit) || 25, 1), 100);
      const rows = await listRecords(ctx, {
        view: LIST_TO_VIEW[list],
        q: s(a.search) || undefined,
        sort: list === "ready" ? "tier" : "updated",
        dir: list === "ready" ? "asc" : "desc",
        limit,
      });
      return JSON.stringify({ list: LISTS[list].title, count: rows.length, leads: rows.map(row) }, null, 1);
    },
  },
  {
    name: "get_lead",
    title: "Get one lead in full",
    description:
      "Everything about one lead: the listing summary, location/remote details, how it was confirmed as genuine, checks against the owner's rules, prepared brief and answers, notes, and recent history.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", description: "The lead's id (from list_leads)." } },
      required: ["id"],
    },
    readOnly: true,
    run: async (ctx, a) => {
      const r = await getRecord(ctx, s(a.id));
      const [checks, hist] = await Promise.all([
        evaluateRecord(ctx, r, "all"),
        listHistory(ctx, { entityType: "record", entityId: r.id, limit: 10 }),
      ]);
      return JSON.stringify(
        {
          ...row(r),
          appliedOn: attr(r, "appliedOn"),
          listingSummary: typeof r.extra.postingSummary === "string" ? r.extra.postingSummary : null,
          details: Object.fromEntries(Object.entries(r.attributes).filter(([, v]) => typeof v === "string" && v)),
          requirements: r.requirements,
          whyItFits: r.fitRationale,
          gapsMustHave: r.gapsHard,
          gapsNiceToHave: r.gapsSoft,
          locationFit: r.locationFit,
          payFit: r.valueFit,
          nextAction: r.nextAction,
          holdReason: r.holdReason,
          archiveReason: r.archiveReason,
          preparedBrief: r.preparedBrief,
          preparedAnswers: r.preparedAnswers,
          notes: r.notes,
          responseNotes: r.responseNotes,
          checks: {
            failing: checks.fails.map((c) => `${c.label}: ${c.reason}`),
            needsALook: checks.holds.map((c) => `${c.label}: ${c.reason}`),
            notKnownYet: checks.unknowns.map((c) => c.label),
          },
          recentHistory: hist.map((h) => ({ when: h.occurredAt.slice(0, 10), what: h.event, why: h.reason })),
        },
        null,
        1,
      );
    },
  },
  {
    name: "get_my_answers",
    title: "The owner's saved answers",
    description:
      "The owner's own reusable application answers (intro, notice period, pay, etc.). Use them as the source of truth about the owner when writing briefs and answers.",
    inputSchema: { type: "object", properties: {} },
    readOnly: true,
    run: async (ctx) => {
      const answers = await getAnswers(ctx);
      return answers.length
        ? answers.map((x) => `## ${x.title}\n${x.text}`).join("\n\n")
        : "The owner hasn't saved any answers yet (My answers page).";
    },
  },
  {
    name: "get_my_profile",
    title: "The owner's profile (About me)",
    description:
      "The owner's own profile: who they are, roles they want and don't want, deal-breakers, pay floor, experience, writing style, how they like to be helped. Read this before judging job fit or writing any application material — it is the source of truth about them.",
    inputSchema: { type: "object", properties: {} },
    readOnly: true,
    run: async (ctx) => (await getProfile(ctx)) || "The owner hasn't written their profile yet (About me page, under Settings).",
  },
  {
    name: "get_last_search",
    title: "Last job search",
    description:
      "The result of the last job search, including jobs seen on remote-job sites that could NOT be confirmed on the company's own careers page. You can check those on the company's website and, if genuine, add them with add_lead.",
    inputSchema: { type: "object", properties: {} },
    readOnly: true,
    run: async (ctx) => {
      const last = await lastDiscovery(ctx);
      if (!last) return "No search has run yet.";
      return JSON.stringify(
        {
          when: last.finishedAt,
          summary: describeSearch(last),
          newCompanies: last.companiesConfirmed ?? [],
          notConfirmed: last.notConfirmed ?? [],
        },
        null,
        1,
      );
    },
  },
  {
    name: "save_prepared_package",
    title: "Save a cover letter / answers to a lead",
    description:
      "Save a tailored cover letter (brief) and/or application answers onto a lead, so the owner can copy them when applying. Any text it replaces is kept on the lead as an earlier version. Only use true facts about the owner (from get_my_answers and existing briefs).",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        brief: { type: "string", description: "The cover letter." },
        answers: { type: "string", description: "Answers to the application's questions." },
      },
      required: ["id"],
    },
    readOnly: false,
    run: async (ctx, a) => {
      const brief = s(a.brief);
      const answers = s(a.answers);
      if (!brief && !answers) throw new Error("Give a brief, answers, or both.");
      const r = await getRecord(ctx, s(a.id));
      // Nothing is lost: text being replaced is kept on the lead as an earlier version.
      const replaced = {
        ...(brief && r.preparedBrief && r.preparedBrief !== brief ? { brief: r.preparedBrief } : {}),
        ...(answers && r.preparedAnswers && r.preparedAnswers !== answers ? { answers: r.preparedAnswers } : {}),
      };
      const kept = Array.isArray(r.extra.earlierVersions) ? (r.extra.earlierVersions as unknown[]) : [];
      await updateRecord(
        ctx,
        r.id,
        {
          ...(brief ? { preparedBrief: brief } : {}),
          ...(answers ? { preparedAnswers: answers } : {}),
          ...(Object.keys(replaced).length
            ? { extra: { ...r.extra, earlierVersions: [{ at: new Date().toISOString(), ...replaced }, ...kept].slice(0, 20) } }
            : {}),
        },
        "Prepared material written by your AI",
      );
      return `Saved on "${r.account} — ${r.opportunity}". The owner will see it on the lead's page with Copy buttons.${
        Object.keys(replaced).length ? " The previous version is kept on the lead under 'Earlier versions'." : ""
      }`;
    },
  },
  {
    name: "add_note",
    title: "Add a note to a lead",
    description: "Add a dated note to a lead (e.g. research about the company, why it's a good or poor fit, interview prep).",
    inputSchema: { type: "object", properties: { id: { type: "string" }, note: { type: "string" } }, required: ["id", "note"] },
    readOnly: false,
    run: async (ctx, a) => {
      const note = s(a.note);
      if (!note) throw new Error("The note is empty.");
      const r = await getRecord(ctx, s(a.id));
      const line = `[${new Date().toISOString().slice(0, 10)} · your AI] ${note}`;
      await updateRecord(ctx, r.id, { notes: r.notes ? `${r.notes}\n\n${line}` : line }, "Note added by your AI");
      return `Note added to "${r.account} — ${r.opportunity}".`;
    },
  },
  {
    name: "sort_lead",
    title: "Rate and sort a job",
    description:
      'Rate one job against the owner\'s profile (read get_my_profile first) and sort it: "ready" (worth applying — moves to Ready, with your fit rating and a one- or two-sentence why the owner reads on the list), "hold" (something to check first — On hold), or "archive" (not a fit). Works on jobs in New to review, Ready (to rate or re-rate them) and On hold. The app has already checked remote / region / who can apply / still listed (see checks); judge fit, pay and seniority. Applying, and marking a job Applied, stay with the owner.',
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        choice: { type: "string", enum: ["ready", "hold", "archive"] },
        fit: {
          type: "string",
          enum: ["exceptional", "strong", "good", "stretch"],
          description: "Required for ready: how well it fits the owner's profile.",
        },
        why: {
          type: "string",
          description: "One or two sentences the owner will read: why it fits (or doesn't), pay if known, what to check.",
        },
      },
      required: ["id", "choice", "why"],
    },
    readOnly: false,
    run: async (ctx, a) => {
      const choice = ({ ready: "yes", hold: "hold", archive: "no" } as const)[s(a.choice) as "ready" | "hold" | "archive"];
      if (!choice) throw new Error('choice must be "ready", "hold" or "archive".');
      const why = s(a.why);
      if (!why) throw new Error("Say why, in one or two sentences.");
      const fit = s(a.fit) as FitTier;
      if (choice === "yes" && !(FIT_TIERS as readonly string[]).includes(fit))
        throw new Error('For "ready", give fit: exceptional, strong, good or stretch.');
      const r = await getRecord(ctx, s(a.id));
      const list = listOf(r);
      if (!["review", "ready", "hold"].includes(list))
        throw new Error(
          `"${r.account} — ${r.opportunity}" is in ${whereItIs(r)}; only jobs in New to review, Ready or On hold can be sorted.`,
        );
      const done = await reviewFoundJob(ctx, r.id, choice, { by: "your AI", fit: choice === "yes" ? fit : undefined, why });
      return `"${r.account} — ${r.opportunity}" is now in ${whereItIs(done)}.`;
    },
  },
  {
    name: "add_lead",
    title: "Add a job you found",
    description:
      "Add a job you found elsewhere (e.g. on LinkedIn or a company website). It goes to the owner's 'Being checked' list, marked as added by you and not yet confirmed. Check the job is on the company's own website first and give that link. Duplicates are recognised automatically.",
    inputSchema: {
      type: "object",
      properties: {
        company: { type: "string" },
        job_title: { type: "string" },
        link: { type: "string", description: "Link to the job — preferably on the company's own careers page." },
        location: { type: "string", description: "Location / remote details as listed." },
        notes: { type: "string", description: "Why it's a fit, and how you confirmed it's genuine." },
      },
      required: ["company", "job_title", "link"],
    },
    readOnly: false,
    run: async (ctx, a) => {
      const link = s(a.link);
      if (!/^https?:\/\//i.test(link)) throw new Error("The link must start with http:// or https://");
      const company = s(a.company);
      const title = s(a.job_title);
      if (!company || !title) throw new Error("Give the company and the job title.");
      // An existing lead is never changed from here — not even merged — so nothing the owner wrote can be overwritten.
      const same = (await listRecords(ctx, { q: title, limit: 200 })).find(
        (r) => normalizeText(r.account) === normalizeText(company) && normalizeText(r.opportunity) === normalizeText(title),
      );
      const existing = same ?? (await findByDedupKey(ctx, dedupKey({ account: company, opportunity: title, sourceUrl: link })));
      if (existing)
        return `Already in the tracker: "${existing.account} — ${existing.opportunity}" (id ${existing.id}). Nothing was changed. Use add_note to add information.`;
      const { record } = await upsertLead(
        ctx,
        {
          account: company,
          opportunity: title,
          sourceUrl: link,
          location: s(a.location) || undefined,
          sourceBoard: "Found by your AI",
          dateFound: new Date().toISOString().slice(0, 10),
          notes: s(a.notes) ? `[your AI] ${s(a.notes)}` : undefined,
          attributes: {
            foundOn: "Your AI",
            genuine: "NOT CONFIRMED YET — found by your AI; check it's on the company's own website",
          },
        },
        AI_ORIGIN,
      );
      return `Added "${record.account} — ${record.opportunity}" (id ${record.id}). It's on the owner's Being checked list.`;
    },
  },
];

/** Run one tool as "Your AI". Errors come back as plain messages, never as crashes. */
export async function runAiTool(ctx: Ctx, name: string, args: Json): Promise<{ text: string; isError: boolean }> {
  const tool = AI_TOOLS.find((t) => t.name === name);
  if (!tool) return { text: `Unknown tool: ${name}`, isError: true };
  try {
    return { text: await tool.run(asSystem(ctx, AI_ACTOR), args ?? {}), isError: false };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { text: /not found/i.test(msg) ? "No lead with that id. Use list_leads to find ids." : msg, isError: true };
  }
}
