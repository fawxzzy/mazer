import { describe, expect, test } from 'vitest';
import {
  createLegacyRuntimeMazeForMode,
  LEGACY_OPTIONAL_SHORTCUT_PROCESS_STAGE_ID,
  LEGACY_REQUIRED_GENERATION_PROCESS_STAGE_IDS,
  resolveLegacyGenerationProcessStageIds,
  resolveLegacyMazeBuildKind,
  stepLegacyGenerationSeed
} from '../../src/legacy-runtime/legacyGenerationLifecycle';

describe('legacy generation lifecycle', () => {
  test('keeps the required process-count stages in legacy order', () => {
    expect(LEGACY_REQUIRED_GENERATION_PROCESS_STAGE_IDS).toEqual([0, 3, 4, 6, 7, 8]);
  });

  test('only inserts the shortcut stage for scales above 35', () => {
    expect(resolveLegacyGenerationProcessStageIds(35)).toEqual([0, 3, 4, 6, 7, 8]);
    expect(resolveLegacyGenerationProcessStageIds(36)).toEqual([0, 3, 4, 5, 6, 7, 8]);
    expect(resolveLegacyGenerationProcessStageIds(50)).toContain(LEGACY_OPTIONAL_SHORTCUT_PROCESS_STAGE_ID);
  });

  test('routes menu and play mode to the correct maze builders', () => {
    expect(resolveLegacyMazeBuildKind('menu')).toBe('menu-snapshot');
    expect(resolveLegacyMazeBuildKind('play')).toBe('play-generated');

    const menuMaze = createLegacyRuntimeMazeForMode('menu', 50, 3749);
    const playMaze = createLegacyRuntimeMazeForMode('play', 50, 3749);

    expect(menuMaze.size).toBe(25);
    expect(playMaze.size).toBeGreaterThan(25);
    expect(menuMaze.goal).toEqual({ x: 22, y: 22 });
    expect(playMaze.start).not.toEqual(playMaze.goal);
  });

  test('steps regeneration seeds deterministically', () => {
    expect(stepLegacyGenerationSeed(0)).toBe(1);
    expect(stepLegacyGenerationSeed(3749)).toBe(3750);
    expect(stepLegacyGenerationSeed(0xffffffff)).toBe(0);
  });
});
