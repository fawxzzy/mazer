import { readFileSync } from 'node:fs';
import { describe, expect, test, vi } from 'vitest';
import { MenuScene } from '../../src/scenes/MenuScene';
import { LegacyDirectionalIntentResolver } from '../../src/legacy-runtime/legacyDirectionalIntent';
import { resolveLegacyHazardStepDelta } from '../../src/legacy-runtime/legacyHazardGateController';
import { createHazardOnboarding } from '../../src/legacy-runtime/legacyHazardOnboarding';
import type { LegacyInFlowNoticeHost } from '../../src/legacy-runtime/legacyInFlowNoticeHost';
import type { LegacyMazeSnapshot, LegacyPoint } from '../../src/legacy-runtime/legacyMaze';
import { resolveShardFirstLevel, seedHazardPreviewStorage, SHARD_HINT_KEYS } from '../../src/legacy-runtime/legacyShardHint';
import { HAZARD_EXPOSURE_STORAGE_KEY } from '../../src/legacy-runtime/legacyHazardOnboarding';
import { GEOMETRY_BUDGET_SATURATION_LEVEL } from '../../src/legacy-runtime/legacyGeometryBudget';
import { resolveLegacyHazardOverlay } from '../../src/legacy-runtime/legacyHazardOverlay';
import { runLegacyMazeGenerationJob } from '../../src/legacy-runtime/legacyMazeGenerationJob';
import { createLegacyShardRun, type LegacyShardInstallOptions } from '../../src/legacy-runtime/legacyShardRun';
import { ShardPlayPresenter, type ShardFrameInput } from '../../src/render/shardPlayPresenter';
import { createLadderJobInput, findGateFixture, PHONE_ASPECT } from './legacy-hazard-gate-fixture';

vi.mock('phaser', () => ({
  default: {
    AUTO: 'AUTO',
    Math: { Clamp: (v: number, a: number, b: number) => Math.max(a, Math.min(b, v)), Linear: (a: number, b: number, t: number) => a + ((b - a) * t) },
    Scale: { RESIZE: 'RESIZE', CENTER_BOTH: 'CENTER_BOTH' },
    Scene: class {}
  }
}));

// The presenter's paint layers need a real Phaser scene; these tests check its state, so the paint is a no-op.
vi.mock('../../src/render/shardSceneLayer', () => ({
  ShardSceneLayer: class {
    boardGraphics = {};
    unlockedAtMs: number | null = null;
    reset(): void { this.unlockedAtMs = null; }
    noteCollected(): void {}
    noteUnlocked(nowMs: number): void { this.unlockedAtMs = nowMs; }
    drawBoard(): void {}
    drawHud(): void {}
    goalVisual(): null { return null; }
    isAnimating(): boolean { return false; }
    destroy(): void {}
  }
}));
vi.mock('../../src/render/coachMarkView', () => ({
  CoachMarkView: class {
    ringGraphics = {};
    draw(): void {}
    destroy(): void {}
  }
}));

/*
 * H8 shards UI v1 in the REAL MenuScene methods on a stub scene (like legacy-hazard-gate-scene.test.ts): the flag
 * gate, the locked end star in the move path, pause > Reset level, and the first-time hint's show-once record.
 */

type Scene = Record<string, unknown> & {
  player: LegacyPoint;
  trail: LegacyPoint[];
  time: { now: number; delayedCall: (delay: number, callback: () => void) => { remove: () => void } };
  calls: Record<string, number>;
};

const proto = MenuScene.prototype as unknown as Record<string, (...args: unknown[]) => unknown>;
const call = <T>(scene: Scene, name: string, ...args: unknown[]): T => proto[name]!.call(scene, ...args) as T;

