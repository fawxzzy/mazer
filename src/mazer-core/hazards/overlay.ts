/**
 * Hazard generation overlay (slice H2). Pure: no scene, no randomness, no clock.
 *
 * Runs AFTER maze generation. It reads a finished maze (as a hazard graph plus
 * start/goal) and returns a hazard placement, or nothing. It never changes a
 * cell, the route, the felt number or an opening: the maze is only read.
 *
 *   1. allocate:  `allocateHazardUnits` (schedule.ts) on manifest v1 + caps;
 *   2. place:     `placeLevelHazards` with no blockers (amendment A5, manifest
 *                 `tail.blockersRemoved`) and Sentries kept off mandatory cells
 *                 (amendment A6);
 *   3. validate:  the graph-contract verdict at N = 2 invulnerable turns (a pass
 *                 at 2 implies a pass at play's 4: more invulnerability is never
 *                 worse), the A6 chokepoint rule, no blocker, plus the phone
 *                 forgiveness gate: escape slack ratio >= 0.9 and no fragile step
 *                 in the first 10 witness steps;
 *   4. degrade:   a failing level drops one hazard at a time (nearest the first
 *                 fragile step first) until it passes, and records why. An empty
 *                 placement always passes, so a level is never shipped unsolvable.
 *
 * Hunters (H5) and Shards (H8) are allocated but not placed here; they are
 * reported in `deferred`. Hazards use their own seed stream (`mix32` of the maze
 * seed, the level and the schedule version), so the geometry is untouched.
 */

import {
  createHazardTimeline,
  type HazardCellId,
  type HazardGraph,
  type HazardSpec
} from './graphContract';
import { mix32, placeLevelHazards, type KindCounts } from './placement';
import {
  HAZARD_FAIRNESS,
  HAZARD_SCHEDULE_VERSION,
  allocateHazardUnits,
  type HazardAllocation
} from './schedule';
import { stableStringify } from './serialization';
import { createHazardStateSpace, createSolvableQuery, type HazardWitness } from './solvability';
import { DEFAULT_INVULNERABLE_TURNS, validateLevelHazards, type LevelHazardVerdict } from './validation';

export const HAZARD_OVERLAY_CONTRACT = 'mazer-hazard-overlay-v1' as const;

/** Salt of the hazard seed stream ("HAZD"), so it never collides with geometry seeds. */
export const HAZARD_SEED_STREAM = 0x48415a44;

export const resolveHazardSeed = (mazeSeed: number, level: number): number => (
  mix32(mazeSeed, level, HAZARD_SCHEDULE_VERSION, HAZARD_SEED_STREAM)
);

export interface HazardEscapeSlack {
  /** Witness states tested: "if the player hesitated (WAIT) here, can they still finish contact-free?" */
  readonly tested: number;
  readonly survivable: number;
  /** The forced WAIT is a contact, or the state after it cannot reach the goal. */
  readonly unsurvivable: number;
  /** Always 0: the timeline search is exact (kept for parity with chaser escape slack). */
  readonly unknown: number;
  /** `survivable / (tested - unknown)`, rounded to 4 places; null when nothing was tested. */
  readonly ratio: number | null;
  readonly firstFragileIndex: number | null;
}

/**
 * Escape slack for timeline hazards (gates and patrols), the same definition as
 * `analyzeChaserFairness`: at every witness state force one WAIT. If a gate
 * closes on the player the player is ejected to the previous distinct trail cell
 * with no contact (product contract 2.3); the eject cell must be free at that
 * tick. A contact on the WAIT is unsurvivable. Otherwise the state after the WAIT
 * (or eject) must still reach the goal with no invulnerability.
 */
