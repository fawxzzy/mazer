import { describe, expect, test } from 'vitest';
import {
  GEOMETRY_BUDGET_CEILING,
  GEOMETRY_BUDGET_WRAP_BASE_ATTEMPTS,
  GEOMETRY_BUDGET_WRAP_FADE_FROM_LEVEL,
  GEOMETRY_BUDGET_WRAP_FADE_TO_LEVEL,
  LAST_BUDGET_LEVEL,
  resolveGeometryBudgetProfileForRungs,
  resolveGeometryBudgetRungCount,
  resolveGeometryBudgetTarget,
  resolveGeometryBudgetWrapRungs
} from '../../src/legacy-runtime/legacyGeometryBudget';
import { createLegacyRuntimeMazeForMode } from '../../src/legacy-runtime/legacyGenerationLifecycle';
import { measureFelt, measurePricedFeltSteps } from '../../src/legacy-runtime/legacyMazeFeltDifficulty';
import {
  FELT_WRAP_PRICE_PERCENT,
  tuneMazeFeltToTarget
} from '../../src/legacy-runtime/legacyMazeFeltTuning';
import { LEGACY_EMPTY_LOOP_PLAN, createPlanarNeighbors } from '../../src/legacy-runtime/legacyMazeLoops';
import { resolveLegacyPlayableShortestPath } from '../../src/legacy-runtime/legacyMaze';
import { advanceDemoWalker, createDemoWalkerState } from '../../src/domain/ai';
import { createLegacyDemoWalkerEpisode, createLegacyMenuDemoWalkerConfig } from '../../src/legacy-runtime/legacyDemoWalker';
import {
  generateLadderMaze,
  hashLadderMaze,
  LADDER_BOARDS,
  sampleLevel,
  seedForIndex
} from '../../scripts/analysis/lib/progressionLadderSampling';

const FROM = GEOMETRY_BUDGET_WRAP_FADE_FROM_LEVEL;
const TO = GEOMETRY_BUDGET_WRAP_FADE_TO_LEVEL;
const SEEDS = Array.from({ length: 400 }, (_, index) => seedForIndex(index));

type Generated = ReturnType<typeof generateLadderMaze>;

// Independent measure of a maze's shortest route over the finished grid: with or without the
// wrap links, with the loop connector cells closed (they are the first `loopStats.cells`
// entries of the build trace's decoy tiles).
const routeLength = (maze: Generated, wrap: boolean, closeLoops: boolean): number => {
  const { width, height } = maze;
  const closed = new Set<number>();
  if (closeLoops && maze.loopStats !== undefined) {
    maze.generationBuildTrace!.decoyTiles!.slice(0, maze.loopStats.cells).forEach((tile) => closed.add((tile.y * width) + tile.x));
  }
  const open = (x: number, y: number): boolean => maze.grid[y]![x] === true && !closed.has((y * width) + x);
  const dist = new Map<number, number>();
  const start = (maze.start.y * width) + maze.start.x;
  const goal = (maze.goal.y * width) + maze.goal.x;
  dist.set(start, 0);
  const queue = [start];
  for (let head = 0; head < queue.length; head += 1) {
    const cell = queue[head]!;
    if (cell === goal) { return dist.get(cell)!; }
    const x = cell % width;
    const y = (cell - x) / width;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      let nx = x + dx;
      let ny = y + dy;
      if (wrap) { nx = (nx + width) % width; ny = (ny + height) % height; } else if (nx < 0 || ny < 0 || nx >= width || ny >= height) { continue; }
      const next = (ny * width) + nx;
      if (!open(nx, ny) || dist.has(next)) { continue; }
      dist.set(next, dist.get(cell)! + 1);
      queue.push(next);
    }
  }
  return -1;
};

