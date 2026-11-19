// MAZER-L10: bleed gates (Gate D "Pulse ring", Zac's pick 2026-11-19).
//
// A gate hides one bleed-off path (legacyBleedPaths.ts) until the player passes over the gate tile. The
// gate sits far from its path, at least BLEED_GATE_MIN_PATH_DISTANCE walking steps from either mouth and
// never adjacent, so finding it is the puzzle: walk to the gate, light it, walk back and take the wrap.
//
// This module is pure and generation-side:
// - the cadence (which levels carry a gate): keyed on the level only, so the list is stable and testable;
// - placement: which path is gated and where its gate goes, on a finished grid (the grid is NOT changed, so
//   a level's golden fingerprint is the same with or without its gate);
// - the gate-aware route (walk to the gate first when that pays) and the gated wrap pricing (a gated path
//   saves nothing until it is triggered, and only what is left after the detour to its gate).
//
// The runtime state (which gate is lit, the animation clock) lives in legacyBleedGateState.ts.

import {
  bleedPathKey,
  listBleedPaths,
  type BleedPath
} from './legacyBleedPaths';
import {
  bleedGateKey,
  resolveLegacyBleedGateBorderCells,
  type LegacyBleedGate
} from './legacyBleedGateState';

interface GridPoint {
  x: number;
  y: number;
}

interface GateMaze {
  width: number;
  height: number;
  grid: boolean[][];
  start: GridPoint;
  goal: GridPoint;
}

// Gates start at level 20: wraps exist from level 10 (legacyGeometryBudget.ts), so the first ten wrapped
// levels teach the plain wrap before a gate hides one. The chance rises from 30 % at level 20 to 70 % at
// level 100 and holds there; wraps fade out by level 140, and a level without a gateable wrap has no gate.
export const BLEED_GATE_FIRST_LEVEL = 20;
export const BLEED_GATE_CHANCE_START = 0.3;
export const BLEED_GATE_CHANCE_TOP = 0.7;
export const BLEED_GATE_CHANCE_TOP_LEVEL = 100;
// The gate's walking distance from the nearer mouth of its path (path hidden): at least this many steps,
// or this share of the direct route when that is longer.
export const BLEED_GATE_MIN_PATH_DISTANCE = 8;
export const BLEED_GATE_MIN_PATH_DISTANCE_SHARE = 0.15;

export const resolveBleedGateChance = (level: number): number => {
  if (!Number.isFinite(level) || level < BLEED_GATE_FIRST_LEVEL) {
    return 0;
  }
  const span = BLEED_GATE_CHANCE_TOP_LEVEL - BLEED_GATE_FIRST_LEVEL;
  const t = Math.min(1, (Math.trunc(level) - BLEED_GATE_FIRST_LEVEL) / span);
  return BLEED_GATE_CHANCE_START + ((BLEED_GATE_CHANCE_TOP - BLEED_GATE_CHANCE_START) * t);
};

// Integer hash (lowbias32) of the level: the cadence roll. Same level, same answer, on every board.
const hashLevel = (level: number): number => {
  let value = (Math.trunc(level) ^ 0x6a09e667) >>> 0;
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d) >>> 0;
  value ^= value >>> 15;
  value = Math.imul(value, 0x846ca68b) >>> 0;
  value ^= value >>> 16;
  return value >>> 0;
};

// Whether a level asks for a gate. The maze must still offer a gateable wrap (placeLegacyBleedGate).
export const isBleedGateLevel = (level: number): boolean => (
  (hashLevel(level) / 0x100000000) < resolveBleedGateChance(level)
);

const isOpen = (grid: readonly (readonly boolean[])[], x: number, y: number): boolean => grid[y]?.[x] === true;

