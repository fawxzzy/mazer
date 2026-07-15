import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, test } from 'vitest';
import {
  MAZER_AI_RUN_CORPUS_AUDIT_SCHEMA,
  createMazerAiRunCorpusAudit,
  runMazerAiRunCorpusAuditCli
} from '../../scripts/analysis/ai-run-corpus-audit.mjs';

const receipt = ({ receipt: receiptOverrides = {}, ...overrides } = {}) => ({
  id: `receipt-${overrides.maze_seed ?? 1}`,
  user_id: 'must-not-leak',
  surface: 'menu-demo',
  maze_seed: overrides.maze_seed ?? 1,
  path_length: overrides.path_length ?? 12,
  completion_time_ms: overrides.completion_time_ms ?? 1_000,
  average_frame_ms: overrides.average_frame_ms ?? 16.7,
  wrong_turns: overrides.wrong_turns ?? 0,
  backtracks: overrides.backtracks ?? 0,
  reset_used: overrides.reset_used ?? false,
  receipt: {
    receiptSchemaVersion: '2',
    appBuild: 'build-a',
    aiAlgorithmVersion: 'ai-v2',
    generatorContractVersion: 'generator-v3',
    benchmarkGraphVersion: 'graph-v2',
    runOrigin: 'organic-menu',
    shortestViablePathLength: overrides.shortestViablePathLength ?? 10,
    mazeComplexity: { edgeWrapCount: overrides.edgeWrapCount ?? 0, total: 90 },
    aiDecisionSummary: { decisionCount: 4 },
    aiDecisionScore: { signal: overrides.signal ?? 'searching' },
    ...receiptOverrides
  },
  ...overrides
});

describe('ai-run-corpus-audit', () => {
  test('creates a redacted, quality-gated report without mutating the raw export', () => {
    const payload = {
      progressionCount: 6,
      receipts: [
        receipt({ maze_seed: 10 }),
        receipt({ maze_seed: 11, path_length: 5, shortestViablePathLength: 12, edgeWrapCount: 2, signal: 'chaotic' }),
        receipt({ id: 'receipt-12', maze_seed: 10, surface: 'play', receipt: { aiDecisionSummary: null } }),
        receipt({ maze_seed: 13, average_frame_ms: 0, receipt: { receiptSchemaVersion: null } })
      ]
    };
    const snapshot = structuredClone(payload);
    const audit = createMazerAiRunCorpusAudit(payload, { generatedAt: '2026-07-11T07:00:00.000Z' });

    expect(payload).toEqual(snapshot);
    expect(audit.schema).toBe(MAZER_AI_RUN_CORPUS_AUDIT_SCHEMA);
    expect(audit.source).toMatchObject({ liveDatabaseAccessed: false, rawIdentifiersExcluded: true, rawPathsExcluded: true });
    expect(audit.coverage).toMatchObject({ progressionCount: 6, durableReceiptCount: 4, coverageGap: 2, exactDuplicateReceiptCount: 0 });
    expect(audit.cohorts).toMatchObject({ distinctMazeSeedCount: 3, repeatedMazeSeedCount: 1, bySurface: { 'menu-demo': 3, play: 1 } });
    expect(audit.quality).toMatchObject({ behaviorReadyCount: 3, routeCalibrationReadyCount: 2, performanceReadyCount: 3 });
    expect(audit.quality.reasonCodeCounts).toMatchObject({ benchmark_graph_mismatch: 1, performance_metric_missing: 1, legacy_schema: 1, human_sample_only: 1 });
    expect(audit.aiScorer).toMatchObject({
      version: '1.0.0',
      recomputedReceiptCount: 3,
      storedScoreReceiptCount: 4,
      historicalStoredScoresImmutable: true,
      calibrationUsesRecomputedScores: true
    });
    expect(audit.runQualityScorer).toMatchObject({
      id: 'mazer.maze-cycle-run-quality',
      version: '1.0.0',
      shortestPathModel: 'playable-wrap-aware-shortest-path-v1',
      recomputedReceiptCount: 4,
      storedScoreReceiptCount: 0,
      historicalStoredScoresImmutable: true,
      calibrationUsesRecomputedScores: true
    });
    expect(audit.routeBenchmark).toMatchObject({ comparableReceiptCount: 4, actualShorterThanBenchmarkCount: 1, wrappedActualShorterThanBenchmarkCount: 1, routeEfficiencyCalibrationBlocked: true });
    expect(JSON.stringify(audit)).not.toContain('must-not-leak');
    expect(JSON.stringify(audit)).not.toContain('user_id');
  });

  test('writes a local audit from a provided export without opening a live client', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mazer-corpus-audit-'));
    const input = join(root, 'export.json');
    const output = join(root, 'audit.json');
    await writeFile(input, JSON.stringify({ progressionCount: 1, receipts: [receipt()] }), 'utf8');

    const result = await runMazerAiRunCorpusAuditCli(['--input', input, '--output', output, '--pretty']);
    const audit = JSON.parse(await readFile(output, 'utf8'));

    expect(result.writes.output).toBe(output);
    expect(audit.source.liveDatabaseAccessed).toBe(false);
    expect(audit.coverage.coverageGap).toBe(0);
  });
});
