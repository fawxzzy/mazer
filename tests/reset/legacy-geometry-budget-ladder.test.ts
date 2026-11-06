import { describe, expect, test } from 'vitest';
import { createLegacyRuntimeMazeForMode } from '../../src/legacy-runtime/legacyGenerationLifecycle';
import {
  GEOMETRY_BUDGET_TOP_TARGET,
  GEOMETRY_BUDGET_BASE_CANDIDATES,
  GEOMETRY_BUDGET_SATURATION_LEVEL,
  GEOMETRY_BUDGET_WINDOW,
  LAST_BUDGET_LEVEL,
  measureGeometryBudgetProxy,
  resolveGeometryBudgetProfile,
  resolveGeometryBudgetRungCount,
  resolveGeometryBudgetTarget
} from '../../src/legacy-runtime/legacyGeometryBudget';
import { measureFeltSteps } from '../../src/legacy-runtime/legacyMazeFeltDifficulty';
import { createLegacyMaze } from '../../src/legacy-runtime/legacyMaze';
import {
  createEmptyLegacyProgressionState,
  LEGACY_PROGRESSION_MIN_COMPLEXITY,
  LEGACY_PROGRESSION_STORAGE_KEY,
  readLegacyProgressionState,
  recordLegacyProgressionCycle,
  resolveGeometryBudgetLevel,
  resolveLegacyMazeComplexity,
  resolveLegacyMazeGenerationProfileForProgression,
  resolveLegacyProgressionGenerationScale,
  summarizeLegacyProgressionDiagnostics
} from '../../src/legacy-runtime/legacyProgression';
import { createMazeCycleTelemetryReceipt } from '../../src/legacy-runtime/mazeCycleTelemetry';

class MemoryStorage {
  public values = new Map<string, string>();

