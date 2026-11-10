import { describe, expect, test } from 'vitest';
import { advanceDemoWalker, createDemoWalkerState } from '../../src/domain/ai';
import { createLegacyDemoWalkerEpisode, createLegacyMenuDemoWalkerConfig } from '../../src/legacy-runtime/legacyDemoWalker';
import { createLegacyRuntimeMazeForMode } from '../../src/legacy-runtime/legacyGenerationLifecycle';
import {
  GEOMETRY_BUDGET_CEILING,
  GEOMETRY_BUDGET_LOOP_FIRST_LEVEL,
  GEOMETRY_BUDGET_LOOP_FULL_LEVEL,
  GEOMETRY_BUDGET_LOOP_PURE_FLOOR_PERCENT,
  GEOMETRY_BUDGET_LOOP_REFERENCE_CELLS,
  resolveGeometryBudgetLoopPlan,
  resolveGeometryBudgetLoopPurePercent,
  resolveGeometryBudgetProfileForRungs,
  resolveGeometryBudgetTarget
} from '../../src/legacy-runtime/legacyGeometryBudget';
import { createFeltExplorer, measureFelt, measurePricedFeltSteps, simulatePullToGoalWalker } from '../../src/legacy-runtime/legacyMazeFeltDifficulty';
import { FELT_LOOP_PRICE_PERCENT, FELT_TIE_DEVIATION_LIMIT_PERCENT, tuneMazeFeltToTarget } from '../../src/legacy-runtime/legacyMazeFeltTuning';
import {
  LEGACY_EMPTY_LOOP_PLAN,
  LOOP_SHORTCUT_MIN_SAVE,
  LOOP_TOTAL_SAVE_PERCENT,
  breakAccidentalCycles,
  carveLegacyLoops,
  createLoopSearch,
  createRouteMeter,
  legacyLoopPlanSize,
  type LegacyLoopPlan
} from '../../src/legacy-runtime/legacyMazeLoops';
import { resolveLegacyPlayableShortestPath } from '../../src/legacy-runtime/legacyMaze';
import { generateLadderMaze, LADDER_BOARDS, seedForIndex } from '../../scripts/analysis/lib/progressionLadderSampling';
import { computeMazeGauges, describeMazeStructure } from '../../scripts/analysis/lib/mazeGauges';

const gaugeInput = (maze: ReturnType<typeof generateLadderMaze>) => ({
  width: maze.width,
  height: maze.height,
  rows: maze.grid.map((row) => row.map((cell) => (cell ? '1' : '0')).join('')),
  start: maze.start,
  goal: maze.goal,
  loopStats: maze.loopStats ?? null
});

const interiorCycles = (maze: ReturnType<typeof generateLadderMaze>): number => computeMazeGauges(gaugeInput(maze)).loopsInterior;

const openTwoByTwoBlocks = (open: Uint8Array, width: number, height: number): number => {
  let blocks = 0;
  for (let y = 0; y + 1 < height; y += 1) {
    for (let x = 0; x + 1 < width; x += 1) {
      const i = (y * width) + x;
      if (open[i] && open[i + 1] && open[i + width] && open[i + width + 1]) { blocks += 1; }
    }
  }
  return blocks;
};

// A serpentine maze: horizontal corridors on every other row (x = 2 .. width - 3)
// joined alternately at the right and left end, with a one-cell wall between neighbours.
const serpentine = (width: number, height: number) => {
  const open = new Uint8Array(width * height);
  const at = (x: number, y: number): number => (y * width) + x;
  let startCell = -1;
  let goalCell = -1;
  for (let y = 2, row = 0; y <= height - 3; y += 2, row += 1) {
    for (let x = 2; x <= width - 3; x += 1) { open[at(x, y)] = 1; }
    if (y + 2 <= height - 3) {
      const joinX = row % 2 === 0 ? width - 3 : 2;
      open[at(joinX, y + 1)] = 1;
    }
    if (row === 0) { startCell = at(2, y); }
    goalCell = at(row % 2 === 0 ? width - 3 : 2, y);
  }
  return { open, startCell, goalCell };
};