// Wrap-aware BFS distance field from the sources. Wraps on `closedKeys` lines are not taken.
export const measureBleedGateDistanceField = (
  grid: readonly (readonly boolean[])[],
  sources: readonly GridPoint[],
  closedKeys: ReadonlySet<string> = new Set<string>()
): Int32Array => {
  const height = grid.length;
  const width = grid[0]?.length ?? 0;
  const dist = new Int32Array(width * height).fill(-1);
  const queue = new Int32Array(width * height);
  let head = 0;
  let tail = 0;
  for (const source of sources) {
    if (isOpen(grid, source.x, source.y)) {
      const index = (source.y * width) + source.x;
      if (dist[index] === -1) {
        dist[index] = 0;
        queue[tail++] = index;
      }
    }
  }
  const visit = (from: number, x: number, y: number): void => {
    if (!isOpen(grid, x, y)) {
      return;
    }
    const index = (y * width) + x;
    if (dist[index] === -1) {
      dist[index] = dist[from]! + 1;
      queue[tail++] = index;
    }
  };
  while (head < tail) {
    const current = queue[head++]!;
    const x = current % width;
    const y = (current - x) / width;
    if (x > 0) { visit(current, x - 1, y); } else if (!closedKeys.has(`horizontal:${y}`)) { visit(current, width - 1, y); }
    if (x < width - 1) { visit(current, x + 1, y); } else if (!closedKeys.has(`horizontal:${y}`)) { visit(current, 0, y); }
    if (y > 0) { visit(current, x, y - 1); } else if (!closedKeys.has(`vertical:${x}`)) { visit(current, x, height - 1); }
    if (y < height - 1) { visit(current, x, y + 1); } else if (!closedKeys.has(`vertical:${x}`)) { visit(current, x, 0); }
  }
  return dist;
};

// The grid as a player sees it before the gates in `hiddenKeys` are lit: each gated path's two border
// cells are wall.
export const resolveLegacyBleedGateHiddenGrid = (
  grid: readonly (readonly boolean[])[],
  gates: readonly Pick<LegacyBleedGate, 'axis' | 'line'>[],
  litKeys: ReadonlySet<string> = new Set<string>()
): boolean[][] => {
  const height = grid.length;
  const width = grid[0]?.length ?? 0;
  const hidden = grid.map((row) => [...row]);
  for (const gate of gates) {
    if (litKeys.has(bleedGateKey(gate))) {
      continue;
    }
    for (const cell of resolveLegacyBleedGateBorderCells(gate, width, height)) {
      if (hidden[cell.y]) {
        hidden[cell.y]![cell.x] = false;
      }
    }
  }
  return hidden;
};

const countReached = (field: Int32Array): number => {
  let count = 0;
  for (const value of field) {
    if (value >= 0) {
      count += 1;
    }
  }
  return count;
};

const inBoardNeighbors = (grid: readonly (readonly boolean[])[], cell: GridPoint): GridPoint[] => (
  [
    { x: cell.x - 1, y: cell.y },
    { x: cell.x + 1, y: cell.y },
    { x: cell.x, y: cell.y - 1 },
    { x: cell.x, y: cell.y + 1 }
  ].filter((point) => isOpen(grid, point.x, point.y))
);

export interface LegacyBleedGatePlacement {
  gate: LegacyBleedGate;
  // Shortest route with the path hidden (the gate never lit).
  hiddenSteps: number;
  // Shortest route through the gate and then the open wrap (what a player who solves the puzzle walks).
  gatedRouteSteps: number;
  // Shortest route with the path open from the start (the maze without its gate).
  openSteps: number;
}

