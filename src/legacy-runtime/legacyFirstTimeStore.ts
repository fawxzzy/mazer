/**
 * First-time cards seen + met record (spec slice 1, P1-P4). Device-local for now (D6: account sync is later).
 *
 * - One key per auth scope: `mazer.firsttime.seen.v1:<scope>`, scope `user:<id>` or `guest`, the same scope string
 *   the progression keys use (resolveLegacyAuthStorageScope in legacyAuth.ts). The host passes the scope in.
 * - Same JSON shape as the tutorial acks (`createTutorialAckStore` with a `storageKey` override), so no new format.
 *   The one record holds three kinds of entry, told apart by id:
 *     `<cardId>`              the card was seen (acked at its revision);
 *     `met/<cardId>`          the mechanic was touched, seen or not (the Guide reads this, D9);
 *     `guide-viewed/<rowId>`  the Guide already showed this row's "New" pill.
 *   A slash never appears in a registry id, so the kinds cannot collide.
 * - A progress reset removes the whole record for the reset account (legacyProgressionResetFlow.ts), so cards show
 *   again (D7); "Show tips again" does the same through `clear()`. The level-1 control hint lives elsewhere
 *   (`mazer.tutorial.acks:device`) and is never touched here.
 * - Storage is injected and must be the scene's storage (Level Preview's in-memory sandbox in preview, P3).
 *   Corrupt or throwing storage falls back to memory and never throws (the ack store's own recovery).
 */
import {
  createTutorialAckStore,
  parseStoredTutorialAcks,
  serializeTutorialAcks,
  type StoredTutorialAck,
  type TutorialAckDiagnostics,
  type TutorialStorage,
  type TutorialTokenRef
} from '../tutorial/tutorialAckStore.ts';

export const FIRST_TIME_SEEN_STORAGE_KEY_BASE = 'mazer.firsttime.seen.v1';
/** Matches LEGACY_AUTH_GUEST_SCOPE (pinned by tests/tutorial/first-time-store.test.ts). */
export const FIRST_TIME_GUEST_SCOPE = 'guest';
export const FIRST_TIME_MET_PREFIX = 'met/';
export const FIRST_TIME_GUIDE_VIEWED_PREFIX = 'guide-viewed/';

const markerToken = (id: string): TutorialTokenRef => ({ id, repeat: 'once', revision: 1 });

const requireScope = (scope: string): string => {
  if (typeof scope !== 'string' || scope.trim().length === 0) {
    throw new TypeError('A non-empty auth scope is required for the first-time cards record.');
  }
  return scope;
};

/** `<base>:<scope>`: the same shape resolveLegacyAuthScopedStorageKey builds, so a reset finds it. */
export const resolveFirstTimeSeenStorageKey = (scope: string): string => `${FIRST_TIME_SEEN_STORAGE_KEY_BASE}:${requireScope(scope)}`;

export interface LegacyFirstTimeStore {
  readonly storageKey: string;
  isSeen(token: TutorialTokenRef): boolean;
  markSeen(token: TutorialTokenRef): boolean;
  isMet(cardId: string): boolean;
  /** Returns true when this call recorded a new mechanic. */
  markMet(cardId: string): boolean;
  metCardIds(): readonly string[];
  isGuideRowViewed(rowId: string): boolean;
  markGuideRowsViewed(rowIds: readonly string[]): void;
  /** "Show tips again" / reset: removes this scope's record. Other scopes and the device hint are untouched. */
  clear(): void;
  diagnostics(): TutorialAckDiagnostics;
}

export interface LegacyFirstTimeStoreOptions {
  readonly storage: TutorialStorage;
  readonly scope: string;
  readonly now?: () => string;
}

export const createLegacyFirstTimeStore = (options: LegacyFirstTimeStoreOptions): LegacyFirstTimeStore => {
  const scope = requireScope(options.scope);
  const storageKey = resolveFirstTimeSeenStorageKey(scope);
  const acks = createTutorialAckStore({ storage: options.storage, accountId: scope, storageKey, now: options.now });

  return {
    storageKey,
    isSeen: (token) => acks.isAcknowledged(token),
    markSeen: (token) => acks.acknowledge(token).changed,
    isMet: (cardId) => acks.isAcknowledged(markerToken(`${FIRST_TIME_MET_PREFIX}${cardId}`)),
    markMet: (cardId) => acks.acknowledge(markerToken(`${FIRST_TIME_MET_PREFIX}${cardId}`)).changed,
    metCardIds: () => Object.keys(acks.snapshot())
      .filter((id) => id.startsWith(FIRST_TIME_MET_PREFIX))
      .map((id) => id.slice(FIRST_TIME_MET_PREFIX.length))
      .sort(),
    isGuideRowViewed: (rowId) => acks.isAcknowledged(markerToken(`${FIRST_TIME_GUIDE_VIEWED_PREFIX}${rowId}`)),
    markGuideRowsViewed: (rowIds) => {
      for (const rowId of rowIds) acks.acknowledge(markerToken(`${FIRST_TIME_GUIDE_VIEWED_PREFIX}${rowId}`));
    },
    clear: () => acks.clear(),
    diagnostics: () => acks.diagnostics()
  };
};

const unionAck = (a: StoredTutorialAck | undefined, b: StoredTutorialAck): StoredTutorialAck => (a === undefined ? b : {
  revision: Math.max(a.revision, b.revision),
  count: Math.max(a.count, b.count),
  firstAckedAt: a.firstAckedAt < b.firstAckedAt ? a.firstAckedAt : b.firstAckedAt,
  lastAckedAt: a.lastAckedAt > b.lastAckedAt ? a.lastAckedAt : b.lastAckedAt
});

/**
 * On sign-in (P2): merge the guest record into the user's as a union with max revision, so signing up never re-shows a
 * card. The guest record is left as it is. Never throws; never overwrites a record a newer client wrote.
 */
export const mergeLegacyFirstTimeGuestRecord = (storage: TutorialStorage, userScope: string): { changed: boolean } => {
  if (requireScope(userScope) === FIRST_TIME_GUEST_SCOPE) return { changed: false };
  const guestKey = resolveFirstTimeSeenStorageKey(FIRST_TIME_GUEST_SCOPE);
  const userKey = resolveFirstTimeSeenStorageKey(userScope);
  try {
    const guest = parseStoredTutorialAcks(storage.getItem(guestKey));
    if (Object.keys(guest.acks).length === 0) return { changed: false };
    const userRaw = storage.getItem(userKey);
    const user = parseStoredTutorialAcks(userRaw);
    if (user.status === 'future-version' || guest.status === 'future-version') return { changed: false };
    const merged: Record<string, StoredTutorialAck> = { ...user.acks };
    for (const [id, ack] of Object.entries(guest.acks)) merged[id] = unionAck(merged[id], ack);
    const next = serializeTutorialAcks(merged);
    if (next === userRaw) return { changed: false };
    // Same rule as the ack store: keep unreadable bytes recoverable before replacing them.
    if (user.status === 'recovered' && userRaw !== null) storage.setItem(`${userKey}.corrupt`, userRaw);
    storage.setItem(userKey, next);
    return { changed: true };
  } catch {
    return { changed: false };
  }
};
