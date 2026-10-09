import type { ModuleDef } from "../module";
import type { ModuleId } from "../types";
import { expansion } from "./expansion";
import { sponsors } from "./sponsors";
import { suppliers } from "./suppliers";
import { tenders } from "./tenders";

export const MODULES: Record<ModuleId, ModuleDef<Record<string, unknown>>> = {
  tenders: tenders as unknown as ModuleDef<Record<string, unknown>>,
  sponsors: sponsors as unknown as ModuleDef<Record<string, unknown>>,
  suppliers: suppliers as unknown as ModuleDef<Record<string, unknown>>,
  expansion: expansion as unknown as ModuleDef<Record<string, unknown>>,
};

export function moduleDef(id: ModuleId): ModuleDef<Record<string, unknown>> {
  return MODULES[id];
}

export function statusLabel(id: ModuleId, status: string | null | undefined): string {
  if (!status) return "Not saved";
  return MODULES[id].statuses.find((s) => s.id === status)?.label ?? status;
}
