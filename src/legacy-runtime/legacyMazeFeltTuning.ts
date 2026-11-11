// Felt-difficulty tuning: a deterministic, integer-only post-carve stage that
// takes one generated base maze and lands its FELT difficulty (explorer steps,
// legacyMazeFeltDifficulty.ts) on an exact per-level target, instead of searching
// hundreds of candidate mazes for one that happens to be close.
//
// Two levers, both inside the frozen board, both leaving the border ring, the
// start and the goal alone (so wrap topology and the edge-wrap count never
// change):
//
//  1. ROUTE STRETCH (switchback bumps). Pick three consecutive collinear route
//     cells a, b, c with b a plain corridor cell, wall b off, and carve a U-shaped
//     detour a -> a1..ad -> bd -> cd..c1 -> c on free wall space. The route gets
//     2 * depth cells longer and cannot be short-circuited, because every carved
//     cell touches exactly one open neighbour when it is carved (the last cell
//     touches the previous chain cell and c). Bumps recurse: the detour has
//     straight stretches of its own.
//  2. DEEP DECEPTIVE BRANCHES. Dead-end branches (up to maxBranch cells, much
//     longer than the single-tile nubs of the first ladder) hosted on cells the
//     explorer actually visits: off the final path anywhere inside a wrong region,
//     and on the path only with a first step that points at the goal (a lure).
//     Hosts nearer the goal are preferred half of the time, which clusters decoys
//     on the goal side. Extending a visited dead-end tip by a few cells and
//     trimming one give the fine control (+-2 per cell), so any integer target is
//     reachable to within the tolerance.
//
//  3. FRINGE (only past the felt saturation, legacyGeometryBudget.ts). After the number has
//     landed, short side stubs of 1..FELT_VISION_CELLS cells are carved into the wall pockets
//     the other levers left, one explorer re-run each, kept only when the step count is
//     exactly unchanged. The explorer does not enter a stub that short at a junction, so the
//     felt value does not move while the maze gains junctions and dead ends.
//
//  4. DOUBLE LURE (every ladder maze from level 2, legacyGeometryBudget.ts). Not an extra edit but a
//     rule on lever 2: every fork carved straight off the route must also look closer to the START
//     than the way back along the route (`doubleLure`), so the same explorer run from the goal end
//     pays for the fork too. The board is fully visible, so a player can work back from the goal;
//     forks that point toward the goal only cost that player about half (reverse 0.3-0.6 of the
//     forward number). The lure needs no floor and does not move the forward number; the finished
//     maze reports its reverse felt value and may be held to a floor (`reverseFloor`).
//
// Every move is verified by re-running the explorer on the edited grid (about
// 20 microseconds), so the landing is exact for the real final grid, wrap loops
// included -- there is no model between the edit and the number. A move that does
// not bring the number closer to the target is rolled back. With a target step
// larger than twice the tolerance, the realized felt value of adjacent levels can
// therefore never tie or invert, for any seeds, up to the capacity ceiling.
//
// Pure: no ambient randomness or clock, no floats, no I/O.

import { FELT_VISION_CELLS, createFeltExplorer, type FeltRun } from './legacyMazeFeltDifficulty';
import {
  LOOP_DECOY_MIN_CELLS,
  LOOP_FELT_HEADROOM,
  carveLegacyLoops,
  breakAccidentalCycles,
  createLoopSearch,
  createPlanarNeighbors,
  createRouteMeter,
  legacyLoopPlanSize,
  type LegacyLoopCarveResult,
  type LegacyLoopPlan,
  type LegacyLoopRecord
} from './legacyMazeLoops';

export interface FeltTuningMaze {
  readonly width: number;
  readonly height: number;
  readonly grid: ReadonlyArray<ReadonlyArray<boolean>>;
  readonly start: { readonly x: number; readonly y: number };
  readonly goal: { readonly x: number; readonly y: number };
  readonly solutionPath: ReadonlyArray<{ readonly x: number; readonly y: number }>;
}

