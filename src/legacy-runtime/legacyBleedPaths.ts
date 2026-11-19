// MAZER-L8: bleed-off path audit and limits.
//
// A bleed-off path is a pair of opposite border openings on one line: stepping out of one border cell
// re-enters the opposite border cell (the wrap). A horizontal path is a row (left/right borders), a
// vertical path is a column (top/bottom borders). This module is pure: it lists the paths of a finished
// grid, measures what each one saves, and picks the set to keep under the limits (a cap per axis, a
// minimum spacing for two, and a floor on how much of the direct route the wraps may remove).
//
// Gate-ready: a path can be flagged `gated`. A gated path is unavailable to every search here (and must
// be to the AI) until its gate is triggered, see `isBleedPathAvailable`. No gate tile exists yet.

import type { LegacyPoint } from './legacyMaze';

export type BleedAxis = 'horizontal' | 'vertical';

export interface BleedPath {
  axis: BleedAxis;
  // Row index for a horizontal path, column index for a vertical one.
  line: number;
  // Set later by a gate tile (not built yet). Gated paths are closed to searches until triggered.
  gated?: boolean;
}

export interface BleedPathMeasure extends BleedPath {
  // Shortest steps with only this path's wrap, every other bleed path closed (null: goal unreachable).
  stepsAlone: number | null;
  // Steps the path saves against the direct route (no wrap at all); 0 when it saves nothing.
  saving: number;
}

export interface BleedLimitOptions {
  // Paths allowed per axis. 1 normally; 2 only on a large axis, see resolveBleedAxisCap.
  capPerAxis: { horizontal: number; vertical: number };
  // Axes that must keep one path (the profile's required opposite-border connections).
  requiredAxes: { horizontal: boolean; vertical: boolean };
  // The kept wraps may not shorten the shortest route below this share of the direct route.
  minRouteRatio: number;
  // A single path may not save more than this share of the direct route on its own.
  maxSingleSavingRatio: number;
  // Two paths on one axis must be at least this many lines apart.
  minSeparation: (axisLength: number) => number;
}

export const BLEED_LARGE_AXIS_LENGTH = 41;
export const BLEED_DEFAULT_MIN_ROUTE_RATIO = 0.6;
export const BLEED_DEFAULT_MAX_SINGLE_SAVING_RATIO = 0.3;
// Earlier placement aims a path's saving at this share of the direct route: a real but modest shortcut.
export const BLEED_TARGET_SAVING_RATIO = 0.15;

export const bleedPathKey = (path: Pick<BleedPath, 'axis' | 'line'>): string => `${path.axis}:${path.line}`;

// A gated path is closed until its gate is triggered; `triggered` holds the keys of lit gates.
export const isBleedPathAvailable = (path: BleedPath, triggered?: ReadonlySet<string>): boolean => (
  path.gated !== true || triggered?.has(bleedPathKey(path)) === true
);

export const resolveBleedAxisLength = (axis: BleedAxis, width: number, height: number): number => (
  axis === 'horizontal' ? height : width
);

// One per axis normally. Two only when the board axis is large and the profile asked for 2 or more.
export const resolveBleedAxisCap = (axisLength: number, requestedPerSide: number | null | undefined): number => (
  axisLength >= BLEED_LARGE_AXIS_LENGTH && (requestedPerSide ?? 0) >= 2 ? 2 : 1
);

export const DEFAULT_MIN_SEPARATION = (axisLength: number): number => Math.max(8, Math.floor(axisLength / 3));

const dimensions = (grid: boolean[][]): { width: number; height: number } => ({
  width: grid[0]?.length ?? 0,
  height: grid.length
});

const isOpenAt = (grid: boolean[][], x: number, y: number): boolean => grid[y]?.[x] === true;

