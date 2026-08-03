import { describe, expect, test } from 'vitest';

import {
  LEGACY_MENU_SNAPSHOT_SIZE,
  resolveLegacyMenuSnapshotBlueprint,
  type LegacyMenuSnapshotPoint,
  type LegacyMenuSnapshotPolyline
} from '../../src/legacy-runtime/legacyMenuSnapshot';

const EXPECTED_BRANCH_IDS = [
  'upper-ridge',
  'top-spine',
  'upper-left-pocket',
  'upper-left-lattice',
  'left-frame',
  'center-band',
  'center-pocket',
  'title-trench',
  'title-underlay-band',
  'upper-right-lattice',
  'left-interior-drop',
  'mid-left-shelf',
  'lower-left-shelves',
  'diagonal-upper',
  'diagonal-lower',
  'lower-band',
  'lower-floor-trench',
  'lower-center-loop',
  'right-pocket',
  'right-spine',
  'right-lower-notch',
  'right-inner-pocket'
];

// appendSegment rasterizes every intermediate integer step between two points
// in SCALED coordinate space (it runs once per already-scaled point, filling
// single-unit steps to get there) -- so the final path moves by exactly 1
// along a single axis per step, not by the raw-to-scaled factor itself.
const assertOrthogonalUnitSteps = (points: LegacyMenuSnapshotPoint[], label: string) => {
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1]!;
    const current = points[index]!;
    const dx = Math.abs(current.x - previous.x);
    const dy = Math.abs(current.y - previous.y);

    const isValidStep = (dx === 1 && dy === 0) || (dx === 0 && dy === 1);

    expect(isValidStep, `${label}: step ${index - 1}->${index} (${previous.x},${previous.y})->(${current.x},${current.y}) must move exactly 1 along a single axis`).toBe(true);
  }
};

describe('resolveLegacyMenuSnapshotBlueprint', () => {
  test('returns the fixed 49-tile snapshot size', () => {
    const blueprint = resolveLegacyMenuSnapshotBlueprint();
    expect(blueprint.size).toBe(LEGACY_MENU_SNAPSHOT_SIZE);
    expect(blueprint.size).toBe(49);
  });

  test('solution path starts and ends at the exact points the fixed menu maze snapshot test already relies on', () => {
    const blueprint = resolveLegacyMenuSnapshotBlueprint();
    // createLegacyMenuMaze(3749) asserts start={x:6,y:8} and goal={x:44,y:44} in
    // tests/reset/legacy-reset.test.ts -- this blueprint's raw path (3,4)->(22,22)
    // scaled by 2 is the source of those exact values, so this is a real
    // cross-check, not an arbitrary assertion.
    expect(blueprint.solutionPath[0]).toEqual({ x: 6, y: 8 });
    expect(blueprint.solutionPath.at(-1)).toEqual({ x: 44, y: 44 });
  });

  test('solution path is a fully connected orthogonal rasterization with no diagonal jumps', () => {
    const blueprint = resolveLegacyMenuSnapshotBlueprint();
    assertOrthogonalUnitSteps(blueprint.solutionPath, 'solutionPath');
  });

  test('produces exactly the expected 22 branch ids, no duplicates, no extras', () => {
    const blueprint = resolveLegacyMenuSnapshotBlueprint();
    const ids = blueprint.branches.map((branch) => branch.id);
    expect(ids).toEqual(EXPECTED_BRANCH_IDS);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('every branch polyline is a fully connected orthogonal rasterization, including the staircase-built diagonals', () => {
    const blueprint = resolveLegacyMenuSnapshotBlueprint();
    for (const branch of blueprint.branches) {
      expect(branch.points.length).toBeGreaterThan(0);
      assertOrthogonalUnitSteps(branch.points, branch.id);
    }
  });

  test('the diagonal-upper and diagonal-lower staircases climb in a single consistent direction with the expected step count', () => {
    const blueprint = resolveLegacyMenuSnapshotBlueprint();
    const byId = new Map<string, LegacyMenuSnapshotPolyline>(blueprint.branches.map((branch) => [branch.id, branch]));

    const diagonalUpper = byId.get('diagonal-upper')!;
    // buildStaircase({x:5,y:4}, 8, 1, 1) produces 17 raw points, each pair 1 raw
    // unit apart; scaling to (10,8)..(26,24) and rasterizing every intermediate
    // scaled step (see assertOrthogonalUnitSteps) yields 33 points end to end.
    expect(diagonalUpper.points).toHaveLength(33);
    expect(diagonalUpper.points[0]).toEqual({ x: 10, y: 8 });
    expect(diagonalUpper.points.at(-1)).toEqual({ x: 26, y: 24 });

    const diagonalLower = byId.get('diagonal-lower')!;
    // buildStaircase({x:8,y:14}, 7, 1, 1) -> scaled (16,28)..(30,42), 29 points
    // once every intermediate step is rasterized.
    expect(diagonalLower.points).toHaveLength(29);
    expect(diagonalLower.points[0]).toEqual({ x: 16, y: 28 });
    expect(diagonalLower.points.at(-1)).toEqual({ x: 30, y: 42 });
  });

  test('every coordinate across the whole blueprint stays within the 49x49 snapshot bounds', () => {
    const blueprint = resolveLegacyMenuSnapshotBlueprint();
    const allPoints = [blueprint.solutionPath, ...blueprint.branches.map((branch) => branch.points)].flat();
    for (const point of allPoints) {
      expect(point.x).toBeGreaterThanOrEqual(0);
      expect(point.y).toBeGreaterThanOrEqual(0);
      expect(point.x).toBeLessThan(blueprint.size);
      expect(point.y).toBeLessThan(blueprint.size);
    }
  });

  test('is deterministic and produces fresh, independently-mutable objects on every call', () => {
    const first = resolveLegacyMenuSnapshotBlueprint();
    const second = resolveLegacyMenuSnapshotBlueprint();

    expect(second).toEqual(first);
    expect(second).not.toBe(first);
    expect(second.solutionPath).not.toBe(first.solutionPath);
    expect(second.branches).not.toBe(first.branches);

    // Mutating one call's result must never affect another call's result.
    first.solutionPath[0]!.x = 9999;
    expect(second.solutionPath[0]!.x).not.toBe(9999);
  });
});
