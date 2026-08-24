import type { MenuSceneRuntimeDiagnostics } from '../menuRuntimeDiagnostics.ts';
import {
  cloneDiagnosticsValue,
  getExactDiagnosticsRecordDescriptors,
  isExactDiagnosticsRecord,
  type DiagnosticsJsonValue
} from './menuRuntimeDiagnosticsCompatibility.ts';

export const MENU_RENDER_DPR_DIAGNOSTICS_SCHEMA_ID = 'mazer.menu.render-dpr.v1' as const;
export const MENU_RENDER_DPR_DIAGNOSTICS_SCHEMA_VERSION = 1 as const;

const ROOT_KEYS = ['schemaId', 'schemaVersion', 'payload'] as const;
const PAYLOAD_KEYS = ['visibility', 'performance', 'resources', 'markerStyle'] as const;

export interface MenuRenderDprDiagnosticsV1 {
  schemaId: typeof MENU_RENDER_DPR_DIAGNOSTICS_SCHEMA_ID;
  schemaVersion: typeof MENU_RENDER_DPR_DIAGNOSTICS_SCHEMA_VERSION;
  payload: DiagnosticsJsonValue;
}

export const createMenuRenderDprDiagnosticsV1 = (
  source: MenuSceneRuntimeDiagnostics
): MenuRenderDprDiagnosticsV1 | null => {
  try {
    const cloned = cloneDiagnosticsValue({
    visibility: source.visibility,
    performance: source.performance,
    resources: source.resources,
    markerStyle: source.play?.markerStyle ?? null
  });
    if (!cloned.ok) return null;
    return {
      schemaId: MENU_RENDER_DPR_DIAGNOSTICS_SCHEMA_ID,
      schemaVersion: MENU_RENDER_DPR_DIAGNOSTICS_SCHEMA_VERSION,
      payload: cloned.value as unknown as DiagnosticsJsonValue
    };
  } catch {
    return null;
  }
};

export const parseMenuRenderDprDiagnosticsV1 = (
  value: unknown
): MenuRenderDprDiagnosticsV1 | null => {
  const descriptors = getExactDiagnosticsRecordDescriptors(value, ROOT_KEYS);
  if (!descriptors) return null;
  if (
    descriptors.schemaId?.value !== MENU_RENDER_DPR_DIAGNOSTICS_SCHEMA_ID
    || descriptors.schemaVersion?.value !== MENU_RENDER_DPR_DIAGNOSTICS_SCHEMA_VERSION
    || !isExactDiagnosticsRecord(descriptors.payload?.value, PAYLOAD_KEYS)
  ) return null;
  const cloned = cloneDiagnosticsValue(value as DiagnosticsJsonValue);
  return cloned.ok ? cloned.value as unknown as MenuRenderDprDiagnosticsV1 : null;
};
