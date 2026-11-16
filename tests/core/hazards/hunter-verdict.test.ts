import { describe, expect, it } from 'vitest';
import {
  HUNTER_INPUT_LOG_CONTRACT,
  HUNTER_VERDICT_STATE_CAP,
  checkHunterJointVerdict,
  computeHunterOverlay,
  createHunterRunContext,
  createHunterSpec,
  measureHunterEscapeSlack,
  replayHunterRun,
  resolveHunterDenSeed,
  selectHunterDen
} from '../../../src/mazer-core/hazards';
import { analyzeChaserFairness } from '../../../src/mazer-core/hazards/chaserValidation';
import { findWitnessRouteWithChasers } from '../../../src/mazer-core/hazards/chaserSolvability';
import { createHazardTimeline, type HazardAction, type HazardSpec } from '../../../src/mazer-core/hazards/graphContract';
import { chaserFixture, type ChaserAsciiFixture } from './chaserFixtures';
import { refShortestSolve, type RefSpec } from './chaserReference';

const WINDING = [
  '#############',
  '#S..........#',
  '#.#########.#',
  '#.#.......#.#',
  '#.#.#####.#.#',
  '#...#...#...#',
  '###.#.#.#.###',
  '#.....#.....#',
  '#.###.#.###.#',
  '#...#...#..G#',
  '#############'
];

const pointOf = (f: ChaserAsciiFixture, cell: number) => ({ x: cell % f.width, y: Math.floor(cell / f.width) });
const NO_ALLOCATION = { hunters: 0, hunterTier: 0, sentries: 0 };

describe('Hunter joint verdict (player + Hunters)', () => {
  it('passes a winding board with one tier-0 Hunter, and its witness replays clean in the run engine', () => {
    const f = chaserFixture(WINDING);
    const den = selectHunterDen(f.graph, { start: f.start, goal: f.goal, seed: resolveHunterDenSeed(1), index: 0, attempt: 0 })!;
    const hunters = [createHunterSpec(den)];
    const verdict = checkHunterJointVerdict(f.graph, [], hunters, { start: f.start, goal: f.goal });
    expect(verdict.status).toBe('pass');
    expect(verdict.reasons).toEqual([]);
    expect(verdict.stateCap).toBe(HUNTER_VERDICT_STATE_CAP);
    const witness = verdict.witness!;
    // Independent oracle: the witness is a shortest contact-free route.
    const refSpecs: RefSpec[] = [{ rule: 'chaser', spawn: pointOf(f, den), lookahead: 0, initialFacing: null, delay: 0, grace: 0, divisor: 3 }];
    const shortest = refShortestSolve({ grid: f.grid, width: f.width, height: f.height }, refSpecs, {
      start: pointOf(f, f.start), goal: pointOf(f, f.goal), maxTicks: 200
    });
    expect(witness.ticks).toBe(shortest);
    const context = createHunterRunContext({ graph: f.graph, specs: [], hunters, start: f.start, goal: f.goal });
    const run = replayHunterRun(context, { contract: HUNTER_INPUT_LOG_CONTRACT, actions: witness.actions as readonly HazardAction[] });
    expect(run).toMatchObject({ reachedGoal: true, ticks: witness.ticks, contacts: 0, clean: true });
  });

  it('reports unknown (not fail) when the state cap is too small, and the overlay degrades with a reason', () => {
    const f = chaserFixture(WINDING);
    const den = selectHunterDen(f.graph, { start: f.start, goal: f.goal, seed: resolveHunterDenSeed(1), index: 0, attempt: 0 })!;
    const verdict = checkHunterJointVerdict(f.graph, [], [createHunterSpec(den)], { start: f.start, goal: f.goal, stateCap: 3 });
    expect(verdict.status).toBe('unknown');
    expect(verdict.reasons[0]!.code).toBe('state-cap-exceeded');
    expect(verdict.witness).toBeNull();
    const overlay = computeHunterOverlay(f.graph, {
      start: f.start, goal: f.goal, hazardSeed: 1, allocation: { hunters: 1, hunterTier: 0, sentries: 0 }, baseSpecs: [], stateCap: 3
    });
    expect(overlay.status).toBe('degraded');
    expect(overlay.hunters).toEqual([]);
    expect(overlay.speedDivisor).toBeNull();
    expect(overlay.degradeReasons.map((reason) => reason.code)).toEqual(['verdict-unknown']);
    expect(overlay.verdictRuns).toBe(3);
  });

  it('fails a corridor where a fast Hunter blocks the only way', () => {
    const f = chaserFixture(['###########', '#S.......G#', '###########']);
    const verdict = checkHunterJointVerdict(f.graph, [], [{ rule: 'chaser', spawnCell: f.at(6, 1), speedDivisor: 2 }], { start: f.start, goal: f.goal });
    expect(verdict.status).toBe('fail');
    expect(verdict.reasons.map((reason) => reason.code)).toContain('unsolvable');
    expect(verdict.witness).toBeNull();
  });

  it('rejects an invalid Hunter spec as fail with invalid-spec', () => {
    const f = chaserFixture(WINDING);
    const verdict = checkHunterJointVerdict(f.graph, [], [{ rule: 'chaser', spawnCell: 0, speedDivisor: 3 }], { start: f.start, goal: f.goal });
    expect(verdict.status).toBe('fail');
    expect(verdict.reasons.map((reason) => reason.code)).toEqual(['invalid-spec']);
  });
});

