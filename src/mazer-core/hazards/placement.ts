/**
 * DRAFT deterministic hazard placement (packet P4/P5, pure part). Dormant: not
 * wired into any scene and not exported through the mazer-core barrel. See
 * docs/architecture/MAZER-HAZARD-PLACEMENT-AND-LOADOUT.md.
 *
 * `placeLevelHazards` turns a loadout requirement into concrete `HazardSpec`s for
 * one maze. It is a pure function of `(graph, start, goal, seed, loadout)`: seed
 * mixing is `mix32(seed, kind, index, ...)`, there is no unseeded randomness, clock, or
 * iteration-order dependence, so equal inputs give byte-identical output.
 *
 * Acceptance is always the P3 validator: every returned placement passes
 * `validateLevelHazards` (hazards present, post-contact, items absent). When a
 * requirement cannot be hosted the placement degrades (fewer hazards) and says
 * so; it never returns an unsolvable level.
 */

import {
  HazardSpecError,
  createHazardTimeline,
  findSeparatorCells,
  shuttlePeriod,
  type BlockerSpec,
  type HazardCellId,
  type HazardGraph,
  type HazardSpec,
  type PatrolSpec,
  type TimedGateSpec
} from './graphContract';
import { GATE_TIERS, resolveGateTierParams, resolvePatrolRouteLength } from './loadout';
import { stableStringify } from './serialization';
import { findWitnessRoute } from './solvability';
import {
  DEFAULT_INVULNERABLE_TURNS,
  validateLevelHazards,
  type LevelHazardVerdict
} from './validation';

export const HAZARD_PLACEMENT_CONTRACT = 'mazer-hazard-placement-draft-v0' as const;

/** One hazard per this many walkable cells at most. [DEFAULT, pending owner] */
export const HAZARD_CELLS_PER_HAZARD = 24;
/** Cells within this graph distance of a first-encounter hazard stay hazard-free. */
export const FIRST_ENCOUNTER_CLEARANCE = 2;
/** Full rebuilds (different hash salt) tried before hazards are dropped. */
export const MAX_PLACEMENT_ATTEMPTS = 3;
const MAX_PATROL_TRIES = 8;

export type PlacementKind = 'blocker' | 'timedGate' | 'patrol';

const KIND_CODE: Readonly<Record<PlacementKind, number>> = { blocker: 1, timedGate: 2, patrol: 3 };
const KIND_ORDER: readonly PlacementKind[] = ['blocker', 'timedGate', 'patrol'];

/**
 * 32-bit seed mixer (murmur3-style finalizer per word). Pure integer arithmetic,
 * identical on every JS engine.
 */
export const mix32 = (...values: readonly number[]): number => {
  let h = 0x9e3779b9 | 0;
  for (const value of values) {
    h = Math.imul(h ^ (value | 0), 0x85ebca6b);
    h ^= h >>> 13;
    h = Math.imul(h, 0xc2b2ae35);
    h ^= h >>> 16;
  }
  return h >>> 0;
};

export interface PlacementLoadout {
  readonly blockers: number;
  readonly timedGates: number;
  readonly patrols: number;
  /** Effective tiers (default 0). `HazardLoadout` satisfies this structurally. */
  readonly gateTier?: number;
  readonly patrolTier?: number;
  /**
   * Kinds appearing for the first time in the level sequence. At most one is
   * honoured (blocker, then gate, then patrol); it is placed as a single hazard
   * in a safe configuration and any other flagged kind is dropped.
   */
  readonly firstEncounter?: {
    readonly blocker?: boolean;
    readonly timedGate?: boolean;
    readonly patrol?: boolean;
  };
}

export interface PlaceLevelHazardsOptions {
  readonly start: HazardCellId;
  readonly goal: HazardCellId;
  readonly seed: number;
  readonly loadout: PlacementLoadout;
  readonly invulnerableTurns?: number;
  /** Overrides `maxHazardsForMaze`. */
  readonly capacity?: number;
}

export interface KindCounts {
  readonly blockers: number;
  readonly timedGates: number;
  readonly patrols: number;
}

