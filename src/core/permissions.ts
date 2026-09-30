/**
 * Permission boundary: the application researches and prepares — it never acts.
 *
 * There is no capability that sends, submits, or contacts anything, and none can
 * be granted. States that record a human's outside action (approved, sent
 * manually, responded) can only be set by a human actor with explicit
 * confirmation. Automated processes (reconciliation, import) are system/import
 * actors and are refused those capabilities.
 *
 * The companion ESLint rule (eslint.config.mjs) forbids outbound network
 * primitives in src/, so the boundary also holds at the code level. The one
 * exception, src/sources/job-boards.ts, only reads public job listings.
 */
import { HUMAN_ONLY_OUTREACH, type Actor, type OutreachStatus } from "./types";

export const CAPABILITIES = [
  "record.write",
  "record.decide",
  "record.archive",
  "outreach.prepare",
  "outreach.record_human_action",
  "rules.edit",
  "settings.edit",
  "export.internal",
  "export.shared",
  "reconcile.run",
  "import.run",
] as const;
export type Capability = (typeof CAPABILITIES)[number];

/** Actions the product deliberately does not implement. Listed so they are refused loudly. */
export const FORBIDDEN_ACTIONS = ["outreach.send", "outreach.submit", "contact.auto"] as const;

const SYSTEM_ALLOWED: ReadonlySet<Capability> = new Set([
  "record.write",
  "record.decide",
  "record.archive",
  "reconcile.run",
  "export.shared",
]);
const IMPORT_ALLOWED: ReadonlySet<Capability> = new Set(["record.write", "import.run", "rules.edit", "settings.edit"]);

export class PermissionError extends Error {}

export function can(actor: Actor, capability: Capability | string): boolean {
  if ((FORBIDDEN_ACTIONS as readonly string[]).includes(capability)) return false;
  if (!(CAPABILITIES as readonly string[]).includes(capability)) return false;
  switch (actor.kind) {
    case "human":
      return true;
    case "system":
      return SYSTEM_ALLOWED.has(capability as Capability);
    case "import":
      return IMPORT_ALLOWED.has(capability as Capability);
  }
}

export function assertCan(actor: Actor, capability: Capability | string): void {
  if (!can(actor, capability)) {
    throw new PermissionError(
      (FORBIDDEN_ACTIONS as readonly string[]).includes(capability)
        ? `"${capability}" is not something this application does. A human sends outreach manually.`
        : `${actor.kind} actor may not perform ${capability}`,
    );
  }
}

/**
 * Outreach status changes. Moving into a human-only state requires a human
 * actor AND an explicit confirmation that the human did it themselves.
 */
export function assertOutreachChange(actor: Actor, to: OutreachStatus, humanConfirmed: boolean): void {
  if (HUMAN_ONLY_OUTREACH.includes(to)) {
    assertCan(actor, "outreach.record_human_action");
    if (!humanConfirmed) {
      throw new PermissionError(`Setting "${to}" requires confirming that you did this yourself, outside the app`);
    }
  } else {
    assertCan(actor, "outreach.prepare");
  }
}
