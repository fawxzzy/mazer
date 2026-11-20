// MAZER-CTRL-007: input is locked while the Play maze generates; input can no longer skip the build.
// Part 1 pins the pure lock rules. Part 2 runs the REAL MenuScene methods (input handlers, settle, safety release)
// against a fake scene, frame by frame, the way tests/reset/legacy-lifecycle-hold.test.ts does.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';
import { describe, expect, test, vi } from 'vitest';
import {
  LEGACY_GENERATION_INPUT_LOCK_SAFETY_MARGIN_MS,
  isLegacyPlayGenerationBuilding,
  resolveLegacyGenerationInputLock,
  type LegacyGenerationInputLockInput
} from '../../src/legacy-runtime/legacyGenerationInputLock';
import {
  hasPendingLegacyResetRequest,
  resolveLegacyStaticDrawPlayTimerStartAtMs,
  shouldSettleLegacyStaticDrawStage
} from '../../src/legacy-runtime/legacyPlayLifecycle';
import { createLegacyPlayMoveFlags } from '../../src/legacy-runtime/legacyPlayStep';
import {
  INTRO_LASER_MS,
  INTRO_REDUCED_MOTION_MS,
  resolveIntro,
  resolveIntroInputUnlockMs
} from '../../src/render/introTimeline';

const TILES = 444;
const FRAME_MS = 1000 / 60;

const lockInput = (overrides: Partial<LegacyGenerationInputLockInput> = {}): LegacyGenerationInputLockInput => ({
  mode: 'play',
  drawPhase: 'building',
  stagedBuildVisible: true,
  introStartedAtMs: 1000,
  nowMs: 1000,
  reducedMotion: false,
  tileCount: TILES,
  ...overrides
});

describe('generation input lock rules (pure)', () => {
  test('locks for the whole Play build, from its first instant to the build unlock instant', () => {
    const unlockAtMs = 1000 + resolveIntroInputUnlockMs(false, TILES);
    expect(resolveLegacyGenerationInputLock(lockInput())).toEqual({ locked: true, release: 'none', unlockAtMs });
    expect(resolveLegacyGenerationInputLock(lockInput({ nowMs: unlockAtMs - 1 })).locked).toBe(true);
  });

  test('never locks outside a Play build (menu demo, settled, idle, deconstruct)', () => {
    expect(resolveLegacyGenerationInputLock(lockInput({ mode: 'menu' })).locked).toBe(false);
    expect(resolveLegacyGenerationInputLock(lockInput({ drawPhase: 'settled', stagedBuildVisible: false })).locked).toBe(false);
    expect(resolveLegacyGenerationInputLock(lockInput({ drawPhase: 'idle', stagedBuildVisible: false })).locked).toBe(false);
    expect(resolveLegacyGenerationInputLock(lockInput({ drawPhase: 'deconstructing' }))).toEqual({
      locked: false, release: 'none', unlockAtMs: null
    });
    expect(isLegacyPlayGenerationBuilding({ mode: 'play', drawPhase: 'deconstructing', stagedBuildVisible: true })).toBe(false);
  });

  test('Reduce Motion: the short crossfade build locks input for exactly its own length', () => {
    const reduced = lockInput({ reducedMotion: true });
    expect(resolveLegacyGenerationInputLock(reduced).unlockAtMs).toBe(1000 + INTRO_REDUCED_MOTION_MS);
    expect(resolveLegacyGenerationInputLock({ ...reduced, nowMs: 1000 + INTRO_REDUCED_MOTION_MS - 1 }).locked).toBe(true);
  });

  test('safety release: a build with no intro clock or far past its unlock instant never keeps the lock', () => {
    expect(resolveLegacyGenerationInputLock(lockInput({ introStartedAtMs: null }))).toEqual({
      locked: false, release: 'no-intro-clock', unlockAtMs: null
    });
    // Staged counters left behind outside a build (never set by a healthy lifecycle) are released too.
    expect(resolveLegacyGenerationInputLock(lockInput({ drawPhase: 'settled' })).release).toBe('no-intro-clock');
    const unlockAtMs = 1000 + resolveIntroInputUnlockMs(false, TILES);
    expect(resolveLegacyGenerationInputLock(lockInput({
      nowMs: unlockAtMs + LEGACY_GENERATION_INPUT_LOCK_SAFETY_MARGIN_MS - 1
    }))).toEqual({ locked: true, release: 'none', unlockAtMs });
    expect(resolveLegacyGenerationInputLock(lockInput({
      nowMs: unlockAtMs + LEGACY_GENERATION_INPUT_LOCK_SAFETY_MARGIN_MS
    }))).toEqual({ locked: false, release: 'intro-clock-overrun', unlockAtMs });
  });
});

