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

export type LegacyMenuBorderDockDirection = 'bottom' | 'left' | 'right' | 'top';

export interface LegacyMenuPixelRect {
  height: number;
  left: number;
  top: number;
  width: number;
}

export interface LegacyMenuBorderDockRenderArea {
  bottom: number;
  left: number;
  right: number;
  top: number;
}

export interface LegacyMenuBorderDockRenderOptions {
  boardLeft: number;
  boardSize: number;
  boardTop: number;
  cornerGuardSize: number;
  materialTileSize: number;
  mazeLeft: number;
  mazeSize: number;
  mazeTop: number;
  tileRect: LegacyMenuPixelRect;
}

export interface LegacyPlayerMarkerRenderMetrics {
  coreRadius: number;
  haloRadius: number;
  strokeWidth: number;
}

export interface LegacyPlayerLocatorRenderMetrics {
  innerRadius: number;
  outerRadius: number;
  strokeWidth: number;
}

export interface LegacyEndpointMarkerRenderMetrics {
  coreRadius: number;
  outerRadius: number;
  strokeWidth: number;
}

const LEGACY_MENU_TRENCH_EDGE_INSET_RATIO = 0.18;
const LEGACY_MENU_TRENCH_CORE_INSET_RATIO = 0.08;

const resolveLegacyMenuTrenchInset = (tileSize: number, ratio: number): number => {
  if (tileSize < 4) {
    return 0;
  }

  return Math.max(1, Math.floor(tileSize * ratio));
};

export const resolveLegacyDynamicMarkerInset = (
  tileSize: number,
  ratio: number
): number => {
  const maxInset = Math.max(0, Math.floor((tileSize - 1) / 2));
  const minimumInset = tileSize <= 4 ? 0 : 2;
  return Math.min(maxInset, Math.max(minimumInset, Math.floor(tileSize * ratio)));
};

export const resolveLegacyDynamicTrailStrokeWidth = (
  tileSize: number,
  ratio: number,
  minimumWidth: number
): number => {
  const maxWidth = Math.max(1, Math.floor(tileSize));
  return Math.min(maxWidth, Math.max(minimumWidth, Math.round(tileSize * ratio)));
};

export const resolveLegacyPlayerMarkerRenderMetrics = (
  tileSize: number,
  coreRatio: number,
  haloRatio: number
): LegacyPlayerMarkerRenderMetrics => {
  const maxHaloRadius = Math.max(1, tileSize * 0.46);
  const maxCoreRadius = Math.max(1, tileSize * 0.38);
  const haloRadius = Math.min(
    maxHaloRadius,
    Math.max(1, tileSize * haloRatio)
  );
  const coreRadius = Math.min(
    maxCoreRadius,
    Math.max(1, tileSize * coreRatio)
  );

  return {
    coreRadius,
    haloRadius,
    strokeWidth: Math.max(1, Math.min(2, Math.floor(tileSize * 0.12)))
  };
};

export const resolveLegacyPlayerLocatorRenderMetrics = (
  tileSize: number,
  haloRadius: number,
  strokeWidth: number
): LegacyPlayerLocatorRenderMetrics => {
  const maxOuterRadius = Math.max(1, tileSize * 0.48);
  const responsiveOuterRadius = Math.max(haloRadius + (strokeWidth * 0.5), tileSize * 0.46);
  const outerRadius = Math.min(maxOuterRadius, responsiveOuterRadius);
  const tickLength = Math.min(Math.max(1, tileSize * 0.16), outerRadius * 0.52);

  return {
    innerRadius: Math.max(0.5, outerRadius - tickLength),
    outerRadius,
    strokeWidth: Math.max(1, strokeWidth)
  };
};

