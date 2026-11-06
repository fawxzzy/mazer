import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';
import { describe, expect, test, vi } from 'vitest';
import {
  INITIAL_LEGACY_PAGE_VISIBILITY_STATE,
  consumeLegacyResumeFrame,
  isLegacyLifecycleHeld,
  reduceLegacyPageVisibilityOnLeave,
  reduceLegacyPageVisibilityOnReturn,
  resolveLegacyLifecycleHoldMs,
  shiftLegacyLifecycleAnchor,
  shouldAutoPauseLegacyRun,
  type LegacyPageVisibilityState
} from '../../src/legacy-runtime/legacyLifecycleHold';
import {
  createLegacyResetRequest,
  hasPendingLegacyResetRequest
} from '../../src/legacy-runtime/legacyPlayLifecycle';

const HIDDEN: LegacyPageVisibilityState = { hidden: true, resumeFramePending: false };
const RESUME: LegacyPageVisibilityState = { hidden: false, resumeFramePending: true };

describe('auto-pause decision', () => {
  test('pauses a live run with no overlay, from every leave signal', () => {
    expect(shouldAutoPauseLegacyRun({ mode: 'play', overlay: 'none' })).toBe(true);
  });

  test('never opens Pause on top of another overlay (exactly one overlay) or in the menu', () => {
    for (const overlay of ['pause', 'options', 'auth', 'confirm-progression-reset', 'leaderboard']) {
      expect(shouldAutoPauseLegacyRun({ mode: 'play', overlay }), overlay).toBe(false);
    }
    expect(shouldAutoPauseLegacyRun({ mode: 'menu', overlay: 'none' })).toBe(false);
    expect(shouldAutoPauseLegacyRun({ mode: 'menu', overlay: 'options' })).toBe(false);
  });
});

describe('page visibility reducer', () => {
  test('hidden and page-hide mark the page hidden; a bare blur does not', () => {
    expect(reduceLegacyPageVisibilityOnLeave(INITIAL_LEGACY_PAGE_VISIBILITY_STATE, 'visibility-hidden')).toEqual(HIDDEN);
    expect(reduceLegacyPageVisibilityOnLeave(INITIAL_LEGACY_PAGE_VISIBILITY_STATE, 'page-hide')).toEqual(HIDDEN);
    expect(reduceLegacyPageVisibilityOnLeave(INITIAL_LEGACY_PAGE_VISIBILITY_STATE, 'window-blur'))
      .toEqual(INITIAL_LEGACY_PAGE_VISIBILITY_STATE);
  });

  test('returning arms exactly one resume frame, and only after a hidden interval', () => {
    expect(reduceLegacyPageVisibilityOnReturn(HIDDEN, 'visibility-visible')).toEqual(RESUME);
    expect(reduceLegacyPageVisibilityOnReturn(HIDDEN, 'page-show')).toEqual(RESUME);
    // pageshow without a prior hide (initial load, bfcache restore of a visible page) is a no-op
    expect(reduceLegacyPageVisibilityOnReturn(INITIAL_LEGACY_PAGE_VISIBILITY_STATE, 'page-show'))
      .toEqual(INITIAL_LEGACY_PAGE_VISIBILITY_STATE);
    expect(consumeLegacyResumeFrame(RESUME)).toEqual(INITIAL_LEGACY_PAGE_VISIBILITY_STATE);
    expect(consumeLegacyResumeFrame(HIDDEN)).toBe(HIDDEN);
  });

  test('hidden then visibilitychange-visible then pageshow does not double-arm', () => {
    let state = reduceLegacyPageVisibilityOnLeave(INITIAL_LEGACY_PAGE_VISIBILITY_STATE, 'visibility-hidden');
    state = reduceLegacyPageVisibilityOnReturn(state, 'visibility-visible');
    state = consumeLegacyResumeFrame(state);
    state = reduceLegacyPageVisibilityOnReturn(state, 'page-show');
    expect(state).toEqual(INITIAL_LEGACY_PAGE_VISIBILITY_STATE);
  });
});

