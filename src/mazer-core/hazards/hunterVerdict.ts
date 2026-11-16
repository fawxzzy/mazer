/**
 * Hunter joint verdict and Hunter overlay (slice H5, pure core). Pure: no scene,
 * no randomness, no clock.
 *
 * The joint verdict is `validateLevelWithChasers` (one search over player state x
 * every Hunter state x the timeline) run at the H5 budget: state cap 200k for the
 * witness search and for each post-contact check, N = 2 invulnerable ticks (the
 * validator value; play uses 4), plus the joint escape slack with the A3 eject
 * (`measureHunterEscapeSlack`; the chaser fairness report does not model the
 * eject, so it would reject gate levels H2 already accepted). It folds the result
 * into one of three statuses:
 *   - `pass`: a joint witness exists and replays, every post-contact state is
 *     solvable, escape slack >= 0.9 and no fragile step in the first 10 steps;
 *   - `fail`: proven unfair or unsolvable (the reasons say which);
 *   - `unknown`: a search hit its cap or the period is too large. Contract rule:
 *     `unknown` is treated as a failure and the Hunter is degraded, with a reason.
 *
 * `computeHunterOverlay` adds the allocated Hunters on top of the H2 overlay's
 * gates and Sentries, one at a time, trying up to `maxDenAttempts` dens each; a
 * Hunter whose every den fails is dropped with a reason. The H2 overlay result
 * shape is not changed: this is a separate record the H5 wiring combines.
 */

import {
  createJunctionGreedyEnemy,
  stepJunctionGreedyEnemy,
  type JunctionGreedyEnemySpec,
  type JunctionGreedyEnemyState
} from './chaserEngine';
import {
  createChaserSearchSpace,
  replayChaserActions,
  type ChaserWitness
} from './chaserSolvability';
import { validateLevelWithChasers, type ChaserEscapeSlack, type ChaserLevelVerdict } from './chaserValidation';
import {
  createHazardTimeline,
  type HazardCellId,
  type HazardGraph,
  type HazardSpec,
  type HazardTimeline
} from './graphContract';
import {
  createHunterSpec,
  resolveHunterDenSeed,
  resolveHunterSpeedDivisor,
  selectHunterDen
} from './hunterEngine';
import { HAZARD_CAPS, HAZARD_FAIRNESS, type HazardAllocation } from './schedule';
import { stableStringify } from './serialization';

export const HUNTER_VERDICT_CONTRACT = 'mazer-hunter-verdict-v1' as const;
export const HUNTER_OVERLAY_CONTRACT = 'mazer-hunter-overlay-v1' as const;

/** H5 budget: state cap of the joint witness search and of each post-contact check. */
export const HUNTER_VERDICT_STATE_CAP = 200_000;
/** H5 budget: median wall time of one joint verdict (measured by scripts/analysis/hunter-bot-distributions.ts). */
export const HUNTER_VERDICT_MEDIAN_BUDGET_MS = 40;
/** Validator invulnerability (A2): the verdict checks at 2, play uses 4. */
export const HUNTER_VERDICT_INVULNERABLE_TURNS = 2;
/** Dens tried per Hunter before it is dropped. */
export const DEFAULT_HUNTER_DEN_ATTEMPTS = 3;

export type HunterVerdictStatus = 'pass' | 'fail' | 'unknown';

export type HunterVerdictReasonCode =
  | 'state-cap-exceeded'
  | 'period-too-large'
  | 'post-contact-unknown'
  | 'escape-slack-unknown'
  | 'unsolvable'
  | 'invalid-spec'
  | 'witness-not-replayed'
  | 'post-contact-failure'
  | 'escape-slack-low'
  | 'fragile-early-step';

export interface HunterVerdictReason {
  readonly code: HunterVerdictReasonCode;
  readonly detail: string;
}

export interface HunterJointVerdict {
  readonly contract: typeof HUNTER_VERDICT_CONTRACT;
  readonly status: HunterVerdictStatus;
  /** Empty when `status === 'pass'`. Unknown reasons come first. */
  readonly reasons: readonly HunterVerdictReason[];
  readonly stateCap: number;
  /** The joint witness (the demo replays it), or null. */
  readonly witness: ChaserWitness | null;
  /** Joint escape slack with the A3 eject, or null when there is no witness. */
  readonly escapeSlack: ChaserEscapeSlack | null;
  readonly chaser: ChaserLevelVerdict;
}