describe('wrap fade: the number of wrap corridors a maze owns is a seeded, deterministic roll', () => {
  test('the band count holds up to the fade start and nothing is left from the fade end, whatever the seed', () => {
    expect(FROM).toBeLessThan(TO);
    for (const seed of SEEDS.slice(0, 40)) {
      for (const level of [2, 9, 10, 29, 30, 60, FROM]) {
        expect(resolveGeometryBudgetWrapRungs(level, seed)).toBe(resolveGeometryBudgetRungCount(level));
      }
      for (const level of [TO, TO + 1, 198, 300, 1_000_000]) {
        expect(resolveGeometryBudgetWrapRungs(level, seed)).toBe(0);
      }
    }
    // The band still owns both rungs right up to the fade end, so the roll has something to fade.
    expect(resolveGeometryBudgetRungCount(TO - 1)).toBe(2);
    expect(resolveGeometryBudgetRungCount(TO)).toBe(0);
  });

  test('it is a pure function of (level, seed), never above the band, and its mean falls linearly from the band count to zero', () => {
    const means: number[] = [];
    for (let level = FROM; level <= TO; level += 1) {
      const owned = resolveGeometryBudgetRungCount(Math.min(level, TO - 1));
      const rungs = SEEDS.map((seed) => resolveGeometryBudgetWrapRungs(level, seed));
      expect(rungs).toEqual(SEEDS.map((seed) => resolveGeometryBudgetWrapRungs(level, seed)));
      rungs.forEach((count) => { expect(count).toBeGreaterThanOrEqual(0); expect(count).toBeLessThanOrEqual(owned); });
      const expected = (owned * (TO - level)) / (TO - FROM);
      const mean = rungs.reduce((a, b) => a + b, 0) / rungs.length;
      // Within the sampling error of 400 seeds, and the roll never leaves its two integers.
      expect(Math.abs(mean - expected)).toBeLessThan(0.1);
      expect(Math.min(...rungs)).toBeGreaterThanOrEqual(Math.floor(expected) - 0);
      expect(Math.max(...rungs)).toBeLessThanOrEqual(Math.ceil(expected));
      means.push(mean);
    }
    // Falling: every 5-level step of the mean goes down (no cliff, no plateau, no rebound).
    for (let index = 5; index < means.length; index += 1) {
      expect(means[index]!).toBeLessThan(means[index - 5]! - 0.1);
    }
    // No level takes more than a few percent of the band away at once: the step per level.
    for (let index = 1; index < means.length; index += 1) {
      expect(Math.abs(means[index]! - means[index - 1]!)).toBeLessThan(0.15);
    }
  });

  test('the same level and seed give the same maze, and the level seed decides which mazes keep a wrap', () => {
    for (const board of LADDER_BOARDS) {
      for (const level of [FROM + 5, Math.floor((FROM + TO) / 2), TO - 3]) {
        const first = generateLadderMaze(level, board, seedForIndex(3));
        expect(hashLadderMaze(generateLadderMaze(level, board, seedForIndex(3)))).toBe(hashLadderMaze(first));
      }
    }
    // At the midpoint the expected count is exactly one rung (every maze owns one); a quarter of
    // the way in it is a fraction, so the roll splits the level between two counts.
    const quarter = Math.floor((3 * FROM + TO) / 4);
    expect(new Set(SEEDS.map((seed) => resolveGeometryBudgetWrapRungs(quarter, seed))).size).toBeGreaterThan(1);
    expect(new Set(SEEDS.map((seed) => resolveGeometryBudgetWrapRungs(TO - 5, seed))).size).toBe(2);
  });
});

