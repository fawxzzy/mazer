// Winding metrics ("pointless snaking", MAZER-GEN-007). Pure, integer-only, torus (wrap) adjacency
// exactly like legacyMazeStubs.ts and legacyMazeDifficultyMetrics.ts.
//
// Vocabulary
//   run       : a maximal chain of floor cells with EXACTLY two open neighbours (an unbranched
//               corridor: no junction, no dead end inside it). It ends at a junction (3+ open
//               neighbours), a dead-end tip, or the start/goal cell. A closed ring with no end is
//               ignored (the generator carves none).
//   corner    : a run cell whose two neighbours are not opposite each other (the corridor turns).
//   sign      : +1 / -1 for a left / right turn (cross product of the incoming and outgoing step).
//   gap       : the straight cells between two consecutive corners of a run.
//   hairpin   : two consecutive corners of the SAME sign with gap <= HAIRPIN_MAX_GAP (a U-turn: the
//               two arms run side by side, one wall apart).
//   zigzag    : a chain of consecutive corners of ALTERNATING sign, every gap <= ZIGZAG_MAX_GAP
//               (an S-bend / staircase); its size is the number of corners.
//   tight run : a chain of consecutive corners, every gap <= TIGHT_MAX_GAP, whatever the signs
//               (zigzags, hairpins and serpentines together).
//   tortuosity: (cells + 1) / Manhattan displacement between the two end cells, measured along the run's own unwrapped path, in
//               permille (1000 = dead straight or a single bend, 3000 = three times as long as the
//               way across). Computed over whole runs.
//
// POINTLESS SNAKING (the owner's word): a long unbranched run that winds. It adds path length and
// no decision: the player walks it with nothing to choose. Two readings are measured side by side:
//   * CLUTTER (the headline, `windingCellShare`): a run that is LONG (at least WINDING_MIN_RUN_CELLS
//     cells) and holds a tight chain of at least WINDING_MIN_TIGHT_CORNERS corners (S-bends,
//     zigzags, hairpin chains). The corridor keeps turning with nothing to choose.
//   * DETOUR (`tortuousCellShare`): a run that is long and TORTUOUS (tortuosity at least
//     WINDING_MIN_TORTUOSITY_PERMILLE), however few its turns: a long serpentine with long arms
//     counts here, not as clutter.
// Necessary turns (a run that bends once to get around a block, a short corner) count in neither.

export const WINDING_MIN_RUN_CELLS = 10;
export const WINDING_MIN_TORTUOSITY_PERMILLE = 1500;
export const WINDING_MIN_TIGHT_CORNERS = 4;
export const HAIRPIN_MAX_GAP = 1;
export const ZIGZAG_MAX_GAP = 2;
export const TIGHT_MAX_GAP = 2;

export interface WindingMaze {
  readonly width: number;
  readonly height: number;
  readonly grid: ReadonlyArray<ReadonlyArray<boolean>>;
  readonly start: { readonly x: number; readonly y: number };
  readonly goal: { readonly x: number; readonly y: number };
  readonly solutionPath?: ReadonlyArray<{ readonly x: number; readonly y: number }>;
}

export type WindingRunKind = 'route' | 'branch' | 'link';

export interface WindingRun {
  // Floor cells in the run (the cells with exactly two open neighbours).
  readonly cells: number;
  readonly turns: number;
  readonly hairpins: number;
  // Corners in the longest alternating-sign chain with every gap <= ZIGZAG_MAX_GAP (0 or 1 = none).
  readonly longestZigzag: number;
  // Corners in the longest chain with every gap <= TIGHT_MAX_GAP.
  readonly longestTight: number;
  readonly tortuosityPermille: number;
  // route: most cells are on the shortest route; branch: the run ends in a dead-end tip; link: the rest.
  readonly kind: WindingRunKind;
  // Clutter reading (see the header).
  readonly winding: boolean;
  // Detour reading (see the header).
  readonly tortuous: boolean;
}

export interface WindingMetrics {
  readonly floorCells: number;
  readonly runs: readonly WindingRun[];
  readonly runCells: number;
  readonly longestRun: number;
  readonly totalTurns: number;
  readonly hairpins: number;
  readonly longestZigzag: number;
  readonly longestTight: number;
  readonly windingRuns: number;
  readonly windingCells: number;
  // Share of ALL floor cells that lie in winding runs, permille.
  readonly windingCellShare: number;
  // The same share for the detour reading (long and tortuous), permille.
  readonly tortuousCellShare: number;
  readonly tortuousCells: number;
  // Turns per 10 cells over the long runs (cells >= WINDING_MIN_RUN_CELLS), x100 (integer).
  readonly longRunTurnDensity: number;
  // Cell-weighted mean tortuosity over the long runs, permille (1000 when there is none).
  readonly longRunTortuosity: number;
  // The same cell share, split by kind of run.
  readonly windingCellsByKind: Readonly<Record<WindingRunKind, number>>;
  // Junctions (3+ open neighbours) and dead-end tips: the "decisions" the winding does not give.
  readonly junctions: number;
  readonly deadEnds: number;
}

