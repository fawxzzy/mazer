import { cp, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import {
  MAZER_AI_RUN_SEED_PACK_BANDS,
  MAZER_AI_RUN_SEED_PACK_COVERAGE_SCHEMA,
  MAZER_AI_RUN_SEED_PACK_PURPOSES,
  MAZER_AI_RUN_SEED_PACK_SCHEMA,
  baselineFileNameForPack,
  canonicalJson,
  createSeedPackCoverageReport,
  hashSeedPack,
  loadSeedPackCoverageInputs,
  renderCoverageMarkdown,
  sealSeedPack,
  summarizeBaselineCases,
  validateSeedPack
} from '../../scripts/analysis/lib/ai-run-seed-packs.mjs';
import { runMazerAiRunCorpusAuditCli } from '../../scripts/analysis/ai-run-corpus-audit.mjs';

const PACK_DIR = resolve(fileURLToPath(new URL('.', import.meta.url)), '../fixtures/ai-run-seed-packs');

const target = (overrides = {}) => ({
  targetId: 'unit-target',
  band: 'starter',
  levelRangeHint: { min: 2, max: 8 },
  scale: 29,
  aspectRatio: 1,
  selection: { targetComplexity: 16, candidateCount: 1, tolerance: 8 },
  generationProfile: {
    borderFeederTargetPerSide: 0,
    checkpointCountMultiplier: 0.44,
    checkpointCountOverride: 2,
    maxDeadEndCount: 0,
    minCheckpoints: 2,
    requiredOppositeBorderConnections: { horizontal: false, vertical: false },
    routeQualityReinforcementMultiplier: 0,
    shortcutCountMultiplier: 0,
    straightnessBias: 0.6
  },
  ai: { skillLevel: 3, skillRank: 'E', biasProfile: null },
  seeds: [1, 2, 3],
  ...overrides
});

const unsealedPack = (overrides = {}) => ({
  schema: MAZER_AI_RUN_SEED_PACK_SCHEMA,
  packId: 'unit-pack',
  packVersion: '1.0.0',
  purpose: 'representative',
  description: 'unit test pack',
  runnerContract: 'menu-demo-advance-walker-v1',
  targets: [target()],
  hash: `sha256:${'0'.repeat(64)}`,
  ...overrides
});

const sealed = (overrides) => sealSeedPack(unsealedPack(overrides));

describe('seed pack schema and hash', () => {
  test('every committed pack validates, is sealed, and has unique target ids and seeds', async () => {
    const entries = await loadSeedPackCoverageInputs(PACK_DIR);
    expect(entries.length).toBeGreaterThanOrEqual(3);
    for (const { file, pack } of entries) {
      expect(validateSeedPack(pack), file).toEqual({ ok: true, errors: [] });
      expect(pack.hash).toBe(hashSeedPack(pack));
    }
    expect(new Set(entries.map(({ pack }) => pack.packId)).size).toBe(entries.length);
    expect(new Set(entries.map(({ pack }) => pack.purpose))).toEqual(new Set(MAZER_AI_RUN_SEED_PACK_PURPOSES));
  });

  test('committed packs carry explicit generation parameters, not level-derived ones', async () => {
    for (const { pack } of await loadSeedPackCoverageInputs(PACK_DIR)) {
      for (const entry of pack.targets) {
        expect(Object.keys(entry.generationProfile).sort()).toEqual([
          'borderFeederTargetPerSide', 'checkpointCountMultiplier', 'checkpointCountOverride', 'maxDeadEndCount',
          'minCheckpoints', 'requiredOppositeBorderConnections', 'routeQualityReinforcementMultiplier',
          'shortcutCountMultiplier', 'straightnessBias'
        ]);
        expect(Number.isInteger(entry.scale)).toBe(true);
        expect(entry.selection.targetComplexity).toBeGreaterThanOrEqual(0);
        expect(entry.levelRangeHint === null || entry.levelRangeHint.min >= 1).toBe(true);
      }
    }
  });

  test('hash is deterministic, key-order independent and sensitive to content', () => {
    const pack = sealed();
    const reverseKeys = (value) => (Array.isArray(value)
      ? value.map(reverseKeys)
      : value !== null && typeof value === 'object'
        ? Object.fromEntries(Object.entries(value).reverse().map(([key, inner]) => [key, reverseKeys(inner)]))
        : value);
    const reordered = reverseKeys(pack);
    expect(Object.keys(reordered)).not.toEqual(Object.keys(pack));
    expect(hashSeedPack(reordered)).toBe(pack.hash);
    expect(canonicalJson({ b: 1, a: [2, { d: 1, c: 2 }] })).toBe('{"a":[2,{"c":2,"d":1}],"b":1}');
    const changedSeed = sealed({ targets: [target({ seeds: [1, 2, 4] })] });
    expect(changedSeed.hash).not.toBe(pack.hash);
    expect(sealSeedPack(pack)).toEqual(pack);
  });

  test('rejects tampering, unknown fields, duplicate seeds and bad profiles', () => {
    expect(validateSeedPack(sealed()).ok).toBe(true);
    expect(validateSeedPack({ ...sealed(), description: 'edited after seal' }).errors.join(' ')).toContain('hash does not match');
    expect(validateSeedPack(sealed({ extra: true })).errors.join(' ')).toContain('unknown field "extra"');
    expect(validateSeedPack(sealed({ targets: [target({ seeds: [5, 5] })] })).errors.join(' ')).toContain('seeds must be unique');
    expect(validateSeedPack(sealed({ targets: [target({ seeds: [] })] })).ok).toBe(false);
    expect(validateSeedPack(sealed({ targets: [target(), target()] })).errors.join(' ')).toContain('duplicate targetId');
    expect(validateSeedPack(sealed({ targets: [target({ band: 'legendary' })] })).ok).toBe(false);
    const badProfile = target();
    badProfile.generationProfile.checkpointCountMultiplier = 9;
    expect(validateSeedPack(sealed({ targets: [badProfile] })).errors.join(' ')).toContain('invalid checkpointCountMultiplier');
    expect(validateSeedPack(sealed({ targets: [target({ ai: { skillLevel: 1, skillRank: 'Z', biasProfile: null } })] })).ok).toBe(false);
    expect(validateSeedPack(null).ok).toBe(false);
  });
});

describe('baseline aggregation', () => {
  test('summarizes case rows without touching the generator', () => {
    const row = (overrides) => ({
      reachedGoal: true, resetUsed: false, edgeWrapCount: 0, shortestPathLength: 10, playerPathLength: 10,
      generationProfileNormalized: true, aiSignal: 'clean', runQualitySignal: 'challenge', selectionDelivery: 'on-target',
      measuredComplexity: 50, routeOverrunRatio: 0, runQualityTotal: 100, aiPressureScore: 0, coverageRatio: 0.5,
      ...overrides
    });
    const summary = summarizeBaselineCases([
      row(),
      row({ reachedGoal: false, resetUsed: true, edgeWrapCount: 2, playerPathLength: 9, aiSignal: 'chaotic', runQualityTotal: 40 }),
      row({ generationProfileNormalized: false, runQualityTotal: 70 })
    ]);
    expect(summary).toMatchObject({
      caseCount: 3, reachedGoalCount: 2, resetUsedCount: 1, wrappedMazeCount: 1,
      actualShorterThanBenchmarkCount: 1, profileNormalizationDriftCount: 1,
      aiSignalCounts: { chaotic: 1, clean: 2 },
      runQualityTotal: { count: 3, min: 40, median: 70, max: 100, mean: 70 }
    });
    expect(summarizeBaselineCases([]).runQualityTotal).toEqual({ count: 0, min: null, median: null, max: null, mean: null });
  });
});

describe('idempotent coverage accounting', () => {
  test('committed packs are all current and every band and purpose is covered', async () => {
    const coverage = createSeedPackCoverageReport(await loadSeedPackCoverageInputs(PACK_DIR));
    expect(coverage.schema).toBe(MAZER_AI_RUN_SEED_PACK_COVERAGE_SCHEMA);
    expect(coverage.allPacksCurrent).toBe(true);
    expect(coverage.uncoveredBands).toEqual([]);
    expect(coverage.uncoveredPurposes).toEqual([]);
    expect(Object.keys(coverage.bandCoverage)).toEqual(MAZER_AI_RUN_SEED_PACK_BANDS);
    expect(coverage.packs.every((entry) => entry.baselineResultDigest?.startsWith('sha256:'))).toBe(true);
  });

  test('is a pure function: repeated runs and input order do not change the report', async () => {
    const entries = await loadSeedPackCoverageInputs(PACK_DIR);
    const first = createSeedPackCoverageReport(entries);
    expect(createSeedPackCoverageReport(entries)).toEqual(first);
    expect(createSeedPackCoverageReport([...entries].reverse())).toEqual(first);
    expect(renderCoverageMarkdown(first)).toBe(renderCoverageMarkdown(createSeedPackCoverageReport(entries)));
  });

  test('classifies missing, current, stale and invalid packs', () => {
    const pack = sealed();
    const baseline = (hash) => ({ pack: { hash }, resultDigest: 'sha256:abc' });
    const states = (entries) => createSeedPackCoverageReport(entries).packs.map((entry) => entry.state);
    expect(states([{ file: 'a', pack, baseline: null }])).toEqual(['missing']);
    expect(states([{ file: 'a', pack, baseline: baseline(pack.hash) }])).toEqual(['current']);
    expect(states([{ file: 'a', pack, baseline: baseline('sha256:old') }])).toEqual(['stale']);
    expect(states([{ file: 'a', pack: { ...pack, description: 'tampered' }, baseline: baseline(pack.hash) }])).toEqual(['invalid']);
    const report = createSeedPackCoverageReport([{ file: 'a', pack, baseline: baseline('sha256:old') }]);
    expect(report.allPacksCurrent).toBe(false);
    expect(report.uncoveredBands).toEqual(MAZER_AI_RUN_SEED_PACK_BANDS);
    expect(report.bandCoverage.starter).toMatchObject({ packs: ['unit-pack'], baselinedPacks: [], covered: false });
  });

  test('coverage CLI and seal CLI rewrite nothing on a second run', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mazer-seed-pack-coverage-'));
    await cp(PACK_DIR, root, { recursive: true });
    const output = join(root, 'out', 'coverage.json');
    const markdownOutput = join(root, 'out', 'coverage.md');

    const first = await runMazerAiRunCorpusAuditCli(['--seed-pack-coverage', root, '--output', output, '--markdown-output', markdownOutput]);
    expect(first.writes.output.changed).toBe(true);
    const before = await readFile(output, 'utf8');
    const second = await runMazerAiRunCorpusAuditCli(['--seed-pack-coverage', root, '--output', output, '--markdown-output', markdownOutput]);
    expect(second.writes.output.changed).toBe(false);
    expect(second.writes.markdownOutput.changed).toBe(false);
    expect(await readFile(output, 'utf8')).toBe(before);
    expect(JSON.parse(before).allPacksCurrent).toBe(true);

    const packFile = join(root, 'mazer-ai-seed-representative.pack.json');
    const sealRun = await runMazerAiRunCorpusAuditCli(['--seal-seed-pack', packFile]);
    expect(sealRun.writes.pack.changed).toBe(false);

    // Editing a pack makes its committed baseline stale until it is re-baselined.
    const edited = JSON.parse(await readFile(packFile, 'utf8'));
    edited.targets[0].seeds.push(999_983);
    await writeFile(packFile, JSON.stringify(edited), 'utf8');
    await runMazerAiRunCorpusAuditCli(['--seal-seed-pack', packFile]);
    const stale = (await runMazerAiRunCorpusAuditCli(['--seed-pack-coverage', root, '--output', output])).coverage;
    expect(stale.packs.find((entry) => entry.packId === 'mazer-ai-seed-representative').state).toBe('stale');
    expect(stale.allPacksCurrent).toBe(false);
  });

  test('baseline file names follow pack id and version', () => {
    expect(baselineFileNameForPack({ packId: 'p', packVersion: '2.1.0' })).toBe('p.v2.1.0.baseline.json');
  });
});
