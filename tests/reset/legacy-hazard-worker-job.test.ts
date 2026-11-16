import { describe, expect, test } from 'vitest';
import {
  LegacyMazeWorkerHost,
  resolveLegacyMazeGenerationJobKey,
  runLegacyMazeGenerationJob,
  runLegacyMazeGenerationJobResponse,
  takeLegacyMazeHazardOverlay,
  type LegacyMazeGenerationJobRequest,
  type LegacyMazeGenerationJobResponse,
  type LegacyMazeWorkerLike
} from '../../src/legacy-runtime/legacyMazeGenerationJob';
import { resolveLegacyHazardOverlay } from '../../src/legacy-runtime/legacyHazardOverlay';
import { createLegacyHazardGateController } from '../../src/legacy-runtime/legacyHazardGateController';
import { createLadderJobInput, findGateFixture, PHONE_ASPECT } from './legacy-hazard-gate-fixture';

// Slice H3: the hazard overlay runs inside the maze worker. The scene sends `enabled` in the job
// (a worker cannot read the query string or localStorage, GEN-020); the overlay travels next to the
// maze and never inside it, and a flag-off job is byte-identical to the pre-H3 one.

class FakeWorker implements LegacyMazeWorkerLike {
  public onerror: ((event: unknown) => void) | null = null;
  public onmessage: ((event: { data: LegacyMazeGenerationJobResponse }) => void) | null = null;
  public readonly queue: LegacyMazeGenerationJobRequest[] = [];
  public readonly posted: string[] = [];

  public postMessage(message: LegacyMazeGenerationJobRequest): void {
    this.posted.push(JSON.stringify(message));
    this.queue.push(structuredClone(message));
  }

  public terminate(): void {
    this.queue.length = 0;
  }

  // Runs exactly what legacyMazeGeneration.worker.ts runs, with a structured clone each way.
  public flush(): void {
    for (const request of this.queue.splice(0)) {
      this.onmessage?.({ data: structuredClone(runLegacyMazeGenerationJobResponse(request.id, request.input)) });
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

describe('hazard overlay in the maze worker (slice H3)', () => {
  test('flag off: the job, its key and the worker response carry no hazard field at all', () => {
    const input = createLadderJobInput(12, PHONE_ASPECT, 7);
    expect('hazard' in input).toBe(false);
    expect(resolveLegacyMazeGenerationJobKey(input)).not.toMatch(/hazard/);
    const response = runLegacyMazeGenerationJobResponse(1, input);
    expect(Object.keys(response).sort()).toEqual(['id', 'maze']);
    expect(JSON.stringify(response)).not.toMatch(/hazard/i);
  });

  test('flag on: the same maze, a different key, and the overlay the main thread would compute', () => {
    const { level, seed } = findGateFixture();
    const off = createLadderJobInput(level, PHONE_ASPECT, seed);
    const on = createLadderJobInput(level, PHONE_ASPECT, seed, { enabled: true, level });
    expect(resolveLegacyMazeGenerationJobKey(on)).not.toBe(resolveLegacyMazeGenerationJobKey(off));
    const response = runLegacyMazeGenerationJobResponse(4, on);
    if (!('maze' in response)) { throw new Error('expected a maze'); }
    expect(response.maze).toEqual(runLegacyMazeGenerationJob(off));
    expect(JSON.stringify(response.maze)).not.toMatch(/hazard/i);
    expect(response.hazardOverlay).toEqual(resolveLegacyHazardOverlay(response.maze, { enabled: true, level }));
  });

  test('the host parks the worker overlay next to the maze; the controller takes it once', () => {
    const { level, seed, overlay } = findGateFixture();
    const { host, workers } = createHost();
    const build = host.start(createLadderJobInput(level, PHONE_ASPECT, seed, { enabled: true, level }));
    expect(build).not.toBeNull();
    expect(workers[0]!.posted[0]).toMatch(/"hazard":\{"enabled":true,"level":10\}/);
    workers[0]!.flush();
    const maze = build!.resolve();
    expect(JSON.stringify(maze)).not.toMatch(/hazard/i);
    // A different level (the track moved on) is not adopted.
    expect(takeLegacyMazeHazardOverlay(maze, level + 1)).toBeUndefined();
    expect(takeLegacyMazeHazardOverlay(maze, level)).toBeUndefined();

    const again = host.start(createLadderJobInput(level, PHONE_ASPECT, seed, { enabled: true, level }));
    workers[0]!.flush();
    const sameMaze = again!.resolve();
    const controller = createLegacyHazardGateController();
    const result = controller.install(sameMaze, { mode: 'play', level, playerLevel: level, workerOverlay: takeLegacyMazeHazardOverlay(sameMaze, level) });
    expect(result.overlaySource).toBe('worker');
    expect(controller.receiptFields()?.hazardDigest).toBe(overlay.digest);
    // Taken once: a second install of the same maze computes on the main thread.
    expect(takeLegacyMazeHazardOverlay(sameMaze, level)).toBeUndefined();
  });

  test('a flag-off host build parks nothing', () => {
    const { level, seed } = findGateFixture();
    const { host, workers } = createHost();
    const build = host.start(createLadderJobInput(level, PHONE_ASPECT, seed));
    workers[0]!.flush();
    expect(workers[0]!.posted[0]).not.toMatch(/hazard/);
    expect(takeLegacyMazeHazardOverlay(build!.resolve(), level)).toBeUndefined();
  });
});
