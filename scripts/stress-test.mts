/**
 * Stress test: run the app's own job filters over every open job on a list of company boards and
 * record, for each job, where it would end up and why. Nothing is written to any database.
 *
 *   npx tsx scripts/stress-test.mts <boards.json> <words.json> <out.jsonl>
 *
 * boards.json: [{ company, provider, slug }]   words.json: { titleWords, skipWords, regionWords, otherRegionWords }
 * Each output line: { company, title, location, url, provider, posted, stage, reason, summary }
 *   stage: "title" (title words don't match) · "rules" (region / on-site / stale) · "unread" (no description)
 *          · "who" (limited to another country) · "remote" (not clearly remote) · "scam" · "hold" (recruiter, or no region stated)
 *          · "ready" (would reach Ready)
 */
import fs from "node:fs";
import {
  fetchBoard,
  fetchPostingSummary,
  type BoardRef,
  type Posting,
} from "../src/sources/job-boards";
import { warningSigns } from "../src/sources/job-sites";
import {
  employerVerdict,
  freshness,
  regionVerdictFor,
  remoteVerdict,
  titleMatches,
  whoCanApply,
} from "../src/services/discovery";

const [boardsFile, wordsFile, outFile] = process.argv.slice(2);
const boards = JSON.parse(fs.readFileSync(boardsFile, "utf8")) as {
  company: string;
  provider: BoardRef["provider"];
  slug: string;
}[];
const s = JSON.parse(fs.readFileSync(wordsFile, "utf8"));
const today = new Date().toISOString().slice(0, 10);
const out = fs.createWriteStream(outFile);
const counts: Record<string, number> = {};

async function judge(ref: BoardRef, company: string, p: Posting) {
  const base = {
    company,
    title: p.title,
    location: p.location,
    url: p.url,
    provider: ref.provider,
    posted: p.postedAt,
  };
  if (!titleMatches(p.title, s))
    return { ...base, stage: "title", reason: "title words" };
  if (p.workplace === "onsite" || p.workplace === "hybrid")
    return { ...base, stage: "rules", reason: `board marks it ${p.workplace}` };
  const region = regionVerdictFor(p, s);
  if (/^NO/.test(region)) return { ...base, stage: "rules", reason: region };
  const fresh = freshness(p.postedAt, today);
  if (/^NO/.test(fresh)) return { ...base, stage: "rules", reason: fresh };
  let job: Posting = p;
  if (!p.summary || p.onlyFor === undefined) {
    const got = await fetchPostingSummary(ref, p.id);
    if (!got && !p.summary)
      return { ...base, stage: "unread", reason: "description not readable" };
    job = {
      ...p,
      summary: p.summary ?? got?.summary ?? null,
      onlyFor: got ? got.onlyFor : p.onlyFor,
    };
  }
  const limit = whoCanApply(job, s);
  if (limit)
    return { ...base, stage: "who", reason: limit, summary: job.summary };
  const remote = remoteVerdict(job);
  if (/^NO/.test(remote))
    return { ...base, stage: "remote", reason: remote, summary: job.summary };
  const signs = warningSigns(`${job.title}\n${job.summary ?? ""}`);
  if (signs.length)
    return {
      ...base,
      stage: "scam",
      reason: signs.join(", "),
      summary: job.summary,
    };
  const employer = employerVerdict(company, job.summary);
  if (/^UNKNOWN/.test(employer))
    return { ...base, stage: "hold", reason: employer, summary: job.summary };
  // With the whole description read, the region may now be stated; still unstated → On hold, not Ready.
  const region2 = regionVerdictFor(job, s);
  if (/^UNKNOWN/.test(region2))
    return { ...base, stage: "hold", reason: region2, summary: job.summary };
  return {
    ...base,
    stage: "ready",
    reason: `${region2}; ${remote}; ${fresh}`,
    summary: job.summary,
  };
}

async function pool<T>(items: T[], n: number, fn: (t: T) => Promise<void>) {
  let i = 0;
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (i < items.length) await fn(items[i++]);
    }),
  );
}

let done = 0;
await pool(boards, 8, async (b) => {
  const ref: BoardRef = { provider: b.provider, slug: b.slug };
  const res = await fetchBoard(ref);
  done++;
  if (!res.ok) {
    counts.boardFailed = (counts.boardFailed ?? 0) + 1;
    return;
  }
  const company = res.company?.trim() || b.company;
  for (const p of res.postings) {
    if (!p.title) continue;
    const r = await judge(ref, company, p);
    counts[r.stage] = (counts[r.stage] ?? 0) + 1;
    counts.total = (counts.total ?? 0) + 1;
    out.write(JSON.stringify(r) + "\n");
  }
  if (done % 25 === 0)
    console.error(`${done}/${boards.length} boards`, JSON.stringify(counts));
});
out.end();
console.log(JSON.stringify(counts));
