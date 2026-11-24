import { afterEach, describe, expect, test, vi } from 'vitest';
import { MenuScene } from '../../src/scenes/MenuScene';
import { createLegacyAuthScopedStorage, createLegacyGuestAuthSnapshot } from '../../src/legacy-runtime/legacyAuth';
import {
  consumeLegacyGenerationRequestState,
  createLegacyGenerationRequest,
  type LegacyGenerationMode
} from '../../src/legacy-runtime/legacyGenerationLifecycle';
import {
  resolveLegacyGenerationTrack,
  resolveLegacyGenerationTrackId
} from '../../src/legacy-runtime/legacyMenuDemoTrack';
import {
  createEmptyLegacyProgressionState,
  LEGACY_PROGRESSION_STORAGE_KEY,
  resolveLegacyProgressionLevel,
  type LegacyProgressionState,
  type LegacyProgressionTrack
} from '../../src/legacy-runtime/legacyProgression';
import { mergeLegacyProgressionStateAdvancements } from '../../src/legacy-runtime/legacyRemoteProgression';
import type { LegacyMazeGenerationProfile, LegacyMazeSnapshot } from '../../src/legacy-runtime/legacyMaze';
import type { MazeCycleTelemetryHistory } from '../../src/legacy-runtime/mazeCycleTelemetry';

vi.mock('phaser', () => ({
  default: {
    AUTO: 'AUTO',
    Math: {
      Clamp: (value: number, min: number, max: number) => Math.max(min, Math.min(max, value)),
      Linear: (from: number, to: number, t: number) => from + ((to - from) * t)
    },
    Scale: { RESIZE: 'RESIZE', CENTER_BOTH: 'CENTER_BOTH' },
    Scene: class {}
  }
}));

class MemoryStorage {
  public readonly values = new Map<string, string>();
  public getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }
  public setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

type SceneMethod = (this: MenuDemoSceneHarness, ...args: never[]) => unknown;
const proto = MenuScene.prototype as unknown as Record<string, SceneMethod>;

interface MenuDemoSceneHarness {
  authSnapshot: ReturnType<typeof createLegacyGuestAuthSnapshot>;
  maze: LegacyMazeSnapshot;
  mazeCycleTelemetryHistory: MazeCycleTelemetryHistory;
  mazeSeed: number;
  menuDemoCompletedAtMs: number | null;
  menuDemoConfig: null;
  menuDemoCycleRecorded: boolean;
  menuDemoCycleStartedAtMs: number;
  menuDemoEpisode: null;
  progressionState: LegacyProgressionState;
  settings: { controlMode: 'stick'; scale: number };
  time: { now: number };
  trail: LegacyMazeSnapshot['solutionPath'];
  playCyclePath: LegacyMazeSnapshot['solutionPath'];
  playCompletedAtMs: number;
  playCycleResetUsed: boolean;
  playStartedAtMs: number;
  publishLegacyRemoteSyncException: ReturnType<typeof vi.fn>;
  publishLegacyRemoteSyncResult: ReturnType<typeof vi.fn>;
  syncLegacyRemoteProgressionState: ReturnType<typeof vi.fn>;
  pushLegacyPlayerMessage: ReturnType<typeof vi.fn>;
  offlineCompletionFlush: null;
  authAccountHydrationSequence: number;
  resolveBrowserLocalStorage: () => MemoryStorage;
  resolveLegacyProgressionStorage: () => MemoryStorage;
  resolveMazeCycleTelemetryStorage: () => MemoryStorage;
  resolveRuntimeAverageFrameMs: () => number;
  resolveLegacyBoardAspectRatioForMode: () => number;
  resolveLegacyProgressionScaleOptionsForMode: (mode: LegacyGenerationMode) => object;
  resolveLegacyProgressionScaleForMode: (mode: LegacyGenerationMode) => number;
  resolveLegacyMazeGenerationProfileForMode: (mode: LegacyGenerationMode) => Partial<LegacyMazeGenerationProfile>;
  resolveLegacyTargetComplexityForMode: (mode: LegacyGenerationMode) => number;
  createFreshLegacyMenuGenerationSeed: () => number;
  createFreshLegacyPlayGenerationSeed: () => number;
  recordMazeCycleCompletion: (surface: 'menu-demo' | 'play') => void;
}

