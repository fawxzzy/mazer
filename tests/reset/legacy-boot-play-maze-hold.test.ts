import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import {
  LEGACY_BOOT_PLAY_MAZE_STALL_MS,
  LegacyBootPlayMazeHold,
  isLegacyBootPlayMazeCheapToBuildInline,
  shouldStartLegacyBootPlayMazeEarly,
  type LegacyBootPlayMazeHoldHost
} from '../../src/legacy-runtime/legacyBootPlayMazeHold';
import {
  consumeLegacyGenerationRequest,
  createLegacyGenerationRequest
} from '../../src/legacy-runtime/legacyGenerationLifecycle';
import {
  LegacyMazePrefetchSlot,
  LegacyMazeWorkerHost,
  createLegacyMazeGenerationJobInputFromRequest,
  resolveLegacyMazeGenerationJobKey,
  runLegacyMazeGenerationJob,
  type LegacyMazeGenerationJobRequest,
  type LegacyMazeGenerationJobResponse,
  type LegacyMazeWorkerLike
} from '../../src/legacy-runtime/legacyMazeGenerationJob';
import { resolveLegacyMazeGenerationProfileForProgression } from '../../src/legacy-runtime/legacyProgression';
import { hashLadderMaze, trackForLevel } from '../../scripts/analysis/lib/progressionLadderSampling';

// MAZER-PERF-009. The first maze of a session comes from the worker slot; the hold only decides when
// the direct-to-play start may run, and every way the worker can fail ends in the old synchronous build.

const PHONE_ASPECT = 23 / 51;
const DESKTOP_ASPECT = 45 / 27;

const createBootRequest = (level: number, aspectRatio: number, seed: number) => {
  const track = trackForLevel(level);
  return createLegacyGenerationRequest({
    aspectRatio,
    currentSeed: 1,
    dueAtMs: 0,
    generationProfile: resolveLegacyMazeGenerationProfileForProgression(track),
    mode: 'play',
    reason: 'play-start',
    scale: 35,
    seedOverride: seed,
    targetComplexity: track.targetComplexity
  });
};

class FakeWorker implements LegacyMazeWorkerLike {
  public onerror: ((event: unknown) => void) | null = null;
  public onmessage: ((event: { data: LegacyMazeGenerationJobResponse }) => void) | null = null;
  public readonly queue: LegacyMazeGenerationJobRequest[] = [];
  public fail = false;

  public postMessage(message: LegacyMazeGenerationJobRequest): void {
    this.queue.push(structuredClone(message));
  }

  public terminate(): void {
    this.queue.length = 0;
  }

  public flush(): void {
    for (const request of this.queue.splice(0)) {
      this.onmessage?.({
        data: this.fail
          ? { id: request.id, error: 'boom' }
          : { id: request.id, maze: structuredClone(runLegacyMazeGenerationJob(request.input)) }
      });
    }
  }
}

const createSlot = () => {
  const workers: FakeWorker[] = [];
  const slot = new LegacyMazePrefetchSlot(new LegacyMazeWorkerHost(() => {
    const worker = new FakeWorker();
    workers.push(worker);
    return worker;
  }));
  return { slot, workers };
};

const hostFor = (slot: LegacyMazePrefetchSlot, level: number, aspect: number, seed: number): LegacyBootPlayMazeHoldHost => {
  const input = createLegacyMazeGenerationJobInputFromRequest(createBootRequest(level, aspect, seed), 35);
  return {
    get available() { return slot.available; },
    start: () => slot.start(input, resolveLegacyMazeGenerationJobKey(input)),
    status: () => slot.peekStatus()
  };
};

