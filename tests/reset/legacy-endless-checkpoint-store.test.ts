import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import {
  LEGACY_ENDLESS_CHECKPOINT_MIGRATIONS,
  LEGACY_ENDLESS_CHECKPOINT_QUARANTINE_SUFFIX,
  LEGACY_ENDLESS_CHECKPOINT_STORAGE_KEY,
  LEGACY_ENDLESS_CHECKPOINT_TRANSITION_TABLE,
  LEGACY_ENDLESS_MAX_APPLIED_EVENT_IDS,
  LEGACY_ENDLESS_MAX_SCORE_INPUTS,
  LEGACY_ENDLESS_RESET_SCOPE_CONTRACTS,
  applyLegacyEndlessCheckpointEvent,
  createLegacyEndlessCheckpointRecord,
  createLegacyEndlessCheckpointStore,
  loadLegacyEndlessCheckpoint,
  parseLegacyEndlessCheckpointRecord,
  persistLegacyEndlessCheckpoint,
  resolveLegacyEndlessCheckpointPhase,
  resolveLegacyEndlessPrivateScoreInputs,
  resolveLegacyEndlessResumeTarget,
  serializeLegacyEndlessCheckpointRecord,
  type LegacyEndlessCheckpointEventInput,
  type LegacyEndlessCheckpointRecord,
  type LegacyEndlessCheckpointStorage,
  type LegacyEndlessResetScope
} from '../../src/legacy-runtime/legacyEndlessCheckpointStore';
import type { LegacyEndlessLifecycleEvent } from '../../src/legacy-runtime/legacyPlayLifecycle';

const createMemoryStorage = (seed: Record<string, string> = {}) => {
  const data = new Map(Object.entries(seed));
  const storage: LegacyEndlessCheckpointStorage & { data: Map<string, string>; failWrites: boolean } = {
    data,
    failWrites: false,
    getItem: (key) => data.get(key) ?? null,
    setItem(key, value) {
      if (storage.failWrites) {
        throw new Error('quota');
      }
      data.set(key, value);
    }
  };
  return storage;
};

const mustApply = (
  record: LegacyEndlessCheckpointRecord,
  input: LegacyEndlessCheckpointEventInput
): LegacyEndlessCheckpointRecord => {
  const result = applyLegacyEndlessCheckpointEvent(record, input);
  if (result.outcome !== 'applied') {
    throw new Error(`expected applied, got ${result.outcome}`);
  }
  return result.record;
};

const started = (initialLevel = 0): LegacyEndlessCheckpointRecord => mustApply(
  createLegacyEndlessCheckpointRecord({ initialLevel, runId: 'run-a' }),
  { event: 'start', eventId: 'e-start' }
);

const EVENTS: LegacyEndlessLifecycleEvent[] = ['start', 'complete', 'fail-current-attempt', 'abandon', 'resume'];

