import { describe, expect, test } from 'vitest';
import {
  consumeLegacyGenerationRequest,
  createLegacyGenerationRequest
} from '../../src/legacy-runtime/legacyGenerationLifecycle';
import {
  LegacyMazePrefetchSlot,
  LegacyMazeWorkerHost,
  createLegacyMazeGenerationJobInput,
  createLegacyMazeGenerationJobInputFromRequest,
  resolveLegacyMazeGenerationJobKey,
  runLegacyMazeGenerationJob,
  type LegacyMazeGenerationJobRequest,
  type LegacyMazeGenerationJobResponse,
  type LegacyMazeWorkerLike
} from '../../src/legacy-runtime/legacyMazeGenerationJob';
import { resolveLegacyMazeGenerationProfileForProgression } from '../../src/legacy-runtime/legacyProgression';
import { hashLadderMaze, trackForLevel } from '../../scripts/analysis/lib/progressionLadderSampling';

// MAZER-PERF-008. A worker build must be the SAME maze the synchronous path builds.

const PHONE_ASPECT = 23 / 51;
const DESKTOP_ASPECT = 45 / 27;

const createRequest = (level: number, aspectRatio: number, seed: number, mode: 'play' | 'menu' = 'play') => {
  const track = trackForLevel(level);
  return createLegacyGenerationRequest({
    aspectRatio,
    currentSeed: 1,
    dueAtMs: 0,
    generationProfile: resolveLegacyMazeGenerationProfileForProgression(track),
    mode,
    reason: mode === 'play' ? 'play-start' : 'boot-menu',
    scale: 35,
    seedOverride: seed,
    targetComplexity: track.targetComplexity
  });
};

// A worker that runs on request, with a structured clone each way like a real one, but only
// answers when the test calls `flush()`.
class FakeWorker implements LegacyMazeWorkerLike {
  public onerror: ((event: unknown) => void) | null = null;
  public onmessage: ((event: { data: LegacyMazeGenerationJobResponse }) => void) | null = null;
  public terminated = false;
  public readonly queue: LegacyMazeGenerationJobRequest[] = [];
  public throwOnRun = false;

  public postMessage(message: LegacyMazeGenerationJobRequest): void {
    this.queue.push(structuredClone(message));
  }

  public terminate(): void {
    this.terminated = true;
    this.queue.length = 0;
  }

  public flush(): void {
    for (const request of this.queue.splice(0)) {
      const response: LegacyMazeGenerationJobResponse = this.throwOnRun
        ? { id: request.id, error: 'boom' }
        : { id: request.id, maze: structuredClone(runLegacyMazeGenerationJob(request.input)) };
      this.onmessage?.({ data: response });
    }
  }
}

const createHost = () => {
  const workers: FakeWorker[] = [];
  const host = new LegacyMazeWorkerHost(() => {
    const worker = new FakeWorker();
    workers.push(worker);
    return worker;
  });
  return { host, workers };
};

