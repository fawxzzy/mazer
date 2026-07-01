import type { LegacyMazeSnapshot, LegacyPoint } from './legacyMaze';

export interface LegacyMenuPathRenderFrame {
  leftInset: number;
  topInset: number;
  width: number;
  height: number;
}

export interface LegacyMenuPathRenderFrames {
  edge: LegacyMenuPathRenderFrame;
  core: LegacyMenuPathRenderFrame;
}

const LEGACY_MENU_TRENCH_EDGE_INSET_RATIO = 0.2;
const LEGACY_MENU_TRENCH_CORE_INSET_RATIO = 0.16;

const isWalkableGridPoint = (
  maze: Pick<LegacyMazeSnapshot, 'grid' | 'size'>,
  point: LegacyPoint
): boolean => {
  if (point.x < 0 || point.y < 0 || point.x >= maze.size || point.y >= maze.size) {
    return false;
  }

  return maze.grid[point.y]?.[point.x] === true;
};

export const resolveLegacyMenuPathRenderFrame = (
  maze: Pick<LegacyMazeSnapshot, 'grid' | 'size'>,
  point: LegacyPoint,
  tileSize: number
): LegacyMenuPathRenderFrame => {
  const edgeInset = Math.max(1, Math.floor(tileSize * LEGACY_MENU_TRENCH_EDGE_INSET_RATIO));
  const leftInset = isWalkableGridPoint(maze, { x: point.x - 1, y: point.y }) ? 0 : edgeInset;
  const rightInset = isWalkableGridPoint(maze, { x: point.x + 1, y: point.y }) ? 0 : edgeInset;
  const topInset = isWalkableGridPoint(maze, { x: point.x, y: point.y - 1 }) ? 0 : edgeInset;
  const bottomInset = isWalkableGridPoint(maze, { x: point.x, y: point.y + 1 }) ? 0 : edgeInset;

  return {
    leftInset,
    topInset,
    width: Math.max(2, tileSize - leftInset - rightInset),
    height: Math.max(2, tileSize - topInset - bottomInset)
  };
};

export const resolveLegacyMenuPathRenderFrames = (
  maze: Pick<LegacyMazeSnapshot, 'grid' | 'size'>,
  point: LegacyPoint,
  tileSize: number
): LegacyMenuPathRenderFrames => {
  const edge = resolveLegacyMenuPathRenderFrame(maze, point, tileSize);
  const coreInset = Math.max(1, Math.floor(tileSize * LEGACY_MENU_TRENCH_CORE_INSET_RATIO));
  const connectedLeft = isWalkableGridPoint(maze, { x: point.x - 1, y: point.y });
  const connectedRight = isWalkableGridPoint(maze, { x: point.x + 1, y: point.y });
  const connectedTop = isWalkableGridPoint(maze, { x: point.x, y: point.y - 1 });
  const connectedBottom = isWalkableGridPoint(maze, { x: point.x, y: point.y + 1 });
  const leftInset = connectedLeft ? edge.leftInset : edge.leftInset + coreInset;
  const topInset = connectedTop ? edge.topInset : edge.topInset + coreInset;
  const rightInset = connectedRight
    ? tileSize - edge.leftInset - edge.width
    : (tileSize - edge.leftInset - edge.width) + coreInset;
  const bottomInset = connectedBottom
    ? tileSize - edge.topInset - edge.height
    : (tileSize - edge.topInset - edge.height) + coreInset;

  return {
    edge,
    core: {
      leftInset,
      topInset,
      width: Math.max(1, tileSize - leftInset - rightInset),
      height: Math.max(1, tileSize - topInset - bottomInset)
    }
  };
};