describe('boot play maze hold (MAZER-PERF-009)', () => {
  test('waits while the worker builds, then lets play start, and the parked maze is byte-identical to the synchronous one', () => {
    for (const [level, aspect, seed] of [[1, PHONE_ASPECT, 7], [60, PHONE_ASPECT, 4242], [100, DESKTOP_ASPECT, 99_001], [250, PHONE_ASPECT, 31337]] as const) {
      const { slot, workers } = createSlot();
      const hold = new LegacyBootPlayMazeHold();
      const host = hostFor(slot, level, aspect, seed);
      expect(hold.begin(host)).toBe(true);
      expect(hold.waiting).toBe(true);
      expect(hold.holds(16, host)).toBe(true);
      expect(hold.holds(500, host)).toBe(true);
      workers[0]?.flush();
      expect(hold.holds(520, host)).toBe(false);
      expect(hold.waiting).toBe(false);

      const request = createBootRequest(level, aspect, seed);
      const key = resolveLegacyMazeGenerationJobKey(createLegacyMazeGenerationJobInputFromRequest(request, 35));
      const taken = slot.take(key);
      expect(taken?.seed).toBe(seed);
      const synchronous = consumeLegacyGenerationRequest(request, 35);
      expect(hashLadderMaze(taken!.maze)).toBe(hashLadderMaze(synchronous));
      expect(taken!.maze).toEqual(synchronous);
    }
  });

  test('begin is idempotent and a build that never began starts on the first holds()', () => {
    const { slot, workers } = createSlot();
    const hold = new LegacyBootPlayMazeHold();
    const host = hostFor(slot, 30, PHONE_ASPECT, 5);
    expect(hold.holds(0, host)).toBe(true);
    expect(hold.begin(host)).toBe(true);
    expect(workers).toHaveLength(1);
    expect(workers[0]?.queue).toHaveLength(1);
  });

  test('no worker: nothing is held and the start is the synchronous path', () => {
    const slot = new LegacyMazePrefetchSlot(new LegacyMazeWorkerHost(() => null));
    const hold = new LegacyBootPlayMazeHold();
    const host = hostFor(slot, 30, PHONE_ASPECT, 5);
    expect(hold.begin(host)).toBe(false);
    expect(hold.waiting).toBe(false);
    expect(hold.holds(1, host)).toBe(false);
    expect(slot.occupied).toBe(false);
  });

  test('a worker error ends the hold at once; resolve() then builds synchronously and identically', () => {
    const { slot, workers } = createSlot();
    const hold = new LegacyBootPlayMazeHold();
    const host = hostFor(slot, 100, PHONE_ASPECT, 11);
    hold.begin(host);
    workers[0]!.fail = true;
    workers[0]?.flush();
    expect(hold.holds(5, host)).toBe(false);
    const request = createBootRequest(100, PHONE_ASPECT, 11);
    const taken = slot.take(resolveLegacyMazeGenerationJobKey(createLegacyMazeGenerationJobInputFromRequest(request, 35)));
    expect(taken?.maze).toEqual(consumeLegacyGenerationRequest(request, 35));
  });

  test('a stalled worker is abandoned after the stall bound, not before', () => {
    const { slot } = createSlot();
    const hold = new LegacyBootPlayMazeHold();
    const host = hostFor(slot, 100, PHONE_ASPECT, 11);
    hold.begin(host);
    expect(hold.holds(1000, host)).toBe(true);
    expect(hold.holds(1000 + LEGACY_BOOT_PLAY_MAZE_STALL_MS - 1, host)).toBe(true);
    expect(hold.holds(1000 + LEGACY_BOOT_PLAY_MAZE_STALL_MS, host)).toBe(false);
    expect(hold.phase).toBe('released');
    // Once released it never holds again (the start proceeds and takes or rebuilds).
    expect(hold.holds(1000 + LEGACY_BOOT_PLAY_MAZE_STALL_MS + 1, host)).toBe(false);
  });

  test('a parked build that someone else took (or cleared) releases the hold', () => {
    const { slot, workers } = createSlot();
    const hold = new LegacyBootPlayMazeHold();
    const host = hostFor(slot, 100, PHONE_ASPECT, 11);
    hold.begin(host);
    slot.clear();
    workers[0]?.flush();
    expect(hold.holds(5, host)).toBe(false);
  });

  test('a maze whose inputs changed meanwhile (late account progression) is discarded by the job key, never used', () => {
    const { slot, workers } = createSlot();
    const hold = new LegacyBootPlayMazeHold();
    hold.begin(hostFor(slot, 30, PHONE_ASPECT, 8));
    workers[0]?.flush();
    expect(hold.holds(1, hostFor(slot, 30, PHONE_ASPECT, 8))).toBe(false);
    const changed = createLegacyMazeGenerationJobInputFromRequest(createBootRequest(31, PHONE_ASPECT, 8), 35);
    expect(slot.take(resolveLegacyMazeGenerationJobKey(changed))).toBeNull();
  });

  test('release() and reset() move the phase, reset re-arms a later direct-to-play start', () => {
    const { slot } = createSlot();
    const hold = new LegacyBootPlayMazeHold();
    const host = hostFor(slot, 30, PHONE_ASPECT, 5);
    hold.begin(host);
    hold.release();
    expect(hold.waiting).toBe(false);
    expect(hold.holds(1, host)).toBe(false);
    hold.reset();
    expect(hold.phase).toBe('idle');
  });

  test('a straight-corridor start (level 1) is built inline, every other level goes to the worker', () => {
    expect(isLegacyBootPlayMazeCheapToBuildInline({ layout: 'corridor' })).toBe(true);
    expect(isLegacyBootPlayMazeCheapToBuildInline({})).toBe(false);
    expect(isLegacyBootPlayMazeCheapToBuildInline(null)).toBe(false);
    expect(isLegacyBootPlayMazeCheapToBuildInline(resolveLegacyMazeGenerationProfileForProgression(trackForLevel(1)))).toBe(true);
    for (const level of [2, 3, 4, 10, 100, 268]) {
      expect(isLegacyBootPlayMazeCheapToBuildInline(resolveLegacyMazeGenerationProfileForProgression(trackForLevel(level)))).toBe(false);
    }
  });

  test('the early start needs a direct-to-play boot, an unlocked gate and no password recovery', () => {
    const base = { authGateLocked: false, passwordRecoveryActive: false, pendingBootPlayStart: true };
    expect(shouldStartLegacyBootPlayMazeEarly(base)).toBe(true);
    expect(shouldStartLegacyBootPlayMazeEarly({ ...base, pendingBootPlayStart: false })).toBe(false);
    expect(shouldStartLegacyBootPlayMazeEarly({ ...base, authGateLocked: true })).toBe(false);
    expect(shouldStartLegacyBootPlayMazeEarly({ ...base, passwordRecoveryActive: true })).toBe(false);
  });
});