describe('maze generation job (MAZER-PERF-008)', () => {
  test('the job input from a request reproduces consumeLegacyGenerationRequest exactly, for play and menu', () => {
    for (const [level, aspect, seed, mode] of [
      [1, PHONE_ASPECT, 1337, 'play'],
      [8, PHONE_ASPECT, 7919, 'play'],
      [60, DESKTOP_ASPECT, 104729, 'play'],
      [198, PHONE_ASPECT, 31337, 'play'],
      [40, DESKTOP_ASPECT, 4242, 'menu']
    ] as const) {
      const request = createRequest(level, aspect, seed, mode);
      const viaRequest = consumeLegacyGenerationRequest(request, 35);
      const viaJob = runLegacyMazeGenerationJob(createLegacyMazeGenerationJobInputFromRequest(request, 35));
      expect(viaJob).toEqual(viaRequest);
      expect(hashLadderMaze(viaJob as never)).toBe(hashLadderMaze(viaRequest as never));
    }
  });

  test('a maze survives the worker structured clone unchanged (the only transform a worker adds)', () => {
    for (const level of [1, 30, 198]) {
      const maze = runLegacyMazeGenerationJob(createLegacyMazeGenerationJobInputFromRequest(createRequest(level, PHONE_ASPECT, 99), 35));
      expect(structuredClone(maze)).toEqual(maze);
    }
  });

  test('the precompute call shape (candidateCount 1) is also reproduced exactly', () => {
    const track = trackForLevel(60);
    const profile = resolveLegacyMazeGenerationProfileForProgression(track);
    const input = createLegacyMazeGenerationJobInput({
      aspectRatio: DESKTOP_ASPECT, mode: 'play', profile, scale: 35, seed: 555, selection: { candidateCount: 1, targetComplexity: track.targetComplexity }
    });
    expect(runLegacyMazeGenerationJob(input)).toEqual(runLegacyMazeGenerationJob(structuredClone(input)));
  });

  test('the job key ignores the seed and changes with every other generation input', () => {
    const base = createLegacyMazeGenerationJobInputFromRequest(createRequest(30, PHONE_ASPECT, 1), 35);
    const key = resolveLegacyMazeGenerationJobKey(base);
    expect(resolveLegacyMazeGenerationJobKey(createLegacyMazeGenerationJobInputFromRequest(createRequest(30, PHONE_ASPECT, 2), 35))).toBe(key);
    expect(resolveLegacyMazeGenerationJobKey(createLegacyMazeGenerationJobInputFromRequest(createRequest(31, PHONE_ASPECT, 1), 35))).not.toBe(key);
    expect(resolveLegacyMazeGenerationJobKey(createLegacyMazeGenerationJobInputFromRequest(createRequest(30, DESKTOP_ASPECT, 1), 35))).not.toBe(key);
    expect(resolveLegacyMazeGenerationJobKey(createLegacyMazeGenerationJobInputFromRequest(createRequest(30, PHONE_ASPECT, 1), 36))).not.toBe(key);
    expect(resolveLegacyMazeGenerationJobKey(createLegacyMazeGenerationJobInputFromRequest(createRequest(30, PHONE_ASPECT, 1, 'menu'), 35))).not.toBe(key);
  });

  describe('worker host', () => {
    const input = createLegacyMazeGenerationJobInputFromRequest(createRequest(30, PHONE_ASPECT, 2024), 35);

    test('a build the worker finished resolves to the worker maze, equal to the synchronous one', () => {
      const { host, workers } = createHost();
      const build = host.start(input);
      expect(build?.status).toBe('pending');
      workers[0]?.flush();
      expect(build?.status).toBe('ready');
      const sync = runLegacyMazeGenerationJob(input);
      expect(build?.resolve()).toEqual(sync);
      expect(build?.resolve()).toBe(build?.maze);
    });

    test('a build the worker has not finished falls back to the identical synchronous build and stops the worker', () => {
      const { host, workers } = createHost();
      const build = host.start(input);
      expect(build?.resolve()).toEqual(runLegacyMazeGenerationJob(input));
      expect(build?.status).toBe('cancelled');
      expect(workers[0]?.terminated).toBe(true);
    });

    test('a worker error falls back to the synchronous build', () => {
      const { host, workers } = createHost();
      const failing = host.start(input);
      const worker = workers[0];
      if (worker) {
        worker.throwOnRun = true;
        worker.flush();
      }
      expect(failing?.status).toBe('failed');
      expect(failing?.resolve()).toEqual(runLegacyMazeGenerationJob(input));
    });

    test('no worker means no background build and not available', () => {
      const host = new LegacyMazeWorkerHost(() => null);
      expect(host.available).toBe(false);
      expect(host.start(input)).toBeNull();
      const throwing = new LegacyMazeWorkerHost(() => { throw new Error('no worker'); });
      expect(throwing.start(input)).toBeNull();
      expect(throwing.available).toBe(false);
    });

    test('a worker that errors at runtime marks pending builds failed and is not restarted', () => {
      const { host, workers } = createHost();
      const build = host.start(input);
      workers[0]?.onerror?.({});
      expect(build?.status).toBe('failed');
      expect(host.available).toBe(false);
      expect(workers[0]?.terminated).toBe(true);
    });
  });

  describe('prefetch slot', () => {
    const input = createLegacyMazeGenerationJobInputFromRequest(createRequest(30, PHONE_ASPECT, 2024), 35);

    test('hands a finished maze over exactly once, with its seed, when the label matches', () => {
      const { host, workers } = createHost();
      const slot = new LegacyMazePrefetchSlot(host);
      expect(slot.start(input, 'k')).toBe(true);
      expect(slot.occupied).toBe(true);
      workers[0]?.flush();
      const taken = slot.take('k');
      expect(taken?.seed).toBe(2024);
      expect(taken?.maze).toEqual(runLegacyMazeGenerationJob(input));
      expect(slot.take('k')).toBeNull();
      expect(slot.occupied).toBe(false);
    });

    test('a different label discards the build instead of handing over a wrong maze', () => {
      const { host, workers } = createHost();
      const slot = new LegacyMazePrefetchSlot(host);
      slot.start(input, 'a');
      workers[0]?.flush();
      expect(slot.take('b')).toBeNull();
      expect(slot.occupied).toBe(false);
    });

    test('clear(label) only clears a matching label; start replaces a parked build', () => {
      const { host } = createHost();
      const slot = new LegacyMazePrefetchSlot(host);
      slot.start(input, 'play');
      slot.clear('menu');
      expect(slot.occupied).toBe(true);
      slot.clear('play');
      expect(slot.occupied).toBe(false);
      slot.start(input, 'x');
      slot.start(input, 'y');
      expect(slot.take('x')).toBeNull();
    });

    test('peekSeed reveals the parked seed without taking it, and the maze can still arrive afterwards', () => {
      const { host, workers } = createHost();
      const slot = new LegacyMazePrefetchSlot(host);
      slot.start(input, 'play');
      expect(slot.peekSeed('play')).toBe(2024);
      expect(slot.peekSeed('menu')).toBeNull();
      expect(slot.occupied).toBe(true);
      workers[0]?.flush();
      expect(slot.take('play')?.maze).toEqual(runLegacyMazeGenerationJob(input));
      expect(slot.peekSeed('play')).toBeNull();
    });

    test('warm() creates the worker without starting a build', () => {
      const { host, workers } = createHost();
      const slot = new LegacyMazePrefetchSlot(host);
      expect(workers).toHaveLength(0);
      slot.warm();
      expect(workers).toHaveLength(1);
      expect(slot.occupied).toBe(false);
    });

    test('with no worker start() returns false and parks nothing', () => {
      const slot = new LegacyMazePrefetchSlot(new LegacyMazeWorkerHost(() => null));
      expect(slot.available).toBe(false);
      expect(slot.start(input, 'k')).toBe(false);
      expect(slot.occupied).toBe(false);
    });
  });
});
