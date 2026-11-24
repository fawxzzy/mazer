// MAZER-GEN-030: maze quality pass. Owner complaint: "too many short useless dead ends, usually one route to the end".
//
// Two parts, both run on top of the unchanged ladder generator (same seed, same level, same base build, same
// felt tuner), both behind one switch (setMazeQualityPassEnabled, default on):
//
//   1. Second routes: from the first looped level the tuner is asked for equal-length second routes
//      ("alternates") instead of the old mixed plan with its per-seed single-route roll
//      (resolveQualityLoopPlan). Loops rise with the level as before.
//   2. The post pass on the finished, tuned grid (applyMazeQualityPass):
//        * stub pruning: every dead-end branch of QUALITY_STUB_MAX_LEN cells or fewer is either bridged to a nearby
//          corridor, so it becomes part of a loop (a way round instead of a nub), or walled up;
//        * decoy loops: wrong-turn loops that rejoin the route elsewhere (a wrong turn that costs time but does
//          not dead-end), a few per maze, rising with the level.
//
// Difficulty and progression are preserved by construction: EVERY edit is kept only when
//   * the explorer's felt steps are exactly unchanged (so the felt figure, the ladder ordering and the
//     difficulty curve are those of the tuner's landing),
//   * the shortest route is exactly unchanged, torus and planar (no new shortcut; the loop and wrap savings the
//     tuner priced are unchanged; the bleed gate's wrap detour is unchanged),
//   * the reverse felt walk stays at or above the level's reverse floor,
//   * no one-tile stub appears (MAZER-GEN-006), and no 2x2 open block appears.
// Only interior cells are ever added (the border ring, the start and the goal are never touched). Levels below
// GEOMETRY_BUDGET_LOOP_FIRST_LEVEL stay single-route by design: there stubs are only pruned, never bridged, and no
// decoy loop is added. Level 1 (the corridor) is not served by the budget generator at all.
// Pure and deterministic: integer arithmetic, a seeded stream, no clock.

import { createFeltExplorer } from './legacyMazeFeltDifficulty';
import { GEOMETRY_BUDGET_LOOP_FIRST_LEVEL, GEOMETRY_BUDGET_LOOP_REFERENCE_CELLS } from './legacyGeometryBudget';
import type { LegacyLoopPlan } from './legacyMazeLoops';
import { countStubTips, probeDeadEndBranch } from './legacyMazeStubs';

// Dead-end branches this short are "useless" (the felt explorer never enters a branch of 3 cells or fewer either).
export const QUALITY_STUB_MAX_LEN = 3;
// A bridge between a stub and the corridor it is bent toward must close a loop of at least this many steps.
export const QUALITY_STUB_MIN_LOOP = 6;
// One decoy loop per this many levels, at most QUALITY_DECOY_MAX per maze, each costing a wrong-turn detour of at
// least QUALITY_DECOY_MIN_EXTRA steps.
export const QUALITY_DECOY_PER_LEVEL = 30;
export const QUALITY_DECOY_MAX = 8;
export const QUALITY_DECOY_MIN_EXTRA = 6;
// Connector corridors are straight runs of 1..N closed interior cells.
const QUALITY_CONNECTOR_MAX = 5;
// The most candidate connectors one decoy round tries before giving up.
const QUALITY_DECOY_TRIES = 160;
// Alternates asked of the tuner at most.
const QUALITY_ALTERNATES_MAX = 4;

let passEnabled = true;
// Analysis, A/B measuring and the kill switch of the quality guard test: false restores the previous generator.
export const setMazeQualityPassEnabled = (enabled: boolean): void => { passEnabled = enabled; };
export const isMazeQualityPassEnabled = (): boolean => passEnabled;

