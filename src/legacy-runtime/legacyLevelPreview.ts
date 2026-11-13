/**
 * Level Preview: a dev/QA hidden route (`?previewLevel=N`), not a player feature.
 *
 * It starts straight into play at level N with the SAME generation path real
 * play uses for that level (the player track's `level` / `targetComplexity`
 * feed the same resolvers), but nothing it does can reach the real account:
 *
 *  - progression, telemetry and settings go to an in-memory sandbox storage
 *    (`createLegacyLevelPreviewStorage`), never `window.localStorage`;
 *  - the session is the existing runtime-diagnostics auth FIXTURE identity,
 *    which every remote layer already treats as ineligible (no Supabase
 *    client, no RPC, no outbox), so complete-level / initialize / reset /
 *    settings / leaderboard writes cannot fire;
 *  - the account bootstrap, install gate and auth client are skipped at boot.
 *
 * Rank is NOT an input: it is derived from the level's target complexity
 * (`resolveLegacyProgressionRank`), so the route takes the level only.
 *
 * Pure: no Phaser, no DOM globals, no network. See
 * docs/ui/MAZER-LEVEL-PREVIEW-2026-11-09.md.
 */
import {
  LEGACY_RUNTIME_DIAGNOSTICS_AUTH_FIXTURE_USER_ID,
  type LegacyAuthSessionSnapshot
} from './legacyAuth';
import {
  LEGACY_PROGRESSION_MAX_COMPLEXITY,
  LEGACY_PROGRESSION_MIN_COMPLEXITY,
  createEmptyLegacyProgressionState,
  normalizeLegacyProgressionState,
  type LegacyProgressionState
} from './legacyProgression';

export const LEGACY_LEVEL_PREVIEW_PARAM = 'previewLevel';
export const LEGACY_LEVEL_PREVIEW_MIN_LEVEL = 1;
/** Above this a typed/clamped level is meaningless (geometry saturates far lower); keeps ordinals small. */
export const LEGACY_LEVEL_PREVIEW_MAX_LEVEL = 999;
/**
 * The jump list in the pause sheet. 198 and 218 are earlier ladder ends (MAZER-GEN-006, kept as checkpoints);
 * 283 is where the felt number saturates (GEOMETRY_BUDGET_FELT_SATURATION_LEVEL) and 288 is the last budget level, the
 * end of the fringe (LAST_BUDGET_LEVEL; MAZER-GEN-007, MAZER-QA-008); 300 is on the plateau just past it. The test pins
 * 283 and 288 to those constants, so a future ladder change that moves them fails there instead of drifting silently.
 */
export const LEGACY_LEVEL_PREVIEW_CHECKPOINTS: readonly number[] = Object.freeze([
  1, 2, 5, 10, 20, 30, 60, 100, 150, 190, 198, 218, 283, 288, 300
]);

const POSITIVE_INTEGER_PATTERN = /^\d{1,9}$/;

const toSearchParams = (search?: string | URLSearchParams | null): URLSearchParams => {
  if (search instanceof URLSearchParams) {
    return search;
  }
  if (typeof search !== 'string' || search.length === 0) {
    return new URLSearchParams();
  }
  return new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
};

export const clampLegacyLevelPreviewLevel = (level: number): number => (
  Math.min(
    LEGACY_LEVEL_PREVIEW_MAX_LEVEL,
    Math.max(LEGACY_LEVEL_PREVIEW_MIN_LEVEL, Math.trunc(level))
  )
);

/**
 * The preview level for a query string, or null when preview is NOT requested.
 * Only a plain run of digits is accepted (no sign, decimal, hex, exponent or
 * whitespace-only value); `0` is not a level; a level above the maximum clamps
 * to it. Anything else ignores preview entirely, so a malformed URL behaves
 * exactly like an ordinary one.
 */
