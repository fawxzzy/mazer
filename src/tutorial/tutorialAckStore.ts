import { getTutorialsForTrigger } from './tutorialRegistry.ts';
import type { TutorialRegistry, TutorialToken, TutorialTrigger } from './tutorialRegistry.ts';

// Account-scoped tutorial acknowledgement store. Storage is INJECTED (any Storage-like object), so this module
// never touches window/localStorage itself and performs no network I/O. Every operation re-reads storage, so
// state survives reloads and is shared by any store instance created for the same account and storage.

export const TUTORIAL_ACK_STORAGE_KEY_PREFIX = 'mazer.tutorial.acks';
export const TUTORIAL_ACK_STORED_VERSION = 1;
/** Timestamp assigned to acknowledgements migrated from a shape that carried no time. */
export const MIGRATED_ACK_TIMESTAMP = '1970-01-01T00:00:00.000Z';

/** The subset of the DOM Storage interface the store needs. `window.localStorage` satisfies it. */
export type TutorialStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export interface StoredTutorialAck {
  readonly revision: number;
  readonly count: number;
  readonly firstAckedAt: string;
  readonly lastAckedAt: string;
}

export interface StoredTutorialAcks {
  readonly version: typeof TUTORIAL_ACK_STORED_VERSION;
  readonly acks: Readonly<Record<string, StoredTutorialAck>>;
}

export type TutorialAckLoadStatus = 'empty' | 'ok' | 'migrated' | 'recovered' | 'future-version';

export interface TutorialAckDiagnostics {
  readonly status: TutorialAckLoadStatus;
  /** Entries discarded while parsing or migrating the stored value. */
  readonly droppedEntries: number;
  /** True if reading or writing storage threw at least once. */
  readonly storageError: boolean;
  /** True if acknowledgements exist only in memory (storage unavailable or written by a newer client). */
  readonly unpersisted: boolean;
}

export interface TutorialAckResult {
  /** False when the acknowledgement was already recorded (idempotent no-op). */
  readonly changed: boolean;
  /** True when the change reached storage. False for a no-op or when storage could not be written. */
  readonly persisted: boolean;
}

export type TutorialTokenRef = Pick<TutorialToken, 'id' | 'repeat' | 'revision'>;

export interface TutorialAckStore {
  readonly accountId: string;
  readonly storageKey: string;
  isAcknowledged(token: TutorialTokenRef): boolean;
  acknowledge(token: TutorialTokenRef): TutorialAckResult;
  snapshot(): Readonly<Record<string, StoredTutorialAck>>;
  diagnostics(): TutorialAckDiagnostics;
  /** Removes this account's acknowledgements (and in-memory overlay). Other accounts are untouched. */
  clear(): void;
}

export interface TutorialAckStoreOptions {
  readonly storage: TutorialStorage;
  readonly accountId: string;
  /** ISO timestamp source; injected for determinism. Defaults to the wall clock. */
  readonly now?: () => string;
}

/** Account-scoped key. The id is URI-encoded so distinct accounts can never collide on a shared prefix. */
export const buildTutorialAckStorageKey = (accountId: string): string => {
  if (typeof accountId !== 'string' || accountId.trim().length === 0) {
    throw new TypeError('A non-empty accountId is required to scope tutorial acknowledgements.');
  }
  return `${TUTORIAL_ACK_STORAGE_KEY_PREFIX}:${encodeURIComponent(accountId)}`;
};

const isObject = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const isTimestamp = (value: unknown): value is string => typeof value === 'string' && value.length > 0;

const parseAck = (value: unknown): StoredTutorialAck | null => {
  if (!isObject(value)) return null;
  const { revision, count, firstAckedAt, lastAckedAt } = value;
  if (!Number.isInteger(revision) || (revision as number) < 1) return null;
  if (!Number.isInteger(count) || (count as number) < 1) return null;
  if (!isTimestamp(firstAckedAt) || !isTimestamp(lastAckedAt)) return null;
  return { revision: revision as number, count: count as number, firstAckedAt, lastAckedAt };
};

interface ParsedAcks {
  readonly acks: Record<string, StoredTutorialAck>;
  readonly status: TutorialAckLoadStatus;
  readonly droppedEntries: number;
}

/**
 * Pure parse + migration of a raw stored value. Never throws.
 *
 * - null                      -> empty
 * - v1 object                 -> ok (invalid entries dropped -> recovered)
 * - bare array of token ids   -> migrated to v1 (revision 1, count 1, MIGRATED_ACK_TIMESTAMP)
 * - version greater than 1    -> future-version (unreadable here; callers must not overwrite it)
 * - anything else / bad JSON  -> recovered (empty)
 */
