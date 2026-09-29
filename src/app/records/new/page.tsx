import { createLeadAction } from "../../actions";
import { SubmitButton } from "@/components/client";
import { RecordFields } from "@/components/record-fields";
import { BackLink, Flash, PageHeader, type SearchParams } from "@/components/ui";

export default async function NewLead({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  return (
    <>
      <Flash sp={sp} />
      <BackLink href="/records?list=checking">Back to Leads</BackLink>
      <PageHeader
        title="Add a lead"
        intro="Found an opening or a company to approach? Add it here. Only the company and the opportunity are required. If you already have this lead, it's updated instead of added twice."
      />
      <form action={createLeadAction} className="card stack">
        <RecordFields compact />
        <div>
          <SubmitButton pending="Saving…">Add lead</SubmitButton>
        </div>
      </form>
    </>
  );
}