export const resolveLegacyLevelPreviewLevel = (
  search?: string | URLSearchParams | null
): number | null => {
  const raw = toSearchParams(search).get(LEGACY_LEVEL_PREVIEW_PARAM);
  if (raw === null) {
    return null;
  }
  const trimmed = raw.trim();
  if (!POSITIVE_INTEGER_PATTERN.test(trimmed)) {
    return null;
  }
  const parsed = Number(trimmed);
  if (!Number.isSafeInteger(parsed) || parsed < LEGACY_LEVEL_PREVIEW_MIN_LEVEL) {
    return null;
  }
  return clampLegacyLevelPreviewLevel(parsed);
};

export const isLegacyLevelPreviewRoute = (search?: string | URLSearchParams | null): boolean => (
  resolveLegacyLevelPreviewLevel(search) !== null
);

/** previous / next, clamped to the valid range. */
export const stepLegacyLevelPreviewLevel = (level: number, delta: number): number => (
  clampLegacyLevelPreviewLevel(level + delta)
);

export const formatLegacyLevelPreviewBadge = (level: number | string): string => `PREVIEW L${level}`;

/**
 * The progression state a player standing at `level` would have: completion
 * ordinal `level - 1`, bounded target complexity `8 + 4 * (level - 1)` (the
 * game's flat +4 per clear, saturating at 400 / level 99, above which the
 * ordinal alone drives geometry). Built through the real normalizer so it is
 * exactly as coherent as a state the game itself could have produced.
 */
export const createLegacyLevelPreviewProgressionState = (level: number): LegacyProgressionState => {
  const bounded = clampLegacyLevelPreviewLevel(level);
  const empty = createEmptyLegacyProgressionState();
  const targetComplexity = Math.min(
    LEGACY_PROGRESSION_MAX_COMPLEXITY,
    LEGACY_PROGRESSION_MIN_COMPLEXITY + ((bounded - 1) * 4)
  );
  return normalizeLegacyProgressionState({
    ...empty,
    tracks: {
      ...empty.tracks,
      player: {
        ...empty.tracks.player,
        completedCycles: String(bounded - 1),
        level: String(bounded),
        peakComplexity: targetComplexity,
        targetComplexity
      }
    }
  });
};

/**
 * In-memory Storage stand-in. Every read and write stays inside this closure;
 * it is handed to the scene in place of `window.localStorage` for the whole
 * preview session, so nothing the scene persists can reach the real keys.
 */
export interface LegacyLevelPreviewStorage extends Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> {
  clear(): void;
  key(index: number): string | null;
  readonly length: number;
}

export const createLegacyLevelPreviewStorage = (): LegacyLevelPreviewStorage => {
  const entries = new Map<string, string>();
  return {
    clear: () => entries.clear(),
    getItem: (key) => (entries.has(key) ? entries.get(key)! : null),
    key: (index) => Array.from(entries.keys())[index] ?? null,
    get length() {
      return entries.size;
    },
    removeItem: (key) => {
      entries.delete(key);
    },
    setItem: (key, value) => {
      entries.set(key, String(value));
    }
  };
};

/**
 * The session the preview runs as: the runtime-diagnostics auth fixture
 * identity, which the remote layer, leaderboard and sync code already treat as
 * "never talk to Supabase". It lets play start without a real sign-in.
 */
export const createLegacyLevelPreviewAuthSnapshot = (): LegacyAuthSessionSnapshot => ({
  canonicalUsername: 'level-preview',
  configured: true,
  displayName: 'Level Preview',
  email: 'level-preview@mazer.local',
  error: null,
  info: null,
  status: 'authenticated',
  userId: LEGACY_RUNTIME_DIAGNOSTICS_AUTH_FIXTURE_USER_ID
});

/** The same URL with the preview param removed (other params and the hash are kept). */
export const buildLegacyLevelPreviewExitUrl = (href: string): string => {
  const url = new URL(href);
  url.searchParams.delete(LEGACY_LEVEL_PREVIEW_PARAM);
  return url.toString();
};
