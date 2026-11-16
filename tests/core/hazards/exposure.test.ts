import { describe, expect, test } from 'vitest';
import {
  HAZARD_EXPOSURE_KIND_ORDER,
  HAZARD_EXPOSURE_STAGE_MAX,
  HAZARD_INTRO_SCHEDULE,
  advanceHazardExposureOnClear,
  allocateHazardUnits,
  allocateHazardUnitsForRecord,
  allocatedKinds,
  canonicalizeHazardExposureFingerprint,
  createEmptyHazardExposureRecord,
  mergeHazardExposureRecords,
  normalizeHazardExposureRecord,
  parseHazardExposureRecord,
  resolveHazardExposureStage,
  resolveScheduledStage,
  serializeHazardExposureRecord,
  toHazardScheduleLevel,
  type HazardExposureRecord
} from '../../../src/mazer-core/hazards';

const SATURATION = 336;

const withStage = (stage: number): HazardExposureRecord => ({ ...createEmptyHazardExposureRecord(), stage });

/** Plays levels from..to in order, clearing each one, and returns the record after. */
const playThrough = (record: HazardExposureRecord, from: number, to: number): HazardExposureRecord => {
  let next = record;
  for (let level = from; level <= to; level += 1) {
    next = advanceHazardExposureOnClear(next, { clearedLevel: level, saturationLevel: SATURATION });
  }
  return next;
};