describe('loop plan (multiple routes): deterministic per seed and level, scaled by maze size', () => {
  const seeds = Array.from({ length: 400 }, (_, index) => seedForIndex(index));

  test('levels below the first loop level are always a single route, and the plan is a pure function', () => {
    for (let level = 2; level < GEOMETRY_BUDGET_LOOP_FIRST_LEVEL; level += 1) {
      for (const seed of seeds.slice(0, 40)) {
        expect(resolveGeometryBudgetLoopPlan(level, seed, 1275)).toBe(LEGACY_EMPTY_LOOP_PLAN);
      }
    }
    for (const level of [12, 40, 120, 198, 500]) {
      for (const seed of seeds.slice(0, 20)) {
        expect(resolveGeometryBudgetLoopPlan(level, seed, 1275)).toEqual(resolveGeometryBudgetLoopPlan(level, seed, 1275));
      }
    }
  });

  test('the chance of a single-route maze falls from 100 percent to the floor at the full level and stays there', () => {
    expect(resolveGeometryBudgetLoopPurePercent(GEOMETRY_BUDGET_LOOP_FIRST_LEVEL - 1)).toBe(100);
    expect(resolveGeometryBudgetLoopPurePercent(GEOMETRY_BUDGET_LOOP_FULL_LEVEL)).toBe(GEOMETRY_BUDGET_LOOP_PURE_FLOOR_PERCENT);
    expect(resolveGeometryBudgetLoopPurePercent(198)).toBe(GEOMETRY_BUDGET_LOOP_PURE_FLOOR_PERCENT);
    expect(resolveGeometryBudgetLoopPurePercent(5000)).toBe(GEOMETRY_BUDGET_LOOP_PURE_FLOOR_PERCENT);
    let previous = 100;
    for (let level = 2; level <= 250; level += 1) {
      const percent = resolveGeometryBudgetLoopPurePercent(level);
      expect(percent).toBeLessThanOrEqual(previous);
      previous = percent;
    }
  });

  test('variety: even at the top some seeds stay a single route, and loops arrive gradually', () => {
    const looped = (level: number): number => seeds.filter((seed) => legacyLoopPlanSize(resolveGeometryBudgetLoopPlan(level, seed, 1275)) > 0).length / seeds.length;
    expect(looped(12)).toBeLessThan(0.05);
    expect(looped(30)).toBeLessThan(0.3);
    expect(looped(60)).toBeGreaterThan(0.15);
    expect(looped(60)).toBeLessThan(0.55);
    expect(looped(198)).toBeGreaterThan(0.6);
    expect(looped(198)).toBeLessThan(0.8);
    // Never all-or-nothing at any level above the first: a single-route share remains.
    for (const level of [12, 40, 80, 120, 198, 300]) { expect(looped(level)).toBeLessThan(0.85); }
  });

  test('the loop count scales with the maze size in cells and with the level', () => {
    const meanLoops = (level: number, cells: number): number => (
      seeds.reduce((sum, seed) => sum + legacyLoopPlanSize(resolveGeometryBudgetLoopPlan(level, seed, cells)), 0) / seeds.length
    );
    expect(meanLoops(150, GEOMETRY_BUDGET_LOOP_REFERENCE_CELLS * 2)).toBeGreaterThan(meanLoops(150, GEOMETRY_BUDGET_LOOP_REFERENCE_CELLS) * 1.5);
    expect(meanLoops(198, GEOMETRY_BUDGET_LOOP_REFERENCE_CELLS)).toBeGreaterThan(meanLoops(60, GEOMETRY_BUDGET_LOOP_REFERENCE_CELLS));
    for (const seed of seeds.slice(0, 100)) {
      const plan = resolveGeometryBudgetLoopPlan(198, seed, 1275);
      expect(legacyLoopPlanSize(plan)).toBeLessThanOrEqual(8);
      expect(plan.maxConnector).toBeLessThanOrEqual(36);
      expect(plan.cellBudget).toBe(Math.round(1275 * 0.06) * (legacyLoopPlanSize(plan) > 0 ? 1 : 0));
    }
  });

  test('kinds: no decoys before level 30, shortcuts are the early feature, alternates and decoys take over', () => {
    const totals = (level: number) => seeds.reduce((sum, seed) => {
      const plan = resolveGeometryBudgetLoopPlan(level, seed, 1275);
      return { shortcuts: sum.shortcuts + plan.shortcuts, alternates: sum.alternates + plan.alternates, decoys: sum.decoys + plan.decoys };
    }, { shortcuts: 0, alternates: 0, decoys: 0 });
    for (const level of [12, 20, 29]) { expect(totals(level).decoys).toBe(0); }
    const mid = totals(40);
    expect(mid.shortcuts).toBeGreaterThan(mid.alternates);
    const top = totals(198);
    expect(top.decoys).toBeGreaterThan(0);
    expect(top.alternates).toBeGreaterThan(top.shortcuts);
  });
});

