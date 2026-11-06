import {
  createLegacyEndlessLifecycleState,
  resolveLegacyEndlessLifecycleTransition,
  type LegacyEndlessLifecycleEffect,
  type LegacyEndlessLifecycleEvent,
  type LegacyEndlessLifecycleState,
  type LegacyEndlessLifecycleTransition
} from './legacyPlayLifecycle';

// Pure, versioned Endless checkpoint store (board card
// mazer-endless-progression-mode-contract). It composes the merged pure
// lifecycle resolver with durable-checkpoint bookkeeping, reset-scope policy,
// idempotent event application, and a stable serialized form behind an
// injected Storage-like interface.
//
// NOT WIRED: no scene, no progression storage, no remote/outbox, no clock, no
// randomness. Scene wiring and persistence migration are later packets; see
// docs/architecture/MAZER-ENDLESS-CHECKPOINT-STORE.md.

export const LEGACY_ENDLESS_CHECKPOINT_SCHEMA_VERSION = 1;
export const LEGACY_ENDLESS_CHECKPOINT_STORAGE_KEY = 'mazer.endless-checkpoint.v1';
export const LEGACY_ENDLESS_CHECKPOINT_QUARANTINE_SUFFIX = '.corrupt';
export const LEGACY_ENDLESS_SCORE_INPUT_VERSION = 1;
export const LEGACY_ENDLESS_MAX_APPLIED_EVENT_IDS = 64;
export const LEGACY_ENDLESS_MAX_SCORE_INPUTS = 32;
export const LEGACY_ENDLESS_MAX_ID_LENGTH = 128;
const LEGACY_ENDLESS_MAX_QUARANTINE_LENGTH = 16384;

/** Minimal injected persistence surface; no direct browser storage is used here. */
export interface LegacyEndlessCheckpointStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/**
 * Why the current attempt was reset (or resumed). 'hazard-contact' is a
 * documented FUTURE value: hazards do not exist yet, so applying it is
 * rejected as 'scope-reserved' until a later packet activates it.
 */
export type LegacyEndlessResetScope =
  | 'player'
  | 'enemy-contact'
  | 'close-reopen'
  | 'offline-reconnect'
  | 'hazard-contact';

export type LegacyEndlessResetScopeState = 'active' | 'reserved';

export interface LegacyEndlessResetScopeContract {
  /** Whether the reset spends an attempt (attempt counter +1). */
  readonly consumesAttempt: boolean;
  /** The only lifecycle event this scope may accompany. */
  readonly event: Extract<LegacyEndlessLifecycleEvent, 'fail-current-attempt' | 'resume'>;
  /** Every scope keeps the durable last-completed checkpoint. */
  readonly preservesCheckpoint: true;
  readonly state: LegacyEndlessResetScopeState;
}

export const LEGACY_ENDLESS_RESET_SCOPE_CONTRACTS: Readonly<
  Record<LegacyEndlessResetScope, LegacyEndlessResetScopeContract>
> = {
  player: { consumesAttempt: true, event: 'fail-current-attempt', preservesCheckpoint: true, state: 'active' },
  'enemy-contact': { consumesAttempt: true, event: 'fail-current-attempt', preservesCheckpoint: true, state: 'active' },
  'hazard-contact': { consumesAttempt: true, event: 'fail-current-attempt', preservesCheckpoint: true, state: 'reserved' },
  'close-reopen': { consumesAttempt: false, event: 'resume', preservesCheckpoint: true, state: 'active' },
  'offline-reconnect': { consumesAttempt: false, event: 'resume', preservesCheckpoint: true, state: 'active' }
};

const RESET_SCOPES = Object.keys(LEGACY_ENDLESS_RESET_SCOPE_CONTRACTS) as LegacyEndlessResetScope[];

export type LegacyEndlessCheckpointPhase = 'fresh' | 'active' | 'abandoned';

export type LegacyEndlessCheckpointRejectReason =
  | 'invalid-event-id'
  | 'not-started'
  | 'already-started'
  | 'already-abandoned'
  | 'abandoned-requires-resume'
  | 'scope-required'
  | 'scope-not-applicable'
  | 'scope-event-mismatch'
  | 'scope-reserved'
  | 'level-overflow'
  | 'storage-write-blocked';

