import type { RecordRow } from "@/db/schema";

type R = Partial<RecordRow>;

function Text({ name, label, r, type = "text", full }: { name: keyof RecordRow; label: string; r: R; type?: string; full?: boolean }) {
  return (
    <label className={full ? "full" : undefined}>
      {label}
      <input name={name} type={type} defaultValue={(r[name] as string | null) ?? ""} />
    </label>
  );
}

function Area({ name, label, r, rows = 3 }: { name: keyof RecordRow; label: string; r: R; rows?: number }) {
  return (
    <label className="full">
      {label}
      <textarea name={name} rows={rows} defaultValue={(r[name] as string | null) ?? ""} />
    </label>
  );
}

/** Editable descriptive fields. Pipeline state is changed only through the decision/status forms. */
export function RecordFields({ r = {}, compact = false }: { r?: R; compact?: boolean }) {
  return (
    <>
      <p className="muted small">Leave a field blank or write UNKNOWN if it isn&apos;t known — never guess.</p>
      <div className="fields">
        <Text name="account" label="Account *" r={r} />
        <Text name="opportunity" label="Opportunity *" r={r} />
        <Text name="sourceUrl" label="Source URL" r={r} />
        <Text name="nextStepUrl" label="Next-step URL" r={r} />
        <Text name="sourceBoard" label="Source board" r={r} />
        <Text name="location" label="Location" r={r} />
        <Text name="dateFound" label="Date found (YYYY-MM-DD)" r={r} />
      </div>
      {!compact && (
        <>
          <h3>Fit &amp; prepared package</h3>
          <div className="fields">
            <Text name="locationFit" label="Location fit" r={r} />
            <Text name="valueFit" label="Value fit" r={r} />
            <Text name="lastVerifiedAt" label="Last verified (YYYY-MM-DD)" r={r} />
            <Area name="requirements" label="Requirements" r={r} />
            <Area name="gapsHard" label="Gaps (hard)" r={r} />
            <Area name="gapsSoft" label="Gaps (soft)" r={r} />
            <Area name="fitRationale" label="Fit rationale" r={r} />
            <Area name="preparedBrief" label="Prepared brief" r={r} rows={6} />
            <Area name="preparedAnswers" label="Prepared answers" r={r} rows={6} />
            <Area name="nextAction" label="Next action" r={r} rows={2} />
            <Area name="responseNotes" label="Response notes" r={r} />
            <Area name="notes" label="Notes (no personal contact details — use the contact fields)" r={r} />
          </div>
          <h3>Contact (restricted — never exported in shared output, never used for matching)</h3>
          <div className="fields restricted">
            <Text name="contactName" label="Contact name" r={r} />
            <Text name="contactEmail" label="Contact email" r={r} type="email" />
            <Text name="contactPhone" label="Contact phone" r={r} />
            <Text name="contactProfileUrl" label="Contact profile URL" r={r} />
          </div>
        </>
      )}
    </>
  );
}

/** Criterion values the rules evaluate. */
export function AttributeFields({ attributes }: { attributes: Record<string, unknown> }) {
  const entries = Object.entries(attributes).sort(([a], [b]) => a.localeCompare(b));
  return (
    <>
      <input type="hidden" name="attrs" value="1" />
      <div className="fields">
        {entries.map(([k, v]) => (
          <label key={k}>
            {k}
            <input name={`attr:${k}`} defaultValue={typeof v === "string" ? v : JSON.stringify(v)} />
          </label>
        ))}
        <label>
          New attribute name
          <input name="newAttrKey" placeholder="e.g. value" />
        </label>
        <label>
          New attribute value
          <input name="newAttrValue" placeholder="e.g. 120000 or UNKNOWN" />
        </label>
      </div>
    </>
  );
}
