import { afterEach, describe, expect, test, vi } from 'vitest';
import { createDefaultMazeWorker } from '../../src/legacy-runtime/legacyMazeWorkerClient';
import { createLegacyRuntimeMazeForMode } from '../../src/legacy-runtime/legacyGenerationLifecycle';
import { analyzeMazeDifficulty } from '../../src/legacy-runtime/legacyMazeDifficultyMetrics';
import { measureFelt } from '../../src/legacy-runtime/legacyMazeFeltDifficulty';
import { findFloorIslands } from '../../src/legacy-runtime/legacyMazeIslands';
import {
  LEGACY_STAIRCASE_PARAM,
  applyStaircasePass,
  readLegacyStaircaseFlagFromLocation,
  resolveLegacyStaircaseFlag
} from '../../src/legacy-runtime/legacyMazeStaircase';
import { resolveLegacyMazeGenerationProfileForProgression } from '../../src/legacy-runtime/legacyProgression';
import {
  LADDER_BOARDS,
  hashLadderMaze,
  ladderScaleForLevel,
  seedForIndex,
  trackForLevel
} from '../../scripts/analysis/lib/progressionLadderSampling';
import { countMazeStubs } from '../../scripts/analysis/lib/oneTileStubCensus';

// MAZER-GEN-020: the staircase pathway pass is a flagged prototype, OFF by default. With the flag off a maze is
// byte-identical to the plain build (the progression-ladder golden fixture proves it for 300 levels x 2 boards);
// with it on every graph property the game reads is unchanged and only corridor geometry differs.
const LEVELS = [5, 20, 60, 100] as const;
const SEEDS = 3;

const build = (level: number, seed: number, staircase: boolean | undefined) => createLegacyRuntimeMazeForMode(
  'play',
  ladderScaleForLevel(level),
  seed,
  resolveLegacyMazeGenerationProfileForProgression(trackForLevel(level)),
  staircase === undefined ? {} : { staircase },
  LADDER_BOARDS[0].aspectRatio
);

const openings = (maze: { width: number; height: number; grid: ReadonlyArray<ReadonlyArray<boolean>> }): number => {
  let count = 0;
  for (let y = 0; y < maze.height; y += 1) {
    for (let x = 0; x < maze.width; x += 1) {
      if ((x === 0 || y === 0 || x === maze.width - 1 || y === maze.height - 1) && maze.grid[y]![x]) { count += 1; }
    }
  }
  return count;
};

describe('staircase pathways: the flag', () => {
  test('parses 1/on/true/yes and nothing else', () => {
    expect(LEGACY_STAIRCASE_PARAM).toBe('staircase');
    for (const on of ['?staircase=1&previewLevel=5', 'staircase=on&runtimeDiagnostics=1', '?a=1&staircase=TRUE&runtimeDiagnostics=true', '?staircase=yes&previewLevel=20']) {
      expect(resolveLegacyStaircaseFlag(on), on).toBe(true);
    }
    for (const off of ['', '?', '?staircase=0', '?staircase=', '?staircase=2', '?staircases=1', '?x=staircase']) {
      expect(resolveLegacyStaircaseFlag(off), off).toBe(false);
    }
    expect(resolveLegacyStaircaseFlag(new URLSearchParams('staircase=1&previewLevel=5'))).toBe(true);
    expect(resolveLegacyStaircaseFlag(null)).toBe(false);
    expect(resolveLegacyStaircaseFlag(undefined)).toBe(false);
  });

  test('the flag only counts with the QA gate (runtimeDiagnostics or previewLevel)', () => {
    for (const ungated of ['?staircase=1', 'staircase=on', '?staircase=1&runtimeDiagnostics=0', '?staircase=1&runtimeDiagnostics=', '?staircase=1&previewLevel=0', '?staircase=1&previewLevel=abc', '?runtimeDiagnostics=1', '?previewLevel=5']) {
      expect(resolveLegacyStaircaseFlag(ungated), ungated).toBe(false);
    }
  });

  test('is off when there is no page query (node, worker)', () => {
    expect(readLegacyStaircaseFlagFromLocation()).toBe(false);
  });

  describe('page location and worker host', () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    test('readLegacyStaircaseFlagFromLocation is true only when the URL is gated', () => {
      const cases: Array<[string, boolean]> = [
        ['?staircase=1', false],
        ['', false],
        ['?previewLevel=5', false],
        ['?staircase=1&previewLevel=5', true],
        ['?staircase=1&runtimeDiagnostics=1', true],
        ['?staircase=0&previewLevel=5', false]
      ];
      for (const [search, expected] of cases) {
        vi.stubGlobal('location', { search });
        expect(readLegacyStaircaseFlagFromLocation(), search).toBe(expected);
      }
    });

    test('createDefaultMazeWorker returns null for the gated flag and a Worker otherwise', () => {
      const created: string[] = [];
      class FakeWorker {
        constructor(url: unknown, options: unknown) {
          created.push(String(url) + JSON.stringify(options));
        }
      }
      vi.stubGlobal('Worker', FakeWorker);
      vi.stubGlobal('location', { search: '?staircase=1&previewLevel=5' });
      expect(createDefaultMazeWorker()).toBeNull();
      expect(created).toHaveLength(0);
      for (const search of ['', '?staircase=1', '?previewLevel=5']) {
        vi.stubGlobal('location', { search });
        expect(createDefaultMazeWorker(), search).toBeInstanceOf(FakeWorker);
      }
      expect(created).toHaveLength(3);
      vi.stubGlobal('location', { search: '?mazeWorker=off' });
      expect(createDefaultMazeWorker()).toBeNull();
    });
  });

  test('absent and false leave the maze byte-identical, on adds only staircaseStats and geometry', () => {
    for (const level of LEVELS) {
      const seed = seedForIndex(0);
      const absent = build(level, seed, undefined);
      const off = build(level, seed, false);
      expect(hashLadderMaze(off), `level ${level}`).toBe(hashLadderMaze(absent));
      expect(off.grid).toEqual(absent.grid);
      expect(off.solutionPath).toEqual(absent.solutionPath);
      expect(off.staircaseStats).toBeUndefined();
      expect(build(level, seed, true).staircaseStats).toBeDefined();
    }
  });
});