describe('legacy endless checkpoint store transition table', () => {
  test('fresh record only accepts start', () => {
    const fresh = createLegacyEndlessCheckpointRecord({ runId: 'run-a' });
    expect(resolveLegacyEndlessCheckpointPhase(fresh)).toBe('fresh');
    for (const event of EVENTS) {
      const resetScope = event === 'resume' ? 'close-reopen' : event === 'fail-current-attempt' ? 'player' : undefined;
      const result = applyLegacyEndlessCheckpointEvent(fresh, { event, eventId: `f-${event}`, resetScope });
      expect(result.outcome).toBe(event === 'start' ? 'applied' : 'rejected');
      if (result.outcome === 'rejected') {
        expect(result.reason).toBe('not-started');
        expect(result.record).toBe(fresh);
      }
    }
  });

  test('active phase: complete/fail/abandon/resume apply, start is rejected', () => {
    const active = started();
    expect(resolveLegacyEndlessCheckpointPhase(active)).toBe('active');
    expect(applyLegacyEndlessCheckpointEvent(active, { event: 'start', eventId: 'x' })).toMatchObject({
      outcome: 'rejected',
      reason: 'already-started'
    });
    expect(applyLegacyEndlessCheckpointEvent(active, { event: 'complete', eventId: 'c' }).outcome).toBe('applied');
    expect(applyLegacyEndlessCheckpointEvent(active, {
      event: 'fail-current-attempt', eventId: 'f', resetScope: 'player'
    }).outcome).toBe('applied');
    expect(applyLegacyEndlessCheckpointEvent(active, { event: 'abandon', eventId: 'a' }).outcome).toBe('applied');
    expect(applyLegacyEndlessCheckpointEvent(active, {
      event: 'resume', eventId: 'r', resetScope: 'close-reopen'
    }).outcome).toBe('applied');
  });

  test('abandoned phase accepts only resume', () => {
    const abandoned = mustApply(started(), { event: 'abandon', eventId: 'a' });
    expect(resolveLegacyEndlessCheckpointPhase(abandoned)).toBe('abandoned');
    const expected: Record<string, string> = {
      start: 'already-started',
      complete: 'abandoned-requires-resume',
      'fail-current-attempt': 'abandoned-requires-resume',
      abandon: 'already-abandoned'
    };
    for (const [event, reason] of Object.entries(expected)) {
      const resetScope = event === 'fail-current-attempt' ? 'player' : undefined;
      expect(applyLegacyEndlessCheckpointEvent(abandoned, {
        event: event as LegacyEndlessLifecycleEvent, eventId: `ab-${event}`, resetScope
      })).toMatchObject({ outcome: 'rejected', reason });
    }
    const resumed = mustApply(abandoned, { event: 'resume', eventId: 'r', resetScope: 'close-reopen' });
    expect(resumed.lifecycle.status).toBe('active');
  });

  test('table covers every phase and event exactly once', () => {
    for (const phase of Object.keys(LEGACY_ENDLESS_CHECKPOINT_TRANSITION_TABLE) as Array<keyof typeof LEGACY_ENDLESS_CHECKPOINT_TRANSITION_TABLE>) {
      expect(Object.keys(LEGACY_ENDLESS_CHECKPOINT_TRANSITION_TABLE[phase]).sort()).toEqual([...EVENTS].sort());
    }
  });

  test('complete advances the durable checkpoint and resets the attempt', () => {
    const afterFail = mustApply(started(3), { event: 'fail-current-attempt', eventId: 'f1', resetScope: 'player' });
    const completed = applyLegacyEndlessCheckpointEvent(afterFail, { event: 'complete', eventId: 'c1' });
    expect(completed).toMatchObject({ effect: 'advance-checkpoint', outcome: 'applied' });
    if (completed.outcome !== 'applied') throw new Error('unreachable');
    expect(completed.record.lifecycle).toMatchObject({ attempt: 1, checkpointLevel: 3, currentLevel: 4 });
    expect(completed.record.lastCheckpoint).toEqual({ eventId: 'c1', level: 3, sequence: 3 });
    expect(completed.record.lastReset).toBeNull();
    expect(completed.record.scoreInputs.completions).toEqual([
      { attemptsUsed: 2, eventId: 'c1', level: 3, sequence: 3 }
    ]);
  });

  test('rejects completion at the safe-integer ceiling and invalid event ids', () => {
    const edge = mustApply(
      createLegacyEndlessCheckpointRecord({ initialLevel: Number.MAX_SAFE_INTEGER, runId: 'r' }),
      { event: 'start', eventId: 's' }
    );
    expect(applyLegacyEndlessCheckpointEvent(edge, { event: 'complete', eventId: 'c' })).toMatchObject({
      outcome: 'rejected', reason: 'level-overflow'
    });
    expect(applyLegacyEndlessCheckpointEvent(started(), { event: 'complete', eventId: '' })).toMatchObject({
      outcome: 'rejected', reason: 'invalid-event-id'
    });
    expect(() => createLegacyEndlessCheckpointRecord({ runId: '' })).toThrow();
  });
});