const bindScene = (scene: MenuDemoSceneHarness): void => {
  for (const name of [
    'recordMazeCycleCompletion',
    'resolveLegacyProgressionScaleForMode',
    'resolveLegacyMazeGenerationProfileForMode',
    // MAZER-UI-101: the play profile asks the scene for the full-height grid growth, which reads this.
    'resolveLegacyBrowserMobileParity',
    'resolveLegacyTargetComplexityForMode',
    'createFreshLegacyMenuGenerationSeed',
    'createFreshLegacyPlayGenerationSeed'
  ]) {
    (scene as unknown as Record<string, unknown>)[name] = (...args: never[]) => proto[name]!.call(scene, ...args);
  }
};

// Phone-sized viewport, the same shape resolveLegacyProgressionScaleOptionsForMode builds
// in the real scene (it only differs by reading the live Phaser scale manager).
const createScene = (progressionState = createEmptyLegacyProgressionState()): MenuDemoSceneHarness => {
  const storage = new MemoryStorage();
  const scene = {
    authAccountHydrationSequence: 0,
    authSnapshot: createLegacyGuestAuthSnapshot(),
    maze: undefined as unknown as LegacyMazeSnapshot,
    mazeCycleTelemetryHistory: { receipts: [], version: 1 },
    mazeSeed: 1,
    menuDemoCompletedAtMs: null,
    menuDemoConfig: null,
    menuDemoCycleRecorded: false,
    menuDemoCycleStartedAtMs: 0,
    menuDemoEpisode: null,
    offlineCompletionFlush: null,
    playCompletedAtMs: 0,
    playCyclePath: [],
    playCycleResetUsed: false,
    playStartedAtMs: 0,
    progressionState,
    publishLegacyRemoteSyncException: vi.fn(),
    publishLegacyRemoteSyncResult: vi.fn(),
    pushLegacyPlayerMessage: vi.fn(),
    resolveBrowserLocalStorage: () => storage,
    resolveLegacyBoardAspectRatioForMode: () => 25 / 51,
    resolveLegacyProgressionScaleOptionsForMode: (mode: LegacyGenerationMode) => ({
      surface: mode === 'play' ? 'play' : 'menu-demo',
      viewport: { width: 390, height: 844, useFloatingTouchControls: true }
    }),
    resolveLegacyProgressionStorage: () => storage,
    resolveMazeCycleTelemetryStorage: () => storage,
    resolveRuntimeAverageFrameMs: () => 16,
    settings: { controlMode: 'stick' as const, scale: 50 },
    syncLegacyRemoteProgressionState: vi.fn(),
    time: { now: 10_000 },
    trail: []
  } as unknown as MenuDemoSceneHarness;
  bindScene(scene);
  return scene;
};

// The same resolver chain MenuScene.rebuildMaze / the menu-demo-goal-reset request runs.
const generateMenuMaze = (scene: MenuDemoSceneHarness): LegacyMazeSnapshot => {
  const mode: LegacyGenerationMode = 'menu';
  const scale = scene.resolveLegacyProgressionScaleForMode(mode);
  const request = createLegacyGenerationRequest({
    aspectRatio: scene.resolveLegacyBoardAspectRatioForMode(),
    currentSeed: scene.mazeSeed,
    dueAtMs: scene.time.now,
    generationProfile: scene.resolveLegacyMazeGenerationProfileForMode(mode),
    mode,
    queuedAtMs: scene.time.now,
    reason: 'menu-demo-goal-reset',
    scale,
    seedOverride: scene.createFreshLegacyMenuGenerationSeed(),
    targetComplexity: scene.resolveLegacyTargetComplexityForMode(mode)
  });
  const maze = consumeLegacyGenerationRequestState(request, request.budget.scale).maze;
  scene.maze = maze;
  scene.mazeSeed = maze.seed;
  return maze;
};