// The loop plan the tuner is asked for: equal-length second routes on every maze from the first looped level.
// Falls back to the supplied (old) plan when the pass is off or below that level.
export const resolveQualityLoopPlan = (feltLevel: number, cells: number, fallback: LegacyLoopPlan): LegacyLoopPlan => {
  if (!passEnabled || feltLevel < GEOMETRY_BUDGET_LOOP_FIRST_LEVEL) { return fallback; }
  const areaScale = Math.max(1, cells) / GEOMETRY_BUDGET_LOOP_REFERENCE_CELLS;
  const alternates = Math.min(
    QUALITY_ALTERNATES_MAX,
    Math.max(1, Math.round((1 + Math.floor((feltLevel - 10) / 50)) * Math.max(0.75, areaScale)))
  );
  return {
    shortcuts: 0,
    alternates,
    decoys: fallback.decoys,
    maxConnector: Math.min(36, 10 + Math.floor(feltLevel / 6)),
    cellBudget: Math.round(Math.max(1, cells) * 0.06)
  };
};

export interface QualityPassMaze {
  readonly width: number;
  readonly height: number;
  readonly grid: ReadonlyArray<ReadonlyArray<boolean>>;
  readonly start: { readonly x: number; readonly y: number };
  readonly goal: { readonly x: number; readonly y: number };
}

export interface QualityPassStats {
  pruned: number;
  prunedCells: number;
  stubsLooped: number;
  decoyLoops: number;
  tried: number;
}

export interface QualityPassResult {
  readonly grid: boolean[][];
  readonly added: { x: number; y: number }[];
  readonly removed: { x: number; y: number }[];
  readonly stats: QualityPassStats;
  readonly changed: boolean;
}

const mix32 = (a: number, b: number): number => {
  let h = (Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be5ab, 0xc2b2ae35)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
};

const createStream = (seed: number): (() => number) => {
  let state = mix32(seed >>> 0, 0x51ed270b) || 1;
  return () => {
    state ^= state << 13; state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5; state >>>= 0;
    return state;
  };
};

const shuffle = <T>(items: T[], rand: () => number): T[] => {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = rand() % (i + 1);
    const t = items[i]!; items[i] = items[j]!; items[j] = t;
  }
  return items;
};

interface Connector { cells: number[]; far: number }

