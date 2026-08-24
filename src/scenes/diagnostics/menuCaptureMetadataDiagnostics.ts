import type { MenuSceneRuntimeDiagnostics } from '../menuRuntimeDiagnostics.ts';
import {
  cloneDiagnosticsValue,
  getExactDiagnosticsRecordDescriptors,
  isExactDiagnosticsRecord,
  type DiagnosticsJsonValue
} from './menuRuntimeDiagnosticsCompatibility.ts';

export const MENU_CAPTURE_METADATA_DIAGNOSTICS_SCHEMA_ID = 'mazer.menu.capture-metadata.v1' as const;
export const MENU_CAPTURE_METADATA_DIAGNOSTICS_SCHEMA_VERSION = 1 as const;

const ROOT_KEYS = ['schemaId', 'schemaVersion', 'payload'] as const;
const PAYLOAD_KEYS = ['feed', 'telemetry', 'cycleTelemetry'] as const;

export interface MenuCaptureMetadataDiagnosticsV1 {
  schemaId: typeof MENU_CAPTURE_METADATA_DIAGNOSTICS_SCHEMA_ID;
  schemaVersion: typeof MENU_CAPTURE_METADATA_DIAGNOSTICS_SCHEMA_VERSION;
  payload: DiagnosticsJsonValue;
}

export const createMenuCaptureMetadataDiagnosticsV1 = (
  source: MenuSceneRuntimeDiagnostics
): MenuCaptureMetadataDiagnosticsV1 | null => {
  try {
    const cloned = cloneDiagnosticsValue({
    feed: source.feed,
    telemetry: source.telemetry,
    cycleTelemetry: source.cycleTelemetry ?? null
  });
    if (!cloned.ok) return null;
    return {
      schemaId: MENU_CAPTURE_METADATA_DIAGNOSTICS_SCHEMA_ID,
      schemaVersion: MENU_CAPTURE_METADATA_DIAGNOSTICS_SCHEMA_VERSION,
      payload: cloned.value as unknown as DiagnosticsJsonValue
    };
  } catch {
    return null;
  }
};

export const parseMenuCaptureMetadataDiagnosticsV1 = (
  value: unknown
): MenuCaptureMetadataDiagnosticsV1 | null => {
  const descriptors = getExactDiagnosticsRecordDescriptors(value, ROOT_KEYS);
  if (!descriptors) return null;
  if (
    descriptors.schemaId?.value !== MENU_CAPTURE_METADATA_DIAGNOSTICS_SCHEMA_ID
    || descriptors.schemaVersion?.value !== MENU_CAPTURE_METADATA_DIAGNOSTICS_SCHEMA_VERSION
    || !isExactDiagnosticsRecord(descriptors.payload?.value, PAYLOAD_KEYS)
  ) return null;
  const cloned = cloneDiagnosticsValue(value as DiagnosticsJsonValue);
  return cloned.ok ? cloned.value as unknown as MenuCaptureMetadataDiagnosticsV1 : null;
};
