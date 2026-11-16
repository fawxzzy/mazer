import { describe, expect, test } from 'vitest';
import {
  MAX_SENTRIES,
  computeHazardOverlay,
  createHazardTimeline,
  createSentryField,
  shuttlePeriod,
  type HazardSpec
} from '../../../src/mazer-core/hazards';
import { createLegacyMaze } from '../../../src/legacy-runtime/legacyMaze';
import { createLegacyMazeHazardGraph } from '../../../src/legacy-runtime/legacyHazardGraphAdapter';
import { asciiFixture } from './fixtures';

const corridor = asciiFixture([
  '###########',
  '#S.......G#',
  '###########'
]);
const rail = (from: number, length: number): number[] => Array.from({ length }, (_, i) => corridor.at(from + i, 1));

describe('Sentry motion', () => {
  test('a shuttle walks its rail one cell per tick, forward then back, with no dwell', () => {
    const field = createSentryField(corridor.graph, [{ kind: 'patrol', route: rail(3, 3), period: shuttlePeriod(3) }]);
    expect(field.count).toBe(1);
    expect(field.period).toBe(4);
    const xs = Array.from({ length: 9 }, (_, tick) => corridor.graph.cellX(field.cellAt(0, tick)));
    expect(xs).toEqual([3, 4, 5, 4, 3, 4, 5, 4, 3]);
    expect(field.rail(0)).toEqual(rail(3, 3));
  });

  test('positions match the validator timeline for every tick, negative ticks included', () => {
    const specs: HazardSpec[] = [
      { kind: 'patrol', route: rail(2, 4), period: shuttlePeriod(4), phase: 1 },
      { kind: 'timedGate', cell: corridor.at(8, 1), period: 3, openFrom: 0, openFor: 2 },
      { kind: 'patrol', route: rail(5, 2), period: shuttlePeriod(2) }
    ];
    const field = createSentryField(corridor.graph, specs);
    const timeline = createHazardTimeline(corridor.graph, specs);
    expect(field.count).toBe(2);
    const out = new Int32Array(MAX_SENTRIES);
    for (let tick = -13; tick < 40; tick += 1) {
      expect(field.writeCellsAt(tick, out)).toBe(2);
      expect(Array.from(out.subarray(0, 2))).toEqual([...timeline.enemyCellsAt(tick)]);
      expect(field.cellAt(1, tick)).toBe(timeline.enemyCellsAt(tick)[1]);
    }
  });

  test('deterministic: a pure function of the spec and the tick, independent of call order', () => {
    const specs: HazardSpec[] = [{ kind: 'patrol', route: rail(2, 5), period: shuttlePeriod(5), phase: 3 }];
    const a = createSentryField(corridor.graph, specs);
    const b = createSentryField(corridor.graph, specs);
    const forward = Array.from({ length: 30 }, (_, tick) => a.cellAt(0, tick));
    const backward = Array.from({ length: 30 }, (_, i) => b.cellAt(0, 29 - i)).reverse();
    expect(backward).toEqual(forward);
  });

  test(`at most ${MAX_SENTRIES} Sentries per board`, () => {
    const five = Array.from({ length: MAX_SENTRIES + 1 }, (): HazardSpec => (
      { kind: 'patrol', route: rail(3, 2), period: shuttlePeriod(2) }
    ));
    expect(() => createSentryField(corridor.graph, five)).toThrow(RangeError);
    expect(createSentryField(corridor.graph, five.slice(0, MAX_SENTRIES)).count).toBe(MAX_SENTRIES);
  });

  test('an invalid rail throws like the timeline does', () => {
    expect(() => createSentryField(corridor.graph, [{ kind: 'patrol', route: [corridor.at(2, 1), corridor.at(4, 1)], period: 2 }])).toThrow();
    expect(() => createSentryField(corridor.graph, [{ kind: 'patrol', route: rail(2, 3), period: 3 }])).toThrow();
  });

  test('no Sentries: empty field with period 1', () => {
    const field = createSentryField(corridor.graph, [{ kind: 'timedGate', cell: corridor.at(4, 1), period: 2, openFrom: 0, openFor: 1 }]);
    expect(field.count).toBe(0);
    expect(field.period).toBe(1);
    expect(() => field.cellAt(0, 0)).toThrow(RangeError);
  });

  test('every overlay placement builds a field within the cap, and is deterministic from the seed', () => {
    let fields = 0;
    for (const seed of [3, 17]) {
      const maze = createLegacyMaze(25, 51, 20261115 + seed, undefined, {
        requiredOppositeBorderConnections: { horizontal: true, vertical: true }
      });
      const { graph, start, goal } = createLegacyMazeHazardGraph(maze);
      for (const level of [20, 60, 120, 240]) {
        const run = () => computeHazardOverlay(graph, { start, goal, mazeSeed: maze.seed, level, saturationLevel: 288 });
        const first = createSentryField(graph, run().specs);
        const second = createSentryField(graph, run().specs);
        expect(first.count).toBeLessThanOrEqual(MAX_SENTRIES);
        for (let tick = 0; tick < 50; tick += 1) {
          for (let i = 0; i < first.count; i += 1) {
            expect(second.cellAt(i, tick)).toBe(first.cellAt(i, tick));
          }
        }
        if (first.count > 0) fields += 1;
      }
    }
    expect(fields).toBeGreaterThan(3);
  });
});
