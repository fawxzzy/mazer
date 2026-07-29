import { describe, expect, test } from 'vitest';

import { collectDemoWalkerRouteDiagnostics } from '../../src/domain/ai';
import { isTileFloor } from '../../src/domain/maze';
import {
  createLegacyDemoWalkerEpisode,
  createLegacyMenuDemoWalkerConfig
} from '../../src/legacy-runtime/legacyDemoWalker';
import { createLegacyGeneratedMenuMaze } from '../../src/legacy-runtime/legacyMaze';

describe('human-memory AI recovery diagnostics', () => {
  test('records every recovery decision without exposing a solver route', () => {
    const seeds = [1, 2, 3, 5, 8] as const;
    let branchDecisionCount = 0;
    let frontierRecoveryCount = 0;

    for (const seed of seeds) {
      const maze = createLegacyGeneratedMenuMaze(37, seed);
      const episode = createLegacyDemoWalkerEpisode(maze);
      const diagnostics = collectDemoWalkerRouteDiagnostics(
        episode,
        createLegacyMenuDemoWalkerConfig(seed)
      );

      expect(diagnostics.recoveryDecisions).toHaveLength(diagnostics.telemetry.recoveryCount);

      for (const evaluation of diagnostics.optionalRetargetEvaluations) {
        expect(evaluation.candidateCount).toBeGreaterThanOrEqual(1);
        expect(evaluation.comparisonMargin).toBe(-4.2);
        expect(evaluation.routeCursor).toBeGreaterThanOrEqual(0);
        expect(evaluation.routeCursor).toBeLessThan(diagnostics.routeLength);
        expect(evaluation.knownRouteStepCount).toBeGreaterThan(0);
        expect(Number.isFinite(evaluation.currentBestScore)).toBe(true);
        expect(Number.isFinite(evaluation.effectiveCandidateScore)).toBe(true);
        expect(Number.isFinite(evaluation.admissionDelta)).toBe(true);
        expect(evaluation.admissionDelta).toBeCloseTo(
          evaluation.currentBestScore - (
            evaluation.effectiveCandidateScore + evaluation.comparisonMargin
          ),
          12
        );
        expect(evaluation.admitted).toBe(evaluation.admissionDelta > 0);
        expect(isTileFloor(episode.raster.tiles, evaluation.fromIndex)).toBe(true);
        expect(isTileFloor(episode.raster.tiles, evaluation.splitIndex)).toBe(true);
        expect(isTileFloor(episode.raster.tiles, evaluation.targetIndex)).toBe(true);
        expect(evaluation.targetIndex).not.toBe(episode.raster.endIndex);
      }

      for (const decision of diagnostics.branchDecisions) {
        branchDecisionCount += 1;
        expect(decision.candidates.length).toBeGreaterThanOrEqual(2);
        expect(decision.routeCursor).toBeGreaterThanOrEqual(0);
        expect(decision.routeCursor).toBeLessThan(diagnostics.routeLength);
        expect(isTileFloor(episode.raster.tiles, decision.fromIndex)).toBe(true);
        expect(decision.candidates.some((candidate) => candidate.index === decision.selectedIndex)).toBe(true);
        if (decision.canonicalChoiceIndex === null) {
          expect(decision.canonicalSelection).toBeNull();
        } else {
          expect(decision.canonicalChoiceIndex).not.toBe(episode.raster.endIndex);
          expect(decision.candidates.some((candidate) => candidate.index === decision.canonicalChoiceIndex)).toBe(true);
          expect(decision.canonicalSelection).toBe(decision.canonicalChoiceIndex === decision.selectedIndex);
        }

        for (const candidate of decision.candidates) {
          expect(candidate.index).not.toBe(episode.raster.endIndex);
          expect(isTileFloor(episode.raster.tiles, candidate.index)).toBe(true);
          expect(candidate.confidence).toBeGreaterThanOrEqual(0);
          expect(candidate.confidence).toBeLessThanOrEqual(100);
        }
      }

      for (const decision of diagnostics.recoveryDecisions) {
        expect(decision.candidateCount).toBeGreaterThanOrEqual(1);
        expect(decision.evaluatedCandidateCount).toBeGreaterThanOrEqual(decision.candidateCount);
        expect(decision.knownRouteStepCount).toBeGreaterThanOrEqual(0);
        expect(decision.routeCursor).toBeGreaterThanOrEqual(0);
        expect(decision.routeCursor).toBeLessThan(diagnostics.routeLength);
        expect(isTileFloor(episode.raster.tiles, decision.fromIndex)).toBe(true);
        expect(isTileFloor(episode.raster.tiles, decision.splitIndex)).toBe(true);
        expect(isTileFloor(episode.raster.tiles, decision.targetIndex)).toBe(true);
        if (decision.selectedScoreMargin !== null) {
          expect(decision.selectedScoreMargin).toBeGreaterThanOrEqual(0);
        }
        if (decision.kind === 'frontier-recovery') {
          frontierRecoveryCount += 1;
        }
      }
    }

    expect(frontierRecoveryCount).toBeGreaterThan(0);
    expect(branchDecisionCount).toBeGreaterThan(0);
  });

  test('keeps the D-rank recovery pool bounded to nearby remembered frontiers', () => {
    const seeds = [1, 2, 3, 5, 8] as const;
    let frontierRecoveryCount = 0;

    for (const seed of seeds) {
      const maze = createLegacyGeneratedMenuMaze(75, seed);
      const episode = createLegacyDemoWalkerEpisode(maze);
      const baseConfig = createLegacyMenuDemoWalkerConfig(seed);
      const diagnostics = collectDemoWalkerRouteDiagnostics(episode, {
        ...baseConfig,
        behavior: {
          ...baseConfig.behavior,
          aiSkillLevel: 1,
          aiSkillRank: 'D'
        }
      });

      for (const decision of diagnostics.recoveryDecisions) {
        expect(decision.candidateCount).toBeGreaterThanOrEqual(1);
        expect(decision.candidateCount).toBeLessThanOrEqual(16);
        expect(decision.evaluatedCandidateCount).toBeGreaterThanOrEqual(decision.candidateCount);
        expect(decision.evaluatedCandidateCount).toBeLessThanOrEqual(16);
        if (decision.kind === 'frontier-recovery') {
          frontierRecoveryCount += 1;
        }
      }
    }

    expect(frontierRecoveryCount).toBeGreaterThan(0);
  });

  test('applies the warmed A/S retarget grace at the decisive one-step comparison', () => {
    const seed = 8;
    const maze = createLegacyGeneratedMenuMaze(50, seed);
    const episode = createLegacyDemoWalkerEpisode(maze);
    const baseConfig = createLegacyMenuDemoWalkerConfig(seed);
    const collectForRank = (aiSkillRank: 'B' | 'A' | 'S') => collectDemoWalkerRouteDiagnostics(
      episode,
      {
        ...baseConfig,
        behavior: {
          ...baseConfig.behavior,
          aiSkillLevel: 1,
          aiSkillRank
        }
      }
    );

    const bFirst = collectForRank('B');
    const bSecond = collectForRank('B');
    const aFirst = collectForRank('A');
    const aSecond = collectForRank('A');
    const sFirst = collectForRank('S');
    const sSecond = collectForRank('S');
    const matchesDecisiveComparison = (evaluation: {
      fromIndex: number;
      splitIndex: number;
      targetIndex: number;
    }) => (
      evaluation.fromIndex === 1163
      && evaluation.splitIndex === 1114
      && evaluation.targetIndex === 1113
    );

    expect(bSecond).toEqual(bFirst);
    expect(aSecond).toEqual(aFirst);
    expect(sSecond).toEqual(sFirst);
    expect(bFirst.routeLength).toBe(111);
    expect(aFirst.routeLength).toBe(111);
    expect(sFirst.routeLength).toBe(113);
    expect(bFirst.telemetry).toMatchObject({
      backtrackCount: 6,
      recoveryCount: 4,
      wrongBranchCount: 4
    });
    expect(aFirst.telemetry).toMatchObject({
      backtrackCount: 6,
      recoveryCount: 4,
      wrongBranchCount: 4
    });
    expect(sFirst.telemetry).toMatchObject({
      backtrackCount: 6,
      recoveryCount: 4,
      wrongBranchCount: 7
    });
    const bEvaluation = bFirst.optionalRetargetEvaluations.find(matchesDecisiveComparison);
    const aEvaluation = aFirst.optionalRetargetEvaluations.find(matchesDecisiveComparison);
    const sEvaluation = sFirst.optionalRetargetEvaluations.find(matchesDecisiveComparison);
    const aRecoveryDecision = aFirst.recoveryDecisions.find((decision) => (
      decision.kind === 'optional-retarget'
      && matchesDecisiveComparison(decision)
    ));
    const sRecoveryDecision = sFirst.recoveryDecisions.find((decision) => (
      decision.kind === 'optional-retarget'
      && matchesDecisiveComparison(decision)
    ));

    expect(bEvaluation).toMatchObject({
      admitted: true,
      candidateCount: 2,
      comparisonMargin: -4.2,
      fromIndex: 1163,
      knownRouteStepCount: 1,
      routeCursor: 17,
      splitIndex: 1114,
      targetIndex: 1113
    });
    expect(bEvaluation?.currentBestScore).toBeCloseTo(34.11885591973797, 12);
    expect(bEvaluation?.effectiveCandidateScore).toBeCloseTo(38.08968228478288, 12);
    expect(bEvaluation?.admissionDelta).toBeCloseTo(0.2291736349550888, 12);

    expect(aEvaluation).toMatchObject({
      admitted: true,
      candidateCount: 2,
      comparisonMargin: -4.2,
      fromIndex: 1163,
      knownRouteStepCount: 1,
      routeCursor: 17,
      splitIndex: 1114,
      targetIndex: 1113
    });
    expect(aEvaluation?.currentBestScore).toBeCloseTo(33.505964950894594, 12);
    expect(aEvaluation?.effectiveCandidateScore).toBeCloseTo(37.99670569106149, 12);
    expect(aEvaluation?.admissionDelta).toBeCloseTo(-0.2907407401668962, 12);

    expect(sEvaluation).toMatchObject({
      admitted: true,
      candidateCount: 2,
      comparisonMargin: -4.2,
      fromIndex: 1163,
      knownRouteStepCount: 1,
      routeCursor: 17,
      splitIndex: 1114,
      targetIndex: 1113
    });
    expect(sEvaluation?.currentBestScore).toBeCloseTo(33.24349116955439, 12);
    expect(sEvaluation?.effectiveCandidateScore).toBeCloseTo(37.91719063580163, 12);
    expect(sEvaluation?.admissionDelta).toBeCloseTo(-0.4736994662472398, 12);

    expect(aRecoveryDecision).toMatchObject({
      candidateCount: 1,
      evaluatedCandidateCount: 2,
      fromIndex: 1163,
      kind: 'optional-retarget',
      knownRouteStepCount: 1,
      splitIndex: 1114,
      targetIndex: 1113
    });
    expect(sRecoveryDecision).toMatchObject({
      candidateCount: 1,
      evaluatedCandidateCount: 2,
      fromIndex: 1163,
      kind: 'optional-retarget',
      knownRouteStepCount: 1,
      splitIndex: 1114,
      targetIndex: 1113
    });
  });

  test('keeps the S-rank grace blocked before the existing cooldown warm-up', () => {
    const seed = 6765;
    const maze = createLegacyGeneratedMenuMaze(50, seed);
    const episode = createLegacyDemoWalkerEpisode(maze);
    const baseConfig = createLegacyMenuDemoWalkerConfig(seed);
    const collect = () => collectDemoWalkerRouteDiagnostics(
      episode,
      {
        ...baseConfig,
        behavior: {
          ...baseConfig.behavior,
          aiSkillLevel: 1,
          aiSkillRank: 'S'
        }
      }
    );
    const first = collect();
    const second = collect();
    const evaluation = first.optionalRetargetEvaluations.find((candidate) => (
      candidate.fromIndex === 1912
      && candidate.splitIndex === 1961
      && candidate.targetIndex === 1960
    ));

    expect(second).toEqual(first);
    expect(evaluation).toMatchObject({
      admitted: false,
      candidateCount: 2,
      comparisonMargin: -4.2,
      fromIndex: 1912,
      knownRouteStepCount: 1,
      routeCursor: 3,
      splitIndex: 1961,
      targetIndex: 1960
    });
    expect(evaluation?.admissionDelta).toBeCloseTo(-0.31862306111398553, 12);
  });
});
