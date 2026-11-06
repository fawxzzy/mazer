import { describe, expect, test } from 'vitest';
import { createHazardTimeline } from '../../../src/mazer-core/hazards/graphContract';
import { createJunctionGreedyEnemy } from '../../../src/mazer-core/hazards/chaserEngine';
import { findWitnessRouteWithChasers } from '../../../src/mazer-core/hazards/chaserSolvability';
import {
  CHASER_FAIRNESS_CONTRACT,
  CHASER_VERDICT_CONTRACT,
  analyzeChaserFairness,
  serializeChaserVerdict,
  validateLevelWithChasers
} from '../../../src/mazer-core/hazards/chaserValidation';
import { chaserAt, chaserFixture } from './chaserFixtures';

const sideLoop = chaserFixture([
  '###########',
  '#..#####..#',
  '#.S.C...G.#',
  '#..#####..#',
  '###########'
]);
const ring = chaserFixture([
  '#########',
  '#.......#',
  '#.#####.#',
  '#S#####C#',
  '#.#####.#',
  '#...G...#',
  '#########'
]);

describe('validateLevelWithChasers', () => {
  test('a circle-the-ring level passes all three verdicts', () => {
    const verdict = validateLevelWithChasers(ring.graph, ring.blockers, [chaserAt(ring, 'C', 'chaser')], {
      start: ring.start, goal: ring.goal, levelId: 'ring'
    });
    expect(verdict.contract).toBe(CHASER_VERDICT_CONTRACT);
    expect(verdict.hazards).toEqual({
      blockers: 0, timedGates: 0, patrols: 0, chasers: 1, interceptors: 0, wallFollowers: 0
    });
    expect(verdict.hazardsPresent).toMatchObject({
      pass: true, status: 'solvable', ticks: 6, waits: 1, replayVerified: true
    });
    expect(verdict.itemsAbsent).toEqual({ pass: true, basis: 'by-construction' });
    expect(verdict.postContact).toMatchObject({ pass: true, skipped: false, failureCount: 0, unknownCount: 0 });
    expect(verdict.postContact.checkedStates).toBe(5);
    expect(verdict.pass).toBe(true);
    expect(verdict.witness?.actions).toEqual(['wait', 'down', 'down', 'right', 'right', 'right']);
  });

  test('the dead-end spur trap is reported unsolvable and the later checks are skipped', () => {
    const f = chaserFixture([
      '#########',
      '#S..C...#',
      '###.#####',
      '###.#####',
      '###G#####'
    ]);
    const verdict = validateLevelWithChasers(f.graph, [], [chaserAt(f, 'C', 'chaser')], { start: f.start, goal: f.goal });
    expect(verdict.pass).toBe(false);
    expect(verdict.hazardsPresent).toMatchObject({ pass: false, status: 'unsolvable', reason: 'no-route' });
    expect(verdict.postContact).toMatchObject({ pass: false, skipped: true });
    expect(verdict.witness).toBeNull();
  });

  test('a post-contact failure is reported when the pushback state cannot finish', () => {
    const f = chaserFixture([
      '########',
      '#.#...##',
      '#.G.C###',
      '##....S#',
      '########'
    ]);
    const verdict = validateLevelWithChasers(f.graph, [], [chaserAt(f, 'C', 'chaser')], {
      start: f.start, goal: f.goal, invulnerableTurns: 0
    });
    expect(verdict.hazardsPresent.pass).toBe(true);
    expect(verdict.postContact.pass).toBe(false);
    expect(verdict.postContact.failureCount).toBeGreaterThan(0);
    expect(verdict.postContact.failures[0]).toMatchObject({ witnessIndex: 1, reason: 'no-route-after-contact' });
    expect(verdict.pass).toBe(false);
  });

  test('invalid specs produce a failing verdict instead of throwing', () => {
    const f = chaserFixture(['#####', '#S.G#', '#####']);
    const wall = validateLevelWithChasers(f.graph, [], [{ rule: 'chaser', spawnCell: 0 }], { start: f.start, goal: f.goal });
    expect(wall.specError?.code).toBe('invalid-chaser');
    expect(wall.pass).toBe(false);
    const gate = validateLevelWithChasers(
      f.graph, [{ kind: 'timedGate', cell: 0, period: 2, openFrom: 0, openFor: 1 }], [], { start: f.start, goal: f.goal }
    );
    expect(gate.specError?.code).toBe('cell-not-walkable');
    expect(gate.hazardsPresent.status).toBe('invalid');
  });

  test('a state cap yields an unknown verdict, never a pass', () => {
    const verdict = validateLevelWithChasers(sideLoop.graph, [], [chaserAt(sideLoop, 'C', 'chaser')], {
      start: sideLoop.start, goal: sideLoop.goal, stateCap: 3, postContactStateCap: 3
    });
    expect(verdict.hazardsPresent).toMatchObject({ pass: false, status: 'unknown', reason: 'state-cap-exceeded' });
    expect(verdict.pass).toBe(false);
  });

  test('a post-contact check that hits its cap is unknown and blocks the pass', () => {
    const verdict = validateLevelWithChasers(ring.graph, [], [chaserAt(ring, 'C', 'chaser')], {
      start: ring.start, goal: ring.goal, postContactStateCap: 1
    });
    expect(verdict.hazardsPresent.pass).toBe(true);
    expect(verdict.postContact.unknownCount).toBeGreaterThan(0);
    expect(verdict.postContact.failures.some((failure) => failure.reason === 'state-cap-exceeded')).toBe(true);
    expect(verdict.postContact.pass).toBe(false);
    expect(verdict.pass).toBe(false);
  });

  test('verdict JSON is byte-identical across runs; a stride checks fewer states', () => {
    const run = () => serializeChaserVerdict(validateLevelWithChasers(
      sideLoop.graph, sideLoop.blockers, [chaserAt(sideLoop, 'C', 'interceptor', { graceTurns: 1 })],
      { start: sideLoop.start, goal: sideLoop.goal, levelId: 'side-loop', includeFairness: true }
    ));
    const first = run();
    expect(run()).toBe(first);
    expect(first).toContain('"contract":"mazer-chaser-verdict-draft-v0"');
    const full = validateLevelWithChasers(
      sideLoop.graph, [], [chaserAt(sideLoop, 'C', 'chaser')], { start: sideLoop.start, goal: sideLoop.goal }
    );
    const strided = validateLevelWithChasers(
      sideLoop.graph, [], [chaserAt(sideLoop, 'C', 'chaser')],
      { start: sideLoop.start, goal: sideLoop.goal, postContactStride: 3 }
    );
    expect(strided.postContact.checkedStates).toBeLessThan(full.postContact.checkedStates);
  });

  test('combines with P3 gates in one verdict', () => {
    const verdict = validateLevelWithChasers(
      sideLoop.graph,
      [{ kind: 'timedGate', cell: sideLoop.at(9, 2), period: 3, openFrom: 0, openFor: 2 }],
      [chaserAt(sideLoop, 'C', 'chaser', { graceTurns: 2 })],
      { start: sideLoop.start, goal: sideLoop.goal }
    );
    expect(verdict.period).toBe(3);
    expect(verdict.hazards.timedGates).toBe(1);
    if (verdict.hazardsPresent.status === 'solvable') {
      expect(verdict.hazardsPresent.replayVerified).toBe(true);
    }
  });
});