// reverseFloor: the level's reverse-felt floor in raw explorer steps from the goal end (the tuner's floor plus the
// maze's loop and wrap savings); every edit keeps the reverse walk at or above it (ladder v2). 0 = not held.
// keep: cells that are never walled up (the fringe of the levels past the felt saturation is the ladder's own
// strictly rising geometry there: those stubs are bridged into loops at most, never removed).
export const applyMazeQualityPass = (
  maze: QualityPassMaze,
  level: number,
  seed: number,
  reverseFloor = 0,
  keep: ReadonlyArray<{ readonly x: number; readonly y: number }> = [],
  // The tuner's loop connector cells: the savings it recorded are measured with these closed, so the maze seen with
  // them closed (felt steps, torus and planar route) is held exactly as well.
  loopConnectors: ReadonlyArray<{ readonly x: number; readonly y: number }> = [],
  // MAZER-GEN-031: one more invariant every edit must keep, checked on the grid as it would be after the edit. A gate
  // level passes the check that its gate still lands with exactly the saving the tuner priced (legacyGenerationLifecycle.ts),
  // so the pass runs on gate levels edit by edit instead of being thrown away whole.
  accept?: (grid: boolean[][]) => boolean
): QualityPassResult => {
  const { width, height } = maze;
  const size = width * height;
  const stats: QualityPassStats = { pruned: 0, prunedCells: 0, stubsLooped: 0, decoyLoops: 0, tried: 0 };
  const unchanged = (): QualityPassResult => ({ grid: maze.grid.map((row) => [...row]), added: [], removed: [], stats, changed: false });
  if (!passEnabled) { return unchanged(); }
  const open = new Uint8Array(size);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) { if (maze.grid[y]?.[x] === true) { open[(y * width) + x] = 1; } }
  }
  const original = open.slice();
  const toGrid = (): boolean[][] => {
    const rows: boolean[][] = [];
    for (let y = 0; y < height; y += 1) {
      const row: boolean[] = [];
      for (let x = 0; x < width; x += 1) { row.push(open[(y * width) + x] === 1); }
      rows.push(row);
    }
    return rows;
  };
  const kept = new Set<number>(keep.map((point) => (point.y * width) + point.x));
  const explorer = createFeltExplorer(width, height);
  const nb = explorer.neighbors;
  const planar = new Int32Array(size * 4);
  for (let cell = 0; cell < size; cell += 1) {
    const x = cell % width; const y = (cell - x) / width;
    planar[(cell * 4) + 0] = x + 1 < width ? cell + 1 : -1;
    planar[(cell * 4) + 1] = x > 0 ? cell - 1 : -1;
    planar[(cell * 4) + 2] = y + 1 < height ? cell + width : -1;
    planar[(cell * 4) + 3] = y > 0 ? cell - width : -1;
  }
  const s = (maze.start.y * width) + maze.start.x;
  const g = (maze.goal.y * width) + maze.goal.x;
  const xOf = (c: number): number => c % width;
  const yOf = (c: number): number => (c - (c % width)) / width;
  const interior = (c: number): boolean => { const x = xOf(c); const y = yOf(c); return x >= 1 && y >= 1 && x <= width - 2 && y <= height - 2; };
  const degree = (c: number): number => {
    let n = 0;
    for (let d = 0; d < 4; d += 1) { const m = nb[(c * 4) + d]!; if (m !== c && open[m] === 1) { n += 1; } }
    return n;
  };
  const queue = new Int32Array(size);
  const dist = new Int32Array(size);
  const bfs = (table: Int32Array, from: number, to: number): number => {
    dist.fill(-1);
    let head = 0; let tail = 0;
    queue[tail++] = from; dist[from] = 0;
    while (head < tail) {
      const c = queue[head++]!;
      if (c === to) { return dist[c]!; }
      for (let d = 0; d < 4; d += 1) {
        const m = table[(c * 4) + d]!;
        if (m >= 0 && open[m] === 1 && dist[m] === -1) { dist[m] = dist[c]! + 1; queue[tail++] = m; }
      }
    }
    return -1;
  };
  const steps = (): { steps: number; ok: boolean } => { const run = explorer.run(open, s, g); return { steps: run.steps, ok: run.reachedGoal }; };
  const stubCount = (): number => countStubTips({ open, neighbors: nb, startCell: s, goalCell: g });
  const base = steps();
  const baseTorus = bfs(nb, s, g);
  const basePlanar = bfs(planar, s, g);
  let baseStubs = stubCount();
  if (!base.ok || baseTorus < 0) { return unchanged(); }
  // The invariant every edit must keep.
  const connectorCells = loopConnectors.map((point) => (point.y * width) + point.x).filter((c) => open[c] === 1);
  // The three figures of the maze with the tuner's loop connectors closed.
  const closedView = (): { steps: number; torus: number; planar: number } => {
    const closedNow = connectorCells.filter((c) => open[c] === 1);
    closedNow.forEach((c) => { open[c] = 0; });
    const run = explorer.run(open, s, g);
    const view = { steps: run.reachedGoal ? run.steps : -1, torus: bfs(nb, s, g), planar: bfs(planar, s, g) };
    closedNow.forEach((c) => { open[c] = 1; });
    return view;
  };
  const baseClosed = connectorCells.length > 0 ? closedView() : null;
  const holds = (): boolean => {
    stats.tried += 1;
    const run = steps();
    if (!run.ok || run.steps !== base.steps) { return false; }
    if (bfs(nb, s, g) !== baseTorus || bfs(planar, s, g) !== basePlanar) { return false; }
    if (baseClosed !== null) {
      const view = closedView();
      if (view.steps !== baseClosed.steps || view.torus !== baseClosed.torus || view.planar !== baseClosed.planar) { return false; }
    }
    if (reverseFloor > 0) { const back = explorer.run(open, g, s); if (!back.reachedGoal || back.steps < reverseFloor) { return false; } }
    if (stubCount() > baseStubs) { return false; }
    return accept === undefined || accept(toGrid());
  };
  const makes2x2 = (c: number): boolean => {
    const x = xOf(c); const y = yOf(c);
    for (const [ox, oy] of [[0, 0], [-1, 0], [0, -1], [-1, -1]] as const) {
      const x0 = x + ox; const y0 = y + oy;
      if (x0 < 0 || y0 < 0 || x0 + 1 >= width || y0 + 1 >= height) { continue; }
      const a = (y0 * width) + x0;
      if (open[a] && open[a + 1] && open[a + width] && open[a + width + 1]) { return true; }
    }
    return false;
  };
  const rand = createStream(mix32(seed >>> 0, level * 7919));
  const looped = level >= GEOMETRY_BUDGET_LOOP_FIRST_LEVEL;

  // Dead-end branches: tip -> cells (tip first, host excluded).
  const branchCells = (tip: number): { cells: number[]; host: number } | null => {
    const probe = probeDeadEndBranch(open, nb, tip, s, g);
    if (probe === null) { return null; }
    const cells: number[] = [];
    let prev = -1; let cur = tip;
    for (let k = 0; k < probe.length; k += 1) {
      cells.push(cur);
      let next = -1;
      for (let d = 0; d < 4; d += 1) { const m = nb[(cur * 4) + d]!; if (m !== cur && m !== prev && open[m] === 1) { next = m; break; } }
      prev = cur; cur = next;
      if (cur < 0) { break; }
    }
    return { cells, host: probe.host };
  };
  const tips = (): number[] => {
    const out: number[] = [];
    for (let c = 0; c < size; c += 1) { if (open[c] === 1 && c !== s && c !== g && degree(c) === 1) { out.push(c); } }
    return out;
  };
  const closeCells = (cells: number[]): void => { cells.forEach((c) => { open[c] = 0; }); };

  const tryPrune = (tip: number, maxLen: number): boolean => {
    const branch = branchCells(tip);
    if (branch === null || branch.cells.length > maxLen || branch.cells.includes(s) || branch.cells.includes(g) || branch.cells.some((c) => kept.has(c))) { return false; }
    closeCells(branch.cells);
    if (holds()) { stats.pruned += 1; stats.prunedCells += branch.cells.length; baseStubs = Math.min(baseStubs, stubCount()); return true; }
    branch.cells.forEach((c) => { open[c] = 1; });
    return false;
  };

  // Straight connectors of 1..maxK closed interior cells from `from` heading `d`, each touching only the cell before
  // it, the last touching exactly one more open cell (`far`).
  const connectors = (from: number, d: number, maxK: number): Connector[] => {
    const out: Connector[] = [];
    const cells: number[] = [];
    let prev = from;
    for (let k = 1; k <= maxK; k += 1) {
      const c = nb[(prev * 4) + d]!;
      if (c === prev || open[c] === 1 || !interior(c)) { break; }
      const others: number[] = [];
      for (let e = 0; e < 4; e += 1) { const m = nb[(c * 4) + e]!; if (m !== c && m !== prev && open[m] === 1) { others.push(m); } }
      cells.push(c);
      if (others.length === 1) { out.push({ cells: [...cells], far: others[0]! }); break; }
      if (others.length > 1) { break; }
      prev = c;
    }
    return out;
  };
  const openCells = (cells: number[]): boolean => {
    for (const c of cells) {
      open[c] = 1;
      if (makes2x2(c)) { closeCells(cells); return false; }
    }
    return true;
  };

  // Route projection: for each open cell, the index on the shortest route of the route cell it hangs off, and its
  // depth from the route.
  const routeProjection = (): { proj: Int32Array; depth: Int32Array; routeLen: number } => {
    bfs(nb, s, g);
    const fromS = dist.slice();
    const route: number[] = [g];
    let cur = g;
    while (cur !== s) {
      let next = -1;
      for (let d = 0; d < 4; d += 1) { const m = nb[(cur * 4) + d]!; if (open[m] === 1 && fromS[m] === fromS[cur]! - 1) { next = m; break; } }
      if (next < 0) { break; }
      route.push(next); cur = next;
    }
    route.reverse();
    const proj = new Int32Array(size).fill(-1);
    const depth = new Int32Array(size).fill(-1);
    let head = 0; let tail = 0;
    route.forEach((c, i) => { proj[c] = i; depth[c] = 0; queue[tail++] = c; });
    while (head < tail) {
      const c = queue[head++]!;
      for (let d = 0; d < 4; d += 1) {
        const m = nb[(c * 4) + d]!;
        if (open[m] === 1 && depth[m] === -1) { depth[m] = depth[c]! + 1; proj[m] = proj[c]!; queue[tail++] = m; }
      }
    }
    return { proj, depth, routeLen: route.length - 1 };
  };

  // 1. Decoy loops: wrong turns that rejoin the route elsewhere.
  if (looped) {
    const want = Math.min(QUALITY_DECOY_MAX, Math.floor(level / QUALITY_DECOY_PER_LEVEL));
    let placed = 0;
    for (let round = 0; round < want && placed < want; round += 1) {
      const { proj, depth, routeLen } = routeProjection();
      const candidates: (Connector & { extra: number; tip: boolean })[] = [];
      for (let src = 0; src < size; src += 1) {
        if (open[src] !== 1 || depth[src]! < 1 || src === s || src === g) { continue; }
        const isTip = degree(src) === 1;
        for (let d = 0; d < 4; d += 1) {
          for (const option of connectors(src, d, QUALITY_CONNECTOR_MAX)) {
            const pa = proj[src]!; const pb = proj[option.far]!;
            if (pa < 0 || pb < 0 || Math.abs(pa - pb) < 3) { continue; }
            const extra = depth[src]! + depth[option.far]! + option.cells.length + 1 - Math.abs(pa - pb);
            if (extra < QUALITY_DECOY_MIN_EXTRA || extra > Math.max(24, routeLen)) { continue; }
            candidates.push({ ...option, extra, tip: isTip });
          }
        }
      }
      shuffle(candidates, rand);
      candidates.sort((a, b) => Number(b.tip) - Number(a.tip));
      let any = false;
      for (const option of candidates.slice(0, QUALITY_DECOY_TRIES)) {
        if (option.cells.some((c) => open[c] === 1)) { continue; }
        if (!openCells(option.cells)) { continue; }
        if (holds()) { stats.decoyLoops += 1; placed += 1; any = true; break; }
        closeCells(option.cells);
      }
      if (!any) { break; }
    }
  }

  // 2. Stubs: bridged into a loop when the level allows loops, otherwise (or when no bridge holds) walled up.
  for (const tip of shuffle(tips(), rand)) {
    if (open[tip] !== 1 || degree(tip) !== 1) { continue; }
    const branch = branchCells(tip);
    if (branch === null || branch.cells.length > QUALITY_STUB_MAX_LEN) { continue; }
    if (!looped) { tryPrune(tip, QUALITY_STUB_MAX_LEN); continue; }
    let bridged = false;
    const options: Connector[] = [];
    for (const from of branch.cells) {
      for (let d = 0; d < 4; d += 1) { options.push(...connectors(from, d, QUALITY_CONNECTOR_MAX)); }
    }
    shuffle(options, rand);
    options.sort((a, b) => a.cells.length - b.cells.length);
    for (const option of options) {
      if (branch.cells.includes(option.far) || option.far === branch.host) { continue; }
      if (bfs(nb, tip, option.far) < QUALITY_STUB_MIN_LOOP) { continue; }
      if (!openCells(option.cells)) { continue; }
      if (holds()) { stats.stubsLooped += 1; bridged = true; break; }
      closeCells(option.cells);
    }
    if (!bridged) { tryPrune(tip, QUALITY_STUB_MAX_LEN); }
  }

  const added: { x: number; y: number }[] = [];
  const removed: { x: number; y: number }[] = [];
  for (let c = 0; c < size; c += 1) {
    if (open[c] === 1 && original[c] !== 1) { added.push({ x: xOf(c), y: yOf(c) }); }
    if (open[c] !== 1 && original[c] === 1) { removed.push({ x: xOf(c), y: yOf(c) }); }
  }
  const grid: boolean[][] = [];
  for (let y = 0; y < height; y += 1) {
    const row: boolean[] = [];
    for (let x = 0; x < width; x += 1) { row.push(open[(y * width) + x] === 1); }
    grid.push(row);
  }
  return { grid, added, removed, stats, changed: added.length > 0 || removed.length > 0 };
};
