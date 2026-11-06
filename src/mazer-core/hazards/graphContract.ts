/**
 * DRAFT hazard graph contract (packet P3). Dormant: not wired into any scene and
 * not exported through the mazer-core barrel. See
 * docs/architecture/MAZER-HAZARD-GRAPH-CONTRACT.md.
 *
 * Pure and runtime-agnostic: no randomness, no clock, no rendering. Every
 * function is a deterministic function of its arguments.
 */

export const HAZARD_GRAPH_CONTRACT = 'mazer-hazard-graph-draft-v0' as const;

/** Row-major cell id: `y * width + x`. */
export type HazardCellId = number;

/** Tie-break order used everywhere a deterministic choice among moves is needed. */
export const HAZARD_MOVE_ORDER = ['up', 'left', 'down', 'right'] as const;
export type HazardMoveDirection = typeof HAZARD_MOVE_ORDER[number];

export const HAZARD_ACTION_ORDER = ['up', 'left', 'down', 'right', 'wait'] as const;
export type HazardAction = typeof HAZARD_ACTION_ORDER[number];

const MOVE_DELTAS: ReadonlyArray<readonly [number, number]> = [
  [0, -1],
  [-1, 0],
  [0, 1],
  [1, 0]
];

/**
 * Minimal structural input. `LegacyMazeSnapshot` satisfies it as-is
 * (`grid[y][x] === true` means walkable floor).
 */
export interface HazardGraphInput {
  readonly width: number;
  readonly height: number;
  readonly grid: ReadonlyArray<ReadonlyArray<boolean>>;
}

export interface HazardGraph {
  readonly contract: typeof HAZARD_GRAPH_CONTRACT;
  readonly width: number;
  readonly height: number;
  readonly cellCount: number;
  cellId(x: number, y: number): HazardCellId;
  cellX(cell: HazardCellId): number;
  cellY(cell: HazardCellId): number;
  isWalkable(cell: HazardCellId): boolean;
  /**
   * Destination of one cardinal step, or -1. Matches production movement
   * (`resolveLegacyNavigationTarget`): an in-bounds walkable neighbour wins;
   * otherwise a step off an edge wraps to the opposite edge when that cell is
   * walkable and is not the origin itself.
   */
  moveTarget(cell: HazardCellId, direction: HazardMoveDirection): HazardCellId;
  /** Distinct reachable neighbours in tie-break order (up, left, down, right). */
  neighbors(cell: HazardCellId): readonly HazardCellId[];
  degree(cell: HazardCellId): number;
  /** A junction is a walkable cell with 3 or more distinct neighbours. */
  isJunction(cell: HazardCellId): boolean;
  isDeadEnd(cell: HazardCellId): boolean;
  readonly walkableCellCount: number;
}

const requireInteger = (value: number, label: string): void => {
  if (!Number.isInteger(value)) {
    throw new RangeError(`${label} must be an integer, received ${String(value)}`);
  }
};

