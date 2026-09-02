import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  parseConvergenceLanes,
  resolveGitCommitSha,
  resolveRepositoryRootFromAnalysisModuleUrl,
  runOneSample,
  resolvePercentile,
  summarize,
  type ConvergenceRunRecord
} from '../../scripts/analysis/mazev2ConvergenceHarness';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { createMazeV2LegacyRuntimeAdapter } from '../../src/domain/mazeV2/adapters/legacyRuntimeAdapter';
import { createMazeV2DomainMazeAdapter } from '../../src/domain/mazeV2/adapters/domainMazeAdapter';
import { MAZE_V2_CONVERGENCE_CORPUS } from '../../scripts/analysis/mazev2ConvergenceCorpus';

describe('runOneSample (Wave 1.5 PR D)', () => {
  test('a real generation succeeds and produces measured metrics', () => {
    const adapter = createMazeV2LegacyRuntimeAdapter();
    const recipe = MAZE_V2_CONVERGENCE_CORPUS[0]!;
    const record = runOneSample(adapter, recipe, 'raw-carving', 12345);
    expect(record.outcome).toBe('success');
    expect(record.errorMessage).toBeNull();
    expect(record.metrics).not.toBeNull();
    expect(record.metrics!.route.shortestPathLength).toBeGreaterThan(0);
  });

  test('does not throw when the underlying adapter throws -- records an exception outcome instead', () => {
    const throwingAdapter = {
      engineId: 'throwing-test-engine',
      engineLabel: 'Throwing test engine',
      capabilities: [],
      generateSample: () => {
        throw new Error('synthetic failure for the failure-record test');
      }
    };
    const recipe = MAZE_V2_CONVERGENCE_CORPUS[0]!;
    const record = runOneSample(throwingAdapter, recipe, 'raw-carving', 1);
    expect(record.outcome).toBe('exception');
    expect(record.errorMessage).toContain('synthetic failure');
    expect(record.metrics).toBeNull();
  });

  test('flags a sample with no walkable route as an invariant failure, not a silent success', () => {
    const noRouteAdapter = {
      engineId: 'no-route-test-engine',
      engineLabel: 'No-route test engine',
      capabilities: [],
      generateSample: (spec: { width: number; height: number }) => ({
        spec,
        support: { status: 'supported' as const, reason: null },
        canonicalMaze: {
          width: spec.width,
          height: spec.height,
          walkable: Array.from({ length: spec.height }, () => Array.from({ length: spec.width }, () => false)),
          start: { x: 0, y: 0 },
          goal: { x: spec.width - 1, y: spec.height - 1 },
          wrapPairs: []
        },
        generationDurationMs: 1,
        shortcutProvenance: null,
        realizedWidth: spec.width,
        realizedHeight: spec.height,
        engineNotes: {}
      })
    };
    const recipe = MAZE_V2_CONVERGENCE_CORPUS[0]!;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const record = runOneSample(noRouteAdapter as any, recipe, 'raw-carving', 1);
    expect(record.outcome).toBe('invariant-failure');
    expect(record.errorMessage).toContain('no walkable route');
  });
});

describe('resolvePercentile', () => {
  test('returns null for an empty array', () => {
    expect(resolvePercentile([], 0.5)).toBeNull();
  });

  test('resolves the median of a sorted array', () => {
    expect(resolvePercentile([1, 2, 3, 4, 5], 0.5)).toBe(3);
  });

  test('resolves a high percentile toward the end of the array', () => {
    const sorted = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(resolvePercentile(sorted, 0.99)).toBe(100);
  });
});

describe('parseConvergenceLanes', () => {
  test('uses both explicit lanes by default and accepts a unique subset', () => {
    expect(parseConvergenceLanes(undefined)).toEqual(['raw-carving', 'production-pipeline']);
    expect(parseConvergenceLanes('production-pipeline')).toEqual(['production-pipeline']);
  });

  test.each(['', 'raw-carving,', 'typo', 'raw-carving,raw-carving'])(
    'rejects an empty, unknown, or duplicate lane list: %j',
    (value) => {
      expect(() => parseConvergenceLanes(value)).toThrow();
    }
  );
});

describe('convergence source provenance', () => {
  test('resolves the repository root from the ESM module URL and returns an exact commit SHA', () => {
    const scriptUrl = pathToFileURL(resolve(process.cwd(), 'scripts/analysis/mazev2-convergence.ts')).href;
    const repoRoot = resolveRepositoryRootFromAnalysisModuleUrl(scriptUrl);
    expect(resolve(repoRoot)).toBe(resolve(process.cwd()));
    expect(resolveGitCommitSha(repoRoot)).toMatch(/^[0-9a-f]{40}$/);
  });

  test('classifies the default compact artifact as gitignored local scratch, not committed evidence', () => {
    const script = readFileSync(resolve(process.cwd(), 'scripts/analysis/mazev2-convergence.ts'), 'utf8');
    const gitignore = readFileSync(resolve(process.cwd(), '.gitignore'), 'utf8');
    expect(script).toContain("const DEFAULT_OUTPUT_DIR = './tmp/mazev2-convergence';");
    expect(script).toContain('compact artifact remains ignored');
    expect(script).not.toContain('committed compact evidence summary');
    expect(gitignore.split(/\r?\n/u)).toContain('/tmp/');
  });
});

