import type { MenuSceneRuntimeDiagnostics } from '../menuRuntimeDiagnostics.ts';
import {
  cloneDiagnosticsValue,
  getExactDiagnosticsRecordDescriptors,
  isExactDiagnosticsRecord,
  type DiagnosticsJsonValue
} from './menuRuntimeDiagnosticsCompatibility.ts';

export const MENU_INPUT_DIAGNOSTICS_SCHEMA_ID = 'mazer.menu.input.v1' as const;
export const MENU_INPUT_DIAGNOSTICS_SCHEMA_VERSION = 1 as const;

const ROOT_KEYS = ['schemaId', 'schemaVersion', 'payload'] as const;
const PAYLOAD_KEYS = ['input', 'inputBuffer', 'worldTurn'] as const;

export interface MenuInputDiagnosticsV1 {
  schemaId: typeof MENU_INPUT_DIAGNOSTICS_SCHEMA_ID;
  schemaVersion: typeof MENU_INPUT_DIAGNOSTICS_SCHEMA_VERSION;
  payload: DiagnosticsJsonValue;
}

export const createMenuInputDiagnosticsV1 = (
  source: MenuSceneRuntimeDiagnostics
): MenuInputDiagnosticsV1 | null => {
  try {
    const cloned = cloneDiagnosticsValue({
    input: source.input,
    inputBuffer: source.play?.inputBuffer ?? null,
    worldTurn: source.play?.worldTurn ?? null
  });
    if (!cloned.ok) return null;
    return {
      schemaId: MENU_INPUT_DIAGNOSTICS_SCHEMA_ID,
      schemaVersion: MENU_INPUT_DIAGNOSTICS_SCHEMA_VERSION,
      payload: cloned.value as unknown as DiagnosticsJsonValue
    };
  } catch {
    return null;
  }
};

export const parseMenuInputDiagnosticsV1 = (value: unknown): MenuInputDiagnosticsV1 | null => {
  const descriptors = getExactDiagnosticsRecordDescriptors(value, ROOT_KEYS);
  if (!descriptors) return null;
  if (
    descriptors.schemaId?.value !== MENU_INPUT_DIAGNOSTICS_SCHEMA_ID
    || descriptors.schemaVersion?.value !== MENU_INPUT_DIAGNOSTICS_SCHEMA_VERSION
    || !isExactDiagnosticsRecord(descriptors.payload?.value, PAYLOAD_KEYS)
  ) return null;
  const cloned = cloneDiagnosticsValue(value as DiagnosticsJsonValue);
  return cloned.ok ? cloned.value as unknown as MenuInputDiagnosticsV1 : null;
};
