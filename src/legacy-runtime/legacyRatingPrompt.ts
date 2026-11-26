/**
 * Rating prompt (Zac, 2026-11-25): Feedback is a RATING, not a bug report, and it has no Menu row any more. The 1-5
 * star popup (src/ui/feedback, MAZER-FB-001) opens on its own when a signed-in player ENTERS THE MAIN MENU after
 * reaching level 50. Pure: no Phaser, no DOM; storage is handed in.
 *
 * Rules this module pins:
 *  - First offer at highest level reached >= 50 (49 never, 50 and 51 yes).
 *  - "Not now" (or any close without a saved rating) waits for 50 MORE levels of gameplay: after a close at highest
 *    level L the next offer is at highest level >= L + 50 (closed at 50 -> 100, closed at 73 -> 123: 122 no, 123
 *    yes). Owner: "only retrigger it every 50 levels of gameplay and only if the player has not submitted". A level
 *    jump past the threshold offers once.
 *  - A saved rating ends it for that account: never offered again. An offline, failed, rate-limited or signed-out
 *    submit is NOT a saved rating.
 *  - Per account (the storage key carries the user id), kept across reloads (localStorage on this device). A
 *    signed-out player never sees it.
 *  - Only on main-menu ENTRY (boot onto the menu, or back from a game), never during play, never in the level preview
 *    sandbox, and only once the menu is idle (no overlay, no open dropdown) and has settled for a moment. One entry
 *    is at most one offer: an auth change while sitting on the menu is not a new entry.
 *
 * The server keeps no "already rated" flag readable by the client (mazer.mazer_submit_feedback_v1 only inserts), so
 * the submitted flag lives on this device. A second device can offer once more; the RPC's own rate limit still holds.
 */
import { resolveLegacyProgressionOrdinal } from './legacyProgression';

export const LEGACY_RATING_PROMPT_STEP_LEVELS = 50;
/** One record per account: `${prefix}${userId}`. */
export const LEGACY_RATING_PROMPT_STORAGE_PREFIX = 'mazer.ratingPrompt.v1:';
/** The menu must have been on screen, idle, this long before the popup opens (the menu-return build settles first). */
export const LEGACY_RATING_PROMPT_SETTLE_MS = 900;

export interface LegacyRatingPromptRecord {
  /** A rating was saved by the server for this account (from this device). Final. */
  readonly submitted: boolean;
  /** Highest level reached when the last offer closed without a saved rating; null = never offered. */
  readonly dismissedAtLevel: number | null;
  /** Highest player level seen at a main-menu entry (a progress reset never lowers it). */
  readonly peakLevel: number;
}

export type LegacyRatingPromptStorage = Pick<Storage, 'getItem' | 'setItem'>;

export const createLegacyRatingPromptRecord = (): LegacyRatingPromptRecord => Object.freeze({
  dismissedAtLevel: null,
  peakLevel: 0,
  submitted: false
});

const toLevel = (value: unknown): number => (
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : 0
);

/** The player's level ordinal (string or number) as a whole number; junk is 0, beyond the safe range is capped. */
export const resolveLegacyRatingPromptLevel = (level: unknown): number => {
  const ordinal = resolveLegacyProgressionOrdinal(typeof level === 'string' ? level.trim() : level);
  if (ordinal === null) {
    return 0;
  }
  const value = Number(ordinal);
  return Number.isSafeInteger(value) ? Math.max(0, value) : Number.MAX_SAFE_INTEGER;
};

export const normalizeLegacyRatingPromptRecord = (value: unknown): LegacyRatingPromptRecord => {
  if (value === null || typeof value !== 'object') {
    return createLegacyRatingPromptRecord();
  }
  const row = value as Record<string, unknown>;
  const dismissed = toLevel(row.dismissedAtLevel);
  return Object.freeze({
    dismissedAtLevel: dismissed > 0 ? dismissed : null,
    peakLevel: toLevel(row.peakLevel),
    submitted: row.submitted === true
  });
};

/** The highest level at which the next offer is due (first offer 50, then last close + 50), or null when rated. */
export const resolveLegacyRatingPromptNextLevel = (record: LegacyRatingPromptRecord): number | null => {
  if (record.submitted) {
    return null;
  }
  if (record.dismissedAtLevel === null) {
    return LEGACY_RATING_PROMPT_STEP_LEVELS;
  }
  return record.dismissedAtLevel + LEGACY_RATING_PROMPT_STEP_LEVELS;
};