describe('legacy endless checkpoint store reset scopes', () => {
  test('attempt-consuming scopes bump the attempt and keep the checkpoint', () => {
    for (const scope of ['player', 'enemy-contact'] as LegacyEndlessResetScope[]) {
      const base = mustApply(started(), { event: 'complete', eventId: 'c' });
      const next = mustApply(base, { event: 'fail-current-attempt', eventId: `f-${scope}`, resetScope: scope });
      expect(next.lifecycle).toMatchObject({ attempt: 2, checkpointLevel: 0, currentLevel: 1 });
      expect(next.lastCheckpoint).toEqual(base.lastCheckpoint);
      expect(next.lastReset).toEqual({ attempt: 2, eventId: `f-${scope}`, level: 1, scope, sequence: 3 });
    }
  });

  test('close/reopen and offline reconnect resume without spending an attempt', () => {
    for (const scope of ['close-reopen', 'offline-reconnect'] as LegacyEndlessResetScope[]) {
      let record = mustApply(started(), { event: 'complete', eventId: 'c' });
      record = mustApply(record, { event: 'fail-current-attempt', eventId: 'f', resetScope: 'enemy-contact' });
      const resumed = applyLegacyEndlessCheckpointEvent(record, { event: 'resume', eventId: `r-${scope}`, resetScope: scope });
      expect(resumed).toMatchObject({ effect: 'resume-current-attempt', outcome: 'applied' });
      if (resumed.outcome !== 'applied') throw new Error('unreachable');
      expect(resumed.record.lifecycle).toMatchObject({ attempt: 2, checkpointLevel: 0, currentLevel: 1 });
      expect(resumed.record.lastReset?.scope).toBe(scope);
    }
  });

  test('hazard-contact is a documented, reserved future scope and is rejected for now', () => {
    expect(LEGACY_ENDLESS_RESET_SCOPE_CONTRACTS['hazard-contact']).toMatchObject({
      consumesAttempt: true, event: 'fail-current-attempt', state: 'reserved'
    });
    const record = started();
    expect(applyLegacyEndlessCheckpointEvent(record, {
      event: 'fail-current-attempt', eventId: 'h', resetScope: 'hazard-contact'
    })).toMatchObject({ outcome: 'rejected', reason: 'scope-reserved' });
  });

  test('scope contract matches the lifecycle resolver effect for every active scope', () => {
    for (const [scope, contract] of Object.entries(LEGACY_ENDLESS_RESET_SCOPE_CONTRACTS)) {
      if (contract.state !== 'active') continue;
      const before = started();
      const after = mustApply(before, { event: contract.event, eventId: 'x', resetScope: scope as LegacyEndlessResetScope });
      expect(after.lifecycle.attempt - before.lifecycle.attempt).toBe(contract.consumesAttempt ? 1 : 0);
      expect(contract.preservesCheckpoint).toBe(true);
    }
  });

  test('scope is required for fail/resume, forbidden elsewhere, and must match the event', () => {
    const record = started();
    expect(applyLegacyEndlessCheckpointEvent(record, { event: 'fail-current-attempt', eventId: 'a' }))
      .toMatchObject({ outcome: 'rejected', reason: 'scope-required' });
    expect(applyLegacyEndlessCheckpointEvent(record, { event: 'resume', eventId: 'b' }))
      .toMatchObject({ outcome: 'rejected', reason: 'scope-required' });
    expect(applyLegacyEndlessCheckpointEvent(record, { event: 'complete', eventId: 'c', resetScope: 'player' }))
      .toMatchObject({ outcome: 'rejected', reason: 'scope-not-applicable' });
    expect(applyLegacyEndlessCheckpointEvent(record, { event: 'resume', eventId: 'd', resetScope: 'player' }))
      .toMatchObject({ outcome: 'rejected', reason: 'scope-event-mismatch' });
    expect(applyLegacyEndlessCheckpointEvent(record, { event: 'fail-current-attempt', eventId: 'e', resetScope: 'close-reopen' }))
      .toMatchObject({ outcome: 'rejected', reason: 'scope-event-mismatch' });
    expect(applyLegacyEndlessCheckpointEvent(record, {
      event: 'fail-current-attempt', eventId: 'f', resetScope: 'toString' as LegacyEndlessResetScope
    })).toMatchObject({ outcome: 'rejected', reason: 'scope-event-mismatch' });
  });
});

