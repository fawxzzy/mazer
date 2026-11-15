import { describe, expect, test } from 'vitest';
import { findFloorIslands } from '../../src/legacy-runtime/legacyMazeIslands';
import { MIN_DEAD_END_BRANCH_CELLS, collectDeadEndBranches } from '../../src/legacy-runtime/legacyMazeStubs';
import {
  LADDER_BOARDS,
  countMazeStubs,
  generateStubCensusMaze,
  seedForIndex,
  type StubCensusProfile
} from '../../scripts/analysis/lib/oneTileStubCensus';

// MAZER-GEN-006: the one-tile nub (a floor cell whose only open neighbour is a junction, the start and goal
// included) is gone from every generated maze, in the REAL game profile (budget ladder, play) and in the
// MAIN MENU demo profile (VIS-052, which never reaches the felt tuner and used to carry 9-20 nubs a maze).
// The mazes are built exactly as MenuScene builds them: the viewport's scale and feeder fraction, the
// profile of the mode, the board's aspect ratio, the track's target complexity.
const LEVELS = [1, 10, 20, 40, 60, 100, 140, 200, 300] as const;
const SEEDS = 4;
const PROFILES: readonly StubCensusProfile[] = ['play', 'menu'];

describe('no one-tile stubs in the play profile and the menu demo profile (MAZER-GEN-006)', () => {
  test.each(PROFILES)('%s profile: zero stubs, nothing orphaned, deterministic, on every sampled level and board', (profile) => {
    for (const board of LADDER_BOARDS) {
      for (const level of LEVELS) {
        for (let index = 0; index < SEEDS; index += 1) {
          const label = `${profile} ${board.name} level ${level} seed ${index}`;
          const maze = generateStubCensusMaze(level, board, seedForIndex(index), profile);
          // strict: dead-end branches of one cell; loose: any one-open-side cell hanging off a junction.
          expect(countMazeStubs(maze), label).toEqual({ strict: 0, loose: 0, border: 0 });
          for (const branch of collectDeadEndBranches(maze)) {
            expect(branch.length, label).toBeGreaterThanOrEqual(MIN_DEAD_END_BRANCH_CELLS);
          }
          expect(maze.grid[maze.start.y]![maze.start.x], label).toBe(true);
          expect(maze.grid[maze.goal.y]![maze.goal.x], label).toBe(true);
          expect(findFloorIslands(maze).islands, label).toEqual([]);
          if (index === 0) {
            // Same level, board and seed: the same grid, start and goal.
            const again = generateStubCensusMaze(level, board, seedForIndex(index), profile);
            expect(again.grid, label).toEqual(maze.grid);
            expect(again.start, label).toEqual(maze.start);
            expect(again.goal, label).toEqual(maze.goal);
          }
        }
      }
    }
  }, 280_000);
});