// --- MenuScene wiring: run the real methods against a fake scene -----------------------

const sceneText = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8').replace(/\r\n?/g, '\n');
const sceneSource = ts.createSourceFile('MenuScene.ts', sceneText, ts.ScriptTarget.Latest, true);
const sceneClass = sceneSource.statements.find(
  (node): node is ts.ClassDeclaration => ts.isClassDeclaration(node) && node.name?.text === 'MenuScene'
)!;
const methods = sceneClass.members.filter(
  (node): node is ts.MethodDeclaration => ts.isMethodDeclaration(node) && ts.isIdentifier(node.name) && node.body !== undefined
);
const methodNamed = (name: string): ts.MethodDeclaration => {
  const found = methods.find((node) => (node.name as ts.Identifier).text === name);
  if (!found) {
    throw new Error(`MenuScene.${name} must exist.`);
  }
  return found;
};
const deps = {
  INTRO_LASER_MS,
  createLegacyPlayMoveFlags,
  hasPendingLegacyResetRequest,
  resolveLegacyGenerationInputLock,
  resolveLegacyStaticDrawPlayTimerStartAtMs,
  shouldSettleLegacyStaticDrawStage,
  // The fake layout says whether the press lands on the pause cog.
  resolveTouchControlKindAtPoint: (layout: { pauseHit: boolean }) => (layout.pauseHit ? 'pause' : null)
};
type SceneMethod = (this: FakeScene, ...args: unknown[]) => unknown;
const compileMethod = (name: string): SceneMethod => {
  const method = methodNamed(name);
  const params = method.parameters.map((parameter) => parameter.name.getText(sceneSource)).join(', ');
  const output = ts.transpileModule(
    `function ${name}(${params}) ${method.body!.getText(sceneSource)}`,
    { compilerOptions: { target: ts.ScriptTarget.ES2022 } }
  ).outputText;
  return new Function(...Object.keys(deps), `${output}; return ${name};`)(...Object.values(deps));
};

type FakeScene = Record<string, any>;
const REAL_METHODS = [
  'handleLegacyKeyboardDown',
  'handleLegacyPlayTouchControl',
  'resolveLegacyGenerationInputLockNow',
  'releaseLegacyGenerationInputLockIfStuck',
  'resolveLegacyPlayMovementDirection',
  'resetLegacyPlayInputBuffer',
  'settleLegacyMenuStaticDrawStageIfComplete'
] as const;
const compiled = Object.fromEntries(REAL_METHODS.map((name) => [name, compileMethod(name)]));

const makeScene = (overrides: FakeScene = {}): FakeScene => {
  const scene: FakeScene = {
    mode: 'play',
    overlay: 'none',
    time: { now: 0 },
    pendingResetRequest: null,
    menuStaticDrawLifecyclePhase: 'building',
    menuStaticDrawRowsVisible: 0,
    menuStaticDrawTilesVisible: 0,
    menuStaticDrawTileOrder: Array.from({ length: TILES }, (_, index) => ({ x: index, y: 0 })),
    introStartedAtMs: 0,
    playStartedAtMs: 0,
    reducedMotion: false,
    legacyGenerationInputLockSafetyReleaseCount: 0,
    playMoveTimer: null,
    playKeyboardBufferedVector: null,
    playHeldTouchMoves: [],
    playTouchArrowPointerId: null,
    playTouchStickPointerId: null,
    playFloatingStickOrigin: null,
    playTouchStickFinger: null,
    playTouchStickPull: null,
    playMoveFlags: { up: false, down: false, left: false, right: false },
    playPointerStart: null,
    floatingAnchorEnabled: true,
    floatingAnchor: { down: vi.fn(), up: vi.fn() },
    playKeyboardRepeatGate: { reset: vi.fn() },
    playDirectionalIntent: { reset: vi.fn() },
    pauseHit: false,
    prefersLegacyReducedMotion() { return this.reducedMotion; },
    openOverlay: vi.fn(function openOverlay(this: FakeScene, kind: string) { this.overlay = kind; }),
    closeOverlay: vi.fn(function closeOverlay(this: FakeScene) { this.overlay = 'none'; }),
    // Movement step itself is out of scope: it only counts that the gate let the key through.
    handleLegacyPlayMovementKeyDown: vi.fn(function movementKeyDown(this: FakeScene, event: KeyboardEvent) {
      return this.resolveLegacyPlayMovementDirection(event) !== null;
    }),
    handleOverlayFieldInput: () => false,
    handleLeaderboardUsernameEditorKey: () => false,
    handleBackAction: vi.fn(),
    menuDropdown: { close: () => false, isShown: () => false },
    resolveLegacyPlayTouchControlLayout() { return { pauseHit: this.pauseHit }; },
    normalizeLegacyPlayTouchPointerId: (id: number | null) => id ?? 0,
    resetLegacyPlayDirectionalInputBuffer: vi.fn(),
    configureLegacyFloatingAnchor: vi.fn(),
    clearLegacyPlayHeldTouchRepeat: vi.fn(),
    clearLegacyPlayFloatingStick: vi.fn(function clearStick(this: FakeScene) { this.playFloatingStickOrigin = null; }),
    refreshLegacyMenuStaticDrawVisibleTileKeys: vi.fn(),
    armLegacyPlayerArrivalForFinalBuildStep: vi.fn(),
    releaseLegacyMenuDemoGateOnStaticDrawSettled: vi.fn(),
    ...overrides
  };
  for (const name of REAL_METHODS) {
    scene[name] = compiled[name];
  }
  return scene;
};