describe('legacy endless checkpoint store idempotency', () => {
  test('re-applying the same eventId is a no-op that returns the same record', () => {
    const base = started();
    const first = mustApply(base, { event: 'complete', eventId: 'c1' });
    const again = applyLegacyEndlessCheckpointEvent(first, { event: 'complete', eventId: 'c1' });
    expect(again).toEqual({ outcome: 'duplicate', record: first });
    expect(again.record).toBe(first);
  });

  test('replaying a whole event log from scratch is deterministic', () => {
    const log: LegacyEndlessCheckpointEventInput[] = [
      { event: 'start', eventId: '1' },
      { event: 'complete', eventId: '2' },
      { event: 'fail-current-attempt', eventId: '3', resetScope: 'enemy-contact' },
      { event: 'abandon', eventId: '4' },
      { event: 'resume', eventId: '5', resetScope: 'offline-reconnect' },
      { event: 'complete', eventId: '6' }
    ];
    const run = () => log.reduce(
      (record, input) => mustApply(record, input),
      createLegacyEndlessCheckpointRecord({ runId: 'run-a' })
    );
    expect(serializeLegacyEndlessCheckpointRecord(run())).toBe(serializeLegacyEndlessCheckpointRecord(run()));
    const doubled = log.reduce((record, input) => {
      const result = applyLegacyEndlessCheckpointEvent(record, input);
      return applyLegacyEndlessCheckpointEvent(result.record, input).record;
    }, createLegacyEndlessCheckpointRecord({ runId: 'run-a' }));
    expect(serializeLegacyEndlessCheckpointRecord(doubled)).toBe(serializeLegacyEndlessCheckpointRecord(run()));
  });

  test('bounds the applied-id window and the score-input list', () => {
    let record = started();
    for (let index = 0; index < LEGACY_ENDLESS_MAX_APPLIED_EVENT_IDS + 10; index += 1) {
      record = mustApply(record, { event: 'complete', eventId: `c-${index}` });
    }
    expect(record.appliedEventIds).toHaveLength(LEGACY_ENDLESS_MAX_APPLIED_EVENT_IDS);
    expect(record.appliedEventIds.at(-1)).toBe(`c-${LEGACY_ENDLESS_MAX_APPLIED_EVENT_IDS + 9}`);
    expect(record.scoreInputs.completions).toHaveLength(LEGACY_ENDLESS_MAX_SCORE_INPUTS);
    expect(record.lifecycle.checkpointLevel).toBe(LEGACY_ENDLESS_MAX_APPLIED_EVENT_IDS + 9);
    // A bounded record still round-trips.
    expect(parseLegacyEndlessCheckpointRecord(serializeLegacyEndlessCheckpointRecord(record)).record).toEqual(record);
  });

  test('does not mutate the input record', () => {
    const base = started();
    const snapshot = JSON.stringify(base);
    mustApply(base, { event: 'complete', eventId: 'c' });
    expect(JSON.stringify(base)).toBe(snapshot);
  });
});

