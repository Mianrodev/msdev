import Link from "next/link";
import { privacyAction } from "../actions";
import { SubmitButton } from "@/components/client";
import { Flash, PageHeader, type SearchParams } from "@/components/ui";
import { getPrivacy, PRIVACY_FIELDS, termsFrom } from "@/services/privacy";
import { getCtx } from "@/services/request";

export const dynamic = "force-dynamic";

export default async function PrivacyPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const ctx = await getCtx();
  const d = await getPrivacy(ctx);
  const protectedCount = termsFrom(d).length;
  return (
    <>
      <Flash sp={sp} />
      <PageHeader
        title="Privacy"
        intro="Type the personal details of the person this tracker is for. They will never appear in anything you download as a shared copy — they're replaced with [REDACTED]."
      />
      <div className={protectedCount ? "help" : "note"} style={{ marginBottom: "1rem" }}>
        {protectedCount ? (
          <>
            <strong>✓ Protected:</strong> {protectedCount} words and phrases are being hidden from shared copies.
          </>
        ) : (
          <>
            <strong>Not set up yet.</strong> Fill in at least the name below and press Save.
          </>
        )}
      </div>
      <form action={privacyAction} className="card stack">
        <div className="fields">
          {PRIVACY_FIELDS.map((f) => (
            <label key={f.key}>
              {f.label}
              <input name={f.key} defaultValue={d[f.key]} placeholder={f.example} autoComplete="off" />
            </label>
          ))}
          <label className="full">
            Anything else to hide <span className="hint">(optional — one per line, e.g. a nickname or old employer)</span>
            <textarea name="other" rows={3} defaultValue={d.other.join("\n")} />
          </label>
        </div>
        <p className="muted small">
          Leave a box empty if it doesn&apos;t apply. We also hide close variations automatically, like the first name on its
          own and the phone number without spaces. Any email address or phone number is hidden from shared copies anyway.
        </p>
        <div>
          <SubmitButton pending="Saving…">Save privacy details</SubmitButton>
        </div>
      </form>
      <h2>What does this protect?</h2>
      <ul>
        <li>
          <strong>Shared copies</strong> (the &quot;Download shared copy&quot; button on the Leads page) never contain these
          details, prepared briefs and answers, private notes, or anyone&apos;s contact details.
        </li>
        <li>
          <strong>Your own full backup</strong> (&quot;Download full backup&quot;) keeps everything — don&apos;t send that one to
          anyone.
        </li>
        <li>These details are saved only in your private database. They&apos;re never sent anywhere.</li>
      </ul>
      <p className="small muted">
        Next: go back <Link href="/">Home</Link> and press Find new leads.
      </p>
    </>
  );
}
