import { describe, expect, test } from 'vitest';
import {
  createHazardGraph,
  createHazardTimeline,
  findWitnessRoute,
  resolvePushbackCell,
  shuttlePeriod,
  verifyWitness,
  type HazardGraph,
  type HazardSpec,
  type HazardTimeline
} from '../../../src/mazer-core/hazards';
import {
  DEFAULT_BOT_LADDER,
  ENEMY_DISTANCE_CAP,
  botTier,
  createSeededRng,
  isDeterministicBot,
  runBot,
  type BotRunResult,
  type BotSpec
} from '../../../src/mazer-core/eval/bots';
import { createLegacyMaze } from '../../../src/legacy-runtime/legacyMaze';
import { createLegacyMazeHazardGraph } from '../../../src/legacy-runtime/legacyHazardGraphAdapter';
import { asciiFixture, timelineFor } from '../hazards/fixtures';

const [ORACLE, LIMITED, NOISY, MYOPIC] = DEFAULT_BOT_LADDER as readonly [BotSpec, BotSpec, BotSpec, BotSpec];

interface Case {
  readonly name: string;
  readonly graph: HazardGraph;
  readonly timeline: HazardTimeline;
  readonly start: number;
  readonly goal: number;
  readonly maxTurns: number;
}

const fromAscii = (name: string, rows: readonly string[], extra: readonly HazardSpec[] = [], maxTurns = 200): Case => {
  const fixture = asciiFixture(rows);
  return { name, graph: fixture.graph, timeline: timelineFor(fixture, extra), start: fixture.start, goal: fixture.goal, maxTurns };
};

const fromMaze = (name: string, size: number, seed: number, profile: Parameters<typeof createLegacyMaze>[4]): Case => {
  const maze = createLegacyMaze(size, size, seed, undefined, profile);
  const { graph, start, goal } = createLegacyMazeHazardGraph(maze);
  return { name, graph, timeline: createHazardTimeline(graph, []), start, goal, maxTurns: 1500 };
};

const openArena = fromAscii('open', [
  '###########',
  '#S........#',
  '#.........#',
  '#.........#',
  '#........G#',
  '###########'
]);

const gateCorridor = fromAscii(
  'gate',
  ['#########', '#S.....G#', '#.#####.#', '#.......#', '#########'],
  [{ kind: 'timedGate', cell: 4 + 9, period: 4, openFrom: 1, openFor: 2 }]
);

const patrolHall = ((): Case => {
  const fixture = asciiFixture([
    '###########',
    '#S........#',
    '#.#######.#',
    '#........G#',
    '###########'
  ]);
  const route = [fixture.at(3, 1), fixture.at(4, 1), fixture.at(5, 1), fixture.at(6, 1), fixture.at(7, 1)];
  return {
    name: 'patrol',
    graph: fixture.graph,
    timeline: timelineFor(fixture, [{ kind: 'patrol', route, period: shuttlePeriod(route.length) }]),
    start: fixture.start,
    goal: fixture.goal,
    maxTurns: 300
  };
})();

const mazeProfile = {
  checkpointCountOverride: 12,
  straightnessBias: 0.5,
  maxDeadEndCount: 6,
  requiredOppositeBorderConnections: { horizontal: false, vertical: false },
  borderFeederTargetPerSide: null
} as const;

const corpus: readonly Case[] = [
  openArena,
  gateCorridor,
  patrolHall,
  fromMaze('maze-a', 21, 101, mazeProfile),
  fromMaze('maze-b', 21, 202, mazeProfile),
  fromMaze('maze-c', 25, 303, mazeProfile),
  fromMaze('maze-d', 25, 404, mazeProfile)
];

const run = (spec: BotSpec, testCase: Case, seed: number, maxTurns = testCase.maxTurns): BotRunResult => (
  runBot(spec, testCase.graph, testCase.timeline, { start: testCase.start, goal: testCase.goal, maxTurns, seed })
);