export interface HazardPlacementResult {
  readonly contract: typeof HAZARD_PLACEMENT_CONTRACT;
  readonly seed: number;
  readonly specs: readonly HazardSpec[];
  readonly verdict: LevelHazardVerdict;
  /** Number of validator evaluations spent (>= 1). */
  readonly attempts: number;
  /** What the loadout asked for. */
  readonly requested: KindCounts;
  /** What is asked after first-encounter and density clamps. */
  readonly target: KindCounts;
  readonly placed: KindCounts;
  /** `maxHazardsForMaze` for this maze (or the override). */
  readonly capacity: number;
  /** True when the requested total exceeded the capacity. */
  readonly capped: boolean;
  /** True when fewer hazards were placed than the target (maze could not host them). */
  readonly degraded: boolean;
  readonly firstEncounter: { readonly kind: PlacementKind; readonly placed: boolean } | null;
}

export const serializePlacement = (result: HazardPlacementResult): string => stableStringify(result);

// ---------------------------------------------------------------------------
// Capacity (feasibility ceiling)
// ---------------------------------------------------------------------------

/**
 * Hard ceiling on the number of hazards a maze can host. Derived from the walkable
 * cell count (one hazard per `HAZARD_CELLS_PER_HAZARD` cells) and from structure:
 * every blocker/patrol needs a junction to detour or dodge at, so the ceiling is
 * also bounded by the junction count (with a floor of one hazard per 2x
 * `HAZARD_CELLS_PER_HAZARD` cells, so a corridor can still host a single gate).
 * When `endpoints` is given, mandatory (separator) cells are removed from the free
 * space as well. This is the number the loadout "feasibility ceiling" refers to.
 */
export const maxHazardsForMaze = (
  graph: HazardGraph,
  endpoints?: { readonly start: HazardCellId; readonly goal: HazardCellId }
): number => {
  const walkable = graph.walkableCellCount;
  let junctions = 0;
  for (let cell = 0; cell < graph.cellCount; cell += 1) {
    if (graph.isWalkable(cell) && graph.isJunction(cell)) {
      junctions += 1;
    }
  }
  let ceiling = Math.min(
    Math.floor(walkable / HAZARD_CELLS_PER_HAZARD),
    Math.max(junctions, Math.floor(walkable / (2 * HAZARD_CELLS_PER_HAZARD)))
  );
  if (endpoints !== undefined) {
    const separators = findSeparatorCells(graph, endpoints.start, endpoints.goal).length;
    const free = Math.max(0, walkable - 2 - separators);
    ceiling = Math.min(ceiling, Math.max(1, Math.floor(free / 12)));
  }
  return Math.max(0, ceiling);
};

// ---------------------------------------------------------------------------
// Graph helpers
// ---------------------------------------------------------------------------

const bfsPath = (
  graph: HazardGraph,
  start: HazardCellId,
  goal: HazardCellId,
  blocked: Uint8Array
): HazardCellId[] | null => {
  if (!graph.isWalkable(start) || !graph.isWalkable(goal) || blocked[start] === 1 || blocked[goal] === 1) {
    return null;
  }
  const previous = new Int32Array(graph.cellCount).fill(-2);
  const queue = new Int32Array(graph.cellCount);
  let head = 0;
  let tail = 0;
  previous[start] = -1;
  queue[tail++] = start;
  while (head < tail && previous[goal] === -2) {
    const current = queue[head++]!;
    for (const next of graph.neighbors(current)) {
      if (previous[next] === -2 && blocked[next] !== 1) {
        previous[next] = current;
        queue[tail++] = next;
      }
    }
  }
  if (previous[goal] === -2) {
    return null;
  }
  const path: HazardCellId[] = [];
  for (let cursor = goal; cursor !== -1; cursor = previous[cursor]!) {
    path.push(cursor);
  }
  return path.reverse();
};

/** Cells within `radius` graph steps of any source (sources included). */
const cellsWithin = (graph: HazardGraph, sources: Iterable<HazardCellId>, radius: number): Uint8Array => {
  const mask = new Uint8Array(graph.cellCount);
  let frontier: HazardCellId[] = [];
  for (const cell of sources) {
    if (mask[cell] === 0) {
      mask[cell] = 1;
      frontier.push(cell);
    }
  }
  for (let step = 0; step < radius; step += 1) {
    const next: HazardCellId[] = [];
    for (const cell of frontier) {
      for (const neighbor of graph.neighbors(cell)) {
        if (mask[neighbor] === 0) {
          mask[neighbor] = 1;
          next.push(neighbor);
        }
      }
    }
    frontier = next;
  }
  return mask;
};

