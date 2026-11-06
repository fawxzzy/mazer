import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import {
  createHazardGraph,
  shuttlePeriod,
  validateLevelHazards,
  type HazardCellId,
  type HazardGraph,
  type HazardSpec
} from '../../../src/mazer-core/hazards';
import { resolveHazardLoadout } from '../../../src/mazer-core/hazards/loadout';
import {
  FIRST_ENCOUNTER_CLEARANCE,
  HAZARD_CELLS_PER_HAZARD,
  maxHazardsForMaze,
  mix32,
  placeLevelHazards,
  screenHazardPlacement,
  serializePlacement,
  type HazardPlacementResult,
  type PlacementKind,
  type PlacementLoadout
} from '../../../src/mazer-core/hazards/placement';
import { createLegacyMaze } from '../../../src/legacy-runtime/legacyMaze';
import { createLegacyMazeHazardGraph } from '../../../src/legacy-runtime/legacyHazardGraphAdapter';
import { asciiFixture } from './fixtures';

const WRAP_PROFILE = { requiredOppositeBorderConnections: { horizontal: true, vertical: true } };

interface CorpusMaze {
  readonly label: string;
  readonly graph: HazardGraph;
  readonly start: HazardCellId;
  readonly goal: HazardCellId;
}

const productionMaze = (width: number, height: number, seed: number): CorpusMaze => {
  const maze = createLegacyMaze(width, height, seed, undefined, WRAP_PROFILE);
  const { graph, start, goal } = createLegacyMazeHazardGraph(maze);
  return { label: `${width}x${height}#${seed}`, graph, start, goal };
};

// Phone (25 wide x 51 tall), desktop (45x27), landscape (51x25) and a small board.
const corpus: CorpusMaze[] = [
  ...[1, 7, 20261105].flatMap((seed) => [
    productionMaze(25, 51, seed),
    productionMaze(45, 27, seed),
    productionMaze(51, 25, seed)
  ]),
  productionMaze(25, 25, 3),
  productionMaze(15, 15, 11)
];

const corridorMaze = (): CorpusMaze => {
  const fixture = asciiFixture([
    '#################',
    '#S.............G#',
    '#################'
  ]);
  return { label: 'corridor', graph: fixture.graph, start: fixture.start, goal: fixture.goal };
};

const distanceMask = (graph: HazardGraph, sources: readonly HazardCellId[], radius: number): Set<HazardCellId> => {
  const seen = new Set<HazardCellId>(sources);
  let frontier = [...sources];
  for (let step = 0; step < radius; step += 1) {
    const next: HazardCellId[] = [];
    for (const cell of frontier) {
      for (const neighbor of graph.neighbors(cell)) {
        if (!seen.has(neighbor)) {
          seen.add(neighbor);
          next.push(neighbor);
        }
      }
    }
    frontier = next;
  }
  return seen;
};

const cellsOf = (spec: HazardSpec): readonly HazardCellId[] => (spec.kind === 'patrol' ? spec.route : [spec.cell]);

const assertPlacementValid = (maze: CorpusMaze, result: HazardPlacementResult, label: string): void => {
  const { graph, start, goal } = maze;
  // Independent re-validation with the default two invulnerable turns.
  const verdict = validateLevelHazards(graph, result.specs, { start, goal });
  expect(verdict.invulnerableTurns, label).toBe(2);
  expect(verdict.hazardsPresent.pass, `${label} hazardsPresent`).toBe(true);
  expect(verdict.postContact.pass, `${label} postContact`).toBe(true);
  expect(verdict.itemsAbsent.pass, `${label} itemsAbsent`).toBe(true);
  expect(verdict.pass, label).toBe(true);
  expect(result.verdict.pass, label).toBe(true);
  expect(result.specs.length, `${label} density`).toBeLessThanOrEqual(result.capacity);
  const guarded = distanceMask(graph, [start, goal], 1);
  const used = new Set<HazardCellId>();
  for (const spec of result.specs) {
    for (const cell of cellsOf(spec)) {
      expect(graph.isWalkable(cell), `${label} walkable`).toBe(true);
      expect(guarded.has(cell), `${label} protected cell ${cell}`).toBe(false);
    }
    if (spec.kind !== 'patrol') {
      expect(used.has(spec.cell), `${label} duplicate cell`).toBe(false);
      used.add(spec.cell);
    }
    if (spec.kind === 'timedGate') {
      expect(spec.period).toBeGreaterThanOrEqual(3);
      expect(spec.period).toBeLessThanOrEqual(6);
      expect(spec.openFor / spec.period).toBeGreaterThanOrEqual(0.5);
    }
    if (spec.kind === 'patrol') {
      expect(spec.route.length).toBeGreaterThanOrEqual(3);
      expect(spec.route.length).toBeLessThanOrEqual(7);
      expect(spec.period).toBe(shuttlePeriod(spec.route.length));
    }
  }
};