type TransitionVerdict = 'accept' | Exclude<LegacyEndlessCheckpointRejectReason,
  'invalid-event-id' | 'scope-required' | 'scope-not-applicable' | 'scope-event-mismatch' | 'scope-reserved' | 'level-overflow' | 'storage-write-blocked'>;

/**
 * Non-overlapping (phase, event) table layered over the lifecycle resolver.
 * The resolver itself is total; this table decides which events are legal.
 */
export const LEGACY_ENDLESS_CHECKPOINT_TRANSITION_TABLE: Readonly<
  Record<LegacyEndlessCheckpointPhase, Readonly<Record<LegacyEndlessLifecycleEvent, TransitionVerdict>>>
> = {
  fresh: {
    start: 'accept',
    complete: 'not-started',
    'fail-current-attempt': 'not-started',
    abandon: 'not-started',
    resume: 'not-started'
  },
  active: {
    start: 'already-started',
    complete: 'accept',
    'fail-current-attempt': 'accept',
    abandon: 'accept',
    resume: 'accept'
  },
  abandoned: {
    start: 'already-started',
    complete: 'abandoned-requires-resume',
    'fail-current-attempt': 'abandoned-requires-resume',
    abandon: 'already-abandoned',
    resume: 'accept'
  }
};

export interface LegacyEndlessCheckpointMarker {
  readonly eventId: string;
  readonly level: number;
  readonly sequence: number;
}

export interface LegacyEndlessResetMarker {
  readonly attempt: number;
  readonly eventId: string;
  readonly level: number;
  readonly scope: LegacyEndlessResetScope;
  readonly sequence: number;
}

/**
 * Private score INPUT facts. These are per-level observations the server may
 * weigh; they are never a client-computed total. The store has no field for
 * score, coins, time, or any aggregate, and parsing drops unknown fields.
 */
export interface LegacyEndlessScoreInput {
  readonly attemptsUsed: number;
  readonly eventId: string;
  readonly level: number;
  readonly sequence: number;
}

export interface LegacyEndlessScoreInputs {
  readonly completions: readonly LegacyEndlessScoreInput[];
  readonly scoreVersion: typeof LEGACY_ENDLESS_SCORE_INPUT_VERSION;
}

export interface LegacyEndlessCheckpointRecord {
  /** Bounded recent window used for idempotent re-application. */
  readonly appliedEventIds: readonly string[];
  readonly lastCheckpoint: LegacyEndlessCheckpointMarker | null;
  readonly lastReset: LegacyEndlessResetMarker | null;
  readonly lifecycle: LegacyEndlessLifecycleState;
  readonly runId: string;
  readonly schemaVersion: typeof LEGACY_ENDLESS_CHECKPOINT_SCHEMA_VERSION;
  readonly scoreInputs: LegacyEndlessScoreInputs;
  /** Count of applied (non-duplicate, non-rejected) events. */
  readonly sequence: number;
}

export interface LegacyEndlessCheckpointEventInput {
  readonly event: LegacyEndlessLifecycleEvent;
  /** Caller-owned idempotency key (deterministic, never wall-clock or random). */
  readonly eventId: string;
  /** Required for fail-current-attempt and resume; forbidden otherwise. */
  readonly resetScope?: LegacyEndlessResetScope;
}

export type LegacyEndlessCheckpointApplyResult =
  | {
    readonly effect: LegacyEndlessLifecycleEffect;
    readonly outcome: 'applied';
    readonly record: LegacyEndlessCheckpointRecord;
    readonly transition: LegacyEndlessLifecycleTransition;
  }
  | { readonly outcome: 'duplicate'; readonly record: LegacyEndlessCheckpointRecord }
  | {
    readonly outcome: 'rejected';
    readonly reason: LegacyEndlessCheckpointRejectReason;
    readonly record: LegacyEndlessCheckpointRecord;
  };

