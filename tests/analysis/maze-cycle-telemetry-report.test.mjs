import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, test } from 'vitest';
import {
  MAZER_CYCLE_LEARNING_REPORT_SCHEMA,
  MAZER_CYCLE_TELEMETRY_STORAGE_KEY,
  createMazeCycleTelemetryAtlasReport,
  runMazeCycleTelemetryReportCli
} from '../../scripts/analysis/maze-cycle-telemetry-report.mjs';

const createReceipt = (overrides = {}) => ({
  id: `play-${overrides.mazeSeed ?? 100}-1`,
  surface: 'play',
  mazeSeed: overrides.mazeSeed ?? 100,
  mazeSize: 49,
  routeQuality: 'multi-route',
  start: { x: 1, y: 1 },
  goal: { x: 47, y: 47 },
  playerPath: Array.from({ length: overrides.pathLength ?? 12 }, (_value, index) => ({
    x: index,
    y: index % 3
  })),
  playerPathLength: overrides.pathLength ?? 12,
  playerPathTruncated: false,
  wrongTurns: overrides.wrongTurns ?? 0,
  backtracks: overrides.backtracks ?? 0,
  completionTimeMs: overrides.completionTimeMs ?? 8000,
  resetUsed: overrides.resetUsed ?? false,
  controlMode: overrides.controlMode ?? 'stick',
  averageFrameMs: overrides.averageFrameMs ?? 16.667,
  completedAt: overrides.completedAt ?? '2026-07-08T12:00:00.000Z',
  ...overrides
});

describe('maze-cycle-telemetry-report', () => {
  test('creates an Atlas-safe report from raw local cycle history', () => {
    const history = {
      version: 1,
      limit: 50,
      receipts: [
        createReceipt({ mazeSeed: 103, completedAt: '2026-07-08T12:00:03.000Z' }),
        createReceipt({ mazeSeed: 102, completedAt: '2026-07-08T12:00:02.000Z' }),
        createReceipt({ mazeSeed: 101, completedAt: '2026-07-08T12:00:01.000Z', wrongTurns: 1, backtracks: 1 })
      ]
    };

    const report = createMazeCycleTelemetryAtlasReport(history, {
      generatedAt: '2026-07-08T13:00:00.000Z'
    });

    expect(report.schema).toBe(MAZER_CYCLE_LEARNING_REPORT_SCHEMA);
    expect(report.source).toMatchObject({
      appId: 'fawxzzy-mazer',
      repoId: 'mazer',
      inputKind: 'history',
      cohortSampleKind: 'full-history'
    });
    expect(report.learning).toMatchObject({
      playSampleCount: 3,
      preferredControlMode: 'stick',
      signal: 'challenge',
      sampleCount: 3
    });
    expect(report.latestReceipt.playerPath).toBeUndefined();
    expect(report.latestReceipt.playerPathPreview).toHaveLength(8);
    expect(report.dataPolicy).toMatchObject({
      atlasSafe: true,
      rawPlayerPathExcludedFromReport: true,
      remoteAnalyticsEnabled: false
    });
  });

  test('summarizes runtime diagnostics and reports diagnostic-preview risk', () => {
    const report = createMazeCycleTelemetryAtlasReport({
      cycleTelemetry: {
        diagnosticReceiptLimit: 5,
        enabled: true,
        historyLimit: 50,
        pathLimit: 256,
        storageKey: MAZER_CYCLE_TELEMETRY_STORAGE_KEY,
        storedCount: 12,
        learning: {
          averageBacktracks: 7,
          averageCompletionTimeMs: 44_000,
          averageFrameMs: 24.5,
          averageWrongTurns: 8,
          confidence: 1,
          menuDemoSampleCount: 9,
          playSampleCount: 3,
          preferredControlMode: 'arrows',
          resetRate: 0.667,
          routeQualityCounts: {
            'multi-route': 10,
            'single-route': 1,
            unknown: 1
          },
          sampleCount: 12,
          signal: 'ease'
        },
        recentReceipts: [
          createReceipt({
            backtracks: 7,
            controlMode: 'arrows',
            mazeSeed: 220,
            resetUsed: true,
            wrongTurns: 8
          })
        ]
      }
    }, {
      generatedAt: '2026-07-08T14:00:00.000Z'
    });

    expect(report.source).toMatchObject({
      inputKind: 'runtime-diagnostics',
      storedCount: 12,
      cohortSampleKind: 'diagnostic-recent-receipts'
    });
    expect(report.decision).toMatchObject({
      signal: 'ease',
      recommendedAction: 'reduce-pressure'
    });
    expect(report.risks).toContain('diagnostic-input-may-only-include-recent-receipt-previews');
    expect(report.risks).toContain('performance-may-distort-completion-and-control-readings');
  });

  test('writes timestamped and latest Atlas receipt files through the CLI', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'mazer-cycle-report-'));
    const inputPath = join(tempRoot, 'local-storage.json');
    const outputPath = join(tempRoot, 'report.json');
    const receiptRoot = join(tempRoot, 'runtime', 'receipts', 'mazer', 'cycle-telemetry');
    const history = {
      version: 1,
      limit: 50,
      receipts: [
        createReceipt({ mazeSeed: 301, resetUsed: true, wrongTurns: 9, backtracks: 7 }),
        createReceipt({ mazeSeed: 302, resetUsed: true, wrongTurns: 8, backtracks: 6 }),
        createReceipt({ mazeSeed: 303, resetUsed: false, wrongTurns: 7, backtracks: 8 })
      ]
    };
    await writeFile(inputPath, JSON.stringify({
      [MAZER_CYCLE_TELEMETRY_STORAGE_KEY]: JSON.stringify(history)
    }), 'utf8');

    const { report, writes } = await runMazeCycleTelemetryReportCli([
      '--input',
      inputPath,
      '--output',
      outputPath,
      '--atlas-receipt-root',
      receiptRoot,
      '--pretty'
    ]);

    expect(report.source.inputKind).toBe('localStorage-export');
    expect(report.decision.recommendedAction).toBe('reduce-pressure');
    expect(writes.output).toBe(outputPath);
    expect(writes.atlasLatest).toBe(join(receiptRoot, 'latest.json'));
    expect(JSON.parse(await readFile(outputPath, 'utf8')).schema).toBe(MAZER_CYCLE_LEARNING_REPORT_SCHEMA);
    expect(JSON.parse(await readFile(join(receiptRoot, 'latest.json'), 'utf8')).decision.signal).toBe('ease');
  });
});
