import { resolveLegacyAuthScopedStorageKey, type LegacyAuthSessionSnapshot } from './legacyAuth';
import { LEGACY_BOARD_SIZE_RULE_LATEST, type LegacyBoardSizeRule } from './legacyBoardScale';

// MAZER-FLOW-016: the maze seed of the current play attempt, so quitting or reloading mid-level resumes
// the same maze instead of re-rolling it. Saved when a play maze is built, restored by the next Start only
// while level, completed cycles and board shape still match, cleared on completion and on reset progress.

export const LEGACY_ATTEMPT_SEED_STORAGE_KEY = 'mazer.attempt-seed.v1';

export interface LegacyAttemptSeedStorage {
  getItem(key: string): string | null;
  removeItem(key: string): void;
  setItem(key: string, value: string): void;
}

export interface LegacyAttemptSeedContext {
  readonly aspectRatio: number;
  readonly completedCycles: number | string;
  readonly level: number | string;
  // MAZER-UI-098: the board size rule the attempt is built under (default: the latest rule).
  readonly sizeRule?: LegacyBoardSizeRule;
}

interface SavedAttempt {
  readonly aspect: number;
  readonly completedCycles: number | string;
  readonly level: number | string;
  readonly seed: number;
  // MAZER-UI-098: absent on attempts saved before size rules existed, which were built under rule 1. The
  // same seed under another rule is another maze (another board size), so an attempt is restored only
  // under the rule it was saved with; otherwise the next Start rolls a new maze.
  readonly sizeRule?: LegacyBoardSizeRule;
}

const resolveSavedSizeRule = (value: unknown): LegacyBoardSizeRule => (value === 2 ? 2 : 1);

const roundAspect = (aspectRatio: number): number => Math.round(aspectRatio * 1000) / 1000;

export const writeLegacyAttemptSeed = (
  storage: LegacyAttemptSeedStorage | undefined,
  storageKey: string,
  context: LegacyAttemptSeedContext,
  seed: number
): void => {
  if (!storage || !Number.isFinite(seed) || seed <= 0 || !Number.isFinite(context.aspectRatio)) {
    return;
  }
  const saved: SavedAttempt = {
    aspect: roundAspect(context.aspectRatio),
    completedCycles: context.completedCycles,
    level: context.level,
    seed: Math.trunc(seed),
    sizeRule: context.sizeRule ?? LEGACY_BOARD_SIZE_RULE_LATEST
  };
  try {
    storage.setItem(storageKey, JSON.stringify(saved));
  } catch {
    // Storage unavailable: the attempt simply is not remembered.
  }
};

export const readLegacyAttemptSeed = (
  storage: LegacyAttemptSeedStorage | undefined,
  storageKey: string,
  context: LegacyAttemptSeedContext
): number | null => {
  if (!storage) {
    return null;
  }
  try {
    const raw = storage.getItem(storageKey);
    if (raw === null) {
      return null;
    }
    const saved = JSON.parse(raw) as Partial<SavedAttempt> | null;
    if (
      saved !== null
      && typeof saved === 'object'
      && typeof saved.seed === 'number'
      && Number.isFinite(saved.seed)
      && saved.seed > 0
      && String(saved.level) === String(context.level)
      && String(saved.completedCycles) === String(context.completedCycles)
      && saved.aspect === roundAspect(context.aspectRatio)
      && resolveSavedSizeRule(saved.sizeRule) === (context.sizeRule ?? LEGACY_BOARD_SIZE_RULE_LATEST)
    ) {
      return saved.seed;
    }
  } catch {
    // Corrupt or unavailable: treat as no saved attempt.
  }
  return null;
};

export const clearLegacyAttemptSeed = (
  storage: LegacyAttemptSeedStorage | undefined,
  storageKey: string
): void => {
  try {
    storage?.removeItem(storageKey);
  } catch {
    // Nothing to clear.
  }
};

// Account-scoped wrappers so the scene stays a one-line call per site.
type AttemptSnapshot = Pick<LegacyAuthSessionSnapshot, 'userId'>;

const resolveScopedKey = (snapshot: AttemptSnapshot): string =>
  resolveLegacyAuthScopedStorageKey(LEGACY_ATTEMPT_SEED_STORAGE_KEY, snapshot);

export const readScopedLegacyAttemptSeed = (
  storage: LegacyAttemptSeedStorage | undefined,
  snapshot: AttemptSnapshot,
  context: LegacyAttemptSeedContext
): number | null => readLegacyAttemptSeed(storage, resolveScopedKey(snapshot), context);

export const writeScopedLegacyAttemptSeed = (
  storage: LegacyAttemptSeedStorage | undefined,
  snapshot: AttemptSnapshot,
  context: LegacyAttemptSeedContext,
  seed: number
): void => writeLegacyAttemptSeed(storage, resolveScopedKey(snapshot), context, seed);

export const clearScopedLegacyAttemptSeed = (
  storage: LegacyAttemptSeedStorage | undefined,
  snapshot: AttemptSnapshot
): void => clearLegacyAttemptSeed(storage, resolveScopedKey(snapshot));

export const createLegacyAttemptSeedContext = (
  aspectRatio: number,
  track: { readonly completedCycles: number | string; readonly level: number | string }
): LegacyAttemptSeedContext => ({ aspectRatio, completedCycles: track.completedCycles, level: track.level });
