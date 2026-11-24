import { describe, expect, test } from 'vitest';
import { LADDER_BOARDS, generateLadderMaze, hashLadderMaze, seedForIndex } from '../../scripts/analysis/lib/progressionLadderSampling';
import { sweepMazeQuality } from '../../scripts/analysis/lib/mazeQualitySweep';
import { measureMazeQuality } from '../../src/legacy-runtime/legacyMazeQualityMetrics';
import {
  applyMazeQualityPass,
  isMazeQualityPassEnabled,
  setMazeQualityPassEnabled
} from '../../src/legacy-runtime/legacyMazeQualityPass';

// MAZER-GEN-030: the owner's complaint was "too many short useless dead ends, usually one route to the end". The
// quality pass (legacyMazeQualityPass.ts) prunes or bridges every short dead end and asks the tuner for second
// routes, without moving the felt number, the shortest route or the ladder. This file pins the measured effect
// (before = the generator with the pass switched off, same seeds) and the invariants that keep difficulty and
// progression valid. Run `npx vite-node scripts/analysis/maze-quality-report.ts` for the full table.
const SWEEP_LEVELS = [12, 28, 44, 60, 76, 92, 108, 124, 140, 156, 172, 188] as const;
const SWEEP_SEEDS = 3;

const parse = (rows: string[]): { grid: boolean[][] } => ({ grid: rows.map((row) => [...row].map((ch) => ch === '.')) });

describe('maze quality: before/after over a seed sweep (MAZER-GEN-030)', () => {
  const before = sweepMazeQuality(SWEEP_LEVELS, SWEEP_SEEDS, false);
  const after = sweepMazeQuality(SWEEP_LEVELS, SWEEP_SEEDS, true);

  test('the switch is back on after a sweep', () => {
    expect(isMazeQualityPassEnabled()).toBe(true);
  });

  test('short useless dead ends are gone: at most 2 per maze (was about 23), under 10 percent of the dead ends', () => {
    expect(before.shortDeadEnds).toBeGreaterThan(10);
    expect(after.shortDeadEnds).toBeLessThanOrEqual(2);
    expect(after.shortDeadEnds).toBeLessThan(before.shortDeadEnds * 0.1);
    expect(after.shortShare).toBeLessThan(0.1);
  }, 120_000);

  test('fewer, longer dead ends: the count falls by a third or more, the mean length rises by 40 percent or more', () => {
    expect(after.deadEnds).toBeLessThan(before.deadEnds * 0.67);
    expect(after.meanDeadEndLen).toBeGreaterThan(before.meanDeadEndLen * 1.4);
  }, 120_000);

  test('a second way round is the rule: on the board as drawn at least 90 percent of mazes have one (was under 60), and the share of the route with a way round rises by 40 percent or more', () => {
    expect(before.alternateRouteRatePlanar).toBeLessThan(0.6);
    expect(after.alternateRouteRatePlanar).toBeGreaterThanOrEqual(0.9);
    expect(after.bypassShare).toBeGreaterThan(before.bypassShare * 1.4);
    expect(after.cyclomatic).toBeGreaterThan(before.cyclomatic * 2);
  }, 120_000);

  // The pass itself never moves a maze's shortest route (checked per edit). This 36-maze sweep also moves the base
  // mazes (the loop plan feeds the tuner), so it is noisy: 5 percent here, and under 1.5 percent on the 192-maze
  // sweeps per board in the PR (104.9 to 104.7 phone, 102.0 to 103.4 desktop).
  test('solve length is preserved (shortest route within 8 percent of before on this small sweep)', () => {
    expect(Math.abs(after.solutionLength - before.solutionLength)).toBeLessThanOrEqual(before.solutionLength * 0.08);
  }, 120_000);
});