export interface LegacyEndlessResumeTarget {
  readonly attempt: number;
  readonly checkpointLevel: number | null;
  readonly level: number;
}

const isSafeNonNegativeInteger = (value: unknown): value is number => (
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
);

const isValidId = (value: unknown): value is string => (
  typeof value === 'string' && value.length > 0 && value.length <= LEGACY_ENDLESS_MAX_ID_LENGTH
);

const emptyScoreInputs = (): LegacyEndlessScoreInputs => ({
  completions: [],
  scoreVersion: LEGACY_ENDLESS_SCORE_INPUT_VERSION
});

export const createLegacyEndlessCheckpointRecord = ({
  initialLevel = 0,
  runId
}: {
  initialLevel?: number;
  runId: string;
}): LegacyEndlessCheckpointRecord => {
  if (!isValidId(runId)) {
    throw new Error('Endless checkpoint runId must be a non-empty string of at most 128 characters.');
  }
  const rounded = Math.round(initialLevel);
  const safeLevel = Number.isSafeInteger(rounded) && rounded >= 0 ? rounded : 0;
  return {
    appliedEventIds: [],
    lastCheckpoint: null,
    lastReset: null,
    lifecycle: createLegacyEndlessLifecycleState(safeLevel),
    runId,
    schemaVersion: LEGACY_ENDLESS_CHECKPOINT_SCHEMA_VERSION,
    scoreInputs: emptyScoreInputs(),
    sequence: 0
  };
};

export const resolveLegacyEndlessCheckpointPhase = (
  record: LegacyEndlessCheckpointRecord
): LegacyEndlessCheckpointPhase => {
  if (record.sequence === 0) {
    return 'fresh';
  }
  return record.lifecycle.status === 'abandoned' ? 'abandoned' : 'active';
};

/** Where a reopen/reconnect resumes: the current attempt of the level after the checkpoint. */
export const resolveLegacyEndlessResumeTarget = (
  record: LegacyEndlessCheckpointRecord
): LegacyEndlessResumeTarget => ({
  attempt: record.lifecycle.attempt,
  checkpointLevel: record.lifecycle.checkpointLevel,
  level: record.lifecycle.currentLevel
});

/** Copy of the private score inputs for server submission; carries no aggregate totals. */
export const resolveLegacyEndlessPrivateScoreInputs = (
  record: LegacyEndlessCheckpointRecord
): LegacyEndlessScoreInputs => ({
  completions: record.scoreInputs.completions.map((entry) => ({ ...entry })),
  scoreVersion: record.scoreInputs.scoreVersion
});

const boundTail = <T>(items: readonly T[], max: number): T[] => (
  items.length > max ? items.slice(items.length - max) : [...items]
);

const reject = (
  record: LegacyEndlessCheckpointRecord,
  reason: LegacyEndlessCheckpointRejectReason
): LegacyEndlessCheckpointApplyResult => ({ outcome: 'rejected', reason, record });

/**
 * Idempotent, pure application of one lifecycle event. Duplicate eventIds
 * (inside the bounded window) return the unchanged record; illegal
 * transitions are rejected without mutation.
 */