export const resolveLegacyEndpointMarkerRenderMetrics = (
  tileSize: number
): LegacyEndpointMarkerRenderMetrics => {
  const strokeWidth = Math.max(1, Math.round(tileSize * 0.1));
  const outerRadius = Math.max(1, tileSize * 0.48);
  const coreRadius = Math.max(1, Math.min(tileSize * 0.28, outerRadius * 0.58));

  return {
    coreRadius,
    outerRadius,
    strokeWidth
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

const isNonCornerBorderPoint = (
  maze: Pick<LegacyMazeSnapshot, 'size'>,
  point: LegacyPoint
): boolean => (
  point.x >= 0
  && point.y >= 0
  && point.x < maze.size
  && point.y < maze.size
  && (point.x === 0 || point.y === 0 || point.x === maze.size - 1 || point.y === maze.size - 1)
  && !((point.x === 0 || point.x === maze.size - 1) && (point.y === 0 || point.y === maze.size - 1))
);

const resolveOppositeBorderPoint = (
  maze: Pick<LegacyMazeSnapshot, 'size'>,
  point: LegacyPoint
): LegacyPoint | null => {
  if (!isNonCornerBorderPoint(maze, point)) {
    return null;
  }

  if (point.x === 0) {
    return { x: maze.size - 1, y: point.y };
  }
  if (point.x === maze.size - 1) {
    return { x: 0, y: point.y };
  }
  if (point.y === 0) {
    return { x: point.x, y: maze.size - 1 };
  }
  if (point.y === maze.size - 1) {
    return { x: point.x, y: 0 };
  }

  return null;
};

export const resolveLegacyMenuBorderDockDirections = (
  maze: Pick<LegacyMazeSnapshot, 'grid' | 'size'>,
  point: LegacyPoint
): LegacyMenuBorderDockDirection[] => {
  if (!isWalkableGridPoint(maze, point) || !isNonCornerBorderPoint(maze, point)) {
    return [];
  }

  const opposite = resolveOppositeBorderPoint(maze, point);
  if (!opposite || !isWalkableGridPoint(maze, opposite)) {
    return [];
  }

  const directions: LegacyMenuBorderDockDirection[] = [];
  if (point.x === 0) {
    directions.push('left');
  }
  if (point.x === maze.size - 1) {
    directions.push('right');
  }
  if (point.y === 0) {
    directions.push('top');
  }
  if (point.y === maze.size - 1) {
    directions.push('bottom');
  }

  return directions;
};

const isLegacyMenuPathConnected = (
  maze: Pick<LegacyMazeSnapshot, 'grid' | 'size'>,
  point: LegacyPoint,
  direction: LegacyMenuBorderDockDirection
): boolean => {
  const neighbor = direction === 'left'
    ? { x: point.x - 1, y: point.y }
    : direction === 'right'
      ? { x: point.x + 1, y: point.y }
      : direction === 'top'
        ? { x: point.x, y: point.y - 1 }
        : { x: point.x, y: point.y + 1 };

  return isWalkableGridPoint(maze, neighbor)
    || resolveLegacyMenuBorderDockDirections(maze, point).includes(direction);
};

export const resolveLegacyMenuPathRenderFrame = (
  maze: Pick<LegacyMazeSnapshot, 'grid' | 'size'>,
  point: LegacyPoint,
  tileSize: number
): LegacyMenuPathRenderFrame => {
  const edgeInset = resolveLegacyMenuTrenchInset(tileSize, LEGACY_MENU_TRENCH_EDGE_INSET_RATIO);
  const leftInset = isLegacyMenuPathConnected(maze, point, 'left') ? 0 : edgeInset;
  const rightInset = isLegacyMenuPathConnected(maze, point, 'right') ? 0 : edgeInset;
  const topInset = isLegacyMenuPathConnected(maze, point, 'top') ? 0 : edgeInset;
  const bottomInset = isLegacyMenuPathConnected(maze, point, 'bottom') ? 0 : edgeInset;

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
  const connectedLeft = isLegacyMenuPathConnected(maze, point, 'left');
  const connectedRight = isLegacyMenuPathConnected(maze, point, 'right');
  const connectedTop = isLegacyMenuPathConnected(maze, point, 'top');
  const connectedBottom = isLegacyMenuPathConnected(maze, point, 'bottom');
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

export const resolveLegacyMenuBorderDockRenderAreas = (
  direction: LegacyMenuBorderDockDirection,
  frame: LegacyMenuPathRenderFrame,
  options: LegacyMenuBorderDockRenderOptions
): LegacyMenuBorderDockRenderArea[] => {
  const boardRight = options.boardLeft + options.boardSize;
  const boardBottom = options.boardTop + options.boardSize;
  const mazeRight = options.mazeLeft + options.mazeSize;
  const mazeBottom = options.mazeTop + options.mazeSize;
  const materialTileSize = Math.max(1, options.materialTileSize);
  const bandLeft = options.tileRect.left + Math.round((frame.leftInset / materialTileSize) * options.tileRect.width);
  const bandTop = options.tileRect.top + Math.round((frame.topInset / materialTileSize) * options.tileRect.height);
  const bandRight = options.tileRect.left + Math.round(((frame.leftInset + frame.width) / materialTileSize) * options.tileRect.width);
  const bandBottom = options.tileRect.top + Math.round(((frame.topInset + frame.height) / materialTileSize) * options.tileRect.height);
  const cornerGuardSize = Math.max(0, Math.round(options.cornerGuardSize));
  const topGuard = options.boardTop + cornerGuardSize;
  const bottomGuard = boardBottom - cornerGuardSize;
  const leftGuard = options.boardLeft + cornerGuardSize;
  const rightGuard = boardRight - cornerGuardSize;
  const areas: LegacyMenuBorderDockRenderArea[] = [];

  const pushArea = (area: LegacyMenuBorderDockRenderArea): void => {
    if (Math.round(area.right - area.left) <= 0 || Math.round(area.bottom - area.top) <= 0) {
      return;
    }

    areas.push(area);
  };

  if (direction === 'left') {
    const left = options.boardLeft - 1;
    const right = options.mazeLeft;
    pushArea({ left, top: bandTop, right, bottom: bandBottom });
    if (bandTop < topGuard) {
      pushArea({ left, top: bandTop, right, bottom: topGuard });
    }
    if (bandBottom > bottomGuard) {
      pushArea({ left, top: bottomGuard, right, bottom: bandBottom });
    }
    return areas;
  }

  if (direction === 'right') {
    const left = mazeRight;
    const right = boardRight + 1;
    pushArea({ left, top: bandTop, right, bottom: bandBottom });
    if (bandTop < topGuard) {
      pushArea({ left, top: bandTop, right, bottom: topGuard });
    }
    if (bandBottom > bottomGuard) {
      pushArea({ left, top: bottomGuard, right, bottom: bandBottom });
    }
    return areas;
  }

  if (direction === 'top') {
    const top = options.boardTop - 1;
    const bottom = options.mazeTop;
    pushArea({ left: bandLeft, top, right: bandRight, bottom });
    if (bandLeft < leftGuard) {
      pushArea({ left: bandLeft, top, right: leftGuard, bottom });
    }
    if (bandRight > rightGuard) {
      pushArea({ left: rightGuard, top, right: bandRight, bottom });
    }
    return areas;
  }

  const top = mazeBottom;
  const bottom = boardBottom + 1;
  pushArea({ left: bandLeft, top, right: bandRight, bottom });
  if (bandLeft < leftGuard) {
    pushArea({ left: bandLeft, top, right: leftGuard, bottom });
  }
  if (bandRight > rightGuard) {
    pushArea({ left: rightGuard, top, right: bandRight, bottom });
  }

  return areas;
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

  if (isLegacyMenuPathConnected(maze, point, 'left')) {
    segments.push({
      leftInset: 0,
      topInset: inset,
      width: inset + centerSpan,
      height: centerSpan
    });
  }
  if (isLegacyMenuPathConnected(maze, point, 'right')) {
    segments.push({
      leftInset: inset,
      topInset: inset,
      width: tileSize - inset,
      height: centerSpan
    });
  }
  if (isLegacyMenuPathConnected(maze, point, 'top')) {
    segments.push({
      leftInset: inset,
      topInset: 0,
      width: centerSpan,
      height: inset + centerSpan
    });
  }
  if (isLegacyMenuPathConnected(maze, point, 'bottom')) {
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