export const measureEscapeSlack = (
  graph: HazardGraph,
  specs: readonly HazardSpec[],
  witness: HazardWitness
): HazardEscapeSlack => {
  const timeline = createHazardTimeline(graph, specs);
  const space = createHazardStateSpace(graph, timeline, 0);
  const solvable = createSolvableQuery(graph, space, witness.goal);
  const period = timeline.period;
  let survivable = 0;
  let unsurvivable = 0;
  let firstFragile: number | null = null;
  for (let index = 0; index < witness.ticks; index += 1) {
    const cell = witness.cells[index]!;
    const nextMod = (witness.startTick + index + 1) % period;
    let landing: HazardCellId | null = cell;
    const problem = space.entryProblem(cell, nextMod, 0);
    if (problem === 'contact') {
      landing = null;
    } else if (problem === 'blocked') {
      landing = null;
      for (let back = index - 1; back >= 0; back -= 1) {
        if (witness.cells[back] !== cell) {
          landing = witness.cells[back]!;
          break;
        }
      }
      if (landing !== null && space.entryProblem(landing, nextMod, 0) !== null) {
        landing = null;
      }
    }
    if (landing !== null && solvable.isSolvable(landing, nextMod, 0)) {
      survivable += 1;
    } else {
      unsurvivable += 1;
      firstFragile ??= index;
    }
  }
  const tested = survivable + unsurvivable;
  return {
    tested,
    survivable,
    unsurvivable,
    unknown: 0,
    ratio: tested === 0 ? null : Math.round((survivable / tested) * 10000) / 10000,
    firstFragileIndex: firstFragile
  };
};

export type HazardOverlayReasonCode =
  | 'capacity'
  | 'placement-short'
  | 'first-encounter-not-placed'
  | 'validator-failed'
  | 'patrol-on-chokepoint'
  | 'blocker-present'
  | 'escape-slack-low'
  | 'fragile-early-step';

export interface HazardOverlayReason {
  readonly code: HazardOverlayReasonCode;
  readonly detail: string;
}

export interface HazardOverlayDeferral {
  readonly unit: 'hunter' | 'shard';
  readonly count: number;
  /** Roadmap slice that places it. */
  readonly slice: 'H5' | 'H8';
}

export type HazardOverlayStatus =
  /** The allocation asks for nothing placeable (levels below the intro, for example). */
  | 'none'
  /** Every allocated gate and Sentry was placed and passed. */
  | 'full'
  /** Fewer than allocated were shipped; `degradeReasons` says why. */
  | 'degraded';

export interface HazardFairnessCheck {
  readonly pass: boolean;
  readonly reasons: readonly HazardOverlayReason[];
  readonly verdict: LevelHazardVerdict;
  readonly escapeSlack: HazardEscapeSlack | null;
}

export interface HazardOverlayResult {
  readonly contract: typeof HAZARD_OVERLAY_CONTRACT;
  readonly scheduleVersion: number;
  readonly level: number;
  readonly exposureStage: number;
  /** Hazard stream seed (derived from the maze seed). */
  readonly seed: number;
  readonly allocation: HazardAllocation;
  readonly status: HazardOverlayStatus;
  readonly specs: readonly HazardSpec[];
  /** Graph-contract verdict for `specs` (holds the witness), or null when no hazard was asked for. */
  readonly verdict: LevelHazardVerdict | null;
  readonly escapeSlack: HazardEscapeSlack | null;
  readonly deferred: readonly HazardOverlayDeferral[];
  readonly degradeReasons: readonly HazardOverlayReason[];
  readonly placement: {
    readonly capacity: number;
    readonly requested: KindCounts;
    readonly placed: KindCounts;
    readonly attempts: number;
    /** Hazards removed by the fairness degrade loop. */
    readonly dropped: number;
  } | null;
  /** FNV-1a of the canonical (scheduleVersion, level, exposureStage, seed, specs) record. */
  readonly digest: string;
}

export interface ComputeHazardOverlayOptions {
  readonly start: HazardCellId;
  readonly goal: HazardCellId;
  /** The finished maze's seed; the hazard stream is derived from it. */
  readonly mazeSeed: number;
  readonly level: number;
  /** Geometry saturation level (passed in so this module stays runtime-agnostic). */
  readonly saturationLevel: number;
  /** Player exposure stage; undefined = new player (stage equals the schedule). */
  readonly exposureStage?: number;
}

