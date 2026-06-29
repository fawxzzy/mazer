import { describe, expect, test } from 'vitest';
import { createLegacyRuntimeMazeForMode } from '../../src/legacy-runtime/legacyGenerationLifecycle';

describe('legacy generation diagnostics contract', () => {
  test('attaches build-kind and process-stage metadata to runtime mazes', () => {
    const menuMaze = createLegacyRuntimeMazeForMode('menu', 50, 3749);
    const playMaze = createLegacyRuntimeMazeForMode('play', 50, 3749);

    expect(menuMaze.generation?.buildKind).toBe('menu-snapshot');
    expect(menuMaze.generation?.processStageIds).toEqual([0, 3, 4, 5, 6, 7, 8]);
    expect(playMaze.generation?.buildKind).toBe('play-generated');
    expect(playMaze.generation?.processStageIds).toEqual([0, 3, 4, 5, 6, 7, 8]);
  });
});
