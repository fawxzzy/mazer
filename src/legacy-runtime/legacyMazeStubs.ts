// One-tile stub rule (MAZER-GEN-004). Pure, integer-only, torus (wrap) adjacency exactly like
// legacyMazeDifficultyMetrics.ts: a floor tile on one border is adjacent to the floor tile on the
// opposite border.
//
// Vocabulary
//   dead end  : floor cell with exactly one open neighbour (start and goal excluded: they are the
//               caps of the route by design).
//   branch    : the run of cells from a dead end back to (but excluding) the first junction (a cell
//               with 3+ open neighbours) or route endpoint.
//   stub      : a branch of exactly ONE cell: a nub whose single neighbour is a junction.
//
// THE RULE: no dead-end branch of a generated ladder maze is shorter than
// MIN_DEAD_END_BRANCH_CELLS cells. The start and goal caps are exempt (they are the route's ends,
// not branches). The value is 2, not 3: a nub of one tile is what the owner named ("singular tile
// split offs"); a 2-cell spur still reads as a short side street, and 3 is the felt explorer's
// vision limit (FELT_VISION_CELLS), so a minimum above 3 would stop the fringe being free for the
// explorer. Raising it to 3 is the same code path but is NOT validated by this card.

export const MIN_DEAD_END_BRANCH_CELLS = 2;

export interface StubMaze {
  readonly width: number;
  readonly height: number;
  readonly grid: ReadonlyArray<ReadonlyArray<boolean>>;
  readonly start: { readonly x: number; readonly y: number };
  readonly goal: { readonly x: number; readonly y: number };
}

export interface DeadEndBranch {
  // The dead-end tip, and the junction (or route endpoint) the branch hangs off.
  readonly tip: { readonly x: number; readonly y: number };
  readonly host: { readonly x: number; readonly y: number } | null;
  // Cells in the branch (tip included, host excluded). 1 = a one-tile stub.
  readonly length: number;
}

const DX = [1, -1, 0, 0] as const;
const DY = [0, 0, 1, -1] as const;

export const countOpenNeighbors = (maze: Pick<StubMaze, 'width' | 'height' | 'grid'>, x: number, y: number): number => {
  const { width, height, grid } = maze;
  let open = 0;
  for (let d = 0; d < 4; d += 1) {
    const nx = (x + DX[d]! + width) % width;
    const ny = (y + DY[d]! + height) % height;
    if ((nx !== x || ny !== y) && grid[ny]?.[nx] === true) { open += 1; }
  }
  return open;
};

// Every dead-end branch of the maze, in row-major tip order (deterministic). Independent of the
// tuner's flat-index probe below, so tests can cross-check one against the other.
export const collectDeadEndBranches = (maze: StubMaze): DeadEndBranch[] => {
  const { width, height, grid } = maze;
  const isEndpoint = (x: number, y: number): boolean => (
    (x === maze.start.x && y === maze.start.y) || (x === maze.goal.x && y === maze.goal.y)
  );
  const neighbors = (x: number, y: number): { x: number; y: number }[] => {
    const out: { x: number; y: number }[] = [];
    for (let d = 0; d < 4; d += 1) {
      const nx = (x + DX[d]! + width) % width;
      const ny = (y + DY[d]! + height) % height;
      if ((nx !== x || ny !== y) && grid[ny]?.[nx] === true) { out.push({ x: nx, y: ny }); }
    }
    return out;
  };
  const branches: DeadEndBranch[] = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (grid[y]?.[x] !== true || isEndpoint(x, y)) { continue; }
      const first = neighbors(x, y);
      if (first.length !== 1) { continue; }
      let length = 1;
      let previous = { x, y };
      let current = first[0]!;
      let host: { x: number; y: number } | null = current;
      for (;;) {
        if (isEndpoint(current.x, current.y)) { break; }
        const next = neighbors(current.x, current.y).filter((cell) => cell.x !== previous.x || cell.y !== previous.y);
        if (next.length !== 1) { break; }
        length += 1;
        previous = current;
        current = next[0]!;
        host = current;
        if (length > width * height) { host = null; break; }
      }
      branches.push({ tip: { x, y }, host, length });
    }
  }
  return branches;
};

// One-tile stubs (branches shorter than the rule's minimum).
export const collectOneTileStubs = (maze: StubMaze): DeadEndBranch[] => (
  collectDeadEndBranches(maze).filter((branch) => branch.length < MIN_DEAD_END_BRANCH_CELLS)
);

export interface DeadEndBranchProbe {
  // Cells in the branch, tip included, host excluded.
  readonly length: number;
  // The cell the branch hangs off (a junction, a route endpoint, or the far end of an isolated pair).
  readonly host: number;
}

// Flat-index twin of collectDeadEndBranches for the tuner's typed-array world (`neighbors` is the
// torus table cell * 4 + direction of createFeltExplorer). Returns null when `tip` is not a dead end.
export const probeDeadEndBranch = (
  open: Uint8Array,
  neighbors: Int32Array,
  tip: number,
  startCell: number,
  goalCell: number
): DeadEndBranchProbe | null => {
  const onward = (cell: number, previous: number): number[] => {
    const out: number[] = [];
    for (let d = 0; d < 4; d += 1) {
      const next = neighbors[(cell * 4) + d]!;
      if (next !== cell && next !== previous && open[next] === 1 && !out.includes(next)) { out.push(next); }
    }
    return out;
  };
  const degree = (cell: number): number => {
    const seen: number[] = [];
    for (let d = 0; d < 4; d += 1) {
      const next = neighbors[(cell * 4) + d]!;
      if (next !== cell && open[next] === 1 && !seen.includes(next)) { seen.push(next); }
    }
    return seen.length;
  };
  if (open[tip] !== 1 || tip === startCell || tip === goalCell || degree(tip) !== 1) { return null; }
  let previous = -1;
  let current = tip;
  let length = 1;
  const cap = open.length;
  for (;;) {
    const next = onward(current, previous)[0];
    if (next === undefined) { return { length, host: current }; }
    if (next === startCell || next === goalCell || degree(next) !== 2 || length >= cap) { return { length, host: next }; }
    previous = current;
    current = next;
    length += 1;
  }
};