export const applyLegacyEndlessCheckpointEvent = (
  record: LegacyEndlessCheckpointRecord,
  input: LegacyEndlessCheckpointEventInput
): LegacyEndlessCheckpointApplyResult => {
  if (!isValidId(input.eventId)) {
    return reject(record, 'invalid-event-id');
  }
  if (record.appliedEventIds.includes(input.eventId)) {
    return { outcome: 'duplicate', record };
  }

  const verdict = LEGACY_ENDLESS_CHECKPOINT_TRANSITION_TABLE[resolveLegacyEndlessCheckpointPhase(record)][input.event];
  if (verdict !== 'accept') {
    return reject(record, verdict);
  }

  const scopeRequired = input.event === 'fail-current-attempt' || input.event === 'resume';
  if (!scopeRequired && input.resetScope !== undefined) {
    return reject(record, 'scope-not-applicable');
  }
  let scopeContract: LegacyEndlessResetScopeContract | null = null;
  if (scopeRequired) {
    if (input.resetScope === undefined) {
      return reject(record, 'scope-required');
    }
    scopeContract = Object.prototype.hasOwnProperty.call(LEGACY_ENDLESS_RESET_SCOPE_CONTRACTS, input.resetScope)
      ? LEGACY_ENDLESS_RESET_SCOPE_CONTRACTS[input.resetScope]
      : null;
    if (scopeContract === null || scopeContract.event !== input.event) {
      return reject(record, 'scope-event-mismatch');
    }
    if (scopeContract.state === 'reserved') {
      return reject(record, 'scope-reserved');
    }
  }
  if (input.event === 'complete' && record.lifecycle.currentLevel >= Number.MAX_SAFE_INTEGER) {
    return reject(record, 'level-overflow');
  }

  const transition = resolveLegacyEndlessLifecycleTransition(record.lifecycle, input.event);
  const sequence = record.sequence + 1;
  const previous = record.lifecycle;
  const next = transition.state;

  let lastCheckpoint = record.lastCheckpoint;
  let lastReset = record.lastReset;
  let scoreInputs = record.scoreInputs;

  if (transition.effect === 'advance-checkpoint' && next.checkpointLevel !== null) {
    lastCheckpoint = { eventId: input.eventId, level: next.checkpointLevel, sequence };
    lastReset = null;
    scoreInputs = {
      completions: boundTail([
        ...record.scoreInputs.completions,
        { attemptsUsed: previous.attempt, eventId: input.eventId, level: previous.currentLevel, sequence }
      ], LEGACY_ENDLESS_MAX_SCORE_INPUTS),
      scoreVersion: LEGACY_ENDLESS_SCORE_INPUT_VERSION
    };
  } else if (scopeContract !== null && input.resetScope !== undefined) {
    lastReset = {
      attempt: next.attempt,
      eventId: input.eventId,
      level: next.currentLevel,
      scope: input.resetScope,
      sequence
    };
  }

  const nextRecord: LegacyEndlessCheckpointRecord = {
    appliedEventIds: boundTail([...record.appliedEventIds, input.eventId], LEGACY_ENDLESS_MAX_APPLIED_EVENT_IDS),
    lastCheckpoint,
    lastReset,
    lifecycle: { ...next },
    runId: record.runId,
    schemaVersion: LEGACY_ENDLESS_CHECKPOINT_SCHEMA_VERSION,
    scoreInputs,
    sequence
  };
  return { effect: transition.effect, outcome: 'applied', record: nextRecord, transition };
};

// ---------------------------------------------------------------------------
// Serialization, parsing, and migration

const sortKeysDeep = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(sortKeysDeep);
  }
  if (value !== null && typeof value === 'object') {
    const source = value as Record<string, unknown>;
    return Object.keys(source).sort().reduce<Record<string, unknown>>((sorted, key) => {
      sorted[key] = sortKeysDeep(source[key]);
      return sorted;
    }, {});
  }
  return value;
};

/** Stable JSON: sorted keys, no whitespace, schema-version envelope. */
export const serializeLegacyEndlessCheckpointRecord = (
  record: LegacyEndlessCheckpointRecord
): string => JSON.stringify(sortKeysDeep({
  record,
  schemaVersion: LEGACY_ENDLESS_CHECKPOINT_SCHEMA_VERSION
}));

const asObject = (value: unknown): Record<string, unknown> | null => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
);

const parseLifecycle = (value: unknown): LegacyEndlessLifecycleState | null => {
  const source = asObject(value);
  if (source === null) return null;
  const { attempt, checkpointLevel, currentLevel, status, version } = source;
  if (version !== 1 || (status !== 'active' && status !== 'abandoned')) return null;
  if (!isSafeNonNegativeInteger(attempt) || attempt < 1) return null;
  if (!isSafeNonNegativeInteger(currentLevel)) return null;
  if (checkpointLevel !== null && !isSafeNonNegativeInteger(checkpointLevel)) return null;
  if (checkpointLevel !== null && currentLevel <= (checkpointLevel as number)) return null;
  return { attempt, checkpointLevel: checkpointLevel as number | null, currentLevel, status, version: 1 };
};

