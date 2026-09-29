/**
 * Generate tests/fixtures/sample-tracker.xlsx — a small workbook with the same
 * sheets, headers and quirks as the real tracker (section blocks, repeated
 * headers, native hyperlinks, HYPERLINK() formulas, hidden CONFIG) but only
 * placeholder data. Used by the import test and for trying the app.
 *
 *   npm run fixture
 */
import ExcelJS from "exceljs";
import path from "node:path";
import { HEADERS } from "./lib/import-tracker";

const OUT = path.resolve(process.cwd(), "tests/fixtures/sample-tracker.xlsx");

async function main() {
  const wb = new ExcelJS.Workbook();
  wb.creator = "fixture";

  const raw = wb.addWorksheet("RAW LEADS");
  raw.addRow(HEADERS["RAW LEADS"][0]);
  const rawRows: Record<string, string>[] = [
    { Account: "Acme Analytics", Opportunity: "Implementation Specialist", "Source URL": "https://jobs.example.com/acme/1", "Stage 2 Screen": "KEEP — STRONG", "Stage 2.5 Screen": "PASS 3 — TOP PRIORITY", "Stage 3 Status": "APPLICATION READY — STRONG", "Verified Open": "YES", "Verified Location Fit": "YES (no restriction stated)", "Location Confidence": "HIGH" },
    { Account: "Beta Systems", Opportunity: "Solutions Engineer", "Source URL": "https://jobs.example.com/beta/2", "Stage 2 Screen": "REJECT", "Stage 2 Reason": "On-site only", "Location Confidence": "BLOCKED" },
    { Account: "Gamma Labs", Opportunity: "CRM Automation Lead", "Source URL": "https://jobs.example.com/gamma/3", "Stage 2 Screen": "KEEP — STRETCH", "Stage 2.5 Screen": "HOLD — LOW CONFIDENCE", "Stage 2.5 Reason": "Snippet only" },
    { Account: "Delta Co", Opportunity: "Ops Engineer", "Source URL": "https://jobs.example.com/delta/4", "Stage 2 Screen": "KEEP — POSSIBLE", "Stage 2.5 Screen": "PASS 3 — SECONDARY", "Stage 3 Status": "REJECT — FINAL", "Stage 3 Reason": "Listing closed", "Verified Open": "NO" },
    { Account: "Epsilon", Opportunity: "Business Systems Analyst", "Source URL": "HYPERLINK", "Stage 2 Screen": "KEEP — POSSIBLE", "Date Found": "2026-09-25" },
  ];
  for (const r of rawRows) {
    const row = raw.addRow(HEADERS["RAW LEADS"][0].map((h) => (h === "Source URL" && r[h] === "HYPERLINK" ? null : (r[h] ?? null))));
    if (r["Source URL"] === "HYPERLINK") {
      row.getCell(3).value = { formula: 'HYPERLINK("https://jobs.example.com/epsilon/5","Apply")', result: "Apply" };
    }
  }

  const pr = wb.addWorksheet("PRIORITY");
  pr.addRow(HEADERS.PRIORITY[0]);
  const p1 = pr.addRow(HEADERS.PRIORITY[0].map((h) => ({ Fit: "STRONG TARGET", Account: "Acme Analytics", Opportunity: "Implementation Specialist", "Last Verified": "2026-09-25", "Follow-up Status": "Ready to apply", "Prepared Brief": "Placeholder brief", Notes: "Priority note", "How To Proceed": "MEDIUM" } as Record<string, string>)[h] ?? null));
  p1.getCell(4).value = { text: "Posting", hyperlink: "https://jobs.example.com/acme/1" };
  pr.addRow(HEADERS.PRIORITY[0].map((h) => ({ Fit: "GOOD TARGET", Account: "Zeta Inc", Opportunity: "GTM Engineer", "Source URL": "https://jobs.example.com/zeta/9", "Last Verified": "2026-09-25" } as Record<string, string>)[h] ?? null));

  const ta = wb.addWorksheet("TARGET ACCOUNTS");
  ta.addRow(HEADERS["TARGET ACCOUNTS"][0]);
  ta.addRow(HEADERS["TARGET ACCOUNTS"][0].map((h) => ({ Fit: "HIGH", Account: "Eta Robotics", "Contact Name": "Placeholder Founder", "Contact Profile": "https://profiles.example.com/founder", "What They Do": "Automation" } as Record<string, string>)[h] ?? null));
  ta.addRow([]);
  ta.addRow(["WATCHLIST — companies identified but not yet at outreach stage"]);
  ta.addRow(HEADERS["TARGET ACCOUNTS"][0]);
  ta.addRow(HEADERS["TARGET ACCOUNTS"][0].map((h) => ({ Account: "Theta SaaS", "Source URL": "https://theta.example.com/careers" } as Record<string, string>)[h] ?? null));

  const ar = wb.addWorksheet("ARCHIVE");
  ar.addRow(HEADERS.ARCHIVE[0]);
  ar.addRow(["Delta Co", "Ops Engineer", "REJECT — FINAL: closed", "https://jobs.example.com/delta/4", "2026-09-25", "Archive note"]);

  const ho = wb.addWorksheet("HOLD");
  ho.addRow(HEADERS.HOLD[0]);
  ho.addRow(["Gamma Labs", "CRM Automation Lead", "Low confidence", "https://jobs.example.com/gamma/3", "2026-09-25", "Read full JD"]);

  const hi = wb.addWorksheet("HISTORY");
  hi.addRow(HEADERS.HISTORY[0]);
  hi.addRow(HEADERS.HISTORY[0].map((h) => ({ Fit: "GOOD TARGET", Account: "Acme Analytics", Opportunity: "Implementation Specialist", "Next Step URL": "https://jobs.example.com/acme/1", "Final Status": "APPLICATION READY - STRONG", "Reverified Date": "2026-09-25" } as Record<string, string>)[h] ?? null));
  hi.addRow([]);
  hi.addRow(["ACTIVITY LOG — earlier activity prior to the current reconciliation"]);
  hi.addRow(HEADERS.HISTORY[1]);
  hi.addRow(HEADERS.HISTORY[1].map((h) => ({ Account: "Old Corp", Opportunity: "Analyst", "Source URL": "https://old.example.com/1", "Verified Status": "CLOSED", "Last Action Date": "2026-08-01" } as Record<string, string>)[h] ?? null));

  const cfg = wb.addWorksheet("CONFIG", { state: "hidden" });
  for (const r of [
    ["PROFILE (non-identifying)", ""],
    ["Role focus", "Placeholder focus"],
    ["SEARCH CRITERIA", ""],
    ["Location eligibility", "Must be remote and open to the target region."],
    ["Never fabricate", "Unknown values are written as UNKNOWN."],
    ["PIPELINE (4 stages)", ""],
    ["Stage 2 - Screen", "Buckets: REJECT, KEEP - POSSIBLE, KEEP - STRETCH, KEEP - STRONG."],
    ["Reconciliation rule", "Every run reconciles PRIORITY."],
    ["TRIGGER BEHAVIOR", ""],
    ["Phrase", '"Update this week\'s prospect tracker"'],
    ["MIGRATION VALIDATION (this run)", ""],
    ["After - PRIORITY", "2"],
    ["After - TARGET ACCOUNTS (outreach)", "1"],
    ["After - TARGET ACCOUNTS (watchlist)", "1"],
    ["After - RAW LEADS", "5"],
    ["After - ARCHIVE", "1"],
    ["After - HOLD", "1"],
    ["After - HISTORY (reconciliation)", "1"],
    ["After - HISTORY (application log)", "1"],
  ]) cfg.addRow(r);

  await wb.xlsx.writeFile(OUT);
  console.log(`Wrote ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
