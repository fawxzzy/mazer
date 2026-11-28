// Help screen flag (MAZER-ONB-001 family, Help client UI). Same shape as legacyFirstTimeFlag.ts.
//
// The Help row is on when EITHER the build constant says so (default false; the coordinator flips it after review)
// OR the lab switch is on. The lab switch is `?lab=help`, remembered in localStorage (`mazer.lab.help.v1`) so the
// installed app keeps it; `?lab=off` clears it (the same word that clears the other labs). Labs can ride one URL as
// repeated params: `?lab=firsttime&lab=help`.
//
// Level Preview (`?previewLevel=N`) writes nothing to the device: on a preview route the query is honoured for this
// load but the switch is never remembered or cleared.
//
// With the flag off nothing changes: no Help row in either Menu, the Guide keeps today's Menu line and its foot keeps
// "All tips". The only key this module ever reads is its own lab key.
//
// Pure: no Phaser, no DOM globals. Every storage access is inside try/catch: a failure just means "not remembered",
// never a throw at boot.

import { isLegacyLevelPreviewRoute } from './legacyLevelPreview';

/** The build default. A literal `false` type: flipping it is a deliberate source change. */
export const HELP_SCREEN_BUILD_DEFAULT = false as const;

export const HELP_LAB_QUERY_PARAM = 'lab';
export const HELP_LAB_QUERY_ON = 'help';
export const HELP_LAB_QUERY_OFF = 'off';
export const HELP_LAB_STORAGE_KEY = 'mazer.lab.help.v1';
export const HELP_LAB_STORAGE_ON_VALUE = '1';

export type HelpScreenSource = 'build' | 'lab' | 'off';

export type HelpFlagStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export interface HelpScreenResolveOptions {
  /** `window.location.search` (with or without the leading `?`) or parsed params. */
  readonly search?: string | URLSearchParams | null;
  /** The REAL storage (never the Level Preview sandbox). Omit when unavailable. */
  readonly storage?: HelpFlagStorage | null;
  /** Test seam for the build constant. */
  readonly buildDefault?: boolean;
}

export interface HelpScreenState {
  readonly enabled: boolean;
  readonly source: HelpScreenSource;
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

const readStoredLab = (storage: HelpScreenResolveOptions['storage']): boolean => {
  if (!storage) {
    return false;
  }
  try {
    return storage.getItem(HELP_LAB_STORAGE_KEY) === HELP_LAB_STORAGE_ON_VALUE;
  } catch {
    return false;
  }
};

const writeStoredLab = (storage: HelpScreenResolveOptions['storage'], on: boolean): void => {
  if (!storage) {
    return;
  }
  try {
    if (on) {
      storage.setItem(HELP_LAB_STORAGE_KEY, HELP_LAB_STORAGE_ON_VALUE);
    } else {
      storage.removeItem(HELP_LAB_STORAGE_KEY);
    }
  } catch {
    // Not remembered; this load still honours the query.
  }
};

/** Full resolution. Remembers the lab switch when the URL asks, except on a Level Preview route. */
export const resolveHelpScreenState = (options: HelpScreenResolveOptions = {}): HelpScreenState => {
  const buildDefault = options.buildDefault ?? HELP_SCREEN_BUILD_DEFAULT;
  const params = toSearchParams(options.search);
  const preview = isLegacyLevelPreviewRoute(params);
  const labValues = params.getAll(HELP_LAB_QUERY_PARAM);
  let labOn: boolean;
  if (labValues.includes(HELP_LAB_QUERY_ON)) {
    if (!preview) writeStoredLab(options.storage, true);
    labOn = true;
  } else if (labValues.includes(HELP_LAB_QUERY_OFF)) {
    if (!preview) writeStoredLab(options.storage, false);
    labOn = false;
  } else {
    labOn = readStoredLab(options.storage);
  }
  const source: HelpScreenSource = buildDefault ? 'build' : (labOn ? 'lab' : 'off');
  return { enabled: source !== 'off', source, preview };
};

/**
 * Is the Help screen on? With no options it reads the real `window.location.search` and `window.localStorage` when
 * they exist (guarded), and is `false` in node and in every build where the lab switch was never set.
 */
export const resolveHelpScreenEnabled = (options?: HelpScreenResolveOptions): boolean => {
  if (options !== undefined) {
    return resolveHelpScreenState(options).enabled;
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
  return resolveHelpScreenState({ search, storage }).enabled;
};