describe('wrap fade: generated mazes follow the roll, are priced for their wraps and keep the ladder ordering', () => {
  test('a maze owns the rungs of its roll (a base that cannot land falls back to plain, rarely) and records them in its profile', () => {
    let mazes = 0;
    let fellBack = 0;
    for (const board of LADDER_BOARDS) {
      for (const level of [FROM, FROM + 10, Math.floor((FROM + TO) / 2), TO - 10, TO - 1]) {
        for (let index = 0; index < 8; index += 1) {
          const seed = seedForIndex(index);
          const maze = generateLadderMaze(level, board, seed);
          const rolled = resolveGeometryBudgetWrapRungs(level, seed);
          const owned = maze.wrapStats?.rungs ?? 0;
          mazes += 1;
          expect(owned).toBeLessThanOrEqual(rolled);
          if (owned < rolled) { fellBack += 1; }
          const required = maze.generation!.profile.requiredOppositeBorderConnections;
          expect(required).toEqual({ horizontal: owned >= 2, vertical: owned >= 1 });
          expect(maze.wrapTopologyDiagnostics!.horizontal.required).toBe(owned >= 2);
          expect(maze.wrapTopologyDiagnostics!.vertical.required).toBe(owned >= 1);
          expect(maze.wrapTopologyDiagnostics!.horizontal.requiredSatisfied).toBe(true);
          expect(maze.wrapTopologyDiagnostics!.vertical.requiredSatisfied).toBe(true);
        }
      }
    }
    expect(mazes).toBe(80);
    expect(fellBack / mazes).toBeLessThan(0.05);
  }, 120_000);

  test('the saving a maze records is the independent measure: route without the wrap links minus route with them, loops closed', () => {
    let wrapped = 0;
    let withLoops = 0;
    for (const board of LADDER_BOARDS) {
      for (const level of [10, 11, 25, 45, 80, FROM, FROM + 15, FROM + 30, TO - 1]) {
        for (let index = 0; index < 5; index += 1) {
          const maze = generateLadderMaze(level, board, seedForIndex(index + 20));
          const planar = routeLength(maze, false, true);
          const torus = routeLength(maze, true, true);
          expect(planar).toBeGreaterThan(0);
          expect(maze.wrapStats?.saved ?? 0).toBe(Math.max(0, planar - torus));
          if ((maze.wrapStats?.saved ?? 0) > 0) { wrapped += 1; }
          // The two savings add up to the whole: everything optional closed (loop connectors closed,
          // wrap links severed) against the maze as built.
          const asBuilt = routeLength(maze, true, false);
          const whole = Math.max(0, planar - asBuilt);
          expect((maze.loopStats?.saved ?? 0) + (maze.wrapStats?.saved ?? 0)).toBe(whole);
          if (maze.loopStats !== undefined) { withLoops += 1; }
        }
      }
    }
    expect(wrapped).toBeGreaterThan(30);
    expect(withLoops).toBeGreaterThan(5);
  }, 120_000);

  test('every maze lands the priced window with wraps priced, and a wrap raises the raw explorer steps by its saving', () => {
    let raised = 0;
    for (const board of LADDER_BOARDS) {
      for (const level of [10, 30, 70, FROM, FROM + 20, TO - 5, TO, TO + 30]) {
        for (let index = 0; index < 6; index += 1) {
          const maze = generateLadderMaze(level, board, seedForIndex(index));
          const target = resolveGeometryBudgetTarget(level)!;
          const priced = measurePricedFeltSteps(maze);
          expect(priced).toBeGreaterThanOrEqual(target);
          expect(priced).toBeLessThanOrEqual(target + 1);
          const raw = measureFelt(maze).steps;
          expect(raw).toBe(priced + (maze.loopStats?.saved ?? 0) + (maze.wrapStats?.saved ?? 0));
          if ((maze.wrapStats?.saved ?? 0) > 0) { raised += 1; }
        }
      }
    }
    expect(raised).toBeGreaterThan(15);
  }, 120_000);

  test('plain levels are untouched: no wrap stats below level 10 and from the fade end, and no wrap link shortens their route', () => {
    for (const board of LADDER_BOARDS) {
      for (const level of [2, 5, 9, TO, TO + 1, 160, LAST_BUDGET_LEVEL, 300]) {
        for (let index = 0; index < 4; index += 1) {
          const maze = generateLadderMaze(level, board, seedForIndex(index));
          expect(maze.wrapStats).toBeUndefined();
          expect(maze.generation!.profile.requiredOppositeBorderConnections).toEqual({ horizontal: false, vertical: false });
          expect(routeLength(maze, true, false)).toBe(routeLength(maze, false, false));
        }
      }
    }
  }, 120_000);

  test('the priced value still beats the previous level for ANY two seeds across the whole fade (both boards)', () => {
    for (const board of LADDER_BOARDS) {
      let previousBest = -Infinity;
      for (let level = FROM - 2; level <= TO + 2; level += 1) {
        const samples = [0, 1, 2].map((index) => sampleLevel(level, board, seedForIndex(index)));
        samples.forEach((sample) => { expect(sample.onTarget).toBe(true); });
        expect(Math.min(...samples.map((sample) => sample.felt))).toBeGreaterThan(previousBest);
        previousBest = Math.max(...samples.map((sample) => sample.felt));
      }
    }
  }, 300_000);

  test('the menu AI (ranks E and S) clears wrap mazes from the fade without stalling', () => {
    let checked = 0;
    for (const board of LADDER_BOARDS) {
      for (const level of [FROM, Math.floor((FROM + TO) / 2), TO - 1, TO]) {
        for (let index = 0; index < 4; index += 1) {
          const seed = seedForIndex(index);
          const maze = generateLadderMaze(level, board, seed, 'menu');
          expect(resolveLegacyPlayableShortestPath(maze.grid, maze.start, maze.goal).found).toBe(true);
          for (const rank of ['E', 'S'] as const) {
            const episode = createLegacyDemoWalkerEpisode(maze);
            const config = createLegacyMenuDemoWalkerConfig(seed, { aiSkillRank: rank, aiSkillLevel: 1 });
            let state = createDemoWalkerState(episode, config);
            const cap = Math.max(2000, maze.width * maze.height * 20);
            let steps = 0;
            while (!state.reachedGoal && steps < cap) {
              state = advanceDemoWalker(episode, state, config).state;
              steps += 1;
            }
            expect(state.reachedGoal).toBe(true);
            checked += 1;
          }
        }
      }
    }
    expect(checked).toBe(64);
  }, 300_000);
});

