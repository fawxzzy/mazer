import { describe, expect, it } from 'vitest';
import {
  HUNTER_BURNOUT_CONTACTS,
  PLAY_INVULNERABLE_TURNS,
  createHunterRunContext,
  createHunterRunState,
  createHunterSpec,
  decodeHunterInputLog,
  encodeHunterInputLog,
  playHunterRun,
  replayHunterRun,
  stepHunterRun,
  type HunterRunContext,
  type HunterRunPolicy
} from '../../../src/mazer-core/hazards';
import { HAZARD_ACTION_ORDER, type HazardAction, type HazardSpec } from '../../../src/mazer-core/hazards/graphContract';
import { chaserFixture, type ChaserAsciiFixture } from './chaserFixtures';
import type { RefSpec, RefWorld } from './chaserReference';
import { refHunterCell, refRunStart, refRunStep, type RefAction } from './hunterRunReference';

const LOOPS = [
  '###########',
  '#S..#...C.#',
  '#.#.#.###.#',
  '#.........#',
  '#.###.#.#.#',
  '#...#1#..G#',
  '###########'
];

const WRAPS = [
  '#####.#####',
  '#S.......C#',
  '#.###.###.#',
  '...........',
  '#.###.###.#',
  '#....1...G#',
  '#####.#####'
];

const OPEN = [
  '#########',
  '#S......#',
  '#.#.#.#.#',
  '#.......#',
  '#.#.#.#.#',
  '#..C...G#',
  '#########'
];

const worldOf = (fixture: ChaserAsciiFixture): RefWorld => ({ grid: fixture.grid, width: fixture.width, height: fixture.height });
const pointOf = (fixture: ChaserAsciiFixture, cell: number) => ({ x: cell % fixture.width, y: Math.floor(cell / fixture.width) });
const REF_ACTION: Record<HazardAction, RefAction> = { up: 'U', left: 'L', down: 'D', right: 'R', wait: 'W' };

/** Deterministic test RNG (LCG), independent of the production mix32. */
const lcg = (seed: number) => {
  let s = seed >>> 0;
  return (): number => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
};

const randomActions = (seed: number, length: number): HazardAction[] => {
  const next = lcg(seed);
  return Array.from({ length }, () => HAZARD_ACTION_ORDER[Math.floor(next() * HAZARD_ACTION_ORDER.length)]!);
};

const hunterSetup = (rows: readonly string[], markers: readonly string[], divisors: readonly number[]) => {
  const fixture = chaserFixture(rows);
  const specs = markers.map((marker, i) => ({ ...createHunterSpec(fixture.spawns[marker]!), speedDivisor: divisors[i]! }));
  const refSpecs: RefSpec[] = specs.map((spec) => ({
    rule: 'chaser', spawn: pointOf(fixture, spec.spawnCell), lookahead: 0, initialFacing: null, delay: 0, grace: 0, divisor: spec.speedDivisor!
  }));
  const context = createHunterRunContext({ graph: fixture.graph, specs: [], hunters: specs, start: fixture.start, goal: fixture.goal });
  return { fixture, specs, refSpecs, context };
};

/** Policy that walks toward Hunter 0 (static BFS), to force contacts. */
const seekHunter = (fixture: ChaserAsciiFixture): HunterRunPolicy => (state) => {
  const target = state.hunters[0]!.burnedOut ? fixture.goal : state.hunters[0]!.engine.cell;
  const distance = new Map<number, number>([[target, 0]]);
  const queue = [target];
  while (queue.length > 0) {
    const cell = queue.shift()!;
    for (const next of fixture.graph.neighbors(cell)) {
      if (!distance.has(next)) {
        distance.set(next, distance.get(cell)! + 1);
        queue.push(next);
      }
    }
  }
  let best: HazardAction = 'wait';
  let bestDistance = distance.get(state.cell) ?? Infinity;
  for (const action of HAZARD_ACTION_ORDER) {
    const next = action === 'wait' ? -1 : fixture.graph.moveTarget(state.cell, action);
    if (next >= 0 && (distance.get(next) ?? Infinity) < bestDistance) {
      best = action;
      bestDistance = distance.get(next)!;
    }
  }
  return best;
};