const DX = [1, -1, 0, 0] as const;
const DY = [0, 0, 1, -1] as const;

export const analyzeMazeWinding = (maze: WindingMaze): WindingMetrics => {
  const { width, height, grid } = maze;
  const size = width * height;
  const open = new Uint8Array(size);
  let floorCells = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (grid[y]?.[x] === true) { open[(y * width) + x] = 1; floorCells += 1; }
    }
  }
  const startCell = (maze.start.y * width) + maze.start.x;
  const goalCell = (maze.goal.y * width) + maze.goal.x;
  const neighborsOf = (cell: number): number[] => {
    const x = cell % width;
    const y = (cell - x) / width;
    const out: number[] = [];
    for (let d = 0; d < 4; d += 1) {
      const next = ((((y + DY[d]! + height) % height) * width) + ((x + DX[d]! + width) % width));
      if (next !== cell && open[next] === 1 && !out.includes(next)) { out.push(next); }
    }
    return out;
  };
  const degree = new Int8Array(size);
  let junctions = 0;
  let deadEnds = 0;
  for (let cell = 0; cell < size; cell += 1) {
    if (open[cell] !== 1) { continue; }
    degree[cell] = neighborsOf(cell).length;
    if (degree[cell]! >= 3) { junctions += 1; }
    if (degree[cell] === 1 && cell !== startCell && cell !== goalCell) { deadEnds += 1; }
  }
  const isRunCell = (cell: number): boolean => open[cell] === 1 && degree[cell] === 2 && cell !== startCell && cell !== goalCell;
  const route = new Uint8Array(size);
  maze.solutionPath?.forEach((p) => { route[(p.y * width) + p.x] = 1; });
  // Wrap-aware step between two ADJACENT cells (-1, 0 or 1 per axis).
  const stepOf = (from: number, to: number): readonly [number, number] => {
    let dx = (to % width) - (from % width);
    let dy = Math.floor(to / width) - Math.floor(from / width);
    if (dx > 1) { dx = -1; } else if (dx < -1) { dx = 1; }
    if (dy > 1) { dy = -1; } else if (dy < -1) { dy = 1; }
    return [dx, dy];
  };
  
  const seen = new Uint8Array(size);
  const runs: WindingRun[] = [];
  const windingCellsByKind: Record<WindingRunKind, number> = { route: 0, branch: 0, link: 0 };
  let runCells = 0;
  let longestRun = 0;
  let totalTurns = 0;
  let hairpinsTotal = 0;
  let longestZigzagAll = 0;
  let longestTightAll = 0;
  let windingRuns = 0;
  let windingCells = 0;
  let tortuousCells = 0;
  let longTurns = 0;
  let longCells = 0;
  let longTortuosityCells = 0;

  for (let seedCell = 0; seedCell < size; seedCell += 1) {
    if (seen[seedCell] === 1 || !isRunCell(seedCell)) { continue; }
    // Walk back to one end of the run, then forward collecting its cells in order.
    let end = seedCell;
    let before = -1;
    for (let guard = 0; guard <= size; guard += 1) {
      const options = neighborsOf(end).filter((cell) => cell !== before);
      const back = options.find((cell) => isRunCell(cell) && seen[cell] !== 1);
      if (back === undefined || options.length === 0) { break; }
      // Step toward the neighbour that is a run cell; stop when the other way is not one.
      before = end;
      end = back;
      if (end === seedCell) { break; }
    }
    // `end` may have been reached by walking in one direction only; walk from it the other way.
    const chain: number[] = [end];
    seen[end] = 1;
    let previous = -1;
    let current = end;
    for (let guard = 0; guard <= size; guard += 1) {
      const next = neighborsOf(current).find((cell) => cell !== previous && isRunCell(cell) && seen[cell] !== 1);
      if (next === undefined) { break; }
      chain.push(next);
      seen[next] = 1;
      previous = current;
      current = next;
    }
    // The run's end cells (junction / tip / start / goal) on each side.
    const first = chain[0]!;
    const last = chain[chain.length - 1]!;
    const outsideFirst = neighborsOf(first).find((cell) => chain.length === 1 ? true : cell !== chain[1]);
    const outsideLast = neighborsOf(last).find((cell) => chain.length === 1 ? cell !== outsideFirst : cell !== chain[chain.length - 2]);
    const terminals = [outsideFirst, outsideLast].filter((cell): cell is number => cell !== undefined);
    const hasTip = terminals.some((cell) => open[cell] === 1 && degree[cell] === 1 && cell !== startCell && cell !== goalCell);
    // Corners, in order, with their sign, and the straight cells between them.
    const corners: { index: number; sign: number }[] = [];
    for (let index = 0; index < chain.length; index += 1) {
      const cell = chain[index]!;
      const prev = index === 0 ? outsideFirst : chain[index - 1];
      const nextCell = index === chain.length - 1 ? outsideLast : chain[index + 1];
      if (prev === undefined || nextCell === undefined) { continue; }
      const a = stepOf(prev, cell);
      const b = stepOf(cell, nextCell);
      if (a[0] === b[0] && a[1] === b[1]) { continue; }
      corners.push({ index, sign: Math.sign((a[0] * b[1]) - (a[1] * b[0])) });
    }
    let hairpins = 0;
    let longestZigzag = corners.length >= 1 ? 1 : 0;
    let longestTight = corners.length >= 1 ? 1 : 0;
    let zig = 1;
    let tight = 1;
    for (let index = 1; index < corners.length; index += 1) {
      const gap = corners[index]!.index - corners[index - 1]!.index - 1;
      const sameSign = corners[index]!.sign === corners[index - 1]!.sign;
      if (sameSign && gap <= HAIRPIN_MAX_GAP) { hairpins += 1; }
      zig = !sameSign && gap <= ZIGZAG_MAX_GAP ? zig + 1 : 1;
      tight = gap <= TIGHT_MAX_GAP ? tight + 1 : 1;
      if (zig > longestZigzag) { longestZigzag = zig; }
      if (tight > longestTight) { longestTight = tight; }
    }
    if (longestZigzag < 2) { longestZigzag = 0; }
    // The way across: Manhattan displacement of the run's own unwrapped path (a corridor that
    // crosses the board edge is measured along itself, not the short way round the torus).
    const sequence = [...(outsideFirst !== undefined ? [outsideFirst] : []), ...chain, ...(outsideLast !== undefined ? [outsideLast] : [])];
    let sx = 0;
    let sy = 0;
    for (let index = 1; index < sequence.length; index += 1) {
      const step = stepOf(sequence[index - 1]!, sequence[index]!);
      sx += step[0];
      sy += step[1];
    }
    const across = Math.abs(sx) + Math.abs(sy);
    const pathSteps = chain.length + 1;
    const tortuosityPermille = Math.floor((pathSteps * 1000) / Math.max(1, across));
    const onRoute = chain.filter((cell) => route[cell] === 1).length;
    const kind: WindingRunKind = onRoute * 2 > chain.length ? 'route' : (hasTip ? 'branch' : 'link');
    const winding = chain.length >= WINDING_MIN_RUN_CELLS && longestTight >= WINDING_MIN_TIGHT_CORNERS;
    const tortuous = chain.length >= WINDING_MIN_RUN_CELLS && tortuosityPermille >= WINDING_MIN_TORTUOSITY_PERMILLE;
    runs.push({ cells: chain.length, turns: corners.length, hairpins, longestZigzag, longestTight, tortuosityPermille, kind, winding, tortuous });
    if (tortuous) { tortuousCells += chain.length; }
    runCells += chain.length;
    longestRun = Math.max(longestRun, chain.length);
    totalTurns += corners.length;
    hairpinsTotal += hairpins;
    longestZigzagAll = Math.max(longestZigzagAll, longestZigzag);
    longestTightAll = Math.max(longestTightAll, longestTight);
    if (chain.length >= WINDING_MIN_RUN_CELLS) {
      longCells += chain.length;
      longTurns += corners.length;
      longTortuosityCells += chain.length * tortuosityPermille;
    }
    if (winding) {
      windingRuns += 1;
      windingCells += chain.length;
      windingCellsByKind[kind] += chain.length;
    }
  }

  return {
    floorCells,
    runs,
    runCells,
    longestRun,
    totalTurns,
    hairpins: hairpinsTotal,
    longestZigzag: longestZigzagAll,
    longestTight: longestTightAll,
    windingRuns,
    windingCells,
    windingCellShare: floorCells > 0 ? Math.floor((windingCells * 1000) / floorCells) : 0,
    tortuousCellShare: floorCells > 0 ? Math.floor((tortuousCells * 1000) / floorCells) : 0,
    tortuousCells,
    longRunTurnDensity: longCells > 0 ? Math.floor((longTurns * 1000) / longCells) : 0,
    longRunTortuosity: longCells > 0 ? Math.floor(longTortuosityCells / longCells) : 1000,
    windingCellsByKind,
    junctions,
    deadEnds
  };
};
