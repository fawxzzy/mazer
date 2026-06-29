export interface LegacyMenuSnapshotPoint {
  x: number;
  y: number;
}

export interface LegacyMenuSnapshotPolyline {
  id: string;
  points: LegacyMenuSnapshotPoint[];
}

export interface LegacyMenuSnapshotBlueprint {
  size: number;
  solutionPath: LegacyMenuSnapshotPoint[];
  branches: LegacyMenuSnapshotPolyline[];
}

export const LEGACY_MENU_SNAPSHOT_SIZE = 25;

const appendSegment = (path: LegacyMenuSnapshotPoint[], to: LegacyMenuSnapshotPoint): void => {
  const from = path[path.length - 1];
  if (!from) {
    path.push({ ...to });
    return;
  }

  if (from.x !== to.x && from.y !== to.y) {
    throw new Error(`Legacy path segment must stay orthogonal: ${from.x},${from.y} -> ${to.x},${to.y}`);
  }

  const stepX = from.x === to.x ? 0 : (from.x < to.x ? 1 : -1);
  const stepY = from.y === to.y ? 0 : (from.y < to.y ? 1 : -1);
  let cursorX = from.x;
  let cursorY = from.y;

  while (cursorX !== to.x || cursorY !== to.y) {
    cursorX += stepX;
    cursorY += stepY;
    path.push({ x: cursorX, y: cursorY });
  }
};

const buildStaircase = (
  start: LegacyMenuSnapshotPoint,
  steps: number,
  horizontalDirection: 1 | -1,
  verticalDirection: 1 | -1
): LegacyMenuSnapshotPoint[] => {
  const points: LegacyMenuSnapshotPoint[] = [{ ...start }];
  let cursor = { ...start };

  for (let index = 0; index < steps; index += 1) {
    cursor = { x: cursor.x + horizontalDirection, y: cursor.y };
    points.push({ ...cursor });
    cursor = { x: cursor.x, y: cursor.y + verticalDirection };
    points.push({ ...cursor });
  }

  return points;
};

const buildSolutionPath = (): LegacyMenuSnapshotPoint[] => {
  const path: LegacyMenuSnapshotPoint[] = [{ x: 3, y: 4 }];

  appendSegment(path, { x: 8, y: 4 });
  appendSegment(path, { x: 8, y: 7 });
  appendSegment(path, { x: 5, y: 7 });
  appendSegment(path, { x: 5, y: 12 });
  appendSegment(path, { x: 10, y: 12 });
  appendSegment(path, { x: 10, y: 9 });
  appendSegment(path, { x: 14, y: 9 });
  appendSegment(path, { x: 14, y: 13 });
  appendSegment(path, { x: 12, y: 13 });
  appendSegment(path, { x: 12, y: 17 });
  appendSegment(path, { x: 14, y: 17 });
  appendSegment(path, { x: 14, y: 18 });
  appendSegment(path, { x: 15, y: 18 });
  appendSegment(path, { x: 15, y: 19 });
  appendSegment(path, { x: 16, y: 19 });
  appendSegment(path, { x: 16, y: 20 });
  appendSegment(path, { x: 17, y: 20 });
  appendSegment(path, { x: 17, y: 21 });
  appendSegment(path, { x: 20, y: 21 });
  appendSegment(path, { x: 20, y: 13 });
  appendSegment(path, { x: 22, y: 13 });
  appendSegment(path, { x: 22, y: 22 });

  return path;
};

const buildBranchPolylines = (): LegacyMenuSnapshotPolyline[] => {
  const topSpine: LegacyMenuSnapshotPoint[] = [{ x: 3, y: 2 }];
  appendSegment(topSpine, { x: 10, y: 2 });
  appendSegment(topSpine, { x: 10, y: 5 });
  appendSegment(topSpine, { x: 16, y: 5 });
  appendSegment(topSpine, { x: 16, y: 2 });
  appendSegment(topSpine, { x: 21, y: 2 });
  appendSegment(topSpine, { x: 21, y: 8 });
  appendSegment(topSpine, { x: 18, y: 8 });

  const leftFrame: LegacyMenuSnapshotPoint[] = [{ x: 2, y: 4 }];
  appendSegment(leftFrame, { x: 2, y: 22 });
  appendSegment(leftFrame, { x: 6, y: 22 });
  appendSegment(leftFrame, { x: 6, y: 19 });
  appendSegment(leftFrame, { x: 9, y: 19 });

  const centerBand: LegacyMenuSnapshotPoint[] = [{ x: 8, y: 10 }];
  appendSegment(centerBand, { x: 18, y: 10 });
  appendSegment(centerBand, { x: 18, y: 16 });
  appendSegment(centerBand, { x: 15, y: 16 });
  appendSegment(centerBand, { x: 15, y: 12 });

  const lowerBand: LegacyMenuSnapshotPoint[] = [{ x: 7, y: 15 }];
  appendSegment(lowerBand, { x: 7, y: 21 });
  appendSegment(lowerBand, { x: 13, y: 21 });
  appendSegment(lowerBand, { x: 13, y: 23 });
  appendSegment(lowerBand, { x: 18, y: 23 });

  const rightPocket: LegacyMenuSnapshotPoint[] = [{ x: 19, y: 13 }];
  appendSegment(rightPocket, { x: 19, y: 6 });
  appendSegment(rightPocket, { x: 23, y: 6 });
  appendSegment(rightPocket, { x: 23, y: 18 });
  appendSegment(rightPocket, { x: 21, y: 18 });

  const rightSpine: LegacyMenuSnapshotPoint[] = [{ x: 21, y: 12 }];
  appendSegment(rightSpine, { x: 23, y: 12 });
  appendSegment(rightSpine, { x: 23, y: 20 });
  appendSegment(rightSpine, { x: 20, y: 20 });

  return [
    { id: 'top-spine', points: topSpine },
    { id: 'left-frame', points: leftFrame },
    { id: 'center-band', points: centerBand },
    { id: 'diagonal-upper', points: buildStaircase({ x: 6, y: 5 }, 6, 1, 1) },
    { id: 'diagonal-lower', points: buildStaircase({ x: 8, y: 14 }, 6, 1, 1) },
    { id: 'lower-band', points: lowerBand },
    { id: 'right-pocket', points: rightPocket },
    { id: 'right-spine', points: rightSpine }
  ];
};

export const resolveLegacyMenuSnapshotBlueprint = (): LegacyMenuSnapshotBlueprint => ({
  size: LEGACY_MENU_SNAPSHOT_SIZE,
  solutionPath: buildSolutionPath(),
  branches: buildBranchPolylines()
});
