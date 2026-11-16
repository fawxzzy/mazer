import { describe, expect, test } from 'vitest';
import {
  PLAY_INVULNERABLE_TICKS,
  computeHazardOverlay,
  computeSolvableStates,
  createHazardStateSpace,
  createHazardTimeline,
  createRewindPlanner,
  findWitnessRoute,
  type HazardGraph,
  type HazardRewindOutcome,
  type HazardSpec
} from '../../../src/mazer-core/hazards';
import { createLegacyMaze } from '../../../src/legacy-runtime/legacyMaze';
import { createLegacyMazeHazardGraph } from '../../../src/legacy-runtime/legacyHazardGraphAdapter';
import { createTestRng } from './fixtures';

interface ShippedLevel {
  readonly label: string;
  readonly graph: HazardGraph;
  readonly start: number;
  readonly goal: number;
  readonly specs: readonly HazardSpec[];
}

// Real shipped levels: production-sized wrapped boards (phone 25x51, desktop 45x27)
// with the H2 overlay's placement (Sentries + gates, validated, degraded if needed).
const shippedLevels = ((): ShippedLevel[] => {
  const levels: ShippedLevel[] = [];
  for (const [width, height] of [[25, 51], [45, 27]] as const) {
    for (const seed of [5, 23]) {
      const maze = createLegacyMaze(width, height, 20261115 + seed, undefined, {
        requiredOppositeBorderConnections: { horizontal: true, vertical: true }
      });
      const { graph, start, goal } = createLegacyMazeHazardGraph(maze);
      for (const level of [20, 36, 90, 180, 288]) {
        const overlay = computeHazardOverlay(graph, { start, goal, mazeSeed: maze.seed, level, saturationLevel: 288 });
        if (overlay.specs.some((spec) => spec.kind === 'patrol')) {
          levels.push({ label: `${width}x${height} seed ${seed} L${level}`, graph, start, goal, specs: overlay.specs });
        }
      }
    }
  }
  return levels;
})();

/** A random walk from the start along real moves (waits included, the trail records cells only). */
const randomTrail = (graph: HazardGraph, start: number, rng: () => number, maxLength: number): number[] => {
  const trail = [start];
  const steps = 1 + Math.floor(rng() * maxLength);
  for (let i = 0; i < steps; i += 1) {
    const options = graph.neighbors(trail[trail.length - 1]!);
    trail.push(options[Math.floor(rng() * options.length)]!);
  }
  return trail;
};

describe('rewind never strands the player (property, 10k random contacts on shipped levels)', () => {
  test('fixture: enough real levels with Sentries', () => {
    expect(shippedLevels.length).toBeGreaterThanOrEqual(10);
  });

  test('every rewind state reaches the goal, checked by an independent oracle', () => {
    const rng = createTestRng(0x48345257);
    const outcomes: Record<HazardRewindOutcome, number> = { junction: 0, 'previous-junction': 0, start: 0, 'start-rescue': 0, stranded: 0 };
    const contactsPerLevel = Math.ceil(10_000 / shippedLevels.length);
    let total = 0;
    for (const level of shippedLevels) {
      const timeline = createHazardTimeline(level.graph, level.specs);
      const planner = createRewindPlanner(level.graph, timeline, { start: level.start, goal: level.goal });
      expect(planner.canAlwaysRescue, level.label).toBe(true);
      // Oracle: reverse reachability over the validator's transition relation at N = 4.
      const space = createHazardStateSpace(level.graph, timeline, PLAY_INVULNERABLE_TICKS);
      const solvable = computeSolvableStates(space, level.goal);
      for (let i = 0; i < contactsPerLevel; i += 1) {
        const trail = randomTrail(level.graph, level.start, rng, 240);
        const tick = Math.floor(rng() * 4 * timeline.period) + trail.length;
        const plan = planner.planRewind(trail, trail.length, tick);
        total += 1;
        outcomes[plan.outcome] += 1;
        expect(plan.outcome, level.label).not.toBe('stranded');
        if (plan.trailIndex >= 0) {
          expect(trail[plan.trailIndex]).toBe(plan.cell);
          expect(plan.retractedCells).toBe(trail.length - 1 - plan.trailIndex);
        }
        if (plan.outcome === 'start-rescue') {
          const rescued = findWitnessRoute(level.graph, timeline, { start: plan.cell, goal: level.goal, startTick: tick, invulnerableTurns: plan.invulnerableTicks });
          expect(rescued.solvable, level.label).toBe(true);
        } else {
          expect(plan.invulnerableTicks).toBe(PLAY_INVULNERABLE_TICKS);
          const state = space.stateIndex(plan.cell, tick % timeline.period, PLAY_INVULNERABLE_TICKS);
          expect(space.entryProblem(plan.cell, tick % timeline.period, PLAY_INVULNERABLE_TICKS), level.label).toBeNull();
          expect(solvable[state], `${level.label} cell ${plan.cell} tick ${tick}`).toBe(1);
          expect(plan.routeTicks).toBeGreaterThanOrEqual(0);
        }
      }
    }
    expect(total).toBeGreaterThanOrEqual(10_000);
    expect(outcomes.stranded).toBe(0);
    // The junction rule does the work on real levels (89% on this seed set; the
    // rest are trails with no usable junction behind them, which go to the start).
    expect(outcomes.junction, JSON.stringify(outcomes)).toBeGreaterThan(total * 0.8);
  });

  test('deterministic: identical plans from a second planner, in any call order', () => {
    const level = shippedLevels[0]!;
    const timeline = createHazardTimeline(level.graph, level.specs);
    const first = createRewindPlanner(level.graph, timeline, { start: level.start, goal: level.goal });
    const second = createRewindPlanner(level.graph, createHazardTimeline(level.graph, level.specs), { start: level.start, goal: level.goal });
    const rng = createTestRng(7);
    const cases = Array.from({ length: 300 }, () => {
      const trail = randomTrail(level.graph, level.start, rng, 120);
      return { trail, tick: Math.floor(rng() * 500) };
    });
    const forward = cases.map(({ trail, tick }) => ({ ...first.planRewind(trail, trail.length, tick) }));
    const backward = [...cases].reverse().map(({ trail, tick }) => ({ ...second.planRewind(trail, trail.length, tick) })).reverse();
    expect(backward).toEqual(forward);
  });
});

describe('rewind check budget (H4: under 2 ms worst)', () => {
  test('planRewind worst case stays under 2 ms on shipped levels (min of 3 runs per contact, node 1x)', () => {
    const rng = createTestRng(99);
    let worst = 0;
    for (const level of shippedLevels) {
      const timeline = createHazardTimeline(level.graph, level.specs);
      const planner = createRewindPlanner(level.graph, timeline, { start: level.start, goal: level.goal });
      for (let i = 0; i < 200; i += 1) {
        const trail = randomTrail(level.graph, level.start, rng, 240);
        const tick = Math.floor(rng() * 4 * timeline.period);
        let best = Number.POSITIVE_INFINITY;
        for (let run = 0; run < 3; run += 1) {
          const begin = performance.now();
          planner.planRewind(trail, trail.length, tick);
          best = Math.min(best, performance.now() - begin);
        }
        worst = Math.max(worst, best);
      }
    }
    expect(worst).toBeLessThan(2);
  });
});
