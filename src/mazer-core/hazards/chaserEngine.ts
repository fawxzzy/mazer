/**
 * DRAFT junction-greedy enemy engine (packet P6). Dormant and pure: not wired
 * into any scene and not exported through the mazer-core barrel. See
 * docs/architecture/MAZER-CHASER-ENGINE.md.
 *
 * ONE movement engine, pluggable TARGET RULE:
 *   - 'chaser'       target = the player's current cell (Pac-Man Blinky).
 *   - 'interceptor'  target = the cell `lookahead` steps ahead of the player along
 *                    the player's last move direction, clamped to walkable cells
 *                    (Pac-Man Pinky). Default lookahead 3.
 *   - 'wall-follower' left-hand rule, purely local, ignores the player.
 *
 * Movement: at most one cell per world turn. The enemy DECIDES only when it has
 * two or more non-reverse exits (a junction, or the spawn cell); on a corridor
 * cell it simply keeps going; it reverses only at a dead end or on an explicit
 * global event (`reverseJunctionGreedyEnemy`). Ties break up, left, down, right.
 * The target distance is straight-line (Manhattan, wrap-aware) from the
 * CANDIDATE cell to the target, like Pac-Man, deliberately NOT a shortest path:
 * a shortest-path pursuer at equal speed is unbeatable in a maze.
 *
 * Pure and deterministic: state in, state out, JSON-serializable. No
 * randomness, no clock.
 */

import {
  HAZARD_MOVE_ORDER,
  type HazardCellId,
  type HazardGraph,
  type HazardMoveDirection
} from './graphContract';

export const CHASER_ENGINE_CONTRACT = 'mazer-chaser-engine-draft-v0' as const;

export const JUNCTION_GREEDY_RULES = ['chaser', 'interceptor', 'wall-follower'] as const;
export type JunctionGreedyRule = typeof JUNCTION_GREEDY_RULES[number];

export const DEFAULT_INTERCEPTOR_LOOKAHEAD = 3;
export const MAX_INTERCEPTOR_LOOKAHEAD = 64;

/** Authoring input. Every tiering knob is optional. */
export interface JunctionGreedyEnemySpec {
  readonly rule: JunctionGreedyRule;
  readonly spawnCell: HazardCellId;
  /** Interceptor only: cells ahead of the player (default 3, 1..64). */
  readonly lookahead?: number;
  /**
   * Facing at spawn. A greedy enemy never reverses out of its facing; a
   * wall-follower uses it as its heading (default 'up').
   */
  readonly initialHeading?: HazardMoveDirection;
  /**
   * The enemy is absent (no cell, no contact) until world turn `spawnDelayTurns`,
   * when it appears on `spawnCell` without moving. Default 0 (present at turn 0).
   */
  readonly spawnDelayTurns?: number;
  /**
   * After appearing, the enemy stays put (present, contact-capable) for this many
   * turns before its first move. Default 0.
   */
  readonly graceTurns?: number;
  /** The enemy moves on every `speedDivisor`-th turn after the grace turns. Default 1. */
  readonly speedDivisor?: number;
}

export interface NormalizedJunctionGreedySpec {
  readonly rule: JunctionGreedyRule;
  readonly spawnCell: HazardCellId;
  readonly lookahead: number;
  readonly initialHeading: HazardMoveDirection | null;
  readonly spawnDelayTurns: number;
  readonly graceTurns: number;
  readonly speedDivisor: number;
}

export interface JunctionGreedyEnemyState {
  readonly contract: typeof CHASER_ENGINE_CONTRACT;
  readonly spec: NormalizedJunctionGreedySpec;
  /** -1 while the enemy has not spawned yet. */
  readonly cell: HazardCellId;
  /** Direction of the last move (or the initial facing); null until known. */
  readonly heading: HazardMoveDirection | null;
  /** Set by an explicit global event; consumed by the next move. */
  readonly reverseNext: boolean;
}

export interface ChaserPlayerState {
  readonly cell: HazardCellId;
  /** Direction of the player's last move action (WAIT keeps it); null before the first move. */
  readonly heading: HazardMoveDirection | null;
}

/** Called with the arrival cell and the arrival world turn; true makes the cell a wall for enemies. */
export type EnemyBlockedPredicate = (cell: HazardCellId, arrivalTurn: number) => boolean;

export interface StepJunctionGreedyOptions {
  /** Optional dynamic obstacles (static blockers, closed gates). Enemies treat them as walls. */
  readonly blocked?: EnemyBlockedPredicate;
}

/** Heading index used by the packed fast path: 0..3 follow HAZARD_MOVE_ORDER, 4 means none. */
export const NO_HEADING_INDEX = 4;

export const headingToIndex = (heading: HazardMoveDirection | null): number => (
  heading === null ? NO_HEADING_INDEX : HAZARD_MOVE_ORDER.indexOf(heading)
);