describe('analyzeChaserFairness', () => {
  const analyze = (f: ReturnType<typeof chaserFixture>, rule: 'chaser' | 'interceptor' = 'chaser') => {
    const timeline = createHazardTimeline(f.graph, f.blockers);
    const enemies = [createJunctionGreedyEnemy(chaserAt(f, 'C', rule), f.graph)];
    const result = findWitnessRouteWithChasers(f.graph, timeline, enemies, { start: f.start, goal: f.goal });
    if (result.status !== 'solvable') {
      throw new Error('fixture must be solvable');
    }
    return { report: analyzeChaserFairness(f.graph, timeline, enemies, result.witness), witness: result.witness };
  };

  test('a trailing chaser is never closer than where it started', () => {
    const f = chaserFixture(['#########', '#C..S..G#', '#########']);
    const { report } = analyze(f);
    expect(report.contract).toBe(CHASER_FAIRNESS_CONTRACT);
    expect(report.waits).toBe(0);
    expect(report.minDistanceSteps).toBe(3);
    expect(report.minDistanceTurns).toBe(3);
    expect(report.enemies[0]).toMatchObject({ rule: 'chaser', presentStates: 4, minDistanceSteps: 3, atWitnessIndex: 0 });
    // Hesitating once in the open corridor costs a step of lead but is survivable everywhere.
    expect(report.escapeSlack).toMatchObject({ tested: 3, survivable: 3, unsurvivable: 0, ratio: 1, firstFragileIndex: null });
  });

  test('a tight pass has slack below 1 and names the first fragile step', () => {
    const { report, witness } = analyze(sideLoop);
    expect(report.waits).toBe(witness.waits);
    expect(report.minDistanceSteps).toBeLessThanOrEqual(2);
    expect(report.escapeSlack.tested).toBe(witness.ticks);
    expect(report.escapeSlack.ratio).toBeLessThan(1);
    expect(report.escapeSlack.firstFragileIndex).not.toBeNull();
  });

  test('a slower chaser reports its distance in turns', () => {
    const f = chaserFixture(['#########', '#C..S..G#', '#########']);
    const timeline = f.timeline();
    const enemies = [createJunctionGreedyEnemy(chaserAt(f, 'C', 'chaser', { speedDivisor: 2 }), f.graph)];
    const result = findWitnessRouteWithChasers(f.graph, timeline, enemies, { start: f.start, goal: f.goal });
    expect(result.status).toBe('solvable');
    if (result.status === 'solvable') {
      const report = analyzeChaserFairness(f.graph, timeline, enemies, result.witness);
      expect(report.minDistanceTurns).toBe(report.minDistanceSteps! * 2);
    }
  });

  test('enemies that never spawn during the witness have no distance', () => {
    const f = chaserFixture(['#########', '#S..C..G#', '#########']);
    const timeline = f.timeline();
    const enemies = [createJunctionGreedyEnemy(chaserAt(f, 'C', 'chaser', { spawnDelayTurns: 50 }), f.graph)];
    const result = findWitnessRouteWithChasers(f.graph, timeline, enemies, { start: f.start, goal: f.goal });
    expect(result.status).toBe('solvable');
    if (result.status === 'solvable') {
      const report = analyzeChaserFairness(f.graph, timeline, enemies, result.witness);
      expect(report.minDistanceSteps).toBeNull();
      expect(report.enemies[0]).toMatchObject({ presentStates: 0, minDistanceSteps: null });
    }
  });

  test('refuses an invulnerable witness', () => {
    const f = chaserFixture(['#########', '#C..S..G#', '#########']);
    const timeline = f.timeline();
    const enemies = [createJunctionGreedyEnemy(chaserAt(f, 'C', 'chaser'), f.graph)];
    const result = findWitnessRouteWithChasers(f.graph, timeline, enemies, { start: f.start, goal: f.goal, invulnerableTurns: 1 });
    expect(result.status).toBe('solvable');
    if (result.status === 'solvable') {
      expect(() => analyzeChaserFairness(f.graph, timeline, enemies, result.witness)).toThrow(RangeError);
    }
  });
});