const keyEvent = (key: string): KeyboardEvent => ({
  key, repeat: false, defaultPrevented: false, preventDefault: vi.fn()
}) as unknown as KeyboardEvent;

/** Every control path a player has during the build: a drag, a tap, an arrow key, WASD. */
const pressEverything = (scene: FakeScene): void => {
  scene.handleLegacyPlayTouchControl(195, 600, 1);
  scene.handleLegacyPlayTouchControl(120, 400, 2);
  scene.handleLegacyKeyboardDown(keyEvent('ArrowDown'));
  scene.handleLegacyKeyboardDown(keyEvent('d'));
};

/**
 * One frame of the build exactly as MenuScene.update orders it: advanceLegacyMenuStaticDrawStage's build branch
 * (intro clock -> tiles; at the unlock instant the counters clear and the real settle runs), then the real safety
 * release.
 */
const stepFrame = (scene: FakeScene, time: number): void => {
  scene.time.now = time;
  if (scene.menuStaticDrawLifecyclePhase === 'building' && scene.introStartedAtMs !== null) {
    const intro = resolveIntro(time - scene.introStartedAtMs, {
      reducedMotion: scene.reducedMotion, tileCount: scene.menuStaticDrawTileOrder.length
    });
    scene.menuStaticDrawTilesVisible = intro.tilesVisible;
    if (intro.inputUnlocked) {
      scene.menuStaticDrawTilesVisible = null;
      scene.menuStaticDrawRowsVisible = null;
      scene.settleLegacyMenuStaticDrawStageIfComplete(time);
    }
  }
  scene.releaseLegacyGenerationInputLockIfStuck(time);
};

const runBuild = (scene: FakeScene, inputEveryFrame: boolean): { buildFrames: number; settledAtMs: number } => {
  let frame = 0;
  while (scene.menuStaticDrawLifecyclePhase === 'building' && frame < 10_000) {
    frame += 1;
    const time = frame * FRAME_MS;
    if (inputEveryFrame) {
      scene.time.now = time;
      const introBefore = scene.introStartedAtMs;
      pressEverything(scene);
      expect(scene.introStartedAtMs).toBe(introBefore);
      expect(scene.playFloatingStickOrigin).toBeNull();
      expect(scene.handleLegacyPlayMovementKeyDown).not.toHaveBeenCalled();
    }
    stepFrame(scene, time);
  }
  return { buildFrames: frame, settledAtMs: frame * FRAME_MS };
};

