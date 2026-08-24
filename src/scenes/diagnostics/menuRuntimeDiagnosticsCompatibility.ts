export type DiagnosticsJsonPrimitive = string | number | boolean | null;
export type DiagnosticsJsonValue =
  | DiagnosticsJsonPrimitive
  | DiagnosticsJsonValue[]
  | { [key: string]: DiagnosticsJsonValue };

export type DiagnosticsCloneResult<T> =
  | { ok: true; value: T }
  | { ok: false };

const FAILED_CLONE: DiagnosticsCloneResult<never> = { ok: false };

const cloneValue = (value: unknown, seen: Set<object>): DiagnosticsCloneResult<DiagnosticsJsonValue> => {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return { ok: true, value };
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? { ok: true, value } : FAILED_CLONE;
  }
  if (typeof value !== 'object') {
    return FAILED_CLONE;
  }

  try {
    if (seen.has(value)) {
      return FAILED_CLONE;
    }
    const prototype = Object.getPrototypeOf(value);
    if (Array.isArray(value)) {
      if (prototype !== Array.prototype) {
        return FAILED_CLONE;
      }
      const ownKeys = Reflect.ownKeys(value);
      const expectedKeys = new Set(['length', ...Array.from({ length: value.length }, (_, index) => String(index))]);
      if (
        ownKeys.some((key) => typeof key !== 'string' || !expectedKeys.has(key))
        || ownKeys.length !== expectedKeys.size
      ) {
        return FAILED_CLONE;
      }
      seen.add(value);
      const result: DiagnosticsJsonValue[] = [];
      for (let index = 0; index < value.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        if (!descriptor || !('value' in descriptor)) {
          seen.delete(value);
          return FAILED_CLONE;
        }
        const cloned = cloneValue(descriptor.value, seen);
        if (!cloned.ok) {
          seen.delete(value);
          return FAILED_CLONE;
        }
        result.push(cloned.value);
      }
      seen.delete(value);
      return { ok: true, value: result };
    }

    if (prototype !== Object.prototype) {
      return FAILED_CLONE;
    }
    seen.add(value);
    const result: Record<string, DiagnosticsJsonValue> = {};
    const descriptors = Object.getOwnPropertyDescriptors(value);
    for (const key of Reflect.ownKeys(descriptors)) {
      if (typeof key !== 'string') {
        seen.delete(value);
        return FAILED_CLONE;
      }
      const descriptor = descriptors[key];
      if (!descriptor || !('value' in descriptor)) {
        seen.delete(value);
        return FAILED_CLONE;
      }
      if (descriptor.value === undefined) {
        continue;
      }
      const cloned = cloneValue(descriptor.value, seen);
      if (!cloned.ok) {
        seen.delete(value);
        return FAILED_CLONE;
      }
      result[key] = cloned.value;
    }
    seen.delete(value);
    return { ok: true, value: result };
  } catch {
    return FAILED_CLONE;
  }
};

export const cloneDiagnosticsValue = <T>(
  value: T
): DiagnosticsCloneResult<T> => cloneValue(value, new Set()) as DiagnosticsCloneResult<T>;

export const getExactDiagnosticsRecordDescriptors = (
  value: unknown,
  keys: readonly string[]
): PropertyDescriptorMap | null => {
  try {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }
    if (Object.getPrototypeOf(value) !== Object.prototype) {
      return null;
    }
    const ownKeys = Reflect.ownKeys(value);
    if (ownKeys.some((key) => typeof key !== 'string') || ownKeys.length !== keys.length) {
      return null;
    }
    const expected = new Set(keys);
    if (ownKeys.some((key) => !expected.has(key as string))) {
      return null;
    }
    const descriptors = Object.getOwnPropertyDescriptors(value);
    return ownKeys.every((key) => {
      const descriptor = descriptors[key as string];
      return descriptor !== undefined && 'value' in descriptor;
    }) ? descriptors : null;
  } catch {
    return null;
  }
};

export const isExactDiagnosticsRecord = (
  value: unknown,
  keys: readonly string[]
): value is Record<string, unknown> => getExactDiagnosticsRecordDescriptors(value, keys) !== null;

export const MENU_RUNTIME_DIAGNOSTICS_COMPATIBILITY_SCHEMA_ID =
  'mazer.menu.runtime-diagnostics.compatibility.v1' as const;
export const MENU_RUNTIME_DIAGNOSTICS_COMPATIBILITY_SCHEMA_VERSION = 1 as const;

export const MENU_RUNTIME_DIAGNOSTICS_SCHEMA_KEYS = [
  'surfaceState',
  'layoutBounds',
  'renderDpr',
  'input',
  'worldSemantic',
  'captureMetadata'
] as const;