// Places the gate of one maze: the bleed path that saves the most (ties: lowest axis/line), then the gate
// tile: off every shortest route, at least the minimum walking distance from the path's mouths, a dead end
// when one qualifies, and the one that pays the most for walking to it.
// Returns null when no path can be gated (none saves a step, hiding it would cut the maze, or no tile is far
// enough away and still pays for its detour).
export const placeLegacyBleedGate = (maze: GateMaze): LegacyBleedGatePlacement | null => {
  const { width, height, grid, start, goal } = maze;
  const paths = listBleedPaths(grid);
  if (paths.length === 0) {
    return null;
  }
  const allOpen = measureBleedGateDistanceField(grid, [start]);
  const goalIndex = (goal.y * width) + goal.x;
  const openSteps = allOpen[goalIndex]!;
  if (openSteps < 0) {
    return null;
  }
  const totalReached = countReached(allOpen);
  const candidates: { path: BleedPath; hidden: boolean[][]; hiddenFromStart: Int32Array; hiddenSteps: number }[] = [];
  for (const path of paths) {
    const hidden = resolveLegacyBleedGateHiddenGrid(grid, [path]);
    const borders = resolveLegacyBleedGateBorderCells(path, width, height);
    if (borders.some((cell) => (cell.x === start.x && cell.y === start.y) || (cell.x === goal.x && cell.y === goal.y))) {
      continue;
    }
    const hiddenFromStart = measureBleedGateDistanceField(hidden, [start]);
    const hiddenSteps = hiddenFromStart[goalIndex]!;
    // Hiding the path must not strand any other floor tile, and it must cost the player something.
    if (hiddenSteps <= openSteps || countReached(hiddenFromStart) !== totalReached - 2) {
      continue;
    }
    candidates.push({ path, hidden, hiddenFromStart, hiddenSteps });
  }
  // Most saving first; ties keep listBleedPaths order (horizontal lines, then vertical, low to high).
  candidates.sort((a, b) => b.hiddenSteps - a.hiddenSteps);
  for (const candidate of candidates) {
    const { path, hidden, hiddenFromStart, hiddenSteps } = candidate;
    const borders = resolveLegacyBleedGateBorderCells(path, width, height);
    const mouths = borders.flatMap((cell) => inBoardNeighbors(hidden, cell));
    const fromMouths = measureBleedGateDistanceField(hidden, mouths);
    // After the gate is lit the whole grid is open: distance from each tile to the goal.
    const toGoal = measureBleedGateDistanceField(grid, [goal]);
    const hiddenToGoal = measureBleedGateDistanceField(hidden, [goal]);
    const minDistance = Math.max(
      BLEED_GATE_MIN_PATH_DISTANCE,
      Math.ceil(BLEED_GATE_MIN_PATH_DISTANCE_SHARE * hiddenSteps)
    );
    let best: { index: number; gatedRoute: number; deadEnd: boolean; distance: number } | null = null;
    for (let index = 0; index < width * height; index += 1) {
      const x = index % width;
      const y = (index - x) / width;
      if (!hidden[y]![x] || (x === start.x && y === start.y) || (x === goal.x && y === goal.y)) {
        continue;
      }
      const reach = hiddenFromStart[index]!;
      const distance = fromMouths[index]!;
      const rest = toGoal[index]!;
      if (reach < 0 || rest < 0 || distance < minDistance) {
        continue;
      }
      const gatedRoute = reach + rest;
      // It must pay for its detour, and it must BE a detour: off every shortest route with the path open
      // (the wrap route) and with it hidden (the plain route), so no player lights it by accident.
      if (gatedRoute >= hiddenSteps || gatedRoute <= openSteps || reach + hiddenToGoal[index]! <= hiddenSteps) {
        continue;
      }
      const deadEnd = inBoardNeighbors(hidden, { x, y }).length === 1;
      // A dead end first (the gate is a destination); then pays the most; then farther from the path; then
      // the lowest index (deterministic).
      if (
        best === null
        || (deadEnd && !best.deadEnd)
        || (deadEnd === best.deadEnd && gatedRoute < best.gatedRoute)
        || (deadEnd === best.deadEnd && gatedRoute === best.gatedRoute && distance > best.distance)
      ) {
        best = { index, gatedRoute, deadEnd, distance };
      }
    }
    if (best !== null) {
      const x = best.index % width;
      const y = (best.index - x) / width;
      return {
        gate: {
          axis: path.axis,
          line: path.line,
          x,
          y,
          pathDistance: best.distance,
          ungatedSaving: hiddenSteps - openSteps,
          gatedSaving: hiddenSteps - best.gatedRoute
        },
        hiddenSteps,
        gatedRouteSteps: best.gatedRoute,
        openSteps
      };
    }
  }
  return null;
};

// The ladder post-pass: the gates a level's maze carries (empty when the level has none). Deterministic in
// (level, maze); the maze itself is not changed.
export const resolveLegacyBleedGatesForLevel = (level: number, maze: GateMaze): LegacyBleedGate[] => {
  if (!isBleedGateLevel(level)) {
    return [];
  }
  const placement = placeLegacyBleedGate(maze);
  return placement ? [placement.gate] : [];
};

