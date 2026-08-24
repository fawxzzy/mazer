import type { MenuSceneRuntimeDiagnostics } from '../menuRuntimeDiagnostics.ts';
import {
  cloneDiagnosticsValue,
  getExactDiagnosticsRecordDescriptors,
  isExactDiagnosticsRecord,
  type DiagnosticsJsonValue
} from './menuRuntimeDiagnosticsCompatibility.ts';

export const MENU_SURFACE_STATE_DIAGNOSTICS_SCHEMA_ID = 'mazer.menu.surface-state.v1' as const;
export const MENU_SURFACE_STATE_DIAGNOSTICS_SCHEMA_VERSION = 1 as const;

const ROOT_KEYS = ['schemaId', 'schemaVersion', 'payload'] as const;
const PAYLOAD_KEYS = [
  'revision', 'sceneInstanceId', 'updatedAt', 'runtimeMs', 'surface', 'auth', 'gameToggles'
] as const;

export interface MenuSurfaceStateDiagnosticsV1 {
  schemaId: typeof MENU_SURFACE_STATE_DIAGNOSTICS_SCHEMA_ID;
  schemaVersion: typeof MENU_SURFACE_STATE_DIAGNOSTICS_SCHEMA_VERSION;
  payload: DiagnosticsJsonValue;
}

export const createMenuSurfaceStateDiagnosticsV1 = (
  source: MenuSceneRuntimeDiagnostics
): MenuSurfaceStateDiagnosticsV1 | null => {
  try {
    const cloned = cloneDiagnosticsValue({
    revision: source.revision,
    sceneInstanceId: source.sceneInstanceId,
    updatedAt: source.updatedAt,
    runtimeMs: source.runtimeMs,
    surface: source.surface,
    auth: source.auth ?? null,
    gameToggles: source.gameToggles ?? null
  });
    if (!cloned.ok) return null;
    return {
      schemaId: MENU_SURFACE_STATE_DIAGNOSTICS_SCHEMA_ID,
      schemaVersion: MENU_SURFACE_STATE_DIAGNOSTICS_SCHEMA_VERSION,
      payload: cloned.value as unknown as DiagnosticsJsonValue
    };
  } catch {
    return null;
  }
};

export const parseMenuSurfaceStateDiagnosticsV1 = (
  value: unknown
): MenuSurfaceStateDiagnosticsV1 | null => {
  const descriptors = getExactDiagnosticsRecordDescriptors(value, ROOT_KEYS);
  if (!descriptors) return null;
  if (
    descriptors.schemaId?.value !== MENU_SURFACE_STATE_DIAGNOSTICS_SCHEMA_ID
    || descriptors.schemaVersion?.value !== MENU_SURFACE_STATE_DIAGNOSTICS_SCHEMA_VERSION
    || !isExactDiagnosticsRecord(descriptors.payload?.value, PAYLOAD_KEYS)
  ) return null;
  const cloned = cloneDiagnosticsValue(value as DiagnosticsJsonValue);
  return cloned.ok ? cloned.value as unknown as MenuSurfaceStateDiagnosticsV1 : null;
};
