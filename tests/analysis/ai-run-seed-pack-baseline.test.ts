import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, test } from 'vitest';
import { runMazerAiRunCorpusAuditCli } from '../../scripts/analysis/ai-run-corpus-audit.mjs';
import { runSeedPackBaseline } from '../../scripts/analysis/lib/ai-run-seed-pack-runner';
import {
  MAZER_AI_RUN_SEED_PACK_BASELINE_SCHEMA,
  MAZER_AI_RUN_SEED_PACK_SCHEMA,
  baselineFileNameForPack,
  loadSeedPackCoverageInputs,
  renderBaselineMarkdown,
  sealSeedPack
} from '../../scripts/analysis/lib/ai-run-seed-packs.mjs';

const PACK_DIR = resolve(__dirname, '../fixtures/ai-run-seed-packs');

// Small, fast, explicit-profile pack: two bands' worth of parameters, two seeds each.
const tinyPack = () => sealSeedPack({
  schema: MAZER_AI_RUN_SEED_PACK_SCHEMA,
  packId: 'unit-tiny',
  packVersion: '1.0.0',
  purpose: 'representative',
  description: 'unit test pack',
  runnerContract: 'menu-demo-advance-walker-v1',
  targets: [
    {
      targetId: 'tiny-straight',
      band: 'tutorial',
      levelRangeHint: null,
      scale: 29,
      aspectRatio: 1,
      selection: { targetComplexity: 8, candidateCount: 1, tolerance: 8 },
      generationProfile: {
        borderFeederTargetPerSide: 0,
        checkpointCountMultiplier: 0.42,
        checkpointCountOverride: 1,
        maxDeadEndCount: 0,
        minCheckpoints: 1,
        requiredOppositeBorderConnections: { horizontal: false, vertical: false },
        routeQualityReinforcementMultiplier: 0,
        shortcutCountMultiplier: 0,
        straightnessBias: 0.88
      },
      ai: { skillLevel: 1, skillRank: 'E', biasProfile: null },
      seeds: [11, 101]
    },
    {
      targetId: 'tiny-wrap',
      band: 'explorer',
      levelRangeHint: { min: 9, max: 18 },
      scale: 31,
      aspectRatio: 1,
      selection: { targetComplexity: 96, candidateCount: 1, tolerance: 8 },
      generationProfile: {
        borderFeederTargetPerSide: 2,
        checkpointCountMultiplier: 0.86,
        checkpointCountOverride: null,
        maxDeadEndCount: null,
        minCheckpoints: 4,
        requiredOppositeBorderConnections: { horizontal: true, vertical: true },
        routeQualityReinforcementMultiplier: 0.7,
        shortcutCountMultiplier: 0.62,
        straightnessBias: 0
      },
      ai: { skillLevel: 1, skillRank: 'E', biasProfile: 'shortcut-gambler' },
      seeds: [3, 19]
    }
  ]
});

describe('seed pack baseline runner', () => {
  test('is deterministic: two runs produce identical reports and digests', () => {
    const pack = tinyPack();
    const first = runSeedPackBaseline(pack);
    const second = runSeedPackBaseline(structuredClone(pack));
    expect(second).toEqual(first);
    expect(second.resultDigest).toBe(first.resultDigest);
    expect(renderBaselineMarkdown(second)).toBe(renderBaselineMarkdown(first));
  }, 60_000);

  test('emits a schema-stable report with explicit parameters and no account data', () => {
    const pack = tinyPack();
    const report = runSeedPackBaseline(pack);
    expect(report.schema).toBe(MAZER_AI_RUN_SEED_PACK_BASELINE_SCHEMA);
    expect(report.pack).toMatchObject({ packId: 'unit-tiny', packVersion: '1.0.0', hash: pack.hash });
    expect(report.totals.caseCount).toBe(4);
    expect(report.cases.map((entry) => `${entry.targetId}:${entry.seed}`)).toEqual([
      'tiny-straight:11', 'tiny-straight:101', 'tiny-wrap:3', 'tiny-wrap:19'
    ]);
    expect(report.targets.map((entry) => entry.generationProfile)).toEqual(pack.targets.map((entry) => entry.generationProfile));
    expect(report.totals.profileNormalizationDriftCount).toBe(0);
    expect(report.dataPolicy).toMatchObject({
      accountDataAccessed: false,
      liveDatabaseAccessed: false,
      progressionMutationPerformed: false,
      receiptsPersisted: false,
      scoringOrReceiptContractChanged: false
    });
    expect(report.environment.runQualityScorer.id).toBe('mazer.maze-cycle-run-quality');
    expect(report.resultDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
    const serialized = JSON.stringify(report);
    for (const forbidden of ['user_id', 'userId', 'clientRunId', 'playerPath"', 'generatedAt']) {
      expect(serialized).not.toContain(forbidden);
    }
    for (const entry of report.cases) {
      expect(entry.playerPathLength).toBeGreaterThan(0);
      expect(entry.shortestPathLength).toBeGreaterThan(0);
      expect(entry.runQualityTotal).toBeGreaterThanOrEqual(0);
      expect(entry.runQualityTotal).toBeLessThanOrEqual(100);
    }
  }, 60_000);

  test('a changed seed list changes the pack hash but never mutates the input pack', () => {
    const pack = tinyPack();
    const snapshot = structuredClone(pack);
    runSeedPackBaseline(pack);
    expect(pack).toEqual(snapshot);
    expect(() => runSeedPackBaseline({ ...pack, description: 'edited' })).toThrow(/hash does not match/);
  }, 60_000);

  test('CLI baseline mode writes once and is a no-op on the second run', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mazer-seed-pack-baseline-'));
    const packFile = join(root, 'unit-tiny.pack.json');
    const output = join(root, 'baseline.json');
    const markdownOutput = join(root, 'baseline.md');
    await writeFile(packFile, JSON.stringify(tinyPack(), null, 2), 'utf8');

    const args = ['--seed-pack', packFile, '--output', output, '--markdown-output', markdownOutput];
    const first = await runMazerAiRunCorpusAuditCli(args);
    expect(first.writes.output.changed).toBe(true);
    const written = await readFile(output, 'utf8');
    const second = await runMazerAiRunCorpusAuditCli(args);
    expect(second.writes.output.changed).toBe(false);
    expect(second.writes.markdownOutput.changed).toBe(false);
    expect(await readFile(output, 'utf8')).toBe(written);
    expect(JSON.parse(written).resultDigest).toBe(first.baseline.resultDigest);
  }, 120_000);
});

describe('committed seed pack baselines', () => {
  test('each committed baseline matches its pack hash and carries a stable shape', async () => {
    const entries = await loadSeedPackCoverageInputs(PACK_DIR);
    for (const { pack, baseline } of entries) {
      expect(baseline, baselineFileNameForPack(pack)).not.toBeNull();
      expect(baseline.schema).toBe(MAZER_AI_RUN_SEED_PACK_BASELINE_SCHEMA);
      expect(baseline.pack).toMatchObject({ packId: pack.packId, packVersion: pack.packVersion, hash: pack.hash });
      const expectedCases = pack.targets.reduce((total: number, entry: { seeds: number[] }) => total + entry.seeds.length, 0);
      expect(baseline.totals.caseCount).toBe(expectedCases);
      expect(baseline.cases).toHaveLength(expectedCases);
      expect(baseline.targets.map((entry: { targetId: string }) => entry.targetId)).toEqual(pack.targets.map((entry: { targetId: string }) => entry.targetId));
      expect(baseline.resultDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
      expect(baseline.dataPolicy.accountDataAccessed).toBe(false);
    }
  });
});