describe('seeded PRNG', () => {
  test('is deterministic, in [0, 1), and seed sensitive', () => {
    const a = createSeededRng(42);
    const b = createSeededRng(42);
    const c = createSeededRng(43);
    const seqA = Array.from({ length: 50 }, () => a());
    expect(seqA).toEqual(Array.from({ length: 50 }, () => b()));
    expect(seqA).not.toEqual(Array.from({ length: 50 }, () => c()));
    expect(seqA.every((value) => value >= 0 && value < 1)).toBe(true);
  });
});

describe('bot determinism', () => {
  test('same seed gives byte-identical results for every tier on every fixture', () => {
    for (const testCase of corpus) {
      for (const spec of DEFAULT_BOT_LADDER) {
        const first = JSON.stringify(run(spec, testCase, 7));
        const second = JSON.stringify(run(spec, testCase, 7));
        expect(second, `${testCase.name}/${spec.kind}`).toBe(first);
      }
    }
  });

  test('the seed matters only for bots that draw randomness', () => {
    const noisy = { kind: 'planner-noisy', horizon: 4, mistakeProbability: 0.3, reactionDelay: 0 } as const;
    const results = new Set(Array.from({ length: 6 }, (_, seed) => JSON.stringify(run(noisy, openArena, seed + 1))));
    expect(results.size).toBeGreaterThan(1);
    expect(isDeterministicBot(ORACLE)).toBe(true);
    expect(isDeterministicBot(LIMITED)).toBe(true);
    expect(isDeterministicBot(NOISY)).toBe(false);
    expect(isDeterministicBot(MYOPIC)).toBe(false);
    for (const seed of [1, 2, 3]) {
      expect(run(LIMITED, gateCorridor, seed)).toEqual(run(LIMITED, gateCorridor, 1));
    }
  });

  test('tiers are numbered 0..3 in ladder order', () => {
    expect(DEFAULT_BOT_LADDER.map(botTier)).toEqual([0, 1, 2, 3]);
  });
});

