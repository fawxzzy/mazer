import { describe, expect, test } from 'vitest';
import { DEFAULT_BOT_LADDER } from '../../../src/mazer-core/eval/bots';
import {
  DEFAULT_DIFFICULTY_WEIGHTS,
  checkMonotoneDifficulty,
  combineDifficultyIndex,
  computeH1,
  computeLadderCeiling,
  detectIndexPlateau,
  measureGeometry,
  measureLevelDifficulty,
  type DifficultyLevelSpec,
  type TierMeasurement
} from '../../../src/mazer-core/eval/difficultyReport';
import { asciiFixture } from '../hazards/fixtures';

describe('geometry proxy H1', () => {
  test('computeH1 follows the P2 formula', () => {
    expect(computeH1({ len: 40, turns: 10, splits: 2, dead: 5, wraps: 1 })).toBe(10 + 10 + 6 + 6 + 6);
    // dead-end term never goes negative
    expect(computeH1({ len: 0, turns: 0, splits: 0, dead: 1, wraps: 0 })).toBe(0);
  });

  test('measures a bent corridor: length, turns, splits and dead ends', () => {
    const fixture = asciiFixture([
      '#######',
      '#S...##',
      '###.###',
      '###.G##',
      '#######'
    ]);
    const geometry = measureGeometry(fixture.graph, fixture.start, fixture.goal)!;
    // route: S(1,1), (2,1), (3,1), (3,2), (3,3), G(4,3)
    expect(geometry.len).toBe(5);
    expect(geometry.turns).toBe(2);
    expect(geometry.splits).toBe(1); // (3,1) has three neighbours
    expect(geometry.dead).toBe(3); // start, (4,1), goal
    expect(geometry.wraps).toBe(0);
    expect(geometry.h1).toBe(computeH1(geometry));
  });

  test('counts a wrap edge and returns null when unreachable', () => {
    const wrapRow = asciiFixture(['S...G']);
    // a 1-row open board wraps: S at x=0 reaches G at x=4 in one wrap step
    const geometry = measureGeometry(wrapRow.graph, wrapRow.start, wrapRow.goal)!;
    expect(geometry.len).toBe(1);
    expect(geometry.wraps).toBe(1);
    const sealed = asciiFixture(['#####', '#SXG#', '#####']);
    // geometry ignores hazards: a blocker-sealed corridor is still geometrically connected
    expect(measureGeometry(sealed.graph, sealed.start, sealed.goal)).not.toBeNull();
    const walled = asciiFixture(['#####', '#S#G#', '#####']);
    expect(measureGeometry(walled.graph, walled.start, walled.goal)).toBeNull();
  });
});