export const createHazardGraph = (input: HazardGraphInput): HazardGraph => {
  const { width, height, grid } = input;
  requireInteger(width, 'width');
  requireInteger(height, 'height');
  if (width <= 0 || height <= 0) {
    throw new RangeError('hazard graph requires positive width and height');
  }
  if (grid.length !== height) {
    throw new RangeError(`grid has ${grid.length} rows, expected ${height}`);
  }
  for (let y = 0; y < height; y += 1) {
    if (grid[y]!.length !== width) {
      throw new RangeError(`grid row ${y} has ${grid[y]!.length} columns, expected ${width}`);
    }
  }

  const cellCount = width * height;
  const walkable = new Uint8Array(cellCount);
  let walkableCellCount = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (grid[y]![x] === true) {
        walkable[y * width + x] = 1;
        walkableCellCount += 1;
      }
    }
  }

  const moves = new Int32Array(cellCount * 4).fill(-1);
  const neighborLists: HazardCellId[][] = Array.from({ length: cellCount }, () => []);

  for (let cell = 0; cell < cellCount; cell += 1) {
    if (walkable[cell] === 0) {
      continue;
    }
    const x = cell % width;
    const y = (cell - x) / width;
    for (let d = 0; d < 4; d += 1) {
      const [dx, dy] = MOVE_DELTAS[d]!;
      const nx = x + dx;
      const ny = y + dy;
      let target = -1;
      if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
        if (walkable[ny * width + nx] === 1) {
          target = ny * width + nx;
        }
      } else {
        // Production wrap: only a step exactly one past an edge, with the other
        // axis in range, wraps to the opposite edge.
        const wx = nx === -1 ? width - 1 : nx === width ? 0 : nx;
        const wy = ny === -1 ? height - 1 : ny === height ? 0 : ny;
        const wrapped = wy * width + wx;
        if (walkable[wrapped] === 1 && wrapped !== cell) {
          target = wrapped;
        }
      }
      moves[cell * 4 + d] = target;
      if (target >= 0 && !neighborLists[cell]!.includes(target)) {
        neighborLists[cell]!.push(target);
      }
    }
  }

  const assertCell = (cell: HazardCellId): void => {
    if (!Number.isInteger(cell) || cell < 0 || cell >= cellCount) {
      throw new RangeError(`cell ${String(cell)} is outside the ${width}x${height} graph`);
    }
  };

  return {
    contract: HAZARD_GRAPH_CONTRACT,
    width,
    height,
    cellCount,
    walkableCellCount,
    cellId(x, y) {
      if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || x >= width || y < 0 || y >= height) {
        throw new RangeError(`point (${String(x)}, ${String(y)}) is outside the ${width}x${height} graph`);
      }
      return y * width + x;
    },
    cellX(cell) {
      assertCell(cell);
      return cell % width;
    },
    cellY(cell) {
      assertCell(cell);
      return Math.floor(cell / width);
    },
    isWalkable(cell) {
      return Number.isInteger(cell) && cell >= 0 && cell < cellCount && walkable[cell] === 1;
    },
    moveTarget(cell, direction) {
      assertCell(cell);
      return moves[cell * 4 + HAZARD_MOVE_ORDER.indexOf(direction)]!;
    },
    neighbors(cell) {
      assertCell(cell);
      return neighborLists[cell]!;
    },
    degree(cell) {
      assertCell(cell);
      return neighborLists[cell]!.length;
    },
    isJunction(cell) {
      assertCell(cell);
      return neighborLists[cell]!.length >= 3;
    },
    isDeadEnd(cell) {
      assertCell(cell);
      return walkable[cell] === 1 && neighborLists[cell]!.length <= 1;
    }
  };
};

/**
 * Cells (excluding `start` and `goal`) that every start->goal route must pass
 * through on the static graph: removing any one disconnects the goal. These are
 * the s-t separating cells ("chokepoints"). `impassable` cells are removed first
 * (static blockers). Sorted ascending. Empty when the goal is unreachable.
 */
export const findSeparatorCells = (
  graph: HazardGraph,
  start: HazardCellId,
  goal: HazardCellId,
  impassable: ReadonlySet<HazardCellId> = new Set()
): HazardCellId[] => {
  const bfs = (removed: HazardCellId): Int32Array | null => {
    if (!graph.isWalkable(start) || !graph.isWalkable(goal) || impassable.has(start) || impassable.has(goal)) {
      return null;
    }
    const previous = new Int32Array(graph.cellCount).fill(-2);
    const queue = new Int32Array(graph.cellCount);
    let head = 0;
    let tail = 0;
    previous[start] = -1;
    queue[tail++] = start;
    while (head < tail) {
      const current = queue[head++]!;
      if (current === goal) {
        return previous;
      }
      for (const next of graph.neighbors(current)) {
        if (previous[next] !== -2 || next === removed || impassable.has(next)) {
          continue;
        }
        previous[next] = current;
        queue[tail++] = next;
      }
    }
    return null;
  };

  const base = bfs(-1);
  if (!base) {
    return [];
  }
  const onPath: HazardCellId[] = [];
  for (let cursor = base[goal]!; cursor !== -1 && cursor !== start; cursor = base[cursor]!) {
    onPath.push(cursor);
  }
  return onPath.filter((cell) => bfs(cell) === null).sort((left, right) => left - right);
};

// ---------------------------------------------------------------------------
// Deterministic hazards
// ---------------------------------------------------------------------------

export interface BlockerSpec {
  readonly kind: 'blocker';
  readonly cell: HazardCellId;
}

/**
 * Open at tick `t` iff `((t - openFrom) mod period) < openFor`; closed otherwise.
 * Requires `1 <= period`, `0 <= openFrom < period`, `0 <= openFor <= period`
 * (`openFor === 0` is a permanently closed gate, `openFor === period` permanently open).
 */
