import type { RecordRow } from "@/db/schema";
import { humanize } from "./plain";

type R = Partial<RecordRow>;

function Text({
  name,
  label,
  r,
  type = "text",
  full,
  required,
  placeholder,
}: {
  name: keyof RecordRow;
  label: string;
  r: R;
  type?: string;
  full?: boolean;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <label className={full ? "full" : undefined}>
      {label}
      <input name={name} type={type} defaultValue={(r[name] as string | null) ?? ""} required={required} placeholder={placeholder} />
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
      <p className="muted small">Only fill in what you know. Leave a box empty (or type &quot;unknown&quot;) rather than guessing.</p>
      <div className="fields">
        <Text name="account" label="Company *" r={r} required placeholder="e.g. Acme Corp" />
        <Text name="opportunity" label="Job title *" r={r} required placeholder="e.g. Implementation Specialist" />
        <Text name="sourceUrl" label="Link to the listing" r={r} placeholder="https://…" />
        <Text name="nextStepUrl" label="Link to apply (if different)" r={r} />
        <Text name="sourceBoard" label="Where you found it (site)" r={r} />
        <Text name="location" label="Location / remote notes" r={r} />
        <Text name="dateFound" label="Date found (e.g. 2026-09-25)" r={r} />
      </div>
      {!compact && (
        <>
          <h3>Fit and prepared package</h3>
          <div className="fields">
            <Text name="locationFit" label="Location fit" r={r} />
            <Text name="valueFit" label="Pay / value fit" r={r} />
            <Text name="lastVerifiedAt" label="Last checked (e.g. 2026-09-25)" r={r} />
            <Area name="requirements" label="Requirements" r={r} />
            <Area name="gapsHard" label="Gaps — must-haves missing" r={r} />
            <Area name="gapsSoft" label="Gaps — nice-to-haves missing" r={r} />
            <Area name="fitRationale" label="Why it fits" r={r} />
            <Area name="preparedBrief" label="Prepared brief (cover letter)" r={r} rows={6} />
            <Area name="preparedAnswers" label="Prepared answers" r={r} rows={6} />
            <Area name="nextAction" label="How to proceed / next action" r={r} rows={2} />
            <Area name="responseNotes" label="Response notes" r={r} />
            <Area name="notes" label="Notes (put contact details in the Contact person boxes, not here)" r={r} />
          </div>
          <h3>Contact person <span className="muted small">(private — never included in shared copies)</span></h3>
          <div className="fields restricted">
            <Text name="contactName" label="Contact name" r={r} />
            <Text name="contactEmail" label="Contact email" r={r} type="email" />
            <Text name="contactPhone" label="Contact phone" r={r} />
            <Text name="contactProfileUrl" label="Contact profile link" r={r} />
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
            {humanize(k)}
            <input name={`attr:${k}`} defaultValue={typeof v === "string" ? v : JSON.stringify(v)} />
          </label>
        ))}
        <label>
          Add another detail — name
          <input name="newAttrKey" placeholder="e.g. value" />
        </label>
        <label>
          Add another detail — value
          <input name="newAttrValue" placeholder="e.g. 120000 or unknown" />
        </label>
      </div>
    </>
  );
}