describe('wrap pricing in the felt tuner', () => {
  // A base maze for a seed; a degenerate base (a few cells or a huge route) walks on to the
  // next seed so the tests exercise ordinary mazes (the felt-tuning tests do the same).
  const base = (rungs: number, seed: number, aspect: number) => {
    for (let attempt = 0; ; attempt += 1) {
      const maze = createLegacyRuntimeMazeForMode(
        'play', 35, seed + (attempt * 1009), resolveGeometryBudgetProfileForRungs(rungs), { loopPlan: LEGACY_EMPTY_LOOP_PLAN }, aspect
      );
      const route = measureFelt(maze).pathLength;
      if ((route >= 40 && route <= 130) || attempt > 40) { return maze; }
    }
  };

  test('the planar neighbour table is the torus table with the edge-crossing steps removed', () => {
    const table = createPlanarNeighbors(5, 4);
    expect(table.length).toBe(5 * 4 * 4);
    // Top-left cell: right and down exist, left and up cross the edge.
    expect([table[0], table[1], table[2], table[3]]).toEqual([1, -1, 5, -1]);
    // Bottom-right cell: left and up exist.
    const last = (5 * 4) - 1;
    expect([table[last * 4], table[(last * 4) + 1], table[(last * 4) + 2], table[(last * 4) + 3]]).toEqual([-1, last - 1, -1, last - 5]);
    expect(createPlanarNeighbors(5, 4)).toBe(table);
  });

  test('unpriced by default (the first-ladder tuner, byte-identical), priced when asked, and the wrap saving is reported either way', () => {
    expect(FELT_WRAP_PRICE_PERCENT).toBe(100);
    let wrapMazes = 0;
    for (const aspect of [23 / 51, 45 / 27]) {
      for (const seed of [11, 4242, 90001, 777]) {
        const maze = base(2, seed, aspect);
        const reach = measureFelt(maze).steps;
        const target = reach + 60;
        const unpriced = tuneMazeFeltToTarget(maze, target, seed + 1, { routeTarget: 120, maxBranch: 20 });
        expect(unpriced.target).toBe(target);
        expect(unpriced.felt).toBeGreaterThanOrEqual(target);
        expect(unpriced.felt).toBeLessThanOrEqual(target + 1);
        const priced = tuneMazeFeltToTarget(maze, target, seed + 1, { routeTarget: 120, maxBranch: 20, wrapPricePercent: 100 });
        expect(priced.wrapSaving).toBe(unpriced.wrapSaving);
        expect(priced.target).toBe(target + priced.wrapSaving);
        if (priced.windowDistance === 0) {
          expect(priced.felt).toBeGreaterThanOrEqual(target + priced.wrapSaving);
          expect(priced.felt).toBeLessThanOrEqual(target + priced.wrapSaving + 1);
        }
        if (priced.wrapSaving > 0) { wrapMazes += 1; }
        // Half price adds half the saving.
        const half = tuneMazeFeltToTarget(maze, target, seed + 1, { routeTarget: 120, maxBranch: 20, wrapPricePercent: 50 });
        expect(half.target).toBe(target + Math.floor(half.wrapSaving / 2));
      }
    }
    expect(wrapMazes).toBeGreaterThan(3);
    // A plain base has nothing to price: pricing wraps changes nothing.
    for (const seed of [11, 4242]) {
      const plain = base(0, seed, 23 / 51);
      const target = measureFelt(plain).steps + 60;
      const off = tuneMazeFeltToTarget(plain, target, seed + 1, { routeTarget: 120, maxBranch: 20 });
      const on = tuneMazeFeltToTarget(plain, target, seed + 1, { routeTarget: 120, maxBranch: 20, wrapPricePercent: 100 });
      expect(on.wrapSaving).toBe(0);
      expect(on.target).toBe(off.target);
      expect(JSON.stringify(on.grid)).toBe(JSON.stringify(off.grid));
    }
  }, 120_000);

  test('a base whose wrap alone would pass the ceiling is hopeless (the selection tries the next base), a plain one is not', () => {
    let checked = 0;
    for (const seed of [11, 4242, 90001, 777, 31337]) {
      const maze = base(2, seed, 45 / 27);
      const target = measureFelt(maze).steps + 40;
      const probe = tuneMazeFeltToTarget(maze, target, seed + 1, { routeTarget: 120, maxBranch: 20, wrapPricePercent: 100 });
      if (probe.wrapSaving === 0) { continue; }
      checked += 1;
      const capped = tuneMazeFeltToTarget(maze, target, seed + 1, {
        routeTarget: 120, maxBranch: 20, wrapPricePercent: 100, feltCeiling: target + probe.wrapSaving - 1
      });
      expect(capped.hopeless).toBe(true);
      const roomy = tuneMazeFeltToTarget(maze, target, seed + 1, {
        routeTarget: 120, maxBranch: 20, wrapPricePercent: 100, feltCeiling: target + probe.wrapSaving + 40
      });
      expect(roomy.hopeless).toBe(false);
    }
    expect(checked).toBeGreaterThan(1);
    expect(GEOMETRY_BUDGET_CEILING).toBeGreaterThan(0);
    expect(GEOMETRY_BUDGET_WRAP_BASE_ATTEMPTS).toBeGreaterThan(1);
  }, 120_000);
});