// Gated wrap pricing: the steps the maze's wraps give back to a player who knows the map, with every unlit
// gated path unavailable until its gate is walked to. A gated path's saving is what is left after the
// detour to the gate (never negative: a player can always ignore the gate).
export const measureLegacyGatedWrapSaving = (
  maze: GateMaze & { bleedGates?: readonly LegacyBleedGate[] },
  litKeys: ReadonlySet<string> = new Set<string>()
): { directSteps: number; playableSteps: number; saved: number } | null => {
  const { width, grid, start, goal } = maze;
  const goalIndex = (goal.y * width) + goal.x;
  const allKeys = new Set(listBleedPaths(grid).map(bleedPathKey));
  const direct = measureBleedGateDistanceField(grid, [start], allKeys)[goalIndex]!;
  if (direct < 0) {
    return null;
  }
  const route = resolveLegacyBleedGateRoute(maze, litKeys);
  if (route === null) {
    return null;
  }
  const playable = route.steps;
  return { directSteps: direct, playableSteps: playable, saved: Math.max(0, direct - playable) };
};

export interface LegacyBleedGateRoute {
  // The tile walked to first (an unlit gate), or null when walking straight to the goal is as short.
  via: GridPoint | null;
  steps: number;
}

// The gate-aware shortest route: straight to the goal with every unlit gated path hidden, or through one
// unlit gate and then on with that path open, whichever is shorter (a straight route wins ties).
export const resolveLegacyBleedGateRoute = (
  maze: GateMaze & { bleedGates?: readonly LegacyBleedGate[] },
  litKeys: ReadonlySet<string> = new Set<string>()
): LegacyBleedGateRoute | null => {
  const { width, grid, start, goal } = maze;
  const gates = maze.bleedGates ?? [];
  const goalIndex = (goal.y * width) + goal.x;
  const hidden = resolveLegacyBleedGateHiddenGrid(grid, gates, litKeys);
  const straight = measureBleedGateDistanceField(hidden, [start]);
  let best: LegacyBleedGateRoute | null = straight[goalIndex]! >= 0 ? { via: null, steps: straight[goalIndex]! } : null;
  for (const gate of gates) {
    if (litKeys.has(bleedGateKey(gate))) {
      continue;
    }
    const reach = straight[(gate.y * width) + gate.x]!;
    if (reach < 0) {
      continue;
    }
    const afterGrid = resolveLegacyBleedGateHiddenGrid(grid, gates, new Set([...litKeys, bleedGateKey(gate)]));
    const rest = measureBleedGateDistanceField(afterGrid, [gate])[goalIndex]!;
    if (rest >= 0 && (best === null || reach + rest < best.steps)) {
      best = { via: { x: gate.x, y: gate.y }, steps: reach + rest };
    }
  }
  return best;
};

// Wrap-aware shortest path (tile list, start..goal inclusive) over a grid. Deterministic neighbour order
// (left, right, up, down; wraps in place of the off-board step). Null when unreachable.
export const resolveLegacyBleedGateShortestPath = (
  grid: readonly (readonly boolean[])[],
  from: GridPoint,
  to: GridPoint
): GridPoint[] | null => {
  const height = grid.length;
  const width = grid[0]?.length ?? 0;
  const field = measureBleedGateDistanceField(grid, [to]);
  const startIndex = (from.y * width) + from.x;
  if (field[startIndex]! < 0) {
    return null;
  }
  const path: GridPoint[] = [{ x: from.x, y: from.y }];
  let x = from.x;
  let y = from.y;
  while (field[(y * width) + x]! > 0) {
    const here = field[(y * width) + x]!;
    const steps: GridPoint[] = [
      { x: x > 0 ? x - 1 : width - 1, y },
      { x: x < width - 1 ? x + 1 : 0, y },
      { x, y: y > 0 ? y - 1 : height - 1 },
      { x, y: y < height - 1 ? y + 1 : 0 }
    ];
    const next = steps.find((point) => isOpen(grid, point.x, point.y) && field[(point.y * width) + point.x] === here - 1);
    if (!next) {
      return null;
    }
    path.push(next);
    x = next.x;
    y = next.y;
  }
  return path;
};