describe('lifecycle hold', () => {
  const run = INITIAL_LEGACY_PAGE_VISIBILITY_STATE;

  test('Play overlays hold; Menu overlays and a free run do not', () => {
    expect(isLegacyLifecycleHeld({ mode: 'play', overlay: 'pause', pageVisibility: run })).toBe(true);
    expect(isLegacyLifecycleHeld({ mode: 'play', overlay: 'confirm-progression-reset', pageVisibility: run })).toBe(true);
    expect(isLegacyLifecycleHeld({ mode: 'play', overlay: 'none', pageVisibility: run })).toBe(false);
    expect(isLegacyLifecycleHeld({ mode: 'menu', overlay: 'options', pageVisibility: run })).toBe(false);
  });

  test('a hidden page and the resume frame hold in both modes', () => {
    for (const mode of ['menu', 'play'] as const) {
      expect(isLegacyLifecycleHeld({ mode, overlay: 'none', pageVisibility: HIDDEN })).toBe(true);
      expect(isLegacyLifecycleHeld({ mode, overlay: 'none', pageVisibility: RESUME })).toBe(true);
    }
  });

  test('the hold is the whole frame delta, so a paused or hidden gap never advances a time-derived timeline', () => {
    // Real hidden tab: no frames, then one frame whose delta is the whole gap.
    expect(resolveLegacyLifecycleHoldMs({ mode: 'play', overlay: 'pause', pageVisibility: RESUME, frameDeltaMs: 60_000 })).toBe(60_000);
    // Emulated hidden (frames keep coming): each frame is held.
    expect(resolveLegacyLifecycleHoldMs({ mode: 'play', overlay: 'pause', pageVisibility: HIDDEN, frameDeltaMs: 16 })).toBe(16);
    // Running: nothing is shifted.
    expect(resolveLegacyLifecycleHoldMs({ mode: 'play', overlay: 'none', pageVisibility: run, frameDeltaMs: 16 })).toBe(0);
  });

  test('rejects non-positive and non-finite deltas', () => {
    for (const frameDeltaMs of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(resolveLegacyLifecycleHoldMs({ mode: 'play', overlay: 'pause', pageVisibility: HIDDEN, frameDeltaMs }), String(frameDeltaMs)).toBe(0);
    }
  });

  test('an intro/outro anchor shifted by the hold resumes at the same phase', () => {
    const introStartedAtMs = 1000;
    const pausedAtMs = 1500; // 500 ms into the intro
    const resumeFrameMs = pausedAtMs + 30_000;
    const hold = resolveLegacyLifecycleHoldMs({ mode: 'play', overlay: 'pause', pageVisibility: RESUME, frameDeltaMs: resumeFrameMs - pausedAtMs });
    const shifted = shiftLegacyLifecycleAnchor(introStartedAtMs, hold)!;
    expect(resumeFrameMs - shifted).toBe(pausedAtMs - introStartedAtMs);
    expect(shiftLegacyLifecycleAnchor(null, hold)).toBeNull();
  });
});

// --- MenuScene wiring: run the real methods against a fake scene -----------------------

const sceneSource = ts.createSourceFile(
  'MenuScene.ts',
  readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8').replace(/\r\n?/g, '\n'),
  ts.ScriptTarget.Latest,
  true
);
const sceneClass = sceneSource.statements.find(
  (node): node is ts.ClassDeclaration => ts.isClassDeclaration(node) && node.name?.text === 'MenuScene'
)!;
const methodSource = (name: string): ts.MethodDeclaration => {
  const found = sceneClass.members.find(
    (node): node is ts.MethodDeclaration => ts.isMethodDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name
  );
  if (!found?.body) {
    throw new Error(`MenuScene.${name} must exist.`);
  }
  return found;
};
const compileMethod = (name: string, params: string): ((this: Record<string, unknown>, ...args: unknown[]) => unknown) => {
  const method = methodSource(name);
  const output = ts.transpileModule(
    `function ${name}(${params}) ${method.body!.getText(sceneSource)}`,
    { compilerOptions: { target: ts.ScriptTarget.ES2022 } }
  ).outputText;
  const deps = {
    INITIAL_LEGACY_PAGE_VISIBILITY_STATE,
    consumeLegacyResumeFrame,
    isLegacyLifecycleHeld,
    reduceLegacyPageVisibilityOnLeave,
    reduceLegacyPageVisibilityOnReturn,
    resolveLegacyLifecycleHoldMs,
    shouldAutoPauseLegacyRun
  };
  return new Function(...Object.keys(deps), `${output}; return ${name};`)(...Object.values(deps));
};

