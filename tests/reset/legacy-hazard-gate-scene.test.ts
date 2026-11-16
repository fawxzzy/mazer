import { describe, expect, test, vi } from 'vitest';
import { MenuScene } from '../../src/scenes/MenuScene';
import { bootHazardLab } from '../../src/legacy-runtime/legacyHazardLabBoot';
import { HAZARD_LAB_CHIP_TEXT } from '../../src/legacy-runtime/legacyHazardLayerFlag';
import { createLegacyHazardGateController, resolveLegacyHazardStepDelta } from '../../src/legacy-runtime/legacyHazardGateController';
import { LegacyDirectionalIntentResolver } from '../../src/legacy-runtime/legacyDirectionalIntent';
import type { LegacyPoint } from '../../src/legacy-runtime/legacyMaze';
import { findGateFixture } from './legacy-hazard-gate-fixture';

vi.mock('phaser', () => ({
  default: {
    AUTO: 'AUTO',
    Math: { Clamp: (v: number, a: number, b: number) => Math.max(a, Math.min(b, v)), Linear: (a: number, b: number, t: number) => a + ((b - a) * t) },
    Scale: { RESIZE: 'RESIZE', CENTER_BOTH: 'CENTER_BOTH' },
    Scene: class {}
  }
}));

// Slice H3 (HAZ-004) through the REAL MenuScene methods on a stub scene: the input path
// (tryMovePlayerFromInput -> directional intent -> tryMovePlayer -> world turn host ->
// applyLegacyWorldTurnPlayerMovement), the world clock frame (updateHazardWorldClock) and the A3 eject.
// Everything that only paints, buzzes or plays sound is stubbed; nothing about movement is.

const TICK_MS = 100;

type Scene = Record<string, unknown> & {
  player: LegacyPoint;
  trail: LegacyPoint[];
  time: { now: number; delayedCall: (delay: number, callback: () => void) => { remove: () => void } };
  calls: Record<string, number>;
};

const proto = MenuScene.prototype as unknown as Record<string, (...args: unknown[]) => unknown>;
const call = <T>(scene: Scene, name: string, ...args: unknown[]): T => proto[name]!.call(scene, ...args) as T;

const createScene = (options: { layerOn?: boolean } = {}) => {
  const { maze, overlay, level } = findGateFixture(10, undefined, { needWait: true });
  const lab = bootHazardLab(options.layerOn === false ? '' : '?lab=hazards');
  const gates = options.layerOn === false ? null : createLegacyHazardGateController();
  gates?.install(maze, { mode: 'play', level, playerLevel: level, workerOverlay: overlay });
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
    hazardLab: lab,
    hazardGates: gates,
    hazardGateEjecting: false,
    hazardGateTickMs: TICK_MS,
    legacyWorldTurnMove: null,
    legacyWorldTurnCommandSequence: 0,
    playDirectionalIntent: new LegacyDirectionalIntentResolver(),
    playMoveFlags: { up: false, down: false, left: false, right: false },
    playMoveTimer: null,
    time: { now: 1000, delayedCall: () => ({ remove: () => undefined }) },
    isLegacyPlayLifecycleInputLocked: () => false,
    prefersLegacyReducedMotion: () => true,
    resolveLegacyPlayMovementSpeedProfile: () => { count('speedProfile')(); return { repeatIntervalMs: TICK_MS }; },
    synchronizeLegacyPlayDirectionalIntent(this: Scene) { (this.playDirectionalIntent as LegacyDirectionalIntentResolver).synchronize([]); },
    publishInteractionDiagnostics: () => undefined,
    armLegacyWallBump: count('wallBump'),
    armLegacyPlayerVisualMotion: () => undefined,
    resolveLegacyPlayerVisualMoveDurationMs: () => 0,
    appendLegacyPlayCyclePoint: () => undefined,
    recordMazeCycleCompletion: count('completion'),
    armLegacyPlayerTransferEnergy: () => undefined,
    precomputeLegacyDeconstructResetMaze: () => undefined,
    schedulePlayResetReturn: count('resetReturn'),
    triggerLegacyHapticPulse: () => undefined,
    playLegacySoundEffect: () => undefined
  });
  scene.legacyWorldTurnHost = call(scene, 'createLegacyWorldTurnHost');
  return { scene, maze, overlay, level, lab, gates: gates!, calls };
};

