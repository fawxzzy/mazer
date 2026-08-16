import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

const read = (path: string): string => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('maze cycle run-quality scorer consumers', () => {
  test('routes runtime, progression, reporting, corpus audit, and calibration through one scorer', () => {
    const consumers = [
      'src/legacy-runtime/mazeCycleTelemetry.ts',
      'src/legacy-runtime/legacyProgression.ts',
      'scripts/analysis/maze-cycle-telemetry-report.mjs',
      'scripts/analysis/ai-run-corpus-audit.mjs',
      'scripts/analysis/ai-runner-calibration.ts'
    ];

    for (const consumer of consumers) {
      expect(read(consumer), consumer).toContain('mazeCycleRunQualityScorer.mjs');
    }
  });

  test('keeps the weighted formula in the scorer and stores it only on future receipts', () => {
    const scorer = read('src/legacy-runtime/mazeCycleRunQualityScorer.mjs');
    const progression = read('src/legacy-runtime/legacyProgression.ts');
    const remote = read('src/legacy-runtime/legacyRemoteProgression.ts');
    const topology = read('src/legacy-runtime/mazeCycleRunQualityTopology.ts');

    expect(scorer).toContain('(timeScore * 0.38)');
    expect(scorer).toContain('(base.timeScore * 0.22)');
    expect(progression).not.toContain('(timeScore * 0.38)');
    expect(progression).not.toContain('(baseScore.timeScore * 0.22)');
    expect(remote).toContain('runQualityScore: receipt.runQualityScore');
    expect(remote).toContain('runQualityMetrics: receipt.runQualityMetrics');
    expect(topology).toContain('fromStart + fromGoal === optimalSteps');
    expect(topology).toContain("graphPolicy: 'playable-wrap-aware'");
  });
});
