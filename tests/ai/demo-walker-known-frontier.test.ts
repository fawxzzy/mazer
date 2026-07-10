import { describe, expect, test } from 'vitest';

import {
  advanceDemoWalker,
  collectDemoWalkerRouteDiagnostics,
  createDemoWalkerState
} from '../../src/domain/ai';
import { isTileFloor, resolveDirectionBetween } from '../../src/domain/maze';
import {
  createLegacyDemoWalkerEpisode,
  createLegacyMenuDemoWalkerConfig
} from '../../src/legacy-runtime/legacyDemoWalker';
import { createLegacyGeneratedMenuMaze } from '../../src/legacy-runtime/legacyMaze';

describe('human-memory AI known-frontier recovery', () => {
  test('reaches the goal before requesting a fresh generated menu maze', () => {
    const scales = [37, 50, 75] as const;
    const seeds = [1, 2, 3, 5, 8, 13, 21, 34, 55, 89] as const;

    for (const scale of scales) {
      for (const seed of seeds) {
        const maze = createLegacyGeneratedMenuMaze(scale, seed);
        const episode = createLegacyDemoWalkerEpisode(maze);
        const config = createLegacyMenuDemoWalkerConfig(seed);
        const diagnostics = collectDemoWalkerRouteDiagnostics(episode, config);
        let state = createDemoWalkerState(episode, config);
        let reachedGoal = false;

        expect(diagnostics.aiResetPathCursor).toBeNull();

        for (let step = 0; step < Math.max(512, diagnostics.routeLength + 12); step += 1) {
          const previousIndex = state.currentIndex;
          const previousPhase = state.phase;
          const advance = advanceDemoWalker(episode, state, config);
          state = advance.state;

          expect(isTileFloor(episode.raster.tiles, state.currentIndex)).toBe(true);
          expect(state.resetReason).not.toBe('ai-path-exhausted');
          expect(advance.shouldRegenerateMaze).toBeUndefined();

          if (previousPhase === 'explore' && state.phase === 'explore') {
            expect(resolveDirectionBetween(previousIndex, state.currentIndex, episode.raster.width)).not.toBeNull();
          }
          if (state.phase === 'goal-hold') {
            reachedGoal = true;
            break;
          }
        }

        expect(reachedGoal, `scale=${scale} seed=${seed}`).toBe(true);

        const goalReset = advanceDemoWalker(episode, state, config);
        expect(goalReset.state.resetReason).toBe('goal');
        const regeneration = advanceDemoWalker(episode, goalReset.state, config);
        expect(regeneration.shouldRegenerateMaze).toBe(true);
      }
    }
  }, 30_000);
});
