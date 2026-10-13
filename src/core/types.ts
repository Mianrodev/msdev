/** Shared vocabulary used across the app. */

/** True for blank values and for values that *say* they're unknown ("UNKNOWN", "Not stated", "TBC", "N/A"…). */
export function isUnknown(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v !== "string") return false;
  const s = v.trim().toUpperCase();
  return (
    s === "" ||
    /^(UNKNOWN|NOT DISCLOSED|NOT STATED|NOT PUBLISHED|NOT CHECKED|TBD|TBA|TBC|PENDING|NONE|N\/A|NA|-+|—|\?+)(?![A-Z0-9])/.test(s)
  );
}

/** Who did something: a signed-in person, or an automated process. */
export type Actor = { kind: "human"; id: string } | { kind: "system"; process: string };

export function actorLabel(a: Actor): string {
  return a.kind === "human" ? `human:${a.id}` : `system:${a.process}`;
}