describe('Hunter run (H5) against the independent reference', () => {
  const cases = [
    { name: 'loops, 2 Hunters at divisor 2 and 3', rows: LOOPS, markers: ['C', '1'], divisors: [2, 3] },
    { name: 'wrap edges, 2 Hunters at divisor 2', rows: WRAPS, markers: ['C', '1'], divisors: [2, 2] },
    { name: 'open grid, 1 Hunter at divisor 3', rows: OPEN, markers: ['C'], divisors: [3] }
  ];

  for (const testCase of cases) {
    it(`matches the reference tick by tick (${testCase.name})`, () => {
      const { fixture, refSpecs, context } = hunterSetup(testCase.rows, testCase.markers, testCase.divisors);
      const world = worldOf(fixture);
      const goal = pointOf(fixture, fixture.goal);
      let comparedContacts = 0;
      for (let seed = 1; seed <= 25; seed += 1) {
        let state = createHunterRunState(context);
        let ref = refRunStart(world, refSpecs, pointOf(fixture, fixture.start));
        for (const action of randomActions(seed * 7919 + testCase.divisors[0]!, 160)) {
          const step = stepHunterRun(context, state, action);
          for (const event of step.events) {
            if (event.type === 'contact') {
              // The reference has no safety search: every rewind here must be the plain one.
              expect(['junction', 'start']).toContain(event.rewindKind);
              comparedContacts += 1;
            }
          }
          state = step.state;
          ref = refRunStep(world, refSpecs, goal, ref, REF_ACTION[action]);
          expect(state.tick).toBe(ref.tick);
          expect(state.cell).toBe(ref.player.y * fixture.width + ref.player.x);
          expect(state.invulnerable).toBe(ref.invulnerable);
          expect(state.contacts).toBe(ref.contacts);
          expect(state.reachedGoal).toBe(ref.done);
          expect(state.trail.length).toBe(ref.trail.length);
          state.hunters.forEach((hunter, i) => {
            expect(hunter.contacts).toBe(ref.hits[i]);
            expect(hunter.burnedOut).toBe(ref.burned[i]);
            expect(hunter.burnedOut ? -1 : hunter.engine.cell).toBe(refHunterCell(ref, i, fixture.width));
          });
          if (state.reachedGoal) {
            break;
          }
        }
      }
      expect(comparedContacts).toBeGreaterThan(0);
    });
  }
});

describe('Hunter burnout bound (A4)', () => {
  it('a Hunter that is chased into burns out on the third contact and never touches the player again', () => {
    const { fixture, context } = hunterSetup(OPEN, ['C'], [3]);
    const { result } = playHunterRun(context, seekHunter(fixture), 600);
    expect(result.hunterContacts).toEqual([HUNTER_BURNOUT_CONTACTS]);
    expect(result.burnouts).toBe(1);
    const burnout = result.events.find((event) => event.type === 'burnout');
    expect(burnout).toBeDefined();
    const afterBurnout = result.frames.filter((frame) => frame.tick >= burnout!.tick);
    expect(afterBurnout.every((frame) => frame.hunterCells[0] === -1)).toBe(true);
    // After burnout the seek policy heads for the goal and clears it.
    expect(result.reachedGoal).toBe(true);
    expect(result.clean).toBe(false);
  });

  it('no Hunter exceeds 3 contacts over many random runs', () => {
    for (const rows of [LOOPS, WRAPS]) {
      const { context } = hunterSetup(rows, ['C', '1'], [2, 2]);
      for (let seed = 1; seed <= 30; seed += 1) {
        const result = replayHunterRun(context, { contract: 'mazer-hunter-input-log-v1', actions: randomActions(seed, 400) });
        expect(Math.max(...result.hunterContacts)).toBeLessThanOrEqual(HUNTER_BURNOUT_CONTACTS);
        expect(result.burnouts).toBe(result.hunterContacts.filter((n) => n === HUNTER_BURNOUT_CONTACTS).length);
      }
    }
  });
});

