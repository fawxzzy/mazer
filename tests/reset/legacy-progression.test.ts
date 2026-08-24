import { describe, expect, test } from 'vitest';
import { resolveLegacyMenuLayout } from '../../src/legacy-runtime/legacyMenuLayout';
import { createLegacyRuntimeMazeForMode, resolveLegacyGenerationBudgetContract } from '../../src/legacy-runtime/legacyGenerationLifecycle';
import type { LegacyMazeSnapshot } from '../../src/legacy-runtime/legacyMaze';
import { createLegacyPatrolAgentState } from '../../src/legacy-runtime/legacyPatrolAgent';
import { createLegacyStaticSlowTileState } from '../../src/legacy-runtime/legacyStaticSlowTile';
import {
  LEGACY_PROGRESSION_MENU_MIN_TILE_PX,
  LEGACY_PROGRESSION_AI_CHALLENGE_SCORE_THRESHOLD,
  LEGACY_PROGRESSION_AI_EASE_SCORE_THRESHOLD,
  LEGACY_PROGRESSION_MAX_COMPLEXITY,
  LEGACY_PROGRESSION_MIN_COMPLEXITY,
  LEGACY_PROGRESSION_PHONE_MENU_TARGET_TILE_PX,
  LEGACY_PROGRESSION_PLAY_MIN_TILE_PX,
  LEGACY_PROGRESSION_STORAGE_KEY,
  createEmptyLegacyProgressionState,
  compareLegacyProgressionOrdinals,
  incrementLegacyProgressionOrdinal,
  normalizeLegacyProgressionOrdinal,
  normalizeLegacyProgressionState,
  readLegacyProgressionState,
  resolveLegacyProgressionLevel,
  resolveLegacyProgressionExpectedCompletionMs,
  resolveLegacyProgressionDifficultyProfile,
  resolveLegacyMazeGenerationProfileForProgression,
  recordLegacyProgressionCycle,
  resolveLegacyMazeComplexity,
  resolveLegacyProgressionGenerationScale,
  resolveLegacyProgressionPalette,
  resolveLegacyProgressionPaceScore,
  resolveLegacyProgressionPerformanceScore,
  resolveLegacyProgressionOrdinalSeedComponent,
  resolveLegacyProgressionViewportScaleCap,
  summarizeLegacyProgressionPacing,
  summarizeLegacyProgressionDiagnostics
} from '../../src/legacy-runtime/legacyProgression';
import {
  createMazeCycleTelemetryReceipt,
  scoreMazeCycleAiDecisionSummary
} from '../../src/legacy-runtime/mazeCycleTelemetry';

class MemoryStorage {
  public values = new Map<string, string>();