describe('summarize (Wave 1.5 PR D)', () => {
  const baseRecord: ConvergenceRunRecord = {
    engineId: 'test-engine',
    recipeName: 'test-recipe',
    lane: 'raw-carving',
    seed: 1,
    outcome: 'success',
    errorMessage: null,
    generationDurationMs: 10,
    requestedWidth: 20,
    requestedHeight: 20,
    realizedWidth: 20,
    realizedHeight: 20,
    engineNotes: {},
    metrics: {
      contractVersion: 'mazev2-contract-v2',
      spatial: { width: 20, height: 20, walkableTileCount: 100, floorRatio: 0.25 },
      route: { shortestPathLength: 10, manhattanDistance: 8, detourRatio: 1.25, routeCoverage: 0.1, directFloorPathLength: 10, directFloorDetourRatio: 1.25 },
      decision: { junctionCount: 2, junctionDensity: 0.02, routeJunctionCount: 1, meanJunctionDegree: 3, maxJunctionDegree: 3 },
      deadEnd: { deadEndCount: 1, meanDeadEndDepth: 2, maxDeadEndDepth: 2, deceptiveBranchFraction: 0 },
      turning: { turnCount: 1, turnRatio: 0.1, meanStraightRunLength: 5, maxStraightRunLength: 5, straightRunLengthVariance: 0 },
      ambiguity: { cycleRank: 0 },
      shortcut: { shortcutCount: 3, routeLengthReduction: null },
      wrap: { wrapPairCount: 0, wrapPairsOnRoute: 0, wrapRouteImpact: null },
      metricFingerprint: 'deadbeef' as never
    }
  };

  test('never fabricates a mean shortcut count of 0 when no sample measured shortcuts', () => {
    const unmeasured: ConvergenceRunRecord = {
      ...baseRecord,
      metrics: { ...baseRecord.metrics!, shortcut: { shortcutCount: null, routeLengthReduction: null } }
    };
    const [summary] = summarize([unmeasured]);
    expect(summary!.meanShortcutCount).toBeNull();
    expect(summary!.shortcutMeasuredSampleCount).toBe(0);
  });

  test('computes a real mean shortcut count when samples do measure it', () => {
    const [summary] = summarize([baseRecord, { ...baseRecord, seed: 2 }]);
    expect(summary!.meanShortcutCount).toBe(3);
    expect(summary!.shortcutMeasuredSampleCount).toBe(2);
  });

  test('keeps failed samples in the sample count without crashing on their null metrics', () => {
    const failed: ConvergenceRunRecord = {
      ...baseRecord,
      seed: 2,
      outcome: 'exception',
      errorMessage: 'boom',
      metrics: null,
      generationDurationMs: null
    };
    const [summary] = summarize([baseRecord, failed]);
    expect(summary!.sampleCount).toBe(2);
    expect(summary!.successCount).toBe(1);
    expect(summary!.exceptionCount).toBe(1);
  });

  test('keeps explicitly unsupported samples out of metric means without counting them as failures', () => {
    const unsupported: ConvergenceRunRecord = {
      ...baseRecord,
      seed: 2,
      outcome: 'unsupported',
      errorMessage: 'rectangular production lane unsupported',
      metrics: null
    };
    const [summary] = summarize([baseRecord, unsupported]);
    expect(summary!.sampleCount).toBe(2);
    expect(summary!.successCount).toBe(1);
    expect(summary!.unsupportedCount).toBe(1);
    expect(summary!.exceptionCount).toBe(0);
    expect(summary!.invariantFailureCount).toBe(0);
    expect(summary!.meanShortestPathLength).toBe(10);
  });

  test('groups separately by recipe, engine, AND lane -- never blends two lanes into one row', () => {
    const otherLane: ConvergenceRunRecord = { ...baseRecord, lane: 'production-pipeline' };
    const summaries = summarize([baseRecord, otherLane]);
    expect(summaries).toHaveLength(2);
    expect(new Set(summaries.map((s) => s.lane))).toEqual(new Set(['raw-carving', 'production-pipeline']));
  });
});

describe('createMazeV2DomainMazeAdapter production-pipeline lane (Wave 1.5 PR D)', () => {
  test('exercises the higher-level generateMazeForDifficulty entry point, not just raw buildMaze', () => {
    const adapter = createMazeV2DomainMazeAdapter();
    const recipe = MAZE_V2_CONVERGENCE_CORPUS.find((r) => r.name === 'baseline-small')!;
    const record = runOneSample(adapter, recipe, 'production-pipeline', 999);
    expect(record.outcome).toBe('success');
    expect(record.engineNotes?.targetDifficulty).toBe('chill');
    expect(record.engineNotes?.achievedDifficulty).toBe('standard');
    expect(record.engineNotes?.reportedCanonicalDifficulty).toBe('chill');
  });

  test('classifies a rectangular production-pipeline sample as unsupported rather than a successful square measurement', () => {
    const adapter = createMazeV2DomainMazeAdapter();
    const recipe = MAZE_V2_CONVERGENCE_CORPUS.find((r) => r.name === 'wide-rectangular-footprint')!;
    const record = runOneSample(adapter, recipe, 'production-pipeline', 999);
    expect(record.outcome).toBe('unsupported');
    expect(record.errorMessage).toContain('rectangular');
    expect(record.metrics).toBeNull();
  });

  test.each(['raw-carving', 'production-pipeline'] as const)(
    'classifies explicit wrap demand as unsupported in the %s lane',
    (lane) => {
      const adapter = createMazeV2DomainMazeAdapter();
      const recipe = MAZE_V2_CONVERGENCE_CORPUS.find((r) => r.name === 'explicit-wrap-bleed-demand')!;
      const record = runOneSample(adapter, recipe, lane, 999);
      expect(record.outcome).toBe('unsupported');
      expect(record.errorMessage).toContain('wrap');
      expect(record.metrics).toBeNull();
    }
  );
});