describe('MenuScene generation input lock (real methods, fake scene)', () => {
  test('a move during generation changes nothing and the build takes the same frame count', () => {
    const untouched = runBuild(makeScene(), false);
    const mashed = runBuild(makeScene(), true);
    expect(mashed.buildFrames).toBe(untouched.buildFrames);
    expect(mashed.buildFrames).toBe(Math.ceil(resolveIntroInputUnlockMs(false, TILES) / FRAME_MS));
  });

  test('controls are live on the first post-generation frame and the run timer starts only then', () => {
    const scene = makeScene();
    const { settledAtMs } = runBuild(scene, true);
    expect(scene.menuStaticDrawLifecyclePhase).toBe('settled');
    expect(scene.playStartedAtMs).toBe(settledAtMs);
    expect(scene.resolveLegacyGenerationInputLockNow(settledAtMs).locked).toBe(false);
    expect(scene.handleLegacyKeyboardDown(keyEvent('ArrowDown'))).toBe(true);
    expect(scene.handleLegacyPlayMovementKeyDown).toHaveBeenCalledTimes(1);
    expect(scene.handleLegacyPlayTouchControl(195, 600, 3)).toBe(true);
    expect(scene.playFloatingStickOrigin).toEqual({ x: 195, y: 600 });
  });

  test('Reduce Motion: the crossfade build is locked too and still settles on its own instant', () => {
    const untouched = runBuild(makeScene({ reducedMotion: true }), false);
    const scene = makeScene({ reducedMotion: true });
    const mashed = runBuild(scene, true);
    expect(mashed.buildFrames).toBe(untouched.buildFrames);
    expect(mashed.buildFrames).toBe(Math.ceil(INTRO_REDUCED_MOTION_MS / FRAME_MS));
    expect(scene.playStartedAtMs).toBe(mashed.settledAtMs);
  });

  test('pause and Esc stay usable during generation and do not touch the intro clock', () => {
    const scene = makeScene({ pauseHit: true });
    scene.time.now = 900;
    expect(scene.handleLegacyPlayTouchControl(370, 20, 1)).toBe(true);
    expect(scene.overlay).toBe('pause');
    scene.overlay = 'none';
    expect(scene.handleLegacyKeyboardDown(keyEvent('p'))).toBe(true);
    expect(scene.overlay).toBe('pause');
    scene.overlay = 'none';
    expect(scene.handleLegacyKeyboardDown(keyEvent('Escape'))).toBe(true);
    expect(scene.handleBackAction).toHaveBeenCalledTimes(1);
    expect(scene.introStartedAtMs).toBe(0);
    expect(scene.menuStaticDrawLifecyclePhase).toBe('building');
  });

  test('a held key or stick from before the build is dropped, not carried into the first unlocked frame', () => {
    const scene = makeScene({
      playMoveFlags: { up: false, down: true, left: false, right: false },
      playFloatingStickOrigin: { x: 10, y: 10 }
    });
    scene.time.now = 500;
    scene.handleLegacyKeyboardDown(keyEvent('ArrowDown'));
    expect(scene.playMoveFlags).toEqual({ up: false, down: false, left: false, right: false });
    expect(scene.playFloatingStickOrigin).toBeNull();
  });

  test('safety release: a build whose clock is gone or stalled settles and unlocks; healthy frames never release', () => {
    const noClock = makeScene({ introStartedAtMs: null });
    stepFrame(noClock, 100);
    expect(noClock.menuStaticDrawLifecyclePhase).toBe('settled');
    expect(noClock.legacyGenerationInputLockSafetyReleaseCount).toBe(1);
    expect(noClock.playStartedAtMs).toBe(100);
    expect(noClock.resolveLegacyGenerationInputLockNow(100).locked).toBe(false);

    // A build whose tiles never advance (the reveal driver stalled) is released once it overruns.
    const stalled = makeScene();
    const unlockMs = resolveIntroInputUnlockMs(false, TILES);
    stalled.releaseLegacyGenerationInputLockIfStuck(unlockMs + LEGACY_GENERATION_INPUT_LOCK_SAFETY_MARGIN_MS - 1);
    expect(stalled.menuStaticDrawLifecyclePhase).toBe('building');
    stalled.releaseLegacyGenerationInputLockIfStuck(unlockMs + LEGACY_GENERATION_INPUT_LOCK_SAFETY_MARGIN_MS);
    expect(stalled.menuStaticDrawLifecyclePhase).toBe('settled');
    expect(stalled.menuStaticDrawTilesVisible).toBeNull();

    const healthy = makeScene();
    runBuild(healthy, true);
    expect(healthy.legacyGenerationInputLockSafetyReleaseCount).toBe(0);
  });

  test('only the build arm, the deconstruct arm and the pause hold write the intro clock (no input path can)', () => {
    const writers = methods
      .filter((method) => /this\.introStartedAtMs\s*(?:[+-]?=)(?!=)/.test(method.body!.getText(sceneSource)))
      .map((method) => (method.name as ts.Identifier).text)
      .sort();
    expect(writers).toEqual([
      'armLegacyMenuStaticDeconstructStage',
      'armLegacyMenuStaticDrawStage',
      'holdLegacyPlayMazeLifecycleDuringPause'
    ]);
    expect(sceneText).not.toContain('skipLegacyIntroIfBuilding');
  });
});
