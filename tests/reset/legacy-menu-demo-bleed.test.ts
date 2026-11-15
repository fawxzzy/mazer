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
    expect(createHash('sha256').update(JSON.stringify(out)).digest('hex'))
      .toBe('946b338cd4dd1e765410db8c8dff718b9e0b26a8f24bcb9a42e27cfbef8b45a2');
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
