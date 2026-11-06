/**
 * DRAFT level-level hazard validation (packet P3). Dormant and pure.
 *
 * Verdicts (docs/architecture/MAZER-HAZARD-GRAPH-CONTRACT.md):
 *   (a) hazardsPresent  - a witness route exists with every hazard active.
 *   (b) itemsAbsent     - items are not modeled anywhere in this graph contract, so
 *                         every verdict is by construction an items-absent verdict.
 *   (c) postContact     - after a contact on ANY state of the witness route, the
 *                         pushback state is still solvable.
 *   (d) chokepoints     - report which hazards sit on mandatory (separator) cells.
 */

import {
  HazardSpecError,
  createHazardGraph,
  createHazardTimeline,
  findSeparatorCells,
  type HazardCellId,
  type HazardGraph,
  type HazardGraphInput,
  type HazardSpec,
  type HazardSpecErrorCode
} from './graphContract';
import { stableStringify } from './serialization';
import {
  computeSolvableStates,
  createHazardStateSpace,
  findWitnessRoute,
  type HazardWitness
} from './solvability';

export const HAZARD_VERDICT_CONTRACT = 'mazer-hazard-verdict-draft-v0' as const;
export const DEFAULT_INVULNERABLE_TURNS = 2;
const MAX_REPORTED_FAILURES = 16;

export type PostContactFailureReason =
  | 'pushback-cell-blocked'
  | 'pushback-cell-contact'
  | 'no-route-after-contact';

export interface PostContactFailure {
  /** Index into `witness.cells` where the contact is assumed to happen. */
  readonly witnessIndex: number;
  readonly contactCell: HazardCellId;
  readonly pushbackCell: HazardCellId;
  /** Absolute tick of both the contact and the pushback placement. */
  readonly tick: number;
  readonly reason: PostContactFailureReason;
}

export interface ChokepointHost {
  /** Index into the spec array. */
  readonly hazardIndex: number;
  readonly kind: HazardSpec['kind'];
  /** Mandatory cells this hazard occupies (gate cell, or the patrol route cells that are mandatory). */
  readonly cells: readonly HazardCellId[];
}

export interface LevelHazardVerdict {
  readonly contract: typeof HAZARD_VERDICT_CONTRACT;
  readonly levelId: string | null;
  readonly width: number;
  readonly height: number;
  readonly start: HazardCellId;
  readonly goal: HazardCellId;
  readonly period: number | null;
  readonly hazards: { readonly blockers: number; readonly timedGates: number; readonly patrols: number };
  readonly invulnerableTurns: number;
  readonly specError: { readonly code: HazardSpecErrorCode; readonly index: number | null; readonly message: string } | null;
  readonly hazardsPresent: {
    readonly pass: boolean;
    readonly reason: string | null;
    readonly ticks: number | null;
    readonly waits: number | null;
  };
  readonly itemsAbsent: { readonly pass: true; readonly basis: 'by-construction' };
  readonly postContact: {
    readonly pass: boolean;
    /** True when the check could not run because (a) failed. */
    readonly skipped: boolean;
    readonly checkedStates: number;
    readonly failureCount: number;
    /** First failures only, capped. */
    readonly failures: readonly PostContactFailure[];
  };
  readonly chokepoints: {
    readonly mandatoryCells: readonly HazardCellId[];
    readonly hostedHazards: readonly ChokepointHost[];
    readonly hostedCount: number;
  };
  readonly pass: boolean;
  readonly witness: HazardWitness | null;
}

export interface ValidateLevelHazardsOptions {
  readonly start: HazardCellId;
  readonly goal: HazardCellId;
  readonly levelId?: string | null;
  /** Contact-free turns granted after a pushback (default 2). */
  readonly invulnerableTurns?: number;
  readonly maxPeriod?: number;
  /**
   * When true, a gate or patrol on a mandatory cell fails the level (the
   * retired-design "alternate route" rule). Default false: report only.
   */
  readonly rejectChokepointHazards?: boolean;
}

/**
 * Pushback model (DRAFT default): the nearest junction strictly behind the player
 * along the route (scanning from `index - 1` back to 0), else the route start.
 */
export const resolvePushbackCell = (
  graph: HazardGraph,
  routeCells: readonly HazardCellId[],
  index: number
): HazardCellId => {
  for (let i = index - 1; i >= 0; i -= 1) {
    if (graph.isJunction(routeCells[i]!)) {
      return routeCells[i]!;
    }
  }
  return routeCells[0]!;
};

const countKinds = (specs: readonly HazardSpec[]): LevelHazardVerdict['hazards'] => ({
  blockers: specs.filter((spec) => spec.kind === 'blocker').length,
  timedGates: specs.filter((spec) => spec.kind === 'timedGate').length,
  patrols: specs.filter((spec) => spec.kind === 'patrol').length
});

