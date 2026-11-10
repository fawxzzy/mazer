import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { createLegacyRuntimeMazeForMode } from '../../src/legacy-runtime/legacyGenerationLifecycle';
import {
  GEOMETRY_BUDGET_BASE_CANDIDATES,
  GEOMETRY_BUDGET_CEILING,
  GEOMETRY_BUDGET_MIN_STEP,
  GEOMETRY_BUDGET_SATURATION_LEVEL,
  GEOMETRY_BUDGET_STYLE_BANDS,
  GEOMETRY_BUDGET_WRAP_FADE_FROM_LEVEL,
  GEOMETRY_BUDGET_WRAP_FADE_TO_LEVEL,
  GEOMETRY_BUDGET_TOP_TARGET,
  GEOMETRY_BUDGET_TAIL_STEP,
  GEOMETRY_BUDGET_TAPE,
  GEOMETRY_BUDGET_WINDOW,
  LAST_BUDGET_LEVEL,
  measureGeometryBudgetProxy,
  resolveContinuousDifficulty,
  resolveGeometryBudgetCandidateSeed,
  resolveGeometryBudgetForks,
  resolveGeometryBudgetMaxBranch,
  resolveGeometryBudgetRouteBranch,
  resolveGeometryBudgetProfile,
  resolveGeometryBudgetProfileForRungs,
  resolveGeometryBudgetRouteTarget,
  resolveGeometryBudgetRungCount,
  resolveGeometryBudgetSchedule,
  resolveGeometryBudgetTarget
} from '../../src/legacy-runtime/legacyGeometryBudget';
import { measurePricedFeltSteps } from '../../src/legacy-runtime/legacyMazeFeltDifficulty';
import { normalizeLegacyMazeGenerationProfile } from '../../src/legacy-runtime/legacyMaze';