export interface MenuRuntimeDiagnosticsCompatibilityEnvelope {
  schemaId: typeof MENU_RUNTIME_DIAGNOSTICS_COMPATIBILITY_SCHEMA_ID;
  schemaVersion: typeof MENU_RUNTIME_DIAGNOSTICS_COMPATIBILITY_SCHEMA_VERSION;
  schemas: Record<(typeof MENU_RUNTIME_DIAGNOSTICS_SCHEMA_KEYS)[number], DiagnosticsJsonValue>;
}

const ENVELOPE_KEYS = ['schemaId', 'schemaVersion', 'schemas'] as const;
const VERSIONED_SCHEMA_KEYS = ['schemaId', 'schemaVersion', 'payload'] as const;
const EXPECTED_SCHEMA_IDS = Object.freeze({
  surfaceState: 'mazer.menu.surface-state.v1',
  layoutBounds: 'mazer.menu.layout-bounds.v1',
  renderDpr: 'mazer.menu.render-dpr.v1',
  input: 'mazer.menu.input.v1',
  worldSemantic: 'mazer.menu.world-semantic.v1',
  captureMetadata: 'mazer.menu.capture-metadata.v1'
} satisfies Record<(typeof MENU_RUNTIME_DIAGNOSTICS_SCHEMA_KEYS)[number], string>);
const EXPECTED_PAYLOAD_KEYS = Object.freeze({
  surfaceState: ['revision', 'sceneInstanceId', 'updatedAt', 'runtimeMs', 'surface', 'auth', 'gameToggles'],
  layoutBounds: ['board', 'player', 'goal'],
  renderDpr: ['visibility', 'performance', 'resources', 'markerStyle'],
  input: ['input', 'inputBuffer', 'worldTurn'],
  worldSemantic: ['lifecycle', 'patrol', 'pressure', 'timer', 'playtest', 'menuDemo', 'generation', 'projection', 'progression'],
  captureMetadata: ['feed', 'telemetry', 'cycleTelemetry']
} satisfies Record<(typeof MENU_RUNTIME_DIAGNOSTICS_SCHEMA_KEYS)[number], readonly string[]>);

const hasExpectedVersionedSchemas = (schemas: unknown): boolean => {
  const schemaDescriptors = getExactDiagnosticsRecordDescriptors(
    schemas,
    MENU_RUNTIME_DIAGNOSTICS_SCHEMA_KEYS
  );
  if (!schemaDescriptors) return false;
  return MENU_RUNTIME_DIAGNOSTICS_SCHEMA_KEYS.every((name) => {
    const versioned = getExactDiagnosticsRecordDescriptors(
      schemaDescriptors[name]?.value,
      VERSIONED_SCHEMA_KEYS
    );
    return versioned !== null
      && versioned.schemaId?.value === EXPECTED_SCHEMA_IDS[name]
      && versioned.schemaVersion?.value === 1
      && getExactDiagnosticsRecordDescriptors(versioned.payload?.value, EXPECTED_PAYLOAD_KEYS[name]) !== null;
  });
};

export const createMenuRuntimeDiagnosticsCompatibilityEnvelope = (
  schemas: MenuRuntimeDiagnosticsCompatibilityEnvelope['schemas']
): MenuRuntimeDiagnosticsCompatibilityEnvelope | null => {
  const cloned = cloneDiagnosticsValue(schemas);
  if (!cloned.ok || !hasExpectedVersionedSchemas(cloned.value)) {
    return null;
  }
  return {
    schemaId: MENU_RUNTIME_DIAGNOSTICS_COMPATIBILITY_SCHEMA_ID,
    schemaVersion: MENU_RUNTIME_DIAGNOSTICS_COMPATIBILITY_SCHEMA_VERSION,
    schemas: cloned.value as MenuRuntimeDiagnosticsCompatibilityEnvelope['schemas']
  };
};

export const parseMenuRuntimeDiagnosticsCompatibilityEnvelope = (
  value: unknown
): MenuRuntimeDiagnosticsCompatibilityEnvelope | null => {
  const descriptors = getExactDiagnosticsRecordDescriptors(value, ENVELOPE_KEYS);
  if (!descriptors) return null;
  if (
    descriptors.schemaId?.value !== MENU_RUNTIME_DIAGNOSTICS_COMPATIBILITY_SCHEMA_ID
    || descriptors.schemaVersion?.value !== MENU_RUNTIME_DIAGNOSTICS_COMPATIBILITY_SCHEMA_VERSION
  ) {
    return null;
  }
  const schemas = descriptors.schemas?.value;
  if (!hasExpectedVersionedSchemas(schemas)) {
    return null;
  }
  const cloned = cloneDiagnosticsValue(value as unknown as DiagnosticsJsonValue);
  return cloned.ok ? cloned.value as unknown as MenuRuntimeDiagnosticsCompatibilityEnvelope : null;
};
