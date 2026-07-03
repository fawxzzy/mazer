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

export interface LegacyMenuPathRenderSegments {
  edge: LegacyMenuPathRenderFrame[];
  core: LegacyMenuPathRenderFrame[];
}

export interface LegacyPlayerMarkerRenderMetrics {
  coreRadius: number;
  haloRadius: number;
  strokeWidth: number;
}

const LEGACY_MENU_TRENCH_EDGE_INSET_RATIO = 0.14;
const LEGACY_MENU_TRENCH_CORE_INSET_RATIO = 0.04;

const resolveLegacyMenuTrenchInset = (tileSize: number, ratio: number): number => {
  if (tileSize <= 8) {
    return 0;
  }

  return Math.max(1, Math.floor(tileSize * ratio));
};

export const resolveLegacyDynamicMarkerInset = (
  tileSize: number,
  ratio: number
): number => {
  const maxInset = Math.max(0, Math.floor((tileSize - 1) / 2));
  const minimumInset = tileSize <= 4 ? 1 : 2;
  return Math.min(maxInset, Math.max(minimumInset, Math.floor(tileSize * ratio)));
};

export const resolveLegacyDynamicTrailStrokeWidth = (
  tileSize: number,
  ratio: number,
  minimumWidth: number
): number => {
  const maxWidth = Math.max(1, Math.floor(tileSize));
  const responsiveMinimum = tileSize <= 4 ? 1 : minimumWidth;
  return Math.min(maxWidth, Math.max(responsiveMinimum, Math.round(tileSize * ratio)));
};

export const resolveLegacyPlayerMarkerRenderMetrics = (
  tileSize: number,
  coreRatio: number,
  haloRatio: number
): LegacyPlayerMarkerRenderMetrics => {
  const maxHaloRadius = Math.max(1, Math.ceil(tileSize * 0.56));
  const maxCoreRadius = Math.max(1, Math.floor(tileSize * 0.42));
  const haloRadius = Math.min(
    maxHaloRadius,
    Math.max(tileSize <= 4 ? 2 : 3, Math.round(tileSize * haloRatio))
  );
  const coreRadius = Math.min(
    maxCoreRadius,
    Math.max(1, Math.round(tileSize * coreRatio))
  );

  return {
    coreRadius,
    haloRadius,
    strokeWidth: Math.max(1, Math.floor(tileSize * 0.12))
  };
};

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
  const edgeInset = resolveLegacyMenuTrenchInset(tileSize, LEGACY_MENU_TRENCH_EDGE_INSET_RATIO);
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
  const coreInset = resolveLegacyMenuTrenchInset(tileSize, LEGACY_MENU_TRENCH_CORE_INSET_RATIO);
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

const resolveLegacyMenuPathStrokeSegments = (
  maze: Pick<LegacyMazeSnapshot, 'grid' | 'size'>,
  point: LegacyPoint,
  tileSize: number,
  strokeWidth: number
): LegacyMenuPathRenderFrame[] => {
  const inset = Math.max(0, Math.floor((tileSize - strokeWidth) / 2));
  const centerSpan = Math.max(1, tileSize - (inset * 2));
  const segments: LegacyMenuPathRenderFrame[] = [
    {
      leftInset: inset,
      topInset: inset,
      width: centerSpan,
      height: centerSpan
    }
  ];

  if (isWalkableGridPoint(maze, { x: point.x - 1, y: point.y })) {
    segments.push({
      leftInset: 0,
      topInset: inset,
      width: inset + centerSpan,
      height: centerSpan
    });
  }
  if (isWalkableGridPoint(maze, { x: point.x + 1, y: point.y })) {
    segments.push({
      leftInset: inset,
      topInset: inset,
      width: tileSize - inset,
      height: centerSpan
    });
  }
  if (isWalkableGridPoint(maze, { x: point.x, y: point.y - 1 })) {
    segments.push({
      leftInset: inset,
      topInset: 0,
      width: centerSpan,
      height: inset + centerSpan
    });
  }
  if (isWalkableGridPoint(maze, { x: point.x, y: point.y + 1 })) {
    segments.push({
      leftInset: inset,
      topInset: inset,
      width: centerSpan,
      height: tileSize - inset
    });
  }

  return segments;
};

export const resolveLegacyMenuPathRenderSegments = (
  maze: Pick<LegacyMazeSnapshot, 'grid' | 'size'>,
  point: LegacyPoint,
  tileSize: number
): LegacyMenuPathRenderSegments => {
  const edgeInset = resolveLegacyMenuTrenchInset(tileSize, LEGACY_MENU_TRENCH_EDGE_INSET_RATIO);
  const coreInset = resolveLegacyMenuTrenchInset(tileSize, LEGACY_MENU_TRENCH_CORE_INSET_RATIO);
  const edgeWidth = Math.max(2, tileSize - (edgeInset * 2));
  const coreWidth = Math.max(1, tileSize - ((edgeInset + coreInset) * 2));

  return {
    edge: resolveLegacyMenuPathStrokeSegments(maze, point, tileSize, edgeWidth),
    core: resolveLegacyMenuPathStrokeSegments(maze, point, tileSize, coreWidth)
  };
};