const fnv1a = (text: string): string => {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
};

export const computeHazardDigest = (record: {
  readonly scheduleVersion: number;
  readonly level: number;
  readonly exposureStage: number;
  readonly seed: number;
  readonly specs: readonly HazardSpec[];
}): string => fnv1a(stableStringify({
  scheduleVersion: record.scheduleVersion,
  level: record.level,
  exposureStage: record.exposureStage,
  seed: record.seed,
  specs: record.specs
}));

/** The acceptance gate for one candidate placement. */
export const checkHazardFairness = (
  graph: HazardGraph,
  specs: readonly HazardSpec[],
  options: { readonly start: HazardCellId; readonly goal: HazardCellId; readonly verdict?: LevelHazardVerdict }
): HazardFairnessCheck => {
  const verdict = options.verdict ?? validateLevelHazards(graph, specs, {
    start: options.start,
    goal: options.goal,
    invulnerableTurns: DEFAULT_INVULNERABLE_TURNS
  });
  const reasons: HazardOverlayReason[] = [];
  if (specs.some((spec) => spec.kind === 'blocker')) {
    reasons.push({ code: 'blocker-present', detail: 'static blockers are removed from the menu (A5)' });
  }
  const patrolHosts = verdict.chokepoints.hostedHazards.filter((host) => host.kind === 'patrol');
  if (patrolHosts.length > 0) {
    reasons.push({ code: 'patrol-on-chokepoint', detail: `${patrolHosts.length} Sentry route(s) cover a mandatory cell (A6)` });
  }
  if (!verdict.pass || verdict.witness === null) {
    const why = verdict.hazardsPresent.pass ? `post-contact failures ${verdict.postContact.failureCount}` : String(verdict.hazardsPresent.reason);
    reasons.push({ code: 'validator-failed', detail: why });
    return { pass: false, reasons, verdict, escapeSlack: null };
  }
  const escapeSlack = measureEscapeSlack(graph, specs, verdict.witness);
  if (escapeSlack.ratio === null || escapeSlack.ratio < HAZARD_FAIRNESS.escapeSlackRatioMin) {
    reasons.push({ code: 'escape-slack-low', detail: `ratio ${String(escapeSlack.ratio)} < ${HAZARD_FAIRNESS.escapeSlackRatioMin}` });
  }
  if (escapeSlack.firstFragileIndex !== null
    && escapeSlack.firstFragileIndex < HAZARD_FAIRNESS.noFragileStepInFirstWitnessSteps) {
    reasons.push({ code: 'fragile-early-step', detail: `fragile witness step ${escapeSlack.firstFragileIndex}` });
  }
  return { pass: reasons.length === 0, reasons, verdict, escapeSlack };
};

const specCells = (spec: HazardSpec): readonly HazardCellId[] => (spec.kind === 'patrol' ? spec.route : [spec.cell]);

/** Index of the spec to drop: nearest (graph steps) to the first fragile witness cell, else the last one. */
const pickDrop = (graph: HazardGraph, specs: readonly HazardSpec[], check: HazardFairnessCheck): number => {
  const fragile = check.escapeSlack?.firstFragileIndex ?? null;
  const witness = check.verdict.witness;
  if (fragile === null || witness === null) {
    return specs.length - 1;
  }
  const distance = new Int32Array(graph.cellCount).fill(-1);
  const queue = new Int32Array(graph.cellCount);
  let head = 0;
  let tail = 0;
  const source = witness.cells[fragile]!;
  distance[source] = 0;
  queue[tail++] = source;
  while (head < tail) {
    const current = queue[head++]!;
    for (const next of graph.neighbors(current)) {
      if (distance[next] === -1) {
        distance[next] = distance[current]! + 1;
        queue[tail++] = next;
      }
    }
  }
  let best = specs.length - 1;
  let bestDistance = Number.POSITIVE_INFINITY;
  specs.forEach((spec, index) => {
    for (const cell of specCells(spec)) {
      const d = distance[cell]! < 0 ? Number.POSITIVE_INFINITY : distance[cell]!;
      // `<=` so ties drop the later (more recently scheduled) hazard.
      if (d <= bestDistance) {
        bestDistance = d;
        best = index;
      }
    }
  });
  return best;
};