describe('maze quality: invariants (MAZER-GEN-030)', () => {
  const phone = LADDER_BOARDS[0];

  test('level 1 (the corridor) is byte-identical with and without the pass', () => {
    for (let k = 0; k < 3; k += 1) {
      setMazeQualityPassEnabled(false);
      const off = hashLadderMaze(generateLadderMaze(1, phone, seedForIndex(k)));
      setMazeQualityPassEnabled(true);
      expect(hashLadderMaze(generateLadderMaze(1, phone, seedForIndex(k)))).toBe(off);
    }
  });

  test('levels 2 to 11 stay single-route by design: the pass only walls dead ends up there, it never opens a cell', () => {
    for (const level of [2, 5, 8, 11]) {
      for (let k = 0; k < 3; k += 1) {
        setMazeQualityPassEnabled(false);
        const off = generateLadderMaze(level, phone, seedForIndex(k));
        setMazeQualityPassEnabled(true);
        const on = generateLadderMaze(level, phone, seedForIndex(k));
        expect(on.start, `level ${level} seed ${k}`).toEqual(off.start);
        expect(on.goal, `level ${level} seed ${k}`).toEqual(off.goal);
        on.grid.forEach((row, y) => row.forEach((open, x) => {
          if (open) { expect(off.grid[y]![x], `level ${level} seed ${k} cell ${x},${y}`).toBe(true); }
        }));
      }
    }
  }, 120_000);

  test('every sampled level and board: deterministic per seed, solvable, start and goal intact, and a ladder-valid route', () => {
    for (const board of LADDER_BOARDS) {
      for (const level of [12, 40, 100, 200]) {
        for (let k = 0; k < 2; k += 1) {
          const label = `${board.name} level ${level} seed ${k}`;
          const maze = generateLadderMaze(level, board, seedForIndex(k));
          expect(hashLadderMaze(generateLadderMaze(level, board, seedForIndex(k))), label).toBe(hashLadderMaze(maze));
          expect(maze.grid[maze.start.y]![maze.start.x], label).toBe(true);
          expect(maze.grid[maze.goal.y]![maze.goal.x], label).toBe(true);
          expect(measureMazeQuality(maze).solutionLength, label).toBeGreaterThan(0);
          expect(maze.solutionPath.length, label).toBeGreaterThan(1);
        }
      }
    }
  }, 280_000);
});

describe('maze quality pass on a handmade maze (MAZER-GEN-030)', () => {
  // A 15x7 corridor from the start (1,1) to the goal (13,1) with a two-cell stub down from (7,1) and a longer
  // 4-cell dead-end branch down from (11,1), which is not a stub and stays.
  const rows = [
    '###############',
    '#.............#',
    '#######.###.###',
    '#######.###.###',
    '###########.###',
    '###########.###',
    '###############'
  ];

  test('a 2-cell stub on a level below the first looped level is walled up; the route is unchanged', () => {
    const maze = { width: 15, height: 7, ...parse(rows), start: { x: 1, y: 1 }, goal: { x: 13, y: 1 } };
    const beforeMetrics = measureMazeQuality(maze);
    const pass = applyMazeQualityPass(maze, 5, 1234, 0);
    expect(pass.changed).toBe(true);
    expect(pass.stats.pruned).toBeGreaterThanOrEqual(1);
    expect(pass.added).toEqual([]);
    expect(pass.removed.map((p) => `${p.x},${p.y}`)).toEqual(expect.arrayContaining(['7,2', '7,3']));
    const afterMetrics = measureMazeQuality({ ...maze, grid: pass.grid });
    expect(afterMetrics.solutionLength).toBe(beforeMetrics.solutionLength);
    expect(afterMetrics.shortDeadEnds).toBeLessThan(beforeMetrics.shortDeadEnds);
  });

  test('the pass is deterministic and does nothing when switched off', () => {
    const maze = { width: 15, height: 7, ...parse(rows), start: { x: 1, y: 1 }, goal: { x: 13, y: 1 } };
    expect(applyMazeQualityPass(maze, 5, 1234, 0).grid).toEqual(applyMazeQualityPass(maze, 5, 1234, 0).grid);
    setMazeQualityPassEnabled(false);
    try {
      const off = applyMazeQualityPass(maze, 5, 1234, 0);
      expect(off.changed).toBe(false);
      expect(off.grid).toEqual(maze.grid);
    } finally {
      setMazeQualityPassEnabled(true);
    }
  });
});