describe('bot behaviour', () => {
  test('the oracle follows a P3 witness that verifyWitness accepts', () => {
    for (const testCase of [gateCorridor, patrolHall, openArena]) {
      const result = run(ORACLE, testCase, 1);
      const witness = findWitnessRoute(testCase.graph, testCase.timeline, { start: testCase.start, goal: testCase.goal });
      expect(witness.solvable).toBe(true);
      if (!witness.solvable) {
        continue;
      }
      expect(result.reached).toBe(true);
      expect(result.path).toEqual(witness.witness.cells);
      expect(result.turns).toBe(witness.witness.ticks);
      expect(result.waits).toBe(witness.witness.waits);
      expect(result.contacts).toBe(0);
      expect(verifyWitness(testCase.graph, testCase.timeline, witness.witness).valid).toBe(true);
    }
  });

  test('the oracle reports failure within the turn budget, and for unsolvable levels', () => {
    expect(run(ORACLE, openArena, 1, 3).reached).toBe(false);
    const sealed = fromAscii('sealed', ['#####', '#SXG#', '#####']);
    const result = run(ORACLE, sealed, 1);
    expect(result.reached).toBe(false);
    expect(result.path).toEqual([sealed.start]);
  });

  test('bots solve an open arena and a gate corridor, waiting only when timing forces it', () => {
    for (const spec of [ORACLE, LIMITED]) {
      for (const testCase of [openArena, gateCorridor]) {
        const result = run(spec, testCase, 1);
        expect(result.reached, `${testCase.name}/${spec.kind}`).toBe(true);
        expect(result.contacts).toBe(0);
        expect(result.path[0]).toBe(testCase.start);
        expect(result.path[result.path.length - 1]).toBe(testCase.goal);
        expect(result.path.length).toBe(result.turns + 1);
      }
    }
    expect(run(LIMITED, openArena, 1).waits).toBe(0);
  });

  test('start equal to goal is reached in zero turns; invalid endpoints are not reached', () => {
    const same = runBot(LIMITED, openArena.graph, openArena.timeline, { start: openArena.start, goal: openArena.start, maxTurns: 10, seed: 1 });
    expect(same).toMatchObject({ reached: true, turns: 0 });
    const wall = runBot(LIMITED, openArena.graph, openArena.timeline, { start: 0, goal: openArena.goal, maxTurns: 10, seed: 1 });
    expect(wall.reached).toBe(false);
  });

  test('rejects malformed options and specs', () => {
    const base = { start: openArena.start, goal: openArena.goal, seed: 1 };
    expect(() => runBot(LIMITED, openArena.graph, openArena.timeline, { ...base, maxTurns: -1 })).toThrow(RangeError);
    expect(() => runBot({ kind: 'planner-noisy', horizon: 2, mistakeProbability: 2, reactionDelay: 0 }, openArena.graph, openArena.timeline, { ...base, maxTurns: 5 })).toThrow(RangeError);
    expect(() => runBot({ kind: 'planner-limited', horizon: 1.5 }, openArena.graph, openArena.timeline, { ...base, maxTurns: 5 })).toThrow(RangeError);
  });

  test('a mistake probability of 1 records mistakes and never beats the unmistaken planner', () => {
    const always = { kind: 'planner-noisy', horizon: 4, mistakeProbability: 1, reactionDelay: 0 } as const;
    const result = run(always, openArena, 5);
    expect(result.mistakes).toBeGreaterThan(0);
    expect(result.turns).toBeGreaterThanOrEqual(run(LIMITED, openArena, 5).turns);
  });

  test('minEnemyDistance is null without enemies and capped with them', () => {
    expect(run(LIMITED, openArena, 1).minEnemyDistance).toBeNull();
    const withEnemy = run(ORACLE, patrolHall, 1);
    expect(withEnemy.minEnemyDistance).not.toBeNull();
    expect(withEnemy.minEnemyDistance!).toBeGreaterThanOrEqual(0);
    expect(withEnemy.minEnemyDistance!).toBeLessThanOrEqual(ENEMY_DISTANCE_CAP);
  });
});

describe('tier ordering sanity', () => {
  const seeds = [1, 2, 3, 4, 5, 6];
  const passRate = (spec: BotSpec): number => {
    let reached = 0;
    let total = 0;
    for (const testCase of corpus) {
      for (const seed of isDeterministicBot(spec) ? [seeds[0]!] : seeds) {
        total += 1;
        if (run(spec, testCase, seed).reached) {
          reached += 1;
        }
      }
    }
    return reached / total;
  };

  test('oracle >= limited >= noisy >= myopic pass rate on the fixed corpus', () => {
    const [oracle, limited, noisy, myopic] = DEFAULT_BOT_LADDER.map(passRate) as [number, number, number, number];
    expect(oracle).toBe(1);
    expect(limited).toBeLessThanOrEqual(oracle);
    expect(noisy).toBeLessThanOrEqual(limited);
    expect(myopic).toBeLessThanOrEqual(noisy);
    // The corpus must actually discriminate the floor, not tie everywhere.
    expect(myopic).toBeLessThan(oracle);
    expect(limited).toBeGreaterThan(0.5);
  });

  test('the limited planner needs at least as many turns as the oracle wherever both finish', () => {
    for (const testCase of corpus) {
      const limited = run(LIMITED, testCase, 1);
      const oracle = run(ORACLE, testCase, 1);
      if (limited.reached && oracle.reached) {
        expect(limited.turns, testCase.name).toBeGreaterThanOrEqual(oracle.turns);
      }
    }
  });
});