describe('legacy endless checkpoint store serialization', () => {
  test('stable JSON has sorted keys and round-trips exactly', () => {
    let record = started(5);
    record = mustApply(record, { event: 'complete', eventId: 'c' });
    record = mustApply(record, { event: 'fail-current-attempt', eventId: 'f', resetScope: 'player' });
    const serialized = serializeLegacyEndlessCheckpointRecord(record);
    expect(serialized.startsWith('{"record":{"appliedEventIds":')).toBe(true);
    expect(serialized.endsWith('"schemaVersion":1}')).toBe(true);
    const parsed = parseLegacyEndlessCheckpointRecord(serialized);
    expect(parsed.status).toBe('ok');
    expect(parsed.record).toEqual(record);
    expect(serializeLegacyEndlessCheckpointRecord(parsed.record!)).toBe(serialized);
  });

  test('key order of a hand-built payload does not matter on parse', () => {
    const record = started();
    const reordered = JSON.stringify({ schemaVersion: 1, record: Object.fromEntries(Object.entries(record).reverse()) });
    expect(parseLegacyEndlessCheckpointRecord(reordered).record).toEqual(record);
  });

  test('migration stub: v1 is identity, newer versions are unsupported, older/unknown are corrupt', () => {
    expect(Object.keys(LEGACY_ENDLESS_CHECKPOINT_MIGRATIONS)).toEqual([]);
    const record = started();
    const body = JSON.parse(serializeLegacyEndlessCheckpointRecord(record));
    expect(parseLegacyEndlessCheckpointRecord(JSON.stringify({ ...body, schemaVersion: 2 })).status).toBe('unsupported-version');
    expect(parseLegacyEndlessCheckpointRecord(JSON.stringify({ ...body, schemaVersion: 0 })).status).toBe('corrupt');
    expect(parseLegacyEndlessCheckpointRecord(JSON.stringify({ record: body.record })).status).toBe('corrupt');
  });

  test('private score inputs carry no raw client totals, even if disk data includes them', () => {
    let record = started();
    record = mustApply(record, { event: 'complete', eventId: 'c' });
    const body = JSON.parse(serializeLegacyEndlessCheckpointRecord(record));
    body.record.score = 99999;
    body.record.scoreInputs.totalScore = 12345;
    body.record.scoreInputs.completions[0].score = 777;
    body.record.scoreInputs.completions[0].elapsedMs = 4000;
    const parsed = parseLegacyEndlessCheckpointRecord(JSON.stringify(body));
    expect(parsed.status).toBe('ok');
    const reserialized = serializeLegacyEndlessCheckpointRecord(parsed.record!);
    expect(reserialized).not.toMatch(/score"|totalScore|elapsedMs|99999|12345|777/);
    expect(Object.keys(resolveLegacyEndlessPrivateScoreInputs(parsed.record!).completions[0]!).sort())
      .toEqual(['attemptsUsed', 'eventId', 'level', 'sequence']);
    expect(Object.keys(resolveLegacyEndlessPrivateScoreInputs(parsed.record!)).sort())
      .toEqual(['completions', 'scoreVersion']);
  });

  test('rejects payloads that violate cross-field invariants', () => {
    let record = started();
    record = mustApply(record, { event: 'complete', eventId: 'c' });
    const body = () => JSON.parse(serializeLegacyEndlessCheckpointRecord(record));
    const mutations: Array<(b: ReturnType<typeof body>) => void> = [
      (b) => { b.record.lifecycle.currentLevel = 0; },
      (b) => { b.record.lastCheckpoint = null; },
      (b) => { b.record.lastCheckpoint.level = 9; },
      (b) => { b.record.lifecycle.attempt = 0; },
      (b) => { b.record.lifecycle.status = 'paused'; },
      (b) => { b.record.lifecycle.currentLevel = 1.5; },
      (b) => { b.record.appliedEventIds = ['a', 'a']; },
      (b) => { b.record.appliedEventIds = ['a', 'b', 'c', 'd']; },
      (b) => { b.record.runId = ''; },
      (b) => { b.record.lastReset = { attempt: 1, eventId: 'x', level: 1, scope: 'nope', sequence: 1 }; },
      (b) => { b.record.scoreInputs.scoreVersion = 2; }
    ];
    for (const mutate of mutations) {
      const candidate = body();
      mutate(candidate);
      expect(parseLegacyEndlessCheckpointRecord(JSON.stringify(candidate)).status).toBe('corrupt');
    }
  });
});

describe('legacy endless checkpoint store persistence', () => {
  test('empty storage yields a fresh record under the injected run id and does not write', () => {
    const storage = createMemoryStorage();
    const result = loadLegacyEndlessCheckpoint(storage, { fallbackRunId: 'fresh-run' });
    expect(result.status).toBe('empty');
    expect(result.record.runId).toBe('fresh-run');
    expect(storage.data.size).toBe(0);
  });

  test('resume after reopen restores the checkpoint, attempt, and resume target', () => {
    const storage = createMemoryStorage();
    const first = createLegacyEndlessCheckpointStore(storage, { fallbackRunId: 'run-1' });
    expect(first.apply({ event: 'start', eventId: 's' })).toMatchObject({ outcome: 'applied', persisted: true });
    first.apply({ event: 'complete', eventId: 'c1' });
    first.apply({ event: 'complete', eventId: 'c2' });
    first.apply({ event: 'fail-current-attempt', eventId: 'f1', resetScope: 'enemy-contact' });

    // "Close" the app: build a brand-new store over the same storage.
    const reopened = createLegacyEndlessCheckpointStore(storage, { fallbackRunId: 'ignored-run' });
    expect(reopened.getLoadResult().status).toBe('loaded');
    expect(reopened.getRecord()).toEqual(first.getRecord());
    expect(reopened.getRecord().runId).toBe('run-1');
    expect(reopened.getResumeTarget()).toEqual({ attempt: 2, checkpointLevel: 1, level: 2 });

    const resumed = reopened.apply({ event: 'resume', eventId: 'r1', resetScope: 'close-reopen' });
    expect(resumed).toMatchObject({ effect: 'resume-current-attempt', outcome: 'applied', persisted: true });
    expect(reopened.getResumeTarget()).toEqual({ attempt: 2, checkpointLevel: 1, level: 2 });

    // A replayed event after reopen is a duplicate and writes nothing.
    const before = storage.data.get(LEGACY_ENDLESS_CHECKPOINT_STORAGE_KEY);
    const replay = createLegacyEndlessCheckpointStore(storage, { fallbackRunId: 'x' })
      .apply({ event: 'complete', eventId: 'c2' });
    expect(replay).toMatchObject({ outcome: 'duplicate', persisted: false });
    expect(storage.data.get(LEGACY_ENDLESS_CHECKPOINT_STORAGE_KEY)).toBe(before);
  });

  test('abandon then reopen then resume keeps the checkpoint', () => {
    const storage = createMemoryStorage();
    const store = createLegacyEndlessCheckpointStore(storage, { fallbackRunId: 'r' });
    store.apply({ event: 'start', eventId: 's' });
    store.apply({ event: 'complete', eventId: 'c' });
    store.apply({ event: 'abandon', eventId: 'a' });
    const reopened = createLegacyEndlessCheckpointStore(storage, { fallbackRunId: 'r2' });
    expect(reopened.getRecord().lifecycle.status).toBe('abandoned');
    expect(reopened.apply({ event: 'complete', eventId: 'c2' })).toMatchObject({ outcome: 'rejected' });
    reopened.apply({ event: 'resume', eventId: 'rr', resetScope: 'offline-reconnect' });
    expect(reopened.getRecord().lifecycle).toMatchObject({ checkpointLevel: 0, currentLevel: 1, status: 'active' });
  });

  test('corrupt storage is quarantined and replaced by a fresh record', () => {
    const key = LEGACY_ENDLESS_CHECKPOINT_STORAGE_KEY;
    for (const garbage of ['{not json', '[]', '{"schemaVersion":1,"record":{"runId":"x"}}', '"str"', '{"schemaVersion":"1"}']) {
      const storage = createMemoryStorage({ [key]: garbage });
      const result = loadLegacyEndlessCheckpoint(storage, { fallbackRunId: 'recovered' });
      expect(result).toMatchObject({ quarantined: true, status: 'recovered-corrupt', writeBlocked: false });
      expect(result.record.runId).toBe('recovered');
      expect(storage.data.get(`${key}${LEGACY_ENDLESS_CHECKPOINT_QUARANTINE_SUFFIX}`)).toBe(garbage);
      expect(storage.data.get(key)).toBe(garbage); // load never overwrites
    }
    const storage = createMemoryStorage({ [key]: '{bad' });
    const store = createLegacyEndlessCheckpointStore(storage, { fallbackRunId: 'recovered' });
    expect(store.apply({ event: 'start', eventId: 's' })).toMatchObject({ outcome: 'applied', persisted: true });
    expect(parseLegacyEndlessCheckpointRecord(storage.data.get(key)).status).toBe('ok');
    expect(storage.data.get(`${key}${LEGACY_ENDLESS_CHECKPOINT_QUARANTINE_SUFFIX}`)).toBe('{bad');
  });

  test('a newer-schema payload is never overwritten', () => {
    const key = LEGACY_ENDLESS_CHECKPOINT_STORAGE_KEY;
    const future = JSON.stringify({ record: {}, schemaVersion: 2 });
    const storage = createMemoryStorage({ [key]: future });
    const store = createLegacyEndlessCheckpointStore(storage, { fallbackRunId: 'r' });
    expect(store.getLoadResult()).toMatchObject({ status: 'unsupported-version', writeBlocked: true });
    expect(store.apply({ event: 'start', eventId: 's' })).toMatchObject({
      outcome: 'rejected', persisted: false, reason: 'storage-write-blocked'
    });
    expect(storage.data.get(key)).toBe(future);
  });

  test('throwing storage degrades to an in-memory record and reports persisted=false', () => {
    const throwing: LegacyEndlessCheckpointStorage = {
      getItem() { throw new Error('denied'); },
      setItem() { throw new Error('denied'); }
    };
    const store = createLegacyEndlessCheckpointStore(throwing, { fallbackRunId: 'r' });
    expect(store.getLoadResult().status).toBe('storage-unavailable');
    expect(store.apply({ event: 'start', eventId: 's' })).toMatchObject({ outcome: 'applied', persisted: false });
    expect(store.getRecord().sequence).toBe(1);
  });

  test('a failed write is repaired by the next successful write', () => {
    const storage = createMemoryStorage();
    const store = createLegacyEndlessCheckpointStore(storage, { fallbackRunId: 'r' });
    storage.failWrites = true;
    expect(store.apply({ event: 'start', eventId: 's' })).toMatchObject({ persisted: false });
    storage.failWrites = false;
    expect(store.apply({ event: 'complete', eventId: 'c' })).toMatchObject({ persisted: true });
    expect(parseLegacyEndlessCheckpointRecord(storage.data.get(LEGACY_ENDLESS_CHECKPOINT_STORAGE_KEY)).record)
      .toEqual(store.getRecord());
  });

  test('persist verifies by read-back and honours a custom key', () => {
    const lying: LegacyEndlessCheckpointStorage = { getItem: () => null, setItem: () => undefined };
    expect(persistLegacyEndlessCheckpoint(lying, started())).toBe(false);
    const storage = createMemoryStorage();
    expect(persistLegacyEndlessCheckpoint(storage, started(), 'custom')).toBe(true);
    expect([...storage.data.keys()]).toEqual(['custom']);
    expect(resolveLegacyEndlessResumeTarget(started(2))).toEqual({ attempt: 1, checkpointLevel: null, level: 2 });
  });

  test('uses its own storage key, distinct from progression and outbox keys', () => {
    expect(LEGACY_ENDLESS_CHECKPOINT_STORAGE_KEY).toBe('mazer.endless-checkpoint.v1');
  });
});

describe('legacy endless checkpoint store purity', () => {
  test('source uses no wall clock, randomness, or direct browser storage', () => {
    const source = readFileSync(
      new URL('../../src/legacy-runtime/legacyEndlessCheckpointStore.ts', import.meta.url),
      'utf8'
    );
    expect(source).not.toMatch(/Date\.now|new Date|performance\.now|Math\.random|crypto|localStorage|sessionStorage|window\.|document\./);
    expect(source).not.toMatch(/legacyProgression|legacyRemoteProgression|MenuScene|supabase/i);
  });
});