/**
 * Joint escape slack with the A3 eject. Over the witness states: the share from
 * which a one-tick hesitation (forced WAIT) still leaves a contact-free route to
 * the goal, with every Hunter moving. Unlike `analyzeChaserFairness`, a WAIT on a
 * cell whose gate closes at the next tick is not a loss: the player is ejected one
 * cell back along the witness (A3: no contact, no invulnerability) and the route
 * search continues from there, as H2's `measureEscapeSlack` does without Hunters.
 * A search that hits `stateCap` counts as unknown.
 */
export const measureHunterEscapeSlack = (
  graph: HazardGraph,
  timeline: HazardTimeline,
  enemies: readonly JunctionGreedyEnemyState[],
  witness: ChaserWitness,
  stateCap: number
): ChaserEscapeSlack => {
  const space = createChaserSearchSpace(graph, timeline, enemies.map((enemy) => enemy.spec));
  const replay = replayChaserActions(graph, timeline, enemies, {
    start: witness.start, startTick: witness.startTick, startHeading: witness.startHeading, actions: witness.actions
  });
  if (!replay.ok) {
    throw new RangeError(`witness does not replay: ${replay.reason ?? 'unknown'}`);
  }
  const blocked = (cell: HazardCellId, turn: number): boolean => timeline.blockedAt(cell, turn);
  // Witness states are solvable by construction (k = 0); successful searches add their paths.
  const known = new Map<number, number>();
  const remember = (key: number): void => {
    const rest = space.restKey(key);
    const k = space.invulnerabilityOf(key);
    const existing = known.get(rest);
    if (existing === undefined || k < existing) {
      known.set(rest, k);
    }
  };
  for (let i = 0; i <= witness.ticks; i += 1) {
    remember(space.encode({
      cell: witness.cells[i]!,
      heading: replay.playerHeadings[i]!,
      tick: witness.startTick + i,
      invulnerable: 0,
      enemies: replay.enemyStates[i]!
    }));
  }
  let survivable = 0;
  let unsurvivable = 0;
  let unknown = 0;
  let firstFragile: number | null = null;
  for (let index = 0; index < witness.ticks; index += 1) {
    const cell = witness.cells[index]!;
    const tick = witness.startTick + index;
    const heading = replay.playerHeadings[index]!;
    const before = replay.enemyStates[index]!;
    let after = -1;
    if (timeline.blockedAt(cell, tick + 1)) {
      // A3: the gate closes on the hesitating player; eject to the previous distinct witness cell.
      let landing = -1;
      for (let back = index - 1; back >= 0; back -= 1) {
        if (witness.cells[back] !== cell) {
          landing = witness.cells[back]!;
          break;
        }
      }
      if (landing >= 0 && !timeline.blockedAt(landing, tick + 1)) {
        const stepped = before.map((enemy) => stepJunctionGreedyEnemy(graph, enemy, { cell: landing, heading }, tick, { blocked }));
        const sentriesBefore = timeline.enemyCellsAt(tick);
        const sentriesAfter = timeline.enemyCellsAt(tick + 1);
        const swapped = stepped.some((enemy, e) => before[e]!.cell === landing && enemy.cell === cell)
          || sentriesAfter.some((next, e) => sentriesBefore[e] === landing && next === cell);
        const point = { cell: landing, heading, tick: tick + 1, invulnerable: 0, enemies: stepped };
        if (!swapped && space.entryProblem(point) === null) {
          after = space.encode(point);
        }
      }
    } else {
      after = space.step(space.encode({ cell, heading, tick, invulnerable: 0, enemies: before }), 'wait');
    }
    let survived = false;
    if (after >= 0) {
      const outcome = space.search(after, witness.goal, { stateCap, knownSolvable: known });
      if (outcome.status === 'capped') {
        unknown += 1;
        continue;
      }
      if (outcome.status === 'goal' || outcome.status === 'known') {
        outcome.path.forEach(remember);
        survived = true;
      }
    }
    if (survived) {
      survivable += 1;
    } else {
      unsurvivable += 1;
      firstFragile ??= index;
    }
  }
  const decided = survivable + unsurvivable;
  return {
    tested: decided + unknown,
    survivable,
    unsurvivable,
    unknown,
    ratio: decided === 0 ? null : Math.round((survivable / decided) * 10000) / 10000,
    firstFragileIndex: firstFragile
  };
};

export interface CheckHunterJointVerdictOptions {
  readonly start: HazardCellId;
  readonly goal: HazardCellId;
  readonly stateCap?: number;
  readonly levelId?: string | null;
}