export const parseStoredTutorialAcks = (raw: string | null): ParsedAcks => {
  if (raw === null) return { acks: {}, status: 'empty', droppedEntries: 0 };
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return { acks: {}, status: 'recovered', droppedEntries: 0 };
  }

  if (Array.isArray(value)) {
    const acks: Record<string, StoredTutorialAck> = {};
    let dropped = 0;
    for (const entry of value) {
      if (typeof entry === 'string' && entry.length > 0) {
        acks[entry] = { revision: 1, count: 1, firstAckedAt: MIGRATED_ACK_TIMESTAMP, lastAckedAt: MIGRATED_ACK_TIMESTAMP };
      } else dropped += 1;
    }
    return { acks, status: 'migrated', droppedEntries: dropped };
  }

  if (!isObject(value)) return { acks: {}, status: 'recovered', droppedEntries: 0 };
  if (typeof value.version === 'number' && value.version > TUTORIAL_ACK_STORED_VERSION) {
    return { acks: {}, status: 'future-version', droppedEntries: 0 };
  }
  if (value.version !== TUTORIAL_ACK_STORED_VERSION || !isObject(value.acks)) {
    return { acks: {}, status: 'recovered', droppedEntries: 0 };
  }

  const acks: Record<string, StoredTutorialAck> = {};
  let dropped = 0;
  for (const [tokenId, entry] of Object.entries(value.acks)) {
    const ack = tokenId.length > 0 ? parseAck(entry) : null;
    if (ack) acks[tokenId] = ack;
    else dropped += 1;
  }
  return { acks, status: dropped > 0 ? 'recovered' : 'ok', droppedEntries: dropped };
};

/** Serializes with sorted keys so identical state always writes identical bytes. */
export const serializeTutorialAcks = (acks: Readonly<Record<string, StoredTutorialAck>>): string => {
  const sorted: Record<string, StoredTutorialAck> = {};
  for (const tokenId of Object.keys(acks).sort()) {
    const ack = acks[tokenId];
    sorted[tokenId] = { revision: ack.revision, count: ack.count, firstAckedAt: ack.firstAckedAt, lastAckedAt: ack.lastAckedAt };
  }
  return JSON.stringify({ version: TUTORIAL_ACK_STORED_VERSION, acks: sorted });
};

export const createTutorialAckStore = (options: TutorialAckStoreOptions): TutorialAckStore => {
  const { storage, accountId } = options;
  const now = options.now ?? (() => new Date().toISOString());
  const storageKey = buildTutorialAckStorageKey(accountId);
  const corruptBackupKey = `${storageKey}.corrupt`;
  // Acknowledgements that could not be persisted this session; merged over whatever storage holds.
  const overlay = new Map<string, StoredTutorialAck>();
  let storageError = false;

  const readRaw = (): string | null => {
    try {
      return storage.getItem(storageKey);
    } catch {
      storageError = true;
      return null;
    }
  };

  const load = () => {
    const raw = readRaw();
    const parsed = parseStoredTutorialAcks(raw);
    const merged: Record<string, StoredTutorialAck> = { ...parsed.acks };
    for (const [tokenId, ack] of overlay) merged[tokenId] = ack;
    return { raw, parsed, merged };
  };

  const persist = (raw: string | null, status: TutorialAckLoadStatus, merged: Record<string, StoredTutorialAck>): boolean => {
    if (status === 'future-version') return false;
    try {
      // Keep unreadable bytes recoverable before they are replaced by a clean value.
      if (status === 'recovered' && raw !== null) storage.setItem(corruptBackupKey, raw);
    } catch {
      storageError = true;
    }
    try {
      storage.setItem(storageKey, serializeTutorialAcks(merged));
      return true;
    } catch {
      storageError = true;
      return false;
    }
  };

  return {
    accountId,
    storageKey,

    isAcknowledged(token) {
      if (token.repeat === 'repeatable') return false;
      const ack = load().merged[token.id];
      return ack !== undefined && ack.revision >= token.revision;
    },

    acknowledge(token) {
      const { raw, parsed, merged } = load();
      const existing = merged[token.id];
      if (token.repeat === 'once' && existing !== undefined && existing.revision >= token.revision) {
        return { changed: false, persisted: false };
      }
      const timestamp = now();
      const next: StoredTutorialAck = {
        revision: Math.max(token.revision, existing?.revision ?? 0),
        count: (existing?.count ?? 0) + 1,
        firstAckedAt: existing?.firstAckedAt ?? timestamp,
        lastAckedAt: timestamp
      };
      merged[token.id] = next;
      const persisted = persist(raw, parsed.status, merged);
      if (persisted) overlay.clear();
      else overlay.set(token.id, next);
      return { changed: true, persisted };
    },

    snapshot() {
      return load().merged;
    },

    diagnostics() {
      const { parsed } = load();
      return {
        status: parsed.status,
        droppedEntries: parsed.droppedEntries,
        storageError,
        unpersisted: overlay.size > 0
      };
    },

    clear() {
      overlay.clear();
      try {
        storage.removeItem(storageKey);
      } catch {
        storageError = true;
      }
    }
  };
};

/** Tokens registered for a trigger that this account has not yet acknowledged, in display order. */
export const selectPendingTutorials = (
  registry: TutorialRegistry,
  store: Pick<TutorialAckStore, 'isAcknowledged'>,
  trigger: TutorialTrigger
): TutorialToken[] => getTutorialsForTrigger(registry, trigger).filter((token) => !store.isAcknowledged(token));