export const indexToHeading = (index: number): HazardMoveDirection | null => (
  index === NO_HEADING_INDEX ? null : HAZARD_MOVE_ORDER[index]!
);

// ---------------------------------------------------------------------------
// Geometry: cached per graph
// ---------------------------------------------------------------------------

export interface JunctionGreedyGeometry {
  readonly width: number;
  readonly height: number;
  readonly cellCount: number;
  readonly xs: Int32Array;
  readonly ys: Int32Array;
  /** `moves[cell * 4 + d]` = destination of direction index d, or -1. */
  readonly moves: Int32Array;
  /** True when at least one row links x = 0 and x = width - 1 through a wrap edge. */
  readonly wrapHorizontal: boolean;
  /** True when at least one column links y = 0 and y = height - 1 through a wrap edge. */
  readonly wrapVertical: boolean;
}

const geometryCache = new WeakMap<HazardGraph, JunctionGreedyGeometry>();

export const getJunctionGreedyGeometry = (graph: HazardGraph): JunctionGreedyGeometry => {
  const cached = geometryCache.get(graph);
  if (cached) {
    return cached;
  }
  const { width, height, cellCount } = graph;
  const xs = new Int32Array(cellCount);
  const ys = new Int32Array(cellCount);
  const moves = new Int32Array(cellCount * 4).fill(-1);
  let wrapHorizontal = false;
  let wrapVertical = false;
  for (let cell = 0; cell < cellCount; cell += 1) {
    xs[cell] = cell % width;
    ys[cell] = Math.floor(cell / width);
    if (!graph.isWalkable(cell)) {
      continue;
    }
    for (let d = 0; d < 4; d += 1) {
      moves[cell * 4 + d] = graph.moveTarget(cell, HAZARD_MOVE_ORDER[d]!);
    }
    if (xs[cell] === 0 && moves[cell * 4 + 1] === ys[cell]! * width + (width - 1)) {
      wrapHorizontal = true;
    }
    if (ys[cell] === 0 && moves[cell * 4 + 0] === (height - 1) * width + xs[cell]!) {
      wrapVertical = true;
    }
  }
  const geometry: JunctionGreedyGeometry = {
    width, height, cellCount, xs, ys, moves, wrapHorizontal, wrapVertical
  };
  geometryCache.set(graph, geometry);
  return geometry;
};

/**
 * Straight-line (Manhattan) distance. On an axis where the graph has a wrap edge
 * the axis is measured on a torus (`min(d, size - d)`); otherwise plainly. It is a
 * steering heuristic, not a path length.
 */
export const hazardTargetDistance = (graph: HazardGraph, from: HazardCellId, to: HazardCellId): number => (
  geometryDistance(getJunctionGreedyGeometry(graph), from, to)
);

const geometryDistance = (geometry: JunctionGreedyGeometry, from: number, to: number): number => {
  let dx = Math.abs(geometry.xs[from]! - geometry.xs[to]!);
  let dy = Math.abs(geometry.ys[from]! - geometry.ys[to]!);
  if (geometry.wrapHorizontal && geometry.width - dx < dx) {
    dx = geometry.width - dx;
  }
  if (geometry.wrapVertical && geometry.height - dy < dy) {
    dy = geometry.height - dy;
  }
  return dx + dy;
};

// ---------------------------------------------------------------------------
// Spec handling
// ---------------------------------------------------------------------------

const requireIntegerInRange = (value: number, label: string, min: number, max: number): number => {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new RangeError(`${label} must be an integer in [${min}, ${max}], received ${String(value)}`);
  }
  return value;
};

export const normalizeJunctionGreedySpec = (
  spec: JunctionGreedyEnemySpec,
  graph?: HazardGraph
): NormalizedJunctionGreedySpec => {
  if (!JUNCTION_GREEDY_RULES.includes(spec.rule)) {
    throw new RangeError(`unknown junction-greedy rule ${String(spec.rule)}`);
  }
  if (!Number.isInteger(spec.spawnCell) || spec.spawnCell < 0) {
    throw new RangeError('spawnCell must be a non-negative integer cell id');
  }
  if (graph && !graph.isWalkable(spec.spawnCell)) {
    throw new RangeError(`spawnCell ${spec.spawnCell} is not walkable`);
  }
  if (spec.initialHeading !== undefined && !HAZARD_MOVE_ORDER.includes(spec.initialHeading)) {
    throw new RangeError(`unknown initialHeading ${String(spec.initialHeading)}`);
  }
  return {
    rule: spec.rule,
    spawnCell: spec.spawnCell,
    lookahead: requireIntegerInRange(
      spec.lookahead ?? DEFAULT_INTERCEPTOR_LOOKAHEAD, 'lookahead', 1, MAX_INTERCEPTOR_LOOKAHEAD
    ),
    initialHeading: spec.initialHeading ?? (spec.rule === 'wall-follower' ? 'up' : null),
    spawnDelayTurns: requireIntegerInRange(spec.spawnDelayTurns ?? 0, 'spawnDelayTurns', 0, 1_000_000),
    graceTurns: requireIntegerInRange(spec.graceTurns ?? 0, 'graceTurns', 0, 1_000_000),
    speedDivisor: requireIntegerInRange(spec.speedDivisor ?? 1, 'speedDivisor', 1, 64)
  };
};

