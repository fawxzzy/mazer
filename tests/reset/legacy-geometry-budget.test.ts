import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { createLegacyRuntimeMazeForMode } from '../../src/legacy-runtime/legacyGenerationLifecycle';
import {
  GEOMETRY_BUDGET_ACCEPT_HALF_WIDTH,
  GEOMETRY_BUDGET_CEILING,
  GEOMETRY_BUDGET_RUNGS_BY_LEVEL,
  GEOMETRY_BUDGET_SATURATION_LEVEL,
  GEOMETRY_BUDGET_START,
  GEOMETRY_BUDGET_TAPE,
  GEOMETRY_BUDGET_TAPE_LENGTH,
  GEOMETRY_BUDGET_TARGET_STEP,
  LAST_BUDGET_LEVEL,
  measureGeometryBudgetProxy,
  resolveContinuousDifficulty,
  resolveGeometryBudgetCandidateSeed,
  resolveGeometryBudgetProfile,
  resolveGeometryBudgetProfileForRungs,
  resolveGeometryBudgetRungCount,
  resolveGeometryBudgetTarget
} from '../../src/legacy-runtime/legacyGeometryBudget';
import { normalizeLegacyMazeGenerationProfile } from '../../src/legacy-runtime/legacyMaze';
import { resolveLegacyMazeComplexity } from '../../src/legacy-runtime/legacyProgression';

const withoutGateKey = (level: number) => {
  const { geometryBudgetLevel: _ignored, ...rest } = resolveGeometryBudgetProfile(level);
  void _ignored;
  return rest;
};

describe('geometry budget tape', () => {
  test('has the measured rung order and unlock positions', () => {
    expect(GEOMETRY_BUDGET_TAPE.length).toBe(44);
    expect(GEOMETRY_BUDGET_TAPE_LENGTH).toBe(44);
    const labels = GEOMETRY_BUDGET_TAPE.map((rung) => rung.label);
    expect(labels.slice(0, 8)).toEqual([
      'branch:2', 'branch:3', 'dead:1', 'dead:2', 'wrap:h', 'branch:4', 'wrap:v', 'dead:3'
    ]);
    expect(labels[labels.length - 1]).toBe('branch:m1.6');
    // Spending-space unlock spacing K = 5: branches first, then dead ends, then wraps.
    expect(labels.findIndex((label) => label.startsWith('branch'))).toBe(0);
    expect(labels.findIndex((label) => label.startsWith('dead'))).toBe(2);
    expect(labels.findIndex((label) => label.startsWith('wrap'))).toBe(4);
  });

  test('each structure dimension only ever grows along the tape', () => {
    let previous = resolveGeometryBudgetProfileForRungs(0);
    for (let rungs = 1; rungs <= GEOMETRY_BUDGET_TAPE_LENGTH; rungs += 1) {
      const next = resolveGeometryBudgetProfileForRungs(rungs);
      const branches = (p: typeof next): number => (
        p.checkpointCountOverride === null ? 1000 + (p.checkpointCountMultiplier * 100) : p.checkpointCountOverride
      );
      expect(branches(next)).toBeGreaterThanOrEqual(branches(previous));
      const dead = (p: typeof next): number => p.maxDeadEndCount ?? Number.POSITIVE_INFINITY;
      expect(dead(next)).toBeGreaterThanOrEqual(dead(previous));
      expect(next.borderFeederTargetPerSide ?? 0).toBeGreaterThanOrEqual(previous.borderFeederTargetPerSide ?? 0);
      expect(Number(next.requiredOppositeBorderConnections.horizontal))
        .toBeGreaterThanOrEqual(Number(previous.requiredOppositeBorderConnections.horizontal));
      expect(Number(next.requiredOppositeBorderConnections.vertical))
        .toBeGreaterThanOrEqual(Number(previous.requiredOppositeBorderConnections.vertical));
      // Every rung changes the profile.
      expect(JSON.stringify(next)).not.toBe(JSON.stringify(previous));
      previous = next;
    }
    // The tape clamps: more rungs than exist is the full tape.
    expect(resolveGeometryBudgetProfileForRungs(GEOMETRY_BUDGET_TAPE_LENGTH + 50))
      .toEqual(resolveGeometryBudgetProfileForRungs(GEOMETRY_BUDGET_TAPE_LENGTH));
  });

  test('profiles carry no layout key, fixed base knobs and the gate key', () => {
    for (let level = 2; level <= LAST_BUDGET_LEVEL; level += 1) {
      const profile = resolveGeometryBudgetProfile(level);
      expect(Object.prototype.hasOwnProperty.call(profile, 'layout')).toBe(false);
      expect(profile.geometryBudgetLevel).toBe(level);
      expect(profile.straightnessBias).toBe(0.95);
      expect(profile.shortcutCountMultiplier).toBe(0);
      expect(profile.routeQualityReinforcementMultiplier).toBe(0);
      expect(profile.minCheckpoints).toBe(1);
    }
    // Level 2 is the bare base profile (no rungs): one checkpoint, no wraps.
    expect(resolveGeometryBudgetProfile(2).checkpointCountOverride).toBe(1);
    expect(resolveGeometryBudgetProfile(2).requiredOppositeBorderConnections).toEqual({ horizontal: false, vertical: false });
    // An ungated rung profile has no gate key at all.
    expect(Object.prototype.hasOwnProperty.call(resolveGeometryBudgetProfileForRungs(5), 'geometryBudgetLevel')).toBe(false);
  });

  test('is deterministic, immutable across calls and stable under normalization', () => {
    for (let level = 2; level <= LAST_BUDGET_LEVEL; level += 1) {
      const first = resolveGeometryBudgetProfile(level);
      const second = resolveGeometryBudgetProfile(level);
      expect(JSON.stringify(first)).toBe(JSON.stringify(second));
      expect(first).not.toBe(second);
      expect(first.requiredOppositeBorderConnections).not.toBe(second.requiredOppositeBorderConnections);
      expect(normalizeLegacyMazeGenerationProfile(first)).toEqual(first);
    }
    // Mutating a returned profile must not leak into later calls.
    const mutated = resolveGeometryBudgetProfile(LAST_BUDGET_LEVEL);
    mutated.requiredOppositeBorderConnections.horizontal = false;
    expect(resolveGeometryBudgetProfile(LAST_BUDGET_LEVEL).requiredOppositeBorderConnections.horizontal).toBe(true);
  });

  test('module source is free of ambient nondeterminism', () => {
    const source = readFileSync(new URL('../../src/legacy-runtime/legacyGeometryBudget.ts', import.meta.url), 'utf8');
    expect(source).not.toMatch(/Math\.random|Date\.now|new Date|performance\.now/);
  });
});