const parseCheckpointMarker = (value: unknown): LegacyEndlessCheckpointMarker | null | undefined => {
  if (value === null) return null;
  const source = asObject(value);
  if (source === null) return undefined;
  const { eventId, level, sequence } = source;
  if (!isValidId(eventId) || !isSafeNonNegativeInteger(level) || !isSafeNonNegativeInteger(sequence)) return undefined;
  return { eventId, level, sequence };
};

const parseResetMarker = (value: unknown): LegacyEndlessResetMarker | null | undefined => {
  if (value === null) return null;
  const source = asObject(value);
  if (source === null) return undefined;
  const { attempt, eventId, level, scope, sequence } = source;
  if (
    !isValidId(eventId)
    || !isSafeNonNegativeInteger(attempt) || attempt < 1
    || !isSafeNonNegativeInteger(level)
    || !isSafeNonNegativeInteger(sequence)
    || typeof scope !== 'string'
    || !RESET_SCOPES.includes(scope as LegacyEndlessResetScope)
  ) {
    return undefined;
  }
  return { attempt, eventId, level, scope: scope as LegacyEndlessResetScope, sequence };
};

const parseScoreInputs = (value: unknown): LegacyEndlessScoreInputs | null => {
  const source = asObject(value);
  if (source === null || source.scoreVersion !== LEGACY_ENDLESS_SCORE_INPUT_VERSION) return null;
  if (!Array.isArray(source.completions) || source.completions.length > LEGACY_ENDLESS_MAX_SCORE_INPUTS) return null;
  const completions: LegacyEndlessScoreInput[] = [];
  for (const entry of source.completions) {
    const item = asObject(entry);
    if (item === null) return null;
    const { attemptsUsed, eventId, level, sequence } = item;
    if (
      !isSafeNonNegativeInteger(attemptsUsed) || attemptsUsed < 1
      || !isValidId(eventId)
      || !isSafeNonNegativeInteger(level)
      || !isSafeNonNegativeInteger(sequence)
    ) {
      return null;
    }
    // Allowlist copy: any raw-total style field on disk is dropped here.
    completions.push({ attemptsUsed, eventId, level, sequence });
  }
  return { completions, scoreVersion: LEGACY_ENDLESS_SCORE_INPUT_VERSION };
};

const parseRecordV1 = (value: unknown): LegacyEndlessCheckpointRecord | null => {
  const source = asObject(value);
  if (source === null || source.schemaVersion !== LEGACY_ENDLESS_CHECKPOINT_SCHEMA_VERSION) return null;
  const { appliedEventIds, runId, sequence } = source;
  const lifecycle = parseLifecycle(source.lifecycle);
  const lastCheckpoint = parseCheckpointMarker(source.lastCheckpoint);
  const lastReset = parseResetMarker(source.lastReset);
  const scoreInputs = parseScoreInputs(source.scoreInputs);
  if (
    lifecycle === null || lastCheckpoint === undefined || lastReset === undefined || scoreInputs === null
    || !isValidId(runId)
    || !isSafeNonNegativeInteger(sequence)
    || !Array.isArray(appliedEventIds)
    || appliedEventIds.length > LEGACY_ENDLESS_MAX_APPLIED_EVENT_IDS
    || !appliedEventIds.every(isValidId)
    || new Set(appliedEventIds).size !== appliedEventIds.length
  ) {
    return null;
  }
  // Cross-field invariants: the durable marker must mirror the lifecycle checkpoint.
  if ((lastCheckpoint?.level ?? null) !== lifecycle.checkpointLevel) return null;
  if (lastCheckpoint !== null && lastCheckpoint.sequence > sequence) return null;
  if (sequence === 0 && (lifecycle.attempt !== 1 || lifecycle.status !== 'active' || lastCheckpoint !== null)) return null;
  if (appliedEventIds.length > sequence) return null;
  return {
    appliedEventIds: [...appliedEventIds] as string[],
    lastCheckpoint,
    lastReset,
    lifecycle,
    runId,
    schemaVersion: LEGACY_ENDLESS_CHECKPOINT_SCHEMA_VERSION,
    scoreInputs,
    sequence
  };
};

