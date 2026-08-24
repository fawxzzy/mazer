import type { MenuSceneRuntimeDiagnostics } from '../menuRuntimeDiagnostics.ts';
import {
  cloneDiagnosticsValue,
  getExactDiagnosticsRecordDescriptors,
  isExactDiagnosticsRecord,
  type DiagnosticsJsonValue
} from './menuRuntimeDiagnosticsCompatibility.ts';

export const MENU_WORLD_SEMANTIC_DIAGNOSTICS_SCHEMA_ID = 'mazer.menu.world-semantic.v1' as const;
export const MENU_WORLD_SEMANTIC_DIAGNOSTICS_SCHEMA_VERSION = 1 as const;

const ROOT_KEYS = ['schemaId', 'schemaVersion', 'payload'] as const;
const PAYLOAD_KEYS = [
  'lifecycle', 'patrol', 'pressure', 'timer', 'playtest', 'menuDemo', 'generation', 'projection', 'progression'
] as const;

export interface MenuWorldSemanticDiagnosticsV1 {
  schemaId: typeof MENU_WORLD_SEMANTIC_DIAGNOSTICS_SCHEMA_ID;
  schemaVersion: typeof MENU_WORLD_SEMANTIC_DIAGNOSTICS_SCHEMA_VERSION;
  payload: DiagnosticsJsonValue;
}

export const createMenuWorldSemanticDiagnosticsV1 = (
  source: MenuSceneRuntimeDiagnostics
): MenuWorldSemanticDiagnosticsV1 | null => {
  try {
    const cloned = cloneDiagnosticsValue({
    lifecycle: source.play?.lifecycle ?? null,
    patrol: source.play?.patrol ?? null,
    pressure: source.play?.pressure ?? null,
    timer: source.play?.timer ?? null,
    playtest: source.play?.playtest ?? null,
    menuDemo: source.menuDemo ?? null,
    generation: source.generation ?? null,
    projection: source.projection,
    progression: source.progression ?? null
  });
    if (!cloned.ok) return null;
    return {
      schemaId: MENU_WORLD_SEMANTIC_DIAGNOSTICS_SCHEMA_ID,
      schemaVersion: MENU_WORLD_SEMANTIC_DIAGNOSTICS_SCHEMA_VERSION,
      payload: cloned.value as unknown as DiagnosticsJsonValue
    };
  } catch {
    return null;
  }
};

export const parseMenuWorldSemanticDiagnosticsV1 = (
  value: unknown
): MenuWorldSemanticDiagnosticsV1 | null => {
  const descriptors = getExactDiagnosticsRecordDescriptors(value, ROOT_KEYS);
  if (!descriptors) return null;
  if (
    descriptors.schemaId?.value !== MENU_WORLD_SEMANTIC_DIAGNOSTICS_SCHEMA_ID
    || descriptors.schemaVersion?.value !== MENU_WORLD_SEMANTIC_DIAGNOSTICS_SCHEMA_VERSION
    || !isExactDiagnosticsRecord(descriptors.payload?.value, PAYLOAD_KEYS)
  ) return null;
  const cloned = cloneDiagnosticsValue(value as DiagnosticsJsonValue);
  return cloned.ok ? cloned.value as unknown as MenuWorldSemanticDiagnosticsV1 : null;
};
