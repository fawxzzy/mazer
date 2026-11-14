/**
 * MAZER-PERF-009: User Timing around one maze generation, so "how long did generating a maze block
 * THIS thread" is observable in a real browser without a profiler.
 *
 * A `mazer:maze-generation` measure is recorded on the thread that ran the generation. The main
 * thread's PerformanceObserver therefore sees only the generations that ran synchronously on it
 * (the placeholder menu maze, a build whose worker result was not ready, `?mazeWorker=off`); a
 * generation done in the maze Web Worker records into the worker's own timeline and never shows
 * up on the main thread. Read by scripts/analysis/measure-first-maze.mjs.
 *
 * Observation only: it never changes what is generated, and any failure to record is swallowed.
 */
export const LEGACY_MAZE_GENERATION_MEASURE_NAME = 'mazer:maze-generation';

export const timeLegacyMazeGeneration = <T>(detail: { mode: string; scale: number }, build: () => T): T => {
  if (typeof performance === 'undefined' || typeof performance.measure !== 'function') {
    return build();
  }
  const start = performance.now();
  try {
    return build();
  } finally {
    try {
      performance.measure(LEGACY_MAZE_GENERATION_MEASURE_NAME, { detail, end: performance.now(), start });
    } catch {
      // Observation only.
    }
  }
};
