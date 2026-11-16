// Slice H7: hazard gauges, measured independently of the hazard allocator and solver.
//
// Input is plain coordinates: the floor grid, start, goal, the gates and Sentries a level shipped
// with (as cells and timings), and the witness the overlay stored. Nothing here imports
// src/mazer-core/hazards: movement is production movement (resolveLegacyWalkableGridNeighbors,
// wraps included), the gate and Sentry formulas are re-derived from the graph contract text, and the
// solvers are written from scratch (forward time-layered BFS for the fastest contact-free route, a
// backward fixed point for the states that can still finish). So a bug in the allocator, the
// placement or the H2 verdict shows up as a disagreement, not as a matching wrong number.
//
// Gauges (product contract 2.5):
//   - staticShortest  steps of the shortest route with no hazards;
//   - witnessTicks    ticks of the fastest contact-free route with every hazard active (clock starts at 0);
//   - hazardDelay     witnessTicks - staticShortest;
//   - escapeSlack     share of the stored witness's states where one forced WAIT still finishes
//                     contact-free (a gate closing on the player ejects one trail cell back, contract 2.3);
//   - bot contacts    contacts of three fallible bots per level: exact (replays the fastest route),
//                     limited horizon (BOT_HORIZON ticks of hazard timing, routes around every visible
//                     Sentry rail) and myopic (1 tick of timing, blind to rails until a Sentry touches it,
//                     then it avoids that rail: a player who learns from a hit). Both fallible bots are
//                     receding-horizon planners; a closed gate is a wall bump;
//   - cleanRate       share of clears with no contact, per bot tier (aggregated by the caller).
import { resolveLegacyWalkableGridNeighbors } from '../../../src/legacy-runtime/legacyMaze';

export interface GaugePoint { readonly x: number; readonly y: number }
export interface GaugeGate { readonly cell: GaugePoint; readonly period: number; readonly openFrom: number; readonly openFor: number }
export interface GaugeSentry { readonly route: readonly GaugePoint[]; readonly phase: number }

export interface HazardGaugeInput {
  readonly grid: ReadonlyArray<ReadonlyArray<boolean>>;
  readonly start: GaugePoint;
  readonly goal: GaugePoint;
  readonly gates: readonly GaugeGate[];
  readonly sentries: readonly GaugeSentry[];
}

/** Ticks of hazard timing the limited-horizon bot sees ahead (it also sees every Sentry rail). */
export const BOT_HORIZON = 3;
/** Ticks the myopic bot sees ahead; it ignores Sentry rails until a Sentry touches it, then avoids that rail. */
export const BOT_MYOPIC_HORIZON = 1;
/** A bot that has not cleared after this many times (static route + period + 10) ticks counts as stuck. */
export const BOT_TICK_CAP_FACTOR = 20;
/** Contract 2.3: invulnerable ticks after a contact rewind. */
export const BOT_INVULNERABLE_TICKS = 4;
export const BOT_TIERS = ['exact', 'horizon', 'myopic'] as const;
export type BotTier = typeof BOT_TIERS[number];

export interface BotRun {
  readonly cleared: boolean;
  readonly ticks: number;
  readonly contacts: number;
  readonly ejects: number;
}

export interface HazardGaugeResult {
  readonly staticShortest: number;
  readonly witnessTicks: number | null;
  readonly hazardDelay: number | null;
  readonly period: number;
  readonly escapeSlack: { readonly tested: number; readonly survivable: number; readonly ratio: number | null; readonly firstFragileIndex: number | null } | null;
  readonly bots: Readonly<Record<BotTier, BotRun>>;
}

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

/** Ping-pong cell sequence of a shuttle (forward then back, no dwell): length 2(n-1), or 1. */
const shuttleSequence = (route: readonly GaugePoint[]): GaugePoint[] => (
  route.length <= 1 ? route.slice() : [...route, ...route.slice(1, -1).reverse()]
);