/**
 * Migration stub. Each entry upgrades an envelope payload from `version` to
 * `version + 1`. Empty today: v1 is the only schema. A future packet adds
 * entries here rather than changing parseRecordV1.
 */
export const LEGACY_ENDLESS_CHECKPOINT_MIGRATIONS: Readonly<
  Record<number, (record: Record<string, unknown>) => Record<string, unknown>>
> = {};

export type LegacyEndlessCheckpointParseResult =
  | { readonly record: LegacyEndlessCheckpointRecord; readonly status: 'ok' | 'migrated' }
  | { readonly record: null; readonly status: 'empty' }
  | { readonly reason: string; readonly record: null; readonly status: 'corrupt' | 'unsupported-version' };

export const parseLegacyEndlessCheckpointRecord = (
  raw: string | null | undefined
): LegacyEndlessCheckpointParseResult => {
  if (raw === null || raw === undefined || raw === '') {
    return { record: null, status: 'empty' };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { reason: 'invalid-json', record: null, status: 'corrupt' };
  }
  const envelope = asObject(parsed);
  if (envelope === null || !Number.isSafeInteger(envelope.schemaVersion) || (envelope.schemaVersion as number) < 1) {
    return { reason: 'invalid-envelope', record: null, status: 'corrupt' };
  }
  let version = envelope.schemaVersion as number;
  if (version > LEGACY_ENDLESS_CHECKPOINT_SCHEMA_VERSION) {
    return { reason: `schema-${version}-newer-than-${LEGACY_ENDLESS_CHECKPOINT_SCHEMA_VERSION}`, record: null, status: 'unsupported-version' };
  }
  let payload = asObject(envelope.record);
  if (payload === null) {
    return { reason: 'missing-record', record: null, status: 'corrupt' };
  }
  const startedAt = version;
  while (version < LEGACY_ENDLESS_CHECKPOINT_SCHEMA_VERSION) {
    const migrate = LEGACY_ENDLESS_CHECKPOINT_MIGRATIONS[version];
    if (migrate === undefined) {
      return { reason: `no-migration-from-${version}`, record: null, status: 'corrupt' };
    }
    payload = migrate(payload);
    version += 1;
    payload = { ...payload, schemaVersion: version };
  }
  const record = parseRecordV1(payload);
  if (record === null) {
    return { reason: 'invalid-record', record: null, status: 'corrupt' };
  }
  return { record, status: startedAt === LEGACY_ENDLESS_CHECKPOINT_SCHEMA_VERSION ? 'ok' : 'migrated' };
};

// ---------------------------------------------------------------------------
// Storage-backed load / persist / store

export type LegacyEndlessCheckpointLoadStatus =
  | 'empty'
  | 'loaded'
  | 'migrated'
  | 'recovered-corrupt'
  | 'unsupported-version'
  | 'storage-unavailable';

export interface LegacyEndlessCheckpointLoadResult {
  readonly quarantined: boolean;
  readonly reason?: string;
  readonly record: LegacyEndlessCheckpointRecord;
  readonly status: LegacyEndlessCheckpointLoadStatus;
  /** True when the stored payload came from a newer schema and must not be overwritten. */
  readonly writeBlocked: boolean;
}

export interface LegacyEndlessCheckpointLoadOptions {
  readonly fallbackInitialLevel?: number;
  /** Caller-supplied id for a fresh/recovered record; the store never generates ids. */
  readonly fallbackRunId: string;
  readonly key?: string;
}

