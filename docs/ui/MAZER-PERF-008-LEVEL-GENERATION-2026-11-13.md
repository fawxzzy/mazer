# MAZER-PERF-008: level-start maze generation off the main thread (2026-11-13)

Headless measurements only (Chromium, CPU throttled 4x by DevTools). Nothing was checked on a real phone.

## Finding

The card said generation is "already hidden behind the level intro". It is not. Generation is synchronous
(`createLegacyRuntimeMazeForMode`) and runs inside the frame that installs the maze
(`MenuScene.applyGenerationRequest`), BEFORE the intro starts. The intro clock is stamped from that frame's
`this.time.now`, so a long generation does not hide behind the intro: it freezes the screen, then the next
frame shows the intro already that many milliseconds in (the first beams and diamond fills are skipped).

Three call sites block the main thread:

| Moment | Call | Before (4x, level 60-100) |
| --- | --- | --- |
| Start pressed (menu to play) | `rebuildMaze`, full candidate search | `startPlayMode` 210-894 ms |
| Goal reached in play (and menu demo goal) | `precomputeLegacyDeconstructResetMaze`, one candidate | 226-1273 ms, mid-animation |
| First maze at boot / `?previewLevel=N` / overlay rebuild | `rebuildMaze` | unchanged, see below |

Un-throttled (node, `scripts/analysis/measure-level-generation.ts`): median 12-55 ms, worst 170 ms over levels
1-268 on both boards. In Chromium at 4x the same call took 60-1275 ms.

## Change

`src/legacy-runtime/legacyMazeGenerationJob.ts` runs the SAME production call (`createLegacyRuntimeMazeForMode`
with the same arguments) in a Web Worker (`legacyMazeGeneration.worker.ts`, created only in
`legacyMazeWorkerClient.ts`).

- Start pressed: while the menu is idle the scene starts one play-start build in the worker (a random seed, as
  `startPlayMode` would draw). `rebuildMaze` takes it only if scale, aspect ratio, profile and target complexity
  still match (`resolveLegacyMazeGenerationJobKey`), otherwise it generates as before.
- Goal reached: the one-candidate precompute runs in the worker. The maze is attached when the goal-reset request
  is consumed (after the old maze finished deconstructing), not at the arm call, so the worker has the whole
  deconstruct window.
- Correctness never depends on the worker. `resolve()` returns the worker maze only if it already arrived;
  otherwise it runs the identical call synchronously (the old behaviour). No `Worker`, `?mazeWorker=off`, a
  construction error or a worker error all mean the old synchronous path.
- Same seed, same maze: the worker executes the same function; the only transform is structured clone, which the
  tests assert is lossless (`tests/reset/legacy-maze-generation-job.test.ts`). Golden ladder fixtures are untouched.

## After (4x, production build, 390x844 and 1280x720)

| Moment | Before | After |
| --- | --- | --- |
| `startPlayMode` (level 100) | 210-894 ms | 11-23 ms |
| `precomputeLegacyDeconstructResetMaze` (level 60) | 226-1273 ms | 2-5 ms |

## Not changed (follow-ups)

- The very first maze of a session (boot straight into play, `?previewLevel=N`, Play Mazer shortcut) has no idle
  menu time to prefetch in, so it still generates synchronously.
- The remaining long tasks after a maze installs are rendering (board bake, intro draw) in headless software
  canvas at 4x; they are not generation and were not changed.

## How to re-measure

`npx vite-node --script ./scripts/analysis/measure-level-generation.ts` for the un-throttled floor. In a browser,
set CDP `Emulation.setCPUThrottlingRate` to 4, load `?runtimeDiagnostics=1` (add `&mazeWorker=off` for the
synchronous baseline), and time `scene.startPlayMode()` (scene = `__MAZER_GAME__.scene.scenes.find(s => s.boardTileLayer)`).
