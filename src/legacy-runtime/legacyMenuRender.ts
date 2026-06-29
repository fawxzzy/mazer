import type { LegacyMazeSnapshot, LegacyPoint } from './legacyMaze';

export interface LegacyMenuPathRenderFrame {
  leftInset: number;
  topInset: number;
  width: number;
  height: number;
}

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
  const edgeInset = Math.max(1, Math.floor(tileSize * 0.12));
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
