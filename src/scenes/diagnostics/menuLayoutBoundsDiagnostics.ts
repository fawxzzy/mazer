import type { MenuSceneRuntimeDiagnostics } from '../menuRuntimeDiagnostics.ts';
import {
  cloneDiagnosticsValue,
  getExactDiagnosticsRecordDescriptors,
  isExactDiagnosticsRecord,
  type DiagnosticsJsonValue
} from './menuRuntimeDiagnosticsCompatibility.ts';

export const MENU_LAYOUT_BOUNDS_DIAGNOSTICS_SCHEMA_ID = 'mazer.menu.layout-bounds.v1' as const;
export const MENU_LAYOUT_BOUNDS_DIAGNOSTICS_SCHEMA_VERSION = 1 as const;

const ROOT_KEYS = ['schemaId', 'schemaVersion', 'payload'] as const;
const PAYLOAD_KEYS = ['board', 'player', 'goal'] as const;

export interface MenuLayoutBoundsDiagnosticsV1 {
  schemaId: typeof MENU_LAYOUT_BOUNDS_DIAGNOSTICS_SCHEMA_ID;
  schemaVersion: typeof MENU_LAYOUT_BOUNDS_DIAGNOSTICS_SCHEMA_VERSION;
  payload: DiagnosticsJsonValue;
}

export const createMenuLayoutBoundsDiagnosticsV1 = (
  source: MenuSceneRuntimeDiagnostics
): MenuLayoutBoundsDiagnosticsV1 | null => {
  try {
    const cloned = cloneDiagnosticsValue({
    board: source.play?.board ?? null,
    player: source.play?.player ?? null,
    goal: source.play?.goal ?? null
  });
    if (!cloned.ok) return null;
    return {
      schemaId: MENU_LAYOUT_BOUNDS_DIAGNOSTICS_SCHEMA_ID,
      schemaVersion: MENU_LAYOUT_BOUNDS_DIAGNOSTICS_SCHEMA_VERSION,
      payload: cloned.value as unknown as DiagnosticsJsonValue
    };
  } catch {
    return null;
  }
};

export const parseMenuLayoutBoundsDiagnosticsV1 = (
  value: unknown
): MenuLayoutBoundsDiagnosticsV1 | null => {
  const descriptors = getExactDiagnosticsRecordDescriptors(value, ROOT_KEYS);
  if (!descriptors) return null;
  if (
    descriptors.schemaId?.value !== MENU_LAYOUT_BOUNDS_DIAGNOSTICS_SCHEMA_ID
    || descriptors.schemaVersion?.value !== MENU_LAYOUT_BOUNDS_DIAGNOSTICS_SCHEMA_VERSION
    || !isExactDiagnosticsRecord(descriptors.payload?.value, PAYLOAD_KEYS)
  ) return null;
  const cloned = cloneDiagnosticsValue(value as DiagnosticsJsonValue);
  return cloned.ok ? cloned.value as unknown as MenuLayoutBoundsDiagnosticsV1 : null;
};