/** Highest level reached = the larger of the stored peak and the level now. */
export const resolveLegacyRatingPromptHighestLevel = (record: LegacyRatingPromptRecord, level: unknown): number => (
  Math.max(record.peakLevel, resolveLegacyRatingPromptLevel(level))
);

export const shouldOfferLegacyRatingPrompt = (record: LegacyRatingPromptRecord, level: unknown): boolean => {
  const next = resolveLegacyRatingPromptNextLevel(record);
  return next !== null && resolveLegacyRatingPromptHighestLevel(record, level) >= next;
};

export const recordLegacyRatingPromptPeak = (record: LegacyRatingPromptRecord, level: unknown): LegacyRatingPromptRecord => {
  const peakLevel = resolveLegacyRatingPromptHighestLevel(record, level);
  return peakLevel === record.peakLevel ? record : Object.freeze({ ...record, peakLevel });
};

/** The offer closed without a saved rating ("Not now", Escape, or a send that did not save). */
export const recordLegacyRatingPromptDismissed = (
  record: LegacyRatingPromptRecord,
  highestLevel: number
): LegacyRatingPromptRecord => {
  if (record.submitted) {
    return record;
  }
  const level = Math.max(toLevel(highestLevel), record.peakLevel);
  return Object.freeze({ ...record, dismissedAtLevel: Math.max(level, record.dismissedAtLevel ?? 0) || null, peakLevel: level });
};

export const recordLegacyRatingPromptSubmitted = (record: LegacyRatingPromptRecord): LegacyRatingPromptRecord => (
  record.submitted ? record : Object.freeze({ ...record, submitted: true })
);

const storageKey = (userId: string): string => `${LEGACY_RATING_PROMPT_STORAGE_PREFIX}${userId}`;
const isUsableUserId = (userId: string | null | undefined): userId is string => (
  typeof userId === 'string' && userId.trim().length > 0
);

/** Combines two records of one account: the further-along facts win (a saved rating, the later close, the higher peak). */
export const mergeLegacyRatingPromptRecords = (
  a: LegacyRatingPromptRecord,
  b: LegacyRatingPromptRecord
): LegacyRatingPromptRecord => {
  const dismissed = Math.max(a.dismissedAtLevel ?? 0, b.dismissedAtLevel ?? 0);
  return Object.freeze({
    dismissedAtLevel: dismissed > 0 ? dismissed : null,
    peakLevel: Math.max(a.peakLevel, b.peakLevel),
    submitted: a.submitted || b.submitted
  });
};

export const readLegacyRatingPromptRecord = (
  storage: LegacyRatingPromptStorage | null | undefined,
  userId: string | null | undefined
): LegacyRatingPromptRecord => {
  if (!storage || !isUsableUserId(userId)) {
    return createLegacyRatingPromptRecord();
  }
  try {
    const raw = storage.getItem(storageKey(userId));
    return raw === null ? createLegacyRatingPromptRecord() : normalizeLegacyRatingPromptRecord(JSON.parse(raw));
  } catch {
    return createLegacyRatingPromptRecord();
  }
};

/** Returns false when nothing could be written (no storage, no account, quota, private mode). */
export const writeLegacyRatingPromptRecord = (
  storage: LegacyRatingPromptStorage | null | undefined,
  userId: string | null | undefined,
  record: LegacyRatingPromptRecord
): boolean => {
  if (!storage || !isUsableUserId(userId)) {
    return false;
  }
  try {
    storage.setItem(storageKey(userId), JSON.stringify({
      dismissedAtLevel: record.dismissedAtLevel,
      peakLevel: record.peakLevel,
      submitted: record.submitted
    }));
    return true;
  } catch {
    return false;
  }
};

/** What the scene knows this frame. */
export interface LegacyRatingPromptFrame {
  readonly nowMs: number;
  /** mode === 'menu' (the main menu, not a game). */
  readonly onMainMenu: boolean;
  /** Nothing on top of the menu: no overlay, no open dropdown, no popup already open. */
  readonly surfaceIdle: boolean;
  /** The sign-in check has finished (the boot snapshot is not the final word until it has). */
  readonly authResolved: boolean;
  /** The signed-in account, or null when signed out / guest / unavailable. */
  readonly userId: string | null;
  /** ?previewLevel sandbox (no account writes): never offered. */
  readonly sandbox: boolean;
  /** The player's level ordinal (raw, never a display string). */
  readonly level: unknown;
}