const specCells = (spec: HazardSpec): readonly HazardCellId[] => (
  spec.kind === 'patrol' ? spec.route : [spec.cell]
);

const protectedCells = (graph: HazardGraph, start: HazardCellId, goal: HazardCellId): Uint8Array => (
  cellsWithin(graph, [start, goal], 1)
);

const countKinds = (specs: readonly HazardSpec[]): KindCounts => ({
  blockers: specs.filter((spec) => spec.kind === 'blocker').length,
  timedGates: specs.filter((spec) => spec.kind === 'timedGate').length,
  patrols: specs.filter((spec) => spec.kind === 'patrol').length
});

const countOf = (counts: KindCounts, kind: PlacementKind): number => (
  kind === 'blocker' ? counts.blockers : kind === 'timedGate' ? counts.timedGates : counts.patrols
);

const withCount = (counts: KindCounts, kind: PlacementKind, value: number): KindCounts => ({
  blockers: kind === 'blocker' ? value : counts.blockers,
  timedGates: kind === 'timedGate' ? value : counts.timedGates,
  patrols: kind === 'patrol' ? value : counts.patrols
});

const totalOf = (counts: KindCounts): number => counts.blockers + counts.timedGates + counts.patrols;

// ---------------------------------------------------------------------------
// Screening (also the unsolvable-by-construction guard)
// ---------------------------------------------------------------------------

export type PlacementRejection =
  | 'protected-cell'
  | 'over-density'
  | 'first-encounter-count'
  | 'first-encounter-not-alone'
  | 'first-encounter-no-detour'
  | 'first-encounter-wait-too-long'
  | 'validator-failed';

export interface ScreenHazardPlacementOptions {
  readonly start: HazardCellId;
  readonly goal: HazardCellId;
  readonly invulnerableTurns?: number;
  readonly capacity?: number;
  /** When set, the first-encounter rule is enforced for this kind. */
  readonly firstEncounterKind?: PlacementKind | null;
}

export interface PlacementScreen {
  readonly accepted: boolean;
  readonly reasons: readonly PlacementRejection[];
  readonly verdict: LevelHazardVerdict;
}

/**
 * The single acceptance gate: static rules (protected cells, density, the
 * first-encounter rule) plus the P3 validator. A placement that is unsolvable, or
 * can strand the player after a contact, is rejected here.
 */
export const screenHazardPlacement = (
  graph: HazardGraph,
  specs: readonly HazardSpec[],
  options: ScreenHazardPlacementOptions
): PlacementScreen => {
  const { start, goal } = options;
  const reasons: PlacementRejection[] = [];
  const guarded = protectedCells(graph, start, goal);
  if (specs.some((spec) => specCells(spec).some((cell) => guarded[cell] === 1))) {
    reasons.push('protected-cell');
  }
  const capacity = options.capacity ?? maxHazardsForMaze(graph, { start, goal });
  if (specs.length > capacity) {
    reasons.push('over-density');
  }

  const kind = options.firstEncounterKind ?? null;
  if (kind !== null) {
    const firstSpecs = specs.filter((spec) => spec.kind === kind);
    if (firstSpecs.length !== 1) {
      reasons.push('first-encounter-count');
    } else {
      const first = firstSpecs[0]!;
      const zone = cellsWithin(graph, specCells(first), FIRST_ENCOUNTER_CLEARANCE);
      const others = specs.filter((spec) => spec !== first);
      if (others.some((spec) => specCells(spec).some((cell) => zone[cell] === 1))) {
        reasons.push('first-encounter-not-alone');
      }
      if (first.kind === 'timedGate') {
        if (first.period - first.openFor > 1) {
          reasons.push('first-encounter-wait-too-long');
        }
      } else {
        const avoid = new Uint8Array(graph.cellCount);
        for (const spec of specs) {
          if (spec.kind === 'blocker') {
            avoid[spec.cell] = 1;
          }
        }
        for (const cell of specCells(first)) {
          avoid[cell] = 1;
        }
        if (bfsPath(graph, start, goal, avoid) === null) {
          reasons.push('first-encounter-no-detour');
        }
      }
    }
  }

  const verdict = validateLevelHazards(graph, specs, {
    start,
    goal,
    invulnerableTurns: options.invulnerableTurns
  });
  if (!verdict.pass) {
    reasons.push('validator-failed');
  }
  return { accepted: reasons.length === 0, reasons, verdict };
};

