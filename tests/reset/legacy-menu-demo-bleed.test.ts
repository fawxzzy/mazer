import { createHash } from 'node:crypto';
import { describe, expect, test } from 'vitest';
import { isBleedGateLevel } from '../../src/legacy-runtime/legacyBleedGates';
import { listBleedPaths } from '../../src/legacy-runtime/legacyBleedPaths';
import {
  createLegacyRuntimeMazeForMode
} from '../../src/legacy-runtime/legacyGenerationLifecycle';
import { isLegacyMenuDemoGateLeg } from '../../src/legacy-runtime/legacyMenuDemoBleedGates';
import {
  advanceLegacyMenuDemoFrame,
  createLegacyMenuDemoBootstrap
} from '../../src/legacy-runtime/legacyMenuDemoLifecycle';
import {
  createEmptyLegacyProgressionState,
  resolveLegacyMazeGenerationProfileForProgression,
  resolveLegacyMenuDemoMazeGenerationProfileForProgression,
  resolveLegacyProgressionGenerationScale,
  resolveLegacyProgressionScaleDetail
} from '../../src/legacy-runtime/legacyProgression';

// MAZER-MENU-BLEED (supersedes the MAZER-VIS-052 band profile): the menu demo follows the same bleed rules as play
// (path cap, wrap placement, gates); gameplay profiles are untouched.
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