describe('Hunter run replay determinism', () => {
  it('a live policy run and the replay of its recorded log are identical', () => {
    const { fixture, context } = hunterSetup(LOOPS, ['C', '1'], [2, 3]);
    const next = lcg(42);
    const randomPolicy: HunterRunPolicy = () => HAZARD_ACTION_ORDER[Math.floor(next() * 5)]!;
    const live = playHunterRun(context, randomPolicy, 300);
    const text = encodeHunterInputLog(live.log);
    expect(text).toMatch(/^[ULDRW]*$/);
    const replay = replayHunterRun(context, decodeHunterInputLog(text));
    expect(replay).toEqual(live.result);
    // A second context built from the same inputs gives the same digest.
    const again = hunterSetup(LOOPS, ['C', '1'], [2, 3]);
    expect(replayHunterRun(again.context, live.log).digest).toBe(live.result.digest);
    const seek = playHunterRun(context, seekHunter(fixture), 600);
    expect(replayHunterRun(context, seek.log)).toEqual(seek.result);
  });

  it('the digest changes when one action changes the run', () => {
    const { context } = hunterSetup(OPEN, ['C'], [3]);
    const actions = randomActions(5, 80);
    const base = replayHunterRun(context, { contract: 'mazer-hunter-input-log-v1', actions });
    const index = base.frames.findIndex((frame, i) => i > 0 && frame.cell !== base.frames[i - 1]!.cell) - 1;
    const changed = actions.slice();
    changed[index] = 'wait';
    expect(replayHunterRun(context, { contract: 'mazer-hunter-input-log-v1', actions: changed }).digest).not.toBe(base.digest);
  });

  it('rejects invalid log codes and unknown actions', () => {
    expect(() => decodeHunterInputLog('UDX')).toThrow(RangeError);
    const { context } = hunterSetup(OPEN, ['C'], [3]);
    expect(() => stepHunterRun(context, createHunterRunState(context), 'jump' as HazardAction)).toThrow(RangeError);
  });
});