export interface HazardWorld {
  readonly width: number;
  readonly height: number;
  readonly period: number;
  readonly start: number;
  readonly goal: number;
  /** Production neighbours, up to 4 per cell, -1 padded. */
  readonly adjacency: Int32Array;
  /** Cells that list `cell` as a neighbour (production movement is symmetric, but do not assume it). */
  readonly reverse: readonly number[][];
  readonly degree: Uint8Array;
  readonly blocked: Uint8Array;
  readonly occupied: Uint8Array;
  readonly enemyAt: readonly Int32Array[];
}

export const buildHazardWorld = (input: HazardGaugeInput): HazardWorld => {
  const height = input.grid.length;
  const width = input.grid[0]?.length ?? 0;
  const n = width * height;
  const id = (p: GaugePoint): number => (p.y * width) + p.x;
  const grid = input.grid.map((row) => [...row]);
  const adjacency = new Int32Array(n * 4).fill(-1);
  const reverse: number[][] = Array.from({ length: n }, () => []);
  const degree = new Uint8Array(n);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (grid[y]![x] !== true) { continue; }
      const neighbours = resolveLegacyWalkableGridNeighbors(grid, { x, y });
      const cell = (y * width) + x;
      degree[cell] = neighbours.length;
      neighbours.slice(0, 4).forEach((next, index) => {
        adjacency[(cell * 4) + index] = id(next);
        reverse[id(next)]!.push(cell);
      });
    }
  }
  const sequences = input.sentries.map((sentry) => shuttleSequence(sentry.route).map(id));
  let period = 1;
  for (const gate of input.gates) { period = (period / gcd(period, gate.period)) * gate.period; }
  for (const sequence of sequences) { period = (period / gcd(period, sequence.length)) * sequence.length; }
  const blocked = new Uint8Array(period * n);
  const occupied = new Uint8Array(period * n);
  const enemyAt: Int32Array[] = [];
  for (let t = 0; t < period; t += 1) {
    for (const gate of input.gates) {
      const q = (((t - gate.openFrom) % gate.period) + gate.period) % gate.period;
      if (q >= gate.openFor) { blocked[(t * n) + id(gate.cell)] = 1; }
    }
    const here = new Int32Array(sequences.length);
    sequences.forEach((sequence, e) => {
      const cell = sequence[(t + input.sentries[e]!.phase) % sequence.length]!;
      here[e] = cell;
      occupied[(t * n) + cell] = 1;
    });
    enemyAt.push(here);
  }
  return { width, height, period, start: id(input.start), goal: id(input.goal), adjacency, reverse, degree, blocked, occupied, enemyAt };
};

/** Arrival legality from `from` at tick `t` (mod period) into `to` at t + 1: not blocked, no enemy, no head-on swap. */
export const isLegalMove = (world: HazardWorld, from: number, to: number, t: number): boolean => {
  const n = world.width * world.height;
  const t1 = (t + 1) % world.period;
  if (world.blocked[(t1 * n) + to] === 1 || world.occupied[(t1 * n) + to] === 1) { return false; }
  if (to !== from) {
    const before = world.enemyAt[t % world.period]!;
    const after = world.enemyAt[t1]!;
    for (let e = 0; e < before.length; e += 1) {
      if (before[e] === to && after[e] === from) { return false; }
    }
  }
  return true;
};

const neighboursOf = (world: HazardWorld, cell: number): number[] => {
  const out: number[] = [];
  for (let i = 0; i < 4; i += 1) {
    const next = world.adjacency[(cell * 4) + i]!;
    if (next >= 0) { out.push(next); }
  }
  return out;
};

/** Static BFS distance to the goal for every cell (-1 = unreachable). */
export const staticDistanceToGoal = (world: HazardWorld): Int32Array => {
  const n = world.width * world.height;
  const distance = new Int32Array(n).fill(-1);
  const queue = new Int32Array(n);
  let head = 0; let tail = 0;
  distance[world.goal] = 0;
  queue[tail++] = world.goal;
  while (head < tail) {
    const cell = queue[head++]!;
    for (const previous of world.reverse[cell]!) {
      if (distance[previous] === -1) { distance[previous] = distance[cell]! + 1; queue[tail++] = previous; }
    }
  }
  return distance;
};