const completeMenuDemoCycle = (scene: MenuDemoSceneHarness, completionIndex: number): void => {
  vi.setSystemTime(new Date(Date.UTC(2026, 10, 11, 12, 0, 0, completionIndex)));
  scene.trail = scene.maze.solutionPath;
  scene.menuDemoCompletedAtMs = scene.time.now + 9_000;
  scene.menuDemoCycleRecorded = false;
  scene.recordMazeCycleCompletion('menu-demo');
};

// Level 1 is one straight line: every floor tile shares a single row or a single column.
const isStraightCorridor = (maze: LegacyMazeSnapshot): boolean => {
  const floors: Array<{ x: number; y: number }> = [];
  maze.grid.forEach((row, y) => row.forEach((cell, x) => {
    if (cell) {
      floors.push({ x, y });
    }
  }));
  return floors.length > 0
    && (floors.every((tile) => tile.x === floors[0]!.x) || floors.every((tile) => tile.y === floors[0]!.y));
};
const gridKey = (maze: LegacyMazeSnapshot): string => maze.grid.map((row) => row.map((c) => (c ? '1' : '0')).join('')).join('/');

const withTrackLevel = (track: LegacyProgressionTrack, level: number): LegacyProgressionTrack => ({
  ...track,
  completedCycles: String(level - 1),
  level: String(level),
  peakComplexity: 8 + (level - 1) * 4,
  targetComplexity: 8 + (level - 1) * 4
});