  public getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  public setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

const createProgressionTestMaze = (overrides: Partial<LegacyMazeSnapshot> = {}): LegacyMazeSnapshot => ({
  source: 'play-generated',
  width: 9,
  height: 9,
  grid: [
    [false, false, false, false, false, false, false, false, false],
    [false, true, true, true, true, true, true, true, false],
    [false, true, false, false, false, false, false, true, false],
    [false, true, true, true, true, true, false, true, false],
    [false, false, false, false, false, true, false, true, false],
    [false, true, true, true, true, true, true, true, false],
    [false, true, false, true, false, false, false, true, false],
    [false, true, true, true, true, true, true, true, false],
    [false, false, false, false, false, false, false, false, false]
  ],
  start: { x: 1, y: 1 },
  goal: { x: 7, y: 7 },
  solutionPath: [
    { x: 1, y: 1 },
    { x: 2, y: 1 },
    { x: 3, y: 1 },
    { x: 4, y: 1 },
    { x: 5, y: 1 },
    { x: 6, y: 1 },
    { x: 7, y: 1 },
    { x: 7, y: 2 },
    { x: 7, y: 3 },
    { x: 7, y: 4 },
    { x: 7, y: 5 },
    { x: 7, y: 6 },
    { x: 7, y: 7 }
  ],
  seed: 917,
  routeQualityStats: {
    bypassableRouteBands: 3,
    bypassableSolutionEdges: 5,
    meaningfulBypassableRouteBands: 2,
    meaningfulBypassableSolutionEdges: 3,
    minimumMeaningfulDetour: 3,
    routeQuality: 'multi-route',
    sampledSolutionEdges: 12
  },
  shortcutStats: {
    requested: 8,
    attempts: 10,
    created: 4,
    wallArrayEntries: 18,
    uniqueWallCandidates: 12,
    exhaustedWallArray: false
  },
  shortcutsCreated: 4,
  pathBuilderStats: {
    acceptedCheckpoints: 9,
    backtracks: 2,
    deterministicSafetyStart: false,
    exhaustedCheckpoints: true,
    longestPathLength: 13,
    pathTiles: 13,
    requestedCheckpoints: 9,
    topology: 'legacy-checkpoint-path-builder',
    wallArrayEntries: 12
  },
  ...overrides
});

describe('legacy progression', () => {
  test('preserves and advances completion ordinals losslessly across the safe-integer boundary', () => {
    const boundaryOrdinals = [
      '9007199254740990',
      '9007199254740991',
      '9007199254740992',
      '9007199254740993'
    ];

    for (const ordinal of boundaryOrdinals) {
      expect(normalizeLegacyProgressionOrdinal(ordinal)).toBe(ordinal);
      expect(JSON.parse(JSON.stringify({ ordinal }))).toEqual({ ordinal });
    }

    expect(normalizeLegacyProgressionOrdinal(Number.MAX_SAFE_INTEGER)).toBe('9007199254740991');
    expect(normalizeLegacyProgressionOrdinal(Number.MAX_SAFE_INTEGER + 1, '7')).toBe('7');
    expect(incrementLegacyProgressionOrdinal('9007199254740991')).toBe('9007199254740992');
    expect(incrementLegacyProgressionOrdinal('9007199254740992')).toBe('9007199254740993');
    expect(compareLegacyProgressionOrdinals('9007199254740993', '9007199254740992')).toBe(1);
    expect(resolveLegacyProgressionOrdinalSeedComponent('9007199254740993')).toBe(
      resolveLegacyProgressionOrdinalSeedComponent('9007199254740993')
    );

    const initial = createEmptyLegacyProgressionState();
    initial.tracks.player = {
      ...initial.tracks.player,
      completedCycles: '9007199254740991',
      level: '9007199254740992',
      targetComplexity: LEGACY_PROGRESSION_MAX_COMPLEXITY,
      peakComplexity: LEGACY_PROGRESSION_MAX_COMPLEXITY
    };
    initial.tracks['ai-runner'] = {
      ...initial.tracks['ai-runner'],
      completedCycles: '9007199254740992',
      level: '9007199254740993'
    };

    const roundTripped = normalizeLegacyProgressionState(JSON.parse(JSON.stringify(initial)));
    expect(roundTripped.tracks.player.completedCycles).toBe('9007199254740991');
    expect(roundTripped.tracks.player.level).toBe('9007199254740992');
    expect(roundTripped.tracks['ai-runner'].completedCycles).toBe('9007199254740992');
    expect(roundTripped.tracks['ai-runner'].level).toBe('9007199254740993');

    const storage = new MemoryStorage();
    const maze = createProgressionTestMaze();
    const receipt = createMazeCycleTelemetryReceipt({
      averageFrameMs: 16,
      completedAt: '2026-08-23T12:00:00.000Z',
      completionTimeMs: 8000,
      controlMode: 'stick',
      maze,
      playerPath: maze.solutionPath,
      resetUsed: false,
      surface: 'play',
      backtracks: 0,
      wrongTurns: 0
    });
    const advanced = recordLegacyProgressionCycle(storage, roundTripped, receipt, maze);
    expect(advanced.tracks.player.completedCycles).toBe('9007199254740992');
    expect(advanced.tracks.player.level).toBe('9007199254740993');
    expect(advanced.tracks['ai-runner']).toEqual(roundTripped.tracks['ai-runner']);

    const duplicate = recordLegacyProgressionCycle(storage, advanced, receipt, maze);
    expect(duplicate.tracks.player.completedCycles).toBe('9007199254740992');
    expect(duplicate.tracks.player.level).toBe('9007199254740993');
  });

  test('starts both tracks at a real level-one tutorial baseline', () => {
    const state = createEmptyLegacyProgressionState();
    expect(state.tracks.player).toMatchObject({
      completedCycles: '0',
      level: '1',
      rank: 'E',
      recentSignals: [],
      struggleCycles: Number.MAX_SAFE_INTEGER,
      targetComplexity: LEGACY_PROGRESSION_MIN_COMPLEXITY
    });
    expect(state.tracks['ai-runner']).toMatchObject({
      completedCycles: '0',
      level: '1',
      rank: 'E',
      recentSignals: [],
      targetComplexity: LEGACY_PROGRESSION_MIN_COMPLEXITY
    });

    const legacyStoredState = {
      version: 1,
      updatedAt: '2026-07-08T12:00:00.000Z',
      tracks: {
        player: {
          ...state.tracks.player,
          completedCycles: '9',
          struggleCycles: 0,
          targetComplexity: 64
        },
        'ai-runner': {
          ...state.tracks['ai-runner'],
          completedCycles: '5180',
          targetComplexity: 180
        }
      }
    };
    const storage = new MemoryStorage();
    storage.setItem(LEGACY_PROGRESSION_STORAGE_KEY, JSON.stringify(legacyStoredState));
    const normalized = readLegacyProgressionState(storage);

    expect(normalized.tracks.player).toMatchObject({
      completedCycles: '0',
      level: '1',
      rank: 'E',
      recentSignals: [],
      struggleCycles: Number.MAX_SAFE_INTEGER,
      targetComplexity: LEGACY_PROGRESSION_MIN_COMPLEXITY
    });
    expect(normalized.tracks['ai-runner']).toMatchObject({
      completedCycles: '0',
      level: '1',
      rank: 'E',
      recentSignals: [],
      targetComplexity: LEGACY_PROGRESSION_MIN_COMPLEXITY
    });
  });

  test('records player and ai-runner cycle progression as separate local tracks', () => {
    const storage = new MemoryStorage();
    const maze = createProgressionTestMaze();
    let state = createEmptyLegacyProgressionState();
    const playerReceipt = createMazeCycleTelemetryReceipt({
      averageFrameMs: 16,
      completedAt: '2026-07-08T12:00:00.000Z',
      completionTimeMs: 8000,
      controlMode: 'stick',
      maze,
      playerPath: maze.solutionPath,
      resetUsed: false,
      surface: 'play',
      backtracks: 0,
      wrongTurns: 0
    });

    state = recordLegacyProgressionCycle(storage, state, playerReceipt, maze);

    expect(state.tracks.player.completedCycles).toBe('1');
    expect(state.tracks.player.lastSignal).toBe('challenge');
    expect(state.tracks.player.lastCompletionTimeMs).toBe(8000);
    expect(state.tracks.player.bestCompletionTimeMs).toBe(8000);
    expect(state.tracks.player.paceScore).toBeGreaterThanOrEqual(70);
    expect(state.tracks.player.recentSignals).toEqual(['challenge']);
    expect(state.tracks.player).toMatchObject({
      level: '2',
      rank: 'E',
      targetComplexity: 12
    });
    expect(state.tracks['ai-runner'].completedCycles).toBe('0');
    expect(JSON.parse(storage.getItem(LEGACY_PROGRESSION_STORAGE_KEY) ?? '{}').tracks.player.completedCycles).toBe('1');

    const aiReceipt = createMazeCycleTelemetryReceipt({
      averageFrameMs: 14,
      completedAt: '2026-07-08T12:01:00.000Z',
      completionTimeMs: 32_000,
      controlMode: 'arrows',
      maze,
      playerPath: maze.solutionPath,
      resetUsed: false,
      surface: 'menu-demo',
      backtracks: 7,
      wrongTurns: 8
    });

    state = recordLegacyProgressionCycle(storage, state, aiReceipt, maze);

    expect(state.tracks.player.completedCycles).toBe('1');
    expect(state.tracks['ai-runner'].completedCycles).toBe('1');
    expect(state.tracks['ai-runner'].lastSignal).toBe('ease');
    expect(state.tracks['ai-runner'].lastCompletionTimeMs).toBe(32_000);
    expect(state.tracks['ai-runner'].bestCompletionTimeMs).toBe(32_000);
    expect(state.tracks['ai-runner'].recentSignals).toEqual(['ease']);
    expect(state.tracks['ai-runner'].targetComplexity).toBe(LEGACY_PROGRESSION_MIN_COMPLEXITY + 4);
    expect(readLegacyProgressionState(storage).tracks['ai-runner'].completedCycles).toBe('1');
  });

  test('rebases legacy player history to the gentle baseline instead of converting it into late-game difficulty', () => {
    const storage = new MemoryStorage();
    const legacyState = {
      version: 1,
      playerProgressionBaselineVersion: 3,
      tracks: {
        player: {
          ...createEmptyLegacyProgressionState().tracks.player,
          cleanCycles: 99,
          completedCycles: '5180',
          level: '99',
          rank: 'S',
          struggleCycles: 0,
          targetComplexity: LEGACY_PROGRESSION_MAX_COMPLEXITY
        },
        'ai-runner': createEmptyLegacyProgressionState().tracks['ai-runner']
      }
    };
    storage.setItem(LEGACY_PROGRESSION_STORAGE_KEY, JSON.stringify(legacyState));

    const repaired = readLegacyProgressionState(storage);
    expect(repaired.playerProgressionBaselineVersion).toBeGreaterThanOrEqual(5);
    expect(repaired.tracks.player).toMatchObject({
      cleanCycles: 0,
      completedCycles: '0',
      level: '1',
      rank: 'E',
      struggleCycles: Number.MAX_SAFE_INTEGER,
      targetComplexity: LEGACY_PROGRESSION_MIN_COMPLEXITY
    });
    expect(JSON.parse(storage.getItem(LEGACY_PROGRESSION_STORAGE_KEY) ?? '{}'))
      .toMatchObject({ playerProgressionBaselineVersion: 5 });

    const profile = resolveLegacyProgressionDifficultyProfile(repaired.tracks.player);
    expect(profile.band).toBe('tutorial');
    expect(createLegacyStaticSlowTileState(createProgressionTestMaze(), profile.band))
      .toMatchObject({ eligible: false, placement: null });
    expect(createLegacyPatrolAgentState(createProgressionTestMaze(), profile.band)).toBeNull();

    const advanced = recordLegacyProgressionCycle(
      storage,
      repaired,
      createMazeCycleTelemetryReceipt({
        averageFrameMs: 16,
        completedAt: '2026-08-14T18:00:00.000Z',
        completionTimeMs: 8_000,
        controlMode: 'stick',
        maze: createProgressionTestMaze(),
        playerPath: createProgressionTestMaze().solutionPath,
        resetUsed: false,
        surface: 'play',
        backtracks: 1,
        wrongTurns: 1
      }),
      createProgressionTestMaze()
    );
    expect(advanced.tracks.player).toMatchObject({
      completedCycles: '1',
      level: '2',
      rank: 'E',
      targetComplexity: LEGACY_PROGRESSION_MIN_COMPLEXITY + 4
    });
    expect(readLegacyProgressionState(storage).tracks.player).toMatchObject({
      completedCycles: '1',
      level: '2',
      rank: 'E',
      struggleCycles: Number.MAX_SAFE_INTEGER,
      targetComplexity: LEGACY_PROGRESSION_MIN_COMPLEXITY + 4
    });

    // A still-open client preserves recognized track fields but rewrites
    // the top-level baseline version during a remote sync. The baseline provenance
    // must keep a legitimately advanced post-rebase player from being reset
    // again when they later return to an updated client.
    const staleV3RemoteWrite = {
      ...advanced,
      playerProgressionBaselineVersion: 3
    };
    const syncedStorage = new MemoryStorage();
    syncedStorage.setItem(LEGACY_PROGRESSION_STORAGE_KEY, JSON.stringify(staleV3RemoteWrite));
    expect(readLegacyProgressionState(syncedStorage).tracks.player).toMatchObject({
      completedCycles: '1',
      level: '2',
      rank: 'E',
      struggleCycles: Number.MAX_SAFE_INTEGER,
      targetComplexity: LEGACY_PROGRESSION_MIN_COMPLEXITY + 4
    });
  });

  test('rebases a versioned but impossible player level before it can unlock late-game hazards', () => {
    const storage = new MemoryStorage();
    const baseline = createEmptyLegacyProgressionState();
    storage.setItem(LEGACY_PROGRESSION_STORAGE_KEY, JSON.stringify({
      ...baseline,
      playerProgressionBaselineVersion: 4,
      tracks: {
        ...baseline.tracks,
        player: {
          ...baseline.tracks.player,
          completedCycles: '3',
          level: '99',
          rank: 'S',
          targetComplexity: LEGACY_PROGRESSION_MAX_COMPLEXITY
        }
      }
    }));

    const repaired = readLegacyProgressionState(storage);
    expect(repaired.playerProgressionBaselineVersion).toBe(5);
    expect(repaired.tracks.player).toMatchObject({
      completedCycles: '0',
      level: '1',
      rank: 'E',
      targetComplexity: LEGACY_PROGRESSION_MIN_COMPLEXITY
    });

    const profile = resolveLegacyProgressionDifficultyProfile(repaired.tracks.player);
    expect(profile.band).toBe('tutorial');
    expect(createLegacyStaticSlowTileState(createProgressionTestMaze(), profile.band))
      .toMatchObject({ eligible: false, placement: null });
    expect(createLegacyPatrolAgentState(createProgressionTestMaze(), profile.band)).toBeNull();
  });

  test('keeps a coherent earned player trajectory when it migrates to the current baseline', () => {
    const storage = new MemoryStorage();
    const baseline = createEmptyLegacyProgressionState();
    storage.setItem(LEGACY_PROGRESSION_STORAGE_KEY, JSON.stringify({
      ...baseline,
      playerProgressionBaselineVersion: 4,
      tracks: {
        ...baseline.tracks,
        player: {
          ...baseline.tracks.player,
          completedCycles: '3',
          level: '4',
          rank: 'E',
          targetComplexity: LEGACY_PROGRESSION_MIN_COMPLEXITY + 12
        }
      }
    }));

    const migrated = readLegacyProgressionState(storage);
    expect(migrated.playerProgressionBaselineVersion).toBe(5);
    expect(migrated.tracks.player).toMatchObject({
      completedCycles: '3',
      level: '4',
      rank: 'E',
      targetComplexity: LEGACY_PROGRESSION_MIN_COMPLEXITY + 12
    });
  });

  test('advances the player exactly one level per completed maze with no taper, even past level 10', () => {
    // Visible level is a completion ordinal. Difficulty still advances by a
    // bounded +4 target-complexity step, but it no longer owns the number the
    // player sees.
    const storage = new MemoryStorage();
    let state = createEmptyLegacyProgressionState();
    for (let cycle = 1; cycle <= 12; cycle += 1) {
      state = recordLegacyProgressionCycle(
        storage,
        state,
        createMazeCycleTelemetryReceipt({
          averageFrameMs: 16,
          completedAt: `2026-08-2${cycle % 9}T12:00:00.000Z`,
          completionTimeMs: 8_000,
          controlMode: 'stick',
          maze: createProgressionTestMaze(),
          playerPath: createProgressionTestMaze().solutionPath,
          resetUsed: false,
          surface: 'play',
          backtracks: 0,
          wrongTurns: 0
        }),
        createProgressionTestMaze()
      );
      expect(state.tracks.player.level).toBe(String(cycle + 1));
      // Every intermediate write must also survive its own re-normalization
      // (readLegacyProgressionState runs the same coherence check).
      expect(readLegacyProgressionState(storage).tracks.player.level).toBe(String(cycle + 1));
    }

    expect(state.tracks.player).toMatchObject({
      completedCycles: '12',
      level: '13',
      targetComplexity: LEGACY_PROGRESSION_MIN_COMPLEXITY + (12 * 4)
    });
  });

  test('continues both completion ordinals past 99 while bounded difficulty stays capped', () => {
    const storage = new MemoryStorage();
    const maze = createProgressionTestMaze();
    const baseline = createEmptyLegacyProgressionState();
    const createReceipt = (surface: 'play' | 'menu-demo', minute: number) => createMazeCycleTelemetryReceipt({
      averageFrameMs: 16,
      completedAt: `2026-08-23T18:${String(minute).padStart(2, '0')}:00.000Z`,
      completionTimeMs: 8_000,
      controlMode: 'stick',
      maze,
      playerPath: maze.solutionPath,
      resetUsed: false,
      surface,
      backtracks: 0,
      wrongTurns: 0
    });
    let state = {
      ...baseline,
      tracks: {
        player: {
          ...baseline.tracks.player,
          completedCycles: '98',
          level: '99',
          targetComplexity: LEGACY_PROGRESSION_MAX_COMPLEXITY
        },
        'ai-runner': {
          ...baseline.tracks['ai-runner'],
          completedCycles: '98',
          level: '99',
          targetComplexity: LEGACY_PROGRESSION_MAX_COMPLEXITY
        }
      }
    };

    state = recordLegacyProgressionCycle(storage, state, createReceipt('play', 0), maze);
    state = recordLegacyProgressionCycle(storage, state, createReceipt('menu-demo', 1), maze);
    state = recordLegacyProgressionCycle(storage, state, createReceipt('play', 2), maze);
    state = recordLegacyProgressionCycle(storage, state, createReceipt('menu-demo', 3), maze);

    expect(state.tracks.player).toMatchObject({
      completedCycles: '100',
      level: '101',
      targetComplexity: LEGACY_PROGRESSION_MAX_COMPLEXITY
    });
    expect(state.tracks['ai-runner']).toMatchObject({
      completedCycles: '100',
      level: '101',
      targetComplexity: LEGACY_PROGRESSION_MAX_COMPLEXITY
    });
    expect(readLegacyProgressionState(storage).tracks.player.level).toBe('101');
    expect(resolveLegacyProgressionDifficultyProfile(state.tracks.player).band).toBe('mythic');
  });

  test('applies the same completion receipt at most once', () => {
    const storage = new MemoryStorage();
    const maze = createProgressionTestMaze();
    const receipt = createMazeCycleTelemetryReceipt({
      averageFrameMs: 16,
      completedAt: '2026-08-23T19:00:00.000Z',
      completionTimeMs: 8_000,
      controlMode: 'stick',
      maze,
      playerPath: maze.solutionPath,
      resetUsed: false,
      surface: 'play',
      backtracks: 0,
      wrongTurns: 0
    });

    const once = recordLegacyProgressionCycle(storage, createEmptyLegacyProgressionState(), receipt, maze);
    const retried = recordLegacyProgressionCycle(storage, once, receipt, maze);

    expect(retried).toEqual(once);
    expect(retried.tracks.player).toMatchObject({
      completedCycles: '1',
      lastReceiptId: receipt.id,
      level: '2'
    });
  });

  test('keeps maze geometry independent from a very large completion ordinal', () => {
    const baseline = createEmptyLegacyProgressionState().tracks.player;
    const lowOrdinal = {
      ...baseline,
      level: '99',
      targetComplexity: LEGACY_PROGRESSION_MAX_COMPLEXITY
    };
    const highOrdinal = {
      ...lowOrdinal,
      completedCycles: '999999',
      level: '1000000'
    };

    expect(resolveLegacyProgressionDifficultyProfile(highOrdinal))
      .toEqual(resolveLegacyProgressionDifficultyProfile(lowOrdinal));
    expect(resolveLegacyMazeGenerationProfileForProgression(highOrdinal))
      .toEqual(resolveLegacyMazeGenerationProfileForProgression(lowOrdinal));
    expect(resolveLegacyProgressionGenerationScale(50, highOrdinal))
      .toBe(resolveLegacyProgressionGenerationScale(50, lowOrdinal));
  });

  test('does not rebase a real account whose progress was earned under a previous, lower-rate formula', () => {
    // The per-completion gain has changed over time (a taper was added, then
    // removed -- see resolveLegacyProgressionTargetAdjustment). The
    // coherence check guards against corrupted/tampered saves by capping
    // targetComplexity at what the CURRENT formula could produce for that
    // many completed cycles, rather than exact-matching a specific
    // formula's trace -- so an account that earned real progress under a
    // strictly-lower-rate formula than today's must still read back intact,
    // not get treated as "impossible" and wiped to level 1 just because the
    // formula it actually earned its level under no longer matches the
    // live one.
    const storage = new MemoryStorage();
    const baseline = createEmptyLegacyProgressionState();
    const legitimateLowerRateComplexity = LEGACY_PROGRESSION_MIN_COMPLEXITY + 42; // 11 cycles, never above +4/cycle
    storage.setItem(LEGACY_PROGRESSION_STORAGE_KEY, JSON.stringify({
      ...baseline,
      tracks: {
        ...baseline.tracks,
        player: {
          ...baseline.tracks.player,
          completedCycles: '11',
          targetComplexity: legitimateLowerRateComplexity
        }
      }
    }));

    const preserved = readLegacyProgressionState(storage);
    expect(preserved.tracks.player).toMatchObject({
      completedCycles: '11',
      targetComplexity: legitimateLowerRateComplexity
    });

    // An impossible value (more than +4/cycle could ever produce) must
    // still be rejected -- this isn't a blanket amnesty, only a floor-vs-
    // ceiling relaxation.
    const tamperedStorage = new MemoryStorage();
    tamperedStorage.setItem(LEGACY_PROGRESSION_STORAGE_KEY, JSON.stringify({
      ...baseline,
      tracks: {
        ...baseline.tracks,
        player: {
          ...baseline.tracks.player,
          completedCycles: '11',
          targetComplexity: LEGACY_PROGRESSION_MIN_COMPLEXITY + (11 * 4) + 1
        }
      }
    }));
    const rebased = readLegacyProgressionState(tamperedStorage);
    expect(rebased.tracks.player).toMatchObject({
      completedCycles: '0',
      level: '1',
      targetComplexity: LEGACY_PROGRESSION_MIN_COMPLEXITY
    });
  });

  test('scores completion time against route and complexity pressure for level pacing', () => {
    const maze = createProgressionTestMaze();
    const fastReceipt = createMazeCycleTelemetryReceipt({
      averageFrameMs: 16,
      completedAt: '2026-07-08T12:00:00.000Z',
      completionTimeMs: 7000,
      controlMode: 'stick',
      maze,
      playerPath: maze.solutionPath,
      resetUsed: false,
      surface: 'menu-demo',
      backtracks: 0,
      wrongTurns: 0
    });
    const slowReceipt = createMazeCycleTelemetryReceipt({
      averageFrameMs: 16,
      completedAt: '2026-07-08T12:01:00.000Z',
      completionTimeMs: 70_000,
      controlMode: 'stick',
      maze,
      playerPath: maze.solutionPath,
      resetUsed: false,
      surface: 'menu-demo',
      backtracks: 2,
      wrongTurns: 2
    });
    const complexity = resolveLegacyMazeComplexity(maze).total;

    expect(resolveLegacyProgressionExpectedCompletionMs(fastReceipt, complexity)).toBeGreaterThan(0);
    expect(resolveLegacyProgressionPaceScore(fastReceipt, complexity)).toBeGreaterThan(resolveLegacyProgressionPaceScore(slowReceipt, complexity));

    let state = createEmptyLegacyProgressionState();
    state = recordLegacyProgressionCycle(new MemoryStorage(), state, fastReceipt, maze);
    expect(state.tracks['ai-runner'].lastSignal).toBe('challenge');
    expect(state.tracks['ai-runner'].paceScore).toBeGreaterThanOrEqual(70);

    state = recordLegacyProgressionCycle(new MemoryStorage(), state, slowReceipt, maze);
    expect(state.tracks['ai-runner'].lastSignal).toBe('ease');
    expect(state.tracks['ai-runner'].paceScore).toBeLessThanOrEqual(28);
  });

  test('lets human-like AI runs move skill level without requiring perfect pathing', () => {
    const storage = new MemoryStorage();
    const maze = createProgressionTestMaze();
    const createSearchingAiReceipt = (completedAt: string) => createMazeCycleTelemetryReceipt({
      aiDecisionSummary: {
        backtrackCount: 4,
        decisionCount: 40,
        optionalRetargetCount: 1,
        recoveryCount: 2,
        thinkingModel: 'human-local-memory',
        visitedUndoCount: 0,
        wrongBranchCount: 3
      },
      averageFrameMs: 16,
      completedAt,
      completionTimeMs: 18_000,
      controlMode: 'stick',
      maze,
      playerPath: maze.solutionPath,
      resetUsed: false,
      surface: 'menu-demo',
      backtracks: 4,
      wrongTurns: 3
    });

    let state = createEmptyLegacyProgressionState();
    const startingAiTrack = state.tracks['ai-runner'];

    state = recordLegacyProgressionCycle(storage, state, createSearchingAiReceipt('2026-07-08T12:00:00.000Z'), maze);
    expect(state.tracks['ai-runner'].lastSignal).toBe('challenge');
    expect(state.tracks['ai-runner'].paceScore).toBeGreaterThanOrEqual(LEGACY_PROGRESSION_AI_CHALLENGE_SCORE_THRESHOLD);
    expect(state.tracks['ai-runner'].targetComplexity).toBeGreaterThan(startingAiTrack.targetComplexity);

    state = recordLegacyProgressionCycle(storage, state, createSearchingAiReceipt('2026-07-08T12:01:00.000Z'), maze);
    expect(state.tracks['ai-runner'].recentSignals.slice(0, 2)).toEqual(['challenge', 'challenge']);
    expect(BigInt(state.tracks['ai-runner'].level)).toBeGreaterThan(BigInt(startingAiTrack.level));
  });

  test('calibrates AI skill progression across repeated competent sample runs', () => {
    const storage = new MemoryStorage();
    const maze = createProgressionTestMaze();
    let state = createEmptyLegacyProgressionState();

    for (let run = 0; run < 6; run += 1) {
      const receipt = createMazeCycleTelemetryReceipt({
        aiDecisionSummary: {
          backtrackCount: run % 2 === 0 ? 3 : 4,
          decisionCount: 42,
          optionalRetargetCount: run % 3 === 0 ? 1 : 0,
          recoveryCount: 1,
          thinkingModel: 'human-local-memory',
          visitedUndoCount: 0,
          wrongBranchCount: 2
        },
        averageFrameMs: 16,
        completedAt: `2026-07-08T12:0${run}:00.000Z`,
        completionTimeMs: 17_000 + (run * 350),
        controlMode: 'stick',
        maze,
        playerPath: maze.solutionPath,
        resetUsed: false,
        surface: 'menu-demo',
        backtracks: run % 2 === 0 ? 3 : 4,
        wrongTurns: 2
      });

      state = recordLegacyProgressionCycle(storage, state, receipt, maze);
    }

    const aiTrack = state.tracks['ai-runner'];
    const pacing = summarizeLegacyProgressionPacing(aiTrack, resolveLegacyMazeComplexity(maze).total);

    expect(aiTrack.completedCycles).toBe('6');
    expect(BigInt(aiTrack.level)).toBeGreaterThan(1n);
    expect(aiTrack.targetComplexity).toBeGreaterThan(LEGACY_PROGRESSION_MIN_COMPLEXITY + 8);
    expect(aiTrack.rank).toBe('D');
    expect(pacing.skillTrend).toBe('rising');
    expect(pacing.levelProgressPercent).toBeGreaterThanOrEqual(0);
    expect(pacing.levelProgressPercent).toBeLessThanOrEqual(100);
    expect(pacing.complexityUntilNextLevel).toBeGreaterThanOrEqual(0);
    expect(pacing.nextLevelTargetComplexity).toBeGreaterThanOrEqual(aiTrack.targetComplexity);
  });

  test('moves AI rank only after sustained competent progression', () => {
    const storage = new MemoryStorage();
    const maze = createProgressionTestMaze();
    let state = createEmptyLegacyProgressionState();

    for (let run = 0; run < 8; run += 1) {
      state = recordLegacyProgressionCycle(storage, state, createMazeCycleTelemetryReceipt({
        aiDecisionSummary: {
          backtrackCount: 2,
          decisionCount: 44,
          optionalRetargetCount: run % 4 === 0 ? 1 : 0,
          recoveryCount: 1,
          thinkingModel: 'human-local-memory',
          visitedUndoCount: 0,
          wrongBranchCount: 2
        },
        averageFrameMs: 16,
        completedAt: `2026-07-08T13:0${run}:00.000Z`,
        completionTimeMs: 16_800 + (run * 220),
        controlMode: 'stick',
        maze,
        playerPath: maze.solutionPath,
        resetUsed: false,
        surface: 'menu-demo',
        backtracks: 2,
        wrongTurns: 2
      }), maze);
    }

    const aiTrack = state.tracks['ai-runner'];

    expect(aiTrack.completedCycles).toBe('8');
    expect(aiTrack.rank).toBe('D');
    expect(aiTrack.targetComplexity).toBeGreaterThanOrEqual(28);
    expect(aiTrack.recentSignals.every((signal) => signal === 'challenge')).toBe(true);
  });

  test('keeps chaotic AI telemetry without penalizing a completed maze', () => {
    const storage = new MemoryStorage();
    const maze = createProgressionTestMaze();
    const chaoticAiReceipt = createMazeCycleTelemetryReceipt({
      aiDecisionSummary: {
        backtrackCount: 12,
        decisionCount: 24,
        optionalRetargetCount: 5,
        recoveryCount: 7,
        thinkingModel: 'human-local-memory',
        visitedUndoCount: 4,
        wrongBranchCount: 10
      },
      averageFrameMs: 16,
      completedAt: '2026-07-08T12:00:00.000Z',
      completionTimeMs: 30_000,
      controlMode: 'stick',
      maze,
      playerPath: [
        ...maze.solutionPath,
        ...maze.solutionPath
      ],
      resetUsed: false,
      surface: 'menu-demo',
      backtracks: 12,
      wrongTurns: 10
    });

    const state = recordLegacyProgressionCycle(storage, createEmptyLegacyProgressionState(), chaoticAiReceipt, maze);

    expect(state.tracks['ai-runner'].lastSignal).toBe('ease');
    expect(state.tracks['ai-runner'].paceScore).toBeLessThanOrEqual(LEGACY_PROGRESSION_AI_EASE_SCORE_THRESHOLD);
    expect(state.tracks['ai-runner']).toMatchObject({
      completedCycles: '1',
      level: '2',
      targetComplexity: LEGACY_PROGRESSION_MIN_COMPLEXITY + 4
    });
  });

  test('keeps searching AI telemetry without holding back a completed maze', () => {
    const storage = new MemoryStorage();
    const maze = createProgressionTestMaze();
    const searchingExhaustionReceipt = createMazeCycleTelemetryReceipt({
      aiDecisionSummary: {
        backtrackCount: 15,
        decisionCount: 60,
        optionalRetargetCount: 1,
        recoveryCount: 7,
        thinkingModel: 'human-local-memory',
        visitedUndoCount: 0,
        wrongBranchCount: 20
      },
      averageFrameMs: 16,
      completedAt: '2026-07-08T12:02:00.000Z',
      completionTimeMs: 30_000,
      controlMode: 'stick',
      maze,
      playerPath: [
        ...maze.solutionPath,
        ...maze.solutionPath,
        ...maze.solutionPath
      ],
      resetUsed: true,
      surface: 'menu-demo',
      backtracks: 15,
      wrongTurns: 20
    });

    expect(scoreMazeCycleAiDecisionSummary(searchingExhaustionReceipt.aiDecisionSummary)?.signal).toBe('searching');
    expect(searchingExhaustionReceipt.routeEfficiencyPressureScore).toBeGreaterThanOrEqual(88);

    const state = recordLegacyProgressionCycle(
      storage,
      createEmptyLegacyProgressionState(),
      searchingExhaustionReceipt,
      maze
    );

    expect(state.tracks['ai-runner'].lastSignal).toBe('hold');
    expect(state.tracks['ai-runner']).toMatchObject({
      completedCycles: '1',
      level: '2',
      targetComplexity: LEGACY_PROGRESSION_MIN_COMPLEXITY + 4
    });
    expect(state.tracks['ai-runner'].struggleCycles).toBe(0);
  });

  test('advances a high-level AI exactly one level after an ease-classified completion', () => {
    const storage = new MemoryStorage();
    const maze = createProgressionTestMaze();
    const chaoticAiReceipt = createMazeCycleTelemetryReceipt({
      aiDecisionSummary: {
        backtrackCount: 12,
        decisionCount: 24,
        optionalRetargetCount: 5,
        recoveryCount: 7,
        thinkingModel: 'human-local-memory',
        visitedUndoCount: 4,
        wrongBranchCount: 10
      },
      averageFrameMs: 16,
      completedAt: '2026-08-23T17:00:00.000Z',
      completionTimeMs: 30_000,
      controlMode: 'stick',
      maze,
      playerPath: [...maze.solutionPath, ...maze.solutionPath],
      resetUsed: false,
      surface: 'menu-demo',
      backtracks: 12,
      wrongTurns: 10
    });
    const baseline = createEmptyLegacyProgressionState();
    const levelThirtyTwoTarget = LEGACY_PROGRESSION_MIN_COMPLEXITY + (31 * 4);
    const state = recordLegacyProgressionCycle(storage, {
      ...baseline,
      tracks: {
        ...baseline.tracks,
        'ai-runner': {
          ...baseline.tracks['ai-runner'],
          completedCycles: '31',
          level: '32',
          targetComplexity: levelThirtyTwoTarget
        }
      }
    }, chaoticAiReceipt, maze);

    expect(state.tracks['ai-runner']).toMatchObject({
      completedCycles: '32',
      lastSignal: 'ease',
      level: '33',
      targetComplexity: levelThirtyTwoTarget + 4
    });
  });

  test('advances a high-level player exactly one level after every completed maze', () => {
    const storage = new MemoryStorage();
    const maze = createProgressionTestMaze();
    const completedMaze = createMazeCycleTelemetryReceipt({
      averageFrameMs: 34,
      completedAt: '2026-08-23T17:01:00.000Z',
      completionTimeMs: 30_000,
      controlMode: 'stick',
      maze,
      playerPath: [...maze.solutionPath, ...maze.solutionPath, ...maze.solutionPath],
      resetUsed: true,
      surface: 'play',
      backtracks: 12,
      wrongTurns: 10
    });
    const baseline = createEmptyLegacyProgressionState();
    const levelThirtyTwoTarget = LEGACY_PROGRESSION_MIN_COMPLEXITY + (31 * 4);
    const state = recordLegacyProgressionCycle(storage, {
      ...baseline,
      tracks: {
        ...baseline.tracks,
        player: {
          ...baseline.tracks.player,
          completedCycles: '31',
          level: '32',
          targetComplexity: levelThirtyTwoTarget
        }
      }
    }, completedMaze, maze);

    expect(state.tracks.player).toMatchObject({
      completedCycles: '32',
      level: '33',
      targetComplexity: levelThirtyTwoTarget + 4
    });
  });

  test('keeps route-quality telemetry for players while every completed maze advances', () => {
    const storage = new MemoryStorage();
    const maze = createProgressionTestMaze();
    const complexity = resolveLegacyMazeComplexity(maze).total;
    const efficientReceipt = createMazeCycleTelemetryReceipt({
      averageFrameMs: 16,
      completedAt: '2026-07-08T12:00:00.000Z',
      completionTimeMs: 8000,
      controlMode: 'stick',
      maze,
      playerPath: maze.solutionPath,
      resetUsed: false,
      surface: 'play',
      backtracks: 0,
      wrongTurns: 0
    });
    const routeWasteReceipt = createMazeCycleTelemetryReceipt({
      averageFrameMs: 16,
      completedAt: '2026-07-08T12:01:00.000Z',
      completionTimeMs: 8000,
      controlMode: 'stick',
      maze,
      playerPath: [
        ...maze.solutionPath,
        ...maze.solutionPath,
        ...maze.solutionPath
      ],
      resetUsed: false,
      surface: 'play',
      backtracks: 0,
      wrongTurns: 0
    });
    const unsafeFrameReceipt = createMazeCycleTelemetryReceipt({
      averageFrameMs: 34,
      completedAt: '2026-07-08T12:02:00.000Z',
      completionTimeMs: 8000,
      controlMode: 'stick',
      maze,
      playerPath: maze.solutionPath,
      resetUsed: false,
      surface: 'play',
      backtracks: 0,
      wrongTurns: 0
    });
    const unsafeAiFrameReceipt = createMazeCycleTelemetryReceipt({
      averageFrameMs: 34,
      aiDecisionSummary: {
        backtrackCount: 0,
        decisionCount: maze.solutionPath.length,
        optionalRetargetCount: 0,
        recoveryCount: 0,
        thinkingModel: 'legacy-source',
        visitedUndoCount: 0,
        wrongBranchCount: 0
      },
      completedAt: '2026-07-08T12:02:00.000Z',
      completionTimeMs: 8000,
      controlMode: 'stick',
      maze,
      playerPath: maze.solutionPath,
      resetUsed: false,
      surface: 'menu-demo',
      backtracks: 0,
      wrongTurns: 0
    });

    expect(routeWasteReceipt.shortestViablePathLength).toBe(maze.solutionPath.length);
    expect(routeWasteReceipt.routeEfficiencyPressureScore).toBeGreaterThanOrEqual(75);
    expect(resolveLegacyProgressionPerformanceScore(efficientReceipt, complexity).signal).toBe('challenge');
    expect(resolveLegacyProgressionPerformanceScore(routeWasteReceipt, complexity).signal).toBe('ease');
    expect(resolveLegacyProgressionPerformanceScore(unsafeFrameReceipt, complexity).signal).toBe('challenge');
    expect(resolveLegacyProgressionPerformanceScore(unsafeAiFrameReceipt, complexity).signal).toBe('hold');

    let state = recordLegacyProgressionCycle(storage, createEmptyLegacyProgressionState(), routeWasteReceipt, maze);
    expect(state.tracks.player.lastSignal).toBe('challenge');
    expect(state.tracks.player.targetComplexity).toBe(12);

    state = recordLegacyProgressionCycle(storage, createEmptyLegacyProgressionState(), unsafeFrameReceipt, maze);
    expect(state.tracks.player.lastSignal).toBe('challenge');
    expect(state.tracks.player.targetComplexity).toBe(12);
  });

  test('uses the displayed player score without a hidden wrong-turn or backtrack gate', () => {
    const maze = createProgressionTestMaze();
    const complexity = resolveLegacyMazeComplexity(maze).total;
    const highScoreWithNormalMistakes = createMazeCycleTelemetryReceipt({
      averageFrameMs: 16,
      completedAt: '2026-08-14T02:40:00.000Z',
      completionTimeMs: 8000,
      controlMode: 'stick',
      maze,
      playerPath: maze.solutionPath,
      resetUsed: false,
      surface: 'play',
      backtracks: 2,
      wrongTurns: 2
    });
    const highScoreWithManyMistakes = createMazeCycleTelemetryReceipt({
      averageFrameMs: 16,
      completedAt: '2026-08-14T02:41:00.000Z',
      completionTimeMs: 8000,
      controlMode: 'stick',
      maze,
      playerPath: maze.solutionPath,
      resetUsed: false,
      surface: 'play',
      backtracks: 6,
      wrongTurns: 6
    });
    const extremeDetour = createMazeCycleTelemetryReceipt({
      averageFrameMs: 16,
      completedAt: '2026-08-14T02:42:00.000Z',
      completionTimeMs: 8000,
      controlMode: 'stick',
      maze,
      playerPath: [
        ...maze.solutionPath,
        ...maze.solutionPath,
        ...maze.solutionPath
      ],
      resetUsed: false,
      surface: 'play',
      backtracks: 0,
      wrongTurns: 0
    });

    const highScore = resolveLegacyProgressionPerformanceScore(highScoreWithNormalMistakes, complexity);
    expect(highScore.signal).toBe('challenge');
    expect(highScore.total).toBeGreaterThanOrEqual(70);
    expect(resolveLegacyProgressionPerformanceScore(highScoreWithManyMistakes, complexity)).toMatchObject({
      signal: 'challenge',
      total: expect.any(Number)
    });
    const progressedState = recordLegacyProgressionCycle(
      new MemoryStorage(),
      createEmptyLegacyProgressionState(),
      highScoreWithManyMistakes,
      maze
    );
    expect(progressedState.tracks.player).toMatchObject({
      lastSignal: 'challenge',
      level: '2',
      targetComplexity: 12
    });
    expect(resolveLegacyProgressionPerformanceScore(extremeDetour, complexity).signal).toBe('ease');
  });

  test('advances a low-score completed player maze while retaining its raw quality telemetry', () => {
    const storage = new MemoryStorage();
    const maze = createProgressionTestMaze();
    const initialState = createEmptyLegacyProgressionState();
    const lowScoreClear = createMazeCycleTelemetryReceipt({
      averageFrameMs: 16,
      completedAt: '2026-08-14T02:43:00.000Z',
      completionTimeMs: 90_000,
      controlMode: 'stick',
      maze,
      playerPath: maze.solutionPath,
      resetUsed: false,
      surface: 'play',
      backtracks: 7,
      wrongTurns: 7
    });

    expect(resolveLegacyProgressionPerformanceScore(lowScoreClear, resolveLegacyMazeComplexity(maze).total)).toMatchObject({
      signal: 'hold'
    });
    expect(recordLegacyProgressionCycle(storage, initialState, lowScoreClear, maze).tracks.player)
      .toMatchObject({
        lastSignal: 'challenge',
        targetComplexity: initialState.tracks.player.targetComplexity + 4
      });
  });

  test('unlocks one visible player maze level per qualifying clear, even on a slower device', () => {
    const storage = new MemoryStorage();
    const maze = createProgressionTestMaze();
    let state = createEmptyLegacyProgressionState();

    for (const [index, averageFrameMs] of [24, 30, 34].entries()) {
      state = recordLegacyProgressionCycle(storage, state, createMazeCycleTelemetryReceipt({
        averageFrameMs,
        completedAt: `2026-07-08T12:0${index}:00.000Z`,
        completionTimeMs: 8_000,
        controlMode: 'stick',
        maze,
        playerPath: maze.solutionPath,
        resetUsed: false,
        surface: 'play',
        backtracks: 0,
        wrongTurns: 0
      }), maze);
    }

    expect(state.tracks.player).toMatchObject({
      completedCycles: '3',
      lastSignal: 'challenge',
      level: '4',
      rank: 'E',
      targetComplexity: 20
    });
  });

  test('raises the player rank at the documented maze-level milestone', () => {
    const storage = new MemoryStorage();
    const maze = createProgressionTestMaze();
    let state = createEmptyLegacyProgressionState();

    for (let run = 0; run < 5; run += 1) {
      state = recordLegacyProgressionCycle(storage, state, createMazeCycleTelemetryReceipt({
        averageFrameMs: 16,
        completedAt: `2026-08-14T03:0${run}:00.000Z`,
        completionTimeMs: 8_000,
        controlMode: 'stick',
        maze,
        playerPath: maze.solutionPath,
        resetUsed: false,
        surface: 'play',
        backtracks: 0,
        wrongTurns: 0
      }), maze);
    }

    expect(state.tracks.player).toMatchObject({
      completedCycles: '5',
      level: '6',
      rank: 'D',
      targetComplexity: 28
    });
  });

  test('advances a completed player maze even after a restart without demotion', () => {
    const storage = new MemoryStorage();
    const maze = createProgressionTestMaze();
    let state = createEmptyLegacyProgressionState();
    const firstChallengeReceipt = createMazeCycleTelemetryReceipt({
      averageFrameMs: 16,
      completedAt: '2026-07-08T12:00:00.000Z',
      completionTimeMs: 8000,
      controlMode: 'stick',
      maze,
      playerPath: maze.solutionPath,
      resetUsed: false,
      surface: 'play',
      backtracks: 0,
      wrongTurns: 0
    });
    const secondChallengeReceipt = createMazeCycleTelemetryReceipt({
      averageFrameMs: 16,
      completedAt: '2026-07-08T12:01:00.000Z',
      completionTimeMs: 7600,
      controlMode: 'stick',
      maze,
      playerPath: maze.solutionPath,
      resetUsed: false,
      surface: 'play',
      backtracks: 0,
      wrongTurns: 0
    });

    state = recordLegacyProgressionCycle(storage, state, firstChallengeReceipt, maze);
    expect(state.tracks.player.targetComplexity).toBe(12);

    state = recordLegacyProgressionCycle(storage, state, secondChallengeReceipt, maze);
    expect(state.tracks.player.recentSignals).toEqual(['challenge', 'challenge']);
    expect(state.tracks.player.targetComplexity).toBe(16);
    expect(state.tracks.player.level).toBe(String(resolveLegacyProgressionLevel(16)));

    const strugglingReceipt = createMazeCycleTelemetryReceipt({
      averageFrameMs: 16,
      completedAt: '2026-07-08T12:02:00.000Z',
      completionTimeMs: 90_000,
      controlMode: 'stick',
      maze,
      playerPath: maze.solutionPath,
      resetUsed: true,
      surface: 'play',
      backtracks: 7,
      wrongTurns: 8
    });
    state = {
      ...state,
      tracks: {
        ...state.tracks,
        player: {
          ...state.tracks.player,
          recentSignals: ['ease']
        }
      }
    };

    state = recordLegacyProgressionCycle(storage, state, strugglingReceipt, maze);
    expect(state.tracks.player.recentSignals.slice(0, 2)).toEqual(['challenge', 'ease']);
    expect(state.tracks.player.targetComplexity).toBe(20);
    expect(state.tracks.player.level).toBe('4');
  });

  test('scores real maze complexity from route, shortcut, floor, and solution shape', () => {
    const simpleMaze = createProgressionTestMaze({
      width: 5,
      height: 5,
      grid: [
        [false, false, false, false, false],
        [false, true, true, true, false],
        [false, false, false, true, false],
        [false, false, false, true, false],
        [false, false, false, false, false]
      ],
      goal: { x: 3, y: 3 },
      solutionPath: [
        { x: 1, y: 1 },
        { x: 2, y: 1 },
        { x: 3, y: 1 },
        { x: 3, y: 2 },
        { x: 3, y: 3 }
      ],
      routeQualityStats: {
        bypassableRouteBands: 0,
        bypassableSolutionEdges: 0,
        meaningfulBypassableRouteBands: 0,
        meaningfulBypassableSolutionEdges: 0,
        minimumMeaningfulDetour: 2,
        routeQuality: 'single-route',
        sampledSolutionEdges: 4
      },
      shortcutsCreated: 0,
      shortcutStats: {
        requested: 0,
        attempts: 0,
        created: 0,
        wallArrayEntries: 0,
        uniqueWallCandidates: 0,
        exhaustedWallArray: false
      }
    });
    const complexMaze = createProgressionTestMaze();
    const simpleBreakdown = resolveLegacyMazeComplexity(simpleMaze);
    const complexBreakdown = resolveLegacyMazeComplexity(complexMaze);

    expect(complexBreakdown.total).toBeGreaterThan(simpleBreakdown.total);
    expect(complexBreakdown.splitCount).toBeGreaterThan(simpleBreakdown.splitCount);
    expect(complexBreakdown.splitScore).toBeGreaterThan(simpleBreakdown.splitScore);
    expect(complexBreakdown.weightedSplitPressureScore).toBeGreaterThan(simpleBreakdown.weightedSplitPressureScore);
    expect(complexBreakdown.deadEndPressureScore).toBeGreaterThanOrEqual(0);
    expect(simpleBreakdown.deadEndPressureScore).toBeGreaterThan(0);
    expect(simpleBreakdown.weightedDeadEndPressureScore).toBeGreaterThan(0);
    expect(complexBreakdown.fillQualityScore).toBeGreaterThan(0);
  });

  test('scores paired off-border paths as real wrapped complexity', () => {
    const wrappedMaze = createProgressionTestMaze({
      width: 5,
      height: 5,
      grid: [
        [false, false, false, false, false],
        [false, false, true, false, false],
        [true, true, true, true, true],
        [false, false, true, false, false],
        [false, false, false, false, false]
      ],
      start: { x: 0, y: 2 },
      goal: { x: 4, y: 2 },
      solutionPath: [
        { x: 0, y: 2 },
        { x: 4, y: 2 }
      ],
      routeQualityStats: {
        bypassableRouteBands: 0,
        bypassableSolutionEdges: 0,
        meaningfulBypassableRouteBands: 0,
        meaningfulBypassableSolutionEdges: 0,
        minimumMeaningfulDetour: 0,
        routeQuality: 'single-route',
        sampledSolutionEdges: 1
      },
      shortcutsCreated: 0,
      shortcutStats: {
        requested: 0,
        attempts: 0,
        created: 0,
        wallArrayEntries: 0,
        uniqueWallCandidates: 0,
        exhaustedWallArray: false
      }
    });
    const breakdown = resolveLegacyMazeComplexity(wrappedMaze);

    expect(breakdown.edgeWrapCount).toBe(1);
    expect(breakdown.edgeWrapScore).toBeGreaterThan(0);
    expect(breakdown.edgeWrapReliefScore).toBeGreaterThan(0);
    expect(breakdown.edgeWrapShortcutReliefScore).toBe(breakdown.edgeWrapReliefScore);
    expect(breakdown.edgeWrapChoiceScore).toBeGreaterThan(0);
    expect(breakdown.splitCount).toBeGreaterThan(0);
    expect(breakdown.weightedSplitPressureScore).toBeGreaterThan(0);
  });

  test('separates wrapped shortcut relief from wrapped choice complexity', () => {
    const directShortcutMaze = createProgressionTestMaze({
      width: 5,
      height: 5,
      grid: [
        [false, false, false, false, false],
        [false, false, false, false, false],
        [true, true, true, true, true],
        [false, false, false, false, false],
        [false, false, false, false, false]
      ],
      start: { x: 0, y: 2 },
      goal: { x: 4, y: 2 },
      solutionPath: [
        { x: 0, y: 2 },
        { x: 4, y: 2 }
      ]
    });
    const branchyWrappedMaze = createProgressionTestMaze({
      width: 5,
      height: 5,
      grid: [
        [false, false, true, false, false],
        [false, false, true, false, false],
        [true, true, true, true, true],
        [false, true, true, true, false],
        [false, false, true, false, false]
      ],
      start: { x: 0, y: 2 },
      goal: { x: 4, y: 2 },
      solutionPath: [
        { x: 0, y: 2 },
        { x: 4, y: 2 }
      ]
    });

    const directBreakdown = resolveLegacyMazeComplexity(directShortcutMaze);
    const branchyBreakdown = resolveLegacyMazeComplexity(branchyWrappedMaze);

    expect(directBreakdown.edgeWrapShortcutReliefScore).toBeGreaterThan(0);
    expect(branchyBreakdown.edgeWrapShortcutReliefScore).toBeGreaterThan(0);
    expect(branchyBreakdown.edgeWrapChoiceScore).toBeGreaterThan(directBreakdown.edgeWrapChoiceScore);
    expect(branchyBreakdown.total).toBeGreaterThan(directBreakdown.total);
  });

  test('summarizes bounded maze-level pacing without jumping target to measured complexity', () => {
    const state = createEmptyLegacyProgressionState();
    const aiTrack = state.tracks['ai-runner'];
    const pacing = summarizeLegacyProgressionPacing(aiTrack, 92);

    expect(pacing).toMatchObject({
      activeLevel: '1',
      activeRank: 'E',
      activeTargetComplexity: LEGACY_PROGRESSION_MIN_COMPLEXITY,
      complexityUntilNextLevel: 4,
      levelBaseTargetComplexity: LEGACY_PROGRESSION_MIN_COMPLEXITY,
      levelProgressPercent: 0,
      measuredMazeLevel: resolveLegacyProgressionLevel(92),
      nextChallengeTargetComplexity: LEGACY_PROGRESSION_MIN_COMPLEXITY + 4,
      nextEaseTargetComplexity: LEGACY_PROGRESSION_MIN_COMPLEXITY + 4,
      nextLevelTargetComplexity: LEGACY_PROGRESSION_MIN_COMPLEXITY + 4,
      recentChallengeCount: 0,
      recentEaseCount: 0,
      skillTrend: 'steady',
      signalWindow: []
    });
  });

  test('allows S-rank AI progression to keep leveling past the old level-44 cap', () => {
    const storage = new MemoryStorage();
    const maze = createProgressionTestMaze();
    const baseState = createEmptyLegacyProgressionState();
    let state = {
      ...baseState,
      tracks: {
        ...baseState.tracks,
        'ai-runner': {
          ...baseState.tracks['ai-runner'],
          cleanCycles: 33,
          completedCycles: '742',
          level: resolveLegacyProgressionLevel(180),
          rank: 'S' as const,
          recentSignals: ['challenge', 'challenge'],
          targetComplexity: 180
        }
      }
    };

    const createCapBreakReceipt = (completedAt: string) => createMazeCycleTelemetryReceipt({
      aiDecisionSummary: {
        backtrackCount: 1,
        decisionCount: 48,
        optionalRetargetCount: 1,
        recoveryCount: 1,
        thinkingModel: 'human-local-memory',
        visitedUndoCount: 0,
        wrongBranchCount: 2
      },
      averageFrameMs: 16,
      completedAt,
      completionTimeMs: 16_500,
      controlMode: 'stick',
      maze,
      playerPath: maze.solutionPath,
      resetUsed: false,
      surface: 'menu-demo',
      backtracks: 1,
      wrongTurns: 2
    });

    state = recordLegacyProgressionCycle(storage, state, createCapBreakReceipt('2026-07-10T08:20:00.000Z'), maze);
    state = recordLegacyProgressionCycle(storage, state, createCapBreakReceipt('2026-07-10T08:21:00.000Z'), maze);

    const aiTrack = state.tracks['ai-runner'];
    const pacing = summarizeLegacyProgressionPacing(aiTrack, resolveLegacyMazeComplexity(maze).total);

    expect(aiTrack.rank).toBe('S');
    expect(aiTrack.targetComplexity).toBeGreaterThan(180);
    expect(BigInt(aiTrack.level)).toBeGreaterThan(44n);
    expect(pacing.nextLevelTargetComplexity).toBeGreaterThan(180);
    expect(pacing.complexityUntilNextLevel).toBeGreaterThanOrEqual(0);
  });

  test('uses target complexity to tune future maze scale while player and trail stay green', () => {
    const state = createEmptyLegacyProgressionState();
    const basePalette = resolveLegacyProgressionPalette(state.tracks.player, 'player');
    // level/targetComplexity doubled from what used to represent "clearly
    // advanced" -- resolveLegacyProgressionDifficultyProfile now halves the
    // real level before picking a difficulty band, so reaching the same
    // band this test wants (comfortably past baseline, generating a maze
    // bigger than the 50 baseScale) takes roughly twice the real level.
    const advancedTrack = {
      ...state.tracks.player,
      colorTier: 4,
      level: '61',
      rank: 'A' as const,
      targetComplexity: 248
    };
    const advancedPalette = resolveLegacyProgressionPalette(advancedTrack, 'player');

    expect(basePalette.playerCoreColor).toBe(0x36ff7d);
    expect(basePalette.trailColor).toBe(0x36ff7d);
    expect(basePalette.trailPulseColor).toBe(0xf1faf6);
    expect(basePalette.trailPulseEdgeColor).toBe(0xe9fff1);
    expect(advancedPalette.playerCoreColor).toBe(0x36ff7d);
    expect(advancedPalette.trailColor).toBe(0x36ff7d);
    expect(advancedPalette.trailPulseColor).toBe(0xf1faf6);
    expect(advancedPalette.trailPulseEdgeColor).toBe(0xe9fff1);
    expect(resolveLegacyProgressionGenerationScale(50, advancedTrack)).toBeGreaterThan(50);
  });

  test('defines level-one mazes as small simple routes', () => {
    const state = createEmptyLegacyProgressionState();
    const playerTrack = state.tracks.player;
    const aiTrack = state.tracks['ai-runner'];
    const profile = resolveLegacyProgressionDifficultyProfile(aiTrack);
    const generationProfile = resolveLegacyMazeGenerationProfileForProgression(aiTrack);
    const scale = resolveLegacyProgressionGenerationScale(50, aiTrack);
    const budget = resolveLegacyGenerationBudgetContract('menu', scale, generationProfile);
    const maze = createLegacyRuntimeMazeForMode('menu', scale, 3749, generationProfile);
    const complexity = resolveLegacyMazeComplexity(maze);

    expect(playerTrack).toMatchObject({ level: '1', targetComplexity: 8 });
    expect(resolveLegacyProgressionDifficultyProfile(playerTrack)).toMatchObject({
      band: 'tutorial',
      branchPressure: 'minimal',
      deadEndPressure: 'minimal',
      expectedEdgeWraps: { horizontal: 0, vertical: 0 },
      shortcutPressure: 'off'
    });
    expect(aiTrack.level).toBe('1');
    expect(profile).toMatchObject({
      band: 'tutorial',
      branchPressure: 'minimal',
      deadEndPressure: 'minimal',
      expectedEdgeWraps: { horizontal: 0, vertical: 0 },
      fillPressure: 'open',
      shortcutPressure: 'off'
    });
    expect(scale).toBeLessThanOrEqual(35);
    expect(budget.shortcutStageEnabled).toBe(false);
    expect(budget.shortcutCount).toBe(0);
    expect(generationProfile.borderFeederTargetPerSide).toBe(0);
    expect(generationProfile.requiredOppositeBorderConnections).toEqual({ horizontal: false, vertical: false });
    expect(maze.shortcutStats?.requested).toBe(0);
    expect(complexity.edgeWrapCount).toBe(0);
  });

  test('makes the first completion a distinct starter step before resuming half-speed difficulty pacing', () => {
    const baseline = createEmptyLegacyProgressionState();
    const targets = [8, 12, 16, 20, 24];
    const playerProfiles = targets.map((targetComplexity, index) => {
      const track = {
        ...baseline.tracks.player,
        level: String(index + 1),
        targetComplexity
      };
      return {
        difficulty: resolveLegacyProgressionDifficultyProfile(track),
        generation: resolveLegacyMazeGenerationProfileForProgression(track),
        scale: resolveLegacyProgressionGenerationScale(50, track)
      };
    });
    const aiProfiles = targets.map((targetComplexity, index) => {
      const track = {
        ...baseline.tracks['ai-runner'],
        level: String(index + 1),
        targetComplexity
      };
      return {
        difficulty: resolveLegacyProgressionDifficultyProfile(track),
        generation: resolveLegacyMazeGenerationProfileForProgression(track),
        scale: resolveLegacyProgressionGenerationScale(50, track)
      };
    });

    expect(playerProfiles[0]?.difficulty.band).toBe('tutorial');
    expect(playerProfiles[1]?.difficulty.band).toBe('starter');
    expect(playerProfiles[1]).not.toEqual(playerProfiles[0]);
    expect(playerProfiles[1]?.scale).toBeGreaterThan(playerProfiles[0]?.scale ?? 0);
    expect(playerProfiles[2]).toEqual(playerProfiles[1]);
    expect(playerProfiles[3]?.generation).not.toEqual(playerProfiles[2]?.generation);
    expect(playerProfiles[4]).toEqual(playerProfiles[3]);
    expect(aiProfiles).toEqual(playerProfiles);
  });

  test('maps progression bands to increasing procedural pressure', () => {
    // Complexity values doubled (in real-level terms) from what used to hit
    // each band -- resolveLegacyProgressionDifficultyProfile now halves the
    // real level before selecting a band, so mazes get harder at half the
    // rate the player's own level number does (see its own comment for why).
    const tutorial = resolveLegacyProgressionDifficultyProfile(8);
    const starter = resolveLegacyProgressionDifficultyProfile(48);
    const explorer = resolveLegacyProgressionDifficultyProfile(120);
    const navigator = resolveLegacyProgressionDifficultyProfile(200);
    const architect = resolveLegacyProgressionDifficultyProfile(296);
    const mythic = resolveLegacyProgressionDifficultyProfile(352);

    expect([
      tutorial.band,
      starter.band,
      explorer.band,
      navigator.band,
      architect.band,
      mythic.band
    ]).toEqual(['tutorial', 'starter', 'explorer', 'navigator', 'architect', 'mythic']);
    expect(tutorial.targetScale).toBeLessThan(starter.targetScale);
    expect(starter.targetScale).toBeLessThan(explorer.targetScale);
    expect(explorer.targetScale).toBeLessThan(navigator.targetScale);
    expect(navigator.targetScale).toBeLessThan(architect.targetScale);
    expect(architect.targetScale).toBeLessThan(mythic.targetScale);
    expect(mythic.expectedEdgeWraps.horizontal).toBeGreaterThan(tutorial.expectedEdgeWraps.horizontal);
    expect(mythic.expectedEdgeWraps.vertical).toBeGreaterThan(tutorial.expectedEdgeWraps.vertical);
  });

  test('turns higher difficulty bands into stronger generation pressure', () => {
    const tutorialProfile = resolveLegacyMazeGenerationProfileForProgression(8);
    // 352, not the 180 this used to be -- resolveLegacyMazeGenerationProfileForProgression
    // now halves the real level before picking a band, so it takes twice the
    // real level to reach mythic.
    const mythicProfile = resolveLegacyMazeGenerationProfileForProgression(352);
    const tutorialBudget = resolveLegacyGenerationBudgetContract('menu', 29, tutorialProfile);
    const mythicBudget = resolveLegacyGenerationBudgetContract('menu', 96, mythicProfile);
    const mythicMaze = createLegacyRuntimeMazeForMode('menu', 96, 3749, mythicProfile);
    const mythicComplexity = resolveLegacyMazeComplexity(mythicMaze);

    expect(tutorialBudget.shortcutCount).toBe(0);
    expect(mythicProfile.checkpointCountMultiplier).toBeGreaterThan(tutorialProfile.checkpointCountMultiplier);
    expect(mythicProfile.shortcutCountMultiplier).toBeGreaterThan(tutorialProfile.shortcutCountMultiplier);
    expect(mythicProfile.routeQualityReinforcementMultiplier).toBeGreaterThan(tutorialProfile.routeQualityReinforcementMultiplier);
    expect(mythicProfile.borderFeederTargetPerSide).toBeGreaterThan(tutorialProfile.borderFeederTargetPerSide ?? 0);
    expect(mythicBudget.checkpointCount).toBeGreaterThan(tutorialBudget.checkpointCount);
    expect(mythicBudget.shortcutCount).toBeGreaterThan(0);
    expect(mythicBudget.shortcutStageEnabled).toBe(true);
    expect(mythicComplexity.edgeWrapCount).toBeGreaterThanOrEqual(2);
  });

  test('keeps player and trail progression colors distinct from the pale maze path', () => {
    const state = createEmptyLegacyProgressionState();
    const pathCore = 0xe7fff4;
    const colorDistance = (color: number): number => {
      const colorR = (color >> 16) & 0xff;
      const colorG = (color >> 8) & 0xff;
      const colorB = color & 0xff;
      const pathR = (pathCore >> 16) & 0xff;
      const pathG = (pathCore >> 8) & 0xff;
      const pathB = pathCore & 0xff;
      return Math.sqrt(
        ((colorR - pathR) ** 2)
        + ((colorG - pathG) ** 2)
        + ((colorB - pathB) ** 2)
      );
    };

    for (let colorTier = 0; colorTier < 6; colorTier += 1) {
      const palette = resolveLegacyProgressionPalette({
        ...state.tracks.player,
        colorTier
      }, 'player');

      expect(colorDistance(palette.playerCoreColor)).toBeGreaterThanOrEqual(145);
      expect(colorDistance(palette.trailColor)).toBeGreaterThanOrEqual(145);
      expect(palette.trailPulseColor).toBe(0xf1faf6);
      expect(palette.trailPulseEdgeColor).toBe(0xe9fff1);
    }
  });

  test('keeps large progression ordinals readable while surfacing completed cycles', () => {
    const state = createEmptyLegacyProgressionState();
    const maxedTrack = {
      ...state.tracks['ai-runner'],
      completedCycles: '5180',
      level: '5181',
      rank: 'S' as const,
      targetComplexity: LEGACY_PROGRESSION_MAX_COMPLEXITY
    };
    const palette = resolveLegacyProgressionPalette(maxedTrack, 'ai-runner');

    expect(palette.label).toBe('AI Skill Lv 5181 Rank S Runs 5180');
    expect(palette.label).not.toContain('S400');
    expect(palette.label).not.toContain('R:');
  });

  test('caps progression maze scale with the same snapped mobile render math as the board', () => {
    const state = createEmptyLegacyProgressionState();
    const maxedTrack = {
      ...state.tracks['ai-runner'],
      targetComplexity: LEGACY_PROGRESSION_MAX_COMPLEXITY
    };
    const phoneViewport = { width: 365, height: 863 };
    const narrowViewport = { width: 332, height: 958 };
    const normalPhoneViewport = { width: 405, height: 958 };
    const unrestrictedScale = resolveLegacyProgressionGenerationScale(50, maxedTrack);
    const viewportCap = resolveLegacyProgressionViewportScaleCap({
      surface: 'menu-demo',
      viewport: phoneViewport
    });
    const narrowViewportCap = resolveLegacyProgressionViewportScaleCap({
      surface: 'menu-demo',
      viewport: narrowViewport
    });
    const normalPhoneViewportCap = resolveLegacyProgressionViewportScaleCap({
      surface: 'menu-demo',
      viewport: normalPhoneViewport
    });
    const playViewportCap = resolveLegacyProgressionViewportScaleCap({
      surface: 'play',
      viewport: narrowViewport
    });
    const phoneScale = resolveLegacyProgressionGenerationScale(50, maxedTrack, {
      surface: 'menu-demo',
      viewport: phoneViewport
    });
    const narrowScale = resolveLegacyProgressionGenerationScale(50, maxedTrack, {
      surface: 'menu-demo',
      viewport: narrowViewport
    });

    expect(LEGACY_PROGRESSION_MENU_MIN_TILE_PX).toBeGreaterThanOrEqual(5.3);
    expect(LEGACY_PROGRESSION_PHONE_MENU_TARGET_TILE_PX).toBe(8);
    expect(LEGACY_PROGRESSION_PLAY_MIN_TILE_PX).toBeGreaterThanOrEqual(5.2);
    expect(unrestrictedScale).toBeGreaterThan(viewportCap);
    expect(phoneScale).toBe(viewportCap);
    expect(narrowScale).toBe(narrowViewportCap);
    expect(narrowScale).toBe(50);
    expect(phoneScale).toBe(50);
    expect(normalPhoneViewportCap).toBe(50);
    expect(playViewportCap).toBeGreaterThan(narrowViewportCap);

    const normalPhoneLayout = resolveLegacyMenuLayout(
      normalPhoneViewport.width,
      normalPhoneViewport.height,
      50,
      normalPhoneViewportCap,
      normalPhoneViewportCap,
      'menu'
    );
    expect(normalPhoneLayout.tileSize).toBeCloseTo(7.34, 2);
    expect(normalPhoneLayout.boardLeft).toBeGreaterThanOrEqual(4);
    expect(normalPhoneLayout.boardLeft + normalPhoneLayout.boardWidth).toBeLessThanOrEqual(normalPhoneViewport.width - 4);

    for (const targetComplexity of [0, 20, 40, 60, 80, 100, 120, 140, 160, 180, 220, 300, LEGACY_PROGRESSION_MAX_COMPLEXITY]) {
      const scale = resolveLegacyProgressionGenerationScale(50, {
        ...maxedTrack,
        targetComplexity
      }, {
        surface: 'menu-demo',
        viewport: normalPhoneViewport
      });
      const layout = resolveLegacyMenuLayout(
        normalPhoneViewport.width,
        normalPhoneViewport.height,
        50,
        scale,
        scale,
        'menu'
      );

      // The menu board now reserves roughly one tile of bleed margin, which
      // is sized in tile units -- so boardWidth/boardLeft track the cell
      // count (via scale) instead of staying pixel-identical across every
      // targetComplexity in this loop the way they did before that margin
      // was tile-proportional. Assert the relationship instead of a single
      // fixed pixel value.
      expect(layout.tileSize).toBeGreaterThanOrEqual(7.0);
      expect(layout.boardLeft).toBeGreaterThanOrEqual(4);
      expect(layout.boardLeft).toBeGreaterThan(layout.tileSize * 0.5);
      expect(layout.boardLeft).toBeLessThan(layout.tileSize * 2);
      expect(layout.boardLeft + layout.boardWidth).toBeLessThanOrEqual(normalPhoneViewport.width - 4);
    }
  });

  test('summarizes diagnostics without exposing full cycle path history', () => {
    const maze = createProgressionTestMaze();
    const state = createEmptyLegacyProgressionState();
    const diagnostics = summarizeLegacyProgressionDiagnostics(state, 'ai-runner', maze);

    expect(diagnostics).toMatchObject({
      activeTrackId: 'ai-runner',
      storageKey: LEGACY_PROGRESSION_STORAGE_KEY,
      tracks: {
        player: {
          completedCycles: '0'
        },
        'ai-runner': {
          completedCycles: '0'
        }
      }
    });
    expect(diagnostics.complexity.total).toBe(resolveLegacyMazeComplexity(maze).total);
    expect(diagnostics.difficultyProfile.band).toBe('tutorial');
    expect(diagnostics.generationReview).toMatchObject({
      measuredComplexity: diagnostics.complexity.total,
      profileBand: 'tutorial',
      targetComplexity: state.tracks['ai-runner'].targetComplexity,
      tolerance: 8
    });
    expect(['under-target', 'on-target', 'over-target']).toContain(diagnostics.generationReview.delivery);
    expect(diagnostics.generationReview.difference).toBe(
      diagnostics.complexity.total - state.tracks['ai-runner'].targetComplexity
    );
    expect(diagnostics.palette.label.startsWith('AI Skill Lv ')).toBe(true);
    expect(diagnostics.pacing.activeLevel).toBe('1');
    expect(diagnostics.pacing.measuredMazeComplexity).toBe(diagnostics.complexity.total);
  });
});
