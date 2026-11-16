// MAZER-GEN-020: STAIRCASE pathways, a flagged prototype (off by default).
//
// A true diagonal corridor would change the movement, navigation, edge-wrap, tile drawing and solver
// contracts. A STAIRCASE does not: it is a corridor of ordinary orthogonal cells whose cells step
// right, down, right, down ..., so the walls on both sides read as a diagonal line. Every contract that
// reads the grid sees the same kind of maze it always did.
//
// The pass is a POST-pass over a finished maze (after the felt tuner and the stub rule), never part of
// the carve, so the felt ladder, the one-tile stub rule and the floor-island rule are untouched by
// construction. It rewrites only the geometry of corridors, never their graph:
//
//   * a CHAIN is a run of degree-2 floor cells between two nodes (junction, border cell, start, goal)
//     or between one node and a free dead-end tip;
//   * a CORNER of a chain (the corridor turns 90 degrees) with straight arms of at least STAIRCASE_MIN_RUN
//     cells on both sides is CUT: the corner and up to STAIRCASE_MAX_RUN cells of each arm are re-laid as the
//     digital line between the two cells where the cut starts and ends (a chamfer). Same number of cells,
//     same two end cells, so route length, decision count and openings are identical;
//   * a straight dead-end chain of at least STAIRCASE_MIN_LEAF_CELLS keeps its length and its first cell
//     and bends into a diagonal staircase (the tip moves, nothing else does);
//   * the cells where a rewrite starts and ends never move, and every junction keeps the same open
//     neighbours. The pull-to-goal explorer that measures felt difficulty orders the neighbours of a
//     junction only; inside a corridor it has one choice. The felt number is therefore the same, and
//     the pass VERIFIES that (a mismatch returns the maze untouched).
//
// Every new cell must have exactly the open neighbours of the cell it replaces (2, or 1 for the tip of a
// dead end), and every fixed end cell must keep its degree, so a staircase never touches another corridor,
// never makes a 2x2 floor block, never meets a border opening, and never creates a one-tile stub.
//
// Pure, deterministic (seeded by the maze seed, row-major chain order), integer only, no clock.
import type { LegacyMazeSnapshot } from './legacyMaze';
import { measureFelt } from './legacyMazeFeltDifficulty';

export const LEGACY_STAIRCASE_PARAM = 'staircase';

// A cut needs this many cells of straight arm on BOTH sides of the corner to read as a diagonal (3 = at least
// three steps), and takes at most STAIRCASE_MAX_RUN cells of each arm: a longer cut would be a long shallow snake.
export const STAIRCASE_MIN_RUN = 3;
export const STAIRCASE_MAX_RUN = 5;
// A straight dead-end chain shorter than this stays as it is (three steps of two cells is the least that reads).
export const STAIRCASE_MIN_LEAF_CELLS = 7;
// Share of the eligible corners and dead ends (percent) that are rewritten: the pass keeps a mix of straight
// corners and diagonals, so the board stays calm.
export const STAIRCASE_SHARE_PERCENT = 60;

export interface LegacyStaircaseStats {
  // Corners cut into a diagonal plus dead ends bent into a staircase.
  readonly staircases: number;
  // Of those, the dead-end chains.
  readonly deadEndStaircases: number;
  // Eligible corners/dead ends that did not fit their surroundings (a neighbouring corridor was in the way) or lost the roll.
  readonly skipped: number;
  // Floor cells that moved (carved + walled).
  readonly cellsMoved: number;
  // Corners added to corridors (a staircase turns at every step).
  readonly turnsAdded: number;
  // True when the verification (felt number, route length) disagreed and the maze was returned untouched.
  readonly reverted: boolean;
}

type StaircaseMaze = Pick<LegacyMazeSnapshot, 'width' | 'height' | 'grid' | 'start' | 'goal' | 'solutionPath' | 'seed'>;

export const resolveLegacyStaircaseFlag = (search?: string | URLSearchParams | null): boolean => {
  const params = search instanceof URLSearchParams
    ? search
    : new URLSearchParams(typeof search === 'string' ? (search.startsWith('?') ? search.slice(1) : search) : '');
  const raw = params.get(LEGACY_STAIRCASE_PARAM);
  return raw !== null && /^(1|on|true|yes)$/i.test(raw.trim());
};

// The page's own query string, when there is a page (not in node, not in a worker: the worker host stays off
// while the flag is on, see legacyMazeWorkerClient.ts).
export const readLegacyStaircaseFlagFromLocation = (): boolean => (
  typeof location !== 'undefined' && typeof location.search === 'string' && resolveLegacyStaircaseFlag(location.search)
);

