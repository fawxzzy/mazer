// One-tile stub rule for the mazes that do NOT go through the felt tuner (MAZER-GEN-006).
//
// The budget ladder (play, levels 2+) clears its stubs inside the felt tuner (legacyMazeFeltTuning.ts,
// lever 5), where every edit is verified against the landed felt number. The MAIN MENU demo used to read a band
// profile with no geometryBudgetLevel (MAZER-VIS-052), so it never reached the tuner and showed 9-20
// one-tile nubs per maze; it now reads the ladder profile (MAZER-MENU-BLEED), and the default profile still lands here. This is the same rule as a plain post-pass: there is no felt target to protect,
// so an edit only has to keep the maze connected (a stub is a leaf, so it always does).
//
// Deterministic (seeded by the maze seed, row-major candidate order), a no-op returning the SAME object
// when the maze has no stub, integer-only, and cheap (one scan of the grid when there is nothing to do).
import type { LegacyMazeSnapshot } from './legacyMaze';
import { createFeltExplorer } from './legacyMazeFeltDifficulty';
import { collectOneTileStubs, fixOneTileStubs, forceRemoveOneTileStubs } from './legacyMazeStubs';

type StubPassMaze = Omit<LegacyMazeSnapshot, 'generation'>;

// The most rounds of lengthen/remove: removing a tip can leave its host a new tip, so the pass repeats
// until a scan finds nothing (it always ends: every round that edits shrinks or lengthens a branch).
const STUB_PASS_MAX_ROUNDS = 16;

const createStream = (seed: number): (() => number) => {
  let state = (Math.imul(seed >>> 0, 0x9e3779b1) ^ 0x85ebca6b) >>> 0 || 1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state >>> 8;
  };
};

export const applyOneTileStubRule = <T extends StubPassMaze>(maze: T): T => {
  if (collectOneTileStubs(maze).length === 0) { return maze; }
  const { width, height } = maze;
  const explorer = createFeltExplorer(width, height);
  const open = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (maze.grid[y]?.[x] === true) { open[(y * width) + x] = 1; }
    }
  }
  const startCell = (maze.start.y * width) + maze.start.x;
  const goalCell = (maze.goal.y * width) + maze.goal.x;
  const interior = (cell: number): boolean => {
    const x = cell % width;
    const y = (cell - x) / width;
    return x >= 1 && y >= 1 && x <= width - 2 && y <= height - 2;
  };
  const rand = createStream((maze.seed ^ 0x6a09e667) >>> 0);
  const lengthened: number[] = [];
  const removed: number[] = [];
  for (let round = 0; round < STUB_PASS_MAX_ROUNDS; round += 1) {
    const fixed = fixOneTileStubs({
      open,
      neighbors: explorer.neighbors,
      startCell,
      goalCell,
      step: [1, -1, width, -width],
      interior,
      rand,
      verify: () => true,
      pinchCapHosts: true
    });
    lengthened.push(...fixed.lengthened);
    removed.push(...fixed.removed);
    if (fixed.lengthened.length === 0 && fixed.removed.length === 0) { break; }
  }
  const grid: boolean[][] = [];
  for (let y = 0; y < height; y += 1) {
    const row: boolean[] = [];
    for (let x = 0; x < width; x += 1) { row.push(open[(y * width) + x] === 1); }
    grid.push(row);
  }
  const next = { ...maze, grid } as T;
  // A start or goal nub nothing could be opened behind (a dense maze: every wall cell touches other floor)
  // moves one cell onto its host junction and its old cell is walled up: the endpoint then sits in a
  // corridor, the route is one step shorter. Only here, where no felt number is held to a target.
  const relocated: { x: number; y: number }[] = [];
  for (const branch of collectOneTileStubs(next)) {
    const { tip, host } = branch;
    const isStart = tip.x === next.start.x && tip.y === next.start.y;
    const isGoal = tip.x === next.goal.x && tip.y === next.goal.y;
    if ((!isStart && !isGoal) || host === null) { continue; }
    const otherEnd = isStart ? next.goal : next.start;
    if (host.x === otherEnd.x && host.y === otherEnd.y) { continue; }
    const path = next.solutionPath;
    const onRoute = path.length > 2 && (isStart
      ? path[0]!.x === tip.x && path[0]!.y === tip.y && path[1]!.x === host.x && path[1]!.y === host.y
      : path[path.length - 1]!.x === tip.x && path[path.length - 1]!.y === tip.y
        && path[path.length - 2]!.x === host.x && path[path.length - 2]!.y === host.y);
    if (!onRoute) { continue; }
    next.grid[tip.y]![tip.x] = false;
    if (isStart) {
      next.start = { x: host.x, y: host.y };
      next.solutionPath = path.slice(1);
    } else {
      next.goal = { x: host.x, y: host.y };
      next.solutionPath = path.slice(0, -1);
    }
    if (next.generationBuildTrace) {
      next.generationBuildTrace = isStart
        ? { ...next.generationBuildTrace, start: { x: host.x, y: host.y } }
        : { ...next.generationBuildTrace, finalGoal: { x: host.x, y: host.y } };
    }
    relocated.push({ x: tip.x, y: tip.y });
  }
  // Border tips (a feeder's mouth) cannot be moved by the interior-only moves above: wall them up too.
  const forcedTiles: { x: number; y: number }[] = [];
  for (let round = 0; round < STUB_PASS_MAX_ROUNDS; round += 1) {
    const walled = forceRemoveOneTileStubs(next as StubPassMaze & { grid: boolean[][] });
    if (walled.length === 0) { break; }
    forcedTiles.push(...walled);
  }
  if (relocated.length > 0 && next.playableTopologyStats) {
    next.playableTopologyStats = {
      ...next.playableTopologyStats,
      resolvedGoalDistance: Math.max(0, next.solutionPath.length - 1)
    };
  }
  const point = (cell: number): { x: number; y: number } => ({ x: cell % width, y: Math.floor(cell / width) });
  next.stubStats = { lengthened: lengthened.length, removed: removed.length, forced: forcedTiles.length, ...(relocated.length > 0 ? { relocated: relocated.length } : {}) };
  if (next.generationBuildTrace) {
    next.generationBuildTrace = {
      ...next.generationBuildTrace,
      decoyTiles: [...(next.generationBuildTrace.decoyTiles ?? []), ...lengthened.map(point)],
      decoyPrunedTiles: [...(next.generationBuildTrace.decoyPrunedTiles ?? []), ...removed.map(point), ...forcedTiles, ...relocated]
    };
  }
  if (next.playableTopologyStats) {
    next.playableTopologyStats = {
      ...next.playableTopologyStats,
      reachableFloors: Math.max(0, next.playableTopologyStats.reachableFloors + lengthened.length - removed.length - forcedTiles.length - relocated.length)
    };
  }
  return next;
};