export const checkHunterJointVerdict = (
  graph: HazardGraph,
  specs: readonly HazardSpec[],
  hunters: readonly JunctionGreedyEnemySpec[],
  options: CheckHunterJointVerdictOptions
): HunterJointVerdict => {
  const stateCap = options.stateCap ?? HUNTER_VERDICT_STATE_CAP;
  const chaser = validateLevelWithChasers(graph, specs, hunters, {
    start: options.start,
    goal: options.goal,
    levelId: options.levelId ?? null,
    invulnerableTurns: HUNTER_VERDICT_INVULNERABLE_TURNS,
    stateCap,
    postContactStateCap: stateCap,
    includeFairness: false
  });
  const unknown: HunterVerdictReason[] = [];
  const failed: HunterVerdictReason[] = [];
  const present = chaser.hazardsPresent;
  let escapeSlack: ChaserEscapeSlack | null = null;
  if (present.status === 'unknown') {
    const code = present.reason === 'period-too-large' ? 'period-too-large' : 'state-cap-exceeded';
    unknown.push({ code, detail: `joint witness search: ${present.reason ?? 'unknown'} after ${present.exploredStates} states` });
  } else if (present.status === 'unsolvable') {
    failed.push({ code: 'unsolvable', detail: `no joint witness: ${present.reason ?? 'unsolvable'}` });
  } else if (present.status === 'invalid') {
    failed.push({ code: 'invalid-spec', detail: present.reason ?? 'invalid hazard spec' });
  } else if (!present.replayVerified) {
    failed.push({ code: 'witness-not-replayed', detail: 'the joint witness did not re-verify' });
  }
  if (present.status === 'solvable') {
    const post = chaser.postContact;
    if (post.unknownCount > 0) {
      unknown.push({ code: 'post-contact-unknown', detail: `${post.unknownCount} post-contact check(s) hit the state cap` });
    }
    if (post.failureCount > 0) {
      failed.push({ code: 'post-contact-failure', detail: `${post.failureCount} post-contact state(s) have no route` });
    }
    escapeSlack = chaser.witness === null ? null : measureHunterEscapeSlack(
      graph,
      createHazardTimeline(graph, specs),
      hunters.map((spec) => createJunctionGreedyEnemy(spec, graph)),
      chaser.witness,
      stateCap
    );
    const slack = escapeSlack;
    if (slack !== null) {
      if (slack.unknown > 0) {
        unknown.push({ code: 'escape-slack-unknown', detail: `${slack.unknown} escape-slack check(s) hit the state cap` });
      }
      if (slack.ratio !== null && slack.ratio < HAZARD_FAIRNESS.escapeSlackRatioMin) {
        failed.push({ code: 'escape-slack-low', detail: `escape slack ${slack.ratio.toFixed(3)} < ${HAZARD_FAIRNESS.escapeSlackRatioMin}` });
      }
      if (slack.firstFragileIndex !== null && slack.firstFragileIndex < HAZARD_FAIRNESS.noFragileStepInFirstWitnessSteps) {
        failed.push({ code: 'fragile-early-step', detail: `fragile witness step ${slack.firstFragileIndex}` });
      }
    }
  }
  const status: HunterVerdictStatus = unknown.length > 0 ? 'unknown' : failed.length > 0 ? 'fail' : 'pass';
  return {
    contract: HUNTER_VERDICT_CONTRACT,
    status,
    reasons: [...unknown, ...failed],
    stateCap,
    witness: status === 'pass' ? chaser.witness : null,
    escapeSlack,
    chaser
  };
};

// ---------------------------------------------------------------------------
// Hunter overlay
// ---------------------------------------------------------------------------

export type HunterOverlayStatus = 'none' | 'full' | 'degraded';

export type HunterOverlayReasonCode = 'no-den' | 'verdict-failed' | 'verdict-unknown' | 'enemy-cap';

export interface HunterOverlayReason {
  readonly code: HunterOverlayReasonCode;
  /** Hunter index the reason is about. */
  readonly hunter: number;
  readonly detail: string;
}

export interface HunterOverlayResult {
  readonly contract: typeof HUNTER_OVERLAY_CONTRACT;
  readonly status: HunterOverlayStatus;
  /** Hunters the allocation asked for after the readability caps. */
  readonly requested: number;
  readonly tier: number;
  readonly speedDivisor: number | null;
  readonly dens: readonly HazardCellId[];
  readonly hunters: readonly JunctionGreedyEnemySpec[];
  /** Joint verdict of the shipped set (null when no Hunter ships). */
  readonly verdict: HunterJointVerdict | null;
  readonly degradeReasons: readonly HunterOverlayReason[];
  /** Joint verdicts run (cost metric). */
  readonly verdictRuns: number;
  /** FNV-1a over the canonical (seed, tier, dens, hunters, base specs) record. */
  readonly digest: string;
}

