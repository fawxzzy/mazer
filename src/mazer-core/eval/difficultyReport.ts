/**
 * DRAFT difficulty measurement and ladder-ceiling report (packet P7). Dormant and
 * pure. See docs/architecture/MAZER-DIFFICULTY-MONITOR-BOTS.md.
 *
 * Reports (never asserts) whether a sequence of levels gets harder:
 *   - `measureLevelDifficulty`: per-tier pass rate / turns / waits / contacts for
 *     the fallible bots plus the geometry proxy H1 and one combined index;
 *   - `checkMonotoneDifficulty`: violation rate of "non-decreasing within epsilon";
 *   - `detectIndexPlateau` / `computeLadderCeiling`: first level beyond which the
 *     index stops increasing.
 */

import {
  createHazardGraph,
  createHazardTimeline,
  HAZARD_MOVE_ORDER,
  type HazardCellId,
  type HazardGraph,
  type HazardGraphInput,
  type HazardSpec
} from '../hazards/graphContract';
import { botLabel, botTier, isDeterministicBot, runBot, type BotKind, type BotSpec } from './bots';

export const DIFFICULTY_REPORT_CONTRACT = 'mazer-difficulty-report-draft-v0' as const;

export interface DifficultyLevelSpec {
  readonly levelId?: string;
  /** Maze structure: a built graph or the structural input (`LegacyMazeSnapshot` satisfies it). */
  readonly graph: HazardGraphInput | HazardGraph;
  readonly start: HazardCellId;
  readonly goal: HazardCellId;
  readonly hazards: readonly HazardSpec[];
  /** Turn budget per run; default `max(80, 8 * routeLength + 80)`. */
  readonly maxTurns?: number;
}

/** Geometry proxy from the P2 design: H1 = turns + len/4 + 3*splits + 2*max(0, dead-2) + 6*wraps. */
export interface GeometryProxy {
  /** Steps on the static shortest route (hazards ignored). */
  readonly len: number;
  /** Direction changes along that route (wrap-aware). */
  readonly turns: number;
  /** Junction cells (3+ neighbours) on that route; approximation of the P2 `splitCount`. */
  readonly splits: number;
  /** Dead-end cells in the whole maze, start and goal included (hence the `dead - 2` offset). */
  readonly dead: number;
  /** Wrap edges traversed by that route. */
  readonly wraps: number;
  readonly h1: number;
}

export const computeH1 = (parts: Omit<GeometryProxy, 'h1'>): number => (
  parts.turns + parts.len / 4 + 3 * parts.splits + 2 * Math.max(0, parts.dead - 2) + 6 * parts.wraps
);

const toGraph = (input: HazardGraphInput | HazardGraph): HazardGraph => (
  'contract' in input ? input : createHazardGraph(input)
);

/** Static shortest route (BFS in neighbour tie-break order), or null when unreachable. */
const staticRoute = (graph: HazardGraph, start: HazardCellId, goal: HazardCellId): HazardCellId[] | null => {
  if (!graph.isWalkable(start) || !graph.isWalkable(goal)) {
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
      if (previous[next] === -2) {
        previous[next] = current;
        queue[tail++] = next;
      }
    }
  }
  if (previous[goal] === -2) {
    return null;
  }
  const route: HazardCellId[] = [];
  for (let cursor = goal; cursor !== -1; cursor = previous[cursor]!) {
    route.push(cursor);
  }
  return route.reverse();
};

export const measureGeometry = (
  input: HazardGraphInput | HazardGraph,
  start: HazardCellId,
  goal: HazardCellId
): GeometryProxy | null => {
  const graph = toGraph(input);
  const route = staticRoute(graph, start, goal);
  if (route === null) {
    return null;
  }
  let turns = 0;
  let wraps = 0;
  let splits = 0;
  let previousDirection = -1;
  for (let i = 0; i < route.length; i += 1) {
    const cell = route[i]!;
    if (graph.isJunction(cell)) {
      splits += 1;
    }
    if (i === 0) {
      continue;
    }
    const from = route[i - 1]!;
    const manhattan = Math.abs(graph.cellX(cell) - graph.cellX(from)) + Math.abs(graph.cellY(cell) - graph.cellY(from));
    if (manhattan !== 1) {
      wraps += 1;
    }
    const direction = HAZARD_MOVE_ORDER.findIndex((candidate) => graph.moveTarget(from, candidate) === cell);
    if (previousDirection >= 0 && direction !== previousDirection) {
      turns += 1;
    }
    previousDirection = direction;
  }
  let dead = 0;
  for (let cell = 0; cell < graph.cellCount; cell += 1) {
    if (graph.isDeadEnd(cell)) {
      dead += 1;
    }
  }
  const parts = { len: route.length - 1, turns, splits, dead, wraps };
  return { ...parts, h1: computeH1(parts) };
};

