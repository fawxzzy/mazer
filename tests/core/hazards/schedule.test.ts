import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import {
  HAZARD_CAPS,
  HAZARD_EXPOSURE_STAGE_MAX,
  HAZARD_EXPOSURE_STAGE_MIN,
  HAZARD_FAIRNESS,
  HAZARD_INTRO_SCHEDULE,
  HAZARD_SCHEDULE_MANIFEST_ID,
  HAZARD_SCHEDULE_VERSION,
  HAZARD_SHARD_GROWTH_LEVELS,
  HAZARD_SHARD_LOCK,
  HAZARD_TAIL,
  HUNTER_SPEED_DIVISORS,
  MAX_GATE_TIER,
  MAX_PATROL_TIER,
  allocateHazardUnits,
  isShardLockLevel,
  nextHazardTailUnit,
  resolveHazardKindFirstLevel,
  resolveScheduledStage,
  resolveShardFirstLockLevel,
  resolveShardLockChance,
  type HazardAllocation
} from '../../../src/mazer-core/hazards';

const manifest = JSON.parse(readFileSync(new URL('../../../docs/contracts/mazer-hazard-schedule.v2.json', import.meta.url), 'utf8'));

/*
 * Golden (first-time cards spec section 3, curve A): every level in 100..282 whose lock roll says "lock". From 283
 * every level locks. Band counts 6/6/30/32/31 match the spec table; a change here changes which levels lock their star.
 */
const LOCK_LEVELS_BELOW_FULL = [
  102, 106, 108, 110, 115, 119, 122, 127, 128, 129, 132, 135, 140, 142, 144, 145, 146, 147, 150, 151, 153, 160, 163,
  164, 166, 167, 168, 173, 179, 180, 181, 182, 183, 186, 187, 190, 192, 193, 195, 197, 198, 199, 200, 201, 207, 208,
  210, 212, 214, 215, 216, 217, 221, 223, 224, 225, 226, 227, 229, 230, 232, 234, 235, 237, 238, 239, 240, 241, 242,
  243, 244, 246, 247, 249, 250, 251, 252, 253, 254, 255, 256, 257, 258, 259, 261, 262, 263, 264, 265, 266, 267, 268,
  269, 270, 271, 272, 273, 274, 276, 277, 278, 279, 280, 281, 282
];
const SATURATION = 288;
const allocate = (level: number, exposureStage?: number): HazardAllocation => (
  allocateHazardUnits(level, { saturationLevel: SATURATION, exposureStage })
);