describe('contact and pushback match P3', () => {
  // A hall with junctions and a shuttle patrol; random mistakes force contacts.
  const hall = ((): Case => {
    const fixture = asciiFixture([
      '#############',
      '#S..........#',
      '#.#.#.#.#.#.#',
      '#...........#',
      '#.#.#.#.#.#.#',
      '#..........G#',
      '#############'
    ]);
    const route = [fixture.at(3, 3), fixture.at(4, 3), fixture.at(5, 3), fixture.at(6, 3), fixture.at(7, 3)];
    return {
      name: 'hall',
      graph: fixture.graph,
      timeline: timelineFor(fixture, [{ kind: 'patrol', route, period: shuttlePeriod(route.length) }]),
      start: fixture.start,
      goal: fixture.goal,
      maxTurns: 400
    };
  })();

  const chaos = { kind: 'planner-noisy', horizon: 3, mistakeProbability: 0.6, reactionDelay: 0 } as const;

  const runs = Array.from({ length: 40 }, (_, i) => run(chaos, hall, i + 1));

  test('contacts occur and each one is recorded as an event', () => {
    expect(runs.some((result) => result.contacts > 0)).toBe(true);
    for (const result of runs) {
      expect(result.contactEvents.length).toBe(result.contacts);
    }
  });

  test('every contact is a P3 occupancy or head-on swap, and no uncounted contact happens', () => {
    const { graph, timeline } = hall;
    for (const result of runs) {
      let invulnerable = 0;
      let eventIndex = 0;
      for (let turn = 1; turn <= result.turns; turn += 1) {
        const tick = turn - 1;
        const from = result.path[turn - 1]!;
        const event = result.contactEvents[eventIndex];
        const isContactTurn = event !== undefined && event.turn === turn;
        const dest = isContactTurn ? event.contactCell : result.path[turn]!;
        const occupied = timeline.enemyCellsAt(tick + 1).includes(dest);
        const before = timeline.enemyCellsAt(tick);
        const after = timeline.enemyCellsAt(tick + 1);
        const swap = dest !== from && before.some((cell, e) => cell === dest && after[e] === from);
        const physical = occupied || swap;
        if (isContactTurn) {
          expect(invulnerable, 'contact while invulnerable').toBe(0);
          expect(physical, `turn ${turn} is not a P3 contact`).toBe(true);
          invulnerable = 2;
          eventIndex += 1;
        } else {
          if (invulnerable === 0) {
            expect(physical, `turn ${turn} made uncounted contact`).toBe(false);
          } else {
            invulnerable -= 1;
          }
        }
      }
    }
  });

  test('pushback lands on resolvePushbackCell (nearest junction behind) and costs a turn, not the run', () => {
    const { graph } = hall;
    let checked = 0;
    for (const result of runs) {
      for (const event of result.contactEvents) {
        const before = result.path.slice(0, event.turn);
        const expected = resolvePushbackCell(graph, [...before, event.contactCell], before.length);
        expect(event.pushbackCell).toBe(expected);
        expect(result.path[event.turn]).toBe(expected);
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(0);
    // Contacts cost progress, not the run: bots with contacts still finish sometimes.
    expect(runs.some((result) => result.contacts > 0 && result.reached)).toBe(true);
  });

  test('invulnerableTurns = 0 removes the grace window', () => {
    const result = runBot(chaos, hall.graph, hall.timeline, {
      start: hall.start, goal: hall.goal, maxTurns: 400, seed: 3, invulnerableTurns: 0
    });
    expect(result.contactEvents.length).toBe(result.contacts);
  });
});

describe('reaction delay', () => {
  test('a delayed planner (stale enemy view) makes at least as many contacts as a prompt one on a patrol', () => {
    const prompt = { kind: 'planner-noisy', horizon: 5, mistakeProbability: 0, reactionDelay: 0 } as const;
    const late = { kind: 'planner-noisy', horizon: 5, mistakeProbability: 0, reactionDelay: 2 } as const;
    const total = (spec: BotSpec): number => corpus.reduce((sum, testCase) => sum + run(spec, testCase, 1).contacts, 0);
    expect(total(prompt)).toBe(0);
    expect(total(late)).toBeGreaterThanOrEqual(total(prompt));
  });
});