/** Fastest contact-free route from the start at tick 0: the cells after each tick (index 0 = start), or null. */
export const solveFastestRoute = (world: HazardWorld): number[] | null => {
  const n = world.width * world.height;
  const states = n * world.period;
  if (world.blocked[world.start] === 1 || world.occupied[world.start] === 1) { return null; }
  if (world.start === world.goal) { return [world.start]; }
  const parent = new Int32Array(states).fill(-2);
  let layer = [world.start];
  parent[world.start] = -1;
  for (let t = 0; layer.length > 0; t += 1) {
    const t1 = (t + 1) % world.period;
    const next: number[] = [];
    for (const state of layer) {
      const cell = state % n;
      const options = [...neighboursOf(world, cell), cell];
      for (const to of options) {
        if (!isLegalMove(world, cell, to, t)) { continue; }
        const nextState = (t1 * n) + to;
        if (parent[nextState] !== -2) { continue; }
        parent[nextState] = state;
        if (to === world.goal) {
          const route: number[] = [];
          for (let cursor = nextState; cursor !== -1; cursor = parent[cursor]!) { route.push(cursor % n); }
          return route.reverse();
        }
        next.push(nextState);
      }
    }
    layer = next;
  }
  return null;
};

/** States (tick mod period, cell) from which the goal is still reachable contact-free (1 = yes). */
export const computeFinishableStates = (world: HazardWorld): Uint8Array => {
  const n = world.width * world.height;
  const win = new Uint8Array(n * world.period);
  const queue: number[] = [];
  for (let t = 0; t < world.period; t += 1) { win[(t * n) + world.goal] = 1; queue.push((t * n) + world.goal); }
  for (let head = 0; head < queue.length; head += 1) {
    const state = queue[head]!;
    const to = state % n;
    const t1 = (state - to) / n;
    const t0 = (t1 - 1 + world.period) % world.period;
    for (const from of [...world.reverse[to]!, to]) {
      const index = (t0 * n) + from;
      if (win[index] === 1 || !isLegalMove(world, from, to, t0)) { continue; }
      win[index] = 1;
      queue.push(index);
    }
  }
  return win;
};

/** Escape slack on a witness (cells after each tick from tick 0), re-measured with this module's rules. */
export const measureWitnessEscapeSlack = (world: HazardWorld, witness: readonly number[], win: Uint8Array): HazardGaugeResult['escapeSlack'] => {
  const n = world.width * world.height;
  let survivable = 0;
  let tested = 0;
  let firstFragileIndex: number | null = null;
  for (let index = 0; index < witness.length - 1; index += 1) {
    const cell = witness[index]!;
    const t1 = (index + 1) % world.period;
    let landing: number | null = cell;
    if (world.blocked[(t1 * n) + cell] === 1) {
      // A gate closing on the player ejects them to the previous distinct trail cell (no contact).
      landing = null;
      for (let back = index - 1; back >= 0; back -= 1) {
        if (witness[back] !== cell) { landing = witness[back]!; break; }
      }
      if (landing !== null && (world.blocked[(t1 * n) + landing] === 1 || world.occupied[(t1 * n) + landing] === 1)) { landing = null; }
    } else if (world.occupied[(t1 * n) + cell] === 1) {
      landing = null;
    }
    tested += 1;
    if (landing !== null && win[(t1 * n) + landing] === 1) {
      survivable += 1;
    } else {
      firstFragileIndex ??= index;
    }
  }
  return {
    tested,
    survivable,
    ratio: tested === 0 ? null : Math.round((survivable / tested) * 10000) / 10000,
    firstFragileIndex
  };
};

/** A bot picks its next cell (or its own cell to wait) from its cell and the absolute tick. */
interface BotPolicy {
  next(cell: number, t: number): number;
  /** Told which Sentries (indices) touched it, so a learning bot can start avoiding their rails. */
  onContact?(enemies: readonly number[]): void;
}

/**
 * Plays one bot through the contract rules: a move into a closed gate is a bump (wait); a gate that
 * closes on the player ejects them one trail cell back with no contact; a contact (enemy on the
 * arrival cell, or a head-on swap) rewinds to the last junction on the bot's own trail that can
 * still finish (else the start), with the clock held, then BOT_INVULNERABLE_TICKS ticks of
 * invulnerability.
 */
