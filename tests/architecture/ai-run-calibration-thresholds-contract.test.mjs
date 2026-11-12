import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import {
  BAND_ORDER,
  MAZER_AI_RUN_CALIBRATION_THRESHOLDS_SCHEMA,
  checkBaselinesAgainstThresholds,
  deriveCalibrationThresholds,
  renderCalibrationThresholdsMarkdown
} from '../../scripts/analysis/lib/ai-run-calibration-thresholds.mjs';

// Normalise CRLF so checkouts with core.autocrlf behave like CI.
const readRepoFile = (path) => readFileSync(resolve(process.cwd(), path), 'utf8').replace(/\r\n/g, '\n');

const stat = (min, median, max) => ({ count: 6, min, median, max, mean: median });

const target = (targetId, band, overrides = {}) => ({
  targetId,
  band,
  summary: {
    caseCount: 6,
    reachedGoalCount: 6,
    resetUsedCount: 0,
    actualShorterThanBenchmarkCount: 0,
    profileNormalizationDriftCount: 0,
    measuredComplexity: stat(90, 100, 110),
    runQualityTotal: stat(100, 100, 100),
    aiPressureScore: stat(0, 0, 0),
    routeOverrunRatio: stat(0, 0, 0),
    ...overrides
  }
});

const baseline = (packId, targets) => ({
  pack: { packId, packVersion: '1.0.0', hash: `sha256:${packId}` },
  resultDigest: `sha256:digest-${packId}`,
  targets
});

const weakLongTail = target('explorer-weak-ai-long-tail', 'explorer', {
  runQualityTotal: stat(92, 93.5, 100),
  aiPressureScore: stat(0, 9.3, 13.5),
  routeOverrunRatio: stat(0, 0.1, 0.22)
});

const syntheticBaselines = () => [
  baseline('pack-a', [target('tutorial-a', 'tutorial'), target('explorer-a', 'explorer'), weakLongTail])
];

describe('AI run calibration thresholds', () => {
  test('derivation applies the documented rules and ignores weak-AI targets', () => {
    const thresholds = deriveCalibrationThresholds(syntheticBaselines());

    expect(thresholds.schema).toBe(MAZER_AI_RUN_CALIBRATION_THRESHOLDS_SCHEMA);
    expect(Object.keys(thresholds.bands)).toEqual(['tutorial', 'explorer']);
    expect(thresholds.bands.explorer).toEqual({
      standardTargetIds: ['explorer-a'],
      runQualityMinFloor: 90,
      aiPressureMedianCeiling: 10,
      routeOverrunMaxCeiling: 0.1,
      complexityMedianRange: { min: 75, max: 125 }
    });
    expect(thresholds.basedOn).toEqual([
      { packId: 'pack-a', packVersion: '1.0.0', packHash: 'sha256:pack-a', resultDigest: 'sha256:digest-pack-a' }
    ]);
    expect(deriveCalibrationThresholds(syntheticBaselines())).toEqual(thresholds);
  });

  test('check passes on its own source and flags each kind of regression', () => {
    const thresholds = deriveCalibrationThresholds(syntheticBaselines());
    expect(checkBaselinesAgainstThresholds(thresholds, syntheticBaselines())).toEqual({ pass: true, violations: [] });

    const regress = (overrides) => checkBaselinesAgainstThresholds(thresholds, [
      baseline('pack-a', [target('tutorial-a', 'tutorial'), target('explorer-a', 'explorer', overrides), weakLongTail])
    ]);
    const messages = (result) => result.violations.map((violation) => violation.message).join(' | ');

    expect(messages(regress({ reachedGoalCount: 5 }))).toContain('goal reached in 5/6');
    expect(messages(regress({ resetUsedCount: 1 }))).toContain('used a reset');
    expect(messages(regress({ profileNormalizationDriftCount: 2 }))).toContain('profile-normalization drift');
    expect(messages(regress({ runQualityTotal: stat(70, 100, 100) }))).toContain('run-quality min 70');
    expect(messages(regress({ aiPressureScore: stat(0, 40, 40) }))).toContain('AI pressure median 40');
    expect(messages(regress({ routeOverrunRatio: stat(0, 0, 0.5) }))).toContain('route overrun 0.5');
    expect(messages(regress({ measuredComplexity: stat(190, 200, 210) }))).toContain('median measured complexity 200');
  });

  test('check flags a pack that has stopped discriminating', () => {
    const thresholds = deriveCalibrationThresholds(syntheticBaselines());
    const flat = target('explorer-weak-ai-long-tail', 'explorer');
    const result = checkBaselinesAgainstThresholds(thresholds, [
      baseline('pack-a', [target('tutorial-a', 'tutorial'), target('explorer-a', 'explorer'), flat])
    ]);

    expect(result.pass).toBe(false);
    expect(result.violations.map((violation) => violation.scope)).toEqual(['discrimination']);
  });

  test('committed thresholds file is well formed, covers every pack band, and matches the packet table', () => {
    const thresholds = JSON.parse(readRepoFile('tests/fixtures/ai-run-seed-packs/calibration-thresholds.v1.json'));
    const packBands = new Set();
    const packIds = [];
    for (const name of ['representative', 'stress', 'wrap-anomaly']) {
      const pack = JSON.parse(readRepoFile(`tests/fixtures/ai-run-seed-packs/mazer-ai-seed-${name}.pack.json`));
      packIds.push(pack.packId);
      for (const packTarget of pack.targets) packBands.add(packTarget.band);
    }

    expect(thresholds.schema).toBe(MAZER_AI_RUN_CALIBRATION_THRESHOLDS_SCHEMA);
    expect(thresholds.basedOn.map((entry) => entry.packId)).toEqual([...packIds].sort());
    expect(Object.keys(thresholds.bands)).toEqual(BAND_ORDER.filter((band) => packBands.has(band)));

    const packet = readRepoFile('docs/ops/MAZER-AI-RUN-CALIBRATION-THRESHOLDS-2026-11-12.md');
    expect(packet).toContain(renderCalibrationThresholdsMarkdown(thresholds));
    for (const entry of thresholds.basedOn) expect(packet).toContain(entry.resultDigest);
  });
});
