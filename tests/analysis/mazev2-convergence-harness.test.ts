import { describe, expect, test } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import {
  assertExpectedCleanGitCommitSha,
  parseConvergenceLanes,
  resolveCleanGitCommitSha,
  resolveConvergenceExitCode,
  resolveGitCommitSha,
  resolveRepositoryRootFromAnalysisModuleUrl,
  runOneSample,
  runOneSampleInChild,
  resolvePercentile,
  summarize,
  writeConvergenceArtifactSet,
  type ConvergenceRunRecord
} from '../../scripts/analysis/mazev2ConvergenceHarness';
import { pathToFileURL } from 'node:url';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { createMazeV2LegacyRuntimeAdapter } from '../../src/domain/mazeV2/adapters/legacyRuntimeAdapter';
import { createMazeV2DomainMazeAdapter } from '../../src/domain/mazeV2/adapters/domainMazeAdapter';
import { MAZE_V2_CONVERGENCE_CORPUS } from '../../scripts/analysis/mazev2ConvergenceCorpus';
import { MAZE_V2_CONTRACT_VERSION } from '../../src/domain/mazeV2/types';

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
      assessSupport: () => ({ status: 'supported' as const, reason: null }),
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
      assessSupport: () => ({ status: 'supported' as const, reason: null }),
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

  test('rejects adapter-unsupported samples before generation or timing begins', () => {
    let generationCalls = 0;
    const unsupportedAdapter = {
      engineId: 'unsupported-test-engine',
      engineLabel: 'Unsupported test engine',
      capabilities: [],
      assessSupport: () => ({ status: 'unsupported' as const, reason: 'synthetic unsupported axis' }),
      generateSample: () => {
        generationCalls += 1;
        throw new Error('generation must not run');
      }
    };
    const recipe = MAZE_V2_CONVERGENCE_CORPUS[0]!;
    const record = runOneSample(unsupportedAdapter, recipe, 'raw-carving', 1);

    expect(generationCalls).toBe(0);
    expect(record.outcome).toBe('unsupported');
    expect(record.generationDurationMs).toBeNull();
    expect(record.realizedWidth).toBeNull();
    expect(record.engineNotes).toBeNull();
  });

  test('rejects an explicitly unsupported recipe before consulting or generating with an adapter', () => {
    let supportChecks = 0;
    let generationCalls = 0;
    const adapter = {
      engineId: 'recipe-unsupported-test-engine',
      engineLabel: 'Recipe unsupported test engine',
      capabilities: [],
      assessSupport: () => {
        supportChecks += 1;
        return { status: 'supported' as const, reason: null };
      },
      generateSample: () => {
        generationCalls += 1;
        throw new Error('generation must not run');
      }
    };
    const recipe = MAZE_V2_CONVERGENCE_CORPUS.find((entry) => entry.name === 'endpoint-placement-unsupported')!;
    const record = runOneSample(adapter, recipe, 'raw-carving', 1);

    expect(supportChecks).toBe(0);
    expect(generationCalls).toBe(0);
    expect(record.outcome).toBe('unsupported');
    expect(record.generationDurationMs).toBeNull();
  });
});

describe('resolvePercentile', () => {
  test('returns null for an empty array', () => {
    expect(resolvePercentile([], 0.5)).toBeNull();
  });

  test('returns the only value for a singleton', () => {
    expect(resolvePercentile([7], 0.5)).toBe(7);
  });

  test('uses nearest rank for an even-sized median', () => {
    expect(resolvePercentile([1, 2, 3, 4], 0.5)).toBe(2);
  });

  test('uses nearest rank for a high percentile', () => {
    const sorted = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(resolvePercentile(sorted, 0.99)).toBe(99);
  });
});

describe('resolveConvergenceExitCode', () => {
  const recordFor = (outcome: ConvergenceRunRecord['outcome']): ConvergenceRunRecord => ({
    engineId: 'test-engine',
    recipeName: 'test-recipe',
    lane: 'raw-carving',
    seed: 1,
    outcome,
    errorMessage: outcome === 'success' ? null : outcome,
    generationDurationMs: outcome === 'success' ? 1 : null,
    requestedWidth: 20,
    requestedHeight: 20,
    realizedWidth: outcome === 'success' ? 20 : null,
    realizedHeight: outcome === 'success' ? 20 : null,
    engineNotes: outcome === 'success' ? {} : null,
    metrics: null
  });

  test('keeps success and explicitly unsupported samples at exit status zero', () => {
    expect(resolveConvergenceExitCode([recordFor('success'), recordFor('unsupported')])).toBe(0);
  });

  test.each(['exception', 'invariant-failure'] as const)(
    'returns exit status one when a run contains an %s outcome',
    (outcome) => {
      expect(resolveConvergenceExitCode([recordFor('success'), recordFor(outcome)])).toBe(1);
    }
  );

  test('the CLI assigns the outcome-derived exit status only after every artifact write', () => {
    const script = readFileSync(resolve(process.cwd(), 'scripts/analysis/mazev2-convergence.ts'), 'utf8');
    const exitStatusAssignment = script.indexOf('process.exitCode = resolveConvergenceExitCode(allRecords);');
    const artifactWrite = script.indexOf('await writeConvergenceArtifactSet(outputDir, {');
    expect(script).toContain('allRecords.push(await runOneSampleInChild(');
    expect(exitStatusAssignment).toBeGreaterThanOrEqual(0);
    expect(artifactWrite).toBeGreaterThanOrEqual(0);
    expect(exitStatusAssignment).toBeGreaterThan(artifactWrite);
  });
});