export interface StubFixResult {
  // Cells opened to lengthen a short branch (one cell per lengthened stub), in order.
  readonly lengthened: number[];
  // Stub tips walled up again, in order.
  readonly removed: number[];
  // Stubs neither move could fix (the verifier refused both).
  readonly remaining: number;
}

export interface StubFixContext {
  readonly open: Uint8Array;
  readonly neighbors: Int32Array;
  readonly startCell: number;
  readonly goalCell: number;
  // Flat-index offsets of the four orthogonal moves, in the neighbour table's direction order
  // ([+1, -1, +width, -width]: direction ^ 1 is the opposite).
  readonly step: readonly number[];
  readonly interior: (cell: number) => boolean;
  readonly rand: () => number;
  // Re-runs the felt explorer on the edited grid; true when the maze still lands exactly as it
  // did before the pass (goal reached, same step count). Called after every candidate edit.
  readonly verify: () => boolean;
}

export const countStubTips = (context: Pick<StubFixContext, 'open' | 'neighbors' | 'startCell' | 'goalCell'>): number => {
  let count = 0;
  for (let cell = 0; cell < context.open.length; cell += 1) {
    const probe = probeDeadEndBranch(context.open, context.neighbors, cell, context.startCell, context.goalCell);
    if (probe !== null && probe.length < MIN_DEAD_END_BRANCH_CELLS) { count += 1; }
  }
  return count;
};

// The post-pass: for every dead-end branch shorter than MIN_DEAD_END_BRANCH_CELLS, first LENGTHEN it
// (open one free wall cell beyond the tip, straight on first: the dead-end and junction counts stay
// exactly as they were, the branch merely stops being a nub), and when no free wall cell is there,
// REMOVE it (wall the tip up; the host loses one open side, the maze one dead end and possibly one
// junction). Every edit is kept only when `verify` says the landed felt number is unchanged,
// otherwise it is rolled back. Connectivity cannot break: a tip is a leaf, a lengthened cell touches
// only the tip (no new cycle, no 2x2 block). Deterministic: row-major candidate order, the caller's
// own random stream picks the side to try first.
export const fixOneTileStubs = (context: StubFixContext): StubFixResult => {
  const { open, neighbors, startCell, goalCell, step, interior, rand, verify } = context;
  const stubTips: number[] = [];
  for (let cell = 0; cell < open.length; cell += 1) {
    const probe = probeDeadEndBranch(open, neighbors, cell, startCell, goalCell);
    if (probe !== null && probe.length < MIN_DEAD_END_BRANCH_CELLS) { stubTips.push(cell); }
  }
  const lengthened: number[] = [];
  const removed: number[] = [];
  let remaining = 0;
  const openCount = (cell: number): number => {
    let n = 0;
    for (let d = 0; d < 4; d += 1) { n += open[neighbors[(cell * 4) + d]!]!; }
    return n;
  };
  for (const tip of stubTips) {
    // An earlier fix may already have changed this branch.
    const probe = probeDeadEndBranch(open, neighbors, tip, startCell, goalCell);
    if (probe === null || probe.length >= MIN_DEAD_END_BRANCH_CELLS) { continue; }
    let fixed = false;
    if (interior(tip)) {
      // Straight on from the host first (the tip keeps pointing the way it points), then the sides.
      let straight = -1;
      for (let d = 0; d < 4; d += 1) { if (neighbors[(tip * 4) + d] === probe.host) { straight = d ^ 1; } }
      const sides = [0, 1, 2, 3].filter((d) => d !== straight && neighbors[(tip * 4) + d] !== probe.host);
      const sideOrder = rand() % 2 === 0 ? sides : sides.slice().reverse();
      const order = straight >= 0 ? [straight, ...sideOrder] : sideOrder;
      for (const d of order) {
        const cell = tip + step[d]!;
        if (!interior(cell) || open[cell] === 1 || openCount(cell) !== 1) { continue; }
        open[cell] = 1;
        if (verify()) {
          lengthened.push(cell);
          fixed = true;
          break;
        }
        open[cell] = 0;
      }
    }
    if (!fixed && interior(tip)) {
      open[tip] = 0;
      if (verify()) {
        removed.push(tip);
        fixed = true;
      } else {
        open[tip] = 1;
      }
    }
    if (!fixed) { remaining += 1; }
  }
  return { lengthened, removed, remaining };
};

// Hard backstop for the rare maze the verifier could not clear (every move changed the landed
// number): wall every remaining stub tip up, unverified. A tip is a leaf, so connectivity, the
// route and the start and goal are untouched; only the (already best-effort) felt number may move.
export const forceRemoveOneTileStubs = (maze: StubMaze & { grid: boolean[][] }): { x: number; y: number }[] => {
  const removed: { x: number; y: number }[] = [];
  for (const branch of collectOneTileStubs(maze)) {
    maze.grid[branch.tip.y]![branch.tip.x] = false;
    removed.push({ x: branch.tip.x, y: branch.tip.y });
  }
  return removed;
};