const createStream = (seed: number): (() => number) => {
  let state = (Math.imul(seed >>> 0, 0x2545f491) ^ 0x9e3779b9) >>> 0 || 1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state >>> 8;
  };
};

// The lattice path of |dx| X-steps and |dy| Y-steps that hugs the straight line between the two end cells
// (the digital line). `yFirst` breaks the exact ties the other way (a different, equally straight stair).
const latticeSteps = (adx: number, ady: number, yFirst: boolean): ('x' | 'y')[] => {
  const steps: ('x' | 'y')[] = [];
  let ix = 0;
  let iy = 0;
  while (ix < adx || iy < ady) {
    const left = (2 * ix + 1) * ady;
    const right = (2 * iy + 1) * adx;
    const takeX = ix < adx && (iy >= ady || (yFirst ? left < right : left <= right));
    steps.push(takeX ? 'x' : 'y');
    if (takeX) { ix += 1; } else { iy += 1; }
  }
  return steps;
};

const countTurns = (cells: readonly number[]): number => {
  let turns = 0;
  for (let i = 2; i < cells.length; i += 1) {
    if (cells[i]! - cells[i - 1]! !== cells[i - 1]! - cells[i - 2]!) { turns += 1; }
  }
  return turns;
};

interface Rewrite {
  readonly oldCells: number[];
  readonly newCells: number[];
}