describe('geometry budget profile normalization', () => {
  test('keeps geometryBudgetLevel only for valid budget levels', () => {
    for (let level = 2; level <= LAST_BUDGET_LEVEL; level += 1) {
      expect(normalizeLegacyMazeGenerationProfile({ geometryBudgetLevel: level }).geometryBudgetLevel).toBe(level);
    }
    for (const invalid of [1, 0, -3, LAST_BUDGET_LEVEL + 1, 2.5, Number.NaN, Number.POSITIVE_INFINITY, '5' as unknown as number]) {
      const normalized = normalizeLegacyMazeGenerationProfile({ geometryBudgetLevel: invalid });
      expect(Object.prototype.hasOwnProperty.call(normalized, 'geometryBudgetLevel')).toBe(false);
    }
  });

  test('profiles without the field keep their exact prior shape', () => {
    expect(Object.prototype.hasOwnProperty.call(normalizeLegacyMazeGenerationProfile(), 'geometryBudgetLevel')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(normalizeLegacyMazeGenerationProfile({ layout: 'corridor' }), 'geometryBudgetLevel')).toBe(false);
  });
});

describe('geometry budget proxy', () => {
  const point = (x: number, y: number) => ({ x, y });

  test('counts turns, length, splits, dead ends and wraps with the documented weights', () => {
    // Right, right, down, down, right: two turns, length 5 (6 cells).
    const maze = {
      width: 10,
      height: 10,
      solutionPath: [point(0, 0), point(1, 0), point(2, 0), point(2, 1), point(2, 2), point(3, 2)]
    };
    const breakdown = measureGeometryBudgetProxy(maze, { deadEndCount: 5, splitCount: 2, edgeWrapCount: 1 });
    expect(breakdown.turns).toBe(2);
    expect(breakdown.length).toBe(5);
    // 2 turns + 5/4 + 3*2 + 2*(5-2) + 6*1
    expect(breakdown.total).toBe(2 + 1.25 + 6 + 6 + 6);
  });

  test('a straight run through an edge wrap is not a turn', () => {
    const maze = {
      width: 5,
      height: 5,
      solutionPath: [point(3, 2), point(4, 2), point(0, 2), point(1, 2)]
    };
    expect(measureGeometryBudgetProxy(maze, { deadEndCount: 0, splitCount: 0, edgeWrapCount: 0 }).turns).toBe(0);
  });

  test('dead ends below the free allowance do not add to the proxy', () => {
    const maze = { width: 5, height: 5, solutionPath: [point(0, 0), point(1, 0)] };
    const flat = measureGeometryBudgetProxy(maze, { deadEndCount: 2, splitCount: 0, edgeWrapCount: 0 }).total;
    expect(measureGeometryBudgetProxy(maze, { deadEndCount: 0, splitCount: 0, edgeWrapCount: 0 }).total).toBe(flat);
    expect(measureGeometryBudgetProxy(maze, { deadEndCount: 3, splitCount: 0, edgeWrapCount: 0 }).total).toBe(flat + 2);
  });
});