describe('measureLevelDifficulty', () => {
  const rows = ['#########', '#S.....G#', '#.#####.#', '#.......#', '#########'];
  const fixture = asciiFixture(rows);
  const level = (hazards: DifficultyLevelSpec['hazards']): DifficultyLevelSpec => ({
    levelId: 'fx',
    graph: fixture.graph,
    start: fixture.start,
    goal: fixture.goal,
    hazards
  });

  test('aggregates per tier and is deterministic', () => {
    const a = measureLevelDifficulty(level([]), DEFAULT_BOT_LADDER, [1, 2, 3]);
    const b = measureLevelDifficulty(level([]), DEFAULT_BOT_LADDER, [1, 2, 3]);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.solvable).toBe(true);
    expect(a.tiers.map((tier) => tier.kind)).toEqual(['oracle', 'planner-limited', 'planner-noisy', 'myopic']);
    const oracle = a.tiers[0]!;
    expect(oracle).toMatchObject({ runs: 1, passRate: 1 });
    expect(a.tiers[1]!.runs).toBe(1); // deterministic planner collapses seeds
    expect(a.tiers[2]!.runs).toBe(3);
    expect(a.tiers[2]!.passRate).toBeGreaterThanOrEqual(0);
    expect(a.tiers[2]!.passRate).toBeLessThanOrEqual(1);
    expect(a.geometry!.len).toBe(6);
    expect(a.index).not.toBeNull();
  });

  test('a forced wait raises the combined index through the oracle term', () => {
    const open = measureLevelDifficulty(level([]), [DEFAULT_BOT_LADDER[0]!], [1]);
    const gated = measureLevelDifficulty(
      level([{ kind: 'timedGate', cell: 13, period: 4, openFrom: 2, openFor: 1 }]),
      [DEFAULT_BOT_LADDER[0]!],
      [1]
    );
    expect(gated.oracleTicks!).toBeGreaterThanOrEqual(open.oracleTicks!);
    expect(gated.index!).toBeGreaterThanOrEqual(open.index!);
  });

  test('an unsolvable level yields no index', () => {
    const sealed = asciiFixture(['#####', '#SXG#', '#####']);
    const measurement = measureLevelDifficulty(
      { graph: sealed.graph, start: sealed.start, goal: sealed.goal, hazards: sealed.blockers },
      DEFAULT_BOT_LADDER,
      [1]
    );
    expect(measurement.solvable).toBe(false);
    expect(measurement.index).toBeNull();
  });

  test('requires a seed', () => {
    expect(() => measureLevelDifficulty(level([]), DEFAULT_BOT_LADDER, [])).toThrow(RangeError);
  });

  test('combineDifficultyIndex adds weighted hazard load to H1', () => {
    const geometry = { len: 20, turns: 0, splits: 0, dead: 2, wraps: 0, h1: 5 };
    const tier = (overrides: Partial<TierMeasurement>): TierMeasurement => ({
      label: 't', kind: 'planner-limited', tier: 1, runs: 1, passRate: 1, meanTurns: 20,
      meanTurnsWhenReached: 20, meanWaits: 0, meanContacts: 0, meanMistakes: 0, meanMinEnemyDistance: null, ...overrides
    });
    expect(combineDifficultyIndex(geometry, 0, [tier({})])).toBe(5);
    const w = DEFAULT_DIFFICULTY_WEIGHTS;
    expect(combineDifficultyIndex(geometry, 2, [tier({ meanContacts: 1, meanWaits: 2, passRate: 0.5, meanTurns: 24 })]))
      .toBeCloseTo(5 + w.contact * 1 + w.wait * 2 + w.fail * 0.5 + w.effort * 4 + w.oracleWait * 2, 9);
    // the myopic floor is excluded unless asked for
    expect(combineDifficultyIndex(geometry, 0, [tier({ kind: 'myopic', passRate: 0 })])).toBe(5);
  });
});

describe('checkMonotoneDifficulty', () => {
  test('a strictly rising sequence has no violations', () => {
    const report = checkMonotoneDifficulty([1, 2, 3, 4, 5]);
    expect(report).toMatchObject({ pairs: 4, violationCount: 0, violationRate: 0, worstDrop: 0, monotone: true });
  });

  test('reports (does not assert) violations, positions and the worst drop', () => {
    const report = checkMonotoneDifficulty([10, 12, 9, 15, 14.5, 20]);
    expect(report.pairs).toBe(5);
    expect(report.violationCount).toBe(2);
    expect(report.violationRate).toBeCloseTo(0.4, 12);
    expect(report.violations).toEqual([{ position: 1, drop: 3 }, { position: 3, drop: 0.5 }]);
    expect(report.worstDrop).toBe(3);
    expect(report.monotone).toBe(false);
  });

  test('epsilon absorbs small drops and equal values are not violations', () => {
    const sequence = [10, 10, 9.6, 12, 11.9];
    expect(checkMonotoneDifficulty(sequence, { epsilon: 0 }).violationCount).toBe(2);
    expect(checkMonotoneDifficulty(sequence, { epsilon: 0.5 }).violationCount).toBe(0);
  });

  test('accepts measurements, handles tiny inputs, and rejects unsolvable entries', () => {
    expect(checkMonotoneDifficulty([{ index: 1 }, { index: 2 }]).monotone).toBe(true);
    expect(checkMonotoneDifficulty([5])).toMatchObject({ pairs: 0, violationRate: 0, monotone: true });
    expect(checkMonotoneDifficulty([])).toMatchObject({ pairs: 0, violationRate: 0 });
    expect(() => checkMonotoneDifficulty([1, { index: null }])).toThrow(RangeError);
    expect(() => checkMonotoneDifficulty([1, 2], { epsilon: -1 })).toThrow(RangeError);
  });
});