export const computeHazardOverlay = (graph: HazardGraph, options: ComputeHazardOverlayOptions): HazardOverlayResult => {
  const { start, goal, level } = options;
  if (!Number.isInteger(options.mazeSeed)) {
    throw new RangeError('mazeSeed must be an integer');
  }
  const allocation = allocateHazardUnits(level, {
    saturationLevel: options.saturationLevel,
    exposureStage: options.exposureStage
  });
  const seed = resolveHazardSeed(options.mazeSeed, level);
  const deferred: HazardOverlayDeferral[] = [];
  if (allocation.hunters > 0) deferred.push({ unit: 'hunter', count: allocation.hunters, slice: 'H5' });
  if (allocation.shards > 0) deferred.push({ unit: 'shard', count: allocation.shards, slice: 'H8' });
  const base = {
    contract: HAZARD_OVERLAY_CONTRACT,
    scheduleVersion: HAZARD_SCHEDULE_VERSION,
    level,
    exposureStage: allocation.exposureStage,
    seed,
    allocation,
    deferred
  };
  const digestOf = (specs: readonly HazardSpec[]): string => computeHazardDigest({ ...base, specs });

  if (allocation.gates + allocation.sentries === 0) {
    return {
      ...base,
      status: 'none',
      specs: [],
      verdict: null,
      escapeSlack: null,
      degradeReasons: [],
      placement: null,
      digest: digestOf([])
    };
  }

  const placement = placeLevelHazards(graph, {
    start,
    goal,
    seed,
    loadout: {
      blockers: 0,
      timedGates: allocation.gates,
      patrols: allocation.sentries,
      gateTier: allocation.gateTier,
      patrolTier: allocation.sentryTier,
      firstEncounter: {
        timedGate: allocation.firstEncounter === 'pulseGate',
        patrol: allocation.firstEncounter === 'sentry'
      }
    },
    patrolsAvoidChokepoints: true
  });
  const reasons: HazardOverlayReason[] = [];
  if (placement.capped) {
    reasons.push({
      code: 'capacity',
      detail: `maze capacity ${placement.capacity} < allocated ${allocation.gates + allocation.sentries}`
    });
  }
  for (const [kind, label] of [['timedGates', 'gate'], ['patrols', 'sentry']] as const) {
    if (placement.placed[kind] < placement.target[kind]) {
      reasons.push({ code: 'placement-short', detail: `${label} ${placement.placed[kind]}/${placement.target[kind]}` });
    }
  }
  if (placement.firstEncounter !== null && !placement.firstEncounter.placed) {
    reasons.push({ code: 'first-encounter-not-placed', detail: placement.firstEncounter.kind });
  }

  const specs = [...placement.specs];
  let check = checkHazardFairness(graph, specs, { start, goal, verdict: placement.verdict });
  let dropped = 0;
  // An empty placement always passes on a valid maze; the length guard only bounds a malformed input.
  while (!check.pass && specs.length > 0) {
    reasons.push(...check.reasons);
    specs.splice(pickDrop(graph, specs, check), 1);
    dropped += 1;
    check = checkHazardFairness(graph, specs, { start, goal });
  }
  if (!check.pass) {
    reasons.push(...check.reasons);
  }
  const full = reasons.length === 0 && specs.length === allocation.gates + allocation.sentries;
  return {
    ...base,
    status: full ? 'full' : 'degraded',
    specs,
    verdict: check.verdict,
    escapeSlack: check.escapeSlack,
    degradeReasons: reasons,
    placement: {
      capacity: placement.capacity,
      requested: placement.requested,
      placed: placement.placed,
      attempts: placement.attempts,
      dropped
    },
    digest: digestOf(specs)
  };
};