// ---------------------------------------------------------------------------
// Candidate generation
// ---------------------------------------------------------------------------

interface BuildContext {
  readonly graph: HazardGraph;
  readonly start: HazardCellId;
  readonly goal: HazardCellId;
  readonly seed: number;
  readonly salt: number;
  readonly guarded: Uint8Array;
  readonly target: KindCounts;
  readonly gateTier: number;
  readonly patrolTier: number;
  readonly firstKind: PlacementKind | null;
}

interface BuildState {
  /** Placement sequence (used for back-off: last placed is dropped first). */
  readonly sequence: HazardSpec[];
  /** Cells the player can never use (blockers, plus the first-encounter hazard). */
  readonly avoid: Uint8Array;
  /** Cells holding any hazard cell. */
  readonly occupied: Uint8Array;
  /** Radius-1 halo around occupied cells (no two hazards touch). */
  readonly halo: Uint8Array;
  /** Radius-2 clearance around the first-encounter hazard. */
  readonly clearance: Uint8Array;
}

const rankByHash = (
  context: BuildContext,
  kind: PlacementKind,
  index: number,
  cells: readonly number[],
  primary?: (cell: number) => number
): number[] => (
  cells
    .map((cell) => ({
      cell,
      primary: primary ? primary(cell) : 0,
      hash: mix32(context.seed, KIND_CODE[kind], index, context.salt, cell)
    }))
    .sort((left, right) => (
      left.primary - right.primary || left.hash - right.hash || left.cell - right.cell
    ))
    .map((entry) => entry.cell)
);

const occupy = (context: BuildContext, state: BuildState, spec: HazardSpec, isFirst: boolean): void => {
  state.sequence.push(spec);
  const cells = specCells(spec);
  for (const cell of cells) {
    state.occupied[cell] = 1;
  }
  const halo = cellsWithin(context.graph, cells, 1);
  for (let cell = 0; cell < halo.length; cell += 1) {
    if (halo[cell] === 1) {
      state.halo[cell] = 1;
    }
  }
  // A gate can always be waited out, so only blockers and a first-encounter patrol
  // must stay avoidable by a hazard-free detour.
  if (spec.kind === 'blocker' || (isFirst && spec.kind === 'patrol')) {
    for (const cell of cells) {
      state.avoid[cell] = 1;
    }
  }
  if (isFirst) {
    const zone = cellsWithin(context.graph, cells, FIRST_ENCOUNTER_CLEARANCE);
    for (let cell = 0; cell < zone.length; cell += 1) {
      if (zone[cell] === 1) {
        state.clearance[cell] = 1;
      }
    }
  }
};

const isFree = (context: BuildContext, state: BuildState, cell: HazardCellId, isFirst: boolean): boolean => (
  context.graph.isWalkable(cell)
  && context.guarded[cell] !== 1
  && state.occupied[cell] !== 1
  && state.halo[cell] !== 1
  && (isFirst || state.clearance[cell] !== 1)
);

const placeBlockers = (context: BuildContext, state: BuildState, count: number, isFirst: boolean): void => {
  const { graph, start, goal } = context;
  for (let index = 0; index < count; index += 1) {
    const route = bfsPath(graph, start, goal, state.avoid);
    if (route === null) {
      return;
    }
    const penalties = new Map<number, number>();
    const candidates: number[] = [];
    for (let i = 1; i < route.length - 1; i += 1) {
      const cell = route[i]!;
      if (!isFree(context, state, cell, isFirst && index === 0)) {
        continue;
      }
      state.avoid[cell] = 1;
      const detour = bfsPath(graph, start, goal, state.avoid);
      state.avoid[cell] = 0;
      if (detour === null) {
        continue; // a separator: removing it would disconnect the goal
      }
      const penalty = detour.length - route.length;
      if (penalty >= 2) {
        penalties.set(cell, penalty);
        candidates.push(cell);
      }
    }
    const ranked = rankByHash(
      context,
      'blocker',
      index,
      candidates,
      isFirst ? (cell) => penalties.get(cell)! : undefined
    );
    if (ranked.length === 0) {
      return;
    }
    occupy(context, state, { kind: 'blocker', cell: ranked[0]! } satisfies BlockerSpec, isFirst && index === 0);
  }
};

