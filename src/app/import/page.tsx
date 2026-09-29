import { importAction } from "./actions";
import { Flash, type SearchParams } from "@/components/ui";

export const dynamic = "force-dynamic";
// Importing a few hundred rows can take a little while on a hosted database.
export const maxDuration = 300;

export default async function ImportPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  return (
    <>
      <Flash sp={sp} />
      <h1>Import tracker workbook</h1>
      <p className="muted">
        Upload the prospect tracker (.xlsx). Every sheet is imported, and the import only saves if every row is accounted
        for. Repeats of records you already have are updated in place, never duplicated.
      </p>
      <form action={importAction} className="card stack">
        <label>
          Workbook file
          <input type="file" name="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" required />
        </label>
        <label className="check">
          <input type="checkbox" name="force" /> Import again anyway (only if this exact file was imported before)
        </label>
        <div>
          <button type="submit" className="primary">
            Import
          </button>
        </div>
        <p className="muted small">This can take up to a minute. Please don&apos;t close the page.</p>
      </form>
    </>
  );
}
