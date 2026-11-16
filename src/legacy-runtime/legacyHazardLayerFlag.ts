// Hazard layer flag (roadmap slice H1). Replaces the retired dormant literal switch (a constant `false`).
//
// The layer is on when EITHER the build constant says so (default false; slice H9 flips it after
// the owner's phone sign-off) OR the lab switch is on. The lab switch is `?lab=hazards`, remembered
// in localStorage so the installed app keeps it; `?lab=off` clears it. It works on preview and
// production, and only ever turns the layer ON for the person who set it.
//
// In H1 the layer being on does exactly two things: a "LAB" chip and a running world clock over an
// EMPTY hazard schedule (legacyWorldClock.ts). No hazard exists, nothing is drawn, generation is
// untouched: no geometry module reads this file (pinned by tests/reset/legacy-hazard-handoff.test.ts
// and the golden hash corpus run with the flag on).
//
// The lab level jump `?lab=hazards&level=N` is a level preview: it is routed through the existing
// Level Preview sandbox (legacyLevelPreview.ts), whose storage is in memory and whose identity is the
// diagnostics fixture, so it can never submit progress, a receipt or a leaderboard row. `level`
// alone does nothing, and neither does `level` with the lab switch off.
//
// Pure: no Phaser, no DOM globals. Every storage access is inside try/catch (private mode, blocked
// storage, quota, a hostile stub): a failure just means "not remembered", never a throw at boot.

/** The build default. A literal `false` type: flipping it is a deliberate source change (slice H9). */
export const HAZARD_LAYER_BUILD_DEFAULT = false as const;

export const HAZARD_LAB_QUERY_PARAM = 'lab';
export const HAZARD_LAB_QUERY_ON = 'hazards';
export const HAZARD_LAB_QUERY_OFF = 'off';
export const HAZARD_LAB_LEVEL_PARAM = 'level';
export const HAZARD_LAB_STORAGE_KEY = 'mazer.lab.hazards.v1';
export const HAZARD_LAB_STORAGE_ON_VALUE = '1';
export const HAZARD_LAB_CHIP_TEXT = 'LAB';

export type HazardLayerSource = 'build' | 'lab' | 'off';

export interface HazardLayerResolveOptions {
  /** `window.location.search` (with or without the leading `?`) or parsed params. */
  readonly search?: string | URLSearchParams | null;
  /** The REAL storage (never the Level Preview sandbox). Omit when unavailable. */
  readonly storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null;
  /** Test seam for the build constant. */
  readonly buildDefault?: boolean;
}

export interface HazardLayerState {
  readonly enabled: boolean;
  readonly source: HazardLayerSource;
  /** True only while the layer is on because of the lab switch (the "LAB" chip). */
  readonly labChip: boolean;
  /** `?lab=hazards&level=N` as a raw digit string, or null. Validation lives in legacyLevelPreview. */
  readonly labLevelJumpRaw: string | null;
}

const toSearchParams = (search?: string | URLSearchParams | null): URLSearchParams => {
  if (search instanceof URLSearchParams) {
    return search;
  }
  if (typeof search !== 'string' || search.length === 0) {
    return new URLSearchParams();
  }
  try {
    return new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  } catch {
    return new URLSearchParams();
  }
};

/**
 * The raw `level` value when, and only when, the same URL carries `lab=hazards`. Returns null for
 * `level` alone or with any other lab value. The caller validates the digits and clamps.
 */
export const readHazardLabLevelJumpRaw = (search?: string | URLSearchParams | null): string | null => {
  const params = toSearchParams(search);
  return params.get(HAZARD_LAB_QUERY_PARAM) === HAZARD_LAB_QUERY_ON
    ? params.get(HAZARD_LAB_LEVEL_PARAM)
    : null;
};

const readStoredLab = (storage: HazardLayerResolveOptions['storage']): boolean => {
  if (!storage) {
    return false;
  }
  try {
    return storage.getItem(HAZARD_LAB_STORAGE_KEY) === HAZARD_LAB_STORAGE_ON_VALUE;
  } catch {
    return false;
  }
};

const writeStoredLab = (storage: HazardLayerResolveOptions['storage'], on: boolean): void => {
  if (!storage) {
    return;
  }
  try {
    if (on) {
      storage.setItem(HAZARD_LAB_STORAGE_KEY, HAZARD_LAB_STORAGE_ON_VALUE);
    } else {
      storage.removeItem(HAZARD_LAB_STORAGE_KEY);
    }
  } catch {
    // Not remembered; this load still honours the query.
  }
};

/** Full resolution. Writes the lab switch to storage when the URL asks (guarded). */
export const resolveHazardLayerState = (options: HazardLayerResolveOptions = {}): HazardLayerState => {
  const buildDefault = options.buildDefault ?? HAZARD_LAYER_BUILD_DEFAULT;
  const params = toSearchParams(options.search);
  const labParam = params.get(HAZARD_LAB_QUERY_PARAM);
  let labOn: boolean;
  if (labParam === HAZARD_LAB_QUERY_ON) {
    writeStoredLab(options.storage, true);
    labOn = true;
  } else if (labParam === HAZARD_LAB_QUERY_OFF) {
    writeStoredLab(options.storage, false);
    labOn = false;
  } else {
    labOn = readStoredLab(options.storage);
  }
  const source: HazardLayerSource = buildDefault ? 'build' : (labOn ? 'lab' : 'off');
  return {
    enabled: source !== 'off',
    source,
    labChip: source === 'lab',
    labLevelJumpRaw: readHazardLabLevelJumpRaw(params)
  };
};

/**
 * Is the hazard layer on? With no options it reads the real `window.location.search` and
 * `window.localStorage` when they exist (guarded), and is `false` in node and in every build where
 * the lab switch was never set.
 */
export const resolveHazardLayerEnabled = (options?: HazardLayerResolveOptions): boolean => {
  if (options !== undefined) {
    return resolveHazardLayerState(options).enabled;
  }
  let search: string | null = null;
  let storage: Storage | null = null;
  try {
    if (typeof window !== 'undefined') {
      search = window.location.search;
      storage = window.localStorage;
    }
  } catch {
    // Storage or location blocked: treat as no lab switch.
  }
  return resolveHazardLayerState({ search, storage }).enabled;
};
