import { createHash } from 'node:crypto';
import { describe, expect, test } from 'vitest';
import {
  createLegacyRuntimeMazeForMode
} from '../../src/legacy-runtime/legacyGenerationLifecycle';
import {
  createEmptyLegacyProgressionState,
  resolveLegacyMazeGenerationProfileForProgression,
  resolveLegacyMenuDemoMazeGenerationProfileForProgression,
  resolveLegacyProgressionGenerationScale,
  resolveLegacyProgressionScaleDetail
} from '../../src/legacy-runtime/legacyProgression';

// MAZER-VIS-052: the menu demo shows bleed-off paths again; gameplay profiles are untouched.
const aiTrack = (level: number) => ({
  ...createEmptyLegacyProgressionState().tracks['ai-runner'],
  level: String(level),
  targetComplexity: Math.min(400, 4 + ((Math.min(level, 99) - 1) * 4))
});

const countRingOpenings = (grid: boolean[][]): number => {
  const h = grid.length;
  const w = grid[0]?.length ?? 0;
  let count = 0;
  for (let x = 0; x < w; x += 1) { count += (grid[0]![x] ? 1 : 0) + (grid[h - 1]![x] ? 1 : 0); }
  for (let y = 0; y < h; y += 1) { count += (grid[y]![0] ? 1 : 0) + (grid[y]![w - 1] ? 1 : 0); }
  return count;
};

describe('MAZER-VIS-052 menu demo bleed-off paths', () => {
  test('gameplay generation profiles are byte-identical to before the demo profile existed', () => {
    const out: unknown[] = [];
    for (const level of [1, 2, 3, 5, 9, 10, 15, 19, 20, 30, 60, 99, 100, 120, 140, 200, 288]) {
      const track = aiTrack(level);
      out.push(
        resolveLegacyMazeGenerationProfileForProgression(track),
        resolveLegacyMazeGenerationProfileForProgression(track, { fraction: 0.3 }),
        resolveLegacyMazeGenerationProfileForProgression(track.targetComplexity)
      );
    }
    // Re-pinned by MAZER-GEN-021: every budget-ladder gameplay profile now carries `journeyLegs` (1 to 3 legs of
    // the planned start-to-goal journey, 47 of these 51 profiles); nothing else in them moved.
    expect(createHash('sha256').update(JSON.stringify(out)).digest('hex'))
      .toBe('d151ce7a805e57a978d797c12d8019fc429f94e3d5d36df783a3d3a399688b99');
  });

  test('the demo profile never carries a budget-ladder gate and keeps feeders past level 140', () => {
    for (const level of [20, 60, 140, 200]) {
      const profile = resolveLegacyMenuDemoMazeGenerationProfileForProgression(aiTrack(level), { fraction: 0.5 });
      expect(profile.geometryBudgetLevel).toBeUndefined();
      expect(profile.requiredOppositeBorderConnections).toEqual({ horizontal: true, vertical: true });
    }
    expect(resolveLegacyMenuDemoMazeGenerationProfileForProgression(aiTrack(200)).borderFeederTargetPerSide).toBeGreaterThan(0);
  });

  test.each([
    [20, 2],
    [60, 4],
    [140, 8]
  ])('demo mazes at level %i carry at least %i edge openings across seeds', (level, floor) => {
    const track = aiTrack(level);
    const scale = resolveLegacyProgressionGenerationScale(50, track, {});
    const { fraction } = resolveLegacyProgressionScaleDetail(50, track, {});
    const profile = resolveLegacyMenuDemoMazeGenerationProfileForProgression(track, { fraction });
    for (const seed of [1000, 8919, 16838]) {
      const maze = createLegacyRuntimeMazeForMode('menu', scale, seed, profile, { targetComplexity: track.targetComplexity }, 1);
      expect(countRingOpenings(maze.grid)).toBeGreaterThanOrEqual(floor);
    }
  }, 60000);
});
