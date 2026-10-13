/**
 * Permission boundary. The app researches and prepares — it never acts: there is no capability that
 * sends, submits or contacts anything, and none can be granted. Statuses that record something a
 * person did outside the app ("submitted", "contacted", "sample requested") need a human actor.
 * Managing the team is owner-only and is checked in src/lib/auth.ts.
 */
import type { Actor } from "./types";

export const CAPABILITIES = ["record.write", "outreach.record_human_action", "export.internal", "export.shared"] as const;
export type Capability = (typeof CAPABILITIES)[number];

/** Actions the product deliberately does not implement. Listed so they are refused loudly. */
export const FORBIDDEN_ACTIONS = ["outreach.send", "outreach.submit", "contact.auto"] as const;

const SYSTEM_ALLOWED: ReadonlySet<Capability> = new Set(["record.write", "export.shared"]);

export class PermissionError extends Error {}

export function can(actor: Actor, capability: Capability | string): boolean {
  if ((FORBIDDEN_ACTIONS as readonly string[]).includes(capability)) return false;
  if (!(CAPABILITIES as readonly string[]).includes(capability)) return false;
  return actor.kind === "human" || SYSTEM_ALLOWED.has(capability as Capability);
}

export function assertCan(actor: Actor, capability: Capability | string): void {
  if (!can(actor, capability)) {
    throw new PermissionError(
      (FORBIDDEN_ACTIONS as readonly string[]).includes(capability)
        ? `"${capability}" is not something this application does. People contact others themselves.`
        : `${actor.kind} actor may not perform ${capability}`,
    );
  }
}
