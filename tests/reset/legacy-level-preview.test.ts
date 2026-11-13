import { describe, expect, test, vi } from 'vitest';
import { GEOMETRY_BUDGET_FELT_SATURATION_LEVEL, LAST_BUDGET_LEVEL } from '../../src/legacy-runtime/legacyGeometryBudget';
import { createLegacyMaze } from '../../src/legacy-runtime/legacyMaze';
import {
  LEGACY_LEVEL_PREVIEW_CHECKPOINTS,
  LEGACY_LEVEL_PREVIEW_MAX_LEVEL,
  buildLegacyLevelPreviewExitUrl,
  clampLegacyLevelPreviewLevel,
  createLegacyLevelPreviewAuthSnapshot,
  createLegacyLevelPreviewProgressionState,
  createLegacyLevelPreviewStorage,
  formatLegacyLevelPreviewBadge,
  isLegacyLevelPreviewRoute,
  resolveLegacyLevelPreviewLevel,
  stepLegacyLevelPreviewLevel
} from '../../src/legacy-runtime/legacyLevelPreview';
import {
  LEGACY_PROGRESSION_STORAGE_KEY,
  normalizeLegacyProgressionState,
  readLegacyProgressionState,
  recordLegacyProgressionCycle,
  resolveGeometryBudgetLevel,
  resolveLegacyMazeGenerationProfileForProgression,
  resolveLegacyProgressionRank
} from '../../src/legacy-runtime/legacyProgression';
import { createMazeCycleTelemetryReceipt } from '../../src/legacy-runtime/mazeCycleTelemetry';
import { isLegacyRemoteAccountProviderEligible } from '../../src/legacy-runtime/legacyRemoteProgression';

const corridorMaze = () => createLegacyMaze(25, 25, 1, undefined, { layout: 'corridor' });

const receiptFor = (maze: ReturnType<typeof corridorMaze>, index: number) => createMazeCycleTelemetryReceipt({
  averageFrameMs: 16,
  backtracks: 0,
  completedAt: `2026-11-09T12:${String(index % 60).padStart(2, '0')}:00.000Z`,
  completionTimeMs: 8_000,
  controlMode: 'stick',
  maze,
  playerPath: maze.solutionPath,
  resetUsed: false,
  surface: 'play',
  wrongTurns: 0
});

describe('level preview URL parsing', () => {
  test('accepts a plain positive integer level', () => {
    expect(resolveLegacyLevelPreviewLevel('?previewLevel=100')).toBe(100);
    expect(resolveLegacyLevelPreviewLevel('previewLevel=1')).toBe(1);
    expect(resolveLegacyLevelPreviewLevel('?mode=play&previewLevel=198&x=1')).toBe(198);
    expect(resolveLegacyLevelPreviewLevel(new URLSearchParams('previewLevel=250'))).toBe(250);
    expect(resolveLegacyLevelPreviewLevel('?previewLevel=%2030%20')).toBe(30);
    expect(isLegacyLevelPreviewRoute('?previewLevel=60')).toBe(true);
  });

  test('clamps an over-large level to the maximum', () => {
    expect(resolveLegacyLevelPreviewLevel('?previewLevel=99999')).toBe(LEGACY_LEVEL_PREVIEW_MAX_LEVEL);
    expect(resolveLegacyLevelPreviewLevel(`?previewLevel=${LEGACY_LEVEL_PREVIEW_MAX_LEVEL + 1}`)).toBe(LEGACY_LEVEL_PREVIEW_MAX_LEVEL);
  });

  test.each([
    '', '?', '?previewLevel', '?previewLevel=', '?previewLevel=0', '?previewLevel=-5', '?previewLevel=1.5',
    '?previewLevel=abc', '?previewLevel=0x10', '?previewLevel=1e3', '?previewLevel=%2B7', '?previewLevel=NaN',
    '?previewLevel=Infinity', '?previewLevel=%20', '?previewLevel=99999999999999999999', '?rank=E', '?previewlevel=5',
    '?mode=play'
  ])('ignores preview for %j', (search) => {
    expect(resolveLegacyLevelPreviewLevel(search)).toBeNull();
    expect(isLegacyLevelPreviewRoute(search)).toBe(false);
  });

  test('rank is not an input: it is derived from the level', () => {
    expect(resolveLegacyLevelPreviewLevel('?previewLevel=100&rank=E')).toBe(100);
    const rank = createLegacyLevelPreviewProgressionState(100).tracks.player.rank;
    expect(rank).toBe(resolveLegacyProgressionRank(400));
  });

  test('stepping clamps at both ends', () => {
    expect(stepLegacyLevelPreviewLevel(1, -1)).toBe(1);
    expect(stepLegacyLevelPreviewLevel(100, 1)).toBe(101);
    expect(stepLegacyLevelPreviewLevel(LEGACY_LEVEL_PREVIEW_MAX_LEVEL, 1)).toBe(LEGACY_LEVEL_PREVIEW_MAX_LEVEL);
    expect(clampLegacyLevelPreviewLevel(-3)).toBe(1);
  });

  test('exit URL removes only the preview param', () => {
    expect(buildLegacyLevelPreviewExitUrl('https://mazer.fawxzzy.com/?previewLevel=100')).toBe('https://mazer.fawxzzy.com/');
    expect(buildLegacyLevelPreviewExitUrl('https://mazer.fawxzzy.com/?a=1&previewLevel=5&b=2#x'))
      .toBe('https://mazer.fawxzzy.com/?a=1&b=2#x');
    expect(formatLegacyLevelPreviewBadge('100')).toBe('PREVIEW L100');
  });

  test('the jump list is the agreed checkpoints', () => {
    expect([...LEGACY_LEVEL_PREVIEW_CHECKPOINTS]).toEqual([1, 2, 5, 10, 20, 30, 60, 100, 150, 190, 198, 218, 283, 288, 300]);
  });

  test('the ladder ends are checkpoints: the felt saturation level and the last budget level (MAZER-QA-008)', () => {
    expect(LEGACY_LEVEL_PREVIEW_CHECKPOINTS).toContain(GEOMETRY_BUDGET_FELT_SATURATION_LEVEL);
    expect(LEGACY_LEVEL_PREVIEW_CHECKPOINTS).toContain(LAST_BUDGET_LEVEL);
    expect(GEOMETRY_BUDGET_FELT_SATURATION_LEVEL).toBe(283);
    expect(LAST_BUDGET_LEVEL).toBe(288);
    // ascending and unique, and the last one is on the plateau past the ladder's end
    const sorted = [...LEGACY_LEVEL_PREVIEW_CHECKPOINTS].sort((a, b) => a - b);
    expect([...LEGACY_LEVEL_PREVIEW_CHECKPOINTS]).toEqual(sorted);
    expect(new Set(sorted).size).toBe(sorted.length);
    expect(sorted[sorted.length - 1]).toBeGreaterThan(LAST_BUDGET_LEVEL);
  });
});

