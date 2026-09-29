import type { RuleRow } from "@/db/schema";
import type { RuleOperator } from "@/core/rules";
import { humanize } from "./plain";

export const OPERATOR_WORDS: Record<RuleOperator, string> = {
  gte: "is at least (a number)",
  lte: "is at most (a number)",
  includes_any: "contains one of these words",
  excludes_all: "does not contain any of these words",
  starts_with_any: "starts with one of these words",
  not_starts_with_any: "does not start with any of these words",
  equals: "is exactly",
  note: "— just a note, not checked automatically",
};

const FAILS_WHEN: Record<RuleOperator, string> = {
  gte: "is below",
  lte: "is above",
  includes_any: "doesn't contain any of",
  excludes_all: "contains any of",
  starts_with_any: "doesn't start with any of",
  not_starts_with_any: "starts with",
  equals: "isn't exactly",
  note: "",
};

export const STEP_FROM: Record<string, string> = {
  screen: "From the first look (step 2) onwards",
  triage: "From the deeper look (step 3) onwards",
  verify: "Only at the final check (step 4)",
};

const valueText = (v: unknown) => (Array.isArray(v) ? v.join(", ") : v == null ? "" : String(v));

/** "Archive the lead if "Verified location fit" starts with: NO." */
export function ruleSentence(r: Pick<RuleRow, "operator" | "field" | "value" | "effect">): string {
  if (r.operator === "note") return "A note for you — not checked automatically.";
  const action = r.effect === "hold" ? "Put the lead on hold" : "Archive the lead";
  return `${action} if "${humanize(r.field)}" ${FAILS_WHEN[r.operator]}: ${valueText(r.value)}.`;
}

export function RuleFields({ rule, fieldNames = [] }: { rule?: Partial<RuleRow>; fieldNames?: string[] }) {
  return (
    <div className="fields">
      <label className="full">
        Name of this check *
        <input name="label" defaultValue={rule?.label ?? ""} required placeholder="e.g. Must be remote" />
      </label>
      <label>
        Which detail does it look at? *
        <input name="field" defaultValue={rule?.field ?? ""} list="rule-fields" placeholder="e.g. location" />
        <datalist id="rule-fields">
          {fieldNames.map((f) => (
            <option key={f} value={f}>
              {humanize(f)}
            </option>
          ))}
        </datalist>
        <span className="hint">Start typing to pick from the details your leads have.</span>
      </label>
      <label>
        The detail…
        <select name="operator" defaultValue={rule?.operator ?? "includes_any"}>
          {(Object.keys(OPERATOR_WORDS) as RuleOperator[]).map((o) => (
            <option key={o} value={o}>
              {OPERATOR_WORDS[o]}
            </option>
          ))}
        </select>
      </label>
      <label className="full">
        …these words or this number <span className="hint">(for several words, put one per line)</span>
        <textarea name="value" rows={3} defaultValue={valueText(rule?.value).replace(/, /g, "\n")} />
      </label>
      <label>
        If a lead fails this check
        <select name="effect" defaultValue={rule?.effect ?? "reject"}>
          <option value="reject">Archive it (not a fit)</option>
          <option value="hold">Put it on hold (needs a look)</option>
        </select>
      </label>
      <label>
        When does it apply?
        <select name="appliesFrom" defaultValue={rule?.appliesFrom ?? "screen"}>
          {Object.entries(STEP_FROM).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </label>
      <label className="full">
        Notes about this check <span className="hint">(optional)</span>
        <textarea name="description" rows={2} defaultValue={rule?.description ?? ""} />
      </label>
      <input type="hidden" name="key" value={rule?.key ?? ""} />
      <label className="check">
        <input type="checkbox" name="enabled" defaultChecked={rule?.enabled ?? true} /> Switched on
      </label>
      <p className="muted small full">
        A lead whose detail is unknown never fails a check — it just isn&apos;t counted either way.
      </p>
    </div>
  );
}