const placeGates = (context: BuildContext, state: BuildState, count: number, isFirst: boolean): void => {
  const { graph, start, goal } = context;
  const params = isFirst ? GATE_TIERS[0]! : resolveGateTierParams(context.gateTier);
  for (let index = 0; index < count; index += 1) {
    const route = bfsPath(graph, start, goal, state.avoid);
    if (route === null) {
      return;
    }
    const candidates = route
      .slice(1, -1)
      .filter((cell) => isFree(context, state, cell, isFirst && index === 0) && !graph.isJunction(cell));
    const ranked = rankByHash(context, 'timedGate', index, candidates);
    if (ranked.length === 0) {
      return;
    }
    const cell = ranked[0]!;
    const openFrom = mix32(context.seed, KIND_CODE.timedGate, index, context.salt, 0x70686173) % params.period;
    occupy(
      context,
      state,
      { kind: 'timedGate', cell, period: params.period, openFrom, openFor: params.openFor } satisfies TimedGateSpec,
      isFirst && index === 0
    );
  }
};

/** Straight in-bounds segments of `length` walkable cells, every start cell, right then down. */
const straightSegments = (graph: HazardGraph, length: number): HazardCellId[][] => {
  const segments: HazardCellId[][] = [];
  for (let y = 0; y < graph.height; y += 1) {
    for (let x = 0; x < graph.width; x += 1) {
      for (const [dx, dy] of [[1, 0], [0, 1]] as const) {
        const endX = x + dx * (length - 1);
        const endY = y + dy * (length - 1);
        if (endX >= graph.width || endY >= graph.height) {
          continue;
        }
        const cells: HazardCellId[] = [];
        for (let i = 0; i < length; i += 1) {
          cells.push(graph.cellId(x + dx * i, y + dy * i));
        }
        if (cells.every((cell) => graph.isWalkable(cell))) {
          segments.push(cells);
        }
      }
    }
  }
  return segments;
};

const placePatrols = (
  context: BuildContext,
  state: BuildState,
  count: number,
  isFirst: boolean,
  segments: readonly HazardCellId[][]
): void => {
  const { graph, start, goal } = context;
  const specsSoFar = (): HazardSpec[] => [...state.sequence];
  for (let index = 0; index < count; index += 1) {
    const first = isFirst && index === 0;
    const route = bfsPath(graph, start, goal, state.avoid);
    if (route === null) {
      return;
    }
    const onRoute = new Uint8Array(graph.cellCount);
    for (const cell of route) {
      onRoute[cell] = 1;
    }
    const usable = segments
      .map((segment, segmentIndex) => ({ segment, segmentIndex }))
      .filter(({ segment }) => segment.every((cell) => isFree(context, state, cell, first)))
      .filter(({ segment }) => {
        // Safe pocket: some segment cell has an off-segment, hazard-free neighbour to dodge into.
        const inside = new Set(segment);
        return segment.some((cell) => graph.neighbors(cell).some((neighbor) => (
          !inside.has(neighbor) && state.occupied[neighbor] !== 1 && state.avoid[neighbor] !== 1
        )));
      })
      .filter(({ segment }) => {
        if (!first) {
          return true;
        }
        const avoid = state.avoid.slice();
        for (const cell of segment) {
          avoid[cell] = 1;
        }
        return bfsPath(graph, start, goal, avoid) !== null;
      });
    const keyed = usable
      .map(({ segment, segmentIndex }) => ({
        segment,
        primary: segment.some((cell) => onRoute[cell] === 1) ? 0 : 1,
        hash: mix32(context.seed, KIND_CODE.patrol, index, context.salt, segmentIndex)
      }))
      .sort((left, right) => left.primary - right.primary || left.hash - right.hash);

    let accepted = false;
    for (const entry of keyed.slice(0, MAX_PATROL_TRIES)) {
      const flip = (entry.hash & 1) === 1;
      const routeCells = flip ? [...entry.segment].reverse() : entry.segment;
      const period = shuttlePeriod(routeCells.length);
      const phase = mix32(context.seed, KIND_CODE.patrol, index, context.salt, 0x70686173) % period;
      const spec: PatrolSpec = { kind: 'patrol', route: routeCells, period, phase };
      try {
        const timeline = createHazardTimeline(graph, [...specsSoFar(), spec]);
        if (!findWitnessRoute(graph, timeline, { start, goal }).solvable) {
          continue;
        }
      } catch (error) {
        if (error instanceof HazardSpecError) {
          continue;
        }
        throw error;
      }
      occupy(context, state, spec, first);
      accepted = true;
      break;
    }
    if (!accepted) {
      return;
    }
  }
};

