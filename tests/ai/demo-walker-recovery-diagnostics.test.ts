import { describe, expect, test } from 'vitest';

import { collectDemoWalkerRouteDiagnostics } from '../../src/domain/ai';
import { isTileFloor } from '../../src/domain/maze';
import {
  createLegacyDemoWalkerEpisode,
  createLegacyMenuDemoWalkerConfig
} from '../../src/legacy-runtime/legacyDemoWalker';
import {
  createLegacyGeneratedMenuMaze,
  resolveLegacyPlayableShortestPath
} from '../../src/legacy-runtime/legacyMaze';

describe('human-memory AI recovery diagnostics', () => {
  test('records every recovery decision without exposing a solver route', () => {
    const seeds = [1, 2, 3, 5, 8] as const;
    let branchDecisionCount = 0;
    let frontierRecoveryCount = 0;

    for (const seed of seeds) {
      const maze = createLegacyGeneratedMenuMaze(37, 37, seed);
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

  test('moves D rank onto the playable shortest route without recovery detours', () => {
    const seeds = [1, 2, 3, 5, 8] as const;

    for (const seed of seeds) {
      const maze = createLegacyGeneratedMenuMaze(75, 75, seed);
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

      const shortestPath = resolveLegacyPlayableShortestPath(maze.grid, maze.start, maze.goal);
      expect(shortestPath.found).toBe(true);
      expect(diagnostics.routeLength).toBe(shortestPath.path.length);
      expect(diagnostics.recoveryDecisions).toEqual([]);
      expect(diagnostics.optionalRetargetEvaluations).toEqual([]);
      expect(diagnostics.telemetry).toMatchObject({
        backtrackCount: 0,
        recoveryCount: 0,
        wrongBranchCount: 0
      });
    }
  });

  test('keeps B, A, and S deterministic on the same playable shortest route', () => {
    const seed = 8;
    const maze = createLegacyGeneratedMenuMaze(50, 50, seed);
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
    const shortestPath = resolveLegacyPlayableShortestPath(maze.grid, maze.start, maze.goal);

    expect(bSecond).toEqual(bFirst);
    expect(aSecond).toEqual(aFirst);
    expect(sSecond).toEqual(sFirst);
    expect(shortestPath.found).toBe(true);
    expect(bFirst.routeLength).toBe(shortestPath.path.length);
    expect(aFirst.routeLength).toBe(shortestPath.path.length);
    expect(sFirst.routeLength).toBe(shortestPath.path.length);
    for (const diagnostics of [bFirst, aFirst, sFirst]) {
      expect(diagnostics.recoveryDecisions).toEqual([]);
      expect(diagnostics.optionalRetargetEvaluations).toEqual([]);
      expect(diagnostics.telemetry).toMatchObject({
        backtrackCount: 0,
        recoveryCount: 0,
        wrongBranchCount: 0
      });
    }
  });

  test('keeps S-rank shortest navigation independent of legacy cooldown grace', () => {
    const seed = 6765;
    const maze = createLegacyGeneratedMenuMaze(50, 50, seed);
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
    const shortestPath = resolveLegacyPlayableShortestPath(maze.grid, maze.start, maze.goal);

    expect(second).toEqual(first);
    expect(shortestPath.found).toBe(true);
    expect(first.routeLength).toBe(shortestPath.path.length);
    expect(first.recoveryDecisions).toEqual([]);
    expect(first.optionalRetargetEvaluations).toEqual([]);
    expect(first.telemetry).toMatchObject({
      backtrackCount: 0,
      recoveryCount: 0,
      wrongBranchCount: 0
    });
  });
});
