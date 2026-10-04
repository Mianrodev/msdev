import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { importAction } from "./actions";
import { SubmitButton } from "@/components/client";
import { fmtWhen } from "@/components/plain";
import { Flash, one, PageHeader, type SearchParams } from "@/components/ui";
import { importBatches } from "@/db/schema";
import { getIdentityTerms } from "@/services/rules";
import { getCtx } from "@/services/request";

export const dynamic = "force-dynamic";
// Importing a few hundred rows can take a little while on a hosted database.
export const maxDuration = 300;

export default async function UploadPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const ctx = await getCtx();
  const [past, terms] = await Promise.all([
    ctx.db
      .select({ fileName: importBatches.fileName, createdAt: importBatches.createdAt })
      .from(importBatches)
      .where(eq(importBatches.workspaceId, ctx.workspaceId))
      .orderBy(desc(importBatches.createdAt))
      .limit(5),
    getIdentityTerms(ctx),
  ]);
  const justImported = one(sp.done) === "1";

  return (
    <>
      <Flash sp={sp} />
      <PageHeader
        title="Upload your spreadsheet"
        intro="Bring in your existing tracker (the .xlsx Excel file). Every sheet is read, and nothing is saved unless every row is accounted for."
      />

      {justImported && (
        <section className="next-box" style={{ marginBottom: "1.2rem" }}>
          <h2>Next step</h2>
          {terms.length === 0 ? (
            <>
              <p>Your leads are in. Now protect the personal details so they never appear in anything you share.</p>
              <Link className="button primary" href="/privacy">
                Open Privacy →
              </Link>
            </>
          ) : (
            <>
              <p>Your leads are in. Go Home and press Find new leads.</p>
              <Link className="button primary" href="/#weekly">
                Go to Home →
              </Link>
            </>
          )}
        </section>
      )}

      <form action={importAction} className="card stack">
        <label style={{ fontSize: "1rem", color: "var(--text)" }}>
          1. Choose the file
          <input type="file" name="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" required />
        </label>
        <div>
          <div style={{ fontWeight: 500, marginBottom: ".3rem" }}>2. Upload it</div>
          <SubmitButton className="primary big" pending="Uploading — this can take up to a minute…">
            Upload spreadsheet
          </SubmitButton>
        </div>
        {past.length > 0 && (
          <label className="check">
            <input type="checkbox" name="force" /> Upload this exact file again anyway{" "}
            <span className="muted small">(normally not needed — repeats are recognised and updated, never duplicated)</span>
          </label>
        )}
      </form>

      <h2>What happens</h2>
      <ul>
        <li>Each lead from your sheets (Priority, Raw leads, Hold, Archive) goes to the right list here.</li>
        <li>Target accounts become <Link href="/accounts">Companies</Link>, your History sheet goes into the Activity log, and your hidden CONFIG rules become your <Link href="/settings#rules">rules</Link>.</li>
        <li>If the same lead appears on several sheets, it becomes one lead — not duplicates.</li>
        <li>Uploading a newer version later is fine: existing leads are updated in place.</li>
      </ul>

      {past.length > 0 && (
        <>
          <h2>Uploaded before</h2>
          <ul className="plain">
            {past.map((b) => (
              <li key={b.createdAt + b.fileName}>
                {b.fileName} <span className="muted small">— {fmtWhen(b.createdAt)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
