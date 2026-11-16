import { describe, expect, test } from 'vitest';
import {
  PLAY_INVULNERABLE_TICKS,
  computeHazardOverlay,
  createContactTracker,
  createHazardStateSpace,
  createHazardTimeline,
  findOccupancyContact,
  findSwapContact,
  findWitnessRoute,
  shuttlePeriod,
  verifyWitness,
  type HazardSpec,
  type HazardWitness
} from '../../../src/mazer-core/hazards';
import { createLegacyMaze } from '../../../src/legacy-runtime/legacyMaze';
import { createLegacyMazeHazardGraph } from '../../../src/legacy-runtime/legacyHazardGraphAdapter';
import { asciiFixture, createTestRng } from './fixtures';

// A wrapping corridor: x = 0 and x = 6 are floor on the same row, so a step left
// from x = 0 lands on x = 6 (production wrap) and the reverse.
const wrapRows = [
  '#######',
  '.S...G.',
  '#######'
];

describe('collision phase: the graph contract contact rule', () => {
  test('occupancy: the arrival cell holds an enemy at t + 1', () => {
    expect(findOccupancyContact([4, 9], 2, 9)).toBe(1);
    expect(findOccupancyContact([4, 9], 2, 5)).toBe(-1);
    // Only the first `count` entries are enemies (reused buffers may be longer).
    expect(findOccupancyContact(Int32Array.from([4, 9, 7]), 2, 7)).toBe(-1);
  });

  test('head-on swap in bounds; moving away in the same direction is no contact', () => {
    // Player 10 -> 11, enemy 11 -> 10: swap.
    expect(findSwapContact([11], [10], 1, 10, 11)).toBe(0);
    // Player 10 -> 11, enemy 11 -> 12 (moves away): no contact.
    expect(findSwapContact([11], [12], 1, 10, 11)).toBe(-1);
    // A wait never swaps.
    expect(findSwapContact([10], [10], 1, 10, 10)).toBe(-1);
  });

  test('a head-on swap across a wrap edge is a contact, exactly like an in-bounds swap', () => {
    const fixture = asciiFixture(wrapRows);
    const { graph } = fixture;
    const left = fixture.at(0, 1);
    const right = fixture.at(6, 1);
    expect(graph.moveTarget(left, 'left')).toBe(right);
    expect(graph.moveTarget(right, 'right')).toBe(left);
    // A Sentry shuttling across the wrap: right at even ticks, left at odd ticks.
    const sentry: HazardSpec = { kind: 'patrol', route: [right, left], period: shuttlePeriod(2) };
    const timeline = createHazardTimeline(graph, [sentry]);
    expect(timeline.enemyCellsAt(0)).toEqual([right]);
    expect(timeline.enemyCellsAt(1)).toEqual([left]);

    // Player on `left` at tick 0 steps left across the wrap to `right` while the
    // Sentry crosses the other way.
    const tracker = createContactTracker();
    const event = tracker.stepCollision(0, left, right, timeline.enemyCellsAt(0), timeline.enemyCellsAt(1), 1);
    expect(event).not.toBeNull();
    expect(event!.kind).toBe('swap');
    expect(event!.tick).toBe(1);
    expect(event!.enemyIndex).toBe(0);

    // The validator agrees: a witness taking that step is rejected as a swap.
    const witness: HazardWitness = {
      contract: 'mazer-hazard-witness-draft-v0',
      width: graph.width,
      height: graph.height,
      start: left,
      goal: right,
      startTick: 0,
      invulnerableTurns: 0,
      period: timeline.period,
      ticks: 1,
      waits: 0,
      cells: [left, right],
      actions: ['left']
    };
    expect(verifyWitness(graph, timeline, witness)).toEqual({ valid: false, failedAction: 0, reason: 'contact-swap' });
    // And the search never routes through it at that tick: from `left` at tick 0
    // the shortest route to `right` is not the one-step wrap.
    const result = findWitnessRoute(graph, timeline, { start: left, goal: right, startTick: 0 });
    expect(result.solvable && result.witness.actions[0] === 'left').toBe(false);
  });

  test('tracker contacts equal the validator legality on random walks (k = 0)', () => {
    const fixture = asciiFixture([
      '#########',
      '.S.....G.',
      '#.#.#.#.#',
      '.........',
      '#########'
    ]);
    const { graph } = fixture;
    const rng = createTestRng(424242);
    const floor: number[] = [];
    for (let cell = 0; cell < graph.cellCount; cell += 1) {
      if (graph.isWalkable(cell)) floor.push(cell);
    }
    let contacts = 0;
    for (let scenario = 0; scenario < 60; scenario += 1) {
      const specs: HazardSpec[] = [];
      for (let s = 0; s < 1 + Math.floor(rng() * 4); s += 1) {
        const route = [floor[Math.floor(rng() * floor.length)]!];
        while (route.length < 2 + Math.floor(rng() * 4)) {
          const options = graph.neighbors(route[route.length - 1]!).filter((cell) => !route.includes(cell));
          if (options.length === 0) break;
          route.push(options[Math.floor(rng() * options.length)]!);
        }
        specs.push({ kind: 'patrol', route, period: shuttlePeriod(route.length), phase: Math.floor(rng() * 6) });
      }
      const timeline = createHazardTimeline(graph, specs);
      // The validator's own transition relation (k = 0, no gates): a successor is
      // listed iff the step makes no contact.
      const space = createHazardStateSpace(graph, timeline, 0);
      const tracker = createContactTracker();
      let cell = floor[Math.floor(rng() * floor.length)]!;
      for (let tick = 0; tick < 40; tick += 1) {
        const options = [...graph.neighbors(cell), cell];
        const dest = options[Math.floor(rng() * options.length)]!;
        const legal: number[] = [];
        space.forEachSuccessor(space.stateIndex(cell, tick % space.period, 0), (next) => legal.push(space.cellOf(next)));
        const event = tracker.stepCollision(tick, cell, dest, timeline.enemyCellsAt(tick), timeline.enemyCellsAt(tick + 1), timeline.enemyCount);
        expect(event === null, `scenario ${scenario} tick ${tick}`).toBe(legal.includes(dest));
        if (event) contacts += 1;
        cell = dest;
      }
    }
    expect(contacts).toBeGreaterThan(20);
  });
});