export const validateLevelHazards = (
  input: HazardGraphInput | HazardGraph,
  specs: readonly HazardSpec[],
  options: ValidateLevelHazardsOptions
): LevelHazardVerdict => {
  const graph = 'contract' in input ? input : createHazardGraph(input);
  const invulnerableTurns = options.invulnerableTurns ?? DEFAULT_INVULNERABLE_TURNS;
  if (!Number.isInteger(invulnerableTurns) || invulnerableTurns < 0) {
    throw new RangeError('invulnerableTurns must be a non-negative integer');
  }
  const base = {
    contract: HAZARD_VERDICT_CONTRACT,
    levelId: options.levelId ?? null,
    width: graph.width,
    height: graph.height,
    start: options.start,
    goal: options.goal,
    hazards: countKinds(specs),
    invulnerableTurns,
    itemsAbsent: { pass: true, basis: 'by-construction' } as const
  };
  const skippedPostContact = {
    pass: false,
    skipped: true,
    checkedStates: 0,
    failureCount: 0,
    failures: [] as PostContactFailure[]
  };
  const noChokepoints = { mandatoryCells: [] as HazardCellId[], hostedHazards: [] as ChokepointHost[], hostedCount: 0 };

  let timeline;
  try {
    timeline = createHazardTimeline(graph, specs, { maxPeriod: options.maxPeriod });
  } catch (error) {
    if (!(error instanceof HazardSpecError)) {
      throw error;
    }
    return {
      ...base,
      period: null,
      specError: { code: error.code, index: error.index, message: error.message },
      hazardsPresent: { pass: false, reason: `invalid-spec:${error.code}`, ticks: null, waits: null },
      postContact: skippedPostContact,
      chokepoints: noChokepoints,
      pass: false,
      witness: null
    };
  }

  const mandatory = findSeparatorCells(graph, options.start, options.goal, new Set(timeline.blockerCells));
  const mandatorySet = new Set(mandatory);
  const hostedHazards: ChokepointHost[] = [];
  specs.forEach((spec, hazardIndex) => {
    if (spec.kind === 'blocker') {
      return;
    }
    const cells = spec.kind === 'timedGate' ? [spec.cell] : [...new Set(spec.route)].sort((l, r) => l - r);
    const onChokepoint = cells.filter((cell) => mandatorySet.has(cell));
    if (onChokepoint.length > 0) {
      hostedHazards.push({ hazardIndex, kind: spec.kind, cells: onChokepoint });
    }
  });
  const chokepoints = { mandatoryCells: mandatory, hostedHazards, hostedCount: hostedHazards.length };
  const chokepointRejected = options.rejectChokepointHazards === true && hostedHazards.length > 0;

  const result = findWitnessRoute(graph, timeline, { start: options.start, goal: options.goal });
  if (!result.solvable) {
    return {
      ...base,
      period: timeline.period,
      specError: null,
      hazardsPresent: { pass: false, reason: result.reason, ticks: null, waits: null },
      postContact: skippedPostContact,
      chokepoints,
      pass: false,
      witness: null
    };
  }

  const witness = result.witness;
  const space = createHazardStateSpace(graph, timeline, invulnerableTurns);
  const solvable = computeSolvableStates(space, options.goal);
  const failures: PostContactFailure[] = [];
  let failureCount = 0;
  let checkedStates = 0;
  for (let index = 1; index < witness.ticks; index += 1) {
    checkedStates += 1;
    const contactCell = witness.cells[index]!;
    const pushbackCell = resolvePushbackCell(graph, witness.cells, index);
    const tick = witness.startTick + index;
    const tickMod = tick % timeline.period;
    let reason: PostContactFailureReason | null = null;
    const problem = space.entryProblem(pushbackCell, tickMod, invulnerableTurns);
    if (problem === 'blocked') {
      reason = 'pushback-cell-blocked';
    } else if (problem === 'contact') {
      reason = 'pushback-cell-contact';
    } else if (solvable[space.stateIndex(pushbackCell, tickMod, invulnerableTurns)] !== 1) {
      reason = 'no-route-after-contact';
    }
    if (reason !== null) {
      failureCount += 1;
      if (failures.length < MAX_REPORTED_FAILURES) {
        failures.push({ witnessIndex: index, contactCell, pushbackCell, tick, reason });
      }
    }
  }

  const postContactPass = failureCount === 0;
  return {
    ...base,
    period: timeline.period,
    specError: null,
    hazardsPresent: { pass: true, reason: null, ticks: witness.ticks, waits: witness.waits },
    postContact: { pass: postContactPass, skipped: false, checkedStates, failureCount, failures },
    chokepoints,
    pass: postContactPass && !chokepointRejected,
    witness
  };
};

/** Canonical JSON for a verdict record (sorted keys, no trailing newline). */
export const serializeLevelVerdict = (verdict: LevelHazardVerdict): string => stableStringify(verdict);
