// Pure helpers for MAZER-AI-001 run-corpus calibration thresholds: derive a
// per-band threshold table from the committed seed-pack baselines, and check a
// (re)generated set of baselines against a committed threshold table. No
// src/ TypeScript imports, no I/O except loadBaselines; fixtures and generated
// mazes only (never account data).
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { roundTo } from './ai-run-seed-packs.mjs';

export const MAZER_AI_RUN_CALIBRATION_THRESHOLDS_SCHEMA = 'mazer.ai-run-calibration-thresholds.v1';

// Targets whose id contains this marker use a deliberately under-skilled AI.
// They are excluded from the per-band "healthy" thresholds and instead feed the
// discrimination check (the pack must still be able to produce AI trouble).
export const WEAK_AI_TARGET_MARKER = 'weak-ai';

export const CALIBRATION_RULES = Object.freeze({
  hard: 'Every case reaches the goal, uses no reset, never beats the benchmark path, and has no profile-normalization drift. Any violation fails.',
  runQualityMinFloor: 'floor((lowest run-quality total among standard-AI cases in the band) - 10) to a multiple of 5, never below 0.',
  aiPressureMedianCeiling: 'ceil((highest per-target median AI pressure in the band) + 10) to a multiple of 5.',
  routeOverrunMaxCeiling: '(highest per-target max route-overrun ratio in the band) + 0.10, rounded to 2 decimals.',
  complexityMedianRange: '[0.75, 1.25] x the median of the per-target median measured complexity in the band (a before/after drift alarm, not a quality claim).',
  discrimination: 'At least one weak-AI target must still show AI pressure median above 0 and run-quality minimum below 100; otherwise the pack no longer discriminates and needs a new version.'
});

export const BAND_ORDER = ['tutorial', 'starter', 'explorer', 'navigator', 'architect', 'mythic'];

const ceilTo = (value, step) => Math.ceil(value / step) * step;
const floorTo = (value, step) => Math.floor(value / step) * step;
const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

const isWeakTarget = (target) => target.targetId.includes(WEAK_AI_TARGET_MARKER);

const targetRows = (baselines) => baselines.flatMap((baseline) => baseline.targets.map((target) => ({
  packId: baseline.pack.packId,
  weak: isWeakTarget(target),
  ...target
})));

const bandMeasurements = (standard) => ({
  runQualityMin: Math.min(...standard.map((row) => row.summary.runQualityTotal.min)),
  maxAiMedian: Math.max(...standard.map((row) => row.summary.aiPressureScore.median)),
  maxOverrun: Math.max(...standard.map((row) => row.summary.routeOverrunRatio.max)),
  complexityMedian: median(standard.map((row) => row.summary.measuredComplexity.median))
});

export const deriveCalibrationThresholds = (baselines) => {
  const rows = targetRows(baselines);
  const bands = {};
  for (const band of BAND_ORDER) {
    const standard = rows.filter((row) => row.band === band && !row.weak);
    if (standard.length === 0) continue;
    const m = bandMeasurements(standard);
    bands[band] = {
      standardTargetIds: standard.map((row) => row.targetId).sort(),
      runQualityMinFloor: Math.max(0, floorTo(m.runQualityMin - 10, 5)),
      aiPressureMedianCeiling: ceilTo(m.maxAiMedian + 10, 5),
      routeOverrunMaxCeiling: roundTo(m.maxOverrun + 0.1, 2),
      complexityMedianRange: {
        min: roundTo(m.complexityMedian * 0.75, 1),
        max: roundTo(m.complexityMedian * 1.25, 1)
      }
    };
  }
  return {
    schema: MAZER_AI_RUN_CALIBRATION_THRESHOLDS_SCHEMA,
    rules: CALIBRATION_RULES,
    basedOn: baselines
      .map((baseline) => ({
        packId: baseline.pack.packId,
        packVersion: baseline.pack.packVersion,
        packHash: baseline.pack.hash,
        resultDigest: baseline.resultDigest
      }))
      .sort((a, b) => a.packId.localeCompare(b.packId)),
    bands
  };
};

export const checkBaselinesAgainstThresholds = (thresholds, baselines) => {
  const violations = [];
  const fail = (scope, message) => violations.push({ scope, message });
  const rows = targetRows(baselines);

  for (const row of rows) {
    const s = row.summary;
    const scope = `${row.packId}/${row.targetId}`;
    if (s.reachedGoalCount !== s.caseCount) fail(scope, `goal reached in ${s.reachedGoalCount}/${s.caseCount} cases`);
    if (s.resetUsedCount !== 0) fail(scope, `${s.resetUsedCount} cases used a reset`);
    if (s.actualShorterThanBenchmarkCount !== 0) fail(scope, `${s.actualShorterThanBenchmarkCount} cases beat the benchmark path`);
    if (s.profileNormalizationDriftCount !== 0) fail(scope, `${s.profileNormalizationDriftCount} cases had profile-normalization drift`);
  }

  for (const [band, limits] of Object.entries(thresholds.bands)) {
    const standard = rows.filter((row) => row.band === band && !row.weak);
    if (standard.length === 0) {
      fail(band, 'no standard-AI target covers this band');
      continue;
    }
    const m = bandMeasurements(standard);
    if (m.runQualityMin < limits.runQualityMinFloor) fail(band, `run-quality min ${m.runQualityMin} is below floor ${limits.runQualityMinFloor}`);
    if (m.maxAiMedian > limits.aiPressureMedianCeiling) fail(band, `AI pressure median ${m.maxAiMedian} is above ceiling ${limits.aiPressureMedianCeiling}`);
    if (m.maxOverrun > limits.routeOverrunMaxCeiling) fail(band, `route overrun ${m.maxOverrun} is above ceiling ${limits.routeOverrunMaxCeiling}`);
    if (m.complexityMedian < limits.complexityMedianRange.min || m.complexityMedian > limits.complexityMedianRange.max) {
      fail(band, `median measured complexity ${m.complexityMedian} is outside [${limits.complexityMedianRange.min}, ${limits.complexityMedianRange.max}]`);
    }
  }

  const weak = rows.filter((row) => row.weak);
  const discriminates = weak.some((row) => row.summary.aiPressureScore.median > 0 && row.summary.runQualityTotal.min < 100);
  if (!discriminates) fail('discrimination', 'no weak-AI target shows AI pressure above 0 with run quality below 100');

  return { pass: violations.length === 0, violations };
};

export const renderCalibrationThresholdsMarkdown = (thresholds) => {
  const lines = [
    '| band | standard targets | run-quality min floor | AI pressure median ceiling | route overrun max ceiling | median complexity range |',
    '| --- | --- | ---: | ---: | ---: | --- |'
  ];
  for (const band of BAND_ORDER) {
    const limits = thresholds.bands[band];
    if (!limits) continue;
    lines.push(`| ${band} | ${limits.standardTargetIds.join(', ')} | ${limits.runQualityMinFloor} | ${limits.aiPressureMedianCeiling} | ${limits.routeOverrunMaxCeiling} | ${limits.complexityMedianRange.min} to ${limits.complexityMedianRange.max} |`);
  }
  return lines.join('\n');
};

export const loadBaselines = async (packDirectory) => {
  const directory = join(packDirectory, 'baselines');
  const names = (await readdir(directory)).filter((name) => name.endsWith('.baseline.json')).sort();
  const baselines = [];
  for (const name of names) baselines.push(JSON.parse(await readFile(join(directory, name), 'utf8')));
  return baselines;
};