describe('Hunter overlay', () => {
  it('is none with no Hunters allocated and runs no verdict', () => {
    const f = chaserFixture(WINDING);
    const overlay = computeHunterOverlay(f.graph, { start: f.start, goal: f.goal, hazardSeed: 9, allocation: NO_ALLOCATION, baseSpecs: [] });
    expect(overlay).toMatchObject({ status: 'none', requested: 0, dens: [], hunters: [], verdict: null, verdictRuns: 0, degradeReasons: [] });
  });

  it('is deterministic and caps Hunters at the readability limit with an enemy-cap reason', () => {
    const f = chaserFixture(WINDING);
    const options = { start: f.start, goal: f.goal, hazardSeed: 77, allocation: { hunters: 3, hunterTier: 1, sentries: 0 }, baseSpecs: [] as HazardSpec[] };
    const a = computeHunterOverlay(f.graph, options);
    const b = computeHunterOverlay(f.graph, options);
    expect(b).toEqual(a);
    expect(a.requested).toBe(2);
    expect(a.status).toBe('degraded');
    expect(a.degradeReasons.filter((reason) => reason.code === 'enemy-cap').map((reason) => reason.hunter)).toEqual([2]);
    for (const spec of a.hunters) {
      expect(spec.speedDivisor).toBe(2);
    }
    if (a.hunters.length > 0) {
      expect(a.verdict!.status).toBe('pass');
      expect(checkHunterJointVerdict(f.graph, [], a.hunters, { start: f.start, goal: f.goal }).status).toBe('pass');
    }
    const other = computeHunterOverlay(f.graph, { ...options, hazardSeed: 78 });
    expect(other.digest === a.digest).toBe(JSON.stringify(other.dens) === JSON.stringify(a.dens));
  });
});

describe('A3-aware escape slack', () => {
  it('counts a hesitation on a closing gate as survivable (eject), where the chaser fairness counts it lost', () => {
    const f = chaserFixture(['###########', '#S.......G#', '###########']);
    const gate: HazardSpec = { kind: 'timedGate', cell: f.at(4, 1), period: 2, openFrom: 1, openFor: 1 };
    const timeline = createHazardTimeline(f.graph, [gate]);
    const found = findWitnessRouteWithChasers(f.graph, timeline, [], { start: f.start, goal: f.goal });
    expect(found.status).toBe('solvable');
    if (found.status !== 'solvable') {
      return;
    }
    const witness = found.witness;
    const gateIndex = witness.cells.indexOf(f.at(4, 1));
    expect(gateIndex).toBeGreaterThan(0);
    expect(timeline.blockedAt(f.at(4, 1), witness.startTick + gateIndex + 1)).toBe(true);
    const slack = measureHunterEscapeSlack(f.graph, timeline, [], witness, 10_000);
    expect(slack.unsurvivable).toBe(0);
    expect(slack.unknown).toBe(0);
    expect(slack.ratio).toBe(1);
    const fairness = analyzeChaserFairness(f.graph, timeline, [], witness, { stateCap: 10_000 });
    expect(fairness.escapeSlack.unsurvivable).toBeGreaterThanOrEqual(1);
    expect(fairness.escapeSlack.firstFragileIndex).toBe(gateIndex);
  });
});
