import { describe, expect, test } from 'vitest';
import {
  DEFAULT_INVULNERABLE_TURNS,
  HAZARD_VERDICT_CONTRACT,
  createHazardTimeline,
  resolvePushbackCell,
  serializeLevelVerdict,
  validateLevelHazards,
  verifyWitness,
  type HazardSpec
} from '../../../src/mazer-core/hazards';
import { asciiFixture } from './fixtures';

const pocketCorridor = () => asciiFixture([
  '#########',
  '#S.....G#',
  '####.####',
  '#########'
]);

// Start corridor swept by a patroller, with a gate-guarded loop to the goal.
const trapLayout = () => asciiFixture([
  '#######',
  '#S.#.G#',
  '#.###.#',
  '#.....#',
  '#######'
]);

const trapSpecs = (f: ReturnType<typeof trapLayout>): HazardSpec[] => [
  { kind: 'timedGate', cell: f.at(2, 3), period: 4, openFrom: 2, openFor: 2 },
  { kind: 'timedGate', cell: f.at(5, 3), period: 4, openFrom: 1, openFor: 2 },
  { kind: 'patrol', route: [f.at(2, 1), f.at(1, 1), f.at(1, 2), f.at(1, 3)], period: 6 }
];

describe('validateLevelHazards', () => {
  test('a fair patrol-and-pocket level passes all verdicts and reports its chokepoint host', () => {
    const f = pocketCorridor();
    const patrol: HazardSpec = { kind: 'patrol', route: [2, 3, 4, 5, 6].map((x) => f.at(x, 1)), period: 8 };
    const verdict = validateLevelHazards(f.graph, [patrol], { start: f.start, goal: f.goal, levelId: 'pocket' });
    expect(verdict.contract).toBe(HAZARD_VERDICT_CONTRACT);
    expect(verdict.levelId).toBe('pocket');
    expect(verdict.invulnerableTurns).toBe(DEFAULT_INVULNERABLE_TURNS);
    expect(verdict.hazardsPresent).toEqual({ pass: true, reason: null, ticks: 10, waits: 0 });
    expect(verdict.itemsAbsent).toEqual({ pass: true, basis: 'by-construction' });
    expect(verdict.postContact).toMatchObject({ pass: true, skipped: false, checkedStates: 9, failureCount: 0 });
    expect(verdict.chokepoints.mandatoryCells).toEqual([2, 3, 4, 5, 6].map((x) => f.at(x, 1)));
    expect(verdict.chokepoints.hostedCount).toBe(1);
    expect(verdict.chokepoints.hostedHazards[0]).toMatchObject({ hazardIndex: 0, kind: 'patrol' });
    expect(verdict.pass).toBe(true);
    expect(verdict.witness).not.toBeNull();

    const strict = validateLevelHazards(f.graph, [patrol], {
      start: f.start,
      goal: f.goal,
      rejectChokepointHazards: true
    });
    expect(strict.pass).toBe(false);
    expect(strict.postContact.pass).toBe(true);
  });

  test('a level that is solvable but strands the player after contact fails verdict (c)', () => {
    const f = trapLayout();
    const verdict = validateLevelHazards(f.graph, trapSpecs(f), { start: f.start, goal: f.goal });
    expect(verdict.hazardsPresent.pass).toBe(true);
    expect(verdict.postContact.pass).toBe(false);
    expect(verdict.postContact.failureCount).toBeGreaterThan(0);
    expect(verdict.postContact.failures[0]).toMatchObject({
      witnessIndex: 5,
      pushbackCell: f.start,
      reason: 'no-route-after-contact'
    });
    expect(verdict.pass).toBe(false);
    expect(verdict.witness).not.toBeNull();
  });

  test('with no invulnerability the same level also fails on re-contact at the pushback cell', () => {
    const f = trapLayout();
    const verdict = validateLevelHazards(f.graph, trapSpecs(f), {
      start: f.start,
      goal: f.goal,
      invulnerableTurns: 0
    });
    expect(verdict.postContact.pass).toBe(false);
    expect(verdict.postContact.failures.some((failure) => failure.reason === 'pushback-cell-contact')).toBe(true);
  });

  test('pushback into a gate that is closed at that tick is a stranding failure', () => {
    const f = asciiFixture([
      '#########',
      '#S.....G#',
      '#########'
    ]);
    const closedBehind: HazardSpec = { kind: 'timedGate', cell: f.start, period: 4, openFrom: 0, openFor: 1 };
    const verdict = validateLevelHazards(f.graph, [closedBehind], { start: f.start, goal: f.goal });
    expect(verdict.hazardsPresent.pass).toBe(true);
    expect(verdict.postContact.failures[0]).toMatchObject({
      witnessIndex: 1,
      pushbackCell: f.start,
      reason: 'pushback-cell-blocked'
    });
    expect(verdict.pass).toBe(false);
  });

  test('an unsolvable level reports the reason and skips the post-contact check', () => {
    const f = asciiFixture([
      '#########',
      '#S..X..G#',
      '#########'
    ]);
    const verdict = validateLevelHazards(f.graph, f.blockers, { start: f.start, goal: f.goal });
    expect(verdict.hazardsPresent).toEqual({ pass: false, reason: 'no-route', ticks: null, waits: null });
    expect(verdict.postContact).toMatchObject({ pass: false, skipped: true });
    expect(verdict.witness).toBeNull();
    expect(verdict.pass).toBe(false);
    // Blockers are never reported as hosted chokepoint hazards.
    expect(verdict.chokepoints.hostedCount).toBe(0);
  });

  test('an invalid spec yields a failing verdict instead of throwing', () => {
    const f = pocketCorridor();
    const verdict = validateLevelHazards(f.graph, [{ kind: 'blocker', cell: 0 }], { start: f.start, goal: f.goal });
    expect(verdict.specError).toMatchObject({ code: 'cell-not-walkable', index: 0 });
    expect(verdict.hazardsPresent.reason).toBe('invalid-spec:cell-not-walkable');
    expect(verdict.period).toBeNull();
    expect(verdict.pass).toBe(false);
  });

  test('accepts raw grid input as well as a prebuilt graph', () => {
    const f = pocketCorridor();
    const fromGraph = validateLevelHazards(f.graph, [], { start: f.start, goal: f.goal });
    const fromInput = validateLevelHazards({ width: 9, height: 4, grid: f.grid }, [], { start: f.start, goal: f.goal });
    expect(serializeLevelVerdict(fromInput)).toBe(serializeLevelVerdict(fromGraph));
    expect(fromGraph.pass).toBe(true);
  });

  test('verdict records serialize to identical, key-sorted bytes across runs', () => {
    const f = trapLayout();
    const run = () => serializeLevelVerdict(
      validateLevelHazards(f.graph, trapSpecs(f), { start: f.start, goal: f.goal, levelId: 'trap' })
    );
    const first = run();
    expect(run()).toBe(first);
    const parsed = JSON.parse(first) as Record<string, unknown>;
    expect(Object.keys(parsed)).toEqual([...Object.keys(parsed)].sort());
    expect(first.endsWith('\n')).toBe(false);
  });

  test('the persisted witness replays against the timeline it was found on', () => {
    const f = trapLayout();
    const specs = trapSpecs(f);
    const verdict = validateLevelHazards(f.graph, specs, { start: f.start, goal: f.goal });
    expect(verdict.witness).not.toBeNull();
    expect(verifyWitness(f.graph, createHazardTimeline(f.graph, specs), verdict.witness!).valid).toBe(true);
  });
});

describe('resolvePushbackCell', () => {
  test('is the nearest junction strictly behind the player, else the route start', () => {
    const room = asciiFixture([
      '#####',
      '##.##',
      '#...#',
      '##.S#',
      '#####'
    ]);
    const walk = [room.at(3, 3), room.at(2, 3), room.at(2, 2), room.at(2, 1)];
    expect(room.graph.isJunction(room.at(2, 2))).toBe(true);
    expect(resolvePushbackCell(room.graph, walk, 3)).toBe(room.at(2, 2));
    // The contact cell itself does not count as "behind".
    expect(resolvePushbackCell(room.graph, walk, 2)).toBe(walk[0]);
    expect(resolvePushbackCell(room.graph, walk, 0)).toBe(walk[0]);
  });

  test('a corridor with no junction pushes back to the route start', () => {
    const f = pocketCorridor();
    const route = [2, 3, 4].map((x) => f.at(x, 1));
    // (4,1) is a junction (pocket below); (2,1) and (3,1) are not.
    expect(resolvePushbackCell(f.graph, route, 2)).toBe(route[0]);
    expect(resolvePushbackCell(f.graph, [...route, f.at(5, 1)], 3)).toBe(f.at(4, 1));
  });
});