export interface FeltTuningOptions {
  // The accept window is [target, target + overshoot] (default FELT_TUNING_OVERSHOOT):
  // one-sided, so a target step of at least overshoot + 1 can never tie or invert.
  readonly overshoot?: number;
  // Route length the stretch lever aims for (cells - 1). Omit or <= current: no stretch.
  readonly routeTarget?: number;
  // Deepest single switchback bump (cells added per side).
  readonly maxBumpDepth?: number;
  // Longest deceptive branch carved in one move.
  readonly maxBranch?: number;
  // Longest branch carved directly off the route (a fork the player meets on the
  // way); deeper wrong ground grows from the cells of those forks, up to maxBranch.
  // Defaults to maxBranch.
  readonly routeBranch?: number;
  // Forks to put on the route first (route-hosted lure branches of 4..routeBranch
  // cells, as many as the felt budget affords), so the player meets many choices on
  // the way and not a few long dead ends. 0 (default) leaves it to the fill.
  readonly forks?: number;
  // Hard cap on explorer evaluations per attempt (safety bound).
  readonly maxEvals?: number;
  // Highest PRICED target a looped maze may ask for (the ladder's capacity ceiling):
  // loops whose priced saving would pass it are given back.
  readonly feltCeiling?: number;
  // Loops (multiple routes) carved before the route stretch and the branches
  // (legacyMazeLoops.ts). Omit or an empty plan: a single-route maze, byte-identical
  // to the pre-loop tuner. They use their own random stream.
  readonly loops?: LegacyLoopPlan;
  // Wrap pricing (percent of the wrap saving, see FELT_WRAP_PRICE_PERCENT): the steps the
  // maze's wrap corridors give back to a player who knows the map are added to the target
  // like a loop saving. Omit or 0: wraps are not priced (the tuner of the first ladders,
  // byte-identical); the ladder passes FELT_WRAP_PRICE_PERCENT.
  readonly wrapPricePercent?: number;
  // Fringe (lever 3): exactly this many cells of zero-felt-cost side stubs (1..FELT_VISION_CELLS
  // cells, hanging off corridor or junction cells) are added AFTER the felt value has landed,
  // each kept only when the re-run explorer's step count is unchanged. A maze that cannot hold
  // the full count reports it in fringeShortfall (and a window distance of at least that), so
  // the selection tries the next base. Omit or 0: byte-identical to the tuner without the lever.
  readonly fringeCells?: number;
  // Double lure (lever 4, every ladder maze, legacyGeometryBudget.ts): every fork carved
  // straight off the route must also point toward the START (it has to look closer to the start
  // than the way back along the route), on top of the goal-ward lure every route fork already
  // has. A solver who works from the goal end then pays for those forks too, which the forward
  // explorer cannot see. Omit or false: byte-identical to the tuner without the lever (no extra
  // random draw is made).
  readonly doubleLure?: boolean;
  // Floor of the REVERSE felt value (the same explorer run from the goal to the start, minus the
  // same priced savings). A maze below it reports the shortfall in `windowDistance` (so the
  // restarts and then the next base are tried). 0 or omitted: no floor.
  readonly reverseFloor?: number;
  // Restarts from the untouched base with another stream (default FELT_TUNING_ATTEMPTS). A caller
  // that has another base to try (the ladder selection) passes fewer: a restart of a base that
  // missed its window or its floor rescues it only about one time in ten, a new base more often
  // and for the same cost.
  readonly attempts?: number;
}

export interface FeltTuningResult {
  // New grid (the input is never mutated).
  readonly grid: boolean[][];
  readonly felt: number;
  readonly target: number;
  readonly onTarget: boolean;
  // Route length (cells - 1) after the stretch lever, before any wrap shortcut.
  readonly routeLength: number;
  readonly bumps: number;
  readonly branchesAdded: number;
  readonly cellsTrimmed: number;
  readonly addedTiles: { x: number; y: number }[];
  readonly trimmedTiles: { x: number; y: number }[];
  // Loops carved (empty for a single-route maze) and their cells.
  // Accidental base-maze cycles that were broken (one closed cell each).
  readonly cyclesBroken: number;
  readonly loops: readonly LegacyLoopRecord[];
  // Steps the loops give back to a player who knows the map (priced into the target).
  readonly loopSaving: number;
  // Steps the wrap corridors give back to a player who knows the map: the shortest route
  // with the wrap links severed (and loop connectors closed) minus the shortest route with
  // them (loop connectors closed). Measured on every tune; priced only with wrapPricePercent.
  readonly wrapSaving: number;
  // The schedule target before the priced savings; target is baseTarget + priced savings.
  readonly baseTarget: number;
  readonly loopDiagnostics: { attempts: number; rejected: LegacyLoopCarveResult['rejected'] } | null;
  readonly loopTiles: { x: number; y: number }[];
  // Fringe stub cells added (lever 3) and the cells the request fell short by.
  readonly fringeTiles: { x: number; y: number }[];
  readonly fringeShortfall: number;
  // The reverse felt value (explorer from the goal to the start, minus the priced savings) of the
  // finished maze, measured on every tune; and the steps it fell short of `reverseFloor`.
  readonly reverseFelt: number;
  readonly reverseShortfall: number;
  // Cells the stretch lever carved / removed.
  readonly stretchTiles: { x: number; y: number }[];
  readonly stretchRemovedTiles: { x: number; y: number }[];
  // True when an add was needed and no site brought the number closer.
  readonly capacityExhausted: boolean;
  readonly evals: number;
  // Distance of felt from the accept window (0 when onTarget), plus the fringe shortfall: a
  // maze that missed its fringe count is as far from landing as one that missed its number.
  readonly windowDistance: number;
  // |felt - mean over FELT_TIE_SAMPLES other tie-breaks| as an integer percent of felt.
  readonly tieDeviationPercent: number;
  // The base's own route is already longer than the target allows (route cells
  // are never removed), so no edit can land; nothing was tried.
  readonly hopeless: boolean;
}