describe('staircase pathways: the pass keeps the maze the game reads', () => {
  test.each(LEVELS)('level %i: same graph, route, felt number and openings; zero stubs; solvable; deterministic', (level) => {
    let staircases = 0;
    for (let index = 0; index < SEEDS; index += 1) {
      const seed = seedForIndex(index);
      const label = `level ${level} seed ${index}`;
      const off = build(level, seed, false);
      const on = build(level, seed, true);
      const metricsOff = analyzeMazeDifficulty(off);
      const metricsOn = analyzeMazeDifficulty(on);
      staircases += on.staircaseStats!.staircases;
      expect(on.staircaseStats!.reverted, label).toBe(false);
      expect(on.width, label).toBe(off.width);
      expect(on.height, label).toBe(off.height);
      expect(on.start, label).toEqual(off.start);
      expect(on.goal, label).toEqual(off.goal);
      expect(metricsOn.routeLength, label).toBe(metricsOff.routeLength);
      expect(metricsOn.decisionPoints, label).toBe(metricsOff.decisionPoints);
      expect(metricsOn.deadEnds, label).toBe(metricsOff.deadEnds);
      expect(openings(on), label).toBe(openings(off));
      expect(on.solutionPath.length, label).toBe(off.solutionPath.length);
      expect(measureFelt(on).steps, label).toBe(measureFelt(off).steps);
      expect(measureFelt(on).reachedGoal, label).toBe(true);
      expect(countMazeStubs(on), label).toEqual({ strict: 0, loose: 0, border: 0 });
      expect(findFloorIslands(on).islands, label).toEqual([]);
      // Floor cell count is exactly preserved (a rewrite moves cells, it never adds or drops one).
      const floor = (grid: ReadonlyArray<ReadonlyArray<boolean>>): number => grid.flat().filter(Boolean).length;
      expect(floor(on.grid), label).toBe(floor(off.grid));
      // The route walks open cells one step at a time from start to goal.
      for (const [i, point] of on.solutionPath.entries()) {
        expect(on.grid[point.y]![point.x], label).toBe(true);
        if (i > 0) {
          const prev = on.solutionPath[i - 1]!;
          const manhattan = Math.abs(point.x - prev.x) + Math.abs(point.y - prev.y);
          const wrapHop = Math.abs(point.x - prev.x) === on.width - 1 || Math.abs(point.y - prev.y) === on.height - 1;
          expect(manhattan === 1 || wrapHop, label).toBe(true);
        }
      }
      // Deterministic: same level, board and seed give the same grid.
      expect(hashLadderMaze(build(level, seed, true)), label).toBe(hashLadderMaze(on));
    }
    // The prototype must actually draw something on a phone board.
    expect(staircases, `level ${level}`).toBeGreaterThan(0);
  }, 120_000);

  test('applyStaircasePass is pure: the input maze is not mutated and a second run gives the same result', () => {
    const base = build(60, seedForIndex(1), false);
    const gridBefore = JSON.stringify(base.grid);
    const pathBefore = JSON.stringify(base.solutionPath);
    const once = applyStaircasePass(base);
    expect(JSON.stringify(base.grid)).toBe(gridBefore);
    expect(JSON.stringify(base.solutionPath)).toBe(pathBefore);
    expect(JSON.stringify(applyStaircasePass(base).grid)).toBe(JSON.stringify(once.grid));
  });
});