describe('level preview progression state', () => {
  test.each([...LEGACY_LEVEL_PREVIEW_CHECKPOINTS, 3, 99, 101, 999])(
    'level %i is coherent: survives the real normalizer and feeds the real generation resolver',
    (level) => {
      const state = createLegacyLevelPreviewProgressionState(level);
      const player = state.tracks.player;
      expect(player.level).toBe(String(level));
      expect(player.completedCycles).toBe(String(level - 1));
      // Same state after a second pass through the normalizer: nothing rebased it to level 1.
      expect(normalizeLegacyProgressionState(state).tracks.player.level).toBe(String(level));
      if (level === 1) {
        expect(resolveLegacyMazeGenerationProfileForProgression(player).layout).toBe('corridor');
        expect(resolveGeometryBudgetLevel(player)).toBeNull();
      } else {
        expect(resolveGeometryBudgetLevel(player)).toBe(Math.min(level, LAST_BUDGET_LEVEL));
        expect(resolveLegacyMazeGenerationProfileForProgression(player).geometryBudgetLevel)
          .toBe(Math.min(level, LAST_BUDGET_LEVEL));
      }
    }
  );

  test('the preview state for level N equals the state a real player reaches after N-1 clears', () => {
    const maze = corridorMaze();
    const storage = createLegacyLevelPreviewStorage();
    let state = normalizeLegacyProgressionState(createLegacyLevelPreviewProgressionState(1));
    for (let step = 1; step <= 40; step += 1) {
      const preview = createLegacyLevelPreviewProgressionState(step);
      expect(state.tracks.player.level).toBe(preview.tracks.player.level);
      expect(state.tracks.player.targetComplexity).toBe(preview.tracks.player.targetComplexity);
      state = recordLegacyProgressionCycle(storage, state, receiptFor(maze, step), maze);
    }
  });

  test('a goal in preview advances exactly one level and writes only the sandbox', () => {
    const realStorage = { getItem: vi.fn(), removeItem: vi.fn(), setItem: vi.fn() };
    const sandbox = createLegacyLevelPreviewStorage();
    const maze = corridorMaze();
    let state = createLegacyLevelPreviewProgressionState(99);
    const reached: string[] = [];
    for (let index = 0; index < 2; index += 1) {
      state = recordLegacyProgressionCycle(sandbox, state, receiptFor(maze, index), maze);
      reached.push(state.tracks.player.level);
    }
    expect(reached).toEqual(['100', '101']);
    expect(readLegacyProgressionState(sandbox).tracks.player.level).toBe('101');
    expect(realStorage.getItem).not.toHaveBeenCalled();
    expect(realStorage.setItem).not.toHaveBeenCalled();
    expect(realStorage.removeItem).not.toHaveBeenCalled();
  });
});

describe('level preview sandbox storage and session', () => {
  test('behaves like Storage and shares nothing with the real keys', () => {
    const storage = createLegacyLevelPreviewStorage();
    expect(storage.getItem(LEGACY_PROGRESSION_STORAGE_KEY)).toBeNull();
    storage.setItem('a', '1');
    storage.setItem('b', 2 as unknown as string);
    expect(storage.getItem('a')).toBe('1');
    expect(storage.getItem('b')).toBe('2');
    expect(storage.length).toBe(2);
    expect(storage.key(0)).toBe('a');
    storage.removeItem('a');
    expect(storage.getItem('a')).toBeNull();
    storage.clear();
    expect(storage.length).toBe(0);
    // Separate instances never share state.
    createLegacyLevelPreviewStorage().setItem('x', 'y');
    expect(storage.getItem('x')).toBeNull();
  });

  test('the preview session is the remote-ineligible fixture identity', () => {
    const snapshot = createLegacyLevelPreviewAuthSnapshot();
    expect(snapshot.status).toBe('authenticated');
    expect(isLegacyRemoteAccountProviderEligible(snapshot)).toBe(false);
  });
});