// Every line with a wrap-capable pair (both opposite border cells open), corners excluded.
export const listBleedPaths = (grid: boolean[][]): BleedPath[] => {
  const { width, height } = dimensions(grid);
  const paths: BleedPath[] = [];
  for (let y = 1; y < height - 1; y += 1) {
    if (isOpenAt(grid, 0, y) && isOpenAt(grid, width - 1, y)) {
      paths.push({ axis: 'horizontal', line: y });
    }
  }
  for (let x = 1; x < width - 1; x += 1) {
    if (isOpenAt(grid, x, 0) && isOpenAt(grid, x, height - 1)) {
      paths.push({ axis: 'vertical', line: x });
    }
  }
  return paths;
};

// Wrap-aware shortest step count over the grid. Wraps on closed lines (or on gated lines whose gate is
// not triggered) are not taken. Returns null when the goal cannot be reached.
export const measureBleedShortestSteps = (
  grid: boolean[][],
  start: LegacyPoint,
  goal: LegacyPoint,
  closedKeys: ReadonlySet<string> = new Set<string>()
): number | null => {
  const { width, height } = dimensions(grid);
  if (!isOpenAt(grid, start.x, start.y) || !isOpenAt(grid, goal.x, goal.y)) {
    return null;
  }
  const dist = new Int32Array(width * height).fill(-1);
  const queue = new Int32Array(width * height);
  let head = 0;
  let tail = 0;
  const startIndex = (start.y * width) + start.x;
  const goalIndex = (goal.y * width) + goal.x;
  dist[startIndex] = 0;
  queue[tail++] = startIndex;
  const visit = (from: number, x: number, y: number): void => {
    if (!isOpenAt(grid, x, y)) {
      return;
    }
    const index = (y * width) + x;
    if (dist[index] !== -1) {
      return;
    }
    dist[index] = dist[from]! + 1;
    queue[tail++] = index;
  };
  while (head < tail) {
    const current = queue[head++]!;
    if (current === goalIndex) {
      return dist[current]!;
    }
    const x = current % width;
    const y = (current - x) / width;
    if (x > 0) { visit(current, x - 1, y); } else if (!closedKeys.has(`horizontal:${y}`)) { visit(current, width - 1, y); }
    if (x < width - 1) { visit(current, x + 1, y); } else if (!closedKeys.has(`horizontal:${y}`)) { visit(current, 0, y); }
    if (y > 0) { visit(current, x, y - 1); } else if (!closedKeys.has(`vertical:${x}`)) { visit(current, x, height - 1); }
    if (y < height - 1) { visit(current, x, y + 1); } else if (!closedKeys.has(`vertical:${x}`)) { visit(current, x, 0); }
  }
  return null;
};

const closedExcept = (paths: readonly BleedPath[], kept: ReadonlySet<string>): Set<string> => {
  const closed = new Set<string>();
  for (const path of paths) {
    if (!kept.has(bleedPathKey(path))) {
      closed.add(bleedPathKey(path));
    }
  }
  return closed;
};

export interface BleedAudit {
  paths: BleedPathMeasure[];
  perAxis: { horizontal: number; vertical: number };
  // Shortest route with no wrap at all (every bleed path closed).
  directSteps: number | null;
  // Shortest route with every path open (what a player gets).
  playableSteps: number | null;
}

// The measurement: shortest route with each path alone, with none and with all.
export const auditBleedPaths = (
  grid: boolean[][],
  start: LegacyPoint,
  goal: LegacyPoint,
  triggered?: ReadonlySet<string>
): BleedAudit => {
  const all = listBleedPaths(grid);
  const available = all.filter((path) => isBleedPathAvailable(path, triggered));
  const directSteps = measureBleedShortestSteps(grid, start, goal, closedExcept(all, new Set()));
  const playableSteps = measureBleedShortestSteps(
    grid,
    start,
    goal,
    closedExcept(all, new Set(available.map(bleedPathKey)))
  );
  const paths = all.map((path): BleedPathMeasure => {
    const stepsAlone = measureBleedShortestSteps(grid, start, goal, closedExcept(all, new Set([bleedPathKey(path)])));
    return {
      ...path,
      stepsAlone,
      saving: directSteps !== null && stepsAlone !== null ? Math.max(0, directSteps - stepsAlone) : 0
    };
  });
  return {
    paths,
    perAxis: {
      horizontal: all.filter((path) => path.axis === 'horizontal').length,
      vertical: all.filter((path) => path.axis === 'vertical').length
    },
    directSteps,
    playableSteps
  };
};

