import { describe, expect, test } from 'vitest';
import { createLegacyRuntimeMazeForMode } from '../../src/legacy-runtime/legacyGenerationLifecycle';

describe('legacy generation diagnostics contract', () => {
  test('attaches build-kind and process-stage metadata to runtime mazes', () => {
    const menuMaze = createLegacyRuntimeMazeForMode('menu', 50, 3749);
    const playMaze = createLegacyRuntimeMazeForMode('play', 50, 3749);

    expect(menuMaze.generation?.buildKind).toBe('menu-snapshot');
    expect(menuMaze.generation?.processStageIds).toEqual([0, 3, 4, 5, 6, 7, 8]);
    expect(menuMaze.generation?.executionPlan).toEqual([
      { id: 0, name: 'CreateGrid', executionKind: 'row-slice', batchSize: 1, batchUnit: 'rows' },
      { id: 3, name: 'MapPath', executionKind: 'checkpoint-pass', batchSize: 1, batchUnit: 'checkpoint-passes' },
      { id: 4, name: 'CreatePath', executionKind: 'path-batch', batchSize: 4, batchUnit: 'path-tiles' },
      { id: 5, name: 'CreateShortCuts', executionKind: 'shortcut-attempt', batchSize: 1, batchUnit: 'shortcut-attempts' },
      { id: 6, name: 'Draw', executionKind: 'row-slice', batchSize: 1, batchUnit: 'rows' },
      { id: 7, name: 'Finalize', executionKind: 'finalize-state', batchSize: null, batchUnit: null },
      { id: 8, name: 'Reset', executionKind: 'reset-branch', batchSize: null, batchUnit: null }
    ]);
    expect(playMaze.generation?.buildKind).toBe('play-generated');
    expect(playMaze.generation?.processStageIds).toEqual([0, 3, 4, 5, 6, 7, 8]);
    expect(playMaze.generation?.executionPlan).toEqual([
      { id: 0, name: 'CreateGrid', executionKind: 'full-stage', batchSize: null, batchUnit: null },
      { id: 3, name: 'MapPath', executionKind: 'full-stage', batchSize: null, batchUnit: null },
      { id: 4, name: 'CreatePath', executionKind: 'full-stage', batchSize: null, batchUnit: null },
      { id: 5, name: 'CreateShortCuts', executionKind: 'full-stage', batchSize: null, batchUnit: null },
      { id: 6, name: 'Draw', executionKind: 'full-stage', batchSize: null, batchUnit: null },
      { id: 7, name: 'Finalize', executionKind: 'finalize-state', batchSize: null, batchUnit: null },
      { id: 8, name: 'Reset', executionKind: 'reset-branch', batchSize: null, batchUnit: null }
    ]);
  });
});
