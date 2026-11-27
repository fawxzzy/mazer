// First-time cards flag (first-time cards spec, slice 1, P5). Same shape as the hazard layer flag
// module (kept out of its name here: tests/reset/legacy-hazard-handoff.test.ts pins who may reference it).
//
// The system is on when EITHER the build constant says so (default false; flipping it is a later,
// separate step after a phone check) OR the lab switch is on. The lab switch is `?lab=firsttime`,
// remembered in localStorage (`mazer.lab.firsttime.v1`) so the installed app keeps it; `?lab=off`
// clears it (the same word that clears the hazard lab). Both labs can ride one URL as repeated
// params: `?lab=hazards&lab=firsttime` (keep `hazards` first: the hazard flag reads the first `lab`).
//
// Level Preview (`?previewLevel=N`, or the hazard lab jump) writes nothing to the device: on a
// preview route the query is honoured for this load but the switch is never remembered or cleared.
//
// With the flag off the first-time system holds nothing, reads no other storage and draws nothing
// (legacyFirstTimeSession.ts returns an inert session). The only key this module ever reads is its
// own lab key.
//
// Pure: no Phaser, no DOM globals. Every storage access is inside try/catch: a failure just means
// "not remembered", never a throw at boot.

import { isLegacyLevelPreviewRoute } from './legacyLevelPreview';

/** The build default. A literal `false` type: flipping it is a deliberate source change. */
export const FIRST_TIME_CARDS_BUILD_DEFAULT = false as const;

export const FIRST_TIME_LAB_QUERY_PARAM = 'lab';
export const FIRST_TIME_LAB_QUERY_ON = 'firsttime';
export const FIRST_TIME_LAB_QUERY_OFF = 'off';
export const FIRST_TIME_LAB_STORAGE_KEY = 'mazer.lab.firsttime.v1';
export const FIRST_TIME_LAB_STORAGE_ON_VALUE = '1';

export type FirstTimeCardsSource = 'build' | 'lab' | 'off';

export type FirstTimeFlagStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export interface FirstTimeCardsResolveOptions {
  /** `window.location.search` (with or without the leading `?`) or parsed params. */
  readonly search?: string | URLSearchParams | null;
  /** The REAL storage (never the Level Preview sandbox). Omit when unavailable. */
  readonly storage?: FirstTimeFlagStorage | null;
  /** Test seam for the build constant. */
  readonly buildDefault?: boolean;
}

export interface FirstTimeCardsState {
  readonly enabled: boolean;
  readonly source: FirstTimeCardsSource;
  /** True on a Level Preview route: nothing may be written to the device this load. */
  readonly preview: boolean;
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

const readStoredLab = (storage: FirstTimeCardsResolveOptions['storage']): boolean => {
  if (!storage) {
    return false;
  }
  try {
    return storage.getItem(FIRST_TIME_LAB_STORAGE_KEY) === FIRST_TIME_LAB_STORAGE_ON_VALUE;
  } catch {
    return false;
  }
};

const writeStoredLab = (storage: FirstTimeCardsResolveOptions['storage'], on: boolean): void => {
  if (!storage) {
    return;
  }
  try {
    if (on) {
      storage.setItem(FIRST_TIME_LAB_STORAGE_KEY, FIRST_TIME_LAB_STORAGE_ON_VALUE);
    } else {
      storage.removeItem(FIRST_TIME_LAB_STORAGE_KEY);
    }
  } catch {
    // Not remembered; this load still honours the query.
  }
};

/** Full resolution. Remembers the lab switch when the URL asks, except on a Level Preview route. */
export const resolveFirstTimeCardsState = (options: FirstTimeCardsResolveOptions = {}): FirstTimeCardsState => {
  const buildDefault = options.buildDefault ?? FIRST_TIME_CARDS_BUILD_DEFAULT;
  const params = toSearchParams(options.search);
  const preview = isLegacyLevelPreviewRoute(params);
  const labValues = params.getAll(FIRST_TIME_LAB_QUERY_PARAM);
  let labOn: boolean;
  if (labValues.includes(FIRST_TIME_LAB_QUERY_ON)) {
    if (!preview) writeStoredLab(options.storage, true);
    labOn = true;
  } else if (labValues.includes(FIRST_TIME_LAB_QUERY_OFF)) {
    if (!preview) writeStoredLab(options.storage, false);
    labOn = false;
  } else {
    labOn = readStoredLab(options.storage);
  }
  const source: FirstTimeCardsSource = buildDefault ? 'build' : (labOn ? 'lab' : 'off');
  return { enabled: source !== 'off', source, preview };
};

/**
 * Is the first-time card system on? With no options it reads the real `window.location.search`
 * and `window.localStorage` when they exist (guarded), and is `false` in node and in every build
 * where the lab switch was never set.
 */
export const resolveFirstTimeCardsEnabled = (options?: FirstTimeCardsResolveOptions): boolean => {
  if (options !== undefined) {
    return resolveFirstTimeCardsState(options).enabled;
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
  return resolveFirstTimeCardsState({ search, storage }).enabled;
};