export const loadLegacyEndlessCheckpoint = (
  storage: LegacyEndlessCheckpointStorage,
  options: LegacyEndlessCheckpointLoadOptions
): LegacyEndlessCheckpointLoadResult => {
  const key = options.key ?? LEGACY_ENDLESS_CHECKPOINT_STORAGE_KEY;
  const fresh = (): LegacyEndlessCheckpointRecord => createLegacyEndlessCheckpointRecord({
    initialLevel: options.fallbackInitialLevel,
    runId: options.fallbackRunId
  });

  let raw: string | null;
  try {
    raw = storage.getItem(key);
  } catch {
    return { quarantined: false, reason: 'read-failed', record: fresh(), status: 'storage-unavailable', writeBlocked: false };
  }

  const parsed = parseLegacyEndlessCheckpointRecord(raw);
  switch (parsed.status) {
    case 'ok':
      return { quarantined: false, record: parsed.record, status: 'loaded', writeBlocked: false };
    case 'migrated':
      return { quarantined: false, record: parsed.record, status: 'migrated', writeBlocked: false };
    case 'empty':
      return { quarantined: false, record: fresh(), status: 'empty', writeBlocked: false };
    case 'unsupported-version':
      return { quarantined: false, reason: parsed.reason, record: fresh(), status: 'unsupported-version', writeBlocked: true };
    case 'corrupt': {
      // Preserve the unreadable payload (single slot, bounded) before it can be overwritten.
      let quarantined = false;
      if (raw !== null && raw.length <= LEGACY_ENDLESS_MAX_QUARANTINE_LENGTH) {
        try {
          storage.setItem(`${key}${LEGACY_ENDLESS_CHECKPOINT_QUARANTINE_SUFFIX}`, raw);
          quarantined = true;
        } catch {
          quarantined = false;
        }
      }
      return { quarantined, reason: parsed.reason, record: fresh(), status: 'recovered-corrupt', writeBlocked: false };
    }
    default:
      return parsed satisfies never;
  }
};

/** Writes the record and verifies it by reading it back; returns false on any failure. */
export const persistLegacyEndlessCheckpoint = (
  storage: LegacyEndlessCheckpointStorage,
  record: LegacyEndlessCheckpointRecord,
  key: string = LEGACY_ENDLESS_CHECKPOINT_STORAGE_KEY
): boolean => {
  const serialized = serializeLegacyEndlessCheckpointRecord(record);
  try {
    storage.setItem(key, serialized);
    return storage.getItem(key) === serialized;
  } catch {
    return false;
  }
};

export type LegacyEndlessCheckpointStoreApplyResult =
  LegacyEndlessCheckpointApplyResult & { readonly persisted: boolean };

export interface LegacyEndlessCheckpointStore {
  apply(input: LegacyEndlessCheckpointEventInput): LegacyEndlessCheckpointStoreApplyResult;
  getLoadResult(): LegacyEndlessCheckpointLoadResult;
  getPrivateScoreInputs(): LegacyEndlessScoreInputs;
  getRecord(): LegacyEndlessCheckpointRecord;
  getResumeTarget(): LegacyEndlessResumeTarget;
}

/**
 * Thin stateful wrapper over the pure functions. Loads once, applies events
 * in memory, and persists the whole record after every applied event (so a
 * failed write is repaired by the next successful one). Duplicates and
 * rejections never write.
 */
export const createLegacyEndlessCheckpointStore = (
  storage: LegacyEndlessCheckpointStorage,
  options: LegacyEndlessCheckpointLoadOptions
): LegacyEndlessCheckpointStore => {
  const key = options.key ?? LEGACY_ENDLESS_CHECKPOINT_STORAGE_KEY;
  const loadResult = loadLegacyEndlessCheckpoint(storage, options);
  let record = loadResult.record;

  return {
    apply(input) {
      if (loadResult.writeBlocked) {
        return { ...reject(record, 'storage-write-blocked'), persisted: false } as LegacyEndlessCheckpointStoreApplyResult;
      }
      const result = applyLegacyEndlessCheckpointEvent(record, input);
      if (result.outcome !== 'applied') {
        return { ...result, persisted: false };
      }
      record = result.record;
      return { ...result, persisted: persistLegacyEndlessCheckpoint(storage, record, key) };
    },
    getLoadResult: () => loadResult,
    getPrivateScoreInputs: () => resolveLegacyEndlessPrivateScoreInputs(record),
    getRecord: () => record,
    getResumeTarget: () => resolveLegacyEndlessResumeTarget(record)
  };
};