const runBot = (world: HazardWorld, win: Uint8Array, policy: BotPolicy, maxTicks: number): BotRun => {
  const n = world.width * world.height;
  let cell = world.start;
  const trail: number[] = [cell];
  let contacts = 0;
  let ejects = 0;
  let invulnerable = 0;
  for (let t = 0; t < maxTicks; t += 1) {
    if (cell === world.goal) { return { cleared: true, ticks: t, contacts, ejects }; }
    const t1 = (t + 1) % world.period;
    let to = policy.next(cell, t);
    if (to !== cell && world.blocked[(t1 * n) + to] === 1) { to = cell; }
    if (to === cell && world.blocked[(t1 * n) + cell] === 1) {
      let back = trail.length - 2;
      while (back >= 0 && trail[back] === cell) { back -= 1; }
      if (back >= 0) { to = trail[back]!; trail.length = back + 1; ejects += 1; }
    }
    const hitBy: number[] = [];
    if (invulnerable === 0) {
      const before = world.enemyAt[t % world.period]!;
      const after = world.enemyAt[t1]!;
      for (let e = 0; e < after.length; e += 1) {
        if (after[e] === to || (to !== cell && before[e] === to && after[e] === cell)) { hitBy.push(e); }
      }
    }
    if (to !== cell && trail[trail.length - 1] !== to) { trail.push(to); }
    cell = to;
    if (invulnerable > 0) { invulnerable -= 1; }
    if (hitBy.length > 0 && cell !== world.goal) {
      contacts += 1;
      policy.onContact?.(hitBy);
      let rewind = 0;
      for (let i = trail.length - 2; i > 0; i -= 1) {
        if (world.degree[trail[i]!]! >= 3 && win[(t1 * n) + trail[i]!] === 1) { rewind = i; break; }
      }
      trail.length = rewind + 1;
      cell = trail[rewind]!;
      invulnerable = BOT_INVULNERABLE_TICKS;
    }
  }
  return { cleared: cell === world.goal, ticks: maxTicks, contacts, ejects };
};

/** Static distance to the goal with some cells treated as walls (-1 = unreachable that way). */
const distanceAvoiding = (world: HazardWorld, avoid: ReadonlySet<number>): Int32Array => {
  const n = world.width * world.height;
  const distance = new Int32Array(n).fill(-1);
  const queue = new Int32Array(n);
  let head = 0; let tail = 0;
  distance[world.goal] = 0;
  queue[tail++] = world.goal;
  while (head < tail) {
    const cell = queue[head++]!;
    for (const previous of world.reverse[cell]!) {
      if (distance[previous] === -1 && !avoid.has(previous)) { distance[previous] = distance[cell]! + 1; queue[tail++] = previous; }
    }
  }
  return distance;
};

/** Cost to go beyond the horizon: rail-avoiding distance, else plain distance plus a large penalty. */
const RAIL_PENALTY = 10_000;

/**
 * Receding-horizon bot. It knows hazard timing exactly for the next `horizon` ticks and nothing
 * beyond; past the horizon it scores a cell by its static distance to the goal around the Sentry
 * rails it knows about. Each tick it takes the first move of the best legal plan of `horizon` ticks;
 * when every plan runs into a contact it steps toward the goal anyway.
 */