describe('hazard schedule (slice H2) follows manifest v2', () => {
  test('constants are the signed manifest values', () => {
    expect(HAZARD_SCHEDULE_MANIFEST_ID).toBe(manifest.manifestId);
    expect(HAZARD_SCHEDULE_VERSION).toBe(manifest.version);
    expect(HAZARD_INTRO_SCHEDULE.map((entry) => [entry.level, entry.unit])).toEqual(
      manifest.intro.map((entry: { level: number; unit: string }) => [entry.level, entry.unit])
    );
    expect(HAZARD_TAIL).toEqual({
      fromLevel: manifest.tail.fromLevel,
      everyLevels: manifest.tail.everyLevels,
      unitsPerStep: manifest.tail.unitsPerStep
    });
    expect(manifest.tail.blockersRemoved).toBe(true);
    expect(HAZARD_CAPS).toEqual({
      gates: manifest.caps.gates,
      sentries: manifest.caps.sentries,
      hunters: manifest.caps.hunters,
      enemiesTotal: manifest.caps.enemiesTotal
    });
    expect(HAZARD_FAIRNESS.escapeSlackRatioMin).toBe(manifest.fairness.escapeSlackRatioMin);
    expect(HAZARD_FAIRNESS.noFragileStepInFirstWitnessSteps).toBe(manifest.fairness.noFragileStepInFirstWitnessSteps);
    expect([HAZARD_EXPOSURE_STAGE_MIN, HAZARD_EXPOSURE_STAGE_MAX]).toEqual([manifest.exposure.stages.min, manifest.exposure.stages.max]);
    expect(HAZARD_SHARD_GROWTH_LEVELS).toBe(manifest.forever.shardCountGrowsEveryLevels);
    expect(HUNTER_SPEED_DIVISORS[0]).toBe(manifest.kinds.hunter.speedDivisorAtIntro);
    expect(HUNTER_SPEED_DIVISORS[HUNTER_SPEED_DIVISORS.length - 1]).toBe(manifest.kinds.hunter.speedDivisorFloor);
    expect(HAZARD_SHARD_LOCK.salt).toBe(Number.parseInt(manifest.shardLock.salt, 16));
    expect(HAZARD_SHARD_LOCK.chanceAtEntry).toBe(manifest.shardLock.chanceAtEntry);
    expect(HAZARD_SHARD_LOCK.fullFromLevel).toBe(manifest.shardLock.fullFromLevel);
    expect(HAZARD_SHARD_LOCK.fullFromLevel).toBe(manifest.forever.shardsOnEveryLevelFrom);
    expect(resolveHazardKindFirstLevel('shard')).toBe(manifest.shardLock.firstLockLevel);
    expect(LOCK_LEVELS_BELOW_FULL).toHaveLength(manifest.shardLock.lockLevelsBelowFull);
  });

  test('curve A: 0 below 100, 30% at 100, linear to 100% at 283, held', () => {
    expect(resolveShardLockChance(99)).toBe(0);
    expect(resolveShardLockChance(1)).toBe(0);
    expect(resolveShardLockChance(100)).toBeCloseTo(0.3, 12);
    expect(resolveShardLockChance(282)).toBeCloseTo(0.3 + (0.7 * 182) / 183, 12);
    expect(resolveShardLockChance(283)).toBe(1);
    expect(resolveShardLockChance(5000)).toBe(1);
    for (let level = 100; level < 283; level += 1) {
      expect(resolveShardLockChance(level + 1)).toBeGreaterThan(resolveShardLockChance(level));
    }
  });

  test('golden: the lock levels in 100..282, all levels from 283, none below 100', () => {
    const locked: number[] = [];
    for (let level = 1; level <= 282; level += 1) {
      if (isShardLockLevel(level)) locked.push(level);
    }
    expect(locked).toEqual(LOCK_LEVELS_BELOW_FULL);
    expect(locked.slice(0, 5)).toEqual([102, 106, 108, 110, 115]);
    const band = (from: number, to: number): number => locked.filter((level) => level >= from && level <= to).length;
    expect([band(100, 119), band(120, 139), band(140, 199), band(200, 249), band(250, 282)]).toEqual([6, 6, 30, 32, 31]);
    for (let level = 283; level <= 3000; level += 1) expect(isShardLockLevel(level), `L${level}`).toBe(true);
    // Longest dry spell after 100 is 6 levels (spec section 3).
    let run = 0;
    let longest = 0;
    for (let level = 101; level <= 282; level += 1) {
      run = isShardLockLevel(level) ? 0 : run + 1;
      longest = Math.max(longest, run);
    }
    expect(longest).toBe(6);
    expect(resolveShardFirstLockLevel()).toBe(102);
    expect(resolveShardFirstLockLevel(103)).toBe(106);
    expect(resolveShardFirstLockLevel(283)).toBe(283);
    expect(resolveShardFirstLockLevel(1)).toBe(102);
  });

  test('no hazard of any kind before level 10', () => {
    for (let level = 1; level < 10; level += 1) {
      const a = allocate(level);
      expect([a.gates, a.sentries, a.hunters, a.shards, a.scheduledStage], `L${level}`).toEqual([0, 0, 0, 0, 0]);
      expect(a.firstEncounter).toBeNull();
      expect(a.tailUnits).toEqual([]);
    }
  });

  test('each kind is introduced alone on its intro level', () => {
    expect(allocate(10)).toMatchObject({ firstEncounter: 'pulseGate', gates: 1, sentries: 0, hunters: 0, shards: 0, gateTier: 0 });
    expect(allocate(19)).toMatchObject({ firstEncounter: null, gates: 1, sentries: 0 });
    expect(allocate(20)).toMatchObject({ firstEncounter: 'sentry', gates: 1, sentries: 1, hunters: 0 });
    expect(allocate(35)).toMatchObject({ firstEncounter: 'hunter', sentries: 1, hunters: 1, hunterSpeedDivisor: 3 });
    // Manifest v2: L60 no longer carries a shard; 100 starts the lock roll, 102 is the first lock (and first encounter).
    expect(allocate(60)).toMatchObject({ firstEncounter: null, shards: 0, scheduledStage: 3 });
    expect(allocate(100)).toMatchObject({ firstEncounter: null, shards: 0, scheduledStage: 3 });
    expect(allocate(101)).toMatchObject({ firstEncounter: null, shards: 0, scheduledStage: 3 });
    expect(allocate(102)).toMatchObject({ firstEncounter: 'shard', shards: 1, scheduledStage: 4 });
    expect(allocate(103)).toMatchObject({ firstEncounter: null, shards: 0, scheduledStage: 4 });
    expect(allocate(106)).toMatchObject({ firstEncounter: null, shards: 1 });
  });

  test('the tail tape matches an independent re-derivation from the convex prices', () => {
    // Independent replay: the price shapes and menu order written out again here.
    const state = { gates: 1, sentries: 1, hunters: 1, gateTier: 0, sentryTier: 0, hunterTier: 0 };
    const expected: string[] = [];
    for (let at = 36; at <= SATURATION; at += 15) {
      const menu: Array<[string, number]> = [];
      const enemies = state.sentries + state.hunters;
      if (state.gates < 6) menu.push(['gate', 4 * (1 + state.gates ** 2)]);
      if (state.gateTier < MAX_GATE_TIER) menu.push(['gateTier', 6 * (1 + state.gateTier) ** 2]);
      if (state.sentries < 4 && enemies < 5) menu.push(['sentry', 6 * (1 + state.sentries ** 2)]);
      if (state.sentryTier < MAX_PATROL_TIER) menu.push(['sentryTier', 9 * (1 + state.sentryTier) ** 2]);
      if (state.hunters < 2 && enemies < 5) menu.push(['hunter', 10 * (1 + state.hunters ** 2)]);
      if (state.hunterTier < 1) menu.push(['hunterTier', 12 * (1 + state.hunterTier) ** 2]);
      const pick = menu.reduce((best, entry) => (entry[1] < best[1] ? entry : best), ['none', Infinity] as [string, number]);
      expected.push(pick[0]);
      const field = ({ gate: 'gates', sentry: 'sentries', hunter: 'hunters' } as Record<string, string>)[pick[0]] ?? pick[0];
      if (field in state) {
        state[field as keyof typeof state] += 1;
      }
    }
    expect(allocate(SATURATION).tailUnits).toEqual(expected);
    // Snapshot of the signed shape: 17 steps, first at 36, the menu runs dry with the last one (L276).
    expect(expected).toEqual([
      'gateTier', 'gate', 'sentryTier', 'sentry', 'hunterTier', 'gate', 'hunter', 'gateTier', 'sentry',
      'sentryTier', 'gate', 'gateTier', 'gate', 'sentryTier', 'gateTier', 'gate', 'sentryTier'
    ]);
    const end = allocate(SATURATION);
    expect(nextHazardTailUnit(end)).toBe('none');
    expect(end).toMatchObject({ gates: 6, sentries: 3, hunters: 2, gateTier: MAX_GATE_TIER, sentryTier: MAX_PATROL_TIER, hunterTier: 1, hunterSpeedDivisor: 2 });
  });

  test('levels only ever add (shards only from 283): counts and tiers never fall, caps always hold', () => {
    let previous = allocate(1);
    for (let level = 2; level <= 700; level += 1) {
      const a = allocate(level);
      for (const key of ['gates', 'sentries', 'hunters', 'gateTier', 'sentryTier', 'hunterTier'] as const) {
        expect(a[key], `L${level} ${key}`).toBeGreaterThanOrEqual(previous[key]);
      }
      // v2: a level carries shards exactly when it rolls a lock; from 283 every level does and the count never falls.
      expect(a.shards > 0, `L${level} shards`).toBe(isShardLockLevel(level));
      if (level > HAZARD_SHARD_LOCK.fullFromLevel) expect(a.shards, `L${level} shards`).toBeGreaterThanOrEqual(previous.shards);
      expect(a.gates).toBeLessThanOrEqual(HAZARD_CAPS.gates);
      expect(a.sentries).toBeLessThanOrEqual(HAZARD_CAPS.sentries);
      expect(a.hunters).toBeLessThanOrEqual(HAZARD_CAPS.hunters);
      expect(a.sentries + a.hunters).toBeLessThanOrEqual(HAZARD_CAPS.enemiesTotal);
      expect(a.tailUnits.length).toBe(level < 36 ? 0 : Math.floor((Math.min(level, SATURATION) - 36) / 15) + 1);
      expect(a.tailUnits).not.toContain('none');
      previous = a;
    }
  });

  test('past saturation only the shard count grows, one every 50 levels', () => {
    const atSaturation = allocate(SATURATION);
    for (const level of [289, 337, 338, 388, 1000]) {
      const a = allocate(level);
      expect({ ...a, level: 0, allocationLevel: 0, shards: 0 }).toEqual({ ...atSaturation, level: 0, allocationLevel: 0, shards: 0, saturated: true });
      expect(a.shards).toBe(1 + Math.floor((level - SATURATION) / 50));
    }
    expect(allocate(287).saturated).toBe(false);
  });

  test('the exposure stage can only slow the schedule down, never speed it up', () => {
    const stages = [undefined, Number.NaN, -1, 0, 1, 2, 2.5, 3, 4, 99, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY];
    for (let level = 1; level <= 320; level += 7) {
      const scheduled = allocate(level);
      for (const stage of stages) {
        const a = allocate(level, stage);
        expect(a.exposureStage, `L${level} stage ${String(stage)}`).toBeGreaterThanOrEqual(0);
        expect(a.exposureStage).toBeLessThanOrEqual(scheduled.scheduledStage);
        for (const key of ['gates', 'sentries', 'hunters', 'shards', 'gateTier', 'sentryTier', 'hunterTier'] as const) {
          expect(a[key], `L${level} stage ${String(stage)} ${key}`).toBeLessThanOrEqual(scheduled[key]);
        }
        if (a.exposureStage < a.scheduledStage && HAZARD_INTRO_SCHEDULE[a.exposureStage]!.unit === 'shard') {
          // v2: the skipped shard comes with the level's own allocation, on a lock level only, as one shard.
          expect(a.allocationLevel).toBe(level);
          expect(a.shards).toBe(isShardLockLevel(level) ? 1 : 0);
          expect(a.firstEncounter).toBe(isShardLockLevel(level) ? 'shard' : null);
          expect({ ...a, exposureStage: 0, shards: 0, firstEncounter: null }).toEqual({
            ...scheduled, exposureStage: 0, shards: 0, firstEncounter: null
          });
        } else if (a.exposureStage < a.scheduledStage) {
          // A skipped kind arrives on its own, in its first-encounter shape.
          const intro = HAZARD_INTRO_SCHEDULE[a.exposureStage]!;
          expect(a.allocationLevel).toBe(intro.level);
          expect(a.firstEncounter).toBe(intro.unit);
          expect({ ...a, level: 0, scheduledStage: 0, exposureStage: 0 }).toEqual({
            ...allocate(intro.level), level: 0, scheduledStage: 0, exposureStage: 0
          });
        } else {
          expect(a).toEqual({ ...scheduled, exposureStage: a.exposureStage });
        }
      }
    }
    expect(allocate(100, Number.NaN).exposureStage).toBe(0);
    expect(allocate(100, 2.9).exposureStage).toBe(2);
    expect(allocate(100, 99).exposureStage).toBe(3);
    expect(allocate(102, 99).exposureStage).toBe(4);
  });

  test('a stage-3 player meets the shard on the first lock level they play, as one shard, even past saturation', () => {
    expect(allocate(103, 3)).toMatchObject({ exposureStage: 3, firstEncounter: null, shards: 0 });
    expect(allocate(106, 3)).toMatchObject({ exposureStage: 3, firstEncounter: 'shard', shards: 1, allocationLevel: 106 });
    expect(allocate(500, 3)).toMatchObject({ exposureStage: 3, firstEncounter: 'shard', shards: 1, allocationLevel: 500 });
    expect(allocate(500).shards).toBeGreaterThan(1);
    expect(resolveScheduledStage(101)).toBe(3);
    expect(resolveScheduledStage(102)).toBe(4);
  });

  test('rejects malformed input', () => {
    expect(() => allocate(0)).toThrow(RangeError);
    expect(() => allocate(1.5)).toThrow(RangeError);
    expect(() => allocate(Number.NaN)).toThrow(RangeError);
    expect(() => allocateHazardUnits(10, { saturationLevel: 0 })).toThrow(RangeError);
  });
});
