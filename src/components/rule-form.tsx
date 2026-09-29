import type { RuleRow } from "@/db/schema";
import { OPERATOR_LABELS, RULE_OPERATORS } from "@/core/rules";

export function RuleFields({ rule }: { rule?: Partial<RuleRow> }) {
  const v = rule?.value;
  const valueText = Array.isArray(v) ? v.join("\n") : v == null ? "" : String(v);
  return (
    <div className="fields">
      <label>
        Key (unique)
        <input name="key" defaultValue={rule?.key ?? ""} required pattern="[A-Za-z0-9_.\-]+" />
      </label>
      <label>
        Label
        <input name="label" defaultValue={rule?.label ?? ""} required />
      </label>
      <label>
        Applies from stage
        <select name="appliesFrom" defaultValue={rule?.appliesFrom ?? "screen"}>
          <option value="screen">2. Screen (and later)</option>
          <option value="triage">2.5 Triage (and later)</option>
          <option value="verify">3. Verify</option>
        </select>
      </label>
      <label>
        Field evaluated
        <input name="field" defaultValue={rule?.field ?? ""} placeholder="e.g. location, value, verifiedOpen" />
      </label>
      <label>
        Operator
        <select name="operator" defaultValue={rule?.operator ?? "note"}>
          {RULE_OPERATORS.map((o) => (
            <option key={o} value={o}>
              {OPERATOR_LABELS[o]}
            </option>
          ))}
        </select>
      </label>
      <label>
        On violation
        <select name="effect" defaultValue={rule?.effect ?? "reject"}>
          <option value="reject">Reject → Archive</option>
          <option value="hold">Needs review → Hold</option>
        </select>
      </label>
      <label className="full">
        Value (number, a single value, or one term per line)
        <textarea name="value" rows={3} defaultValue={valueText} />
      </label>
      <label className="full">
        Description
        <textarea name="description" rows={3} defaultValue={rule?.description ?? ""} />
      </label>
      <label className="check">
        <input type="checkbox" name="enabled" defaultChecked={rule?.enabled ?? true} /> Enabled
      </label>
    </div>
  );
}