describe('geometry budget style bands', () => {
  test('the tape is two wrap corridors and the bands pick how many a level owns', () => {
    expect(GEOMETRY_BUDGET_TAPE).toEqual(['wrap:v', 'wrap:h']);
    expect(GEOMETRY_BUDGET_STYLE_BANDS[0]).toEqual({ fromLevel: 2, rungs: 0 });
    let previous = -1;
    for (const band of GEOMETRY_BUDGET_STYLE_BANDS) {
      expect(band.fromLevel).toBeGreaterThan(previous);
      expect(band.rungs).toBeGreaterThanOrEqual(0);
      expect(band.rungs).toBeLessThanOrEqual(GEOMETRY_BUDGET_TAPE.length);
      previous = band.fromLevel;
    }
    expect(resolveGeometryBudgetRungCount(2)).toBe(0);
    expect(resolveGeometryBudgetRungCount(10)).toBe(1);
    expect(resolveGeometryBudgetRungCount(30)).toBe(2);
    expect(resolveGeometryBudgetRungCount(119)).toBe(2);
    // The band is the MOST a level owns: it keeps both rungs through the fade (a seeded roll takes
    // them away gradually, see legacy-wrap-fade.test.ts) and owns none from the fade end, because
    // the top of the ladder uses plain bases: the wrap corridors cost felt headroom.
    expect(resolveGeometryBudgetRungCount(GEOMETRY_BUDGET_WRAP_FADE_TO_LEVEL - 1)).toBe(2);
    expect(resolveGeometryBudgetRungCount(GEOMETRY_BUDGET_WRAP_FADE_TO_LEVEL)).toBe(0);
    expect(GEOMETRY_BUDGET_WRAP_FADE_FROM_LEVEL).toBeLessThan(GEOMETRY_BUDGET_WRAP_FADE_TO_LEVEL);
    expect(GEOMETRY_BUDGET_STYLE_BANDS[GEOMETRY_BUDGET_STYLE_BANDS.length - 1]).toEqual({ fromLevel: GEOMETRY_BUDGET_WRAP_FADE_TO_LEVEL, rungs: 0 });
    expect(resolveGeometryBudgetRungCount(LAST_BUDGET_LEVEL)).toBe(0);
    expect(resolveGeometryBudgetRungCount(1_000_000)).toBe(0);
  });

  test('profiles carry no layout key, fixed base knobs and the gate key', () => {
    for (let level = 2; level <= LAST_BUDGET_LEVEL; level += 1) {
      const profile = resolveGeometryBudgetProfile(level);
      expect(Object.prototype.hasOwnProperty.call(profile, 'layout')).toBe(false);
      expect(profile.geometryBudgetLevel).toBe(level);
      expect(profile.straightnessBias).toBe(0.8);
      expect(profile.shortcutCountMultiplier).toBe(0);
      expect(profile.routeQualityReinforcementMultiplier).toBe(0);
      expect(profile.minCheckpoints).toBe(1);
      expect(profile.checkpointCountOverride).toBe(1);
      expect(profile.maxDeadEndCount).toBe(0);
      expect(profile.borderFeederTargetPerSide).toBe(0);
    }
    expect(resolveGeometryBudgetProfile(2).requiredOppositeBorderConnections).toEqual({ horizontal: false, vertical: false });
    expect(resolveGeometryBudgetProfile(15).requiredOppositeBorderConnections).toEqual({ horizontal: false, vertical: true });
    expect(resolveGeometryBudgetProfile(60).requiredOppositeBorderConnections).toEqual({ horizontal: true, vertical: true });
    // An ungated rung profile has no gate key at all; more rungs than exist clamp.
    expect(Object.prototype.hasOwnProperty.call(resolveGeometryBudgetProfileForRungs(1), 'geometryBudgetLevel')).toBe(false);
    expect(resolveGeometryBudgetProfileForRungs(99)).toEqual(resolveGeometryBudgetProfileForRungs(GEOMETRY_BUDGET_TAPE.length));
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
    const mutated = resolveGeometryBudgetProfile(60);
    mutated.requiredOppositeBorderConnections.horizontal = false;
    expect(resolveGeometryBudgetProfile(60).requiredOppositeBorderConnections.horizontal).toBe(true);
  });

  test('module source is free of ambient nondeterminism', () => {
    for (const file of ['legacyGeometryBudget', 'legacyMazeFeltTuning', 'legacyMazeFeltDifficulty']) {
      const source = readFileSync(new URL(`../../src/legacy-runtime/${file}.ts`, import.meta.url), 'utf8');
      expect(source).not.toMatch(/Math\.random|Date\.now|new Date|performance\.now/);
    }
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

describe('geometry budget proxy (secondary H1 guard)', () => {
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
  test('the schedule is a felt-step target that rises by at least window + 1 per level and flattens at CEILING', () => {
    expect(GEOMETRY_BUDGET_WINDOW).toBe(1);
    expect(GEOMETRY_BUDGET_MIN_STEP).toBe(GEOMETRY_BUDGET_WINDOW + 1);
    expect(GEOMETRY_BUDGET_TAIL_STEP).toBeGreaterThanOrEqual(GEOMETRY_BUDGET_MIN_STEP);
    expect(resolveGeometryBudgetTarget(2)).toBe(89);
    let maxStep = 0;
    for (let level = 3; level <= LAST_BUDGET_LEVEL; level += 1) {
      const step = resolveGeometryBudgetTarget(level)! - resolveGeometryBudgetTarget(level - 1)!;
      if (level < GEOMETRY_BUDGET_SATURATION_LEVEL) {
        expect(step).toBeGreaterThanOrEqual(GEOMETRY_BUDGET_MIN_STEP);
      }
      maxStep = Math.max(maxStep, step);
    }
    // The early steep part is the largest step anywhere; the tail is the minimum step.
    expect(maxStep).toBeLessThanOrEqual(27);
    expect(resolveGeometryBudgetTarget(GEOMETRY_BUDGET_SATURATION_LEVEL)).toBe(GEOMETRY_BUDGET_TOP_TARGET);
    expect(resolveGeometryBudgetTarget(GEOMETRY_BUDGET_SATURATION_LEVEL - 1)).toBeLessThan(GEOMETRY_BUDGET_TOP_TARGET);
    expect(resolveGeometryBudgetTarget(1)).toBeNull();
    expect(resolveGeometryBudgetTarget(LAST_BUDGET_LEVEL + 1)).toBeNull();
    expect(resolveGeometryBudgetTarget(Number.NaN)).toBeNull();
    // Past the knee the schedule is the plain tail.
    expect(resolveGeometryBudgetSchedule(41) - resolveGeometryBudgetSchedule(40)).toBe(GEOMETRY_BUDGET_TAIL_STEP);
    expect(resolveGeometryBudgetSchedule(36)).toBe(435);
  });

  test('the saturation level is derived from the data and is the last bounded level', () => {
    expect(resolveGeometryBudgetSchedule(GEOMETRY_BUDGET_SATURATION_LEVEL)).toBeLessThanOrEqual(GEOMETRY_BUDGET_CEILING);
    expect(resolveGeometryBudgetSchedule(GEOMETRY_BUDGET_SATURATION_LEVEL + 1)).toBeGreaterThan(GEOMETRY_BUDGET_CEILING);
    expect(GEOMETRY_BUDGET_TOP_TARGET).toBe(resolveGeometryBudgetSchedule(GEOMETRY_BUDGET_SATURATION_LEVEL));
    expect(LAST_BUDGET_LEVEL).toBe(GEOMETRY_BUDGET_SATURATION_LEVEL);
    // Measured hard ceiling of the frozen board (see scripts/analysis/generate-geometry-budget-targets.ts).
    expect(GEOMETRY_BUDGET_CEILING).toBe(760);
    expect(GEOMETRY_BUDGET_SATURATION_LEVEL).toBe(198);
    expect(GEOMETRY_BUDGET_TOP_TARGET).toBe(759);
  });

  test('route target and branch cap rise with the level and stay inside their budgets', () => {
    let previousRoute = -1;
    let previousBranch = -1;
    for (let level = 2; level <= LAST_BUDGET_LEVEL; level += 1) {
      const route = resolveGeometryBudgetRouteTarget(level);
      const branch = resolveGeometryBudgetMaxBranch(level);
      expect(route).toBeGreaterThanOrEqual(previousRoute);
      expect(branch).toBeGreaterThanOrEqual(previousBranch);
      expect(route).toBeLessThan(resolveGeometryBudgetTarget(level)!);
      expect(branch).toBeGreaterThanOrEqual(8);
      expect(branch).toBeLessThanOrEqual(40);
      previousRoute = route;
      previousBranch = branch;
    }
    // Forks on the route (and their length) also rise, within the calibration's bounds.
    let previousForks = -1;
    let previousFork = -1;
    for (let level = 2; level <= LAST_BUDGET_LEVEL; level += 1) {
      const forks = resolveGeometryBudgetForks(level);
      const forkLength = resolveGeometryBudgetRouteBranch(level);
      expect(forks).toBeGreaterThanOrEqual(previousForks);
      expect(forkLength).toBeGreaterThanOrEqual(previousFork);
      expect(forkLength).toBeLessThanOrEqual(resolveGeometryBudgetMaxBranch(level));
      previousForks = forks;
      previousFork = forkLength;
    }
    expect(resolveGeometryBudgetForks(LAST_BUDGET_LEVEL)).toBeLessThanOrEqual(30);
    expect(resolveGeometryBudgetRouteBranch(LAST_BUDGET_LEVEL)).toBeLessThanOrEqual(16);
    // The calibration script samples capacity at route target 300 / branch cap 40
    // / fork length 16 / 30 forks.
    expect(resolveGeometryBudgetRouteTarget(LAST_BUDGET_LEVEL)).toBeLessThanOrEqual(300);
    expect(resolveGeometryBudgetMaxBranch(LAST_BUDGET_LEVEL)).toBe(40);
    expect(resolveGeometryBudgetRouteTarget(500)).toBe(resolveGeometryBudgetRouteTarget(LAST_BUDGET_LEVEL));
  });

  test('the accept window is narrower than the step, so tuned mazes of adjacent levels cannot tie or invert', () => {
    expect(GEOMETRY_BUDGET_WINDOW).toBeLessThan(GEOMETRY_BUDGET_MIN_STEP);
    expect(GEOMETRY_BUDGET_BASE_CANDIDATES).toBeGreaterThanOrEqual(8);
  });

  test('past the ceiling difficulty is handed to the hazard budget, never silently flat', () => {
    expect(resolveContinuousDifficulty(1)).toEqual({
      level: 1, regime: 'corridor', geometryTarget: null, geometryRungs: 0, geometrySaturated: false, hazardBudgetLevels: 0
    });
    const ramp = resolveContinuousDifficulty(GEOMETRY_BUDGET_SATURATION_LEVEL - 1);
    expect(ramp).toMatchObject({ regime: 'ramp', geometrySaturated: false, hazardBudgetLevels: 0 });
    const atCeiling = resolveContinuousDifficulty(GEOMETRY_BUDGET_SATURATION_LEVEL);
    expect(atCeiling).toMatchObject({
      regime: 'plateau', geometryTarget: GEOMETRY_BUDGET_TOP_TARGET, geometrySaturated: true, hazardBudgetLevels: 0
    });
    let previousHazard = -1;
    for (const level of [GEOMETRY_BUDGET_SATURATION_LEVEL, GEOMETRY_BUDGET_SATURATION_LEVEL + 1, 300, 500, 1_000_000]) {
      const difficulty = resolveContinuousDifficulty(level);
      expect(difficulty.geometryTarget).toBe(GEOMETRY_BUDGET_TOP_TARGET);
      expect(difficulty.geometryRungs).toBe(atCeiling.geometryRungs);
      expect(difficulty.hazardBudgetLevels).toBe(level - GEOMETRY_BUDGET_SATURATION_LEVEL);
      expect(difficulty.hazardBudgetLevels).toBeGreaterThan(previousHazard);
      previousHazard = difficulty.hazardBudgetLevels;
    }
    expect(resolveContinuousDifficulty(301).hazardBudgetLevels - resolveContinuousDifficulty(300).hazardBudgetLevels).toBe(1);
    let previousTarget = 0;
    for (let level = 2; level < GEOMETRY_BUDGET_SATURATION_LEVEL; level += 1) {
      const difficulty = resolveContinuousDifficulty(level);
      expect(difficulty.regime).toBe('ramp');
      expect(difficulty.hazardBudgetLevels).toBe(0);
      expect(difficulty.geometryTarget!).toBeGreaterThan(previousTarget);
      previousTarget = difficulty.geometryTarget!;
    }
    expect(resolveContinuousDifficulty(Number.NaN).regime).toBe('corridor');
    expect(resolveContinuousDifficulty(-5).regime).toBe('corridor');
  });

  test('freshly generated mazes land in [T, T + window] (spot check; the ladder tests sweep every level)', () => {
    for (const level of [2, 14, 27, 44, 100, 180, GEOMETRY_BUDGET_SATURATION_LEVEL]) {
      const profile = resolveGeometryBudgetProfile(level);
      [23 / 51, 45 / 27].forEach((aspectRatio, boardIndex) => {
        for (let index = 0; index < 4; index += 1) {
          const seed = resolveGeometryBudgetCandidateSeed(910 + index, 1000 + level, boardIndex);
          const maze = createLegacyRuntimeMazeForMode('play', 35, seed, profile, {}, aspectRatio);
          const felt = measurePricedFeltSteps(maze);
          const target = resolveGeometryBudgetTarget(level)!;
          expect(felt).toBeGreaterThanOrEqual(target);
          expect(felt).toBeLessThanOrEqual(target + GEOMETRY_BUDGET_WINDOW);
        }
      });
    }
  }, 120_000);
});