const cell = (maze: CorpusMaze) => ({ graph: maze.graph, start: maze.start, goal: maze.goal });

describe('mix32 (seed mixing)', () => {
  test('is a pure function of its arguments and spreads nearby inputs', () => {
    expect(mix32(1, 2, 3)).toBe(mix32(1, 2, 3));
    expect(mix32(1, 2, 3)).not.toBe(mix32(1, 2, 4));
    expect(mix32(1, 2, 3)).not.toBe(mix32(3, 2, 1));
    expect(mix32(20261105, 1, 0)).toBeGreaterThanOrEqual(0);
    expect(mix32(20261105, 1, 0)).toBeLessThan(2 ** 32);
    const seen = new Set(Array.from({ length: 256 }, (_, i) => mix32(7, 1, i)));
    expect(seen.size).toBe(256);
  });
});

describe('hazard placement (DRAFT)', () => {
  test('is deterministic: identical inputs give byte-identical JSON', () => {
    for (const maze of [corpus[0]!, corpus[4]!, corpus[8]!]) {
      for (const level of [6, 11, 16, 30]) {
        const options = {
          start: maze.start,
          goal: maze.goal,
          seed: 4242 + level,
          loadout: resolveHazardLoadout(level)
        };
        const first = serializePlacement(placeLevelHazards(maze.graph, options));
        const second = serializePlacement(placeLevelHazards(maze.graph, options));
        expect(second, `${maze.label} L${level}`).toBe(first);
      }
    }
  });

  test('different seeds vary the result on the same maze', () => {
    const maze = corpus[0]!;
    const loadout = resolveHazardLoadout(25);
    const outputs = new Set(
      [1, 2, 3, 4, 5].map((seed) => serializePlacement(placeLevelHazards(maze.graph, { ...cell(maze), seed, loadout })))
    );
    expect(outputs.size).toBeGreaterThan(1);
  });

  test('every placement on the production corpus passes the validator (hazards present, post-contact, items absent)', () => {
    let placedTotal = 0;
    for (const maze of corpus) {
      const capacity = maxHazardsForMaze(maze.graph, { start: maze.start, goal: maze.goal });
      for (const level of [6, 11, 16, 25, 40]) {
        const loadout = resolveHazardLoadout(level, { capacity });
        const result = placeLevelHazards(maze.graph, { ...cell(maze), seed: mix32(level, 99), loadout });
        const label = `${maze.label} L${level}`;
        assertPlacementValid(maze, result, label);
        placedTotal += result.specs.length;
        expect(result.attempts, label).toBeGreaterThanOrEqual(1);
        expect(result.placed.blockers).toBeLessThanOrEqual(result.target.blockers);
        expect(result.placed.timedGates).toBeLessThanOrEqual(result.target.timedGates);
        expect(result.placed.patrols).toBeLessThanOrEqual(result.target.patrols);
        expect(result.degraded).toBe(
          result.placed.blockers + result.placed.timedGates + result.placed.patrols
            < result.target.blockers + result.target.timedGates + result.target.patrols
        );
      }
    }
    // The corpus must actually host hazards (guards against a vacuous all-empty pass).
    expect(placedTotal).toBeGreaterThan(corpus.length * 10);
  }, 120_000);

  test('a loadout of every kind places all kinds on a roomy maze', () => {
    const maze = corpus[8]!; // 51x25
    const loadout = resolveHazardLoadout(25);
    const result = placeLevelHazards(maze.graph, { ...cell(maze), seed: 5, loadout });
    expect(result.placed.blockers).toBeGreaterThan(0);
    expect(result.placed.timedGates).toBeGreaterThan(0);
    expect(result.placed.patrols).toBeGreaterThan(0);
    assertPlacementValid(maze, result, 'roomy');
  });

  test('blockers never sit on a separator cell and never disconnect the goal', () => {
    for (const maze of corpus.slice(0, 6)) {
      const result = placeLevelHazards(maze.graph, {
        ...cell(maze),
        seed: 17,
        loadout: { blockers: 6, timedGates: 0, patrols: 0 }
      });
      const blockerCells = new Set(result.specs.filter((spec) => spec.kind === 'blocker').map((spec) => (spec as { cell: number }).cell));
      expect(blockerCells.size, maze.label).toBeGreaterThan(0);
      // Reachable with all blockers removed from the graph.
      const seen = new Set<number>([maze.start]);
      const queue = [maze.start];
      while (queue.length > 0) {
        const current = queue.shift()!;
        for (const next of maze.graph.neighbors(current)) {
          if (!seen.has(next) && !blockerCells.has(next)) {
            seen.add(next);
            queue.push(next);
          }
        }
      }
      expect(seen.has(maze.goal), maze.label).toBe(true);
    }
  });

  test.each([
    ['blocker', 6],
    ['timedGate', 11],
    ['patrol', 16]
  ] as const)('first encounter of %s (level %i): one hazard, alone, with a safe configuration', (kind, level) => {
    let satisfied = 0;
    for (const maze of corpus) {
      const capacity = maxHazardsForMaze(maze.graph, { start: maze.start, goal: maze.goal });
      const loadout = resolveHazardLoadout(level, { capacity });
      expect(loadout.firstEncounter[kind]).toBe(true);
      const result = placeLevelHazards(maze.graph, { ...cell(maze), seed: mix32(level, 7), loadout });
      const label = `${maze.label} first ${kind}`;
      assertPlacementValid(maze, result, label);
      const counts: Record<PlacementKind, number> = {
        blocker: result.placed.blockers,
        timedGate: result.placed.timedGates,
        patrol: result.placed.patrols
      };
      expect(counts[kind], label).toBeLessThanOrEqual(1);
      expect(result.firstEncounter?.kind).toBe(kind);
      if (!result.firstEncounter?.placed) {
        continue;
      }
      satisfied += 1;
      expect(counts[kind], label).toBe(1);
      // The independent first-encounter screen accepts the exact result.
      const screen = screenHazardPlacement(maze.graph, result.specs, { ...cell(maze), firstEncounterKind: kind });
      expect(screen.reasons, label).toEqual([]);
      // Alone: no other hazard within the clearance radius of the new one.
      const first = result.specs.find((spec) => spec.kind === kind)!;
      const zone = distanceMask(maze.graph, [...cellsOf(first)], FIRST_ENCOUNTER_CLEARANCE);
      for (const other of result.specs.filter((spec) => spec !== first)) {
        for (const otherCell of cellsOf(other)) {
          expect(zone.has(otherCell), `${label} clearance`).toBe(false);
        }
      }
      if (first.kind === 'timedGate') {
        expect(first.period - first.openFor).toBeLessThanOrEqual(1);
      }
    }
    expect(satisfied).toBeGreaterThanOrEqual(corpus.length - 2);
  }, 120_000);

  test('only one new kind per level: a second flagged kind is dropped', () => {
    const maze = corpus[8]!;
    const loadout: PlacementLoadout = {
      blockers: 3,
      timedGates: 3,
      patrols: 3,
      firstEncounter: { timedGate: true, patrol: true }
    };
    const result = placeLevelHazards(maze.graph, { ...cell(maze), seed: 3, loadout });
    expect(result.target.timedGates).toBe(1);
    expect(result.target.patrols).toBe(0);
    expect(result.placed.patrols).toBe(0);
    expect(result.placed.timedGates).toBeLessThanOrEqual(1);
    assertPlacementValid(maze, result, 'two flagged kinds');
  });

  test('density is capped by maxHazardsForMaze and reported', () => {
    const maze = corpus[8]!;
    const capacity = maxHazardsForMaze(maze.graph, { start: maze.start, goal: maze.goal });
    expect(capacity).toBeGreaterThan(5);
    expect(capacity).toBeLessThanOrEqual(Math.floor(maze.graph.walkableCellCount / HAZARD_CELLS_PER_HAZARD));
    const huge = placeLevelHazards(maze.graph, {
      ...cell(maze),
      seed: 9,
      loadout: { blockers: 40, timedGates: 40, patrols: 40 }
    });
    expect(huge.capacity).toBe(capacity);
    expect(huge.capped).toBe(true);
    expect(huge.specs.length).toBeLessThanOrEqual(capacity);
    expect(huge.target.blockers + huge.target.timedGates + huge.target.patrols).toBeLessThanOrEqual(capacity);
    assertPlacementValid(maze, huge, 'huge');

    const tight = placeLevelHazards(maze.graph, {
      ...cell(maze),
      seed: 9,
      capacity: 3,
      loadout: { blockers: 5, timedGates: 5, patrols: 5 }
    });
    expect(tight.specs.length).toBeLessThanOrEqual(3);
    expect(tight.capacity).toBe(3);
    assertPlacementValid(maze, tight, 'tight');
  });

  test('capacity shrinks with walkable space and structure; a corridor hosts at most one hazard', () => {
    const corridor = corridorMaze();
    expect(maxHazardsForMaze(corridor.graph)).toBe(0); // 15 cells: below one hazard per 24
    const longCorridor = asciiFixture([
      `#${'#'.repeat(60)}#`,
      `#S${'.'.repeat(58)}G#`,
      `#${'#'.repeat(60)}#`
    ]);
    expect(maxHazardsForMaze(longCorridor.graph)).toBe(1);
    expect(maxHazardsForMaze(longCorridor.graph, { start: longCorridor.start, goal: longCorridor.goal })).toBe(1);
    const small = productionMaze(15, 15, 11);
    const large = productionMaze(51, 25, 1);
    expect(maxHazardsForMaze(large.graph)).toBeGreaterThanOrEqual(maxHazardsForMaze(small.graph));
  });

  test('unsolvable-by-construction attempts are rejected by the screen', () => {
    const corridor = asciiFixture([
      '#############',
      '#S.........G#',
      '#############'
    ]);
    const { graph, start, goal } = corridor;
    const options = { start, goal, capacity: 8 };

    // A blocker in a corridor cuts the only route.
    const blocked = screenHazardPlacement(graph, [{ kind: 'blocker', cell: corridor.at(5, 1) }], options);
    expect(blocked.accepted).toBe(false);
    expect(blocked.reasons).toContain('validator-failed');
    expect(blocked.verdict.hazardsPresent.pass).toBe(false);

    // A head-on shuttle patrol that fills a corridor with no pocket.
    const route = [4, 5, 6, 7].map((x) => corridor.at(x, 1));
    const patrol = screenHazardPlacement(
      graph,
      [{ kind: 'patrol', route, period: shuttlePeriod(route.length) }],
      options
    );
    expect(patrol.accepted).toBe(false);
    expect(patrol.reasons).toContain('validator-failed');

    // A permanently closed gate.
    const closed = screenHazardPlacement(
      graph,
      [{ kind: 'timedGate', cell: corridor.at(5, 1), period: 4, openFrom: 0, openFor: 0 }],
      options
    );
    expect(closed.accepted).toBe(false);

    // Hazards beside the endpoints, and more hazards than the density cap.
    const adjacent = screenHazardPlacement(graph, [{ kind: 'blocker', cell: corridor.at(2, 1) }], options);
    expect(adjacent.reasons).toContain('protected-cell');
    const dense = screenHazardPlacement(
      graph,
      [4, 5, 6].map((x) => ({ kind: 'timedGate', cell: corridor.at(x, 1), period: 4, openFrom: x % 4, openFor: 3 }) as HazardSpec),
      { ...options, capacity: 2 }
    );
    expect(dense.reasons).toContain('over-density');

    // A waitable gate in the corridor is fine.
    const gate = screenHazardPlacement(
      graph,
      [{ kind: 'timedGate', cell: corridor.at(5, 1), period: 4, openFrom: 1, openFor: 3 }],
      options
    );
    expect(gate.accepted).toBe(true);
  });

  test('the screen enforces the first-encounter rule', () => {
    const maze = corpus[8]!;
    const base = placeLevelHazards(maze.graph, {
      ...cell(maze),
      seed: 12,
      loadout: { blockers: 2, timedGates: 0, patrols: 0 }
    });
    expect(base.specs.length).toBe(2);
    // Two blockers while claiming a first encounter of blockers: count is not one.
    const count = screenHazardPlacement(maze.graph, base.specs, { ...cell(maze), firstEncounterKind: 'blocker' });
    expect(count.reasons).toContain('first-encounter-count');
    // A gate with a long wait window is not an obvious first gate.
    const first = base.specs[0] as { cell: number };
    const shortWait = screenHazardPlacement(
      maze.graph,
      [{ kind: 'timedGate', cell: first.cell, period: 6, openFrom: 0, openFor: 3 }],
      { ...cell(maze), firstEncounterKind: 'timedGate' }
    );
    expect(shortWait.reasons).toContain('first-encounter-wait-too-long');
  });

  test('a corridor never receives hazards that cannot be passed', () => {
    const corridor = corridorMaze();
    const result = placeLevelHazards(corridor.graph, {
      ...cell(corridor),
      seed: 1,
      capacity: 6,
      loadout: { blockers: 5, timedGates: 0, patrols: 5 }
    });
    expect(result.placed.blockers).toBe(0);
    expect(result.placed.patrols).toBe(0);
    expect(result.verdict.pass).toBe(true);
    expect(result.specs).toEqual([]);

    const long = asciiFixture([
      `#${'#'.repeat(40)}#`,
      `#S${'.'.repeat(38)}G#`,
      `#${'#'.repeat(40)}#`
    ]);
    const withGate = placeLevelHazards(long.graph, {
      start: long.start,
      goal: long.goal,
      seed: 1,
      capacity: 7,
      loadout: { blockers: 3, timedGates: 2, patrols: 2 }
    });
    expect(withGate.verdict.pass).toBe(true);
    expect(withGate.placed.blockers).toBe(0);
    expect(withGate.placed.patrols).toBe(0);
    expect(withGate.placed.timedGates).toBeGreaterThan(0);
  });

  test('degraded placements still pass the validator (never an unsolvable level)', () => {
    let degraded = 0;
    for (const maze of corpus) {
      const result = placeLevelHazards(maze.graph, {
        ...cell(maze),
        seed: 31,
        loadout: resolveHazardLoadout(60)
      });
      assertPlacementValid(maze, result, `${maze.label} L60`);
      if (result.degraded) {
        degraded += 1;
      }
    }
    console.info(`hazard-placement degraded at level 60 (uncapped loadout): ${degraded}/${corpus.length}`);
  }, 120_000);

  test('rejects malformed requests', () => {
    const maze = corpus[0]!;
    expect(() => placeLevelHazards(maze.graph, { ...cell(maze), seed: 1.5, loadout: { blockers: 1, timedGates: 0, patrols: 0 } }))
      .toThrow(RangeError);
    expect(() => placeLevelHazards(maze.graph, { ...cell(maze), seed: 1, loadout: { blockers: -1, timedGates: 0, patrols: 0 } }))
      .toThrow(RangeError);
  });

  test('a graph with a single walkable cell is handled', () => {
    const graph = createHazardGraph({ width: 1, height: 1, grid: [[true]] });
    const result = placeLevelHazards(graph, { start: 0, goal: 0, seed: 1, loadout: { blockers: 3, timedGates: 1, patrols: 1 } });
    expect(result.specs).toEqual([]);
    expect(result.verdict.pass).toBe(true);
  });
});