describe('menu demo uses the independent ai-runner track (MAZER-FLOW-007)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('maps play to the player track and the menu demo to the ai-runner track', () => {
    expect(resolveLegacyGenerationTrackId('play')).toBe('player');
    expect(resolveLegacyGenerationTrackId('menu')).toBe('ai-runner');
    const state = createEmptyLegacyProgressionState();
    expect(resolveLegacyGenerationTrack(state, 'play')).toBe(state.tracks.player);
    expect(resolveLegacyGenerationTrack(state, 'menu')).toBe(state.tracks['ai-runner']);
  });

  test('two consecutive menu cycles climb ai-runner level 1 -> 2 and show a different, non-corridor maze', () => {
    const scene = createScene();
    vi.useFakeTimers();
    try {
      // Fresh install: ai-runner level 1 -> the straight corridor.
      expect(scene.progressionState.tracks['ai-runner'].level).toBe('1');
      const first = generateMenuMaze(scene);
      expect(isStraightCorridor(first)).toBe(true);

      completeMenuDemoCycle(scene, 0);
      expect(scene.progressionState.tracks['ai-runner']).toMatchObject({ completedCycles: '1', level: '2' });
      // The player track did not move: the demo no longer reads or advances it.
      expect(scene.progressionState.tracks.player).toMatchObject({ completedCycles: '0', level: '1' });

      scene.time.now += 20_000;
      const second = generateMenuMaze(scene);
      expect(isStraightCorridor(second)).toBe(false);
      expect(gridKey(second)).not.toBe(gridKey(first));
      expect(second.seed).not.toBe(first.seed);

      completeMenuDemoCycle(scene, 1);
      expect(scene.progressionState.tracks['ai-runner'].level).toBe('3');
      expect(scene.progressionState.tracks.player.level).toBe('1');
      scene.time.now += 20_000;
      const third = generateMenuMaze(scene);
      expect(gridKey(third)).not.toBe(gridKey(second));
    } finally {
      vi.useRealTimers();
    }
  });

  test('play generation ignores the ai-runner track entirely', () => {
    // The seed mixes in Math.random; pin it so the seed is comparable too.
    vi.spyOn(Math, 'random').mockReturnValue(0.25);
    const playOf = (state: LegacyProgressionState) => {
      const scene = createScene(state);
      return {
        profile: scene.resolveLegacyMazeGenerationProfileForMode('play'),
        scale: scene.resolveLegacyProgressionScaleForMode('play'),
        target: scene.resolveLegacyTargetComplexityForMode('play'),
        seed: scene.createFreshLegacyPlayGenerationSeed()
      };
    };
    const base = createEmptyLegacyProgressionState();
    const highAi: LegacyProgressionState = {
      ...base,
      tracks: { ...base.tracks, 'ai-runner': withTrackLevel(base.tracks['ai-runner'], 40) }
    };

    expect(playOf(highAi)).toEqual(playOf(base));

    // ...while the same change to the ai-runner track does move the menu demo.
    const menuTarget = (state: LegacyProgressionState) => createScene(state).resolveLegacyTargetComplexityForMode('menu');
    expect(menuTarget(highAi)).toBeGreaterThan(menuTarget(base));
    expect(menuTarget(highAi)).toBe(highAi.tracks['ai-runner'].targetComplexity);
    expect(createScene(base).resolveLegacyMazeGenerationProfileForMode('menu')).toMatchObject({ layout: 'corridor' });
    expect(createScene(highAi).resolveLegacyMazeGenerationProfileForMode('menu')).not.toMatchObject({ layout: 'corridor' });
  });

  test('a player at a high level does not change the menu demo, which still starts at the ai-runner level', () => {
    const base = createEmptyLegacyProgressionState();
    const highPlayer: LegacyProgressionState = {
      ...base,
      tracks: { ...base.tracks, player: withTrackLevel(base.tracks.player, 30) }
    };
    const scene = createScene(highPlayer);
    expect(scene.resolveLegacyTargetComplexityForMode('menu')).toBe(base.tracks['ai-runner'].targetComplexity);
    expect(isStraightCorridor(generateMenuMaze(scene))).toBe(true);
    expect(scene.resolveLegacyTargetComplexityForMode('play')).toBe(highPlayer.tracks.player.targetComplexity);
  });

  test('the menu demo seed salt moves with each completed ai-runner cycle, not the player track', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.25);
    const base = createEmptyLegacyProgressionState();
    const aiAdvanced: LegacyProgressionState = {
      ...base,
      tracks: { ...base.tracks, 'ai-runner': withTrackLevel(base.tracks['ai-runner'], 5) }
    };
    const playerAdvanced: LegacyProgressionState = {
      ...base,
      tracks: { ...base.tracks, player: withTrackLevel(base.tracks.player, 5) }
    };
    const seedFor = (state: LegacyProgressionState) => createScene(state).createFreshLegacyMenuGenerationSeed();
    expect(seedFor(playerAdvanced)).toBe(seedFor(base));
    expect(seedFor(aiAdvanced)).not.toBe(seedFor(base));
  });

  test('picks up the ai-runner level after a remote merge and falls back to level 1 after a reset', () => {
    const local = createEmptyLegacyProgressionState();
    const remote: LegacyProgressionState = {
      ...local,
      tracks: { ...local.tracks, 'ai-runner': withTrackLevel(local.tracks['ai-runner'], 52) }
    };
    const scene = createScene(mergeLegacyProgressionStateAdvancements(remote, local));
    expect(resolveLegacyGenerationTrack(scene.progressionState, 'menu').level).toBe('52');
    expect(scene.resolveLegacyTargetComplexityForMode('menu')).toBe(8 + 51 * 4);
    expect(resolveLegacyProgressionLevel(scene.resolveLegacyTargetComplexityForMode('menu'))).toBe(52);

    scene.progressionState = createEmptyLegacyProgressionState();
    expect(resolveLegacyGenerationTrack(scene.progressionState, 'menu').level).toBe('1');
    expect(scene.resolveLegacyMazeGenerationProfileForMode('menu')).toMatchObject({ layout: 'corridor' });
  });
});

