import { createAccountAction } from "../../actions";
import { AccountFields } from "@/components/account-fields";
import { Flash, type SearchParams } from "@/components/ui";

export default async function NewAccount({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  return (
    <>
      <Flash sp={sp} />
      <h1>New target account</h1>
      <form action={createAccountAction} className="card stack">
        <AccountFields />
        <div>
          <button type="submit" className="primary">
            Save
          </button>
        </div>
      </form>
    </>
  );
}
