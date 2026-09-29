import { createLeadAction } from "../../actions";
import { RecordFields } from "@/components/record-fields";
import { Flash, type SearchParams } from "@/components/ui";

export default async function NewLead({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  return (
    <>
      <Flash sp={sp} />
      <h1>New lead</h1>
      <p className="muted">
        Stage 1 — Discovery. If a record with the same account, opportunity and source/next-step URL exists, it is updated in
        place instead of duplicated.
      </p>
      <form action={createLeadAction} className="card stack">
        <RecordFields compact />
        <div>
          <button type="submit" className="primary">
            Save lead
          </button>
        </div>
      </form>
    </>
  );
}
