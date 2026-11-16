import { describe, expect, test } from 'vitest';
import {
  HAZARD_LAB_STORAGE_KEY,
  HAZARD_LAYER_BUILD_DEFAULT,
  readHazardLabLevelJumpRaw,
  resolveHazardLayerEnabled,
  resolveHazardLayerState
} from '../../src/legacy-runtime/legacyHazardLayerFlag';
import {
  buildLegacyLevelPreviewExitUrl,
  isLegacyLevelPreviewRoute,
  resolveLegacyLevelPreviewLevel
} from '../../src/legacy-runtime/legacyLevelPreview';

const memoryStorage = (initial: Record<string, string> = {}) => {
  const map = new Map(Object.entries(initial));
  return {
    map,
    getItem: (key: string) => (map.has(key) ? map.get(key)! : null),
    setItem: (key: string, value: string) => { map.set(key, String(value)); },
    removeItem: (key: string) => { map.delete(key); }
  };
};

const throwingStorage = {
  getItem: () => { throw new Error('blocked'); },
  setItem: () => { throw new Error('blocked'); },
  removeItem: () => { throw new Error('blocked'); }
};

describe('resolveHazardLayerEnabled (roadmap slice H1)', () => {
  test('the build default is a literal false and the bare call is false outside a browser', () => {
    expect(HAZARD_LAYER_BUILD_DEFAULT).toBe(false);
    expect(resolveHazardLayerEnabled()).toBe(false);
    expect(resolveHazardLayerEnabled({})).toBe(false);
  });

  test('?lab=hazards turns it on, is remembered, and shows the LAB chip', () => {
    const storage = memoryStorage();
    const state = resolveHazardLayerState({ search: '?lab=hazards', storage });
    expect(state).toMatchObject({ enabled: true, source: 'lab', labChip: true });
    expect(storage.map.get(HAZARD_LAB_STORAGE_KEY)).toBe('1');
    // Next load, no query: still on from storage.
    expect(resolveHazardLayerState({ search: '', storage })).toMatchObject({ enabled: true, source: 'lab', labChip: true });
    expect(resolveHazardLayerEnabled({ search: '?runtimeDiagnostics=1', storage })).toBe(true);
  });

  test('?lab=off clears the remembered switch', () => {
    const storage = memoryStorage({ [HAZARD_LAB_STORAGE_KEY]: '1' });
    expect(resolveHazardLayerState({ search: '?lab=off', storage })).toMatchObject({ enabled: false, source: 'off', labChip: false });
    expect(storage.map.has(HAZARD_LAB_STORAGE_KEY)).toBe(false);
    expect(resolveHazardLayerEnabled({ search: '', storage })).toBe(false);
  });

  test('any other lab value or stored value leaves it off', () => {
    const storage = memoryStorage({ [HAZARD_LAB_STORAGE_KEY]: 'yes' });
    expect(resolveHazardLayerEnabled({ search: '?lab=enemies', storage })).toBe(false);
    expect(resolveHazardLayerEnabled({ search: '?lab=Hazards', storage })).toBe(false);
  });

  test('a build default of true wins and shows no LAB chip', () => {
    expect(resolveHazardLayerState({ buildDefault: true })).toMatchObject({ enabled: true, source: 'build', labChip: false });
  });

  test('blocked or throwing storage never throws: the query still works for this load, nothing is remembered', () => {
    expect(() => resolveHazardLayerState({ search: '', storage: throwingStorage })).not.toThrow();
    expect(resolveHazardLayerEnabled({ search: '', storage: throwingStorage })).toBe(false);
    expect(resolveHazardLayerState({ search: '?lab=hazards', storage: throwingStorage })).toMatchObject({ enabled: true, source: 'lab' });
    expect(resolveHazardLayerState({ search: '?lab=off', storage: throwingStorage }).enabled).toBe(false);
    expect(resolveHazardLayerEnabled({ search: '?lab=hazards', storage: null })).toBe(true);
  });
});

describe('the lab level jump (&level=N) is a no-submit level preview', () => {
  test('level is honoured only next to lab=hazards in the same URL', () => {
    expect(readHazardLabLevelJumpRaw('?lab=hazards&level=40')).toBe('40');
    expect(readHazardLabLevelJumpRaw('?level=40')).toBeNull();
    expect(readHazardLabLevelJumpRaw('?lab=off&level=40')).toBeNull();
    expect(readHazardLabLevelJumpRaw('?lab=hazards')).toBeNull();
  });

  test('it resolves through the Level Preview route (in-memory storage, fixture identity, no remote writes)', () => {
    expect(resolveLegacyLevelPreviewLevel('?lab=hazards&level=40')).toBe(40);
    expect(isLegacyLevelPreviewRoute('?lab=hazards&level=40')).toBe(true);
    expect(resolveLegacyLevelPreviewLevel('?lab=hazards&level=99999')).toBe(999);
    // Same strict digit validation as previewLevel.
    for (const bad of ['0', '-3', '2.5', '0x10', '1e3', ' ', 'abc', '']) {
      expect(isLegacyLevelPreviewRoute(`?lab=hazards&level=${encodeURIComponent(bad)}`)).toBe(false);
    }
  });

  test('level alone, or with the lab switch off, is an ordinary route that submits progress as usual', () => {
    expect(isLegacyLevelPreviewRoute('?level=40')).toBe(false);
    expect(isLegacyLevelPreviewRoute('?lab=off&level=40')).toBe(false);
    expect(isLegacyLevelPreviewRoute('?lab=hazards')).toBe(false);
  });

  test('previewLevel still wins and the existing route is unchanged', () => {
    expect(resolveLegacyLevelPreviewLevel('?previewLevel=7&lab=hazards&level=40')).toBe(7);
    expect(resolveLegacyLevelPreviewLevel('?previewLevel=7')).toBe(7);
    expect(resolveLegacyLevelPreviewLevel('')).toBeNull();
  });

  test('exit from a lab jump drops level and keeps the lab switch', () => {
    const exit = new URL(buildLegacyLevelPreviewExitUrl('https://mazer.fawxzzy.com/?lab=hazards&level=40&x=1'));
    expect(exit.searchParams.get('level')).toBeNull();
    expect(exit.searchParams.get('lab')).toBe('hazards');
    expect(exit.searchParams.get('x')).toBe('1');
    const plain = new URL(buildLegacyLevelPreviewExitUrl('https://mazer.fawxzzy.com/?level=3&previewLevel=9'));
    expect(plain.searchParams.get('level')).toBe('3');
    expect(plain.searchParams.get('previewLevel')).toBeNull();
  });
});
