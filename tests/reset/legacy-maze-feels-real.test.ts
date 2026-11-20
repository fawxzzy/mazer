import { describe, expect, test } from 'vitest';
import { measureMazeRealness } from '../../scripts/analysis/lib/mazeRealness';
import {
  LADDER_BOARDS,
  generateStubCensusMaze,
  seedForIndex,
  type StubCensusProfile
} from '../../scripts/analysis/lib/oneTileStubCensus';

// MAZER-GEN-021: a generated maze reads like a real maze. The goal sits far from the start (the journey plan puts
// them in opposite end bands of the board's long axis), the route between them is long and has decisions and decoy
// branches on it. Before this card the start and goal were as close as 3% of the board apart and the shortest route
// was 0.6x the board's linear size (census, 8 seeds x 2 boards x 9 levels: span mean 0.32-0.47, route min 0.62-0.71).
// The mazes are built exactly as the game builds them (see oneTileStubCensus.generateStubCensusMaze).
//
// Floors pin the measured worst case with a small margin, per maze unless noted; they are floors, not targets.
// Level 1 is the straight corridor by design: it is pinned for span only, its route is the board's own length.
// A route of 2.5x the linear size is not reachable at every level: levels 2-3 have a felt target of 89-106, which
// the whole maze (route and branches) has to land in, so the route floor is level dependent.
const LEVELS = [1, 10, 20, 40, 60, 100, 140, 200, 300] as const;
const SEEDS = 8;
const PROFILES: readonly StubCensusProfile[] = ['play', 'menu'];

// The menu demo only pins its start (its walk stays the dense random one), so its worst maze sits lower.
const MIN_SPAN_PER_MAZE: Record<StubCensusProfile, number> = { play: 0.25, menu: 0.2 };
const MIN_SPAN_MEAN = 0.6;
const MIN_ROUTE_PER_MAZE = 1.3;
const MIN_ROUTE_MEAN: Record<StubCensusProfile, number> = { play: 2.3, menu: 1.9 };
const MIN_ROUTE_DECISIONS_MEAN = 6;
const MIN_ROUTE_DECOYS_MEAN = 3;

describe('generated mazes feel like a real maze (MAZER-GEN-021)', () => {
  test.each(PROFILES)('%s profile: far start/goal, long route, decisions and decoys on every sampled level and board', (profile) => {
    for (const board of LADDER_BOARDS) {
      let spanSum = 0;
      let routeSum = 0;
      let decisionSum = 0;
      let decoySum = 0;
      let count = 0;
      for (const level of LEVELS) {
        for (let index = 0; index < SEEDS; index += 1) {
          const label = `${profile} ${board.name} level ${level} seed ${index}`;
          const maze = generateStubCensusMaze(level, board, seedForIndex(index), profile);
          const real = measureMazeRealness(maze);
          expect(real.spanManhattan, label).toBeGreaterThanOrEqual(MIN_SPAN_PER_MAZE[profile]);
          if (level > 1) {
            expect(real.routeOverLinear, label).toBeGreaterThanOrEqual(MIN_ROUTE_PER_MAZE);
            spanSum += real.spanManhattan;
            routeSum += real.routeOverLinear;
            decisionSum += real.routeDecisions;
            decoySum += real.routeDecoys;
            count += 1;
          }
        }
      }
      const label = `${profile} ${board.name}`;
      expect(spanSum / count, `${label} mean span`).toBeGreaterThanOrEqual(MIN_SPAN_MEAN);
      expect(routeSum / count, `${label} mean route over linear size`).toBeGreaterThanOrEqual(MIN_ROUTE_MEAN[profile]);
      expect(decisionSum / count, `${label} mean decisions on the route`).toBeGreaterThanOrEqual(MIN_ROUTE_DECISIONS_MEAN);
      expect(decoySum / count, `${label} mean decoy branches on the route`).toBeGreaterThanOrEqual(MIN_ROUTE_DECOYS_MEAN);
    }
  }, 280_000);

  test('the straight-corridor level 1 keeps its far start/goal and the generation is deterministic', () => {
    for (const board of LADDER_BOARDS) {
      const a = generateStubCensusMaze(1, board, seedForIndex(0), 'play');
      const b = generateStubCensusMaze(1, board, seedForIndex(0), 'play');
      expect(a.grid).toEqual(b.grid);
      // Start and goal sit at the two ends of the long axis (the whole run).
      expect(Math.abs(a.goal.x - a.start.x) + Math.abs(a.goal.y - a.start.y)).toBe(Math.max(a.width, a.height) - 3);
      // MAZER-UI-098: 0.55, was 0.6. Size rule 2 builds level 1 small (15 x 33 phone, 27 x 17 desktop); the share counts
      // the cross axis too, so the same end-to-end run reads 0.57 on the 27 x 17 board (0.61 on the old 49 x 29).
      expect(measureMazeRealness(a).spanManhattan).toBeGreaterThanOrEqual(0.55);
    }
    const c = generateStubCensusMaze(60, LADDER_BOARDS[0], seedForIndex(3), 'menu');
    const d = generateStubCensusMaze(60, LADDER_BOARDS[0], seedForIndex(3), 'menu');
    expect(d.grid).toEqual(c.grid);
    expect(d.start).toEqual(c.start);
    expect(d.goal).toEqual(c.goal);
  });
});
