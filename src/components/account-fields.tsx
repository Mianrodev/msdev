import type { TargetAccountRow } from "@/db/schema";

type A = Partial<TargetAccountRow>;

const text = (a: A, k: keyof TargetAccountRow) => (a[k] as string | null) ?? "";

function T({ a, k, label }: { a: A; k: keyof TargetAccountRow; label: string }) {
  return (
    <label>
      {label}
      <input name={k} defaultValue={text(a, k)} required={k === "name"} />
    </label>
  );
}

function X({ a, k, label, rows = 3 }: { a: A; k: keyof TargetAccountRow; label: string; rows?: number }) {
  return (
    <label className="full">
      {label}
      <textarea name={k} rows={rows} defaultValue={text(a, k)} />
    </label>
  );
}

export function AccountFields({ a = {} }: { a?: A }) {
  return (
    <>
      <div className="fields">
        <T a={a} k="name" label="Company name *" />
        <T a={a} k="website" label="Website" />
        <T a={a} k="sourceUrl" label="Where you found it (link)" />
        <T a={a} k="fit" label="Fit" />
        <X a={a} k="description" label="What they do" />
        <X a={a} k="evidence" label="Evidence" />
        <X a={a} k="fitRationale" label="Why they fit" />
        <X a={a} k="preparedBrief" label="Prepared message — short" rows={4} />
        <X a={a} k="preparedBriefLong" label="Prepared message — long" rows={6} />
        <X a={a} k="responseNotes" label="Response notes" />
        <X a={a} k="notes" label="Notes (put contact details in the Contact person boxes, not here)" />
      </div>
      <h3>Contact person <span className="muted small">(private — never included in shared copies)</span></h3>
      <div className="fields restricted">
        <T a={a} k="contactName" label="Contact name" />
        <T a={a} k="contactEmail" label="Contact email" />
        <T a={a} k="contactPhone" label="Contact phone" />
        <T a={a} k="contactProfileUrl" label="Contact profile link" />
      </div>
    </>
  );
}