describe('MAZER-MENU-BLEED menu demo follows the play bleed rules', () => {
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
    // Re-pinned by MAZER-L8b: every budget-ladder gameplay profile also carries `bleedPlacement: 'least-saving'`;
    // with that one key removed the profiles still hash to the GEN-021 pin, so nothing else moved.
    const withoutPlacement = out.map((profile) => {
      const { bleedPlacement: _placement, ...rest } = profile as { bleedPlacement?: string };
      return rest;
    });
    expect(createHash('sha256').update(JSON.stringify(withoutPlacement)).digest('hex'))
      .toBe('d151ce7a805e57a978d797c12d8019fc429f94e3d5d36df783a3d3a399688b99');
    expect(out.filter((profile) => (profile as { bleedPlacement?: string }).bleedPlacement === 'least-saving').length).toBe(47);
    expect(createHash('sha256').update(JSON.stringify(out)).digest('hex'))
      .toBe('6d8cc29dd54d4d0afbfad2a9a4f1a970936a6a98699443bf996ed5b3417a2efd');
  });

  test('MAZER-MENU-BLEED: the menu demo profile IS the gameplay profile on every level, with and without a device fraction', () => {
    for (let level = 1; level <= 300; level += 1) {
      const track = aiTrack(level);
      expect(resolveLegacyMenuDemoMazeGenerationProfileForProgression(track)).toEqual(resolveLegacyMazeGenerationProfileForProgression(track));
      expect(resolveLegacyMenuDemoMazeGenerationProfileForProgression(track, { fraction: 0.5 }))
        .toEqual(resolveLegacyMazeGenerationProfileForProgression(track, { fraction: 0.5 }));
    }
    // So a ladder level carries the ladder's bleed rules: a budget level and the least-saving wrap placement.
    for (const level of [20, 60, 120]) {
      const profile = resolveLegacyMenuDemoMazeGenerationProfileForProgression(aiTrack(level), { fraction: 0.5 });
      expect(profile.geometryBudgetLevel).toBeDefined();
      expect(profile.bleedPlacement).toBe('least-saving');
    }
  });

  const buildMenuMaze = (level: number, seed: number) => {
    const track = aiTrack(level);
    const scale = resolveLegacyProgressionGenerationScale(50, track, {});
    const { fraction } = resolveLegacyProgressionScaleDetail(50, track, {});
    const profile = resolveLegacyMenuDemoMazeGenerationProfileForProgression(track, { fraction });
    return createLegacyRuntimeMazeForMode('menu', scale, seed, profile, { targetComplexity: track.targetComplexity }, 1);
  };
  const SEEDS = [1000, 8919, 16838, 24757, 32676];

  test.each([20, 60, 100, 140, 200])('menu mazes at level %i carry at most one bleed path per axis (the play cap), never the old 9', (level) => {
    for (const seed of SEEDS.slice(0, 3)) {
      const paths = listBleedPaths(buildMenuMaze(level, seed).grid);
      expect(paths.filter((path) => path.axis === 'horizontal').length).toBeLessThanOrEqual(1);
      expect(paths.filter((path) => path.axis === 'vertical').length).toBeLessThanOrEqual(1);
    }
  }, 60000);

  // MAZER-GEN-031: past the fade a wrap survives only on a gate level (it is the wrap the gate guards); 143 and 150
  // are not gate levels, 140 and 200 are.
  test('wraps fade out of the menu demo where they fade out of play (non-gate levels from 140 up)', () => {
    for (const level of [143, 150]) {
      expect(isBleedGateLevel(level), `level ${level}`).toBe(false);
      expect(countRingOpenings(buildMenuMaze(level, 1000).grid)).toBe(0);
    }
  }, 60000);

  test('MAZER-GEN-031: a gate level past the fade keeps its wrap and carries one gate in the menu demo too', () => {
    for (const level of [140, 200]) {
      expect(isBleedGateLevel(level), `level ${level}`).toBe(true);
      const mazes = SEEDS.map((seed) => buildMenuMaze(level, seed));
      expect(Math.max(...mazes.map((maze) => maze.bleedGates?.length ?? 0)), `level ${level}`).toBe(1);
      for (const maze of mazes) {
        expect(countRingOpenings(maze.grid), `level ${level}`).toBeGreaterThanOrEqual(2);
      }
    }
  }, 120000);

  const GATE_LEVELS = [28, 72, 90].filter((level) => isBleedGateLevel(level));

  test('menu mazes on a gate level carry one bleed gate (the cadence is the play cadence); non-gate levels never do', () => {
    expect(GATE_LEVELS.length).toBeGreaterThan(0);
    for (const level of GATE_LEVELS) {
      const counts = SEEDS.map((seed) => buildMenuMaze(level, seed).bleedGates?.length ?? 0);
      expect(Math.max(...counts), `level ${level}`).toBe(1);
    }
    for (const level of [5, 20, 143]) {
      expect(isBleedGateLevel(level), `level ${level}`).toBe(false);
      expect(buildMenuMaze(level, 1000).bleedGates, `level ${level}`).toBeUndefined();
    }
  }, 120000);

  test('the menu AI walks to the gate of a menu-built gated maze before the goal, then takes the wrap', () => {
    const level = GATE_LEVELS[0]!;
    const maze = SEEDS.map((seed) => buildMenuMaze(level, seed)).find((built) => (built.bleedGates?.length ?? 0) > 0)!;
    expect(maze).toBeDefined();
    const gate = maze.bleedGates![0]!;
    const boot = createLegacyMenuDemoBootstrap(maze, false, 0);
    expect(isLegacyMenuDemoGateLeg(boot.episode)).toBe(true);
    let { episode, state } = boot;
    let visitedGateAt = -1;
    let switchedAt = -1;
    for (let frame = 0; frame < 20000 && !state.reachedGoal; frame += 1) {
      const next = advanceLegacyMenuDemoFrame(episode, state, boot.config, false, 0);
      if (next.episode) {
        episode = next.episode;
        switchedAt = frame;
      }
      state = next.state;
      if (visitedGateAt < 0 && next.player.x === gate.x && next.player.y === gate.y) {
        visitedGateAt = frame;
      }
      if (next.shouldRegenerateMaze) {
        break;
      }
    }
    expect(switchedAt).toBeGreaterThanOrEqual(0);
    expect(visitedGateAt).toBeGreaterThanOrEqual(0);
    expect(visitedGateAt).toBeLessThanOrEqual(switchedAt + 1);
    expect(episode.raster.startIndex).toBe((gate.y * maze.width) + gate.x);
  }, 60000);

  test.each([
    [20, 2],
    [60, 2]
  ])('menu mazes at level %i still carry at least %i edge openings (one wrap pair)', (level, floor) => {
    for (const seed of SEEDS.slice(0, 3)) {
      expect(countRingOpenings(buildMenuMaze(level, seed).grid)).toBeGreaterThanOrEqual(floor);
    }
  }, 60000);
});
