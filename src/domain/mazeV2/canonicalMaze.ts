// Bridges an already-generated legacy-runtime LegacyMazeSnapshot into the
// neutral MazeV2CanonicalMaze shape -- see that type's own doc comment in
// types.ts for why it exists (one exchange shape both engines convert into,
// so one analyzer and one identity scheme can measure either without
// engine-specific branching).

import type { LegacyMazeSnapshot } from '../../legacy-runtime/legacyMaze';
import type { MazeV2CanonicalMaze, MazeV2WrapPair } from './types';

// Wave 1.5 correction (PR D): the previous version of this function always
// returned an empty list, on the claim that legacy-runtime's own snapshot
// has no per-pair wrap list to read -- true, but beside the point. The
// actual wrap-connectivity rule lives in legacyMaze.ts's own
// resolveLegacyGridStepTarget: stepping off the left edge lands on the
// right edge of the SAME ROW (and vice versa), stepping off the top lands
// on the bottom of the SAME COLUMN (and vice versa), whenever both
// endpoints are walkable. That rule is exactly "two opposite-border
// walkable cells sharing a row/column are wrap-connected" -- fully
// derivable from the grid alone, which is what this now does, instead of
// silently reporting every legacy maze as wrap-free regardless of whether
// its wrap topology is actually in use. Confirmed against
// resolveLegacyGridStepTarget's own same-point guard (irrelevant above
// width/height 1, included here for consistency on degenerate inputs).
const deriveLegacyWrapPairs = (
  maze: Pick<LegacyMazeSnapshot, 'grid' | 'height' | 'width'>
): readonly MazeV2WrapPair[] => {
  const { grid, width, height } = maze;
  const pairs: MazeV2WrapPair[] = [];

  if (width > 1) {
    for (let y = 0; y < height; y += 1) {
      const leftWalkable = grid[y]?.[0] === true;
      const rightWalkable = grid[y]?.[width - 1] === true;
      if (leftWalkable && rightWalkable) {
        pairs.push({ from: { x: 0, y }, to: { x: width - 1, y }, axis: 'horizontal' });
      }
    }
  }

  if (height > 1) {
    for (let x = 0; x < width; x += 1) {
      const topWalkable = grid[0]?.[x] === true;
      const bottomWalkable = grid[height - 1]?.[x] === true;
      if (topWalkable && bottomWalkable) {
        pairs.push({ from: { x, y: 0 }, to: { x, y: height - 1 }, axis: 'vertical' });
      }
    }
  }

  return pairs;
};

export const deriveMazeV2CanonicalMazeFromLegacySnapshot = (
  maze: Pick<LegacyMazeSnapshot, 'width' | 'height' | 'grid' | 'start' | 'goal'>
): MazeV2CanonicalMaze => ({
  width: maze.width,
  height: maze.height,
  walkable: maze.grid.map((row) => [...row]),
  start: { x: maze.start.x, y: maze.start.y },
  goal: { x: maze.goal.x, y: maze.goal.y },
  wrapPairs: deriveLegacyWrapPairs(maze)
});
