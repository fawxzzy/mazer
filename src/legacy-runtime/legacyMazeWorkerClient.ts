// MAZER-PERF-008: the one place that constructs the maze generation Worker.
// An absent Worker (node, tests, very old browsers) or `?mazeWorker=off` (kill switch, and
// the A/B switch for measuring) means no background build is offered.
import {
  LegacyMazeWorkerHost,
  type LegacyMazeWorkerLike
} from './legacyMazeGenerationJob';

export const LEGACY_MAZE_WORKER_DISABLE_PARAM = 'mazeWorker';

const createDefaultMazeWorker = (): LegacyMazeWorkerLike | null => {
  if (typeof Worker === 'undefined') {
    return null;
  }
  if (typeof location !== 'undefined' && new URLSearchParams(location.search).get(LEGACY_MAZE_WORKER_DISABLE_PARAM) === 'off') {
    return null;
  }
  return new Worker(
    new URL('./legacyMazeGeneration.worker.ts', import.meta.url),
    { type: 'module' }
  ) as unknown as LegacyMazeWorkerLike;
};

// One host (one worker) per consumer, so cancelling one parked build never restarts the other's.
export const createLegacyMazeWorkerHost = (): LegacyMazeWorkerHost => new LegacyMazeWorkerHost(createDefaultMazeWorker);