export interface TierMeasurement {
  readonly label: string;
  readonly kind: BotKind;
  readonly tier: number;
  readonly runs: number;
  readonly passRate: number;
  /** Mean turns over all runs (failed runs count their full budget). */
  readonly meanTurns: number;
  readonly meanTurnsWhenReached: number | null;
  readonly meanWaits: number;
  readonly meanContacts: number;
  readonly meanMistakes: number;
  /** Mean over runs of each run's minimum enemy distance; null without enemies. */
  readonly meanMinEnemyDistance: number | null;
}

export interface DifficultyWeights {
  /** Added index per mean contact, per fallible tier (averaged over fallible tiers). */
  readonly contact: number;
  readonly wait: number;
  /** Added index per unit of (1 - pass rate). */
  readonly fail: number;
  /** Added index per turn above the static route length. */
  readonly effort: number;
  /** Added index per wait on the oracle witness (timing the level forces). */
  readonly oracleWait: number;
}

/** Draft weights (invented, not tuned). */
export const DEFAULT_DIFFICULTY_WEIGHTS: DifficultyWeights = {
  contact: 8,
  wait: 1.5,
  fail: 40,
  effort: 0.25,
  oracleWait: 1.5
};

export interface LevelDifficultyMeasurement {
  readonly contract: typeof DIFFICULTY_REPORT_CONTRACT;
  readonly levelId: string | null;
  readonly maxTurns: number;
  /** False when the oracle cannot finish within the budget (index is then null). */
  readonly solvable: boolean;
  readonly geometry: GeometryProxy | null;
  readonly oracleTicks: number | null;
  readonly oracleWaits: number | null;
  readonly tiers: readonly TierMeasurement[];
  /** Combined difficulty index, null when unsolvable. */
  readonly index: number | null;
}

export interface MeasureOptions {
  readonly weights?: DifficultyWeights;
  readonly indexKinds?: readonly BotKind[];
  readonly invulnerableTurns?: number;
}

const mean = (values: readonly number[]): number => (
  values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length
);

/**
 * Tiers that feed the combined index. The myopic floor is reported but excluded by
 * default: its outcome is chaotic per maze (it can dead-end anywhere) and would
 * swamp the signal.
 */
export const DEFAULT_INDEX_KINDS: readonly BotKind[] = ['planner-limited', 'planner-noisy'];

export const combineDifficultyIndex = (
  geometry: GeometryProxy,
  oracleWaits: number,
  tiers: readonly TierMeasurement[],
  weights: DifficultyWeights = DEFAULT_DIFFICULTY_WEIGHTS,
  indexKinds: readonly BotKind[] = DEFAULT_INDEX_KINDS
): number => {
  const fallible = tiers.filter((tier) => indexKinds.includes(tier.kind));
  const load = fallible.length === 0
    ? 0
    : mean(fallible.map((tier) => (
      weights.contact * tier.meanContacts
      + weights.wait * tier.meanWaits
      + weights.fail * (1 - tier.passRate)
      + weights.effort * Math.max(0, tier.meanTurns - geometry.len)
    )));
  return geometry.h1 + load + weights.oracleWait * oracleWaits;
};

export const defaultMaxTurns = (routeLength: number): number => Math.max(80, 8 * routeLength + 80);

