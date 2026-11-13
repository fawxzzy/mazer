import { describe, expect, test } from 'vitest';
import {
  GEOMETRY_BUDGET_ROUTE_SHARE_PERCENT,
  resolveGeometryBudgetRouteTarget
} from '../../src/legacy-runtime/legacyGeometryBudget';
import { createLegacyRuntimeMazeForMode } from '../../src/legacy-runtime/legacyGenerationLifecycle';
import { resolveGeometryBudgetProfileForRungs } from '../../src/legacy-runtime/legacyGeometryBudget';
import { measureFelt, measureFeltSteps } from '../../src/legacy-runtime/legacyMazeFeltDifficulty';
import { tuneMazeFeltToTarget } from '../../src/legacy-runtime/legacyMazeFeltTuning';
import { collectDeadEndBranches, collectOneTileStubs } from '../../src/legacy-runtime/legacyMazeStubs';
import {
  WINDING_MIN_RUN_CELLS,
  WINDING_MIN_TIGHT_CORNERS,
  analyzeMazeWinding
} from '../../src/legacy-runtime/legacyMazeWinding';
import { LADDER_BOARDS, generateLadderMaze, hashLadderMaze, seedForIndex } from '../../scripts/analysis/lib/progressionLadderSampling';

const gridFrom = (rows: readonly string[]): boolean[][] => rows.map((row) => [...row].map((char) => char !== '#'));
const analyze = (rows: readonly string[], start: { x: number; y: number }, goal: { x: number; y: number }) => analyzeMazeWinding({
  width: rows[0]!.length,
  height: rows.length,
  grid: gridFrom(rows),
  start,
  goal
});

describe('winding metrics (MAZER-GEN-007)', () => {
  test('a straight corridor is one run with no corners and tortuosity 1000', () => {
    const m = analyze(['#######', '#.....#', '#######'], { x: 1, y: 1 }, { x: 5, y: 1 });
    // The start and goal caps end the run; the three cells between them are the run.
    expect(m.runs).toHaveLength(1);
    expect(m.runs[0]!.cells).toBe(3);
    expect(m.totalTurns).toBe(0);
    expect(m.runs[0]!.tortuosityPermille).toBe(1000);
    expect(m.windingCellShare).toBe(0);
  });

  test('a staircase is a zigzag of alternating corners; a U is a hairpin', () => {
    const stairs = analyze([
      '#########',
      '#.#######',
      '#..######',
      '##.######',
      '##..#####',
      '###.#####',
      '###..####',
      '####.####',
      '#########'
    ], { x: 1, y: 1 }, { x: 4, y: 7 });
    // Corners at (1,2) (2,2)... every cell of the staircase turns: alternating signs, no gaps.
    expect(stairs.longestZigzag).toBeGreaterThanOrEqual(5);
    expect(stairs.longestTight).toBeGreaterThanOrEqual(5);
    expect(stairs.hairpins).toBe(0);

    const u = analyze([
      '#######',
      '#.....#',
      '#####.#',
      '#.....#',
      '#######'
    ], { x: 1, y: 1 }, { x: 1, y: 3 });
    // East, south, west: two corners of the SAME sign one straight cell apart.
    expect(u.hairpins).toBe(1);
    expect(u.longestZigzag).toBe(0);
  });

  test('a junction ends a run; a wrapped corridor is measured along itself, not the short way round the torus', () => {
    const t = analyze([
      '#####.###',
      '#.....###',
      '#####.###',
      '#####.###'
    ], { x: 1, y: 1 }, { x: 5, y: 3 });
    // (5,1) is a junction (3 open neighbours: left, up, down): the arm (2..4,1) is a run of 3 that ends
    // at the start cap and the junction.
    expect(t.junctions).toBe(1);
    expect(t.runs.some((run) => run.cells === 3)).toBe(true);
    // A full row on a 9-wide board, start x = 0, goal x = 7: the 6 cells between them are one straight run.
    // Measured along itself it is dead straight (1000); the short way round the torus (2 cells) would make it look
    // 3.5 times as long as the way across.
    const ring = analyze(['.........'], { x: 0, y: 0 }, { x: 7, y: 0 });
    const long = ring.runs.find((run) => run.cells === 6);
    expect(long?.tortuosityPermille).toBe(1000);
  });

  test('a long run is winding only with a tight chain of corners', () => {
    // 11 cells of serpentine (arm length 2): tight chain of corners, long enough to count.
    const rows = [
      '###########',
      '#.........#',
      '#########.#',
      '#.........#',
      '#.#########',
      '#.........#',
      '###########'
    ];
    const m = analyze(rows, { x: 1, y: 1 }, { x: 9, y: 5 });
    expect(m.runs.some((run) => run.cells >= WINDING_MIN_RUN_CELLS)).toBe(true);
    expect(WINDING_MIN_TIGHT_CORNERS).toBeGreaterThan(1);
    // Arms of 8 cells: corners are far apart, so no tight chain, but the run is tortuous.
    expect(m.runs[0]!.longestTight).toBeLessThan(WINDING_MIN_TIGHT_CORNERS);
    expect(m.tortuousCells).toBeGreaterThan(0);
    expect(m.windingCells).toBe(0);
  });
});