export const applyStaircasePass = <T extends StaircaseMaze>(maze: T): T & { staircaseStats: LegacyStaircaseStats } => {
  const { width, height } = maze;
  const open = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (maze.grid[y]?.[x] === true) { open[y * width + x] = 1; }
    }
  }
  const startCell = maze.start.y * width + maze.start.x;
  const goalCell = maze.goal.y * width + maze.goal.x;
  const interior = (cell: number): boolean => {
    const x = cell % width;
    const y = (cell - x) / width;
    return x >= 1 && y >= 1 && x <= width - 2 && y <= height - 2;
  };
  // Interior cells only (a chain cell is never on the border ring, so no wrap neighbour is ever needed).
  const degree = (cell: number): number => (
    open[cell - 1]! + open[cell + 1]! + open[cell - width]! + open[cell + width]!
  );
  const isChainCell = (cell: number): boolean => (
    open[cell] === 1 && cell !== startCell && cell !== goalCell && interior(cell) && degree(cell) === 2
  );
  const isFreeTip = (cell: number): boolean => (
    open[cell] === 1 && cell !== startCell && cell !== goalCell && interior(cell) && degree(cell) === 1
  );
  const neighborsOf = (cell: number): number[] => {
    const out: number[] = [];
    for (const step of [-1, 1, -width, width]) {
      if (open[cell + step] === 1) { out.push(cell + step); }
    }
    return out;
  };

  // Chains, cells in walking order endA ... endB (the ends are not chain cells).
  const chains: { cells: number[]; endA: number; endB: number }[] = [];
  const seen = new Uint8Array(width * height);
  for (let cell = 0; cell < open.length; cell += 1) {
    if (seen[cell] === 1 || !isChainCell(cell)) { continue; }
    seen[cell] = 1;
    const [n1, n2] = neighborsOf(cell) as [number, number];
    const walk = (first: number): { cells: number[]; end: number; cycle: boolean } => {
      const cells: number[] = [];
      let prev = cell;
      let cur = first;
      while (isChainCell(cur)) {
        if (seen[cur] === 1) { return { cells, end: cur, cycle: true }; }
        seen[cur] = 1;
        cells.push(cur);
        const next = neighborsOf(cur).find((candidate) => candidate !== prev);
        if (next === undefined) { return { cells, end: cur, cycle: true }; }
        prev = cur;
        cur = next;
      }
      return { cells, end: cur, cycle: false };
    };
    const left = walk(n1);
    const right = walk(n2);
    if (left.cycle || right.cycle) { continue; }
    chains.push({ cells: [...left.cells.reverse(), cell, ...right.cells], endA: left.end, endB: right.end });
  }

  const rand = createStream((maze.seed ^ 0x3c6ef372) >>> 0);
  const rewrites: Rewrite[] = [];
  let skipped = 0;
  let deadEndStaircases = 0;

  // Carve `next` in place of `previous`, keep it only if every new cell has exactly the neighbours it
  // should and every fixed cell keeps its degree; otherwise restore the corridor exactly.
  const tryRewrite = (
    previous: readonly number[],
    next: readonly number[],
    fixed: readonly number[],
    tipEnds: boolean
  ): boolean => {
    const fixedDegrees = fixed.map((cell) => degree(cell));
    for (const cell of previous) { open[cell] = 0; }
    let fits = true;
    const carved: number[] = [];
    for (const cell of next) {
      if (!interior(cell) || open[cell] === 1) { fits = false; break; }
      open[cell] = 1;
      carved.push(cell);
    }
    if (fits) {
      for (let i = 0; i < next.length && fits; i += 1) {
        const want = tipEnds && i === next.length - 1 ? 1 : 2;
        if (degree(next[i]!) !== want) { fits = false; }
      }
      for (let i = 0; i < fixed.length && fits; i += 1) {
        if (degree(fixed[i]!) !== fixedDegrees[i]) { fits = false; }
      }
    }
    if (fits) { return true; }
    for (const cell of carved) { open[cell] = 0; }
    for (const cell of previous) { open[cell] = 1; }
    return false;
  };

  for (const chain of chains) {
    const leafA = isFreeTip(chain.endA);
    const leafB = isFreeTip(chain.endB);
    if (leafA && leafB) { continue; }
    const isLeaf = leafA || leafB;
    // Walking order from the node side; a dead end walks out to its tip.
    let cells = leafA
      ? [chain.endB, ...[...chain.cells].reverse(), chain.endA]
      : [chain.endA, ...chain.cells, chain.endB];
    const last = cells.length - 1;

    // Corners: each is cut into a diagonal when both arms are long enough.
    let cutAny = false;
    let at = 1;
    while (at < last) {
      const d1 = cells[at]! - cells[at - 1]!;
      const d2 = cells[at + 1]! - cells[at]!;
      if (d1 === d2) { at += 1; continue; }
      let arm1 = 0;
      while (at - arm1 - 1 >= 0 && cells[at - arm1]! - cells[at - arm1 - 1]! === d1) { arm1 += 1; }
      let arm2 = 0;
      while (at + arm2 + 1 <= last && cells[at + arm2 + 1]! - cells[at + arm2]! === d2) { arm2 += 1; }
      const k1 = Math.min(arm1, STAIRCASE_MAX_RUN);
      const k2 = Math.min(arm2, STAIRCASE_MAX_RUN);
      if (k1 < STAIRCASE_MIN_RUN || k2 < STAIRCASE_MIN_RUN) { at += 1; continue; }
      // Rolls are always drawn, so the stream does not depend on whether a corner fits.
      const roll = rand() % 100;
      const draw = rand();
      if (roll >= STAIRCASE_SHARE_PERCENT) { skipped += 1; at += 1; continue; }
      // Try the full cut first, then shorter cuts: a smaller diagonal needs less clear wall on the inside of the corner.
      const sizes: [number, number][] = [];
      for (let a = k1; a >= STAIRCASE_MIN_RUN; a -= 1) {
        for (let b = k2; b >= STAIRCASE_MIN_RUN; b -= 1) { sizes.push([a, b]); }
      }
      sizes.sort((x, y) => (y[0] + y[1]) - (x[0] + x[1]) || Math.abs(x[0] - x[1]) - Math.abs(y[0] - y[1]));
      // d1 and d2 are one horizontal and one vertical step: the digital line takes a of one, b of the other.
      const d1Horizontal = Math.abs(d1) === 1;
      let done = false;
      let used = 0;
      for (const [ka, kb] of sizes) {
        const q1 = cells[at - ka]!;
        const q2 = cells[at + kb]!;
        if (!interior(q1) || !interior(q2)) { continue; }
        const previous = cells.slice(at - ka + 1, at + kb);
        const adx = d1Horizontal ? ka : kb;
        const ady = d1Horizontal ? kb : ka;
        const stepX = d1Horizontal ? d1 : d2;
        const stepY = d1Horizontal ? d2 : d1;
        for (const yFirst of (draw & 1) === 0 ? [false, true] : [true, false]) {
          const next: number[] = [];
          let pos = q1;
          for (const axis of latticeSteps(adx, ady, yFirst)) {
            pos += axis === 'x' ? stepX : stepY;
            next.push(pos);
          }
          next.pop(); // the last step lands on q2, which stays
          if (next.every((cell, index) => cell === previous[index])) { continue; }
          if (tryRewrite(previous, next, [q1, q2], false)) {
            rewrites.push({ oldCells: [q1, ...previous, q2], newCells: [q1, ...next, q2] });
            cells = [...cells.slice(0, at - ka + 1), ...next, ...cells.slice(at + kb)];
            done = true;
            cutAny = true;
            used = kb;
            break;
          }
        }
        if (done) { break; }
      }
      if (!done) { skipped += 1; }
      at += done ? used : 1;
    }

    // A straight dead end of at least STAIRCASE_MIN_LEAF_CELLS bends into a staircase (first cell fixed, length kept).
    if (!isLeaf || cutAny || cells.length - 1 < STAIRCASE_MIN_LEAF_CELLS || countTurns(cells) > 0) { continue; }
    const roll = rand() % 100;
    const draw = rand();
    if (roll >= STAIRCASE_SHARE_PERCENT) { skipped += 1; continue; }
    const c1 = cells[1]!;
    const heading = c1 - cells[0]!;
    const sideways = Math.abs(heading) === 1 ? width : 1;
    const old = cells.slice(2);
    let done = false;
    for (const side of (draw & 1) === 0 ? [sideways, -sideways] : [-sideways, sideways]) {
      for (const first of (draw & 2) === 0 ? [heading, side] : [side, heading]) {
        const second = first === heading ? side : heading;
        const path: number[] = [];
        let pos = c1;
        for (let i = 0; i < old.length; i += 1) {
          pos += i % 2 === 0 ? first : second;
          path.push(pos);
        }
        if (tryRewrite(old, path, [c1], true)) {
          rewrites.push({ oldCells: [c1, ...old], newCells: [c1, ...path] });
          deadEndStaircases += 1;
          done = true;
          break;
        }
      }
      if (done) { break; }
    }
    if (!done) { skipped += 1; }
  }

  if (rewrites.length === 0) {
    return { ...maze, staircaseStats: { staircases: 0, deadEndStaircases: 0, skipped, cellsMoved: 0, turnsAdded: 0, reverted: false } };
  }

  // The route: a rewritten stretch on the route is walked end to end, so its cells are replaced in place (same count).
  const pathCells = maze.solutionPath.map((point) => point.y * width + point.x);
  let cellsMoved = 0;
  let turnsAdded = 0;
  for (const rewrite of rewrites) {
    cellsMoved += rewrite.newCells.filter((cell) => !rewrite.oldCells.includes(cell)).length;
    turnsAdded += Math.max(0, countTurns(rewrite.newCells) - countTurns(rewrite.oldCells));
    const length = rewrite.oldCells.length;
    const forwardAt = pathCells.indexOf(rewrite.oldCells[0]!);
    const reverseAt = pathCells.indexOf(rewrite.oldCells[length - 1]!);
    if (forwardAt >= 0 && rewrite.oldCells.every((cell, i) => pathCells[forwardAt + i] === cell)) {
      for (let i = 0; i < length; i += 1) { pathCells[forwardAt + i] = rewrite.newCells[i]!; }
    } else if (reverseAt >= 0 && rewrite.oldCells.every((_cell, i) => pathCells[reverseAt + i] === rewrite.oldCells[length - 1 - i])) {
      for (let i = 0; i < length; i += 1) { pathCells[reverseAt + i] = rewrite.newCells[length - 1 - i]!; }
    }
  }
  const grid: boolean[][] = [];
  for (let y = 0; y < height; y += 1) {
    const row: boolean[] = [];
    for (let x = 0; x < width; x += 1) { row.push(open[y * width + x] === 1); }
    grid.push(row);
  }
  const solutionPath = pathCells.map((cell) => ({ x: cell % width, y: Math.floor(cell / width) }));
  const next = { ...maze, grid, solutionPath };
  const before = measureFelt(maze);
  const after = measureFelt(next);
  // Every route cell is floor, and every step is one cell (or a wrap hop across the ring).
  const routeSteps = (route: readonly number[]): boolean => route.every((cell, i) => {
    if (open[cell] !== 1) { return false; }
    if (i === 0) { return true; }
    const jump = Math.abs(cell - route[i - 1]!);
    const columnJump = Math.abs((cell % width) - (route[i - 1]! % width));
    return jump === 1 || jump === width || columnJump > 1 || jump > width;
  });
  if (
    before.steps !== after.steps
    || before.pathLength !== after.pathLength
    || !after.reachedGoal
    || solutionPath.length !== maze.solutionPath.length
    || !routeSteps(pathCells)
  ) {
    return { ...maze, staircaseStats: { staircases: 0, deadEndStaircases: 0, skipped, cellsMoved: 0, turnsAdded: 0, reverted: true } };
  }
  return {
    ...next,
    staircaseStats: { staircases: rewrites.length, deadEndStaircases, skipped, cellsMoved, turnsAdded, reverted: false }
  };
};