const horizonBot = (world: HazardWorld, rails: readonly (readonly number[])[], horizon: number, knowsRails: boolean): BotPolicy => {
  const plain = staticDistanceToGoal(world);
  const known = new Set<number>(knowsRails ? rails.map((_, index) => index) : []);
  let cost = plain;
  const refresh = (): void => {
    const avoid = new Set<number>();
    for (const index of known) { for (const cell of rails[index]!) { avoid.add(cell); } }
    const around = distanceAvoiding(world, avoid);
    cost = plain.map((value, cell) => (around[cell]! >= 0 ? around[cell]! : value + RAIL_PENALTY));
  };
  if (known.size > 0) { refresh(); }
  const value = (cell: number, t: number, depth: number): number => {
    if (cell === world.goal) { return depth; }
    if (depth === horizon) { return depth + cost[cell]!; }
    let best = Number.POSITIVE_INFINITY;
    for (const to of [...neighboursOf(world, cell), cell]) {
      if (isLegalMove(world, cell, to, t)) { best = Math.min(best, value(to, t + 1, depth + 1)); }
    }
    return best;
  };
  return {
    next(cell, t) {
      let best = cell;
      let bestValue = Number.POSITIVE_INFINITY;
      for (const to of [...neighboursOf(world, cell), cell]) {
        if (!isLegalMove(world, cell, to, t)) { continue; }
        const v = value(to, t + 1, 1);
        if (v < bestValue) { bestValue = v; best = to; }
      }
      if (bestValue === Number.POSITIVE_INFINITY) {
        for (const to of neighboursOf(world, cell)) { if (cost[to]! < cost[best]!) { best = to; } }
      }
      return best;
    },
    onContact(enemies) {
      const before = known.size;
      for (const e of enemies) { known.add(e); }
      if (known.size !== before) { refresh(); }
    }
  };
};

export const measureHazardGauges = (input: HazardGaugeInput, storedWitness: readonly GaugePoint[] | null): HazardGaugeResult => {
  const world = buildHazardWorld(input);
  const distance = staticDistanceToGoal(world);
  const staticShortest = distance[world.start]!;
  if (staticShortest < 0) { throw new Error('goal unreachable on the static maze'); }
  const route = solveFastestRoute(world);
  const win = computeFinishableStates(world);
  const width = world.width;
  const id = (p: GaugePoint): number => (p.y * width) + p.x;
  const escapeSlack = storedWitness === null ? null : measureWitnessEscapeSlack(world, storedWitness.map(id), win);
  const rails = input.sentries.map((sentry) => sentry.route.map(id));
  const maxTicks = BOT_TICK_CAP_FACTOR * (staticShortest + world.period + 10);
  const exact: BotPolicy = { next: (cell, t) => (route !== null && t + 1 < route.length && route[t] === cell ? route[t + 1]! : cell) };
  return {
    staticShortest,
    witnessTicks: route === null ? null : route.length - 1,
    hazardDelay: route === null ? null : route.length - 1 - staticShortest,
    period: world.period,
    escapeSlack,
    bots: {
      exact: route === null ? { cleared: false, ticks: 0, contacts: 0, ejects: 0 } : runBot(world, win, exact, route.length + 1),
      horizon: runBot(world, win, horizonBot(world, rails, BOT_HORIZON, true), maxTicks),
      myopic: runBot(world, win, horizonBot(world, rails, BOT_MYOPIC_HORIZON, false), maxTicks)
    }
  };
};

// ---------------------------------------------------------------------------
// Band statistics (also used by the --assert job).
// ---------------------------------------------------------------------------

export const spearman = (xs: readonly number[], ys: readonly number[]): number => {
  const rank = (values: readonly number[]): number[] => {
    const order = values.map((value, index) => ({ value, index })).sort((a, b) => a.value - b.value);
    const ranks = new Array<number>(values.length);
    for (let i = 0; i < order.length;) {
      let j = i;
      while (j + 1 < order.length && order[j + 1]!.value === order[i]!.value) { j += 1; }
      for (let k = i; k <= j; k += 1) { ranks[order[k]!.index] = (i + j) / 2; }
      i = j + 1;
    }
    return ranks;
  };
  const rx = rank(xs);
  const ry = rank(ys);
  const mean = (values: readonly number[]): number => values.reduce((s, v) => s + v, 0) / Math.max(1, values.length);
  const mx = mean(rx); const my = mean(ry);
  let sxy = 0; let sxx = 0; let syy = 0;
  for (let i = 0; i < rx.length; i += 1) {
    sxy += (rx[i]! - mx) * (ry[i]! - my); sxx += (rx[i]! - mx) ** 2; syy += (ry[i]! - my) ** 2;
  }
  return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : 0;
};