export const FELT_TUNING_OVERSHOOT = 1;
export const FELT_TUNING_DEFAULT_MAX_BRANCH = 24;
export const FELT_TUNING_DEFAULT_MAX_BUMP_DEPTH = 12;
export const FELT_TUNING_DEFAULT_MAX_EVALS = 700;
export const FELT_TUNING_ATTEMPTS = 6;
// Ambiguity pricing. A loop can be a coin flip for the explorer: at a fork whose ways look
// equally promising the deterministic tie-break picks ONE way, and the realized number can
// sit far from what the same walker pays on average over the other tie-breaks. The
// ladder's ordering guarantee is on the deterministic number, so a landed maze is only
// preferred while that number agrees with the average of FELT_TIE_SAMPLES other tie-breaks
// within FELT_TIE_DEVIATION_LIMIT_PERCENT (integer percent). Plain mazes agree exactly;
// a looped maze that does not is retried (another stream, then another base maze).
// Loop pricing. A shortcut or alternate that shortens the route is easier for anyone who
// finds it, and the explorer walks past part of that ease, so the raw explorer number
// understates it. The felt value the ladder lands is PRICED: explorer steps minus the
// steps the loops give back to a player who knows the map (the shortest route with every
// loop connector closed, minus the shortest route as built), at this percent. At 100 each
// step a loop saves must be paid for by one more explorer step elsewhere in the maze.
export const FELT_LOOP_PRICE_PERCENT = 100;
// Wrap pricing. A wrap corridor is a loop through the board edge: a free shortcut for
// anyone who knows the map, and the explorer walks past it as easily as past a loop. Same
// rule, same measure: the wrap saving (shortest route with the wrap links severed minus
// the shortest route as built, loop connectors closed in both so the two savings add up
// exactly) is paid for by explorer steps elsewhere. Measured by the paired experiment in
// scripts/analysis/progression-wrap-pricing.ts; see the contract section 2026-11-10 wrap fade.
export const FELT_WRAP_PRICE_PERCENT = 100;
export const FELT_TIE_SAMPLES = 6;
export const FELT_TIE_DEVIATION_LIMIT_PERCENT = 12;

const createStream = (seed: number): (() => number) => {
  let state = (Math.imul(seed >>> 0, 0x9e3779b1) ^ 0x85ebca6b) >>> 0 || 1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state >>> 8;
  };
};

// Integer percent distance between the deterministic explorer steps and the mean of the
// same explorer over FELT_TIE_SAMPLES other tie-breaks.
const measureTieDeviationPercent = (
  explorer: ReturnType<typeof createFeltExplorer>,
  open: Uint8Array,
  startCell: number,
  goalCell: number,
  felt: number
): number => {
  if (felt <= 0) { return 0; }
  let sum = 0;
  for (let sample = 1; sample <= FELT_TIE_SAMPLES; sample += 1) {
    sum += explorer.run(open, startCell, goalCell, ((sample * 7919) | 1)).steps;
  }
  return Math.floor((100 * Math.abs((FELT_TIE_SAMPLES * felt) - sum)) / (FELT_TIE_SAMPLES * felt));
};