describe('hazard exposure record: migration and tampered saves', () => {
  test('a missing or unreadable record is stage 0 with nothing shown', () => {
    const empty = createEmptyHazardExposureRecord();
    for (const raw of [null, undefined, '', 'not json', '[]', '42', 'null', '"x"', '{']) {
      expect(parseHazardExposureRecord(raw)).toEqual(empty);
    }
  });

  test('tampered fields are cleaned: stage clamped to 0..4, unknown kinds dropped, intros in schedule order', () => {
    const cases: Array<[unknown, number]> = [
      [99, HAZARD_EXPOSURE_STAGE_MAX],
      [-1, 0],
      [Number.NaN, 0],
      [Number.POSITIVE_INFINITY, 0],
      ['4', 4],
      [' 2 ', 2],
      ['two', 0],
      [2.9, 2],
      [[3], 0],
      [{ stage: 3 }, 0],
      [true, 0],
      [null, 0]
    ];
    for (const [stage, expected] of cases) {
      expect(normalizeHazardExposureRecord({ v: 1, stage }).stage, String(stage)).toBe(expected);
    }
    const record = normalizeHazardExposureRecord({
      v: 7,
      stage: 2,
      introsShown: ['shard', 'dragon', 'pulseGate', 'pulseGate', 3, null],
      tierPipThrough: -5,
      extra: 'dropped'
    });
    expect(record).toEqual({ v: 1, stage: 2, introsShown: ['pulseGate', 'shard'], tierPipThrough: 0 });
    expect(normalizeHazardExposureRecord({ introsShown: 'pulseGate' }).introsShown).toEqual([]);
    expect(normalizeHazardExposureRecord({ tierPipThrough: '66' }).tierPipThrough).toBe(0);
    expect(normalizeHazardExposureRecord({ tierPipThrough: 1e12 }).tierPipThrough).toBe(1_000_000);
  });

  test('the stage can never exceed what the level allows (every stage x level 1..120)', () => {
    for (let stage = -2; stage <= 9; stage += 1) {
      const record = normalizeHazardExposureRecord({ stage });
      for (let level = 1; level <= 120; level += 1) {
        const effective = resolveHazardExposureStage(record, level);
        expect(effective).toBeLessThanOrEqual(resolveScheduledStage(level));
        expect(effective).toBeGreaterThanOrEqual(0);
        const kinds = allocatedKinds(allocateHazardUnitsForRecord(record, level, SATURATION));
        for (const kind of kinds) {
          const introLevel = HAZARD_INTRO_SCHEDULE.find((entry) => entry.unit === kind)!.level;
          expect(introLevel, `${kind} at L${level} stage ${stage}`).toBeLessThanOrEqual(level);
        }
      }
    }
  });

  test('a tampered stage 4 on a level-3 save builds a plain maze; garbage levels allow nothing', () => {
    const tampered = parseHazardExposureRecord('{"v":1,"stage":4}');
    expect(allocatedKinds(allocateHazardUnitsForRecord(tampered, 3, SATURATION))).toEqual([]);
    expect(allocatedKinds(allocateHazardUnitsForRecord(tampered, '3', SATURATION))).toEqual([]);
    for (const level of ['abc', '-40', '', null, undefined, Number.NaN, -3, 0, '1e9', {}]) {
      expect(toHazardScheduleLevel(level), String(level)).toBe(1);
      expect(resolveHazardExposureStage(tampered, level)).toBe(0);
    }
    expect(toHazardScheduleLevel('0042')).toBe(42);
    expect(toHazardScheduleLevel('99999999999999999999999')).toBe(1_000_000);
    expect(toHazardScheduleLevel(12.7)).toBe(12);
  });

  test('a migrated level-99 save with no record meets the Pulse Gate first, then one kind per level', () => {
    let record = parseHazardExposureRecord(null);
    const met: Array<string | null> = [];
    for (let level = 99; level <= 103; level += 1) {
      const allocation = allocateHazardUnitsForRecord(record, level, SATURATION);
      met.push(allocation.firstEncounter);
      record = advanceHazardExposureOnClear(record, { clearedLevel: level, saturationLevel: SATURATION });
    }
    expect(met).toEqual(['pulseGate', 'sentry', 'hunter', 'shard', null]);
    expect(record.stage).toBe(4);
  });

  test('a new player tracks the schedule exactly across L1..100 (mazes stay a pure function of seed and level)', () => {
    let record = createEmptyHazardExposureRecord();
    for (let level = 1; level <= 100; level += 1) {
      const mine = allocateHazardUnitsForRecord(record, level, SATURATION);
      const schedule = allocateHazardUnits(level, { saturationLevel: SATURATION });
      // Same maze. Only the reported stage differs on an intro level (met-before vs scheduled).
      expect({ ...mine, exposureStage: 0 }, `L${level}`).toEqual({ ...schedule, exposureStage: 0 });
      record = advanceHazardExposureOnClear(record, { clearedLevel: level, saturationLevel: SATURATION });
      expect(record.stage).toBe(resolveScheduledStage(level));
    }
  });

  test('advance is monotone, never above the cleared level, and returns the same object when nothing changes', () => {
    for (let stage = 0; stage <= 4; stage += 1) {
      for (let level = 1; level <= 90; level += 1) {
        const before = withStage(stage);
        const after = advanceHazardExposureOnClear(before, { clearedLevel: level, saturationLevel: SATURATION });
        expect(after.stage).toBeGreaterThanOrEqual(before.stage);
        if (after !== before) {
          expect(after.stage).toBe(before.stage + 1);
          expect(after.stage).toBeLessThanOrEqual(resolveScheduledStage(level));
        }
      }
    }
    const steady = withStage(1);
    expect(advanceHazardExposureOnClear(steady, { clearedLevel: 15, saturationLevel: SATURATION })).toBe(steady);
    expect(advanceHazardExposureOnClear(steady, { clearedLevel: 'garbage', saturationLevel: SATURATION })).toBe(steady);
  });

  test('a progression reset never regresses: the stored stage and shown cards survive a lower level', () => {
    const veteran = playThrough(createEmptyHazardExposureRecord(), 1, 70);
    const shown: HazardExposureRecord = { ...veteran, introsShown: [...HAZARD_EXPOSURE_KIND_ORDER] };
    // Back to level 1: the maze is plain (the read-time clamp), the record is untouched.
    expect(resolveHazardExposureStage(shown, 1)).toBe(0);
    const replayed = playThrough(shown, 1, 70);
    expect(replayed.stage).toBe(4);
    expect(replayed.introsShown).toEqual(HAZARD_EXPOSURE_KIND_ORDER);
    expect(parseHazardExposureRecord(serializeHazardExposureRecord(replayed))).toEqual(replayed);
  });

  test('merge is max-wins with a union of shown cards, in either order', () => {
    const a: HazardExposureRecord = { v: 1, stage: 3, introsShown: ['sentry'], tierPipThrough: 36 };
    const b: HazardExposureRecord = { v: 1, stage: 1, introsShown: ['pulseGate', 'sentry'], tierPipThrough: 51 };
    const expected = { v: 1, stage: 3, introsShown: ['pulseGate', 'sentry'], tierPipThrough: 51 };
    expect(mergeHazardExposureRecords(a, b)).toEqual(expected);
    expect(mergeHazardExposureRecords(b, a)).toEqual(expected);
  });
});

describe('hazard exposure record: account-sync safety', () => {
  test('serialisation is canonical and round-trips', () => {
    const record: HazardExposureRecord = { v: 1, stage: 2, introsShown: ['sentry', 'pulseGate'], tierPipThrough: 36 };
    const text = serializeHazardExposureRecord(record);
    expect(text).toBe('{"v":1,"stage":2,"introsShown":["pulseGate","sentry"],"tierPipThrough":36}');
    expect(serializeHazardExposureRecord(parseHazardExposureRecord(text))).toBe(text);
  });

  test('a reordered or older fingerprint canonicalises to the fresh one; non-objects pass through', () => {
    const fresh = serializeHazardExposureRecord({ v: 1, stage: 2, introsShown: ['pulseGate', 'sentry'], tierPipThrough: 0 });
    const reordered = '{"tierPipThrough":0,"introsShown":["sentry","pulseGate"],"extra":true,"stage":"2","v":1}';
    expect(canonicalizeHazardExposureFingerprint(reordered)).toBe(fresh);
    expect(canonicalizeHazardExposureFingerprint(fresh)).toBe(fresh);
    for (const opaque of ['', 'nope', '[1,2]', 'null', '7']) {
      expect(canonicalizeHazardExposureFingerprint(opaque)).toBe(opaque);
    }
  });
});
