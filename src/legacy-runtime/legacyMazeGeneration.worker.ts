// MAZER-PERF-008 worker entry: runs the production maze generation and posts the snapshot back.
// Imports only the pure job module, so no Phaser, DOM or storage code loads in the worker.
import {
  runLegacyMazeGenerationJob,
  type LegacyMazeGenerationJobRequest,
  type LegacyMazeGenerationJobResponse
} from './legacyMazeGenerationJob';

const scope = self as unknown as {
  onmessage: ((event: { data: LegacyMazeGenerationJobRequest }) => void) | null;
  postMessage(message: LegacyMazeGenerationJobResponse): void;
};

scope.onmessage = (event) => {
  const { id, input } = event.data;
  try {
    scope.postMessage({ id, maze: runLegacyMazeGenerationJob(input) });
  } catch (error) {
    scope.postMessage({ id, error: error instanceof Error ? error.message : String(error) });
  }
};
