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
  HAZARD_TAIL,
  HUNTER_SPEED_DIVISORS,
  MAX_GATE_TIER,
  MAX_PATROL_TIER,
  allocateHazardUnits,
  nextHazardTailUnit,
  type HazardAllocation
} from '../../../src/mazer-core/hazards';

const manifest = JSON.parse(readFileSync(new URL('../../../docs/contracts/mazer-hazard-schedule.v1.json', import.meta.url), 'utf8'));
const SATURATION = 288;
const allocate = (level: number, exposureStage?: number): HazardAllocation => (
  allocateHazardUnits(level, { saturationLevel: SATURATION, exposureStage })
);

describe('hazard schedule (slice H2) follows manifest v1', () => {
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
    expect(allocate(60)).toMatchObject({ firstEncounter: 'shard', shards: 1 });
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

  test('levels only ever add: counts and tiers never fall, caps always hold', () => {
    let previous = allocate(1);
    for (let level = 2; level <= 700; level += 1) {
      const a = allocate(level);
      for (const key of ['gates', 'sentries', 'hunters', 'shards', 'gateTier', 'sentryTier', 'hunterTier'] as const) {
        expect(a[key], `L${level} ${key}`).toBeGreaterThanOrEqual(previous[key]);
      }
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
        if (a.exposureStage < a.scheduledStage) {
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
    expect(allocate(100, 99).exposureStage).toBe(4);
  });

  test('rejects malformed input', () => {
    expect(() => allocate(0)).toThrow(RangeError);
    expect(() => allocate(1.5)).toThrow(RangeError);
    expect(() => allocate(Number.NaN)).toThrow(RangeError);
    expect(() => allocateHazardUnits(10, { saturationLevel: 0 })).toThrow(RangeError);
  });
});