export type LegacyRatingPromptStep =
  | { readonly action: 'none' }
  | { readonly action: 'offer'; readonly userId: string; readonly highestLevel: number };

export interface LegacyRatingPromptGate {
  /** Call every frame. Returns 'offer' at most once per main-menu entry. */
  poll: (frame: LegacyRatingPromptFrame) => LegacyRatingPromptStep;
  /** A rating was saved for this account: never offer again. */
  markSubmitted: (userId: string | null) => void;
  /** An offer closed. Without a saved rating it waits for 50 more levels. `shown` false = the popup never appeared. */
  markClosed: (offer: { userId: string; highestLevel: number; shown: boolean }) => void;
  /** Scene (re)create: the next menu frame is a fresh entry. */
  reset: () => void;
}

export const createLegacyRatingPromptGate = (deps: {
  storage: () => LegacyRatingPromptStorage | null | undefined;
  settleMs?: number;
}): LegacyRatingPromptGate => {
  const settleMs = deps.settleMs ?? LEGACY_RATING_PROMPT_SETTLE_MS;
  let wasOnMainMenu = false;
  /** Set on entry, cleared once this entry has been decided (offered, skipped) or left. */
  let enteredAtMs: number | null = null;
  /** Restarts the settle wait whenever something sits on top of the menu. */
  let idleSinceMs: number | null = null;
  /**
   * Session copy per account. A browser-storage write can fail (quota, private mode); without this copy a "Not now" or a
   * saved rating would be lost and the popup would return at every menu entry. Storage and memory are merged on read.
   */
  const memory = new Map<string, LegacyRatingPromptRecord>();

  const load = (userId: string): LegacyRatingPromptRecord => {
    const stored = readLegacyRatingPromptRecord(deps.storage(), userId);
    const kept = memory.get(userId);
    return kept === undefined ? stored : mergeLegacyRatingPromptRecords(stored, kept);
  };

  const save = (userId: string, record: LegacyRatingPromptRecord): void => {
    memory.set(userId, record);
    writeLegacyRatingPromptRecord(deps.storage(), userId, record);
  };

  const update = (userId: string, change: (record: LegacyRatingPromptRecord) => LegacyRatingPromptRecord): void => {
    const before = load(userId);
    const after = change(before);
    if (after !== before) {
      save(userId, after);
    }
  };

  return {
    markClosed: ({ highestLevel, shown, userId }) => {
      if (!shown) {
        return;
      }
      update(userId, (record) => recordLegacyRatingPromptDismissed(record, highestLevel));
    },
    markSubmitted: (userId) => {
      if (!isUsableUserId(userId)) {
        return;
      }
      update(userId, recordLegacyRatingPromptSubmitted);
    },
    poll: (frame) => {
      if (!frame.onMainMenu) {
        wasOnMainMenu = false;
        enteredAtMs = null;
        idleSinceMs = null;
        return { action: 'none' };
      }
      if (!wasOnMainMenu) {
        wasOnMainMenu = true;
        enteredAtMs = frame.nowMs;
        idleSinceMs = null;
      }
      if (enteredAtMs === null) {
        return { action: 'none' };
      }
      if (frame.sandbox) {
        enteredAtMs = null;
        return { action: 'none' };
      }
      if (!frame.authResolved) {
        return { action: 'none' };
      }
      if (!isUsableUserId(frame.userId)) {
        // Signed out at this entry: nothing to offer until the next entry.
        enteredAtMs = null;
        return { action: 'none' };
      }
      if (!frame.surfaceIdle) {
        idleSinceMs = null;
        return { action: 'none' };
      }
      idleSinceMs ??= frame.nowMs;
      if (frame.nowMs - Math.max(enteredAtMs, idleSinceMs) < settleMs) {
        return { action: 'none' };
      }
      enteredAtMs = null;
      const userId = frame.userId;
      const stored = load(userId);
      const record = recordLegacyRatingPromptPeak(stored, frame.level);
      if (record !== stored) {
        save(userId, record);
      }
      if (!shouldOfferLegacyRatingPrompt(record, frame.level)) {
        return { action: 'none' };
      }
      return { action: 'offer', highestLevel: record.peakLevel, userId };
    },
    reset: () => {
      wasOnMainMenu = false;
      enteredAtMs = null;
      idleSinceMs = null;
    }
  };
};