// Baseline (origin/main 1b2d8ebf, 50 seeds per band and board, scripts/analysis/progression-winding-census.ts):
// mean share of floor cells in clutter runs, permille, averaged over the phone and desktop boards.
const BASELINE_CLUTTER_SHARE_PERMILLE: Readonly<Record<number, number>> = {
  5: 327, 10: 226, 20: 316, 50: 317, 100: 369, 150: 454, 198: 450, 218: 371
};
// The cap the new rule is held to from level 20 on: the mean over the sampled mazes of a band. Measured after the
// rule: 5 to 14 percent (baseline 22 to 46). Levels 2 to 10 are whole mazes of one base route (about 85 to 230
// floor cells) that the tuner barely touches; they only have to be below the baseline there.
const CLUTTER_SHARE_CAP_PERMILLE = 180;
const CAPPED_FROM_LEVEL = 20;
const SAMPLE_LEVELS = [5, 10, 20, 50, 100, 150, 198, 218, 283, 288, 300] as const;
const SAMPLE_SEEDS = 10;

describe('the ladder no longer snakes (MAZER-GEN-007)', () => {
  test('the route is stretched to 12 percent of the felt target, not 38 (every bump was a hairpin)', () => {
    expect(GEOMETRY_BUDGET_ROUTE_SHARE_PERCENT).toBe(12);
    expect(resolveGeometryBudgetRouteTarget(288)).toBe(111);
    expect(resolveGeometryBudgetRouteTarget(100)).toBe(67);
  });

  test('clutter share of every sampled band is under the cap and under half of the baseline from level 20 (below it before); zero stubs; solvable; felt reached', () => {
    for (const level of SAMPLE_LEVELS) {
      let share = 0;
      let mazes = 0;
      for (const board of LADDER_BOARDS) {
        for (let index = 0; index < SAMPLE_SEEDS; index += 1) {
          const maze = generateLadderMaze(level, board, seedForIndex(index));
          const label = `${board.name} level ${level} seed ${index}`;
          const metrics = analyzeMazeWinding(maze);
          share += metrics.windingCellShare;
          mazes += 1;
          expect(collectOneTileStubs(maze), label).toEqual([]);
          expect(collectDeadEndBranches(maze).every((branch) => branch.length >= 2), label).toBe(true);
          expect(measureFelt(maze).reachedGoal, label).toBe(true);
        }
      }
      const mean = share / mazes;
      const baseline = BASELINE_CLUTTER_SHARE_PERMILLE[level];
      if (baseline !== undefined) { expect(mean, `level ${level}`).toBeLessThan(level >= CAPPED_FROM_LEVEL ? baseline / 2 : baseline); }
      if (level >= CAPPED_FROM_LEVEL) { expect(mean, `level ${level}`).toBeLessThan(CLUTTER_SHARE_CAP_PERMILLE); }
    }
  }, 240_000);

  test('deterministic per seed, and level 1 is still the straight corridor', () => {
    for (const board of LADDER_BOARDS) {
      for (const level of [20, 150, 218]) {
        const first = generateLadderMaze(level, board, seedForIndex(4));
        expect(hashLadderMaze(generateLadderMaze(level, board, seedForIndex(4)))).toBe(hashLadderMaze(first));
      }
      const corridor = analyzeMazeWinding(generateLadderMaze(1, board, seedForIndex(0)));
      expect(corridor.totalTurns).toBe(0);
      expect(corridor.junctions).toBe(0);
      expect(corridor.windingCells).toBe(0);
    }
  });
});

describe('tuner option straightBranches (MAZER-GEN-007)', () => {
  // A base maze of the ladder's own profile on the phone board (a degenerate base walks on to the next seed).
  const build = (seed: number) => {
    for (let attempt = 0; ; attempt += 1) {
      const maze = createLegacyRuntimeMazeForMode('play', 35, seed + (attempt * 1009), resolveGeometryBudgetProfileForRungs(0), {}, 23 / 51);
      const route = measureFelt(maze).pathLength;
      if ((route >= 40 && route <= 130) || attempt > 40) { return maze; }
    }
  };

  test('omitting it is the old tuner (byte-identical to false); true bends branches less and still lands the felt number', () => {
    let turnsOff = 0;
    let turnsOn = 0;
    for (let seed = 1; seed <= 6; seed += 1) {
      const maze = build(seed);
      const target = measureFeltSteps(maze) + 160;
      const options = { routeTarget: 0, maxBranch: 20 };
      const omitted = tuneMazeFeltToTarget(maze, target, seed + 7, options);
      const off = tuneMazeFeltToTarget(maze, target, seed + 7, { ...options, straightBranches: false });
      expect(off.grid).toEqual(omitted.grid);
      const on = tuneMazeFeltToTarget(maze, target, seed + 7, { ...options, straightBranches: true });
      expect(on.onTarget).toBe(true);
      expect(on.felt).toBeGreaterThanOrEqual(target);
      const asMaze = (grid: boolean[][]) => ({ width: maze.width, height: maze.height, grid, start: maze.start, goal: maze.goal });
      turnsOff += analyzeMazeWinding(asMaze(omitted.grid)).totalTurns;
      turnsOn += analyzeMazeWinding(asMaze(on.grid)).totalTurns;
    }
    expect(turnsOn).toBeLessThan(turnsOff);
  });
});
