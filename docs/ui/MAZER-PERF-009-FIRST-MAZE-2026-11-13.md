# MAZER-PERF-009: the first maze of a session off the main thread (2026-11-13)

Headless measurements only (Chromium, CPU throttled by DevTools). Nothing was checked on a real phone.

## Finding

PERF-008 moved level-start and goal-reset generation into a Web Worker, but the FIRST maze of a session had no idle
menu time to prefetch in, so a boot straight into play (`?mode=play`, the Play Mazer shortcut, `?previewLevel=N`, the
launch right after the signed-out hand-off returns) still generated on the main thread. Two synchronous generations
ran, both measured with User Timing (`mazer:maze-generation`, see below), production build, 390x844 @ DPR 3,
`?mazeWorker=off` (identical to the pre-change path):

| Where | What | 1x CPU | 4x CPU |
| --- | --- | --- | --- |
| `MenuScene.create` | menu placeholder maze (thrown away a moment later when play starts) | 14 to 18 ms | 79 to 263 ms |
| first `update` frame | the play maze (`startPlayMode`), level 100 | 98 to 396 ms | 497 to 1334 ms |

The play maze cost grows with the level (level 1 is a straight corridor: 5 ms at 1x, 29 to 95 ms at 4x).

## Options evaluated

| Option | Verdict |
| --- | --- |
| Build the first play maze in the PERF-008 worker as soon as its inputs are known, hold the direct-to-play start (behind the shared loader cover) until it arrives | **Chosen.** Removes the play maze from the main thread entirely, reuses the proven worker and job key check, keeps the sync fallback. |
| Time-slice generation on the main thread | Rejected. The generator is one deterministic, non-resumable pass (candidate search plus felt tuning); slicing it means re-engineering it, and any change risks the "same seed, same maze" golden fixtures. The worker gets the same effect with the generator untouched. |
| Draw the first frames from a cheaper placeholder | Used for the throwaway menu placeholder only (straight corridor, below). It cannot replace the play maze: the player needs the real maze. |

## Change

- `src/legacy-runtime/legacyBootPlayMazeHold.ts` (pure state machine, 13 tests in
  `tests/reset/legacy-boot-play-maze-hold.test.ts`): `begin` starts the play-start build in the existing worker slot;
  `holds` says whether the pending direct-to-play start must still wait. The wait ends when the maze is ready, when
  there is no worker, when the worker errors or the build was cancelled, or after a 6 s stall bound
  (`LEGACY_BOOT_PLAY_MAZE_STALL_MS`); every one of those is the old synchronous start.
- `MenuScene` (a few lines): `create` starts the build right before the menu placeholder (so it runs in parallel with
  the placeholder and the first frames); `update` keeps the existing `pendingBootPlayStart && !awaiting && !locked`
  condition and asks `holdLegacyBootPlayStart` inside it; the loader cover stays up while the hold waits (the loader
  only appears after 150 ms, so a quick build is never visible); the menu demo and the idle prefetch stay out of the
  way of a pending direct-to-play start.
- When the worker build is running, the throwaway menu placeholder is the instant straight corridor
  (`{ layout: 'corridor' }`) instead of a full menu-level maze. It is only ever visible under the loader cover for a
  moment, then play replaces it.
- A pinned seed (`?seed=`) may now take a parked maze, but only one built for exactly that seed.
- `legacyGenerationTiming.ts`: `createLegacyRuntimeMazeForMode` records a `mazer:maze-generation` User Timing
  measure on the thread that ran it. The main thread therefore sees only generations that ran synchronously on it;
  a worker generation records into the worker's own timeline. Observation only.
- `scripts/analysis/measure-first-maze.mjs`: the measurement script (see "How to re-measure").

## Signed-out hand-off, lifecycle and fallbacks

- The signed-out redirect to the account host runs in `src/boot/main.ts` BEFORE Phaser exists, so a launch that is about
  to redirect never constructs the scene and never starts a worker. Inside the scene the early start additionally
  requires `!authGateLocked` (a locked gate is a signed-out visitor on the failure state).
  A direct-to-play start whose gate is still locked no longer starts the idle prefetch worker either (it used to).
- Backgrounding: the worker keeps running; the hold is evaluated in `update`, which does not run while the page is
  frozen. On return the maze is ready (taken) or, past the stall bound, the start runs synchronously exactly as before.
- Account progression arriving late changes the job key, so `LegacyMazePrefetchSlot.take` discards the parked maze and
  the start builds synchronously. A wasted worker generation is the worst case.
- Kill switch and tests: `?mazeWorker=off`, no `Worker` (node, tests) or a blocked/failing worker script all take the
  old synchronous path (checked in the browser with the worker script request aborted).
- Same seed, same maze: the worker runs the same function; the golden ladder fixtures are untouched; in the browser
  the maze for two pinned seeds on both routes is identical with the worker and with `?mazeWorker=off`.

## After

Production build, `?mazeWorker=off` (the pre-change path) against the worker path, 3 runs each, medians with min-max in
brackets. "Menu placeholder" and "play maze" are the main-thread `mazer:maze-generation` measures of the first maze of
the session (nothing else generates before play starts).