describe('invulnerability and CLEAN', () => {
  const always = [7];

  test(`after a rewind the next ${PLAY_INVULNERABLE_TICKS} ticks ignore contact, the next one counts`, () => {
    const tracker = createContactTracker();
    expect(tracker.stepCollision(0, 6, 7, always, always, 1)).not.toBeNull();
    tracker.grantInvulnerability(PLAY_INVULNERABLE_TICKS);
    for (let tick = 1; tick <= PLAY_INVULNERABLE_TICKS; tick += 1) {
      expect(tracker.invulnerableTicks).toBe(PLAY_INVULNERABLE_TICKS - tick + 1);
      expect(tracker.stepCollision(tick, 7, 7, always, always, 1)).toBeNull();
    }
    expect(tracker.invulnerableTicks).toBe(0);
    expect(tracker.stepCollision(5, 7, 7, always, always, 1)?.ordinal).toBe(2);
    expect(tracker.contacts).toBe(2);
  });

  test('a grant never lowers the counter and rejects bad values', () => {
    const tracker = createContactTracker();
    tracker.grantInvulnerability(9);
    tracker.grantInvulnerability(4);
    expect(tracker.invulnerableTicks).toBe(9);
    expect(() => tracker.grantInvulnerability(-1)).toThrow(RangeError);
    expect(() => tracker.grantInvulnerability(1.5)).toThrow(RangeError);
  });

  test('CLEAN is a level with zero contacts; reset starts a new level', () => {
    const tracker = createContactTracker();
    expect(tracker.summary()).toEqual({ contract: 'mazer-hazard-contact-v1', contacts: 0, clean: true });
    tracker.stepCollision(0, 6, 7, always, always, 1);
    expect(tracker.summary()).toEqual({ contract: 'mazer-hazard-contact-v1', contacts: 1, clean: false });
    tracker.grantInvulnerability(4);
    tracker.reset();
    expect(tracker.invulnerableTicks).toBe(0);
    expect(tracker.clean).toBe(true);
  });

  test('hot path: the contact event is one reused object (no per-contact allocation)', () => {
    const tracker = createContactTracker();
    const first = tracker.stepCollision(0, 6, 7, always, always, 1);
    const second = tracker.stepCollision(1, 6, 7, always, always, 1);
    expect(second).toBe(first);
    expect(second!.ordinal).toBe(2);
  });
});

describe('demo never contacts: the stored witness replays with zero contacts', () => {
  test('real levels with Sentries replay CLEAN through the tracker', () => {
    let replays = 0;
    let withSentries = 0;
    for (const [width, height] of [[25, 51], [45, 27]] as const) {
      for (const seed of [11, 29]) {
        const maze = createLegacyMaze(width, height, 20261115 + seed, undefined, {
          requiredOppositeBorderConnections: { horizontal: true, vertical: true }
        });
        const { graph, start, goal } = createLegacyMazeHazardGraph(maze);
        for (const level of [20, 21, 40, 75, 150]) {
          const overlay = computeHazardOverlay(graph, { start, goal, mazeSeed: maze.seed, level, saturationLevel: 288 });
          const witness = overlay.verdict?.witness;
          if (!witness) continue;
          const timeline = createHazardTimeline(graph, overlay.specs);
          if (timeline.enemyCount > 0) withSentries += 1;
          const tracker = createContactTracker();
          for (let i = 0; i < witness.ticks; i += 1) {
            const tick = witness.startTick + i;
            tracker.stepCollision(tick, witness.cells[i]!, witness.cells[i + 1]!, timeline.enemyCellsAt(tick), timeline.enemyCellsAt(tick + 1), timeline.enemyCount);
          }
          expect(tracker.summary().clean).toBe(true);
          replays += 1;
        }
      }
    }
    expect(replays).toBeGreaterThan(10);
    expect(withSentries).toBeGreaterThan(5);
  });
});