interface Built {
  readonly sequence: readonly HazardSpec[];
  /** Index in `sequence` of the first-encounter hazard, or -1. */
  readonly firstIndex: number;
}

const build = (context: BuildContext): Built => {
  const { graph } = context;
  const state: BuildState = {
    sequence: [],
    avoid: new Uint8Array(graph.cellCount),
    occupied: new Uint8Array(graph.cellCount),
    halo: new Uint8Array(graph.cellCount),
    clearance: new Uint8Array(graph.cellCount)
  };
  const patrolSegments = context.target.patrols > 0
    ? straightSegments(graph, resolvePatrolRouteLength(context.firstKind === 'patrol' ? 0 : context.patrolTier))
    : [];
  const order: PlacementKind[] = context.firstKind === null
    ? [...KIND_ORDER]
    : [context.firstKind, ...KIND_ORDER.filter((kind) => kind !== context.firstKind)];
  let firstIndex = -1;
  for (const kind of order) {
    const count = countOf(context.target, kind);
    const isFirst = kind === context.firstKind;
    const before = state.sequence.length;
    if (kind === 'blocker') {
      placeBlockers(context, state, count, isFirst);
    } else if (kind === 'timedGate') {
      placeGates(context, state, count, isFirst);
    } else {
      placePatrols(context, state, count, isFirst, patrolSegments);
    }
    if (isFirst && state.sequence.length > before) {
      firstIndex = before;
    }
  }
  return { sequence: state.sequence, firstIndex };
};

const canonicalOrder = (sequence: readonly HazardSpec[]): HazardSpec[] => (
  KIND_ORDER.flatMap((kind) => sequence.filter((spec) => spec.kind === kind))
);

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

const clampTarget = (
  requested: KindCounts,
  firstKind: PlacementKind | null,
  capacity: number
): KindCounts => {
  let target = requested;
  // Only one new kind per level: every other flagged kind is dropped.
  if (firstKind !== null) {
    target = withCount(target, firstKind, Math.min(1, countOf(requested, firstKind)));
  }
  while (totalOf(target) > capacity) {
    // Reduce the kind with the largest count; ties drop the later (more complex) kind first.
    // The first-encounter hazard is dropped only when nothing else is left.
    const reducible = KIND_ORDER
      .filter((kind) => countOf(target, kind) > 0 && (kind !== firstKind || totalOf(target) === 1))
      .sort((left, right) => (
        countOf(target, right) - countOf(target, left) || KIND_ORDER.indexOf(right) - KIND_ORDER.indexOf(left)
      ));
    target = withCount(target, reducible[0]!, countOf(target, reducible[0]!) - 1);
  }
  return target;
};

