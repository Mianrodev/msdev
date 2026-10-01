import Link from "next/link";
import { profileAction } from "../actions";
import { SubmitButton } from "@/components/client";
import { Flash, PageHeader, type SearchParams } from "@/components/ui";
import { getProfile } from "@/services/answers";
import { getCtx } from "@/services/request";

export const dynamic = "force-dynamic";

export default async function AboutMePage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const ctx = await getCtx();
  const profile = await getProfile(ctx);
  return (
    <>
      <Flash sp={sp} />
      <PageHeader
        title="About me"
        intro="Your profile in your own words: what you're good at, the roles you want, your deal-breakers and pay floor, how you write. Your AI reads it to judge which jobs fit you and to write cover letters in your voice."
      />
      <form action={profileAction} className="card stack">
        <label>
          Your profile <span className="hint">(paste or type — plain text is fine; headings help)</span>
          <textarea name="profile" rows={24} defaultValue={profile} placeholder="Who I am, roles I want, roles I don't want, where I can work, pay, my experience, how I like to be helped…" />
        </label>
        <div>
          <SubmitButton pending="Saving…">Save</SubmitButton>
        </div>
        <p className="small muted" style={{ margin: 0 }}>
          Private to you: it never appears in shared downloads, and the Activity page records only that it changed, not what it
          says. Leave out passwords, ID numbers and bank details. Your everyday answers (notice period, pay…) for copying into
          applications live on <Link href="/answers">My answers</Link>.
        </p>
      </form>
    </>
  );
}