const createScene = (shards: Record<string, unknown> | null) => {
  const { maze } = findGateFixture(10, undefined, { needWait: true });
  const calls: Record<string, number> = {};
  const count = (name: string) => () => { calls[name] = (calls[name] ?? 0) + 1; };
  const scene = Object.create(MenuScene.prototype) as Scene;
  Object.assign(scene, {
    calls,
    mode: 'play',
    overlay: 'none',
    maze,
    mazeSeed: maze.seed,
    player: { ...maze.start },
    trail: [{ ...maze.start }],
    playCompletedAtMs: null,
    playStartedAtMs: 0,
    hasPlayerEverLeftStart: false,
    hazardLab: null,
    hazardGates: null,
    hazardGateEjecting: false,
    shards,
    legacyWorldTurnMove: null,
    legacyWorldTurnCommandSequence: 0,
    playDirectionalIntent: new LegacyDirectionalIntentResolver(),
    playMoveFlags: { up: false, down: false, left: false, right: false },
    playMoveTimer: null,
    time: { now: 1000, delayedCall: () => ({ remove: () => undefined }) },
    isLegacyPlayLifecycleInputLocked: () => false,
    prefersLegacyReducedMotion: () => true,
    resolveLegacyPlayMovementSpeedProfile: () => ({ repeatIntervalMs: 100 }),
    synchronizeLegacyPlayDirectionalIntent(this: Scene) { (this.playDirectionalIntent as LegacyDirectionalIntentResolver).synchronize([]); },
    publishInteractionDiagnostics: () => undefined,
    armLegacyWallBump: count('wallBump'),
    armLegacyPlayerVisualMotion: () => undefined,
    resolveLegacyPlayerVisualMoveDurationMs: () => 0,
    appendLegacyPlayCyclePoint: () => undefined,
    noteLegacyShardArrival: () => undefined,
    recordMazeCycleCompletion: count('completion'),
    noteHazardMomentsLevelCleared: count('cleared'),
    armLegacyPlayerTransferEnergy: () => undefined,
    precomputeLegacyDeconstructResetMaze: () => undefined,
    schedulePlayResetReturn: () => undefined,
    triggerLegacyHapticPulse: () => undefined,
    playLegacySoundEffect: () => undefined
  });
  scene.legacyWorldTurnHost = call(scene, 'createLegacyWorldTurnHost');
  return { scene, maze, calls };
};

/** Shortest open-cell path from the start to the goal (breadth-first over the grid). */
const pathToGoal = (maze: LegacyMazeSnapshot): LegacyPoint[] => {
  const key = (p: LegacyPoint) => `${p.x},${p.y}`;
  const from = new Map<string, LegacyPoint | null>([[key(maze.start), null]]);
  const queue: LegacyPoint[] = [{ x: maze.start.x, y: maze.start.y }];
  while (queue.length > 0) {
    const at = queue.shift()!;
    if (at.x === maze.goal.x && at.y === maze.goal.y) break;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const next = { x: at.x + dx, y: at.y + dy };
      if (from.has(key(next)) || resolveLegacyHazardStepDelta(maze, at, next) === null) continue;
      from.set(key(next), at);
      queue.push(next);
    }
  }
  const path: LegacyPoint[] = [];
  for (let p: LegacyPoint | null | undefined = { x: maze.goal.x, y: maze.goal.y }; p; p = from.get(key(p))) path.unshift(p);
  return path;
};

const walk = (scene: Scene, path: readonly LegacyPoint[]): void => {
  for (const target of path.slice(1)) {
    const delta = resolveLegacyHazardStepDelta(scene.maze as LegacyMazeSnapshot, scene.player, target)!;
    expect(call<boolean>(scene, 'tryMovePlayerFromInput', delta.deltaX, delta.deltaY, { releaseAfterStep: true })).toBe(true);
    scene.time.now += 200;
  }
};