const tuneOnce = (
  maze: FeltTuningMaze,
  baseTarget: number,
  seed: number,
  options: FeltTuningOptions
): FeltTuningResult => {
  // The effective target: the schedule target plus the priced loop saving (below).
  let target = baseTarget;
  const overshoot = options.overshoot ?? FELT_TUNING_OVERSHOOT;
  // Distance of a felt value from the accept window [target, target + overshoot].
  const windowGap = (value: number): number => (value < target ? target - value : (value > target + overshoot ? value - target - overshoot : 0));
  const maxBranch = Math.max(4, options.maxBranch ?? FELT_TUNING_DEFAULT_MAX_BRANCH);
  const routeBranch = Math.max(4, Math.min(maxBranch, options.routeBranch ?? maxBranch));
  const forkTarget = Math.max(0, Math.trunc(options.forks ?? 0));
  const maxBumpDepth = Math.max(1, options.maxBumpDepth ?? FELT_TUNING_DEFAULT_MAX_BUMP_DEPTH);
  const maxEvals = options.maxEvals ?? FELT_TUNING_DEFAULT_MAX_EVALS;
  const { width, height } = maze;
  const size = width * height;
  const open = new Uint8Array(size);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (maze.grid[y]?.[x] === true) { open[(y * width) + x] = 1; }
    }
  }
  const startCell = (maze.start.y * width) + maze.start.x;
  const goalCell = (maze.goal.y * width) + maze.goal.x;
  const goalX = maze.goal.x;
  const goalY = maze.goal.y;
  const explorer = createFeltExplorer(width, height);
  const rand = createStream(seed);

  const interior = (cell: number): boolean => {
    const x = cell % width;
    const y = (cell - x) / width;
    return x >= 1 && y >= 1 && x <= width - 2 && y <= height - 2;
  };
  const openCount = (cell: number): number => {
    let n = 0;
    for (let d = 0; d < 4; d += 1) { n += open[explorer.neighbors[(cell * 4) + d]!]!; }
    return n;
  };
  const dist2 = (cell: number): number => {
    const x = cell % width;
    const y = (cell - x) / width;
    const dx = Math.min(Math.abs(x - goalX), width - Math.abs(x - goalX));
    const dy = Math.min(Math.abs(y - goalY), height - Math.abs(y - goalY));
    return (dx * dx) + (dy * dy);
  };
  const point = (cell: number): { x: number; y: number } => ({ x: cell % width, y: (cell - (cell % width)) / width });
  const step = [1, -1, width, -width] as const;
  const dist2Start = (cell: number): number => {
    const x = cell % width;
    const y = (cell - x) / width;
    const dx = Math.min(Math.abs(x - maze.start.x), width - Math.abs(x - maze.start.x));
    const dy = Math.min(Math.abs(y - maze.start.y), height - Math.abs(y - maze.start.y));
    return (dx * dx) + (dy * dy);
  };
  // Double lure (lever 4): every fork carved straight off the route points toward the goal AND
  // toward the start, so the explorer pulled from the goal end pays for it too.
  const doubleLure = options.doubleLure === true;
  const reverseFloor = Math.max(0, Math.trunc(options.reverseFloor ?? 0));

  // Cells never trimmed: the base route, and every cell the stretch lever carves.
  const onRoute = new Uint8Array(size);
  maze.solutionPath.forEach((p) => { onRoute[(p.y * width) + p.x] = 1; });

  let evals = 0;
  const evaluate = (): FeltRun => { evals += 1; return explorer.run(open, startCell, goalCell); };

  // ---- Lever -1: accidental cycles ------------------------------------------------
  // The base generator closes a loop by accident now and then. Every loop of a ladder
  // maze is designed (lever 0), so an accidental one is broken first: the cycle becomes
  // two dead-end tails (legacyMazeLoops.ts, breakAccidentalCycles).
  const brokenCells = breakAccidentalCycles(width, height, open, startCell, goalCell, new Set(maze.solutionPath.map((p) => (p.y * width) + p.x)));

  // ---- Lever 0: loops (multiple routes) --------------------------------------
  // Carved first so the stretch and the branches are tuned on the maze the player
  // will actually see: a shortcut changes the explorer's route, a decoy changes its
  // cost, and the levers below land the exact target on top of them. The loops use
  // their own stream, so a plan-less maze draws exactly what it always did.
  let loopRecords: readonly LegacyLoopRecord[] = [];
  let loopDiagnostics: { attempts: number; rejected: LegacyLoopCarveResult['rejected'] } | null = null;
  const loopTiles: { x: number; y: number }[] = [];
  const loopPlan = options.loops;
  const loopSearch = createLoopSearch(width, height, open);
  if (loopPlan !== undefined && legacyLoopPlanSize(loopPlan) > 0) {
    const first = evaluate();
    if (first.reachedGoal) {
      const carved = carveLegacyLoops({
        width,
        height,
        open,
        neighbors: explorer.neighbors,
        startCell,
        goalCell,
        plan: loopPlan,
        rand: createStream((seed ^ 0x51ed270b) >>> 0),
        evaluate,
        feltLimit: baseTarget - LOOP_FELT_HEADROOM,
        search: loopSearch
      });
      loopRecords = carved.records;
      loopDiagnostics = { attempts: carved.attempts, rejected: carved.rejected };
      carved.records.forEach((record) => record.cells.forEach((cell) => {
        onRoute[cell] = 1;
        loopTiles.push({ x: cell % width, y: (cell - (cell % width)) / width });
      }));
    }
  }

  // ---- Lever 1: route stretch ------------------------------------------------
  // The route that is stretched is the explorer's final path: the way a player
  // actually walks, which on a maze with wrap corridors can be much shorter than
  // the direct-floor solution path.
  const stretchTiles: { x: number; y: number }[] = [];
  const stretchRemovedTiles: { x: number; y: number }[] = [];
  let bumps = 0;
  let run = evaluate();
  let routeLength = run.pathLength;
  let hopeless = run.reachedGoal && run.pathLength > baseTarget + overshoot;

  // Try one switchback bump on a random straight stretch of the explorer's path,
  // `depthWanted` deep (shallower when it does not fit). It is kept only when
  // `accept` approves the re-run explorer; otherwise it is rolled back.
  const tryBump = (depthWanted: number, accept: (next: FeltRun) => boolean): boolean => {
    const path: number[] = [];
    for (let cell = startCell; cell >= 0 && path.length <= size; cell = run.pathNext[cell]!) { path.push(cell); if (cell === goalCell) { break; } }
    const i = rand() % Math.max(1, path.length - 2);
    const a = path[i]!;
    const b = path[i + 1];
    const c = path[i + 2];
    if (b === undefined || c === undefined || b - a !== c - b
      || !(Math.abs(b - a) === 1 || Math.abs(b - a) === width)
      || !interior(a) || !interior(b) || !interior(c) || openCount(b) !== 2
      || b === startCell || b === goalCell) {
      return false;
    }
    const axis = b - a;
    const perps = Math.abs(axis) === 1 ? [width, -width] : [1, -1];
    const first = rand() % 2;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const p = perps[(first + attempt) % 2]!;
      for (let d = depthWanted; d >= 1; d -= 1) {
        // Chain: a1..ad, bd, cd..c1.
        const chain: number[] = [];
        for (let k = 1; k <= d; k += 1) { chain.push(a + (k * p)); }
        chain.push(b + (d * p));
        for (let k = d; k >= 1; k -= 1) { chain.push(c + (k * p)); }
        open[b] = 0;
        const carved: number[] = [];
        let ok = true;
        for (let k = 0; k < chain.length && ok; k += 1) {
          const cell = chain[k]!;
          const last = k === chain.length - 1;
          if (!interior(cell) || open[cell] === 1 || openCount(cell) !== (last ? 2 : 1)) { ok = false; break; }
          open[cell] = 1;
          carved.push(cell);
        }
        if (ok) {
          const next = evaluate();
          if (next.reachedGoal && accept(next)) {
            run = next;
            routeLength = next.pathLength;
            chain.forEach((cell) => { onRoute[cell] = 1; stretchTiles.push(point(cell)); });
            stretchRemovedTiles.push(point(b));
            bumps += 1;
            return true;
          }
        }
        carved.forEach((cell) => { open[cell] = 0; });
        open[b] = 1;
        // A rejected re-run overwrote the explorer's shared buffers: refresh them
        // so `run` describes the (restored) grid again.
        if (ok) { run = evaluate(); }
      }
    }
    return false;
  };

  // Never stretch the route past the felt target itself (the route is part of it).
  const routeTarget = Math.min(options.routeTarget ?? 0, baseTarget - 8);
  if (routeTarget > routeLength && run.reachedGoal && !hopeless) {
    let failures = 0;
    while (routeLength < routeTarget && failures < 160) {
      const wanted = Math.max(1, Math.min(maxBumpDepth, Math.floor((routeTarget - routeLength) / 2)));
      const before = routeLength;
      if (!tryBump(1 + (rand() % wanted), (next) => next.pathLength > before && next.pathLength <= routeTarget + 1)) { failures += 1; }
    }
    run = evaluate();
  }

  // ---- Loop and wrap pricing -----------------------------------------------------
  // The savings are fixed from here on (branches and tips never touch the shortest route).
  // Two optional pieces of structure give steps back to a player who knows the map, and
  // both are measured the same way, against one baseline (every optional piece closed):
  //   loop saving  = shortest route with the loop connectors closed - as built, wraps open;
  //   wrap saving  = shortest route with the wrap links severed (and connectors closed)
  //                  - shortest route with the wrap links (connectors closed),
  // so the two add up to the whole saving exactly and a maze with no wrap is priced
  // byte-for-byte as before. A level whose priced target would pass the ceiling gives its
  // loops back one at a time, last first, so the ladder can always land; a wrap cannot be
  // given back from here (it is part of the base maze), so a base whose wrap alone passes
  // the ceiling is marked hopeless and the selection tries the next base.
  const wrapPercent = Math.max(0, Math.trunc(options.wrapPricePercent ?? 0));
  let loopSaving = 0;
  let wrapSaving = 0;
  let overCeiling = false;
  const meter = createRouteMeter(size, explorer.neighbors, startCell, goalCell);
  const planarMeter = createRouteMeter(size, createPlanarNeighbors(width, height), startCell, goalCell);
  const measureSavings = (): { loop: number; wrap: number } => {
    const connectors: number[] = [];
    loopRecords.forEach((record) => record.cells.forEach((cell) => { if (open[cell] === 1) { connectors.push(cell); } }));
    const withLoops = meter(open);
    connectors.forEach((cell) => { open[cell] = 0; });
    const torusPlain = connectors.length > 0 ? meter(open) : withLoops;
    const planarPlain = planarMeter(open);
    connectors.forEach((cell) => { open[cell] = 1; });
    return {
      loop: connectors.length > 0 && withLoops > 0 && torusPlain > 0 ? Math.max(0, torusPlain - withLoops) : 0,
      wrap: torusPlain > 0 && planarPlain > 0 ? Math.max(0, planarPlain - torusPlain) : 0
    };
  };
  const priced = (saving: number, percent: number): number => Math.floor((saving * percent) / 100);
  const total = (): number => priced(loopSaving, FELT_LOOP_PRICE_PERCENT) + priced(wrapSaving, wrapPercent);
  ({ loop: loopSaving, wrap: wrapSaving } = measureSavings());
  {
    let dropped = false;
    while (loopRecords.length > 0 && options.feltCeiling !== undefined && baseTarget + total() > options.feltCeiling) {
      const last = loopRecords[loopRecords.length - 1]!;
      last.cells.forEach((cell) => { open[cell] = 0; });
      loopRecords = loopRecords.slice(0, -1);
      ({ loop: loopSaving, wrap: wrapSaving } = measureSavings());
      dropped = true;
    }
    if (dropped) {
      loopTiles.length = 0;
      loopRecords.forEach((record) => record.cells.forEach((cell) => { loopTiles.push(point(cell)); }));
      run = evaluate();
    }
    overCeiling = options.feltCeiling !== undefined && priced(wrapSaving, wrapPercent) > 0 && baseTarget + total() > options.feltCeiling;
    if (loopRecords.length > 0 || wrapPercent > 0) { target = baseTarget + total(); }
  }
  // True while the maze's savings are still the ones the target was priced with. A switchback
  // bump taken later (the no-tip fallback below) lengthens the explorer's path, which can
  // lengthen the planar route more than the wrap route (or a loop's): it would leave the
  // recorded saving, and so the priced value of the finished maze, wrong by the difference.
  const pricedSavingsHold = (): boolean => {
    if (loopRecords.length === 0 && wrapPercent <= 0) { return true; }
    const now = measureSavings();
    return now.loop === loopSaving && (wrapPercent <= 0 || now.wrap === wrapSaving);
  };

  // The wrap alone puts the priced target past what the tuner can build: nothing to try.
  if (overCeiling) { hopeless = true; }

  // ---- Lever 2: deceptive branches, tips and trims --------------------------
  const addedTiles: { x: number; y: number }[] = [];
  const trimmedTiles: { x: number; y: number }[] = [];
  let branchesAdded = 0;
  let cellsTrimmed = 0;
  let capacityExhausted = false;

  // Carve up to `length` cells from `host` heading into `dir0` (a cell index
  // offset index into `step`). Returns the carved cells (possibly fewer).
  const carveBranch = (host: number, dirIndex: number, length: number): number[] => {
    const carved: number[] = [];
    let cell = host + step[dirIndex]!;
    if (!interior(cell) || open[cell] === 1 || openCount(cell) !== 1) { return carved; }
    let heading = dirIndex;
    for (;;) {
      open[cell] = 1;
      carved.push(cell);
      if (carved.length >= length) { break; }
      const straightFirst = (rand() % 3) !== 0;
      const turnA = (heading < 2 ? 2 : 0) + (rand() & 1);
      const turnB = (heading < 2 ? 2 : 0) + (1 - (turnA & 1));
      const order = straightFirst ? [heading, turnA, turnB] : [turnA, heading, turnB];
      let moved = false;
      for (const next of order) {
        const candidate = cell + step[next]!;
        if (interior(candidate) && open[candidate] !== 1 && openCount(candidate) === 1) {
          cell = candidate;
          heading = next;
          moved = true;
          break;
        }
      }
      if (!moved) { break; }
    }
    return carved;
  };

  // Remove up to `count` cells from a dead-end tip back toward its junction.
  const trimTip = (tip: number, count: number): number[] => {
    const removed: number[] = [];
    let cell = tip;
    while (removed.length < count) {
      if (open[cell] !== 1 || onRoute[cell] === 1 || cell === startCell || cell === goalCell || !interior(cell) || openCount(cell) > 1) { break; }
      let parent = -1;
      for (let d = 0; d < 4; d += 1) {
        const next = explorer.neighbors[(cell * 4) + d]!;
        if (open[next] === 1) { parent = next; }
      }
      open[cell] = 0;
      removed.push(cell);
      if (parent < 0) { break; }
      cell = parent;
    }
    return removed;
  };

  let felt = run.steps;
  let failures = 0;
  const failureCap = 40;
  let branchLimit = maxBranch;
  let forksRemaining = forkTarget;
  let forkFailures = 0;

  // ---- Decoy loops (false ways on) ----------------------------------------------
  // A connector joining two cells of the same WRONG region (cells the explorer visits
  // that are not on its final path): the dead-end region becomes a tangle with a cycle.
  // The explorer pays about two steps per carved cell, exactly like a dead-end branch
  // (so the board is spent as efficiently), and a person finds a loop that looks like
  // progress and returns to ground they have crossed. Kept only when the re-run explorer
  // brings the number closer to the target, like every other move.
  let decoysRemaining = loopPlan?.decoys ?? 0;
  let decoyFailures = 0;
  const decoyMaxCells = Math.max(LOOP_DECOY_MIN_CELLS, loopPlan?.maxConnector ?? 0);
  const regionIdx = new Int32Array(size);
  const regionQueue = new Int32Array(size);
  const tryDecoyLoop = (): boolean => {
    for (let probe = 0; probe < 24; probe += 1) {
      const host = rand() % size;
      if (open[host] !== 1 || run.visited[host] !== 1 || run.onPath[host] === 1 || onRoute[host] === 1
        || host === startCell || host === goalCell || !interior(host)) { continue; }
      // Tree distance from the host inside the wrong region (never through the final path).
      regionIdx.fill(-1);
      let head = 0;
      let tail = 0;
      regionIdx[host] = 0;
      regionQueue[tail] = host; tail += 1;
      while (head < tail) {
        const cell = regionQueue[head]!; head += 1;
        for (let d = 0; d < 4; d += 1) {
          const next = explorer.neighbors[(cell * 4) + d]!;
          if (open[next] !== 1 || regionIdx[next] !== -1 || run.onPath[next] === 1 || run.visited[next] !== 1) { continue; }
          regionIdx[next] = regionIdx[cell]! + 1;
          regionQueue[tail] = next; tail += 1;
        }
      }
      if (tail < 12) { continue; }
      const found = loopSearch.collect(host, 0, decoyMaxCells, regionIdx)
        .filter((candidate) => candidate.path.length >= LOOP_DECOY_MIN_CELLS);
      if (found.length === 0) { continue; }
      const chosen = found[rand() % found.length]!;
      if (!loopSearch.carve(chosen.path)) { continue; }
      const next = evaluate();
      if (next.reachedGoal && windowGap(next.steps) < windowGap(felt)) {
        run = next;
        felt = next.steps;
        decoysRemaining -= 1;
        chosen.path.forEach((cell) => {
          onRoute[cell] = 1;
          loopTiles.push(point(cell));
        });
        loopRecords = [...loopRecords, { kind: 'decoy', cells: chosen.path, from: 0, to: 0, saving: 0 }];
        return true;
      }
      chosen.path.forEach((cell) => { open[cell] = 0; });
      run = evaluate();
      return false;
    }
    return false;
  };

  while (evals < maxEvals && !hopeless && windowGap(felt) > 0) {
    const gap = target - felt;
    if (decoysRemaining > 0 && gap >= 12 && decoyFailures < 16 && (rand() % 3) === 0) {
      if (tryDecoyLoop()) { failures = 0; continue; }
      decoyFailures += 1;
    }
    let edited: number[] = [];
    let trimmed: number[] = [];
    let bumped = false;
    let mode: 'branch' | 'tip' | 'trim' = 'branch';
    let forkMode = false;
    if (gap > 0) {
      const wanted = Math.floor(gap / 2);
      mode = wanted >= 4 ? 'branch' : 'tip';
      // Probe visited cells (productive hosts); carve; keep the first carve long
      // enough to matter (a branch of 3 cells or fewer is a visible nub and
      // costs the explorer nothing), else undo and probe again.
      // Half of the full-size branches are first tried on the route itself (more
      // choices for the player on the way), the rest anywhere the explorer goes.
      // A fork phase request spends an equal share of the remaining budget on each
      // fork; when the share is below a real branch (4 cells) the phase ends.
      let forkShare = 0;
      if (mode === 'branch' && forksRemaining > 0) {
        forkShare = Math.floor(wanted / forksRemaining);
        if (forkShare < 4) { forksRemaining = 0; } else { forkMode = true; }
      }
      const routeFirst = forkMode || (mode === 'branch' && (rand() % 4) !== 0);
      const usable = (cell: number, strict = routeFirst): boolean => (
        open[cell] === 1 && run.visited[cell] === 1 && cell !== startCell && cell !== goalCell && interior(cell)
        && (mode !== 'tip' || (openCount(cell) === 1 && run.onPath[cell] !== 1))
        && (!strict || run.onPath[cell] === 1)
      );
      const length = forkMode
        ? Math.min(routeBranch, forkShare, 4 + (rand() % Math.max(1, routeBranch - 3)))
        : (mode === 'branch' ? Math.min(wanted, branchLimit) : Math.max(1, Math.min(wanted, 12)));
      const minimum = mode === 'branch' ? Math.min(length, 4) : 1;
      for (let trial = 0; trial < 90 && edited.length === 0; trial += 1) {
        const strict = routeFirst && (forkMode || trial < 45);
        let chosen = rand() % size;
        if (!usable(chosen, strict)) { continue; }
        // Goal-side clustering: half the time keep the nearer of two probes.
        if ((rand() & 1) === 0) {
          const other = rand() % size;
          if (usable(other, strict) && dist2(other) < dist2(chosen)) { chosen = other; }
        }
        const startDir = rand() % 4;
        for (let k = 0; k < 4 && edited.length === 0; k += 1) {
          const dir = (startDir + k) % 4;
          const entry = chosen + step[dir]!;
          if (!interior(entry) || open[entry] === 1 || openCount(entry) !== 1) { continue; }
          if (run.onPath[chosen] === 1) {
            const next = run.pathNext[chosen]!;
            if (next < 0 || dist2(entry) >= dist2(next)) { continue; }
            // Double lure: the fork must also look closer to the START than the way back along
            // the route, so a solver working from the goal end is drawn into it as well.
            if (doubleLure) {
              let prev = -1;
              for (let q = 0; q < 4; q += 1) {
                const p = explorer.neighbors[(chosen * 4) + q]!;
                if (run.onPath[p] === 1 && run.pathNext[p] === chosen) { prev = p; }
              }
              if (prev >= 0 && dist2Start(entry) >= dist2Start(prev)) { continue; }
            }
          }
          const carved = carveBranch(chosen, dir, run.onPath[chosen] === 1 ? Math.min(length, routeBranch) : length);
          if (carved.length >= minimum) {
            edited = carved;
          } else {
            carved.forEach((cell) => { open[cell] = 0; });
          }
        }
      }
      // No dead-end tip to extend (a bare base): a switchback bump of depth gap/2
      // adds exactly the missing 2 per level of depth to the route instead.
      if (edited.length === 0 && mode === 'tip') {
        const gapBefore = windowGap(felt);
        bumped = tryBump(Math.max(1, Math.min(wanted, maxBumpDepth)), (next) => windowGap(next.steps) < gapBefore && pricedSavingsHold());
        if (bumped) { felt = run.steps; }
      }
    } else {
      mode = 'trim';
      let tip = -1;
      for (let probe = 0; probe < 80 && tip < 0; probe += 1) {
        const cell = rand() % size;
        if (open[cell] === 1 && run.visited[cell] === 1 && run.onPath[cell] !== 1 && onRoute[cell] !== 1
          && cell !== startCell && cell !== goalCell && interior(cell) && openCount(cell) === 1) {
          tip = cell;
        }
      }
      if (tip >= 0) {
        trimmed = trimTip(tip, Math.max(1, Math.ceil((-gap - overshoot) / 2)));
      }
    }
    let accepted = bumped;
    if (edited.length > 0 || trimmed.length > 0) {
      const next = evaluate();
      if (windowGap(next.steps) < windowGap(felt)) {
        accepted = true;
        run = next;
        felt = next.steps;
        if (edited.length > 0) {
          if (mode === 'branch') { branchesAdded += 1; }
          if (forkMode) { forksRemaining -= 1; forkFailures = 0; }
          edited.forEach((cell) => addedTiles.push(point(cell)));
        }
        trimmed.forEach((cell) => trimmedTiles.push(point(cell)));
        cellsTrimmed += trimmed.length;
      } else {
        edited.forEach((cell) => { open[cell] = 0; });
        trimmed.forEach((cell) => { open[cell] = 1; });
        // The rollback left the grid as `run` saw it; run arrays stay valid
        // only if nothing re-ran, so refresh them.
        run = evaluate();
      }
    }
    if (accepted) {
      failures = 0;
    } else {
      if (forkMode) {
        forkFailures += 1;
        if (forkFailures >= 12) { forksRemaining = 0; }
      }
      failures += 1;
      if (failures % 12 === 0) { branchLimit = Math.max(4, Math.floor(branchLimit / 2)); }
      if (failures >= failureCap) {
        capacityExhausted = gap > 0;
        break;
      }
    }
  }

  // ---- Lever 3: fringe (zero-felt-cost side stubs) ------------------------------------
  // Only on a landed maze. Candidates are (host, direction) pairs: a corridor or junction cell
  // (never a tip, the start or the goal) and an interior wall cell next to it whose only open
  // neighbour is the host. Visited in a seeded shuffle, three passes (stubs of up to 3, 2 and 1
  // cells) so the pockets the longer stubs left are still filled. A stub is kept only when the
  // explorer reaches the goal in exactly the same number of steps, so the landed felt value is
  // untouched; the last stub is cut to the cells still owed, so the count is exact.
  const fringeWanted = Math.max(0, Math.trunc(options.fringeCells ?? 0));
  const fringeTiles: { x: number; y: number }[] = [];
  let fringePlaced = 0;
  if (fringeWanted > 0 && !hopeless && windowGap(felt) === 0) {
    const fringeRand = createStream((seed ^ 0x2f6b1d93) >>> 0);
    const landedSteps = felt;
    for (let pass = 0; pass < FELT_VISION_CELLS && fringePlaced < fringeWanted; pass += 1) {
      const longest = FELT_VISION_CELLS - pass;
      const candidates: number[] = [];
      for (let cell = 0; cell < size; cell += 1) {
        if (open[cell] !== 1 || cell === startCell || cell === goalCell || !interior(cell) || openCount(cell) < 2) { continue; }
        for (let d = 0; d < 4; d += 1) {
          const entry = cell + step[d]!;
          if (interior(entry) && open[entry] !== 1 && openCount(entry) === 1) { candidates.push((cell * 4) + d); }
        }
      }
      for (let index = candidates.length - 1; index > 0; index -= 1) {
        const other = fringeRand() % (index + 1);
        const held = candidates[index]!;
        candidates[index] = candidates[other]!;
        candidates[other] = held;
      }
      for (const candidate of candidates) {
        if (fringePlaced >= fringeWanted) { break; }
        const host = candidate >> 2;
        const dir = candidate & 3;
        const entry = host + step[dir]!;
        // An earlier stub of this pass may have used the pocket.
        if (!interior(entry) || open[entry] === 1 || openCount(entry) !== 1 || openCount(host) < 2) { continue; }
        const wanted = Math.min(fringeWanted - fringePlaced, 1 + (fringeRand() % longest));
        const chain: number[] = [entry];
        open[entry] = 1;
        while (chain.length < wanted) {
          const next = chain[chain.length - 1]! + step[dir]!;
          if (!interior(next) || open[next] === 1 || openCount(next) !== 1) { break; }
          open[next] = 1;
          chain.push(next);
        }
        const after = evaluate();
        if (after.reachedGoal && after.steps === landedSteps) {
          fringePlaced += chain.length;
          chain.forEach((cell) => fringeTiles.push(point(cell)));
        } else {
          chain.forEach((cell) => { open[cell] = 0; });
        }
      }
    }
    run = evaluate();
    felt = run.steps;
  }
  const fringeShortfall = fringeWanted > 0 ? fringeWanted - fringePlaced : 0;

  // ---- Reverse felt (lever 4's check) --------------------------------------------------
  // The explorer run from the goal to the start on the finished grid, priced like the forward
  // number (loop and wrap savings are the same shortest-route savings in either direction).
  // Measured on every tune (one run, about 20 microseconds); enforced only with a floor.
  let reverseFelt = 0;
  if (run.reachedGoal) {
    const backward = explorer.run(open, goalCell, startCell);
    reverseFelt = backward.reachedGoal ? backward.steps - total() : 0;
    run = evaluate();
  }
  const reverseShortfall = reverseFloor > 0 ? Math.max(0, reverseFloor - reverseFelt) : 0;

  const grid: boolean[][] = [];
  for (let y = 0; y < height; y += 1) {
    const row: boolean[] = [];
    for (let x = 0; x < width; x += 1) { row.push(open[(y * width) + x] === 1); }
    grid.push(row);
  }
  return {
    grid,
    felt,
    target,
    onTarget: windowGap(felt) === 0 && fringeShortfall === 0 && reverseShortfall === 0,
    routeLength,
    bumps,
    branchesAdded,
    cellsTrimmed,
    addedTiles,
    trimmedTiles,
    cyclesBroken: brokenCells.length,
    loops: loopRecords,
    loopSaving,
    wrapSaving,
    baseTarget,
    loopDiagnostics,
    // Connector cells still open at the end (a later switchback bump can close one).
    loopTiles: loopTiles.filter((tile) => open[(tile.y * width) + tile.x] === 1),
    fringeTiles,
    fringeShortfall,
    reverseFelt,
    reverseShortfall,
    stretchTiles,
    stretchRemovedTiles,
    capacityExhausted,
    evals,
    windowDistance: windowGap(felt) + fringeShortfall + reverseShortfall,
    tieDeviationPercent: run.reachedGoal ? measureTieDeviationPercent(explorer, open, startCell, goalCell, felt) : 0,
    hopeless
  };
};