describe('Hunter run: gates, Sentries and the rewind fallbacks', () => {
  const corridor = chaserFixture(['#######', '#S...G#', '#######']);
  const at = (x: number) => corridor.at(x, 1);

  it('a gate closed at the arrival tick is a wall bump (WAIT), with no event', () => {
    const gate: HazardSpec = { kind: 'timedGate', cell: at(3), period: 4, openFrom: 2, openFor: 2 };
    const context = createHunterRunContext({ graph: corridor.graph, specs: [gate], hunters: [], start: at(2), goal: corridor.goal });
    const step = stepHunterRun(context, createHunterRunState(context), 'right');
    expect(step.state.cell).toBe(at(2));
    expect(step.events).toEqual([]);
  });

  it('a gate closing on the player ejects them one cell back along the trail, no contact (A3)', () => {
    const gate: HazardSpec = { kind: 'timedGate', cell: at(3), period: 4, openFrom: 2, openFor: 2 };
    const context = createHunterRunContext({ graph: corridor.graph, specs: [gate], hunters: [], start: corridor.start, goal: corridor.goal });
    // ticks: 0 at x1 -> 1 at x2 -> 2 at x3 (open at 2) -> wait (open at 3) -> wait: closed at 4 -> eject to x2.
    const result = replayHunterRun(context, decodeHunterInputLog('RRWW'));
    expect(result.events).toEqual([{ type: 'eject', tick: 4, from: at(3), to: at(2) }]);
    expect(result.frames[4]!.cell).toBe(at(2));
    expect(result.frames[4]!.invulnerable).toBe(0);
    expect(result.contacts).toBe(0);
  });

  it('a contact with no junction behind rewinds to the start with 4 invulnerable ticks', () => {
    const patrol: HazardSpec = { kind: 'patrol', route: [at(4)], period: 1 };
    const context = createHunterRunContext({ graph: corridor.graph, specs: [patrol], hunters: [], start: corridor.start, goal: corridor.goal });
    const result = replayHunterRun(context, decodeHunterInputLog('RRR'));
    const contact = result.events.find((event) => event.type === 'contact');
    expect(contact).toMatchObject({ type: 'contact', tick: 3, cell: at(4), hunters: [], sentry: true, rewindCell: corridor.start, rewindKind: 'start' });
    expect(result.frames[3]).toMatchObject({ cell: corridor.start, invulnerable: PLAY_INVULNERABLE_TURNS });
    expect(result.contacts).toBe(1);
  });

  it('skips every trail junction with no witness to the goal and falls back to the start (A2 safety)', () => {
    // The trail passes three junctions; a Sentry parked forever on the only corridor to the goal
    // leaves no route from any of them, so the safety search rejects each and the rewind lands on the start.
    const fixture = chaserFixture([
      '#########',
      '#S.#....#',
      '#..#.##.#',
      '#.......#',
      '###.#####',
      '#...#..G#',
      '#.....#.#',
      '#########'
    ]);
    const graph = fixture.graph;
    for (const [x, y] of [[1, 2], [2, 3], [3, 3]] as const) {
      expect(graph.isJunction(fixture.at(x, y))).toBe(true);
    }
    const sentry: HazardSpec = { kind: 'patrol', route: [fixture.at(3, 4)], period: 1 };
    const context = createHunterRunContext({ graph, specs: [sentry], hunters: [], start: fixture.start, goal: fixture.goal, invulnerableTurns: 0 });
    // Walk S(1,1) -> (1,2) -> (1,3) -> (2,3) -> (3,3) -> (3,4): contact with the parked Sentry.
    const result = replayHunterRun(context, decodeHunterInputLog('DDRRD'));
    const contact = result.events.find((event) => event.type === 'contact');
    expect(contact).toMatchObject({ rewindKind: 'start', rewindCell: fixture.start });
    // Without the Sentry the nearest junction is accepted.
    const open = createHunterRunContext({ graph, specs: [], hunters: [createHunterSpec(fixture.at(3, 4))], start: fixture.start, goal: fixture.goal });
    const hit = replayHunterRun(open, decodeHunterInputLog('DDRRD')).events.find((event) => event.type === 'contact');
    if (hit !== undefined) {
      expect(hit).toMatchObject({ rewindKind: 'junction' });
    }
  });

  it('probe mode reports a contact without counting or rewinding it', () => {
    const patrol: HazardSpec = { kind: 'patrol', route: [at(2)], period: 1 };
    const context = createHunterRunContext({ graph: corridor.graph, specs: [patrol], hunters: [], start: corridor.start, goal: corridor.goal });
    const state = createHunterRunState(context);
    const probe = stepHunterRun(context, state, 'right', { probe: true });
    expect(probe.events).toEqual([{ type: 'contact', tick: 1, cell: at(2), hunters: [], sentry: true, rewindCell: null, rewindKind: null }]);
    expect(probe.state.contacts).toBe(0);
    expect(state.tick).toBe(0);
  });

  it('stops at the goal and ignores later actions', () => {
    const context = createHunterRunContext({ graph: corridor.graph, specs: [], hunters: [], start: corridor.start, goal: corridor.goal });
    const result = replayHunterRun(context, decodeHunterInputLog('RRRRWWWW'));
    expect(result).toMatchObject({ reachedGoal: true, ticks: 4, contacts: 0, clean: true });
    expect(result.events).toEqual([{ type: 'goal', tick: 4 }]);
  });
});