export interface BleedLimitResult {
  kept: BleedPath[];
  // Paths to close (clear both border cells).
  closed: BleedPath[];
}

// Pure selection: which paths stay. Greedy, least saving first (ties: lower line), so the result is
// deterministic for a grid. A path is rejected when it saves too much on its own, when the axis is full,
// when it sits too close to a kept path on the axis, or when keeping it would push the shortest route
// below the floor. A required axis always keeps its least harmful path.
export const selectBleedPathsToKeep = (
  grid: boolean[][],
  start: LegacyPoint,
  goal: LegacyPoint,
  options: BleedLimitOptions
): BleedLimitResult => {
  const { width, height } = dimensions(grid);
  const audit = auditBleedPaths(grid, start, goal);
  const all = audit.paths;
  if (all.length === 0 || audit.directSteps === null) {
    return { kept: all.map(({ axis, line }) => ({ axis, line })), closed: [] };
  }
  const direct = audit.directSteps;
  const floorSteps = Math.ceil(direct * options.minRouteRatio);
  const singleLimit = Math.floor(direct * options.maxSingleSavingRatio);
  const ordered = [...all].sort((left, right) => (
    left.saving - right.saving
    || left.line - right.line
    || (left.axis === right.axis ? 0 : (left.axis === 'horizontal' ? -1 : 1))
  ));
  const kept = new Set<string>();
  const keptByAxis: Record<BleedAxis, number[]> = { horizontal: [], vertical: [] };
  const accept = (path: BleedPath): void => {
    kept.add(bleedPathKey(path));
    keptByAxis[path.axis].push(path.line);
  };

  for (const path of ordered) {
    const axisLength = resolveBleedAxisLength(path.axis, width, height);
    const lines = keptByAxis[path.axis];
    if (lines.length >= options.capPerAxis[path.axis]) {
      continue;
    }
    if (lines.some((line) => Math.abs(line - path.line) < options.minSeparation(axisLength))) {
      continue;
    }
    if (path.saving > singleLimit) {
      continue;
    }
    const trial = new Set(kept);
    trial.add(bleedPathKey(path));
    const steps = measureBleedShortestSteps(grid, start, goal, closedExcept(all, trial));
    if (steps === null || steps < floorSteps) {
      continue;
    }
    accept(path);
  }

  // A required axis never loses its last path: keep the least harmful one even over the limits.
  for (const axis of ['horizontal', 'vertical'] as const) {
    if (options.requiredAxes[axis] && keptByAxis[axis].length === 0) {
      const fallback = ordered.find((path) => path.axis === axis);
      if (fallback) {
        accept(fallback);
      }
    }
  }

  return {
    kept: all.filter((path) => kept.has(bleedPathKey(path))).map(({ axis, line }) => ({ axis, line })),
    closed: all.filter((path) => !kept.has(bleedPathKey(path))).map(({ axis, line }) => ({ axis, line }))
  };
};

// Applies the limits to a grid in place by clearing both border cells of every rejected path.
// Returns the cleared points (for build traces).
export const enforceBleedPathLimits = (
  grid: boolean[][],
  start: LegacyPoint,
  goal: LegacyPoint,
  options: BleedLimitOptions
): { closed: BleedPath[]; clearedTiles: LegacyPoint[] } => {
  const { width, height } = dimensions(grid);
  const { closed } = selectBleedPathsToKeep(grid, start, goal, options);
  const clearedTiles: LegacyPoint[] = [];
  for (const path of closed) {
    const points = path.axis === 'horizontal'
      ? [{ x: 0, y: path.line }, { x: width - 1, y: path.line }]
      : [{ x: path.line, y: 0 }, { x: path.line, y: height - 1 }];
    for (const point of points) {
      if (grid[point.y]![point.x] === true) {
        grid[point.y]![point.x] = false;
        clearedTiles.push(point);
      }
    }
  }
  return { closed, clearedTiles };
};