/** State of the enemy at world tick 0. */
export const createJunctionGreedyEnemy = (
  spec: JunctionGreedyEnemySpec,
  graph?: HazardGraph
): JunctionGreedyEnemyState => {
  const normalized = normalizeJunctionGreedySpec(spec, graph);
  return {
    contract: CHASER_ENGINE_CONTRACT,
    spec: normalized,
    cell: normalized.spawnDelayTurns === 0 ? normalized.spawnCell : -1,
    heading: normalized.spawnDelayTurns === 0 ? normalized.initialHeading : null,
    reverseNext: false
  };
};

/** Explicit global event (the only way a corridor enemy reverses): the next move goes back. */
export const reverseJunctionGreedyEnemy = (state: JunctionGreedyEnemyState): JunctionGreedyEnemyState => (
  state.cell < 0 || state.heading === null ? state : { ...state, reverseNext: true }
);

export const isJunctionGreedyEnemyPresent = (state: JunctionGreedyEnemyState): boolean => state.cell >= 0;

/**
 * True when the enemy takes a movement step in the enemy phase of world turn
 * `turn` (the turn that produces tick `turn`), given it is present.
 */
export const junctionGreedyMovesOnTurn = (spec: NormalizedJunctionGreedySpec, turn: number): boolean => {
  const movementStart = spec.spawnDelayTurns + spec.graceTurns;
  return turn > movementStart && (turn - movementStart) % spec.speedDivisor === 0;
};

// ---------------------------------------------------------------------------
// Movement core (also used by the solver's packed fast path)
// ---------------------------------------------------------------------------

/** Packed per-enemy state: `(cell + 1) * 5 + headingIndex`; cell -1 packs to 0..4. */
export const packEnemy = (cell: number, headingIndex: number): number => (cell + 1) * 5 + headingIndex;
export const unpackEnemyCell = (packed: number): number => Math.floor(packed / 5) - 1;
export const unpackEnemyHeading = (packed: number): number => packed % 5;

const candidateCells = new Int32Array(4);
const candidateDirs = new Int32Array(4);

/** Destination * 4 + direction index of the next move, or -1 to stay. */
const chooseMove = (
  geometry: JunctionGreedyGeometry,
  spec: NormalizedJunctionGreedySpec,
  cell: number,
  headingIndex: number,
  playerCell: number,
  playerHeadingIndex: number,
  turn: number,
  reverse: boolean,
  blocked: EnemyBlockedPredicate | null
): number => {
  const moves = geometry.moves;
  const usable = (dest: number): boolean => dest >= 0 && (blocked === null || !blocked(dest, turn));
  const base = cell * 4;

  if (spec.rule === 'wall-follower') {
    const facing = headingIndex === NO_HEADING_INDEX ? 0 : headingIndex;
    if (reverse && headingIndex !== NO_HEADING_INDEX) {
      const back = (facing + 2) % 4;
      const dest = moves[base + back]!;
      if (usable(dest)) {
        return dest * 4 + back;
      }
    }
    // Left-hand rule: left, straight, right, back. HAZARD_MOVE_ORDER is counter-clockwise,
    // so "left of facing d" is index d + 1.
    for (const turnOffset of [1, 0, 3, 2]) {
      const dir = (facing + turnOffset) % 4;
      const dest = moves[base + dir]!;
      if (usable(dest)) {
        return dest * 4 + dir;
      }
    }
    return -1;
  }

  const backDir = headingIndex === NO_HEADING_INDEX ? -1 : (headingIndex + 2) % 4;
  const backCell = backDir >= 0 ? moves[base + backDir]! : -1;
  if (reverse && backDir >= 0 && usable(backCell)) {
    return backCell * 4 + backDir;
  }

  let count = 0;
  let onlyBack = false;
  for (let d = 0; d < 4; d += 1) {
    const dest = moves[base + d]!;
    if (!usable(dest)) {
      continue;
    }
    let duplicate = false;
    for (let i = 0; i < count; i += 1) {
      if (candidateCells[i] === dest) {
        duplicate = true;
      }
    }
    if (duplicate) {
      continue;
    }
    if (dest === backCell) {
      onlyBack = true;
      continue;
    }
    candidateCells[count] = dest;
    candidateDirs[count] = d;
    count += 1;
  }
  if (count === 0) {
    // Dead end (or a corridor whose forward cell is blocked): reversing is the only move.
    return onlyBack ? backCell * 4 + backDir : -1;
  }
  if (count === 1) {
    return candidateCells[0]! * 4 + candidateDirs[0]!;
  }

  // A decision point: >= 2 non-reverse exits. Pick the exit whose cell is closest
  // (straight-line) to the target; ties keep the first in up, left, down, right order.
  let target = playerCell;
  if (spec.rule === 'interceptor' && playerHeadingIndex !== NO_HEADING_INDEX) {
    for (let step = 0; step < spec.lookahead; step += 1) {
      const next = moves[target * 4 + playerHeadingIndex]!;
      if (next < 0) {
        break;
      }
      target = next;
    }
  }
  let best = 0;
  let bestDistance = geometryDistance(geometry, candidateCells[0]!, target);
  for (let i = 1; i < count; i += 1) {
    const distance = geometryDistance(geometry, candidateCells[i]!, target);
    if (distance < bestDistance) {
      best = i;
      bestDistance = distance;
    }
  }
  return candidateCells[best]! * 4 + candidateDirs[best]!;
};