| Viewport | Route | CPU | Path | Menu placeholder (ms) | Play maze on the main thread (ms) | Longest task (ms) |
| --- | --- | --- | --- | --- | --- | --- |
| 390x844 @3 | previewLevel=100 | 1x | sync (off) | 15 (14-15) | 146 (86-264) | 587 |
| 390x844 @3 | previewLevel=100 | 1x | worker | 11 (10-14) | **0** | 279 |
| 390x844 @3 | previewLevel=100 | 4x | sync (off) | 92 (71-141) | 621 (333-1010) | 2188 |
| 390x844 @3 | previewLevel=100 | 4x | worker | 50 (47-53) | **0** | 1628 |
| 1280x720 @1 | previewLevel=100 | 1x | sync (off) | 11 (11-12) | 105 (49-134) | 311 |
| 1280x720 @1 | previewLevel=100 | 1x | worker | 9 (6-17) | **0** | 157 |
| 1280x720 @1 | previewLevel=100 | 4x | sync (off) | 71 (35-73) | 217 (129-455) | 1375 |
| 1280x720 @1 | previewLevel=100 | 4x | worker | 52 (42-76) | **0** | 1003 |

("Longest task" is every task up to 2.5 s after the play maze installs, so it is dominated by the board bake and
software canvas rendering, see below; it is shown to be honest about what is left, not as a generation number.)

- The play maze no longer runs on the main thread at level 100 on any measured route, viewport or CPU rate: 0 ms where
  it was 86-1010 ms (4x: 333-1010 ms). Level 1 (the straight tutorial corridor) stays a synchronous start on purpose:
  it costs 2-5 ms at 1x and 19-29 ms at 4x, and measured through the worker it installed 0.8 to 2 s LATER at 4x for
  that 25 ms job (worker start-up plus waiting for a frame); from level 3 on the main-thread cost is 165 to 960 ms at
  4x, which is what the worker removes (`isLegacyBootPlayMazeCheapToBuildInline`). `startPlayMode` itself drops from 120-150 ms to 23-47 ms (install only).
- What still runs on the main thread: the throwaway menu placeholder. With the worker building it is the instant
  straight corridor. In the preview sandbox the menu (AI) track sits at level 1, so the old placeholder was a
  corridor too and the table shows no gain there; for an account whose AI track is high the old placeholder is a full
  menu-level maze (node, hot: 458 ms phone board and 70 ms desktop board at level 100, against 2.4 to 4.5 ms for the
  corridor), which is what the corridor replaces. What is left is the generator's first-call cost on a cold main
  thread (module code compiled lazily on first use): 6 to 17 ms at 1x and 34 to 92 ms at 4x, independent of level, and
  in the last 4x sample 90 ms with the worker starting alongside it on a loaded machine against 34 to 47 ms without.
  **That is above "a few ms" at 4x.** Removing it needs the placeholder to avoid the generator entirely (a prebuilt
  literal snapshot), which touches the maze snapshot contract; left as a follow-up rather than guessed at.
- Cost: time until the play maze is installed. At 1x it is the same within noise (level 100, medians 1136 to 1232 ms on
  the phone viewport, 739 to 721 ms on desktop). At 4x it is 0.8 to 1.5 s later (5024 to 5859 ms phone, 3245 to 4717 ms
  desktop, noisy machine) because the start waits for the worker (start-up, generation, and the next frame of a slow
  main thread) behind the loader instead of freezing for the generation. Frames stay alive while it builds; the trade
  is a longer wait for no blocked frame, and only on a slow device.
- Stall bound: in some runs under heavy machine load (other jobs saturating the CPU, 4x on top) the worker had not
  answered after 6 s, and the start fell back to the synchronous build as designed (observed as `play` generations on
  the main thread in those runs). The bound trades a longer wait on a starved worker against cancelling a slow but
  working one; 6 s is above any legitimate worker time measured here (about 1 to 1.5 s at 4x, level 100).

Phone simulation (Playwright Chromium, mobile UA, touch, `display-mode: standalone` emulated by a `matchMedia` /
`navigator.standalone` override, 4x CPU): 390x844 @3, 360x740 @2.625, 412x915 @2.625. In every profile the held start
shows the loader cover with a centred `Loading…` label (looked at), the play board then installs at the expected size
(25x51, 25x49 on the short phone), and there were no console errors. With the worker script request aborted the start
falls back to the synchronous build and still reaches play; `?mazeWorker=off` is the old path. Freezing the page
(`Page.setWebLifecycleState` frozen for 3 s) while the start is held, then resuming, reaches play with no errors. The
install gate does not run on localhost, so standalone emulation only exercises the geometry path.

## Post-install long task: cause

Reproduced in the unminified dev build at 4x, DPR 3, level 100 (profiler spans, three runs). The first `update` frame after
the maze installs is 250 to 390 ms, of which `drawBoardPaths` is 242 to 359 ms and, inside it, `composeBoardTileReveal`
(the board tile bake) is 207 to 231 ms; the first Phaser `render` adds 100 to 116 ms and `rebuildUi` 100 to 217 ms. After
that every frame is 265 to 370 ms of canvas composition (`batchSprite` and the Graphics renderer) in headless software
canvas at DPR 3. Generation is not in that task: the play maze no longer generates on the main thread, and before this
change it was a separate block of 333 to 1010 ms earlier in the same frame, not part of the bake. The one-off 908 ms task
seen in a PERF-008 sample is therefore the install frame's bake plus first render (plus the generation then still in
front of it); the only 900 ms-class task in these runs before play starts is Phaser's own initialisation
(`webpackUniversalModuleDefinition`, `testWebGL`, texture generation), 1.0 to 2.7 s at 4x. Not changed here: the bake and
the render are Phaser/canvas work. A follow-up could split the bake across frames (or bake in a worker via
OffscreenCanvas); that changes the reveal, which another lane is editing.

## How to re-measure

`node scripts/analysis/measure-first-maze.mjs --base-url=http://127.0.0.1:<port> --scenarios=preview,play --level=100
--viewports=390x844@3 --throttle=4 --runs=3 [--worker=off] [--profile]` against a production preview (`--worker=off`
is the pre-change path). `mainThreadGenerations` is every generation that ran on the main thread; `--profile` adds
profiler spans (use the unminified dev server for readable names).