describe('interruptible convergence generation', () => {
  const isProcessAlive = (pid: number): boolean => {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  };

  test('reaps a hung sample, continues with the next sample, and preserves all failure artifacts', async () => {
    const recipe = MAZE_V2_CONVERGENCE_CORPUS[0]!;
    const expectedSourceCommitSha = '1111111111111111111111111111111111111111';
    const hangingChild = resolve(
      process.cwd(),
      'tests/analysis/fixtures/mazev2-hanging-sample-child.mjs'
    );
    let hungPid: number | null = null;
    const startedAt = performance.now();
    const timedOut = await runOneSampleInChild(
      'legacy-runtime',
      recipe,
      'raw-carving',
      1,
      expectedSourceCommitSha,
      {
        timeoutMs: 250,
        childEntrypoint: hangingChild,
        onSpawn: (pid) => { hungPid = pid; }
      }
    );

    expect(performance.now() - startedAt).toBeLessThan(5_000);
    expect(timedOut.outcome).toBe('invariant-failure');
    expect(timedOut.errorMessage).toBe(
      'generation exceeded 250ms deadline; child process terminated and reaped'
    );
    expect(timedOut.generationDurationMs).toBe(250);
    expect(timedOut.engineNotes).toEqual({
      generationDeadlineMs: 250,
      childProcessTermination: 'terminated-and-reaped'
    });
    expect(hungPid).not.toBeNull();
    expect(isProcessAlive(hungPid!)).toBe(false);

    const nextRecord = await runOneSampleInChild(
      'legacy-runtime',
      recipe,
      'raw-carving',
      2,
      expectedSourceCommitSha,
      { childEntrypoint: hangingChild }
    );
    expect(nextRecord.outcome).toBe('unsupported');
    const unsupportedRecipe = MAZE_V2_CONVERGENCE_CORPUS.find(
      (entry) => entry.name === 'endpoint-placement-unsupported'
    )!;
    const unsupportedRecord = await runOneSampleInChild(
      'legacy-runtime',
      unsupportedRecipe,
      'raw-carving',
      3,
      expectedSourceCommitSha,
      { childEntrypoint: hangingChild }
    );
    expect(unsupportedRecord.outcome).toBe('unsupported');
    expect(resolveConvergenceExitCode([nextRecord, unsupportedRecord])).toBe(0);

    const outputDir = mkdtempSync(join(tmpdir(), 'mazer-convergence-timeout-artifacts-'));
    try {
      const records = [timedOut, nextRecord];
      const artifacts = await writeConvergenceArtifactSet(outputDir, {
        rawRunsJson: JSON.stringify(records, null, 2),
        rawSummaryJson: JSON.stringify(summarize(records), null, 2),
        compactEvidenceJson: JSON.stringify({
          outcomeCounts: { invariantFailure: 1, success: 1 }
        }, null, 2)
      });
      expect(JSON.parse(readFileSync(artifacts.rawRunsPath, 'utf8'))).toHaveLength(2);
      expect(JSON.parse(readFileSync(artifacts.rawSummaryPath, 'utf8'))).toHaveLength(1);
      expect(JSON.parse(readFileSync(artifacts.compactEvidencePath, 'utf8'))).toEqual({
        outcomeCounts: { invariantFailure: 1, success: 1 }
      });
      expect(resolveConvergenceExitCode(records)).toBe(1);
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  }, 30_000);

  test.each([
    ['dirty-source-fixture', 'dirty'],
    ['mismatched-source-fixture', 'clean']
  ] as const)(
    'rejects and reaps a %s child before generation',
    async (engineId, sourceIdentityStatus) => {
      const recipe = MAZE_V2_CONVERGENCE_CORPUS[0]!;
      const childEntrypoint = resolve(
        process.cwd(),
        'tests/analysis/fixtures/mazev2-hanging-sample-child.mjs'
      );
      const expectedSourceCommitSha = '1111111111111111111111111111111111111111';
      let childPid: number | null = null;

      const record = await runOneSampleInChild(
        engineId,
        recipe,
        'raw-carving',
        2,
        expectedSourceCommitSha,
        {
          childEntrypoint,
          onSpawn: (pid) => { childPid = pid; }
        }
      );

      expect(record.outcome).toBe('invariant-failure');
      expect(record.errorMessage).toContain(`source identity was ${sourceIdentityStatus}`);
      expect(record.errorMessage).toContain(`expected clean ${expectedSourceCommitSha}`);
      expect(record.engineNotes).toMatchObject({
        expectedSourceCommitSha,
        sourceIdentityStatus,
        generationStarted: false,
        childProcessTermination: 'terminated-and-reaped'
      });
      expect(childPid).not.toBeNull();
      expect(isProcessAlive(childPid!)).toBe(false);
    }
  );

  test('installs lifecycle guards before onSpawn and reaps the child when the callback throws', async () => {
    const recipe = MAZE_V2_CONVERGENCE_CORPUS[0]!;
    const childEntrypoint = resolve(
      process.cwd(),
      'tests/analysis/fixtures/mazev2-hanging-sample-child.mjs'
    );
    const expectedSourceCommitSha = '1111111111111111111111111111111111111111';
    let childPid: number | null = null;

    const record = await runOneSampleInChild(
      'legacy-runtime',
      recipe,
      'raw-carving',
      1,
      expectedSourceCommitSha,
      {
        timeoutMs: 5_000,
        childEntrypoint,
        onSpawn: (pid) => {
          childPid = pid;
          throw new Error('synthetic callback failure');
        }
      }
    );

    expect(record.outcome).toBe('exception');
    expect(record.errorMessage).toBe(
      'onSpawn callback failed before generation: Error: synthetic callback failure; child process terminated and reaped'
    );
    expect(record.engineNotes).toEqual({
      lifecycleHook: 'onSpawn',
      generationStarted: false,
      childProcessTermination: 'terminated-and-reaped'
    });
    expect(childPid).not.toBeNull();
    expect(isProcessAlive(childPid!)).toBe(false);

    const outputDir = mkdtempSync(join(tmpdir(), 'mazer-convergence-callback-artifacts-'));
    try {
      const artifacts = await writeConvergenceArtifactSet(outputDir, {
        rawRunsJson: JSON.stringify([record], null, 2),
        rawSummaryJson: JSON.stringify(summarize([record]), null, 2),
        compactEvidenceJson: JSON.stringify({ outcomeCounts: { exception: 1 } }, null, 2)
      });
      expect(JSON.parse(readFileSync(artifacts.rawRunsPath, 'utf8'))).toHaveLength(1);
      expect(JSON.parse(readFileSync(artifacts.rawSummaryPath, 'utf8'))).toHaveLength(1);
      expect(JSON.parse(readFileSync(artifacts.compactEvidencePath, 'utf8'))).toEqual({
        outcomeCounts: { exception: 1 }
      });
      expect(resolveConvergenceExitCode([record])).toBe(1);
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });

  test('records a child startup error only after the process has closed', async () => {
    const recipe = MAZE_V2_CONVERGENCE_CORPUS[0]!;
    const missingRoot = mkdtempSync(join(tmpdir(), 'mazer-convergence-missing-child-'));
    const childEntrypoint = join(missingRoot, 'missing-child.mjs');
    let childPid: number | null = null;
    try {
      const record = await runOneSampleInChild(
        'legacy-runtime',
        recipe,
        'raw-carving',
        2,
        '1111111111111111111111111111111111111111',
        {
          timeoutMs: 5_000,
          childEntrypoint,
          onSpawn: (pid) => { childPid = pid; }
        }
      );

      expect(record.outcome).toBe('exception');
      expect(record.errorMessage).toContain('sample child exited before returning a valid record');
      expect(childPid).not.toBeNull();
      expect(isProcessAlive(childPid!)).toBe(false);
    } finally {
      rmSync(missingRoot, { recursive: true, force: true });
    }
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

  test('binds a clean commit but rejects and identifies tracked or untracked dirty source', () => {
    const repoRoot = mkdtempSync(join(tmpdir(), 'mazer-convergence-provenance-'));
    try {
      execFileSync('git', ['init'], { cwd: repoRoot });
      execFileSync('git', ['config', 'user.email', 'test@example.invalid'], { cwd: repoRoot });
      execFileSync('git', ['config', 'user.name', 'Mazer Test'], { cwd: repoRoot });
      writeFileSync(join(repoRoot, 'tracked.txt'), 'clean\n', 'utf8');
      execFileSync('git', ['add', 'tracked.txt'], { cwd: repoRoot });
      execFileSync('git', ['commit', '-m', 'fixture'], { cwd: repoRoot });

      const cleanCommitSha = resolveCleanGitCommitSha(repoRoot);
      expect(cleanCommitSha).toMatch(/^[0-9a-f]{40}$/);
      expect(assertExpectedCleanGitCommitSha(repoRoot, cleanCommitSha, 'test evidence')).toBe(cleanCommitSha);
      expect(() => assertExpectedCleanGitCommitSha(
        repoRoot,
        '0000000000000000000000000000000000000000',
        'test evidence'
      )).toThrow('expected clean Git commit');
      writeFileSync(join(repoRoot, 'tracked.txt'), 'dirty\n', 'utf8');
      expect(() => resolveCleanGitCommitSha(repoRoot)).toThrow('tracked.txt');

      writeFileSync(join(repoRoot, 'tracked.txt'), 'clean\n', 'utf8');
      writeFileSync(join(repoRoot, 'untracked.txt'), 'untracked\n', 'utf8');
      expect(() => resolveCleanGitCommitSha(repoRoot)).toThrow('untracked.txt');
    } finally {
      rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  test('classifies the default compact artifact as gitignored local scratch, not committed evidence', () => {
    const script = readFileSync(resolve(process.cwd(), 'scripts/analysis/mazev2-convergence.ts'), 'utf8');
    const gitignore = readFileSync(resolve(process.cwd(), '.gitignore'), 'utf8');
    expect(script).toContain("const DEFAULT_OUTPUT_DIR = './tmp/mazev2-convergence';");
    expect(script).toContain('compact artifact remains ignored');
    expect(script).toContain('resolveCleanGitCommitSha(REPO_ROOT)');
    expect(script).toContain('seed,\n            sourceCommitSha');
    const finalSourceCheck = script.indexOf(
      "assertExpectedCleanGitCommitSha(REPO_ROOT, sourceCommitSha, 'convergence artifact publication');"
    );
    const artifactWrite = script.indexOf('await writeConvergenceArtifactSet(outputDir, {');
    expect(finalSourceCheck).toBeGreaterThanOrEqual(0);
    expect(finalSourceCheck).toBeLessThan(artifactWrite);
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
      contractVersion: MAZE_V2_CONTRACT_VERSION,
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

describe('createMazeV2DomainMazeAdapter convergence lanes (Wave 1.5 PR D)', () => {
  test('exercises the higher-level generateMazeForDifficulty entry point, not just raw buildMaze', () => {
    const adapter = createMazeV2DomainMazeAdapter();
    const recipe = MAZE_V2_CONVERGENCE_CORPUS.find((r) => r.name === 'baseline-small')!;
    const record = runOneSample(adapter, recipe, 'production-pipeline', 999);
    expect(record.outcome).toBe('success');
    expect(record.engineNotes?.targetDifficulty).toBe('chill');
    expect(record.engineNotes?.achievedDifficulty).toBe('standard');
    expect(record.engineNotes?.reportedCanonicalDifficulty).toBe('chill');
  });

  test.each(['raw-carving', 'production-pipeline'] as const)(
    'classifies a rectangular %s sample as unsupported rather than a successful padded-square measurement',
    (lane) => {
    const adapter = createMazeV2DomainMazeAdapter();
    const recipe = MAZE_V2_CONVERGENCE_CORPUS.find((r) => r.name === 'wide-rectangular-footprint')!;
    const record = runOneSample(adapter, recipe, lane, 999);
    expect(record.outcome).toBe('unsupported');
    expect(record.errorMessage).toContain('rectangular');
    expect(record.errorMessage).toContain(lane);
    expect(record.metrics).toBeNull();
    expect(record.generationDurationMs).toBeNull();
    expect(record.realizedWidth).toBeNull();
    expect(record.engineNotes).toBeNull();
    }
  );

  test.each(['raw-carving', 'production-pipeline'] as const)(
    'classifies explicit wrap demand as unsupported in the %s lane',
    (lane) => {
      const adapter = createMazeV2DomainMazeAdapter();
      const recipe = MAZE_V2_CONVERGENCE_CORPUS.find((r) => r.name === 'explicit-wrap-bleed-demand')!;
      const record = runOneSample(adapter, recipe, lane, 999);
      expect(record.outcome).toBe('unsupported');
      expect(record.errorMessage).toContain('wrap');
      expect(record.metrics).toBeNull();
      expect(record.generationDurationMs).toBeNull();
      expect(record.realizedWidth).toBeNull();
      expect(record.engineNotes).toBeNull();
    }
  );
});