describe('detectIndexPlateau', () => {
  const ramp = (n: number, slope: number, from = 0): number[] => Array.from({ length: n }, (_, i) => from + i * slope);

  test('finds the last record before a flat run', () => {
    const sequence = [...ramp(10, 10), ...Array.from({ length: 8 }, () => 90)];
    const result = detectIndexPlateau(sequence, { tolerance: 1, minRun: 5 });
    expect(result.position).toBe(9);
    expect(result.plateauValue).toBe(90);
    expect(result.runLength).toBe(8);
  });

  test('a rising sequence has no plateau; a short flat tail is not enough', () => {
    expect(detectIndexPlateau(ramp(20, 5), { tolerance: 1, minRun: 4 }).position).toBeNull();
    const shortTail = [...ramp(10, 10), 90, 90, 90];
    expect(detectIndexPlateau(shortTail, { tolerance: 1, minRun: 5 }).position).toBeNull();
    expect(detectIndexPlateau(shortTail, { tolerance: 1, minRun: 3 }).position).toBe(9);
  });

  test('noise below the tolerance does not hide a plateau, noise above it does move the record', () => {
    const noisyFlat = [...ramp(6, 20), 100, 104, 98, 103, 99, 101, 102];
    expect(detectIndexPlateau(noisyFlat, { tolerance: 10, minRun: 5 }).position).toBe(5);
    const lateSpike = [...ramp(6, 20), 100, 100, 100, 100, 140, 100, 100];
    expect(detectIndexPlateau(lateSpike, { tolerance: 10, minRun: 5 }).position).toBeNull();
  });

  test('smoothing damps a single outlier', () => {
    const withOutlier = [...ramp(8, 20), 400, 160, 160, 160, 160, 160, 160, 160];
    const raw = detectIndexPlateau(withOutlier, { tolerance: 10, minRun: 5 });
    expect(raw.position).toBe(8);
    const smoothed = detectIndexPlateau(withOutlier, { tolerance: 10, minRun: 5, smoothSpan: 5 });
    expect(smoothed.position).not.toBe(8);
  });

  test('validates its options', () => {
    expect(() => detectIndexPlateau([1, 2], { tolerance: -1, minRun: 2 })).toThrow(RangeError);
    expect(() => detectIndexPlateau([1, 2], { tolerance: 0, minRun: 0 })).toThrow(RangeError);
    expect(() => detectIndexPlateau([1, 2], { tolerance: 0, minRun: 1, smoothSpan: 0 })).toThrow(RangeError);
    expect(detectIndexPlateau([], { tolerance: 0, minRun: 1 }).position).toBeNull();
  });
});

describe('computeLadderCeiling', () => {
  // Synthetic ladder: the corridor lengthens with the level until a cap, then repeats.
  const growingCorridor = (cap: number) => (level: number): DifficultyLevelSpec => {
    const length = Math.min(level, cap) + 4;
    const row = `S${'.'.repeat(length)}G`;
    const rows = [`#${'#'.repeat(row.length)}#`, `#${row}#`, `#${'#'.repeat(row.length)}#`];
    const fixture = asciiFixture(rows);
    return { levelId: `L${level}`, graph: fixture.graph, start: fixture.start, goal: fixture.goal, hazards: [] };
  };

  test('finds the ceiling where the structure stops growing', () => {
    const report = computeLadderCeiling(growingCorridor(12), {
      firstLevel: 1,
      lastLevel: 30,
      bots: [DEFAULT_BOT_LADDER[0]!, DEFAULT_BOT_LADDER[1]!],
      seeds: [1],
      tolerance: 0.1,
      minRun: 6
    });
    expect(report.levels.length).toBe(30);
    expect(report.unsolvableLevels).toEqual([]);
    expect(report.ceilingLevel).toBe(12);
    expect(report.ceilingIndex).toBeCloseTo(report.measurements[11]!.index!, 9);
  });

  test('reports no ceiling while the ladder is still rising', () => {
    const report = computeLadderCeiling(growingCorridor(1000), {
      firstLevel: 1,
      lastLevel: 15,
      bots: [DEFAULT_BOT_LADDER[0]!],
      seeds: [1],
      tolerance: 0.1,
      minRun: 4
    });
    expect(report.ceilingLevel).toBeNull();
    expect(checkMonotoneDifficulty(report.measurements).monotone).toBe(true);
  });

  test('lists unsolvable levels and leaves them out of the sequence', () => {
    const sealed = asciiFixture(['#####', '#SXG#', '#####']);
    const report = computeLadderCeiling(
      (level) => (level === 2
        ? { graph: sealed.graph, start: sealed.start, goal: sealed.goal, hazards: sealed.blockers }
        : growingCorridor(1000)(level)),
      { firstLevel: 1, lastLevel: 4, bots: [DEFAULT_BOT_LADDER[0]!], seeds: [1], tolerance: 0.1, minRun: 1 }
    );
    expect(report.unsolvableLevels).toEqual([2]);
    expect(report.levels).toEqual([1, 3, 4]);
  });

  test('rejects an inverted level range', () => {
    expect(() => computeLadderCeiling(growingCorridor(5), {
      firstLevel: 5, lastLevel: 1, bots: [], seeds: [1], tolerance: 0, minRun: 1
    })).toThrow(RangeError);
  });
});
