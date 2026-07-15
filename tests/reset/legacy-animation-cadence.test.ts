import { describe, expect, test } from 'vitest';
import {
  LEGACY_ANIMATION_CADENCE_VERSION,
  LEGACY_MAZE_REVEAL_STRATEGY_VERSION,
  LEGACY_TRAIL_SHINE_CYCLE_PERIOD_MS,
  LEGACY_TRAIL_SHINE_ONE_WAY_PERIOD_MS,
  buildLegacyMazeRevealOrder,
  resolveLegacyTrailShineMotion,
  summarizeLegacyMazeRevealOrder
} from '../../src/legacy-runtime/legacyAnimationCadence';

describe('legacy animation cadence', () => {
  test('uses the reduced-motion trail shine cadence', () => {
    expect(LEGACY_ANIMATION_CADENCE_VERSION).toBe('legacy-animation-cadence-v2');
    expect(LEGACY_TRAIL_SHINE_ONE_WAY_PERIOD_MS).toBe(8000);
    expect(LEGACY_TRAIL_SHINE_CYCLE_PERIOD_MS).toBe(16000);
  });

  test('moves one shine from player to origin and continuously back to the player', () => {
    const samples = [
      resolveLegacyTrailShineMotion({ timeMs: 0, trailLength: 11 }),
      resolveLegacyTrailShineMotion({ timeMs: LEGACY_TRAIL_SHINE_ONE_WAY_PERIOD_MS, trailLength: 11 }),
      resolveLegacyTrailShineMotion({ timeMs: LEGACY_TRAIL_SHINE_ONE_WAY_PERIOD_MS + 1, trailLength: 11 }),
      resolveLegacyTrailShineMotion({ timeMs: LEGACY_TRAIL_SHINE_CYCLE_PERIOD_MS - 1, trailLength: 11 }),
      resolveLegacyTrailShineMotion({ timeMs: LEGACY_TRAIL_SHINE_CYCLE_PERIOD_MS, trailLength: 11 })
    ];

    expect(samples[0]).toMatchObject({
      cadenceVersion: LEGACY_ANIMATION_CADENCE_VERSION,
      centerIndex: 10,
      direction: 'away-from-player',
      distanceProgress: 0
    });
    expect(samples[1]).toMatchObject({
      centerIndex: 0,
      direction: 'away-from-player',
      distanceProgress: 1
    });
    expect(samples[2]?.direction).toBe('toward-player');
    expect(samples[2]?.centerIndex).toBeCloseTo(samples[1]?.centerIndex ?? 0, 2);
    expect(samples[3]?.centerIndex).toBeCloseTo(samples[4]?.centerIndex ?? 0, 2);
    expect(samples[4]).toMatchObject({
      centerIndex: 10,
      direction: 'away-from-player',
      distanceProgress: 0
    });
    expect(samples[0]?.speedTilesPerSecond).toBeCloseTo(10 / 8, 5);
  });

  test('scales shine speed with the live trail length while preserving one-way timing', () => {
    const short = resolveLegacyTrailShineMotion({ timeMs: 4000, trailLength: 5 });
    const long = resolveLegacyTrailShineMotion({ timeMs: 4000, trailLength: 21 });

    expect(short.distanceProgress).toBe(0.5);
    expect(long.distanceProgress).toBe(0.5);
    expect(long.speedTilesPerSecond).toBe(short.speedTilesPerSecond * 5);
    expect(long.oneWayPeriodMs).toBe(LEGACY_TRAIL_SHINE_ONE_WAY_PERIOD_MS);
    expect(long.cyclePeriodMs).toBe(LEGACY_TRAIL_SHINE_CYCLE_PERIOD_MS);
  });

  test('interleaves non-solution floors before the solved route can be revealed', () => {
    const grid = Array.from({ length: 5 }, () => Array.from({ length: 5 }, () => false));
    const solutionPath = [
      { x: 0, y: 2 },
      { x: 1, y: 2 },
      { x: 2, y: 2 },
      { x: 3, y: 2 },
      { x: 4, y: 2 }
    ];
    const branches = [
      { x: 0, y: 1 },
      { x: 1, y: 1 },
      { x: 3, y: 3 },
      { x: 4, y: 3 }
    ];
    for (const point of [...solutionPath, ...branches]) {
      grid[point.y]![point.x] = true;
    }

    const order = buildLegacyMazeRevealOrder({
      generationBuildTrace: {
        start: solutionPath[0]!,
        finalGoal: solutionPath.at(-1)!,
        pathTiles: [...solutionPath, ...branches],
        shortcutTiles: [],
        reinforcementShortcutTiles: []
      },
      grid,
      size: 5,
      solutionPath,
      start: solutionPath[0]!
    });
    const summary = summarizeLegacyMazeRevealOrder(order, solutionPath);

    expect(order).toHaveLength(solutionPath.length + branches.length);
    expect(new Set(order.map((point) => `${point.x},${point.y}`)).size).toBe(order.length);
    expect(order[0]).toEqual(solutionPath[0]);
    expect(order[1]).toEqual(branches[0]);
    expect(summary).toMatchObject({
      solutionFirstRevealPrevented: true,
      solutionPrefixLength: 1,
      strategyVersion: LEGACY_MAZE_REVEAL_STRATEGY_VERSION,
      tileCount: 9
    });
    expect(summary.nonSolutionTileCountBeforeSolutionComplete).toBeGreaterThan(0);
    expect(summary.solutionCompletedAtIndex).toBeGreaterThan(solutionPath.length - 1);
  });
});
