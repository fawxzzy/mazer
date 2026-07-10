import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, test } from 'vitest';
import {
  MAZER_CYCLE_LEARNING_REPORT_SCHEMA,
  MAZER_CYCLE_LEARNING_CONSUMER_SCHEMA,
  MAZER_CYCLE_TELEMETRY_STORAGE_KEY,
  createMazeCycleTelemetryAtlasConsumerReceipt,
  createMazeCycleTelemetryAtlasReport,
  runMazeCycleTelemetryReportCli,
  validateMazeCycleTelemetryAtlasReport
} from '../../scripts/analysis/maze-cycle-telemetry-report.mjs';

const createReceipt = (overrides = {}) => ({
  id: `play-${overrides.mazeSeed ?? 100}-1`,
  surface: 'play',
  aiDecisionSummary: overrides.aiDecisionSummary ?? null,
  mazeComplexity: overrides.mazeComplexity ?? {
    checkpointScore: 0,
    deadEndCount: 3,
    deadEndPressureScore: 2.16,
    edgeWrapChoiceScore: 1.3,
    edgeWrapCount: 2,
    edgeWrapReliefScore: 0,
    edgeWrapScore: 4.8,
    edgeWrapShortcutReliefScore: 0,
    fillQualityScore: 8.4,
    floorScore: 9,
    routeScore: 17,
    shortcutScore: 3.6,
    sizeScore: 25.48,
    solutionScore: 14,
    splitCount: 8,
    splitScore: 6.24,
    total: 90,
    weightedDeadEndPressureScore: 0.7,
    weightedSplitPressureScore: 1.25
  },
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
  renderSafetyPenaltyScore: overrides.renderSafetyPenaltyScore ?? 0,
  routeEfficiencyPressureScore: overrides.routeEfficiencyPressureScore ?? 0,
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
        createReceipt({
          mazeSeed: 103,
          completedAt: '2026-07-08T12:00:03.000Z',
          aiDecisionSummary: {
            backtrackCount: 2,
            decisionCount: 18,
            optionalRetargetCount: 1,
            recoveryCount: 1,
            thinkingModel: 'human-local-memory',
            visitedUndoCount: 0,
            wrongBranchCount: 3
          }
        }),
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
    expect(report.latestReceipt.aiDecisionScore).toMatchObject({
      pressureScore: 40.305,
      reliabilityScore: 59.695,
      signal: 'searching'
    });
    expect(report.aiReview).toMatchObject({
      aiDecisionReceiptCount: 1,
      averageBacktrackCount: 2,
      averageDecisionCount: 18,
      averageOptionalRetargetCount: 1,
      averagePressureScore: 40.305,
      averageRecoveryCount: 1,
      averageReliabilityScore: 59.695,
      averageWrongBranchCount: 3,
      decisionSignalCounts: {
        clean: 0,
        searching: 1,
        chaotic: 0
      },
      thinkingModelCounts: {
        'human-local-memory': 1,
        'legacy-source': 0,
        unknown: 0
      }
    });
    expect(report.complexityReview).toMatchObject({
      averageDeadEndCount: 3,
      averageEdgeWrapCount: 2,
      averageEdgeWrapChoiceScore: 1.3,
      averageEdgeWrapReliefScore: 0,
      averageEdgeWrapShortcutReliefScore: 0,
      averageFillQualityScore: 8.4,
      averageMeasuredComplexity: 90,
      averageSplitCount: 8,
      averageWeightedDeadEndPressureScore: 0.7,
      averageWeightedSplitPressureScore: 1.25,
      canTuneComplexityFromCurrentData: true,
      complexityReceiptCount: 3
    });
    expect(report.performancePressureReview).toMatchObject({
      averageRenderSafetyPenaltyScore: 0,
      averageRouteEfficiencyPressureScore: 0,
      canTunePerformancePressureFromCurrentData: true,
      receiptCount: 3,
      renderSafetyPenaltyReceiptCount: 0,
      routeEfficiencyPressureReceiptCount: 0
    });
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
      },
      progression: {
        activeTrackId: 'ai-runner',
        generationReview: {
          adaptiveRetryCandidateCount: 3,
          adaptiveRetryScale: 57,
          adaptiveRetryUsed: true,
          allCandidatesOverTarget: false,
          allCandidatesUnderTarget: true,
          delivery: 'under-target',
          difference: -22,
          initialWindowUnderTarget: true,
          measuredComplexity: 42,
          pressureRetryCandidateCount: 3,
          pressureRetryUsed: true,
          profileBand: 'navigator',
          searchedCandidateCount: 9,
          selectedDistance: 22,
          targetComplexity: 64,
          tolerance: 8
        },
        pacing: {
          activeLevel: 8,
          activeRank: 'D',
          activeTargetComplexity: 36,
          challengeStep: 3,
          easeStep: -2,
          measuredMazeComplexity: 88,
          measuredMazeLevel: 21,
          measuredMazeRank: 'B',
          nextChallengeTargetComplexity: 39,
          nextEaseTargetComplexity: 34,
          recentChallengeCount: 2,
          recentEaseCount: 0,
          signalWindow: ['challenge', 'challenge', 'hold']
        }
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
    expect(report.progressionReview).toMatchObject({
      hasProgressionDiagnostics: true,
      activeTrackId: 'ai-runner',
      canTuneLevelPacingFromCurrentData: true,
      pacing: {
        activeLevel: 8,
        activeRank: 'D',
        activeTargetComplexity: 36,
        measuredMazeComplexity: 88,
        nextChallengeTargetComplexity: 39,
        nextEaseTargetComplexity: 34,
        signalWindow: ['challenge', 'challenge', 'hold']
      }
    });
    expect(report.generationReview).toMatchObject({
      hasGenerationDiagnostics: true,
      canTuneGenerationFromCurrentData: true,
      review: {
        adaptiveRetryCandidateCount: 3,
        adaptiveRetryScale: 57,
        adaptiveRetryUsed: true,
        allCandidatesUnderTarget: true,
        delivery: 'under-target',
        initialWindowUnderTarget: true,
        pressureRetryCandidateCount: 3,
        pressureRetryUsed: true,
        profileBand: 'navigator',
        searchedCandidateCount: 9,
        targetComplexity: 64
      }
    });
  });

  test('creates the same Atlas-safe report from Supabase cycle receipt rows', () => {
    const report = createMazeCycleTelemetryAtlasReport({
      receipts: [
        {
          id: '2d4576fb-087e-4d32-a714-2ea0a5ac72f0',
          user_id: 'user-123',
          surface: 'menu-demo',
          maze_seed: 434,
          maze_size: 44,
          route_quality: 'multi-route',
          start_cell: { x: 1, y: 2 },
          goal_cell: { x: 40, y: 41 },
          path_length: 24,
          wrong_turns: 2,
          backtracks: 1,
          completion_time_ms: 12_340,
          reset_used: false,
          control_mode: 'stick',
          average_frame_ms: 16.7,
          completed_at: '2026-07-09T04:00:00.000Z',
          receipt: {
            aiDecisionSummary: {
              backtrackCount: 1,
              decisionCount: 19,
              optionalRetargetCount: 1,
              recoveryCount: 1,
              thinkingModel: 'human-local-memory',
              visitedUndoCount: 4,
              wrongBranchCount: 2
            },
            renderSafetyPenaltyScore: 0,
            routeEfficiencyPressureScore: 12.5,
            mazeComplexity: {
              checkpointScore: 0,
              deadEndCount: 5,
              deadEndPressureScore: 3.6,
              edgeWrapChoiceScore: 1.7,
              edgeWrapCount: 2,
              edgeWrapReliefScore: 1.2,
              edgeWrapScore: 4.8,
              edgeWrapShortcutReliefScore: 1.2,
              fillQualityScore: 7.5,
              floorScore: 8,
              routeScore: 18,
              shortcutScore: 2,
              sizeScore: 22.88,
              solutionScore: 12,
              splitCount: 11,
              splitScore: 8.58,
              total: 87,
              weightedDeadEndPressureScore: 0.9,
              weightedSplitPressureScore: 1.6
            },
            playerPathPreview: [
              { x: 1, y: 2 },
              { x: 2, y: 2 }
            ],
            playerPathTruncated: true
          }
        }
      ]
    }, {
      generatedAt: '2026-07-09T04:01:00.000Z'
    });

    expect(report.source.inputKind).toBe('supabase-export');
    expect(report.latestReceipt).toMatchObject({
      surface: 'menu-demo',
      mazeSeed: 434,
      mazeSize: 44,
      playerPathLength: 24,
      playerPathTruncated: true,
      wrongTurns: 2,
      backtracks: 1,
      controlMode: 'stick'
    });
    expect(report.latestReceipt).toMatchObject({
      renderSafetyPenaltyScore: 0,
      routeEfficiencyPressureScore: 12.5
    });
    expect(report.latestReceipt.user_id).toBeUndefined();
    expect(report.latestReceipt.playerPath).toBeUndefined();
    expect(report.latestReceipt.aiDecisionSummary).toMatchObject({
      thinkingModel: 'human-local-memory',
      decisionCount: 19
    });
    expect(report.latestReceipt.aiDecisionScore).toMatchObject({
      pressureScore: 55.474,
      reliabilityScore: 44.526,
      signal: 'searching'
    });
    expect(report.latestReceipt.mazeComplexity).toMatchObject({
      edgeWrapChoiceScore: 1.7,
      edgeWrapCount: 2,
      edgeWrapShortcutReliefScore: 1.2,
      splitCount: 11,
      total: 87
    });
    expect(report.complexityReview).toMatchObject({
      averageDeadEndCount: 5,
      averageEdgeWrapCount: 2,
      averageEdgeWrapChoiceScore: 1.7,
      averageEdgeWrapReliefScore: 1.2,
      averageEdgeWrapShortcutReliefScore: 1.2,
      averageMeasuredComplexity: 87,
      averageWeightedDeadEndPressureScore: 0.9,
      averageWeightedSplitPressureScore: 1.6,
      complexityReceiptCount: 1
    });
    expect(report.performancePressureReview).toMatchObject({
      averageRenderSafetyPenaltyScore: 0,
      averageRouteEfficiencyPressureScore: 12.5,
      receiptCount: 1,
      routeEfficiencyPressureReceiptCount: 1
    });
    expect(report.aiReview).toMatchObject({
      aiDecisionReceiptCount: 1,
      averageDecisionCount: 19,
      averagePressureScore: 55.474,
      averageReliabilityScore: 44.526,
      decisionSignalCounts: {
        clean: 0,
        searching: 1,
        chaotic: 0
      }
    });
    expect(report.dataPolicy.rawPlayerPathExcludedFromReport).toBe(true);
  });

  test('validates Atlas reports and creates a bounded consumer receipt', () => {
    const report = createMazeCycleTelemetryAtlasReport({
      version: 1,
      limit: 50,
      receipts: [
        createReceipt({ mazeSeed: 401, routeEfficiencyPressureScore: 50 }),
        createReceipt({ mazeSeed: 402, routeEfficiencyPressureScore: 50 }),
        createReceipt({ mazeSeed: 403, routeEfficiencyPressureScore: 50 })
      ]
    }, {
      generatedAt: '2026-07-09T05:00:00.000Z'
    });
    const validation = validateMazeCycleTelemetryAtlasReport(report);
    const consumerReceipt = createMazeCycleTelemetryAtlasConsumerReceipt(report, {
      generatedAt: '2026-07-09T05:01:00.000Z'
    });

    expect(validation).toEqual({
      schema: MAZER_CYCLE_LEARNING_REPORT_SCHEMA,
      valid: true,
      issues: [],
      canConsumeForTuning: true
    });
    expect(consumerReceipt).toMatchObject({
      schema: MAZER_CYCLE_LEARNING_CONSUMER_SCHEMA,
      generatedAt: '2026-07-09T05:01:00.000Z',
      sourceSchema: MAZER_CYCLE_LEARNING_REPORT_SCHEMA,
      validation,
      decision: {
        focus: 'route-efficiency',
        reportSignal: 'ease',
        recommendedAction: 'reduce-pressure'
      },
      safeguards: {
        noAutoTuningWithoutValidator: true,
        rawPlayerPathRejected: false,
        diagonalGraphDeferred: true,
        enemiesObstaclesDeferred: true
      }
    });

    const invalidReport = {
      ...report,
      latestReceipt: {
        ...report.latestReceipt,
        playerPath: [{ x: 1, y: 1 }]
      }
    };

    expect(validateMazeCycleTelemetryAtlasReport(invalidReport)).toMatchObject({
      valid: false,
      canConsumeForTuning: false,
      issues: ['latest-receipt-contains-raw-path']
    });
    expect(createMazeCycleTelemetryAtlasConsumerReceipt(invalidReport).decision.focus).toBe('blocked-validation');
  });

  test('writes timestamped and latest Atlas receipt files through the CLI', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'mazer-cycle-report-'));
    const inputPath = join(tempRoot, 'local-storage.json');
    const outputPath = join(tempRoot, 'report.json');
    const consumerOutputPath = join(tempRoot, 'consumer.json');
    const receiptRoot = join(tempRoot, 'runtime', 'receipts', 'mazer', 'cycle-telemetry');
    const consumerRoot = join(tempRoot, 'runtime', 'receipts', 'mazer', 'cycle-telemetry-consumer');
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

    const { consumerReceipt, report, writes } = await runMazeCycleTelemetryReportCli([
      '--input',
      inputPath,
      '--output',
      outputPath,
      '--consumer-output',
      consumerOutputPath,
      '--atlas-receipt-root',
      receiptRoot,
      '--atlas-consumer-root',
      consumerRoot,
      '--pretty'
    ]);

    expect(report.source.inputKind).toBe('localStorage-export');
    expect(report.decision.recommendedAction).toBe('reduce-pressure');
    expect(consumerReceipt.schema).toBe(MAZER_CYCLE_LEARNING_CONSUMER_SCHEMA);
    expect(consumerReceipt.decision).toMatchObject({
      focus: 'reduce-complexity',
      recommendedAction: 'reduce-pressure'
    });
    expect(writes.output).toBe(outputPath);
    expect(writes.consumerOutput).toBe(consumerOutputPath);
    expect(writes.atlasLatest).toBe(join(receiptRoot, 'latest.json'));
    expect(writes.atlasConsumerLatest).toBe(join(consumerRoot, 'latest.json'));
    expect(JSON.parse(await readFile(outputPath, 'utf8')).schema).toBe(MAZER_CYCLE_LEARNING_REPORT_SCHEMA);
    expect(JSON.parse(await readFile(consumerOutputPath, 'utf8')).schema).toBe(MAZER_CYCLE_LEARNING_CONSUMER_SCHEMA);
    expect(JSON.parse(await readFile(join(receiptRoot, 'latest.json'), 'utf8')).decision.signal).toBe('ease');
    expect(JSON.parse(await readFile(join(consumerRoot, 'latest.json'), 'utf8')).decision.focus).toBe('reduce-complexity');
  });
});