describe('breakAccidentalCycles', () => {
  const width = 17;
  const height = 17;
  const ring = () => {
    const open = new Uint8Array(width * height);
    const at = (x: number, y: number): number => (y * width) + x;
    for (let i = 4; i <= 10; i += 1) { open[at(i, 4)] = 1; open[at(i, 10)] = 1; open[at(4, i)] = 1; open[at(10, i)] = 1; }
    // A tail from the ring to the goal, and one dead-end spur.
    for (let y = 11; y <= 14; y += 1) { open[at(10, y)] = 1; }
    for (let x = 11; x <= 13; x += 1) { open[at(x, 4)] = 1; }
    return { open, startCell: at(4, 4), goalCell: at(10, 14) };
  };
  const components = (open: Uint8Array): number => {
    const seen = new Uint8Array(open.length);
    let count = 0;
    for (let cell = 0; cell < open.length; cell += 1) {
      if (!open[cell] || seen[cell]) { continue; }
      count += 1;
      const stack = [cell];
      seen[cell] = 1;
      while (stack.length) {
        const current = stack.pop()!;
        for (const step of [1, -1, width, -width]) {
          const next = current + step;
          if (next >= 0 && next < open.length && open[next] && !seen[next] && Math.abs((next % width) - (current % width)) <= 1) { seen[next] = 1; stack.push(next); }
        }
      }
    }
    return count;
  };

  test('closes exactly one two-neighbour cell of a ring, keeps the maze connected and never the start or goal', () => {
    const { open, startCell, goalCell } = ring();
    const before = open.reduce((sum, value) => sum + value, 0);
    const closed = breakAccidentalCycles(width, height, open, startCell, goalCell, new Set());
    expect(closed).toHaveLength(1);
    expect(closed[0]).not.toBe(startCell);
    expect(closed[0]).not.toBe(goalCell);
    expect(open.reduce((sum, value) => sum + value, 0)).toBe(before - 1);
    expect(components(open)).toBe(1);
    // Nothing left to break.
    expect(breakAccidentalCycles(width, height, open, startCell, goalCell, new Set())).toHaveLength(0);
  });

  test('prefers a cell off the protected route, and leaves a tree alone', () => {
    const { open, startCell, goalCell } = ring();
    const protectedRoute = new Set<number>();
    for (let i = 4; i <= 10; i += 1) { protectedRoute.add((4 * width) + i); }
    for (let y = 4; y <= 10; y += 1) { protectedRoute.add((y * width) + 10); }
    for (let y = 11; y <= 14; y += 1) { protectedRoute.add((y * width) + 10); }
    const [cut] = breakAccidentalCycles(width, height, open, startCell, goalCell, protectedRoute);
    expect(protectedRoute.has(cut!)).toBe(false);
    const tree = serpentine(25, 25);
    expect(breakAccidentalCycles(25, 25, tree.open, tree.startCell, tree.goalCell, new Set())).toHaveLength(0);
  });
});