describe('shards in the real MenuScene (H8 UI v1)', () => {
  test('flag gate: the presenter is built only from the hazard lab runtime, in exactly one place', () => {
    const source = readFileSync(new URL('../../src/scenes/MenuScene.ts', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
    expect(source.match(/new ShardPlayPresenter\(/g)).toHaveLength(1);
    // Removing the `this.hazardLab?.runtime ?` guard (flag-off play would then build shards) fails here.
    expect(source).toMatch(/this\.shards = this\.hazardLab\?\.runtime\n\s+\? new ShardPlayPresenter\([^\n]*\n\s+: null;/);
  });

  test('a locked end star does not finish the level; the same walk finishes it once unlocked', () => {
    const shards = { goalLocked: true };
    const { scene, maze, calls } = createScene(shards);
    const path = pathToGoal(maze);
    expect(path.length).toBeGreaterThan(1);
    walk(scene, path);
    expect(scene.player).toEqual({ x: maze.goal.x, y: maze.goal.y });
    expect(calls.completion ?? 0).toBe(0);
    expect(calls.cleared ?? 0).toBe(0);
    expect(scene.playCompletedAtMs).toBeNull();

    shards.goalLocked = false;
    const back = path[path.length - 2]!;
    const away = resolveLegacyHazardStepDelta(maze, scene.player, back)!;
    expect(call<boolean>(scene, 'tryMovePlayerFromInput', away.deltaX, away.deltaY, { releaseAfterStep: true })).toBe(true);
    scene.time.now += 200;
    walk(scene, [back, { x: maze.goal.x, y: maze.goal.y }]);
    expect(calls.completion).toBe(1);
    expect(calls.cleared).toBe(1);
  });

  test('pause > Reset level resets the shard run with the bleed gates', () => {
    const restartAttempt = vi.fn();
    const { scene, maze } = createScene({ restartAttempt, goalLocked: false });
    Object.assign(scene, {
      player: { x: maze.start.x + 1, y: maze.start.y },
      syncLegacyPlayerVisualMotionTo: () => undefined,
      resetLegacyPlayInputBuffer: () => undefined,
      closeOverlay: () => undefined,
      enterMenuMode: () => undefined
    });
    call(scene, 'applyLegacyPauseCommand', 'reset-player');
    expect(restartAttempt).toHaveBeenCalledTimes(1);
    expect(scene.player).toEqual(maze.start);
  });
});

describe('first-time shard hint is spent only when shards are on the board', () => {
  const level = resolveShardFirstLevel() ?? 60;
  const memory = () => {
    const values = new Map<string, string>();
    return { values, storage: { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => { values.set(k, v); } } };
  };
  const levelStartScene = (active: boolean, storage: ReturnType<typeof memory>['storage']) => {
    const onboarding = createHazardOnboarding({
      enabled: true,
      resolveStorage: () => seedHazardPreviewStorage(storage, HAZARD_EXPOSURE_STORAGE_KEY, level),
      saturationLevel: GEOMETRY_BUDGET_SATURATION_LEVEL
    })!;
    const requestFirstHint = vi.fn();
    const scene = Object.create(MenuScene.prototype) as Scene;
    Object.assign(scene, {
      mode: 'play',
      hazardMomentView: null,
      hazardMomentCardAnchor: null,
      progressionState: { tracks: { player: { level } } },
      player: { x: 0, y: 0 },
      shards: { active, requestFirstHint },
      resolveHazardOnboarding: () => onboarding,
      resolveHazardMomentView: () => ({ clear: () => undefined, showCard: () => undefined, showPip: () => undefined }),
      playLegacySoundEffect: () => undefined
    });
    return { scene, onboarding, requestFirstHint };
  };

  test('placement failed (no active run): no hint and the record is not marked; the next real shard level shows it', () => {
    const { storage, values } = memory();
    const failed = levelStartScene(false, storage);
    call(failed.scene, 'startHazardMomentsLevel');
    expect(failed.requestFirstHint).not.toHaveBeenCalled();
    expect(values.has(HAZARD_EXPOSURE_STORAGE_KEY)).toBe(false);
    expect(failed.onboarding.record().introsShown).not.toContain('shard');

    const placed = levelStartScene(true, storage);
    call(placed.scene, 'startHazardMomentsLevel');
    expect(placed.requestFirstHint).toHaveBeenCalledTimes(1);
    expect(placed.onboarding.record().introsShown).toContain('shard');

    const again = levelStartScene(true, storage);
    call(again.scene, 'startHazardMomentsLevel');
    expect(again.requestFirstHint).not.toHaveBeenCalled();
  });
});

describe('ShardPlayPresenter state (paint layers stubbed)', () => {
  let cached: { maze: LegacyMazeSnapshot; options: LegacyShardInstallOptions } | null = null;
  const placed = () => {
    if (cached !== null) return cached;
    const level = resolveShardFirstLevel() ?? 60;
    for (let seed = 1; seed < 60; seed += 1) {
      const maze = runLegacyMazeGenerationJob(createLadderJobInput(level, PHONE_ASPECT, seed));
      const overlay = resolveLegacyHazardOverlay(maze, { enabled: true, level });
      const options: LegacyShardInstallOptions = {
        mode: 'play',
        level,
        saturationLevel: GEOMETRY_BUDGET_SATURATION_LEVEL,
        specs: overlay?.specs.filter((spec) => spec.kind === 'timedGate') ?? []
      };
      if (createLegacyShardRun().install(maze, options).status === 'placed') {
        cached = { maze, options };
        return cached;
      }
    }
    throw new Error('no placed shard fixture');
  };
  const fakeNotices = () => {
    const log: string[] = [];
    let open: string | null = null;
    const host: LegacyInFlowNoticeHost = {
      show: (key) => { open = key; log.push(`show:${key}`); },
      close: (key) => { if (key === undefined || key === open) open = null; log.push(`close:${key ?? '*'}`); },
      isOpen: (key) => open !== null && (key === undefined || key === open),
      setHidden: (hidden) => { log.push(`hidden:${hidden}`); },
      destroy: () => { open = null; }
    };
    return { host, log };
  };
  const frameInput = (maze: LegacyMazeSnapshot, hudVisible: boolean): ShardFrameInput => ({
    nowMs: 0,
    reducedMotion: true,
    layout: { originX: 0, originY: 0, tileSize: 10, backingScale: 1, alpha: 1 },
    goal: maze.goal,
    player: maze.start,
    header: { width: 390, height: 844, hudHeight: 64, hudTop: 0 },
    hudVisible,
    toScreen: (p) => p,
    viewWidth: 390,
    viewHeight: 844
  });
  const presenter = (notices: LegacyInFlowNoticeHost) => new ShardPlayPresenter({} as never, { depth: 0, notices });

  test('Reset level puts every shard back, locks the star again and closes the notices', () => {
    const { maze, options } = placed();
    const { host, log } = fakeNotices();
    const p = presenter(host);
    p.install(maze, options);
    const cells = p.describe().cells;
    for (const cell of cells) p.arrive(cell, 0);
    expect(p.goalLocked).toBe(false);
    p.restartAttempt();
    expect(p.goalLocked).toBe(true);
    expect(p.describe().collected).toBe(0);
    expect(p.describe().coach).toBe(false);
    expect(log[log.length - 1]).toBe('close:*');
  });

  test('the notice hides while the HUD is hidden (pause, Guide, menu) and comes back with it', () => {
    const { maze, options } = placed();
    const { host, log } = fakeNotices();
    const p = presenter(host);
    p.install(maze, options);
    p.requestFirstHint();
    p.frame(frameInput(maze, true));
    expect(host.isOpen(SHARD_HINT_KEYS.first)).toBe(true);
    p.frame(frameInput(maze, false));
    p.frame(frameInput(maze, true));
    expect(log.filter((entry) => entry.startsWith('hidden:'))).toEqual(['hidden:false', 'hidden:true', 'hidden:false']);
  });

  test('first-time Shard card hooks: untakenShardCell walks the order; holdNotices closes and defers the shard notices', () => {
    const { maze, options } = placed();
    const { host, log } = fakeNotices();
    const p = presenter(host);
    expect(p.untakenShardCell()).toBeNull(); // nothing installed
    p.install(maze, options);
    const cells = p.describe().cells;
    expect(p.untakenShardCell()).toEqual(cells[0]);
    expect(p.untakenShardCell(1)).toEqual(cells[1] ?? null);
    expect(p.untakenShardCell(-1)).toBeNull();
    expect(p.untakenShardCell(cells.length)).toBeNull();
    p.arrive(cells[0]!, 0);
    expect(p.untakenShardCell()).toEqual(cells[1] ?? null);
    // A first-time card is up: the hint waits (no stacking), and an open shard notice is closed.
    p.requestFirstHint();
    const closesBefore = log.filter((entry) => entry === 'close:*').length;
    p.holdNotices(true);
    p.frame(frameInput(maze, true));
    expect(host.isOpen(SHARD_HINT_KEYS.first)).toBe(false);
    expect(log.filter((entry) => entry === 'close:*')).toHaveLength(closesBefore + 1);
    p.holdNotices(true); // no change, no second close
    expect(log.filter((entry) => entry === 'close:*')).toHaveLength(closesBefore + 1);
    p.holdNotices(false);
    p.frame(frameInput(maze, true));
    expect(host.isOpen(SHARD_HINT_KEYS.first)).toBe(true);
    for (const cell of cells.slice(1)) p.arrive(cell, 0);
    expect(p.goalLocked).toBe(false);
    expect(p.untakenShardCell()).toBeNull();
  });
});