export interface TimedGateSpec {
  readonly kind: 'timedGate';
  readonly cell: HazardCellId;
  readonly period: number;
  readonly openFrom: number;
  readonly openFor: number;
}

/**
 * Deterministic shuttle patroller. The route is walked one cell per world turn,
 * forward then back (ping-pong, no dwell at the ends): for `n` route cells the
 * cycle is `2 * (n - 1)` turns (1 for a single cell). `period` must equal that
 * cycle (see `shuttlePeriod`). The cell at tick `t` is a pure function of
 * `(t + phase) mod period`; it never depends on the player.
 */
export interface PatrolSpec {
  readonly kind: 'patrol';
  readonly route: readonly HazardCellId[];
  readonly period: number;
  readonly phase?: number;
}

export type HazardSpec = BlockerSpec | TimedGateSpec | PatrolSpec;

export type HazardSpecErrorCode =
  | 'cell-not-walkable'
  | 'duplicate-obstacle-cell'
  | 'invalid-gate'
  | 'invalid-patrol-period'
  | 'invalid-patrol-route'
  | 'patrol-overlaps-blocker'
  | 'period-too-large';

export class HazardSpecError extends Error {
  readonly code: HazardSpecErrorCode;
  readonly index: number | null;

  constructor(code: HazardSpecErrorCode, message: string, index: number | null) {
    super(message);
    this.name = 'HazardSpecError';
    this.code = code;
    this.index = index;
  }
}

export const HAZARD_MAX_PERIOD = 720;

export const shuttlePeriod = (routeLength: number): number => (
  routeLength <= 1 ? 1 : 2 * (routeLength - 1)
);

/** Index into a shuttle route of length `n` at phase `p` (0 <= p < shuttlePeriod(n)). */
export const shuttleIndexAt = (routeLength: number, phase: number): number => {
  if (routeLength <= 1) {
    return 0;
  }
  const cycle = shuttlePeriod(routeLength);
  const q = ((phase % cycle) + cycle) % cycle;
  return q < routeLength ? q : cycle - q;
};

export const patrolCellAt = (spec: PatrolSpec, tick: number): HazardCellId => (
  spec.route[shuttleIndexAt(spec.route.length, tick + (spec.phase ?? 0))]!
);

export const isTimedGateOpenAt = (spec: TimedGateSpec, tick: number): boolean => {
  const q = (((tick - spec.openFrom) % spec.period) + spec.period) % spec.period;
  return q < spec.openFor;
};

const gcd = (left: number, right: number): number => (right === 0 ? left : gcd(right, left % right));

/** lcm of the periods, throwing `period-too-large` once it would exceed `maxPeriod`. */
export const boundedLcm = (periods: readonly number[], maxPeriod: number): number => {
  let result = 1;
  for (const period of periods) {
    result = (result / gcd(result, period)) * period;
    if (result > maxPeriod) {
      throw new HazardSpecError(
        'period-too-large',
        `combined hazard period exceeds the bound of ${maxPeriod}`,
        null
      );
    }
  }
  return result;
};

/**
 * Time-indexed view of every deterministic hazard. `tickMod` arguments may be any
 * integer tick; implementations reduce it modulo `period`.
 *
 * Extension point (P6): chasers/interceptors depend on the player path and cannot
 * be a function of tick alone; they implement a richer timeline whose enemy
 * state is part of the search state. See MAZER-HAZARD-GRAPH-CONTRACT.md.
 */
export interface HazardTimeline {
  /** lcm of every hazard period (1 when there are none). */
  readonly period: number;
  readonly enemyCount: number;
  /** True when an obstacle makes `cell` impassable/unoccupiable at this tick. */
  blockedAt(cell: HazardCellId, tickMod: number): boolean;
  /**
   * Enemy positions at this tick, indexed by enemy (stable order = patrol spec
   * order). Several enemies may share a cell; the array is not de-duplicated.
   */
  enemyCellsAt(tickMod: number): readonly HazardCellId[];
}

export interface CreateHazardTimelineOptions {
  readonly maxPeriod?: number;
}

export interface BuiltHazardTimeline extends HazardTimeline {
  readonly specs: readonly HazardSpec[];
  /** Cells that are blocked at every tick (static blockers). */
  readonly blockerCells: readonly HazardCellId[];
}