export interface ComputeHunterOverlayOptions {
  readonly start: HazardCellId;
  readonly goal: HazardCellId;
  /** The H2 hazard seed (`resolveHazardSeed`); the den stream is derived from it. */
  readonly hazardSeed: number;
  readonly allocation: Pick<HazardAllocation, 'hunters' | 'hunterTier' | 'sentries'>;
  /** Gates and Sentries the H2 overlay shipped. */
  readonly baseSpecs: readonly HazardSpec[];
  readonly stateCap?: number;
  readonly maxDenAttempts?: number;
}

const fnv1a = (text: string): string => {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
};

/** Cells a den may not use: gate cells and every Sentry route cell. */
export const hunterDenExclusions = (specs: readonly HazardSpec[]): Set<HazardCellId> => {
  const cells = new Set<HazardCellId>();
  for (const spec of specs) {
    if (spec.kind === 'patrol') {
      spec.route.forEach((cell) => cells.add(cell));
    } else {
      cells.add(spec.cell);
    }
  }
  return cells;
};

export const computeHunterOverlay = (graph: HazardGraph, options: ComputeHunterOverlayOptions): HunterOverlayResult => {
  const tier = options.allocation.hunterTier;
  const maxAttempts = options.maxDenAttempts ?? DEFAULT_HUNTER_DEN_ATTEMPTS;
  const sentries = options.baseSpecs.filter((spec) => spec.kind === 'patrol').length;
  const asked = Math.max(0, options.allocation.hunters);
  const requested = Math.min(asked, HAZARD_CAPS.hunters, Math.max(0, HAZARD_CAPS.enemiesTotal - sentries));
  const reasons: HunterOverlayReason[] = [];
  for (let index = requested; index < asked; index += 1) {
    reasons.push({ code: 'enemy-cap', hunter: index, detail: `readability caps: hunters <= ${HAZARD_CAPS.hunters}, enemies <= ${HAZARD_CAPS.enemiesTotal}` });
  }
  const seed = resolveHunterDenSeed(options.hazardSeed);
  const exclude = hunterDenExclusions(options.baseSpecs);
  const dens: HazardCellId[] = [];
  const hunters: JunctionGreedyEnemySpec[] = [];
  let verdict: HunterJointVerdict | null = null;
  let verdictRuns = 0;
  for (let index = 0; index < requested; index += 1) {
    let accepted = false;
    let lastReason: HunterOverlayReason | null = null;
    for (let attempt = 0; attempt < maxAttempts && !accepted; attempt += 1) {
      const den = selectHunterDen(graph, {
        start: options.start, goal: options.goal, seed, index, attempt, existingDens: dens, excludeCells: exclude
      });
      if (den === null) {
        lastReason = { code: 'no-den', hunter: index, detail: 'no cell satisfies the den rule' };
        break;
      }
      const spec = createHunterSpec(den, { tier });
      const candidate = checkHunterJointVerdict(graph, options.baseSpecs, [...hunters, spec], {
        start: options.start, goal: options.goal, stateCap: options.stateCap
      });
      verdictRuns += 1;
      if (candidate.status === 'pass') {
        dens.push(den);
        hunters.push(spec);
        verdict = candidate;
        accepted = true;
      } else {
        lastReason = {
          code: candidate.status === 'unknown' ? 'verdict-unknown' : 'verdict-failed',
          hunter: index,
          detail: `den ${den} attempt ${attempt}: ${candidate.reasons.map((reason) => reason.code).join(', ')}`
        };
      }
    }
    if (!accepted && lastReason !== null) {
      reasons.push(lastReason);
    }
  }
  const status: HunterOverlayStatus = requested === 0 && asked === 0
    ? 'none'
    : hunters.length === asked ? 'full' : 'degraded';
  const speedDivisor = hunters.length > 0 ? resolveHunterSpeedDivisor(tier) : null;
  reasons.sort((a, b) => a.hunter - b.hunter);
  return {
    contract: HUNTER_OVERLAY_CONTRACT,
    status,
    requested,
    tier,
    speedDivisor,
    dens,
    hunters,
    verdict,
    degradeReasons: reasons,
    verdictRuns,
    digest: fnv1a(stableStringify({ contract: HUNTER_OVERLAY_CONTRACT, seed: options.hazardSeed, tier, dens, hunters, baseSpecs: options.baseSpecs }))
  };
};