/** One frame one tick later through the real clock hook. */
const tick = (scene: Scene): void => {
  scene.time.now += TICK_MS;
  call(scene, 'updateHazardWorldClock', scene.time.now);
};

describe('Pulse Gate in the real MenuScene input path (slice H3)', () => {
  test('headless witness replay: every action through the real input path, one tick each, reaches the goal', () => {
    const { scene, maze, overlay, lab, gates, calls } = createScene();
    const witness = overlay.verdict!.witness!;
    expect(witness.startTick).toBe(0);
    expect(witness.waits).toBeGreaterThan(0);
    const width = maze.grid[0]!.length;
    const at = (cell: number) => ({ x: cell % width, y: Math.floor(cell / width) });
    for (let index = 0; index < witness.ticks; index += 1) {
      expect(lab.runtime!.clock.ticks, `tick before action ${index}`).toBe(witness.startTick + index);
      const target = at(witness.cells[index + 1]!);
      if (target.x === scene.player.x && target.y === scene.player.y) {
        // A WAIT: the player holds still. (Before the first input the clock has not started; a held
        // or bumped input starts it, which is what noteInput stands for here.)
        lab.runtime!.noteInput(scene.time.now);
      } else {
        const delta = resolveLegacyHazardStepDelta(maze, scene.player, target)!;
        const moved = call<boolean>(scene, 'tryMovePlayerFromInput', delta.deltaX, delta.deltaY, { releaseAfterStep: true });
        expect(moved, `step ${index}`).toBe(true);
        expect(scene.player, `step ${index}`).toEqual(target);
      }
      tick(scene);
    }
    expect(scene.player).toEqual({ x: maze.goal.x, y: maze.goal.y });
    expect(calls.completion).toBe(1);
    expect(calls.wallBump ?? 0).toBe(0);
    expect(gates.ejects).toBe(0);
    expect(gates.arrivalBlocks).toBe(0);
    // After the goal, play is no longer active: the clock stops instead of running on.
    tick(scene);
    expect(lab.runtime!.clock.phase).toBe('stopped');
  });

  test('stepping onto a gate that is closed next tick is a wall bump and the clock keeps running', () => {
    const { scene, maze, gates, lab, calls } = createScene();
    const gate = { x: gates.gateX(0), y: gates.gateY(0) };
    const neighbour = [[0, -1], [-1, 0], [0, 1], [1, 0]]
      .map(([dx, dy]) => ({ x: gate.x + dx!, y: gate.y + dy! }))
      .find((cell) => resolveLegacyHazardStepDelta(maze, cell, gate) !== null && !gates.isBlockedAt(cell.x, cell.y, 0))!;
    scene.player = { ...neighbour };
    scene.trail = [{ ...neighbour }];
    lab.runtime!.noteInput(scene.time.now);
    while (gates.isOpenAt(0, lab.runtime!.clock.ticks + 1)) { tick(scene); }
    const before = lab.runtime!.clock.ticks;
    const delta = resolveLegacyHazardStepDelta(maze, neighbour, gate)!;
    expect(call<boolean>(scene, 'tryMovePlayerFromInput', delta.deltaX, delta.deltaY, { releaseAfterStep: true })).toBe(false);
    expect(scene.player).toEqual(neighbour);
    expect(calls.wallBump).toBe(1);
    expect(gates.arrivalBlocks).toBe(1);
    tick(scene);
    expect(lab.runtime!.clock.ticks).toBe(before + 1);
  });

  test('A3 eject: a gate closing on the player pushes them one cell back along the trail', () => {
    const { scene, maze, gates, lab } = createScene();
    const gate = { x: gates.gateX(0), y: gates.gateY(0) };
    const back = [[0, -1], [-1, 0], [0, 1], [1, 0]]
      .map(([dx, dy]) => ({ x: gate.x + dx!, y: gate.y + dy! }))
      .find((cell) => resolveLegacyHazardStepDelta(maze, gate, cell) !== null)!;
    lab.runtime!.noteInput(scene.time.now);
    // Stand in the gate on an open tick whose next tick is closed.
    while (!(gates.isOpenAt(0, lab.runtime!.clock.ticks) && !gates.isOpenAt(0, lab.runtime!.clock.ticks + 1))) { tick(scene); }
    scene.player = { ...gate };
    scene.trail = [{ ...back }, { ...gate }];
    tick(scene);
    expect(scene.player).toEqual(back);
    expect(gates.ejects).toBe(1);
  });

  test('layer off: no clock, no gate check, and the same input moves exactly as before', () => {
    const { scene, maze, calls } = createScene({ layerOn: false });
    expect(scene.hazardLab).toMatchObject({ runtime: null, chipText: null });
    const next = [[0, -1], [-1, 0], [0, 1], [1, 0]]
      .map(([dx, dy]) => ({ dx: dx!, dy: dy! }))
      .find(({ dx, dy }) => resolveLegacyHazardStepDelta(maze, maze.start, { x: maze.start.x + dx, y: maze.start.y + dy }) !== null)!;
    call(scene, 'updateHazardWorldClock', 5000);
    expect(call<boolean>(scene, 'tryMovePlayerFromInput', next.dx, next.dy, { releaseAfterStep: true })).toBe(true);
    expect(scene.player).toEqual({ x: maze.start.x + next.dx, y: maze.start.y + next.dy });
    expect(calls.speedProfile ?? 0).toBe(0);
  });
});