export const createHazardTimeline = (
  graph: HazardGraph,
  specs: readonly HazardSpec[],
  options: CreateHazardTimelineOptions = {}
): BuiltHazardTimeline => {
  const maxPeriod = options.maxPeriod ?? HAZARD_MAX_PERIOD;
  const periods: number[] = [];
  const obstacleCells = new Set<HazardCellId>();
  const blockerCells = new Set<HazardCellId>();
  const patrols: Array<{ spec: PatrolSpec; index: number }> = [];

  specs.forEach((spec, index) => {
    if (spec.kind === 'blocker' || spec.kind === 'timedGate') {
      if (!graph.isWalkable(spec.cell)) {
        throw new HazardSpecError('cell-not-walkable', `hazard ${index} is on a non-walkable cell`, index);
      }
      if (obstacleCells.has(spec.cell)) {
        throw new HazardSpecError('duplicate-obstacle-cell', `hazard ${index} reuses an obstacle cell`, index);
      }
      obstacleCells.add(spec.cell);
      if (spec.kind === 'blocker') {
        blockerCells.add(spec.cell);
        return;
      }
      const { period, openFrom, openFor } = spec;
      if (
        !Number.isInteger(period) || !Number.isInteger(openFrom) || !Number.isInteger(openFor)
        || period < 1 || openFrom < 0 || openFrom >= period || openFor < 0 || openFor > period
      ) {
        throw new HazardSpecError('invalid-gate', `timed gate ${index} has an invalid period or open range`, index);
      }
      periods.push(period);
      return;
    }

    const { route, period } = spec;
    if (route.length === 0 || route.some((cell) => !graph.isWalkable(cell))) {
      throw new HazardSpecError('invalid-patrol-route', `patrol ${index} needs a non-empty walkable route`, index);
    }
    for (let i = 1; i < route.length; i += 1) {
      if (!graph.neighbors(route[i - 1]!).includes(route[i]!)) {
        throw new HazardSpecError('invalid-patrol-route', `patrol ${index} route is not 4-connected at step ${i}`, index);
      }
    }
    if (period !== shuttlePeriod(route.length)) {
      throw new HazardSpecError(
        'invalid-patrol-period',
        `patrol ${index} period ${period} must equal the shuttle cycle ${shuttlePeriod(route.length)}`,
        index
      );
    }
    if (spec.phase !== undefined && (!Number.isInteger(spec.phase) || spec.phase < 0)) {
      throw new HazardSpecError('invalid-patrol-route', `patrol ${index} phase must be a non-negative integer`, index);
    }
    periods.push(period);
    patrols.push({ spec, index });
  });

  for (const { spec, index } of patrols) {
    if (spec.route.some((cell) => blockerCells.has(cell))) {
      throw new HazardSpecError('patrol-overlaps-blocker', `patrol ${index} route crosses a static blocker`, index);
    }
  }

  const period = boundedLcm(periods, maxPeriod);
  const cellCount = graph.cellCount;

  const blocked = new Uint8Array(period * cellCount);
  for (let tick = 0; tick < period; tick += 1) {
    for (const cell of blockerCells) {
      blocked[tick * cellCount + cell] = 1;
    }
  }
  for (const spec of specs) {
    if (spec.kind !== 'timedGate') {
      continue;
    }
    for (let tick = 0; tick < period; tick += 1) {
      if (!isTimedGateOpenAt(spec, tick)) {
        blocked[tick * cellCount + spec.cell] = 1;
      }
    }
  }

  const enemyTable: HazardCellId[][] = [];
  for (let tick = 0; tick < period; tick += 1) {
    enemyTable.push(patrols.map(({ spec }) => patrolCellAt(spec, tick)));
  }

  const reduce = (tick: number): number => {
    if (!Number.isInteger(tick)) {
      throw new RangeError(`tick must be an integer, received ${String(tick)}`);
    }
    return ((tick % period) + period) % period;
  };

  return {
    period,
    enemyCount: patrols.length,
    specs: specs.slice(),
    blockerCells: [...blockerCells].sort((left, right) => left - right),
    blockedAt(cell, tickMod) {
      if (!Number.isInteger(cell) || cell < 0 || cell >= cellCount) {
        return false;
      }
      return blocked[reduce(tickMod) * cellCount + cell] === 1;
    },
    enemyCellsAt(tickMod) {
      return enemyTable[reduce(tickMod)]!;
    }
  };
};
