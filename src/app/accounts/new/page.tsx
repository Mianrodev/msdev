import { createAccountAction } from "../../actions";
import { AccountFields } from "@/components/account-fields";
import { SubmitButton } from "@/components/client";
import { BackLink, Flash, PageHeader, type SearchParams } from "@/components/ui";

export default async function NewCompany({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  return (
    <>
      <Flash sp={sp} />
      <BackLink href="/accounts">Back to Companies</BackLink>
      <PageHeader title="Add a company" intro="Only the name is required. If you already have this company, it's updated instead of added twice." />
      <form action={createAccountAction} className="card stack">
        <AccountFields />
        <div>
          <SubmitButton pending="Saving…">Add company</SubmitButton>
        </div>
      </form>
    </>
  );
}
