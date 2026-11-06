import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import {
  computeGeometryBudgetTargets,
  GEOMETRY_BUDGET_CALIBRATION
} from '../../scripts/analysis/generate-geometry-budget-targets';
import {
  GEOMETRY_BUDGET_ACCEPT_HALF_WIDTH,
  GEOMETRY_BUDGET_TAPE,
  GEOMETRY_BUDGET_TAPE_CEILING_LEVEL,
  GEOMETRY_BUDGET_TARGET_MIN_STEP,
  GEOMETRY_BUDGET_TARGETS,
  LAST_BUDGET_LEVEL,
  measureGeometryBudgetProxy,
  resolveGeometryBudgetCandidateSeed,
  resolveGeometryBudgetProfile,
  resolveGeometryBudgetRungCount,
  resolveGeometryBudgetTarget
} from '../../src/legacy-runtime/legacyGeometryBudget';
import { normalizeLegacyMazeGenerationProfile } from '../../src/legacy-runtime/legacyMaze';

const withoutGateKey = (level: number) => {
  const { geometryBudgetLevel: _ignored, ...rest } = resolveGeometryBudgetProfile(level);
  void _ignored;
  return rest;
};

describe('geometry budget tape', () => {
  test('level N owns exactly min(N - 1, tape length) rungs', () => {
    expect(GEOMETRY_BUDGET_TAPE.length).toBe(39);
    expect(GEOMETRY_BUDGET_TAPE_CEILING_LEVEL).toBe(40);
    for (let level = 1; level <= 60; level += 1) {
      expect(resolveGeometryBudgetRungCount(level)).toBe(Math.min(39, level - 1));
    }
  });

  test('is strict: adjacent levels differ until the tape ceiling, then stay equal', () => {
    for (let level = 2; level < GEOMETRY_BUDGET_TAPE_CEILING_LEVEL; level += 1) {
      expect(withoutGateKey(level)).not.toEqual(withoutGateKey(level + 1));
    }
    for (let level = GEOMETRY_BUDGET_TAPE_CEILING_LEVEL; level <= 60; level += 1) {
      expect(withoutGateKey(level)).toEqual(withoutGateKey(GEOMETRY_BUDGET_TAPE_CEILING_LEVEL));
    }
  });

  test('is nested: level N+1 differs from level N by exactly one rung', () => {
    for (let level = 2; level < GEOMETRY_BUDGET_TAPE_CEILING_LEVEL; level += 1) {
      const before = withoutGateKey(level);
      const after = withoutGateKey(level + 1);
      const changedFields = (Object.keys(after) as (keyof typeof after)[])
        .filter((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]));
      expect(changedFields.length).toBeGreaterThan(0);
      // One rung touches at most one structural dimension (a wrap rung can also
      // set the feeder count, so allow the wrap pair).
      const dimensions = new Set(changedFields.map((key) => (
        key === 'borderFeederTargetPerSide' || key === 'requiredOppositeBorderConnections'
          ? 'wrap'
          : key === 'checkpointCountOverride' || key === 'checkpointCountMultiplier'
            ? 'branch'
            : key
      )));
      expect(dimensions.size).toBe(1);
    }
  });

  test('each structure dimension only ever grows along the tape', () => {
    let previous = resolveGeometryBudgetProfile(2);
    for (let level = 3; level <= GEOMETRY_BUDGET_TAPE_CEILING_LEVEL; level += 1) {
      const next = resolveGeometryBudgetProfile(level);
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
      previous = next;
    }
  });

  test('matches the measured tape order and unlock positions', () => {
    const labels = GEOMETRY_BUDGET_TAPE.map((rung) => rung.label);
    expect(labels.slice(0, 8)).toEqual([
      'branch:2', 'branch:3', 'dead:1', 'dead:2', 'wrap:h', 'branch:4', 'wrap:v', 'dead:3'
    ]);
    expect(labels[labels.length - 1]).toBe('branch:m1.6');
    // First appearance (level = rung index + 2): branches, dead ends, then wraps.
    expect(2 + labels.findIndex((label) => label.startsWith('branch'))).toBe(2);
    expect(2 + labels.findIndex((label) => label.startsWith('dead'))).toBe(4);
    expect(2 + labels.findIndex((label) => label.startsWith('wrap'))).toBe(6);
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
    expect(resolveGeometryBudgetProfile(2).checkpointCountOverride).toBe(2);
    expect(resolveGeometryBudgetProfile(2).requiredOppositeBorderConnections).toEqual({ horizontal: false, vertical: false });
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
    const mutated = resolveGeometryBudgetProfile(20);
    mutated.requiredOppositeBorderConnections.horizontal = false;
    expect(resolveGeometryBudgetProfile(20).requiredOppositeBorderConnections.horizontal).toBe(true);
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
    expect(seen.size).toBe(29 * 32);
    // Adjacent play seeds (consecutive levels step the seed by one) must not
    // share candidates the way seed + j would.
    const a = new Set(Array.from({ length: 32 }, (_, j) => resolveGeometryBudgetCandidateSeed(1000, 5, j)));
    const b = Array.from({ length: 32 }, (_, j) => resolveGeometryBudgetCandidateSeed(1001, 5, j));
    expect(b.filter((seed) => a.has(seed))).toEqual([]);
  });
});

describe('geometry budget baked targets T(N)', () => {
  test('cover exactly levels 2..LAST_BUDGET_LEVEL and are strictly increasing by at least the minimum step', () => {
    expect(Object.keys(GEOMETRY_BUDGET_TARGETS).map(Number)).toEqual(
      Array.from({ length: LAST_BUDGET_LEVEL - 1 }, (_, index) => index + 2)
    );
    for (let level = 3; level <= LAST_BUDGET_LEVEL; level += 1) {
      expect(GEOMETRY_BUDGET_TARGETS[level]! - GEOMETRY_BUDGET_TARGETS[level - 1]!)
        .toBeGreaterThanOrEqual(GEOMETRY_BUDGET_TARGET_MIN_STEP);
    }
    expect(resolveGeometryBudgetTarget(1)).toBeNull();
    expect(resolveGeometryBudgetTarget(LAST_BUDGET_LEVEL + 1)).toBeNull();
    expect(resolveGeometryBudgetTarget(2)).toBe(GEOMETRY_BUDGET_TARGETS[2]);
  });

  test('the accept window is narrower than half the minimum step, so accepted candidates cannot invert', () => {
    expect(2 * GEOMETRY_BUDGET_ACCEPT_HALF_WIDTH).toBeLessThan(GEOMETRY_BUDGET_TARGET_MIN_STEP);
  });

  test('do not drift from a fresh calibration (regenerate with scripts/analysis/generate-geometry-budget-targets.ts --write)', () => {
    expect(GEOMETRY_BUDGET_CALIBRATION.scale).toBe(35);
    const { targets } = computeGeometryBudgetTargets();
    expect(targets).toEqual(GEOMETRY_BUDGET_TARGETS);
  }, 240_000);
});