/**
 * Packed one-turn update. `turn` is the number of the world turn being resolved
 * (= previous tick + 1); `playerCell`/`playerHeadingIndex` are the player's state
 * AFTER the player phase of that turn. Returns the new packed state.
 */
export const stepJunctionGreedyPacked = (
  geometry: JunctionGreedyGeometry,
  spec: NormalizedJunctionGreedySpec,
  packed: number,
  playerCell: number,
  playerHeadingIndex: number,
  turn: number,
  reverse: boolean,
  blocked: EnemyBlockedPredicate | null
): number => {
  const cell = unpackEnemyCell(packed);
  if (cell < 0) {
    return turn < spec.spawnDelayTurns ? packed : packEnemy(spec.spawnCell, headingToIndex(spec.initialHeading));
  }
  if (!junctionGreedyMovesOnTurn(spec, turn)) {
    return packed;
  }
  const headingIndex = unpackEnemyHeading(packed);
  const move = chooseMove(
    geometry, spec, cell, headingIndex, playerCell, playerHeadingIndex, turn, reverse, blocked
  );
  return move < 0 ? packed : packEnemy(Math.floor(move / 4), move % 4);
};

/**
 * One enemy phase. `tick` is the world tick BEFORE the turn (the turn produces
 * tick `tick + 1`); `player` is the player's state after the player phase.
 * Returns a new state; the input is never mutated.
 */
export const stepJunctionGreedyEnemy = (
  graph: HazardGraph,
  state: JunctionGreedyEnemyState,
  player: ChaserPlayerState,
  tick: number,
  options: StepJunctionGreedyOptions = {}
): JunctionGreedyEnemyState => {
  if (!Number.isInteger(tick) || tick < 0) {
    throw new RangeError('tick must be a non-negative integer');
  }
  if (!graph.isWalkable(player.cell)) {
    throw new RangeError(`player cell ${String(player.cell)} is not walkable`);
  }
  const geometry = getJunctionGreedyGeometry(graph);
  const spec = state.spec;
  if (state.cell >= 0 && !graph.isWalkable(state.cell)) {
    throw new RangeError(`enemy cell ${state.cell} is not walkable`);
  }
  const turn = tick + 1;
  const before = packEnemy(state.cell, headingToIndex(state.heading));
  const moving = state.cell >= 0 && junctionGreedyMovesOnTurn(spec, turn);
  const after = stepJunctionGreedyPacked(
    geometry,
    spec,
    before,
    player.cell,
    headingToIndex(player.heading),
    turn,
    state.reverseNext,
    options.blocked ?? null
  );
  if (after === before) {
    return state;
  }
  return {
    contract: CHASER_ENGINE_CONTRACT,
    spec,
    cell: unpackEnemyCell(after),
    heading: indexToHeading(unpackEnemyHeading(after)),
    reverseNext: moving ? false : state.reverseNext
  };
};

/** The cell the enemy steers toward this turn (exposed for tests and analytics). */
export const junctionGreedyTargetCell = (
  graph: HazardGraph,
  spec: NormalizedJunctionGreedySpec,
  player: ChaserPlayerState
): HazardCellId => {
  if (spec.rule === 'wall-follower') {
    return -1;
  }
  let target = player.cell;
  if (spec.rule === 'interceptor' && player.heading !== null) {
    for (let step = 0; step < spec.lookahead; step += 1) {
      const next = graph.moveTarget(target, player.heading);
      if (next < 0) {
        break;
      }
      target = next;
    }
  }
  return target;
};
