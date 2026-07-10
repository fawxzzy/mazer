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
        expect(decision.knownRouteStepCount).toBeGreaterThanOrEqual(0);
        expect(decision.routeCursor).toBeGreaterThanOrEqual(0);
        expect(decision.routeCursor).toBeLessThan(diagnostics.routeLength);
        expect(isTileFloor(episode.raster.tiles, decision.fromIndex)).toBe(true);
        expect(isTileFloor(episode.raster.tiles, decision.splitIndex)).toBe(true);
        expect(isTileFloor(episode.raster.tiles, decision.targetIndex)).toBe(true);
        if (decision.kind === 'frontier-recovery') {
          frontierRecoveryCount += 1;
        }
      }
    }

    expect(frontierRecoveryCount).toBeGreaterThan(0);
    expect(branchDecisionCount).toBeGreaterThan(0);
  });
});