// Cheap restarts from the untouched base with another deterministic stream (a
// pass costs about a millisecond, far less than building another base maze). The
// first pass that lands wins; otherwise the closest one is returned.
export const tuneMazeFeltToTarget = (
  maze: FeltTuningMaze,
  target: number,
  seed: number,
  options: FeltTuningOptions = {}
): FeltTuningResult => {
  let best: FeltTuningResult | null = null;
  const attempts = Math.max(1, Math.trunc(options.attempts ?? FELT_TUNING_ATTEMPTS));
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const result = tuneOnce(maze, target, (Math.imul(seed >>> 0, 0x2545f491) + Math.imul(attempt, 0x9e3779b1)) >>> 0, options);
    // Closer to the window wins; among landed mazes the one whose number is least a coin flip.
    if (best === null
      || result.windowDistance < best.windowDistance
      || (result.windowDistance === best.windowDistance && result.tieDeviationPercent < best.tieDeviationPercent)) {
      best = result;
    }
    if (result.hopeless) { break; }
    if (result.onTarget && result.tieDeviationPercent <= FELT_TIE_DEVIATION_LIMIT_PERCENT) { break; }
    // A plain maze has no tie to flip: do not spend restarts on it.
    if (result.onTarget && result.loops.length === 0) { break; }
  }
  return best!;
};
