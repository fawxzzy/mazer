import { describe, expect, test } from 'vitest';

import {
  buildGenerationDeliveryReport,
  formatGenerationDeliveryReportTable,
  LEGACY_GENERATION_DELIVERY_DEFAULT_TARGETS,
  LEGACY_GENERATION_DELIVERY_REPORT_SCHEMA,
  LEGACY_GENERATION_DELIVERY_TOLERANCE,
  serializeGenerationDeliveryReport
} from '../../scripts/analysis/legacy-generation-delivery-report';

const SMALL_OPTIONS = { seeds: [1, 2, 3, 4], surface: 'play', targets: [8, 60] } as const;

describe('legacy generation delivery report (measurement-only)', () => {
  test('is byte-identical across repeated runs with the same arguments', () => {
    const first = serializeGenerationDeliveryReport(buildGenerationDeliveryReport(SMALL_OPTIONS));
    const replay = serializeGenerationDeliveryReport(buildGenerationDeliveryReport(SMALL_OPTIONS));
    expect(replay).toBe(first);
  });

  test('has the documented shape and sane numbers', () => {
    const report = buildGenerationDeliveryReport(SMALL_OPTIONS);

    expect(report.header.schema).toBe(LEGACY_GENERATION_DELIVERY_REPORT_SCHEMA);
    expect(report.header.surface).toBe('play');
    expect(report.header.viewport).toBeNull();
    expect(report.header.selectionTolerance).toBe(LEGACY_GENERATION_DELIVERY_TOLERANCE);
    expect(report.header.targets).toEqual([8, 60]);
    expect(report.header.seeds).toEqual([1, 2, 3, 4]);
    expect(report.rows.map((row) => row.target)).toEqual([8, 60]);
    expect(LEGACY_GENERATION_DELIVERY_DEFAULT_TARGETS).toEqual([8, 12, 16, 24, 44, 60, 90, 140, 200]);

    for (const row of report.rows) {
      expect(row.n).toBe(4);
      const nonNegative = [
        row.boardHeightMean,
        row.boardWidthMean,
        row.complexityTotalMax,
        row.complexityTotalMean,
        row.complexityTotalMin,
        row.countAdaptiveRetryUsed,
        row.countOverTarget,
        row.countOverTargetPlusTolerance,
        row.countPressureRetryUsed,
        row.countUnderTarget,
        row.countUnderTargetMinusTolerance,
        row.deadEndCountMean,
        row.directShortestPathStepsMean,
        row.edgeWrapsMax,
        row.edgeWrapsMean,
        row.playableShortestPathStepsMean,
        row.resolvedScale,
        row.searchedCandidateCountMean,
        row.splitCountMean
      ];
      for (const value of nonNegative) {
        expect(Number.isFinite(value)).toBe(true);
        expect(value).toBeGreaterThanOrEqual(0);
      }
      expect(Number.isFinite(row.overshootMean)).toBe(true);
      expect(row.complexityTotalMin).toBeLessThanOrEqual(row.complexityTotalMean);
      expect(row.complexityTotalMean).toBeLessThanOrEqual(row.complexityTotalMax);
      for (const count of [
        row.countOverTarget,
        row.countOverTargetPlusTolerance,
        row.countUnderTarget,
        row.countUnderTargetMinusTolerance
      ]) {
        expect(count).toBeLessThanOrEqual(row.n);
      }
      expect(row.countOverTargetPlusTolerance).toBeLessThanOrEqual(row.countOverTarget);
      expect(row.countUnderTargetMinusTolerance).toBeLessThanOrEqual(row.countUnderTarget);
      expect(
        row.deliveryCounts['on-target'] + row.deliveryCounts['over-target'] + row.deliveryCounts['under-target']
      ).toBe(row.n);
      expect(row.playableShortestPathStepsMean).toBeGreaterThan(0);
      expect(row.searchedCandidateCountMean).toBeGreaterThanOrEqual(1);
    }
  });

  test('serializes with sorted keys, no timestamps, and no absolute paths', () => {
    const report = buildGenerationDeliveryReport(SMALL_OPTIONS);
    const json = serializeGenerationDeliveryReport(report);
    const table = formatGenerationDeliveryReportTable(report);

    for (const text of [json, table]) {
      expect(text).not.toMatch(/[A-Za-z]:[\\/]/);
      expect(text).not.toMatch(/\\\\/);
      expect(text).not.toMatch(/\/(?:Users|home|tmp|var)\//);
      expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
      expect(text).not.toMatch(/timestamp|generatedAt|createdAt|wallTime|elapsed/i);
    }

    const assertSortedKeys = (value: unknown): void => {
      if (Array.isArray(value)) {
        value.forEach(assertSortedKeys);
      } else if (value !== null && typeof value === 'object') {
        const keys = Object.keys(value as Record<string, unknown>);
        // JSON.parse reorders integer-like keys numerically, so only objects
        // with non-integer keys can be checked for lexicographic order here.
        if (!keys.some((key) => /^\d+$/.test(key))) {
          expect(keys).toEqual([...keys].sort());
        }
        Object.values(value as Record<string, unknown>).forEach(assertSortedKeys);
      }
    };
    assertSortedKeys(JSON.parse(json));
    expect(json.endsWith('\n')).toBe(true);
  });

  test('keeps known delivery misses in the observations block only (descriptive, not gated)', () => {
    const { observations } = buildGenerationDeliveryReport(SMALL_OPTIONS);
    expect(typeof observations.playableShortestPathMeanNonDecreasingInTarget).toBe('boolean');
    expect(Array.isArray(observations.playableShortestPathDecreases)).toBe(true);
    expect(Object.keys(observations.meanOvershootPerTarget).sort()).toEqual(['60', '8']);
  });
});