describe('prefetch slot status (MAZER-PERF-009)', () => {
  test('peekStatus follows the parked build and is null when nothing is parked', () => {
    const { slot, workers } = createSlot();
    expect(slot.peekStatus()).toBeNull();
    const input = createLegacyMazeGenerationJobInputFromRequest(createBootRequest(30, PHONE_ASPECT, 2024), 35);
    slot.start(input, 'k');
    expect(slot.peekStatus()).toBe('pending');
    workers[0]?.flush();
    expect(slot.peekStatus()).toBe('ready');
    slot.take('k');
    expect(slot.peekStatus()).toBeNull();
  });
});

describe('MenuScene wiring (MAZER-PERF-009)', () => {
  const scene = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8').split(String.fromCharCode(13, 10)).join(String.fromCharCode(10));
  const block = (start: string, end: string): string => {
    const from = scene.indexOf(start);
    expect(from).toBeGreaterThan(0);
    return scene.slice(from, scene.indexOf(end, from));
  };

  test('create starts the first play maze only for an unlocked direct-to-play boot, before the placeholder, and uses the instant corridor placeholder only then', () => {
    const create = block('  public create(): void {', '    this.installInput();');
    expect(create.indexOf('shouldStartLegacyBootPlayMazeEarly({')).toBeGreaterThan(0);
    expect(create.indexOf('this.bootPlayMazeHold.begin(')).toBeLessThan(create.indexOf("reason: 'boot-menu'"));
    expect(create).toContain("generationProfile: bootPlayMazeBuilding ? { layout: 'corridor' } : this.resolveLegacyMazeGenerationProfileForMode('menu')");
    // The hand-off (signed-out redirect) runs before Phaser exists; nothing in create may start it earlier than the gate check.
    expect(create).toContain('authGateLocked: this.authGateLocked');
  });

  test('the pending start keeps its pinned gate condition, holds inside it, and keeps the demo and the idle prefetch out of the way', () => {
    const update = block('  public update(time: number, delta: number): void {', '    this.syncLegacyAuthOpeningTimeout(time);');
    expect(update).toContain('if (this.pendingBootPlayStart && !this.authGateAwaitingResolution && !this.authGateLocked) {');
    expect(update).toContain('if (!this.holdLegacyBootPlayStart(time)) {');
    const rest = block('    this.advanceLegacyMenuStaticDrawStage(time);', '    if (this.isLegacyMenuBuildPrerollActive(time)) {');
    expect(rest).toContain('&& !this.pendingBootPlayStart');
    expect(scene.replace(/\s+/g, ' ')).toContain('&& !this.authGateLocked && !this.pendingBootPlayStart');
  });

  test('a pinned seed only takes a parked maze built for exactly that seed, and the loader cover also covers the hold', () => {
    expect(scene).toContain('parked !== null && this.explicitRuntimeMazeSeed && parked.seed !== this.mazeSeed ? null : parked');
    expect(scene).toContain('this.authGateAwaitingResolution || this.bootPlayMazeHold.waiting');
    // While held with auth already resolved the label is positioned under the icon (it used to sit at 0,0) and neutral.
    expect(scene).toContain('const holdLayout = this.appLoader?.currentLayout;');
  });
});
