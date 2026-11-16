import { describe, expect, test } from 'vitest';
import { resolveFarthestReachableFloor } from '../../src/legacy-runtime/legacyMaze';

// MAZER-GEN-021 review finding: when the final route state re-places a goal that is under the 1.5x route floor, the
// span-aware pick must not choose a tile whose route is still under that floor just because it is far from the start
// on the board. The old call passed the current (sub-minimum) route length as the pick's only floor, so a tile a
// little longer than the failing route but still under the floor could win on span.
//
// Board (x right, y down), start (0,0). One tree, no loops:
//   row 0: x 0..22      the spine; its far end (22,0) is 22 steps away and 22 columns from the start
//   (12,1), (12,2)      a turn down at x 12 (14 steps)
//   row 2: x 0..12      walks back left under the spine to (0,2): 26 steps, 2 rows from the start
//   col 0: y 3..4       ends at (0,4): 28 steps, the longest route and only 4 cells from the start by Manhattan
const buildGrid = (): boolean[][] => {
  const width = 23;
  const height = 5;
  const grid = Array.from({ length: height }, () => Array.from({ length: width }, () => false));
  for (let x = 0; x <= 22; x += 1) { grid[0]![x] = true; }
  grid[1]![12] = true;
  for (let x = 0; x <= 12; x += 1) { grid[2]![x] = true; }
  grid[3]![0] = true;
  grid[4]![0] = true;
  return grid;
};

describe('goal re-placement honours the route floor (MAZER-GEN-021 review)', () => {
  const start = { x: 0, y: 0 };

  test('without a route floor the far-on-board spine end still wins (the 0.7 rule is unchanged)', () => {
    const picked = resolveFarthestReachableFloor(buildGrid(), start, 20);
    expect(picked.point).toEqual({ x: 22, y: 0 });
    expect(picked.distance).toBe(22);
  });

  test('a goal under the floor can not win when the farthest tile reaches the floor', () => {
    // Floor 26 cells = 25 steps. (22,0) is 22 steps: under it. Tiles at 25 steps or more are the only candidates.
    const picked = resolveFarthestReachableFloor(buildGrid(), start, 20, 25);
    expect(picked.distance).toBeGreaterThanOrEqual(25);
    expect(picked.point).toEqual({ x: 0, y: 4 });
  });

  test('when no tile reaches the floor the old rule applies (the floor can not be met anyway)', () => {
    const picked = resolveFarthestReachableFloor(buildGrid(), start, 20, 40);
    expect(picked.point).toEqual({ x: 22, y: 0 });
  });

  test('the pick is deterministic', () => {
    expect(resolveFarthestReachableFloor(buildGrid(), start, 20, 25)).toEqual(resolveFarthestReachableFloor(buildGrid(), start, 20, 25));
  });
});