const hold = compileMethod('holdLegacyPlayMazeLifecycleDuringPause', 'time: number');
const pageLeave = compileMethod('handleLegacyPageLeave', 'signal: string');
const pageReturn = compileMethod('handleLegacyPageReturn', 'signal: string');

const makeScene = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  mode: 'play',
  overlay: 'none',
  legacyPageVisibility: INITIAL_LEGACY_PAGE_VISIBILITY_STATE,
  legacyLifecycleHeldThisFrame: false,
  legacyPlayMazeLifecyclePrevFrameMs: null,
  menuStaticDeconstructStartedAtMs: null,
  menuStaticDeconstructZeroHoldStartedAtMs: null,
  menuStaticBuildPrerollStartedAtMs: null,
  introStartedAtMs: null,
  pendingGenerationRequest: null,
  pendingResetRequest: null,
  playStartedAtMs: 0,
  playCompletedAtMs: null,
  nextDemoMoveAtMs: 0,
  pendingMenuDemoDeconstructArmAtMs: null,
  menuDemoCycleStartedAtMs: 0,
  menuDemoCompletedAtMs: null,
  openOverlay: vi.fn(function openOverlay(this: Record<string, unknown>, kind: string) { this.overlay = kind; }),
  ...overrides
});

describe('MenuScene lifecycle hold (real method, fake scene)', () => {
  test('a Play pause shifts the intro, deadlines and the run timer by exactly the elapsed frames', () => {
    const scene = makeScene({
      overlay: 'pause',
      introStartedAtMs: 1000,
      menuStaticDeconstructStartedAtMs: 1200,
      menuStaticBuildPrerollStartedAtMs: 1300,
      playStartedAtMs: 900,
      pendingGenerationRequest: { dueAtMs: 5000, reason: 'play-goal-reset' },
      pendingResetRequest: createLegacyResetRequest({ delayMs: 340, mode: 'play', nowMs: 1000, reason: 'goal' }),
      legacyPlayMazeLifecyclePrevFrameMs: 1500
    });
    const dueBefore = (scene.pendingResetRequest as { dueAtMs: number }).dueAtMs;
    hold.call(scene, 31_500); // one frame after a 30 s gap
    expect(scene.introStartedAtMs).toBe(1000 + 30_000);
    expect(scene.menuStaticDeconstructStartedAtMs).toBe(1200 + 30_000);
    expect(scene.menuStaticBuildPrerollStartedAtMs).toBe(1300 + 30_000);
    expect(scene.playStartedAtMs).toBe(900 + 30_000);
    expect((scene.pendingGenerationRequest as { dueAtMs: number }).dueAtMs).toBe(35_000);
    expect((scene.pendingResetRequest as { dueAtMs: number }).dueAtMs).toBe(dueBefore + 30_000);
    expect(hasPendingLegacyResetRequest(scene.pendingResetRequest as never)).toBe(true);
    expect(scene.legacyLifecycleHeldThisFrame).toBe(true);
  });

  test('a completed run keeps its elapsed value across a pause (start and completion move together)', () => {
    const scene = makeScene({
      overlay: 'pause', playStartedAtMs: 1000, playCompletedAtMs: 4000, legacyPlayMazeLifecyclePrevFrameMs: 5000
    });
    hold.call(scene, 9000);
    expect((scene.playCompletedAtMs as number) - (scene.playStartedAtMs as number)).toBe(3000);
  });

  test('a free run is untouched', () => {
    const scene = makeScene({ introStartedAtMs: 1000, playStartedAtMs: 900, legacyPlayMazeLifecyclePrevFrameMs: 1500 });
    hold.call(scene, 1516);
    expect(scene.introStartedAtMs).toBe(1000);
    expect(scene.playStartedAtMs).toBe(900);
    expect(scene.legacyLifecycleHeldThisFrame).toBe(false);
  });

  test('menu mode holds the demo schedule only for a hidden page, then releases after the resume frame', () => {
    const scene = makeScene({
      mode: 'menu',
      nextDemoMoveAtMs: 2000,
      menuDemoCycleStartedAtMs: 500,
      pendingMenuDemoDeconstructArmAtMs: 2600,
      legacyPlayMazeLifecyclePrevFrameMs: 1000
    });
    pageLeave.call(scene, 'visibility-hidden');
    expect(scene.openOverlay).not.toHaveBeenCalled();
    hold.call(scene, 1016);
    expect(scene.nextDemoMoveAtMs).toBe(2016);
    pageReturn.call(scene, 'visibility-visible');
    hold.call(scene, 9016); // the resume frame carries the whole gap
    expect(scene.nextDemoMoveAtMs).toBe(2016 + 8000);
    expect(scene.menuDemoCycleStartedAtMs).toBe(500 + 16 + 8000);
    expect(scene.pendingMenuDemoDeconstructArmAtMs).toBe(2600 + 16 + 8000);
    hold.call(scene, 9032); // running again
    expect(scene.nextDemoMoveAtMs).toBe(2016 + 8000);
  });

  test('a leave signal opens exactly one pause, never a second overlay, and return never resumes', () => {
    const scene = makeScene();
    pageLeave.call(scene, 'visibility-hidden');
    pageLeave.call(scene, 'page-hide');
    pageLeave.call(scene, 'window-blur');
    expect(scene.openOverlay).toHaveBeenCalledTimes(1);
    expect(scene.openOverlay).toHaveBeenCalledWith('pause');
    pageReturn.call(scene, 'visibility-visible');
    pageReturn.call(scene, 'page-show');
    expect(scene.overlay).toBe('pause');
    expect(scene.openOverlay).toHaveBeenCalledTimes(1);
  });

  test('a leave signal does not stack Pause on Settings/auth/confirm overlays', () => {
    for (const overlay of ['options', 'auth', 'confirm-progression-reset']) {
      const scene = makeScene({ overlay });
      pageLeave.call(scene, 'window-blur');
      expect(scene.openOverlay, overlay).not.toHaveBeenCalled();
      expect(scene.overlay).toBe(overlay);
    }
  });
});