describe('carveLegacyLoops on a serpentine maze', () => {
  const run = (plan: LegacyLoopPlan, seed: number) => {
    const width = 33;
    const height = 33;
    const { open, startCell, goalCell } = serpentine(width, height);
    const before = Uint8Array.from(open);
    const explorer = createFeltExplorer(width, height);
    const meter = createRouteMeter(width * height, explorer.neighbors, startCell, goalCell);
    const initialRoute = meter(open);
    let state = (seed >>> 0) || 1;
    const rand = (): number => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state >>> 8; };
    const result = carveLegacyLoops({
      width, height, open, neighbors: explorer.neighbors, startCell, goalCell, plan, rand,
      evaluate: () => explorer.run(open, startCell, goalCell), feltLimit: 100_000, search: createLoopSearch(width, height, open)
    });
    return { width, height, open, before, startCell, goalCell, initialRoute, finalRoute: meter(open), result };
  };
  const plan: LegacyLoopPlan = { shortcuts: 2, alternates: 2, decoys: 0, maxConnector: 14, cellBudget: 60 };

  test('carves loops that follow the rules: interior only, no 2x2 block, start and goal untouched, same seed same maze', () => {
    for (const seed of [1, 7, 99]) {
      const a = run(plan, seed);
      expect(a.result.records.length).toBeGreaterThan(0);
      const added: number[] = [];
      for (let cell = 0; cell < a.open.length; cell += 1) { if (a.open[cell] !== a.before[cell]) { added.push(cell); } }
      expect(added.length).toBe(a.result.cellsCarved);
      for (const cell of added) {
        const x = cell % a.width;
        const y = (cell - x) / a.width;
        expect(x).toBeGreaterThanOrEqual(1);
        expect(y).toBeGreaterThanOrEqual(1);
        expect(x).toBeLessThanOrEqual(a.width - 2);
        expect(y).toBeLessThanOrEqual(a.height - 2);
        expect(a.before[cell]).toBe(0);
      }
      expect(a.open[a.startCell]).toBe(1);
      expect(a.open[a.goalCell]).toBe(1);
      expect(openTwoByTwoBlocks(a.open, a.width, a.height)).toBe(openTwoByTwoBlocks(a.before, a.width, a.height));
      const b = run(plan, seed);
      expect(Array.from(b.open)).toEqual(Array.from(a.open));
    }
  });

  test('shortcuts are real and capped; alternates stay within their tolerance; the total never exceeds the cap', () => {
    for (const seed of [1, 7, 99, 1234]) {
      const a = run(plan, seed);
      const saved = a.initialRoute - a.finalRoute;
      expect(saved).toBeGreaterThanOrEqual(0);
      expect(saved).toBeLessThanOrEqual(Math.floor((a.initialRoute * LOOP_TOTAL_SAVE_PERCENT) / 100) + 4);
      for (const record of a.result.records) {
        if (record.kind === 'shortcut') { expect(record.saving).toBeGreaterThanOrEqual(LOOP_SHORTCUT_MIN_SAVE); }
        if (record.kind === 'alternate') { expect(record.saving).toBeLessThanOrEqual(Math.max(2, Math.floor((a.initialRoute * 4) / 100))); }
      }
    }
    // A plan-less call is a no-op.
    const none = run(LEGACY_EMPTY_LOOP_PLAN, 3);
    expect(none.result.records).toHaveLength(0);
    expect(Array.from(none.open)).toEqual(Array.from(none.before));
  });
});

describe('the felt tuner with loops: priced landing, ceiling give-back, plan-less is unchanged', () => {
  const base = (seed: number, aspect: number) => createLegacyRuntimeMazeForMode('play', 35, seed, resolveGeometryBudgetProfileForRungs(0), {}, aspect);
  const loops: LegacyLoopPlan = { shortcuts: 1, alternates: 2, decoys: 2, maxConnector: 24, cellBudget: 76 };

  test('lands the PRICED felt value in the window: explorer steps minus the loop saving', () => {
    expect(FELT_LOOP_PRICE_PERCENT).toBe(100);
    let looped = 0;
    for (const aspect of [23 / 51, 45 / 27]) {
      for (const seed of [11, 4242, 90001, 31337]) {
        const maze = base(seed, aspect);
        const baseTarget = measureFelt(maze).steps + 300;
        const result = tuneMazeFeltToTarget(maze, baseTarget, seed + 1, { routeTarget: 120, maxBranch: 20, forks: 6, loops });
        expect(result.baseTarget).toBe(baseTarget);
        expect(result.target).toBe(baseTarget + result.loopSaving);
        expect(result.onTarget).toBe(true);
        const measured = measureFelt({ ...maze, grid: result.grid });
        expect(measured.steps).toBe(result.felt);
        expect(measured.steps - result.loopSaving).toBeGreaterThanOrEqual(baseTarget);
        expect(measured.steps - result.loopSaving).toBeLessThanOrEqual(baseTarget + 1);
        if (result.loops.length > 0) { looped += 1; }
      }
    }
    expect(looped).toBeGreaterThan(4);
  });

  test('a ceiling with no headroom gives the saving loops back; a plan-less tune equals the loop-free tune', () => {
    const maze = base(4242, 23 / 51);
    const baseTarget = measureFelt(maze).steps + 300;
    const noRoom = tuneMazeFeltToTarget(maze, baseTarget, 4243, { routeTarget: 120, maxBranch: 20, loops: { ...loops, shortcuts: 3 }, feltCeiling: baseTarget });
    expect(noRoom.loopSaving).toBe(0);
    expect(noRoom.target).toBe(baseTarget);
    const plain = tuneMazeFeltToTarget(maze, baseTarget, 4243, { routeTarget: 120, maxBranch: 20 });
    const emptyPlan = tuneMazeFeltToTarget(maze, baseTarget, 4243, { routeTarget: 120, maxBranch: 20, loops: LEGACY_EMPTY_LOOP_PLAN });
    expect(emptyPlan.grid).toEqual(plain.grid);
    expect(plain.loops).toHaveLength(0);
  });
});