export const measureLevelDifficulty = (
  level: DifficultyLevelSpec,
  bots: readonly BotSpec[],
  seeds: readonly number[],
  options: MeasureOptions = {}
): LevelDifficultyMeasurement => {
  if (seeds.length === 0) {
    throw new RangeError('measureLevelDifficulty needs at least one seed');
  }
  const graph = toGraph(level.graph);
  const timeline = createHazardTimeline(graph, level.hazards);
  const geometry = measureGeometry(graph, level.start, level.goal);
  const maxTurns = level.maxTurns ?? defaultMaxTurns(geometry?.len ?? graph.walkableCellCount);

  const tiers: TierMeasurement[] = [];
  let oracleTicks: number | null = null;
  let oracleWaits: number | null = null;
  for (const bot of bots) {
    // Bots with no random draw are deterministic: one run, whatever the seed list.
    const runSeeds = isDeterministicBot(bot) ? [seeds[0]!] : seeds;
    const runs = runSeeds.map((seed) => runBot(bot, graph, timeline, {
      start: level.start,
      goal: level.goal,
      maxTurns,
      seed,
      invulnerableTurns: options.invulnerableTurns
    }));
    if (bot.kind === 'oracle') {
      oracleTicks = runs[0]!.reached ? runs[0]!.turns : null;
      oracleWaits = runs[0]!.reached ? runs[0]!.waits : null;
    }
    const reached = runs.filter((run) => run.reached);
    const distances = runs.map((run) => run.minEnemyDistance).filter((value): value is number => value !== null);
    tiers.push({
      label: botLabel(bot),
      kind: bot.kind,
      tier: botTier(bot),
      runs: runs.length,
      passRate: reached.length / runs.length,
      meanTurns: mean(runs.map((run) => (run.reached ? run.turns : maxTurns))),
      meanTurnsWhenReached: reached.length === 0 ? null : mean(reached.map((run) => run.turns)),
      meanWaits: mean(runs.map((run) => run.waits)),
      meanContacts: mean(runs.map((run) => run.contacts)),
      meanMistakes: mean(runs.map((run) => run.mistakes)),
      meanMinEnemyDistance: distances.length === 0 ? null : mean(distances)
    });
  }

  const solvable = geometry !== null && oracleTicks !== null;
  return {
    contract: DIFFICULTY_REPORT_CONTRACT,
    levelId: level.levelId ?? null,
    maxTurns,
    solvable,
    geometry,
    oracleTicks,
    oracleWaits,
    tiers,
    index: solvable
      ? combineDifficultyIndex(geometry!, oracleWaits ?? 0, tiers, options.weights, options.indexKinds)
      : null
  };
};

// ---------------------------------------------------------------------------
// Monotonicity
// ---------------------------------------------------------------------------

export type IndexLike = number | { readonly index: number | null };

const valueOf = (entry: IndexLike): number => {
  const value = typeof entry === 'number' ? entry : entry.index;
  if (value === null || !Number.isFinite(value)) {
    throw new RangeError('difficulty sequence contains a non-finite or unsolvable entry');
  }
  return value;
};

export interface MonotoneViolation {
  /** Position of the earlier entry in the input sequence. */
  readonly position: number;
  readonly drop: number;
}

export interface MonotoneDifficultyReport {
  readonly epsilon: number;
  readonly pairs: number;
  readonly violationCount: number;
  /** Violations / pairs (0 for fewer than two entries). Reported, never asserted. */
  readonly violationRate: number;
  readonly worstDrop: number;
  readonly violations: readonly MonotoneViolation[];
  readonly monotone: boolean;
}

/** Adjacent pairs where `next < previous - epsilon` are violations. */
export const checkMonotoneDifficulty = (
  sequence: readonly IndexLike[],
  options: { readonly epsilon?: number } = {}
): MonotoneDifficultyReport => {
  const epsilon = options.epsilon ?? 0;
  if (!(epsilon >= 0)) {
    throw new RangeError('epsilon must be non-negative');
  }
  const values = sequence.map(valueOf);
  const violations: MonotoneViolation[] = [];
  let worstDrop = 0;
  for (let i = 0; i + 1 < values.length; i += 1) {
    const drop = values[i]! - values[i + 1]!;
    if (drop > epsilon) {
      violations.push({ position: i, drop });
    }
    worstDrop = Math.max(worstDrop, drop);
  }
  const pairs = Math.max(0, values.length - 1);
  return {
    epsilon,
    pairs,
    violationCount: violations.length,
    violationRate: pairs === 0 ? 0 : violations.length / pairs,
    worstDrop,
    violations,
    monotone: violations.length === 0
  };
};

// ---------------------------------------------------------------------------
// Plateau / ladder ceiling
// ---------------------------------------------------------------------------

export interface PlateauOptions {
  /**
   * A new entry only counts as "still increasing" when it exceeds the best value
   * so far (the record) by MORE than this much.
   */
  readonly tolerance: number;
  /** The plateau must span at least this many entries after the last record. */
  readonly minRun: number;
  /** Centered moving-mean span applied first (default 1 = none); damps per-level noise. */
  readonly smoothSpan?: number;
}