describe('geometry budget candidate seeds', () => {
  test('are deterministic, distinct per candidate and per level, and not seed + j', () => {
    expect(resolveGeometryBudgetCandidateSeed(1234, 9, 3)).toBe(resolveGeometryBudgetCandidateSeed(1234, 9, 3));
    const seen = new Set<number>();
    for (let level = 2; level <= LAST_BUDGET_LEVEL; level += 1) {
      for (let index = 0; index < 32; index += 1) {
        const seed = resolveGeometryBudgetCandidateSeed(1234, level, index);
        expect(Number.isInteger(seed) && seed >= 0 && seed <= 0xffffffff).toBe(true);
        seen.add(seed);
      }
    }
    expect(seen.size).toBe((LAST_BUDGET_LEVEL - 1) * 32);
    // Adjacent play seeds (consecutive levels step the seed by one) must not
    // share candidates the way seed + j would.
    const a = new Set(Array.from({ length: 32 }, (_, j) => resolveGeometryBudgetCandidateSeed(1000, 5, j)));
    const b = Array.from({ length: 32 }, (_, j) => resolveGeometryBudgetCandidateSeed(1001, 5, j));
    expect(b.filter((seed) => a.has(seed))).toEqual([]);
  });
});

describe('continuous difficulty function D(level)', () => {
  test('T(N) rises by exactly the step bound from START and flattens at CEILING', () => {
    expect(GEOMETRY_BUDGET_TARGET_STEP).toBe(5);
    expect(resolveGeometryBudgetTarget(2)).toBe(GEOMETRY_BUDGET_START);
    // The last ramp step is a full step: CEILING sits exactly on the step grid.
    expect((GEOMETRY_BUDGET_CEILING - GEOMETRY_BUDGET_START) % GEOMETRY_BUDGET_TARGET_STEP).toBe(0);
    let largestStep = 0;
    for (let level = 3; level <= LAST_BUDGET_LEVEL; level += 1) {
      const step = resolveGeometryBudgetTarget(level)! - resolveGeometryBudgetTarget(level - 1)!;
      largestStep = Math.max(largestStep, step);
      if (level <= GEOMETRY_BUDGET_SATURATION_LEVEL) {
        expect(step).toBe(GEOMETRY_BUDGET_TARGET_STEP);
      } else {
        expect(step).toBe(0);
      }
    }
    // Hard per-level bound: well under the previous ladder's ~40 worst target
    // step and the ~73 band-switch cliff at level 31.
    expect(largestStep).toBe(GEOMETRY_BUDGET_TARGET_STEP);
    expect(resolveGeometryBudgetTarget(GEOMETRY_BUDGET_SATURATION_LEVEL)).toBe(GEOMETRY_BUDGET_CEILING);
    expect(resolveGeometryBudgetTarget(GEOMETRY_BUDGET_SATURATION_LEVEL - 1))
      .toBe(GEOMETRY_BUDGET_CEILING - GEOMETRY_BUDGET_TARGET_STEP);
    expect(resolveGeometryBudgetTarget(1)).toBeNull();
    expect(resolveGeometryBudgetTarget(LAST_BUDGET_LEVEL + 1)).toBeNull();
    expect(resolveGeometryBudgetTarget(Number.NaN)).toBeNull();
  });

  test('the saturation level is derived from the data, inside the bounded range', () => {
    expect(GEOMETRY_BUDGET_SATURATION_LEVEL)
      .toBe(2 + ((GEOMETRY_BUDGET_CEILING - GEOMETRY_BUDGET_START) / GEOMETRY_BUDGET_TARGET_STEP));
    expect(GEOMETRY_BUDGET_SATURATION_LEVEL).toBe(54);
    expect(GEOMETRY_BUDGET_SATURATION_LEVEL).toBeLessThan(LAST_BUDGET_LEVEL);
  });

  test('the baked rung table covers 2..saturation, never decreases and stays on the tape', () => {
    expect(Object.keys(GEOMETRY_BUDGET_RUNGS_BY_LEVEL).map(Number)).toEqual(
      Array.from({ length: GEOMETRY_BUDGET_SATURATION_LEVEL - 1 }, (_, index) => index + 2)
    );
    let previous = 0;
    for (let level = 2; level <= GEOMETRY_BUDGET_SATURATION_LEVEL; level += 1) {
      const rungs = GEOMETRY_BUDGET_RUNGS_BY_LEVEL[level]!;
      expect(Number.isInteger(rungs)).toBe(true);
      expect(rungs).toBeGreaterThanOrEqual(previous);
      expect(rungs).toBeLessThanOrEqual(GEOMETRY_BUDGET_TAPE_LENGTH);
      previous = rungs;
    }
    expect(GEOMETRY_BUDGET_RUNGS_BY_LEVEL[2]).toBe(0);
    // Past saturation the content is frozen: the same rung count, every level.
    for (const level of [GEOMETRY_BUDGET_SATURATION_LEVEL, 60, LAST_BUDGET_LEVEL, 100, 5000]) {
      expect(resolveGeometryBudgetRungCount(level)).toBe(GEOMETRY_BUDGET_RUNGS_BY_LEVEL[GEOMETRY_BUDGET_SATURATION_LEVEL]);
    }
  });

  test('plateau levels share one profile except for the gate key', () => {
    for (let level = GEOMETRY_BUDGET_SATURATION_LEVEL; level <= LAST_BUDGET_LEVEL; level += 1) {
      expect(withoutGateKey(level)).toEqual(withoutGateKey(GEOMETRY_BUDGET_SATURATION_LEVEL));
    }
    expect(withoutGateKey(GEOMETRY_BUDGET_SATURATION_LEVEL - 1)).not.toEqual(withoutGateKey(GEOMETRY_BUDGET_SATURATION_LEVEL));
  });

  test('the accept window is narrower than half the step, so accepted candidates cannot invert', () => {
    expect(2 * GEOMETRY_BUDGET_ACCEPT_HALF_WIDTH).toBeLessThan(GEOMETRY_BUDGET_TARGET_STEP);
  });

  test('past the ceiling difficulty is handed to the hazard budget, never silently flat', () => {
    expect(resolveContinuousDifficulty(1)).toEqual({
      level: 1, regime: 'corridor', geometryTarget: null, geometryRungs: 0, geometrySaturated: false, hazardBudgetLevels: 0
    });
    const ramp = resolveContinuousDifficulty(GEOMETRY_BUDGET_SATURATION_LEVEL - 1);
    expect(ramp).toMatchObject({ regime: 'ramp', geometrySaturated: false, hazardBudgetLevels: 0 });
    const atCeiling = resolveContinuousDifficulty(GEOMETRY_BUDGET_SATURATION_LEVEL);
    expect(atCeiling).toMatchObject({
      regime: 'plateau', geometryTarget: GEOMETRY_BUDGET_CEILING, geometrySaturated: true, hazardBudgetLevels: 0
    });
    let previousHazard = -1;
    for (const level of [GEOMETRY_BUDGET_SATURATION_LEVEL, 60, 99, 100, 101, 150, 1_000_000]) {
      const difficulty = resolveContinuousDifficulty(level);
      expect(difficulty.geometryTarget).toBe(GEOMETRY_BUDGET_CEILING);
      expect(difficulty.geometryRungs).toBe(atCeiling.geometryRungs);
      expect(difficulty.hazardBudgetLevels).toBe(level - GEOMETRY_BUDGET_SATURATION_LEVEL);
      expect(difficulty.hazardBudgetLevels).toBeGreaterThan(previousHazard);
      previousHazard = difficulty.hazardBudgetLevels;
    }
    // Exactly +1 owed hazard level per completed level, with no cycle or cap.
    expect(resolveContinuousDifficulty(151).hazardBudgetLevels - resolveContinuousDifficulty(150).hazardBudgetLevels).toBe(1);
    // Total over bad input.
    expect(resolveContinuousDifficulty(Number.NaN).regime).toBe('corridor');
    expect(resolveContinuousDifficulty(-5).regime).toBe('corridor');
  });

  test('baked calibration still describes freshly generated mazes (spot check; the full recomputation is the script --check)', () => {
    // Each spot-checked level's ungated pool must be within the widest rung gap
    // of its target: a reordered tape or a changed generator fails this.
    for (const level of [2, 14, 27, 44, GEOMETRY_BUDGET_SATURATION_LEVEL]) {
      const { geometryBudgetLevel: _ignored, ...profile } = resolveGeometryBudgetProfile(level);
      void _ignored;
      const values: number[] = [];
      [23 / 51, 45 / 27, 1].forEach((aspectRatio, boardIndex) => {
        for (let index = 0; index < 14; index += 1) {
          const seed = resolveGeometryBudgetCandidateSeed(910 + index, 1000 + level, boardIndex);
          const maze = createLegacyRuntimeMazeForMode('play', 35, seed, profile, {}, aspectRatio);
          values.push(measureGeometryBudgetProxy(maze, resolveLegacyMazeComplexity(maze)).total);
        }
      });
      const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
      expect(Math.abs(mean - resolveGeometryBudgetTarget(level)!)).toBeLessThan(26);
    }
  }, 120_000);
});