describe('MenuScene wiring pins', () => {
  const source = sceneSource.getFullText();

  test('listens for pagehide and pageshow as well as blur and visibilitychange, and detaches all of them', () => {
    for (const needle of [
      "window.addEventListener('pagehide', this.legacyPlayPageHideHandler);",
      "window.addEventListener('pageshow', this.legacyPlayPageShowHandler);",
      "window.removeEventListener('pagehide', this.legacyPlayPageHideHandler);",
      "window.removeEventListener('pageshow', this.legacyPlayPageShowHandler);"
    ]) {
      expect(source).toContain(needle);
    }
  });

  test('the transfer pause tracker honours the same hold verdict as the lifecycle hold', () => {
    expect(source).toContain("const paused = this.overlay === 'pause' || this.legacyLifecycleHeldThisFrame;");
  });

  test('goal-reset key swallowing never applies while an overlay is open (paused run stays resumable by keyboard)', () => {
    expect(source).toContain(
      "if (this.overlay === 'none' && hasPendingLegacyResetRequest(this.pendingResetRequest)) {\n      this.resetLegacyPlayInputBuffer();"
    );
  });

  test('a geometry change forces the next diagnostics publish instead of waiting out the throttle', () => {
    const refresh = methodSource('refreshLayout').body!.getText(sceneSource);
    expect(refresh).toContain('this.visualDiagnosticsLastPublishedAtMs = Number.NEGATIVE_INFINITY;');
    expect(refresh).toContain('this.runtimeDiagnosticsLastPublishedAtMs = Number.NEGATIVE_INFINITY;');
  });
});