export const placeLevelHazards = (
  graph: HazardGraph,
  options: PlaceLevelHazardsOptions
): HazardPlacementResult => {
  const { start, goal, seed, loadout } = options;
  const invulnerableTurns = options.invulnerableTurns ?? DEFAULT_INVULNERABLE_TURNS;
  for (const [label, value] of [
    ['blockers', loadout.blockers],
    ['timedGates', loadout.timedGates],
    ['patrols', loadout.patrols]
  ] as const) {
    if (!Number.isInteger(value) || value < 0) {
      throw new RangeError(`loadout.${label} must be a non-negative integer`);
    }
  }
  if (!Number.isInteger(seed)) {
    throw new RangeError('seed must be an integer');
  }

  const capacity = options.capacity ?? maxHazardsForMaze(graph, { start, goal });
  const requested: KindCounts = {
    blockers: loadout.blockers,
    timedGates: loadout.timedGates,
    patrols: loadout.patrols
  };
  const flags = loadout.firstEncounter ?? {};
  const firstKind: PlacementKind | null = (
    flags.blocker === true && requested.blockers > 0 ? 'blocker'
      : flags.timedGate === true && requested.timedGates > 0 ? 'timedGate'
        : flags.patrol === true && requested.patrols > 0 ? 'patrol'
          : null
  );
  let target = clampTarget(requested, firstKind, capacity);
  // A flagged-but-dropped first kind (capacity) no longer constrains the level.
  const activeFirst = firstKind !== null && countOf(target, firstKind) > 0 ? firstKind : null;
  // Flagged kinds other than the honoured one are new kinds: drop them.
  for (const kind of KIND_ORDER) {
    const flagged = kind === 'blocker' ? flags.blocker : kind === 'timedGate' ? flags.timedGate : flags.patrol;
    if (flagged === true && kind !== firstKind) {
      target = withCount(target, kind, 0);
    }
  }

  const empty = (): HazardPlacementResult => ({
    contract: HAZARD_PLACEMENT_CONTRACT,
    seed,
    specs: [],
    verdict: validateLevelHazards(graph, [], { start, goal, invulnerableTurns }),
    attempts: 1,
    requested,
    target,
    placed: { blockers: 0, timedGates: 0, patrols: 0 },
    capacity,
    capped: totalOf(requested) > capacity,
    degraded: totalOf(target) > 0,
    firstEncounter: firstKind === null ? null : { kind: firstKind, placed: false }
  });

  if (totalOf(target) === 0) {
    return { ...empty(), degraded: false };
  }

  const guarded = protectedCells(graph, start, goal);
  let attempts = 0;
  let firstBuilt: Built | null = null;
  const finish = (sequence: readonly HazardSpec[], screen: PlacementScreen, firstIndex: number): HazardPlacementResult => {
    const specs = canonicalOrder(sequence);
    const placed = countKinds(specs);
    return {
      contract: HAZARD_PLACEMENT_CONTRACT,
      seed,
      specs,
      verdict: screen.verdict,
      attempts,
      requested,
      target,
      placed,
      capacity,
      capped: totalOf(requested) > capacity,
      degraded: totalOf(placed) < totalOf(target),
      firstEncounter: firstKind === null ? null : { kind: firstKind, placed: firstIndex >= 0 }
    };
  };

  const screenOptions = (kind: PlacementKind | null): ScreenHazardPlacementOptions => ({
    start,
    goal,
    invulnerableTurns,
    capacity,
    firstEncounterKind: kind
  });

  for (let salt = 0; salt < MAX_PLACEMENT_ATTEMPTS; salt += 1) {
    const built = build({
      graph,
      start,
      goal,
      seed,
      salt,
      guarded,
      target,
      gateTier: loadout.gateTier ?? 0,
      patrolTier: loadout.patrolTier ?? 0,
      firstKind: activeFirst
    });
    firstBuilt ??= built;
    if (built.sequence.length === 0) {
      continue;
    }
    attempts += 1;
    const screen = screenHazardPlacement(
      graph,
      canonicalOrder(built.sequence),
      screenOptions(built.firstIndex >= 0 ? activeFirst : null)
    );
    if (screen.accepted) {
      return finish(built.sequence, screen, built.firstIndex);
    }
  }

  // Back-off: drop hazards from the end of the placement sequence until one passes.
  if (firstBuilt !== null && firstBuilt.sequence.length > 0) {
    const sequence = [...firstBuilt.sequence];
    let firstIndex = firstBuilt.firstIndex;
    while (sequence.length > 0) {
      sequence.pop();
      if (firstIndex >= sequence.length) {
        firstIndex = -1;
      }
      if (sequence.length === 0) {
        break;
      }
      attempts += 1;
      const screen = screenHazardPlacement(
        graph,
        canonicalOrder(sequence),
        screenOptions(firstIndex >= 0 ? activeFirst : null)
      );
      if (screen.accepted) {
        return finish(sequence, screen, firstIndex);
      }
    }
  }
  attempts += 1;
  return { ...empty(), attempts, degraded: true };
};