describe('generated ladder mazes carry loops by the plan, and the menu AI clears them', () => {
  const GRID_SEEDS = Array.from({ length: 10 }, (_, index) => index);

  test('levels 2..11 are single-route mazes on both boards (no accidental loop either)', () => {
    for (const board of LADDER_BOARDS) {
      for (let level = 2; level < GEOMETRY_BUDGET_LOOP_FIRST_LEVEL; level += 1) {
        for (const index of GRID_SEEDS.slice(0, 6)) {
          const maze = generateLadderMaze(level, board, seedForIndex(index));
          expect(interiorCycles(maze)).toBe(0);
          expect(maze.loopStats).toBeUndefined();
        }
      }
    }
  });

  test('loop cells are interior, the start and goal are intact, every maze lands the priced window, and the tie price holds', () => {
    let looped = 0;
    let singleRoute = 0;
    let total = 0;
    for (const board of LADDER_BOARDS) {
      for (const level of [60, 100, 150, 198, 240]) {
        for (const index of GRID_SEEDS) {
          const seed = seedForIndex(index);
          const maze = generateLadderMaze(level, board, seed);
          total += 1;
          const target = resolveGeometryBudgetTarget(Math.min(level, 198))!;
          const priced = measurePricedFeltSteps(maze);
          expect(priced).toBeGreaterThanOrEqual(target);
          expect(priced).toBeLessThanOrEqual(target + 1);
          expect(maze.grid[maze.start.y]![maze.start.x]).toBe(true);
          expect(maze.grid[maze.goal.y]![maze.goal.x]).toBe(true);
          if (maze.loopStats === undefined) {
            if (interiorCycles(maze) === 0) { singleRoute += 1; }
            continue;
          }
          looped += 1;
          const tiles = maze.generationBuildTrace!.decoyTiles!.slice(0, maze.loopStats.cells);
          expect(tiles).toHaveLength(maze.loopStats.cells);
          for (const tile of tiles) {
            expect(tile.x).toBeGreaterThanOrEqual(1);
            expect(tile.y).toBeGreaterThanOrEqual(1);
            expect(tile.x).toBeLessThanOrEqual(maze.width - 2);
            expect(tile.y).toBeLessThanOrEqual(maze.height - 2);
            expect(maze.grid[tile.y]![tile.x]).toBe(true);
          }
          expect(maze.loopStats.saved).toBeGreaterThanOrEqual(0);
          // The tie price: the deterministic number agrees with the tie-averaged one.
          const raw = measureFelt(maze).steps;
          let sum = 0;
          for (let sample = 1; sample <= 6; sample += 1) { sum += simulatePullToGoalWalker(maze, (sample * 7919) | 1); }
          const deviation = Math.floor((100 * Math.abs((6 * raw) - sum)) / (6 * raw));
          expect(deviation).toBeLessThanOrEqual(FELT_TIE_DEVIATION_LIMIT_PERCENT + 8);
        }
      }
    }
    // Variety: most high mazes are looped, and a real share is still one way.
    expect(looped / total).toBeGreaterThan(0.35);
    expect(singleRoute / total).toBeGreaterThan(0.08);
    // The ceiling holds the top: priced targets never pass it.
    expect(resolveGeometryBudgetTarget(198)!).toBeLessThanOrEqual(GEOMETRY_BUDGET_CEILING);
  }, 300_000);

  test('looped mazes still have a shortest route, and the menu AI (ranks E and S) clears every one without stalling', () => {
    let checked = 0;
    for (const board of LADDER_BOARDS) {
      for (const level of [40, 80, 120, 160, 198]) {
        for (const index of GRID_SEEDS.slice(0, 8)) {
          const seed = seedForIndex(index);
          const maze = generateLadderMaze(level, board, seed, 'menu');
          if (maze.loopStats === undefined || interiorCycles(maze) === 0) { continue; }
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
    expect(checked).toBeGreaterThan(20);
  }, 300_000);

  test('describeMazeStructure agrees with the gauges: a looped maze has cycle cells off a bridge', () => {
    const board = LADDER_BOARDS[1];
    for (let index = 0; index < 20; index += 1) {
      const maze = generateLadderMaze(198, board, seedForIndex(index));
      const structure = describeMazeStructure(gaugeInput(maze));
      expect(structure.cycleCells.size > 0).toBe(interiorCycles(maze) > 0);
    }
  });
});