describe('hazard placement performance (51x25)', () => {
  const median = (values: number[]): number => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]!;
  const maze = productionMaze(51, 25, 20261105);

  test.each([25, 40])('median placement time for the level %i loadout is under 500 ms', (level) => {
    const capacity = maxHazardsForMaze(maze.graph, { start: maze.start, goal: maze.goal });
    const loadout = resolveHazardLoadout(level, { capacity });
    const run = () => placeLevelHazards(maze.graph, { ...cell(maze), seed: 77, loadout });
    run(); // warm up
    const samples: number[] = [];
    let last: HazardPlacementResult | null = null;
    for (let i = 0; i < 5; i += 1) {
      const begin = performance.now();
      last = run();
      samples.push(performance.now() - begin);
    }
    const elapsed = median(samples);
    console.info(
      `hazard-placement perf L${level} median=${elapsed.toFixed(1)}ms max=${Math.max(...samples).toFixed(1)}ms `
      + `placed=${last!.placed.blockers}/${last!.placed.timedGates}/${last!.placed.patrols} attempts=${last!.attempts}`
    );
    expect(last!.verdict.pass).toBe(true);
    expect(elapsed).toBeLessThan(500);
  }, 120_000);
});

describe('placement and loadout sources stay pure', () => {
  test.each(['placement.ts', 'loadout.ts'])('%s has no randomness, clock, scene or legacy-runtime dependency', (name) => {
    const source = readFileSync(new URL(`../../../src/mazer-core/hazards/${name}`, import.meta.url), 'utf8');
    expect(source).not.toMatch(/\bMath\.random\b|\bDate\.now\b|\bperformance\.now\b|\bnew Date\b/);
    expect(source).not.toMatch(/from\s+['"][^'"]*(legacy-runtime|scenes|phaser)/i);
    expect(source).not.toMatch(/\bwindow\b|\bdocument\b/);
  });

  test('neither module is exported from the mazer-core barrel', () => {
    const barrel = readFileSync(new URL('../../../src/mazer-core/index.ts', import.meta.url), 'utf8');
    expect(barrel).not.toMatch(/hazards/);
  });
});