export interface PlateauResult {
  /** Position in the sequence of the last record (where the index stopped increasing), or null when none. */
  readonly position: number | null;
  readonly plateauValue: number | null;
  /** Entries after the last record. */
  readonly runLength: number;
}

const smooth = (values: readonly number[], span: number): number[] => {
  if (span <= 1) {
    return values.slice();
  }
  const half = Math.floor(span / 2);
  return values.map((_, i) => {
    const from = Math.max(0, i - half);
    const to = Math.min(values.length - 1, i + half);
    let sum = 0;
    for (let j = from; j <= to; j += 1) {
      sum += values[j]!;
    }
    return sum / (to - from + 1);
  });
};

/**
 * Record-based plateau: walk the (smoothed) sequence keeping the best value so
 * far; an entry that beats it by more than `tolerance` becomes the new record.
 * The index has plateaued when at least `minRun` entries follow the last record.
 * The reported position is that last record (the ceiling level).
 */
export const detectIndexPlateau = (
  sequence: readonly IndexLike[],
  options: PlateauOptions
): PlateauResult => {
  if (!(options.tolerance >= 0) || !Number.isInteger(options.minRun) || options.minRun < 1) {
    throw new RangeError('plateau needs tolerance >= 0 and an integer minRun >= 1');
  }
  const span = options.smoothSpan ?? 1;
  if (!Number.isInteger(span) || span < 1) {
    throw new RangeError('smoothSpan must be a positive integer');
  }
  const values = smooth(sequence.map(valueOf), span);
  if (values.length === 0) {
    return { position: null, plateauValue: null, runLength: 0 };
  }
  let recordValue = values[0]!;
  let recordPosition = 0;
  for (let i = 1; i < values.length; i += 1) {
    if (values[i]! > recordValue + options.tolerance) {
      recordValue = values[i]!;
      recordPosition = i;
    }
  }
  const runLength = values.length - 1 - recordPosition;
  return runLength >= options.minRun
    ? { position: recordPosition, plateauValue: recordValue, runLength }
    : { position: null, plateauValue: null, runLength };
};

export interface LadderCeilingOptions extends PlateauOptions {
  readonly firstLevel: number;
  readonly lastLevel: number;
  readonly bots: readonly BotSpec[];
  readonly seeds: readonly number[];
  readonly weights?: DifficultyWeights;
  readonly indexKinds?: readonly BotKind[];
  readonly invulnerableTurns?: number;
}

export interface LadderCeilingReport {
  readonly firstLevel: number;
  readonly lastLevel: number;
  /** First level whose index no longer rises (start of the plateau), or null when none within the range. */
  readonly ceilingLevel: number | null;
  readonly ceilingIndex: number | null;
  readonly levels: readonly number[];
  readonly measurements: readonly LevelDifficultyMeasurement[];
  readonly unsolvableLevels: readonly number[];
}

/**
 * `levelAt(level)` supplies each level's maze and hazards. Unsolvable levels are
 * listed and excluded from the index sequence (they are a generator bug, not a
 * difficulty datum).
 */
export const computeLadderCeiling = (
  levelAt: (level: number) => DifficultyLevelSpec,
  options: LadderCeilingOptions
): LadderCeilingReport => {
  if (!Number.isInteger(options.firstLevel) || !Number.isInteger(options.lastLevel) || options.lastLevel < options.firstLevel) {
    throw new RangeError('computeLadderCeiling needs integer firstLevel <= lastLevel');
  }
  const levels: number[] = [];
  const measurements: LevelDifficultyMeasurement[] = [];
  const unsolvableLevels: number[] = [];
  for (let level = options.firstLevel; level <= options.lastLevel; level += 1) {
    const measurement = measureLevelDifficulty(levelAt(level), options.bots, options.seeds, {
      weights: options.weights,
      indexKinds: options.indexKinds,
      invulnerableTurns: options.invulnerableTurns
    });
    if (measurement.index === null) {
      unsolvableLevels.push(level);
      continue;
    }
    levels.push(level);
    measurements.push(measurement);
  }
  const plateau = detectIndexPlateau(measurements, options);
  return {
    firstLevel: options.firstLevel,
    lastLevel: options.lastLevel,
    ceilingLevel: plateau.position === null ? null : levels[plateau.position]!,
    ceilingIndex: plateau.plateauValue,
    levels,
    measurements,
    unsolvableLevels
  };
};