describe('H1 review follow-ups', () => {
  test('updateHazardWorldClock resolves the speed profile only while the clock runs in active play', () => {
    const { scene, lab, calls } = createScene();
    for (let frame = 0; frame < 20; frame += 1) { tick(scene); }
    expect(lab.runtime!.clock.phase).toBe('idle');
    expect(calls.speedProfile ?? 0).toBe(0);
    lab.runtime!.noteInput(scene.time.now);
    tick(scene);
    expect(calls.speedProfile).toBe(1);
    scene.overlay = 'pause';
    tick(scene);
    expect(lab.runtime!.clock.phase).toBe('stopped');
    for (let frame = 0; frame < 20; frame += 1) { tick(scene); }
    expect(calls.speedProfile).toBe(1);
  });

  test('play.worldClock and play.pulseGates diagnostics exist only with the layer on', () => {
    const on = createScene().scene;
    const diagnostics = call<Record<string, unknown>>(on, 'resolveLegacyHazardLabDiagnostics');
    expect(Object.keys(diagnostics).sort()).toEqual(['pulseGates', 'worldClock']);
    expect(diagnostics.worldClock).toMatchObject({ phase: 'idle', ticks: 0 });
    expect(diagnostics.pulseGates).toMatchObject({ mode: 'play', overlaySource: 'worker' });
    expect(call(createScene({ layerOn: false }).scene, 'resolveLegacyHazardLabDiagnostics')).toEqual({});
  });

  test('the LAB chip shows in the footer slot while the lab switch is on (and nothing with it off)', () => {
    const footer = () => {
      const state = { text: null as string | null };
      const chain = {
        setText: (text: string) => { state.text = text; return chain; },
        setPosition: () => chain,
        setFontSize: () => chain,
        setColor: () => chain,
        setAlpha: () => chain
      };
      return { state, chain };
    };
    const on = footer();
    call({ hazardLab: bootHazardLab('?lab=hazards'), levelPreviewLevel: null, footerText: on.chain, layout: { width: 390, footerY: 800 } } as unknown as Scene, 'drawLegacyLevelPreviewBadge');
    expect(on.state.text).toBe(HAZARD_LAB_CHIP_TEXT);
    const off = footer();
    call({ hazardLab: bootHazardLab(''), levelPreviewLevel: null, footerText: off.chain, layout: { width: 390, footerY: 800 } } as unknown as Scene, 'drawLegacyLevelPreviewBadge');
    expect(off.state.text).toBeNull();
  });

  test('release-to-stop: a keyboard release moves at most one buffered step, then nothing', () => {
    const { scene, maze } = createScene({ layerOn: false });
    const keys = { right: ['ArrowRight', 1, 0], left: ['ArrowLeft', -1, 0], down: ['ArrowDown', 0, 1], up: ['ArrowUp', 0, -1] } as const;
    const [key] = Object.values(keys).find(([, dx, dy]) =>
      resolveLegacyHazardStepDelta(maze, maze.start, { x: maze.start.x + dx, y: maze.start.y + dy }) !== null)!;
    let moves = 0;
    const realTry = proto.tryMovePlayerFromInput!;
    scene.tryMovePlayerFromInput = function (this: Scene, ...args: unknown[]) { moves += 1; return realTry.call(this, ...args); };
    let pending: (() => void) | null = null;
    let removed = 0;
    scene.time.delayedCall = (_delay, callback) => { pending = callback; return { remove: () => { removed += 1; } }; };
    Object.assign(scene, { playKeyboardRepeatGate: { accept: () => true }, boardDynamicDirty: false });
    const event = { key, code: key, repeat: false, timeStamp: 1000, preventDefault: () => undefined } as unknown as KeyboardEvent;
    // Press: the move waits in the simultaneous-key buffer (no step yet).
    expect(call(scene, 'handleLegacyPlayMovementKeyDown', event)).toBe(true);
    expect(pending).not.toBeNull();
    expect(moves).toBe(0);
    const staleTimer = pending!;
    // Release before the buffer fires: exactly one step lands and the buffer timer is removed.
    expect(call(scene, 'handleLegacyPlayMovementKeyUp', event)).toBe(true);
    expect(moves).toBe(1);
    expect(removed).toBeGreaterThanOrEqual(1);
    expect(scene.playMoveTimer).toBeNull();
    expect(scene.playMoveFlags).toEqual({ up: false, down: false, left: false, right: false });
    // Even if the old timer callback still ran, nothing is held any more: zero further steps.
    staleTimer();
    expect(moves).toBe(1);
  });

  test('release-to-stop: lifting the last held touch cancels the repeat, so no further step fires', () => {
    const { scene } = createScene({ layerOn: false });
    let pending: (() => void) | null = null;
    let removed = 0;
    scene.time.delayedCall = (_delay, callback) => { pending = callback; return { remove: () => { removed += 1; pending = null; } }; };
    let repeats = 0;
    Object.assign(scene, {
      playHeldTouchMoves: [{ pointerId: 1, deltaX: 1, deltaY: 0 }],
      playHeldTouchRepeatTimer: null,
      playHeldTouchRepeatDueAtMs: null,
      hudDirty: false,
      repeatLegacyPlayHeldTouchMove: () => { repeats += 1; }
    });
    call(scene, 'scheduleLegacyPlayHeldTouchRepeat', TICK_MS);
    expect(pending).not.toBeNull();
    expect(scene.playHeldTouchRepeatDueAtMs).toBe(scene.time.now + TICK_MS);
    expect(call(scene, 'releaseLegacyPlayHeldTouchMove', 1)).toBe(true);
    expect(removed).toBe(1);
    expect(pending).toBeNull();
    expect(scene.playHeldTouchRepeatTimer).toBeNull();
    expect(scene.playHeldTouchRepeatDueAtMs).toBeNull();
    expect(scene.playHeldTouchMoves).toEqual([]);
    expect(repeats).toBe(0);
  });
});