// L4 (2026-11-19): signed in, the demo follows the player's level for the session only.
describe('signed-in menu demo follows the player level for the session (L4)', () => {
  const USER_ID = 'menu-demo-session-user';

  const persisted = (playerLevel: number, aiLevel: number): LegacyProgressionState => {
    const base = createEmptyLegacyProgressionState();
    return {
      ...base,
      tracks: {
        player: withTrackLevel(base.tracks.player, playerLevel),
        'ai-runner': withTrackLevel(base.tracks['ai-runner'], aiLevel)
      }
    };
  };

  const bootScene = (storage: MemoryStorage, signedIn: boolean): MenuDemoSceneHarness & Record<string, unknown> => {
    const scene = createScene() as MenuDemoSceneHarness & Record<string, unknown>;
    scene.authSnapshot = signedIn
      ? { ...createLegacyGuestAuthSnapshot(), status: 'authenticated', userId: USER_ID }
      : createLegacyGuestAuthSnapshot();
    scene.levelPreviewLevel = null;
    scene.menuDemoSession = null;
    scene.resolveBrowserLocalStorage = () => storage;
    for (const name of ['loadPersistedLegacyProgressionState', 'applyLegacyMenuDemoSessionTo', 'resolveLegacyProgressionStorage']) {
      scene[name] = (...args: never[]) => proto[name]!.call(scene, ...args);
    }
    (scene.loadPersistedLegacyProgressionState as () => void)();
    return scene;
  };

  const scopedStorage = (storage: MemoryStorage, userId: string | null) => (
    createLegacyAuthScopedStorage(storage, LEGACY_PROGRESSION_STORAGE_KEY, { userId })!
  );
  const readStored = (storage: MemoryStorage, userId: string | null): LegacyProgressionState => (
    JSON.parse(scopedStorage(storage, userId).getItem(LEGACY_PROGRESSION_STORAGE_KEY)!) as LegacyProgressionState
  );

  test('starts on the player level, climbs in memory, never writes, and resets on the next open', () => {
    const storage = new MemoryStorage();
    scopedStorage(storage, USER_ID).setItem(LEGACY_PROGRESSION_STORAGE_KEY, JSON.stringify(persisted(6, 30)));
    const scene = bootScene(storage, true);
    vi.useFakeTimers();
    try {
      expect(scene.progressionState.tracks['ai-runner'].level).toBe('6');
      expect(scene.resolveLegacyTargetComplexityForMode('menu')).toBe(scene.progressionState.tracks.player.targetComplexity);

      generateMenuMaze(scene);
      completeMenuDemoCycle(scene, 0);
      expect(scene.progressionState.tracks['ai-runner'].level).toBe('7');
      expect(scene.progressionState.tracks.player.level).toBe('6');
      expect((scene.menuDemoSession as { track: LegacyProgressionTrack }).track.level).toBe('7');

      // Nothing about the demo reached storage, and nothing was queued for the account.
      const stored = readStored(storage, USER_ID);
      expect(stored.tracks['ai-runner'].level).toBe('30');
      expect(stored.tracks.player.level).toBe('6');
      expect([...storage.values.keys()].some((key) => key.includes('remote-completion-outbox'))).toBe(false);

      // Next open: the demo is back on the player's level.
      expect(bootScene(storage, true).progressionState.tracks['ai-runner'].level).toBe('6');
    } finally {
      vi.useRealTimers();
    }
  });

  test('signed out keeps today\'s persisted, climbing demo', () => {
    const storage = new MemoryStorage();
    scopedStorage(storage, null).setItem(LEGACY_PROGRESSION_STORAGE_KEY, JSON.stringify(persisted(6, 30)));
    const scene = bootScene(storage, false);
    vi.useFakeTimers();
    try {
      expect(scene.menuDemoSession).toBeNull();
      expect(scene.progressionState.tracks['ai-runner'].level).toBe('30');
      generateMenuMaze(scene);
      completeMenuDemoCycle(scene, 0);
      expect(scene.progressionState.tracks['ai-runner'].level).toBe('31');
      expect(readStored(storage, null).tracks['ai-runner'].level).toBe('31');
    } finally {
      vi.useRealTimers();
    }
  });
});