  public getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  public setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

const baselineTrack = createEmptyLegacyProgressionState().tracks.player;
const trackForLevel = (level: number, overrides: Record<string, unknown> = {}) => ({
  ...baselineTrack,
  level: String(level),
  targetComplexity: Math.min(400, LEGACY_PROGRESSION_MIN_COMPLEXITY + ((level - 1) * 4)),
  ...overrides
});

const VIEWPORTS = {
  phone: { width: 390, height: 844, aspectRatio: 23 / 51 },
  desktop: { width: 1440, height: 900, aspectRatio: 45 / 27 },
  square: { width: 900, height: 900, aspectRatio: 1 }
} as const;

describe('geometry budget wiring (every bounded progression level 2..99)', () => {
  test('keeps level 1 as the corridor and gives every level 2..99 a budget profile with no layout key', () => {
    expect(resolveLegacyMazeGenerationProfileForProgression(trackForLevel(1)).layout).toBe('corridor');
    for (let level = 2; level <= LAST_BUDGET_LEVEL; level += 1) {
      const profile = resolveLegacyMazeGenerationProfileForProgression(trackForLevel(level));
      expect(Object.prototype.hasOwnProperty.call(profile, 'layout')).toBe(false);
      expect(profile).toEqual(resolveGeometryBudgetProfile(level));
      expect(profile.geometryBudgetLevel).toBe(level);
      // Device-fraction feeder scaling must not touch a budget profile.
      for (const fraction of [0, 0.4, 1]) {
        expect(resolveLegacyMazeGenerationProfileForProgression(trackForLevel(level), { fraction })).toEqual(profile);
      }
    }
  });

  test('the wrap-corridor style follows the bands and is frozen from the saturation level on', () => {
    for (let level = 2; level <= LAST_BUDGET_LEVEL; level += 1) {
      const profile = resolveLegacyMazeGenerationProfileForProgression(trackForLevel(level));
      const rungs = resolveGeometryBudgetRungCount(level);
      expect(profile.geometryBudgetLevel).toBe(level);
      expect(profile.requiredOppositeBorderConnections).toEqual({ horizontal: rungs >= 2, vertical: rungs >= 1 });
      if (level >= GEOMETRY_BUDGET_SATURATION_LEVEL) {
        expect(rungs).toBe(resolveGeometryBudgetRungCount(GEOMETRY_BUDGET_SATURATION_LEVEL));
      }
    }
  });

  test('freezes the board across every level on phone, desktop and square viewports', () => {
    for (const surface of ['play', 'menu'] as const) {
      for (const viewport of Object.values(VIEWPORTS)) {
        const scales = new Set<number>();
        for (const level of [...Array.from({ length: LAST_BUDGET_LEVEL }, (_, index) => index + 1), 100, 150, 1000]) {
          scales.add(resolveLegacyProgressionGenerationScale(50, trackForLevel(level), {
            surface,
            viewport: { width: viewport.width, height: viewport.height }
          }));
        }
        expect(scales.size).toBe(1);
      }
    }
  });

  test('derives the budget level from target complexity through one seam, not the ordinal', () => {
    expect(resolveGeometryBudgetLevel(8)).toBeNull();
    expect(resolveGeometryBudgetLevel(12)).toBe(2);
    expect(resolveGeometryBudgetLevel(8 + (29 * 4))).toBe(30);
    // The seam covers the whole bounded range now: no band path above level 1.
    expect(resolveGeometryBudgetLevel(8 + (30 * 4))).toBe(31);
    // A bare target-complexity number has no ordinal to read: bounded at 99.
    expect(resolveGeometryBudgetLevel(400)).toBe(99);
    expect(resolveGeometryBudgetLevel(trackForLevel(7))).toBe(7);
    // A track at the bounded top reads its ordinal, up to the hard ceiling.
    expect(resolveGeometryBudgetLevel(trackForLevel(99))).toBe(99);
    expect(resolveGeometryBudgetLevel(trackForLevel(100))).toBe(100);
    expect(resolveGeometryBudgetLevel(trackForLevel(LAST_BUDGET_LEVEL))).toBe(LAST_BUDGET_LEVEL);
    expect(resolveGeometryBudgetLevel(trackForLevel(LAST_BUDGET_LEVEL + 1))).toBe(LAST_BUDGET_LEVEL);
    expect(resolveGeometryBudgetLevel({ ...baselineTrack, level: '9'.repeat(40), targetComplexity: 400 })).toBe(LAST_BUDGET_LEVEL);
    // ...but never below the top: an ordinal cannot lift a track whose target is lower.
    expect(resolveGeometryBudgetLevel({ ...baselineTrack, level: '150', targetComplexity: 120 })).toBe(29);
  });

  // Ordinal guards (the repo spent 2026-08 decoupling the visible completion
  // ordinal from geometry; the budget ladder must not re-couple them).
  test('guard (a): a huge ordinal at the minimum target complexity is still the level-1 corridor', () => {
    const track = { ...baselineTrack, level: '1000000', completedCycles: '999999', targetComplexity: 8 };
    expect(resolveLegacyMazeGenerationProfileForProgression(track))
      .toEqual(resolveLegacyMazeGenerationProfileForProgression(trackForLevel(1)));
    expect(resolveLegacyMazeGenerationProfileForProgression(track).layout).toBe('corridor');
  });

  test('guard (b): a low ordinal at a high target complexity reads the target, and clamps at the bounded top', () => {
    // targetComplexity 120 is bounded level 29.
    const level29 = { ...baselineTrack, level: '1', targetComplexity: 120 };
    expect(resolveLegacyMazeGenerationProfileForProgression(level29)).toEqual(resolveGeometryBudgetProfile(29));
    const level31 = { ...baselineTrack, level: '1', targetComplexity: 128 };
    expect(resolveLegacyMazeGenerationProfileForProgression(level31)).toEqual(resolveGeometryBudgetProfile(31));
    // The bounded top with a LOW ordinal is level 99; an ordinal above the top
    // lifts the geometry up to the hard ceiling and never past it.
    const top = { ...baselineTrack, level: '1', targetComplexity: 400 };
    expect(resolveLegacyMazeGenerationProfileForProgression(top)).toEqual(resolveGeometryBudgetProfile(99));
    const beyond = { ...baselineTrack, level: '123456789012345678901234567890', targetComplexity: 400 };
    expect(resolveLegacyMazeGenerationProfileForProgression(beyond)).toEqual(resolveGeometryBudgetProfile(LAST_BUDGET_LEVEL));
  });

  test('guard (c): repaired impossible saves land on the level-1 corridor profile', () => {
    const fixtures = [
      {
        version: 1,
        playerProgressionBaselineVersion: 3,
        tracks: {
          player: {
            ...baselineTrack,
            cleanCycles: 99,
            completedCycles: '5180',
            level: '99',
            rank: 'S',
            struggleCycles: 0,
            targetComplexity: 400
          },
          'ai-runner': createEmptyLegacyProgressionState().tracks['ai-runner']
        }
      },
      {
        ...createEmptyLegacyProgressionState(),
        playerProgressionBaselineVersion: 4,
        tracks: {
          ...createEmptyLegacyProgressionState().tracks,
          player: { ...baselineTrack, completedCycles: '3', level: '99', rank: 'S', targetComplexity: 400 }
        }
      }
    ];
    for (const fixture of fixtures) {
      const storage = new MemoryStorage();
      storage.setItem(LEGACY_PROGRESSION_STORAGE_KEY, JSON.stringify(fixture));
      const repaired = readLegacyProgressionState(storage);
      expect(repaired.tracks.player.level).toBe('1');
      expect(resolveLegacyMazeGenerationProfileForProgression(repaired.tracks.player).layout).toBe('corridor');
    }
  });

  test('guard (d): every real completion walks the budget levels one at a time, then hold the plateau', () => {
    const storage = new MemoryStorage();
    let state = createEmptyLegacyProgressionState();
    const maze = createLegacyMaze(25, 25, 1, undefined, { layout: 'corridor' });
    for (let step = 0; step < LAST_BUDGET_LEVEL; step += 1) {
      const track = state.tracks.player;
      const profile = resolveLegacyMazeGenerationProfileForProgression(track);
      expect(Number(track.level)).toBe(step + 1);
      if (step === 0) {
        expect(profile.layout).toBe('corridor');
      } else {
        // Bounded level = step + 1 (+4 target per clear, clamp 400 at level 99).
        expect(profile.geometryBudgetLevel).toBe(step + 1);
      }
      const receipt = createMazeCycleTelemetryReceipt({
        averageFrameMs: 16,
        backtracks: 0,
        completedAt: `2026-08-27T12:${String(step % 60).padStart(2, '0')}:00.000Z`,
        completionTimeMs: 8_000,
        controlMode: 'stick',
        maze,
        playerPath: maze.solutionPath,
        resetUsed: false,
        surface: 'play',
        wrongTurns: 0
      });
      state = recordLegacyProgressionCycle(storage, state, receipt, maze);
    }
    expect(state.tracks.player.level).toBe(String(LAST_BUDGET_LEVEL + 1));
    // One past the hard ceiling the geometry is the ceiling profile (same class).
    expect(resolveLegacyMazeGenerationProfileForProgression(state.tracks.player).geometryBudgetLevel).toBe(LAST_BUDGET_LEVEL);
  });

  test('reports budget levels as on-target instead of a misleading under-target label', () => {
    const corridor = createLegacyMaze(25, 25, 1, undefined, { layout: 'corridor' });
    const receipt = createMazeCycleTelemetryReceipt({
      averageFrameMs: 16,
      backtracks: 0,
      completedAt: '2026-08-27T12:00:00.000Z',
      completionTimeMs: 8_000,
      controlMode: 'stick',
      maze: corridor,
      playerPath: corridor.solutionPath,
      resetUsed: false,
      surface: 'play',
      wrongTurns: 0
    });
    // One real completion reaches level 2 (a budget level).
    const state = recordLegacyProgressionCycle(new MemoryStorage(), createEmptyLegacyProgressionState(), receipt, corridor);
    expect(state.tracks.player.level).toBe('2');
    // This maze's measured complexity is far from the level's 400-capped
    // target, which used to surface as an 'under-target'/'over-target' label.
    const tiny = createLegacyMaze(9, 9, 1, undefined, resolveGeometryBudgetProfile(2));
    const diagnostics = summarizeLegacyProgressionDiagnostics(state, 'player', tiny);
    expect(Math.abs(diagnostics.generationReview.difference)).toBeGreaterThan(diagnostics.generationReview.tolerance);
    expect(diagnostics.generationReview.delivery).toBe('on-target');
  });

  test('no level at or above 2 reaches the legacy band geometry path any more', () => {
    for (const level of [31, 40, 60, 99, 100, 1000]) {
      const profile = resolveLegacyMazeGenerationProfileForProgression(trackForLevel(level));
      expect(profile.geometryBudgetLevel).toBe(Math.min(level, LAST_BUDGET_LEVEL));
      expect(Object.prototype.hasOwnProperty.call(profile, 'layout')).toBe(false);
      expect(profile.straightnessBias).toBe(0.8);
    }
    expect(LAST_BUDGET_LEVEL).toBeGreaterThan(99);
  });
});

describe('geometry budget felt tuning (realized felt difficulty)', () => {
  // Each level's maze is felt-tuned into [T(N), T(N) + 1] and the schedule step is
  // at least 2, so realized felt values of adjacent ramp levels cannot tie or
  // invert FOR ANY SEEDS. These fixed seeds are regression seeds; the any-two-seeds
  // bound is asserted in legacy-progression-ladder.test.ts and the report script.
  const SEEDS: Record<keyof typeof VIEWPORTS, number> = { phone: 3000, desktop: 1000, square: 4000 };

  for (const [name, viewport] of Object.entries(VIEWPORTS) as [keyof typeof VIEWPORTS, (typeof VIEWPORTS)[keyof typeof VIEWPORTS]][]) {
    test(`realized felt difficulty is strictly increasing for levels 2..${GEOMETRY_BUDGET_SATURATION_LEVEL} and holds the ceiling after (${name})`, () => {
      const realized: number[] = [];
      const proxies: number[] = [];
      const dimensions = new Set<string>();
      for (const level of [...Array.from({ length: GEOMETRY_BUDGET_SATURATION_LEVEL - 1 }, (_, index) => index + 2), 250, 1000]) {
        const track = trackForLevel(level);
        const scale = resolveLegacyProgressionGenerationScale(50, track, {
          surface: 'play',
          viewport: { width: viewport.width, height: viewport.height }
        });
        const maze = createLegacyRuntimeMazeForMode(
          'play',
          scale,
          SEEDS[name] + level,
          resolveLegacyMazeGenerationProfileForProgression(track),
          { targetComplexity: track.targetComplexity },
          viewport.aspectRatio
        );
        const felt = measureFeltSteps(maze);
        // No pressure/adaptive retry and no resize on budget levels.
        expect(maze.generation?.selection?.pressureRetryUsed).toBe(false);
        expect(maze.generation?.selection?.adaptiveRetryUsed).toBe(false);
        expect(maze.generation?.selection?.delivery).toBe('on-target');
        expect(maze.generation?.selection?.selectedDistance).toBe(0);
        dimensions.add(`${maze.width}x${maze.height}`);
        const target = resolveGeometryBudgetTarget(Math.min(level, LAST_BUDGET_LEVEL))!;
        expect(felt).toBeGreaterThanOrEqual(target);
        expect(felt).toBeLessThanOrEqual(target + GEOMETRY_BUDGET_WINDOW);
        if (level <= GEOMETRY_BUDGET_SATURATION_LEVEL) {
          realized.push(felt);
          proxies.push(measureGeometryBudgetProxy(maze, resolveLegacyMazeComplexity(maze)).total);
        } else {
          // Beyond the hard ceiling every level steers to the same ceiling target.
          expect(target).toBe(GEOMETRY_BUDGET_TOP_TARGET);
        }
      }
      // Frozen board: every level realizes the same grid dimensions.
      expect(dimensions.size).toBe(1);
      expect(realized.length).toBe(GEOMETRY_BUDGET_SATURATION_LEVEL - 1);
      for (let index = 1; index < realized.length; index += 1) {
        expect(realized[index]).toBeGreaterThan(realized[index - 1]!);
      }
      // Secondary guard: the old H1 proxy is no longer steered. Over 40-level
      // windows its mean must not fall away from the previous window's mean by
      // more than 10%, and the top of the ladder must be far above the bottom.
      const windowMean = (from: number, to: number): number => (
        proxies.slice(from, to).reduce((sum, value) => sum + value, 0) / (to - from)
      );
      for (let from = 0; from + 80 <= proxies.length; from += 40) {
        expect(windowMean(from + 40, from + 80)).toBeGreaterThan(windowMean(from, from + 40) * 0.9);
      }
      expect(windowMean(proxies.length - 40, proxies.length)).toBeGreaterThan(windowMean(0, 40) * 1.5);
    }, 300_000);
  }

  test('selection is deterministic for a given seed and ignores candidateCount', () => {
    const track = trackForLevel(12);
    const profile = resolveLegacyMazeGenerationProfileForProgression(track);
    const first = createLegacyRuntimeMazeForMode('play', 35, 4242, profile, { candidateCount: 1, targetComplexity: track.targetComplexity }, 1);
    const second = createLegacyRuntimeMazeForMode('play', 35, 4242, profile, { targetComplexity: track.targetComplexity }, 1);
    expect(second.grid).toEqual(first.grid);
    expect(second.solutionPath).toEqual(first.solutionPath);
    expect(second.seed).toBe(first.seed);
    expect(first.generation?.selection?.searchedCandidateCount).toBeGreaterThanOrEqual(1);
    expect(first.generation?.selection?.searchedCandidateCount).toBeLessThanOrEqual(GEOMETRY_BUDGET_BASE_CANDIDATES);
  }, 120_000);
});
