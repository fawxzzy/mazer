# Current Truth

Use this note as the anti-drift override when older prose, screenshots, or implementation layers disagree.

## Active lane

The active lane is now:

`legacy Unreal mechanics -> mobile-clean web game`

This supersedes the prior screenshot-grade visual 1:1 target as the main implementation direction.

2026-07-03 operator pivot:

- do not optimize future work for old screenshot-grade visual matching
- preserve and improve legacy gameplay logic, maze generation, AI/demo pathing, reset flow, HUD semantics, and input mechanics
- visual rendering may now change when it improves top-down clarity, mobile readability, board centering, player visibility, trail readability, or maintainability
- legacy screenshots remain useful historical reference, but they no longer define the active completion target

## Source-of-truth order

Read the repo in this order:

1. Restored Unreal legacy truth from `legacy/old-project.zip`
2. Legacy specs under `docs/legacy/`
3. Active mechanics/mobile contract docs:
   - `docs/research/MAZER_MECHANICS_MOBILE_COMPLETION_MARKER.md`
4. Reset-lane contract docs:
   - `docs/research/MAZER_LEGACY_WEB_PORT_CONTRACT.md`
   - `docs/research/MAZER_LEGACY_WEB_PARITY_MATRIX.md`
   - `docs/research/MAZER_LEGACY_ONE_TO_ONE_COMPLETION_MARKER.md`
   - `docs/system-map.md`
5. Legacy screenshots under `legacy/screenshots/`
6. Current web runtime code

If the current web app disagrees with restored gameplay/mechanics truth, restored legacy logic wins for this lane. If the current visual direction disagrees with old screenshot composition, the active mobile-clean direction wins.

## Current implementation truth

- The current web runtime has been reset to a smaller legacy-first Phaser shell.
- The old productized menu shell is no longer the active source of truth.
- The current front-door contract is legacy-shaped:
  - `Exit`
  - `Start`
  - `Options`
- The current runtime preserves the one-overlay-at-a-time rule.
- The current overlay family is:
  - options
  - features
  - game modes
  - pause
- The current menu shell is intentionally simpler and closer to the archived Unreal menu composition than the previous recovery shell.

## Current completion marker

Use `docs/research/MAZER_MECHANICS_MOBILE_COMPLETION_MARKER.md` as the active repo-wide completion meter.

Current active marker:

- `83%`

The old legacy visual 1:1 marker is retired at `93%` and is now archival. Do not ratchet it for future packets unless the operator explicitly reopens screenshot-grade legacy parity as the active target.

Why the active marker is not higher yet:

- the project already has strong mechanics coverage for legacy reset flow, generation lifecycle, AI demo routing, active input, collision, HUD semantics, and diagnostics
- the new target gives much less credit for visual screenshot mimicry and more credit for mobile playability/readability
- the remaining active work is cleaner mobile board sizing, player/trail readability, final play feel, maze-generation quality tuning, and continued mechanics proof
- active-play movement/collision/reset-return semantics are closer, keyboard movement now consumes accepted key events so browser defaults cannot compete with the game loop, browser focus loss now clears held movement flags/pending movement timers/pointer starts before stale input can replay, mobile pointer/touch play input now resolves through the same legacy play-step movement/collision contract as keyboard input, rejects pointer starts outside the active board bounds, binds an in-flight swipe to one pointer identity, ignores competing touches, accepts `pointerupoutside` for inside-board starts, clears stale pointer starts on game-out, and now has maintained-browser `mobile-touch-smoke` proof for three touch movement deltas with board/HUD bounds passing; shared mobile touch controls now route through document-capture fallback before Phaser overlay hit testing, pause/restart/toggle coordinates are separated from D-pad hit slop, runtime summaries expose overlay/resource state, and the maintained smoke proves pause-open plus restart/toggle state transitions, but same-target pause resume while the pause overlay is open remains open; generated play maze solution paths now walk from start to goal through the active `advanceLegacyPlayStep()` movement/collision contract, pause reset now preserves existing active-play trail history while returning the player to start instead of wiping the trail to `[start]`, camera-follow now keeps the static maze layer aligned with dynamic overlays/HUD/pointer bounds, and runtime diagnostics now expose the live active-play input buffer state for held directions, resolved vector, pending timer, pointer-start state, and the 50ms source delay; menu-demo reset semantics are closer, demo route candidate admission now follows the restored `AiTilePathCheck` gate, and the HUD timer/goal-arrow contract is now extracted/tested/published through visual diagnostics with source-exact bare timer text and degree readback; active-play HUD visual chrome now avoids the prior heavy bordered browser chip, runtime diagnostics are data-only so no debug/proof panel is drawn over the game, and visual diagnostics now mirror to a data-only DOM attribute for maintained-browser proof, but final mobile control affordances and final menu visual parity still need proof
- demo AI route/backtrack candidate gating is now aligned for the known dead-end spur seam, the menu walker route plan now derives from a source-shaped neighbor scan / potential-tile / path-stack backtracking planner instead of canonical-solution detour injection, wrong-branch recovery now reconnects to canonical replay through adjacent floor movement instead of a non-adjacent route splice, first-mistake route planning now stops once dead-end/backtrack/reacquire cue evidence has been emitted before replaying cleanly, cue movement now uses one AI step timer to match the extracted C++ `_PlayerAiDelayDuration` scheduling shape, route diagnostics expose `visitedUndoCount`, a deterministic proof fixture now exercises the legacy `_AiBackTrackUndoVisitedFlag` side-effect seam, menu demo bootstrap/advance tests now prove the browser-equivalent trail fade tail used for the old material-revert lane, generated legacy menu maze seed-family proof now verifies adjacent AI moves plus bounded route/traverse diagnostics on actual `menu-generated` mazes, and a bounded `GI_MazerGameInstance.uasset` scan found property names but no trustworthy serialized `_TileColorRevertDelay` default; exact Unreal `_TileColorRevertDelay` timing/material behavior and the numeric Blueprint AI delay default remain future tightening work
- maze generation process/stage ownership is mapped, browser shortcut topology now uses family-aware route-affecting bypasses with separated route-reconnection proof instead of random dead-end wall punches, generated domain play-maze rasters apply the restored `CreateShortCuts` opposite-corridor wall-bridge rule, and both live menu mazes plus active reset-lane play mazes now route through the procedural checkpoint path-builder family instead of leaving the main menu on the fixed screenshot snapshot. `createLegacyGeneratedMenuMaze()` uses the same source-shaped `CreateGrid` / `MapPath` / `CreatePath` / `_WallArray` / `CreateShortCuts` pipeline as `createLegacyMaze()`, but with menu-specific shortcut tuning and row-sliced menu drawing; `createLegacyMenuMaze()` remains only as a fixed screenshot comparison fixture. `Backtrack()` resumes from the selected next tile like the restored source instead of the already-carved path candidate; generated menu/play mazes also run a browser-safe playable-topology normalization that removes disconnected floor components and rebases trivially weak goals to the farthest reachable floor so the restored shortcut/path-builder work cannot leave unreachable visual noise or a degenerate route; generated play mazes now add a capped post-normalization shortcut reinforcement only when measured route quality is still `single-route`, then remeasure before publishing stats, so weak random shortcut outcomes can become meaningful multi-route mazes without reintroducing detached floor components; generated snapshots publish route-quality stats that separate any bypassable solution edge from meaningful detour-bearing bypass coverage across route bands, so `multi-route` can no longer be claimed from one shallow local loop; exact Unreal RNG/time seeding and line-for-line process-yield timing remain open
- HUD parity is now closed for the currently restored browser-equivalent source seam: active-play timer formatting uses the restored bare `M:SS` text plus `% 10` minute wrap, goal-arrow angle math publishes radians/degrees, proof bounds have a repo-owned helper and diagnostics readback, HUD chrome now stays in a minimal Timer/EndArrow widget lane, and runtime diagnostics stay data-only instead of drawing a visible proof panel; if a stronger Unreal widget blueprint/material source is recovered later, that evidence can reopen a narrower visual-style packet
- active-play maze rendering no longer uses the prior square-cell debug-style path fill; play mode now uses connected corridor segments with a flatter edge/core hierarchy, active-play dynamic trail/start/goal overlays use corridor/inset rendering instead of generic square `fillTile()` blocks, and the player now renders as a centered high-contrast halo/core marker so it reads above the route without changing topology, movement, or shortcuts. Dynamic trail width, start/goal marker inset, and player halo/core metrics now resolve through tile-size-aware helpers so ultra-narrow mobile tiles do not get oversized player blobs while larger desktop tiles retain visible weight.
- menu and play static board rendering now intentionally drops the heavier pseudo-3D pass: no offset path relief shadow, no extruded menu slab shadow stack, no visible menu grid overlay, no top-left bevel sheen, and no wall-cell bevel texture. The maze still uses connected corridor segments, but the visual lane is cleaner 2D readability rather than a trench-depth look.
- final screenshot-grade menu material/composition is still open

## What is already restored

- legacy archive extraction command: `npm run legacy:extract`
- restored Unreal truth workspace in ATLAS temp storage
- legacy menu-shaped web front door
- fixed legacy-shaped menu snapshot separated from the play-maze generator
- fixed legacy-shaped menu snapshot now projects its named 25-space blueprint into a 49-cell browser grid, which better matches the old source default-scale density while preserving contiguous demo path truth
- filled the fixed menu snapshot with staircase and right-spine silhouette branches for closer screenshot parity
- upper-left menu snapshot branches now carry a denser frame/pocket/lattice read, which moves the upper-left corner a little closer to the restored legacy screenshots without claiming final screenshot-grade closure
- upper-right menu snapshot branches now carry a small title-adjacent lattice run, which reduces one coarse upper-right board mass without claiming final screenshot-grade closure
- lower-left menu snapshot shelves now reduce the oversized empty lower-left block in the fixed front-door board, moving the board silhouette a little closer to the restored legacy screenshots without claiming final screenshot-grade closure
- title lockup is now tuned to sit deeper over the board instead of reading like a small shell label
- title lockup opacity now uses a more translucent green-glass profile, moving the wordmark closer to the restored screenshots without claiming exact wordmark material or overlap
- legacy-style menu demo board/trail presentation
- legacy menu demo now emits live recovery cues and cue-specific pacing instead of collapsing wrong-turn motion back to plain explore timing
- fixed front-door menu snapshot fixture also runs the mistake-enabled legacy recovery lane instead of a solver-only attract path, so screenshot-comparison fixtures can surface dead-end, backtrack, reacquire, and AI-only reset behavior
- fixed front-door menu snapshot fixture bootstrap settles into a visible `explore` pose before the first source-shaped dead-end/backtrack seam instead of stopping in `goal-hold` or `reset-hold`; live menu runtime now uses the procedural `menu-generated` lane for the actual first impression
- menu-demo humanized routing now builds its route from the restored AI loop shape: scan unvisited neighboring path/floor tiles, admit only `AiTilePathCheck` candidates, queue potential tiles idempotently, choose the nearest candidate to the end, backtrack through the path stack when direct movement fails, surface the direct-fail beat as `dead-end`, mark the first recovery seam as the AI-only reset point, reconnect to canonical replay through adjacent floor movement instead of a non-adjacent route splice, stop first-mistake exploration once the visible dead-end/backtrack/reacquire cue loop is represented before clean replay, and advance movement/backtrack/reacquire beats on a single AI step cadence like the extracted C++ timer loop
- menu-demo goal reset now queues an immediate process-8 reset request after reset-hold has elapsed instead of waiting one extra explore-step delay before the process-0 generation handoff, and AI-only reset replay is covered without regenerating the menu maze
- menu-demo wrong-turn selection now applies a legacy `AiTilePathCheck`-style candidate gate, so the attract runner no longer commits into a one-tile spur that exposes no unvisited onward path from the candidate tile
- legacy generation/reset now routes through explicit queued request contracts instead of collapsing every branch into immediate rebuild calls
- legacy generation consumption now carries explicit stage-7 finalize responsibilities for play/menu spawn, title, and timer start
- legacy process-8 reset branches now route through explicit reset requests for active-play return vs menu-demo regeneration
- menu-demo process-8 reset consumption now enqueues the next process-0 generation request instead of regenerating inline, which preserves a real reset-branch handoff in the scene update loop without claiming the full staged generator is ported
- legacy stage `0/3/4/5/6` execution cadence is now explicit for menu-sliced versus play-continuous generation
- legacy generation metadata now carries explicit checkpoint/shortcut budget contracts into runtime diagnostics for menu versus play lanes
- queued generation requests now publish their own build, stage, and budget contract alongside the live maze contract in scene diagnostics
- queued generation requests and consumed runtime mazes now carry an explicit stage-cursor projection, so diagnostics can distinguish queued process-0 entry from consumed stage-7 finalization without claiming the full staged Unreal generator is ported
- generation requests now carry the explicit delay-gated process-0 entry contract, and reset requests now carry the explicit initialized process-8 entry contract
- legacy level-building scheduler truth is now explicit in the runtime contract: process `0` requires the armed start-time + delay-start flag, the exact legacy delay duration remains honestly unrecovered, and initialized process `8` reset entry is marked as the branch that bypasses that delay gate
- legacy stage progression truth is now explicit in the runtime contract: stages now publish their own completion signals, next-stage transitions, and the stage-5 skip-to-6 rule when shortcuts are disabled
- stage `4` now advances directly to stage `6` when scale disables shortcut process `5`, so small-maze runtime plans no longer publish an impossible `4 -> 5` transition
- browser shortcut braiding now scores wall openings by useful loop distance, applies family-specific shortcut profiles, disables weak fallback shortcuts for sparse mazes, adds a bounded route-aware braided bypass pass after endpoint selection that requires separated route reconnection before opening the wall, applies a raster-level legacy shortcut bridge pass, and active `createLegacyMaze()` play snapshots now build topology through a source-shaped checkpoint path pass, convert path-neighbor walls through `CreatePath`-style wall-array collection, then apply the legacy opposite-corridor shortcut bridge rule through random wall-array removal plus capped weak-route reinforcement, so generated mazes can expose more than one start-goal route without starting from the previous DFS perfect-maze topology; generated play snapshots now also report stricter route-quality stats for bypassable solution edges, meaningful detour-bearing bypass edges, and route bands, guarding against future shortcut openings that look valid locally but only create shallow loops
- active `createLegacyMaze()` play snapshots now prune disconnected floor components after shortcut creation and rebase weak source-selected goals to the farthest reachable floor only when the restored source-shaped path builder would otherwise leave a trivially short route; this is a quality/stability guard for the browser port, not a new claim of exact Unreal RNG/timing parity
- menu static-board drawing now follows the stage-6 row-slice contract during generation application, so the front-door board reveal advances by legacy draw-stage rows instead of appearing only as one completed static pass
- menu stage-6 row-sliced drawing is now cadence-gated, so the front-door board reveal remains visible over time instead of advancing as fast as the browser frame loop can run
- active-play movement now follows the restored Unreal simultaneous-key input buffer: first movement keydown arms a 50ms resolve delay, held direction flags can combine into one composite step, opposing directions cancel, repeat movement resolves the current held vector immediately, the buffer clears on pause/menu/reset and browser focus-loss boundaries, and runtime diagnostics publish the live held flags, resolved vector, pending timer, pointer-start state, and source delay for browser-side feel review
- active-play pointer/touch input now maps mobile swipes and short taps into the same one-step vector contract used by keyboard movement before passing through the legacy axis-gated collision resolver; pointer starts outside the active board bounds are ignored so HUD/shell taps no longer trigger movement, in-flight swipes are bound to one pointer identity so second touches cannot overwrite the active start, `pointerupoutside` still completes inside-board swipes, game-out clears stale pointer starts, and `mobile-touch-smoke` now proves three maintained-browser touch movement deltas on the active play route
- active-play camera-follow now applies the same board offset to the static maze, dynamic overlays, HUD geometry, pointer-bound checks, and visual diagnostics board bounds; movement marks the static board dirty when camera-follow is active so player/trail layers and proof rectangles do not drift away from the maze
- active-play layout now uses a play-specific board-framing surface instead of reusing the front-door menu composition: the maintained `172x407` side-browser play board remains width-fit at `169x169` but is centered vertically (`top=119`, `bottom=288`) while menu mode keeps its stacked `Exit` / `Start` / `Options` layout (`250/300/350`), and visual diagnostics now publish the resolved layout/button surface for proof
- active-play collision now follows the restored Unreal axis-gated movement shape more closely: simultaneous movement checks the horizontal and vertical side gates independently, slides along the open axis when one held axis is blocked, and blocks a true diagonal corner move when the final diagonal tile is a wall
- active-play goal reset now uses the explicit process-8 `LegacyResetRequest` as the single return-to-menu authority, matching the restored Unreal `_ResetGame` -> process `8` branch more closely and removing the redundant scene-local `playResetReturnAtMs` shadow timer
- active-play pause reset now preserves existing trail history while moving the player back to the start tile, matching the restored source's `_ResetPlayerPosition` branch more closely than the prior browser trail wipe
- active-play HUD timer and goal-arrow geometry now route through `src/legacy-runtime/legacyPlayHud.ts`, and visual diagnostics publish source-exact bare `timerText`, `arrowAngleRadians`, and `arrowAngleDegrees` for desktop/mobile play-route proof
- active-play board rendering now shares the connected-corridor path segment treatment instead of drawing each walkable tile as a bright inset square, active-play dynamic overlays now use connected trail strokes plus inset start/goal markers instead of full square blocks, and the player marker is drawn from tile center with a high-contrast halo/core treatment. Overlay stroke/inset/player metrics now clamp responsively for tiny mobile tiles, reducing debug-grid, off-center, and oversized-marker visual drift in generated play mazes without changing maze topology
- legacy front-door `Exit` now routes through an explicit browser-safe quit equivalence contract instead of a temporary explanation overlay, ultra-narrow side-panel menu widths now use a vertical front-door button stack, viewport-fitted board, viewport-capped title scale, and a source-aware tighter title scale for dense `menu-generated` boards instead of the desktop/mobile row and normal portrait wordmark minimum, and the dead `message` overlay family has been removed from the active reset lane
- desktop menu layout now gives the front-door board more dominant space in wide viewports, which moves the current web shell closer to the legacy board-first screenshot composition without reopening other menu modules
- desktop title lockup now sits higher and reads less heavily over the board in wide viewports, which moves the wordmark treatment closer to the restored legacy screenshots without reopening button or backdrop ownership
- desktop front-door support chrome now uses narrower button boxes, more inward side-button placement, lighter button treatment, and a slightly stronger button-label/outline read in wide viewports, which moves the lower menu composition closer to the restored legacy screenshots without reopening board or backdrop ownership
- front-door button chrome now uses a darker menu-only pane fill and darker hover fill instead of translucent white block fills, moving `Exit`, `Start`, and `Options` closer to the restored dark support-pane treatment without changing overlay or pause button behavior
- desktop front-door button plates now use a larger legacy-facing width/height envelope while keeping portrait button sizing bounded, which moves the lower menu support plates closer to the restored screenshot proportions without changing button behavior
- front-door button layout now uses one shared button baseline for `Exit`, `Start`, and `Options` in desktop and portrait layouts, removing the browser-only lifted center-button read while preserving the existing labels and button actions
- legacy menu backdrop field now routes through an explicit backdrop owner contract in `src/legacy-runtime/legacyMenuBackdrop.ts`, with a denser cloudy/star treatment that moves the desktop space field closer to the restored screenshots without claiming final screenshot-grade closure
- desktop menu board material now reads darker and less evenly tiled in wide viewports, which moves the grayscale trench mass closer to the restored screenshots without claiming final screenshot-grade closure
- menu-mode trench rendering now carries a wider light-core read with quieter wall-grid noise, which moves the board tile read a little closer to the restored screenshots without claiming final screenshot-grade closure
- menu-mode trench core rendering now bridges across connected walkable neighbors, so the board reads less checkerboarded while still not claiming dense screenshot-grade geometry parity
- menu-mode trench rendering now uses a stronger closed-edge inset and narrower light-core channel, reducing the chunky filled-cell read without claiming final screenshot-grade corridor geometry parity
- menu-mode dynamic trail/start/goal/player overlays now use corridor-framed or inset rendering instead of full square cells, reducing the most obvious modern block-path read without claiming final screenshot-grade board parity
- menu-mode dynamic trail/start/goal/player overlays now also use thinner corridor/highlight ratios, reducing the chunky cyan route and marker footprint in both desktop and mobile browser captures without claiming exact legacy trail/sprite parity
- menu-mode dynamic trail/start/goal overlays now use a heavier corridor-style route/marker footprint than the hairline-thin pass, and the live player marker now uses a centered halo/core glyph instead of a low-contrast square; this improves readability without returning to full-square block cells or claiming exact player sprite parity
- menu-mode static trench rendering now uses segment-based connected strokes and a gray-slab/dark-route role hierarchy, reducing the previous broad filled-cell material read without claiming final screenshot-grade board parity
- menu-mode static route cores now use a wider dark channel and softer static edge pass, reducing the tiny-grid/checker read in dense route areas without claiming final screenshot-grade board parity
- menu-mode static board material now uses the restored screenshot-facing role direction more cleanly: light-gray connected corridor cores over darker wall/slab fields, with flat dark edge strokes preserved for path definition rather than fake trench depth; this improves the board/material read but still does not close screenshot-grade parity
- menu-mode static corridor rendering previously tested a dark offset relief shadow, but the current maintained renderer removes that pseudo-depth pass and residual wall-grid bevel noise so the procedural menu board reads as a cleaner 2D maze without claiming final screenshot-grade material parity
- menu-mode board material now uses darker wall/slab mass and stronger path-edge contrast, moving the board closer to the restored screenshots' hard charcoal/light-gray maze read without claiming exact silhouette, title overlap, or trail/sprite parity
- menu-mode static board material now uses a denser slab/tile-read pass for the maintained side-browser scale: wall mass is slightly lighter, path edge/core contrast is stronger, residual wall texture is more visible, and very small menu tiles no longer collapse into hairline-only strokes
- live menu maze identity is now explicit on the runtime maze object (`source: 'menu-generated'` versus `source: 'play-generated'`), while fixed screenshot fixtures remain tagged as `source: 'menu-snapshot'`; demo policy no longer guesses from grid size
- `runtimeDiagnostics=1` now flows through the live `MenuScene` update loop and publishes repo-owned runtime diagnostics instead of stopping at helper-only parsing/tests
- runtime diagnostics now publish a proof-only DOM attribute so localhost inspection does not depend on the hidden `window.__MAZER_*` globals alone, without drawing a visible debug/proof panel into the game
- runtime diagnostics expose active menu-demo cue, mistake-enabled lane state, path cursor, and generation stage cursor through the DOM attribute/window proof surfaces so front-door demo and stage-7 finalization proof no longer depends on visible debug text
- the removed visible runtime diagnostics panel was never legacy UI; keeping diagnostics data-only preserves proof while preventing proof tooling from polluting the maintained `4173` browser
- runtime and visual diagnostics now expose live menu-demo AI wrong-branch/backtrack/recovery counters plus stage-6 row-reveal progress, so menu AI review and generation-fluidity review no longer depend on placeholder counters or hidden row state
- runtime diagnostics now also expose `menuDemo.route` with route length, segment count, canonical path length, traverse duration, cue counts, trail-mode counts, and AI reset cursor; the representative split-flow menu AI route is guarded below 4x the canonical solution and under 60 seconds so shortcut-heavy recovery cannot silently regress into a runaway attract loop
- runtime diagnostics now expose compact maze provenance and quality readback under `generation.maze`, including `source`, `buildKind`, size, seed, solution path length, shortcut stats, checkpoint/path-builder stats, playable-topology normalization stats, and route-quality classification; maintained `4173` browser proof confirms the menu surface reports `menu-generated` and the play route reports `play-generated` without relying on hidden window globals
- legacy options/pause rebuilds now defer to overlay close instead of rebuilding immediately on field commit
- in-game pause commands now route through an explicit legacy pause lifecycle contract for `Back`, `Reset`, and `Main Menu`
- features and game-modes toggles now route through an explicit legacy overlay-toggle contract, with inverted `On/Off` copy kept only where the legacy widget actually owned it
- menu-time overlay fields now route through an explicit legacy field-commit contract, separating deferred reload-on-back fields from the immediate camera-flag path
- nested overlay routing from `Options` / `Pause` back through `Features` and `Game Modes` now routes through an explicit legacy overlay-routing contract
- legacy-style active play start path
- active-play HUD now uses a tighter timer/goal-arrow overlay, repo-owned timer/arrow geometry, a minimal source-shaped Timer/EndArrow visual treatment, and data-only diagnostics proof that bounds the full overlay footprint without drawing debug text in the maintained play browser
- legacy-style options/features/game-mode/pause overlay structure
- repo-owned reset-lane tests in `tests/reset/`

## What is not yet 1:1

- live menu topology and active reset-lane play topology now use a source-shaped checkpoint path builder instead of the previous DFS/fixed-snapshot split, and `Backtrack()` now returns the selected next tile like the restored source; generated menu/play mazes now also reject disconnected playable-looking floor components and avoid trivially weak goals, but exact Unreal RNG/time seeding and process-yield timing are still not claimed
- shortcut topology is stronger than the earlier browser-native random dead-end braider and now proves multiple route-bypass bands plus legacy opposite-corridor bridges in both the domain raster path and active reset-lane play snapshot path; the active reset-lane shortcut pass now consumes a duplicate-preserving `_WallArray` collected during the checkpoint path-builder's `CreatePath` equivalent, reports requested/attempted/created shortcut stats plus optional weak-route reinforcement stats, and now publishes route-quality stats that require meaningful detour-bearing bypass coverage across more than one route band before calling a play snapshot `multi-route`, but exact legacy randomness remains a partial port
- generation/reset branches, stage cadence, budget formulas, process-entry gates, the menu-demo process-8-to-process-0 handoff, shortcut-disabled stage `4 -> 6` progression, and menu stage-6 row-sliced drawing are now explicit runtime contracts
- stage `7` responsibilities, process `8` reset branches, process-0 delay entry, the menu reset handoff, shortcut-disabled stage progression, and stage `0/3/4/5/6` execution cadence are now explicit lifecycle truth
- stage-cursor diagnostics now expose queued process-0 entry and consumed stage-7 finalization, and visual/runtime diagnostics now expose the cadence-gated menu draw-stage row cursor, remaining rows, completion state, and percent progress
- the browser builder still resolves play topology as a one-shot browser-safe stage before stage-6 row reveal, so exact per-tick process-yield timing remains future gameplay/topology work rather than an unstated lifecycle claim; the visible row reveal is paced, and active play topology is now closer to the Unreal checkpoint path-builder and Backtrack return semantics than the prior DFS owner
- demo AI route/backtracking is now source-shaped instead of canonical-route-detour based, with live recovery cues, AI-only reset replay, goal reset handoff timing, `AiTilePathCheck` candidate admission, source-shaped potential-tile/path-stack backtracking, bounded first-mistake replay planning, single-timer AI movement cadence shape, live wrong-branch/backtrack/recovery diagnostics, positive visited-undo proof, menu trail-fade-tail proof, generated-menu seed-family adjacency/bounded-route proof, and a bounded `GI_MazerGameInstance.uasset` scan explicitly covered; exact Unreal material color-revert timing and the numeric Blueprint AI delay default remain open
- active-play movement, collision, mobile pointer/touch input, and reset-return ownership are closer after the simultaneous-key buffer, keyboard default-consumption guard, browser focus-loss cleanup, board-bounded pointer-vector adapter, one-active-pointer identity guard, pointer-up-outside completion path, game-out stale-pointer cleanup, generated-play solution traversal through `advanceLegacyPlayStep()`, maintained-browser `mobile-touch-smoke` movement proof, camera-follow layer/proof alignment, axis-gated collision, single reset-request, pause-reset trail-preservation ports, and data-only input-buffer diagnostics for maintained-browser feel review; touch-control state changes remain open
- in-game HUD is restored for the currently available source-backed browser seam: source-exact timer formatting, goal-arrow radians/degrees, proof bounds, minimal widget chrome, and diagnostics-safe docking are explicit repo-owned contracts
- active-play board material is closer after replacing square debug-cell path fills with connected corridors, moving active dynamic overlays into a corridor/inset lane, centering the player marker with a high-contrast halo/core glyph, removing the offset player shadow, and removing the static path relief shadow so the generated maze reads as a cleaner 2D surface; final old-game play-board styling is not yet screenshot-grade
- browser exit cannot literally execute the old engine quit behavior, but the bounded browser-safe quit equivalence is now explicit and proof-backed
- visual/material parity still needs another pass against screenshots and restored assets
- menu static/dynamic material, title opacity, front-door button pane fills/proportions/baseline, cyan route weight, and live player readability are closer after the corridor-frame, thinner-overlay, path-relief, title-glass, button dark-pane, material-contrast, dynamic-trail weight, button-plate proportion, button-baseline, dense-slab material, clean-2D de-depth, and centered player-marker passes, but the restored screenshots still show different exact player sprite treatment, exact maze silhouette, exact button placement, final title overlap, and tighter screenshot-grade composition than the current web runtime
- browser automation localhost still does not reliably expose the published `window.__MAZER_*` globals directly, but runtime diagnostics and visual diagnostics now have DOM-backed fallback read surfaces on the single `4173` preview server without visible debug panels, including the active maze source/build family, resolved layout/button surface, and board/HUD visual bounds needed to prove procedural menu versus play generation, active-play camera-follow alignment, and side-browser play/menu layout separation

## Current proof rule

For the reset lane, the local proof spine is:

1. `npm run legacy:extract`
2. `npm run verify`

Current `verify` means:

- reset-lane tests
- demo walker reset-flow proof tests
- production build

The older visual matrix / Edge live proof lane is now archival for comparison, not current closure truth for the reset lane.

Localhost operation rule:

- keep one maintained preview server on `http://127.0.0.1:4173/`
- prefer the in-app browser as the live human proof surface for the current branch
- reload that single tab after code changes instead of scattering proof across multiple localhost ports unless a packet explicitly needs another surface
- when judging legacy desktop screenshot parity from the side browser, use a temporary wider viewport on that same tab, then reset it instead of opening extra browser instances

## Current execution rule

- Do not run broad visual polish passes by default.
- Do not ratchet the active mechanics/mobile marker without a bounded segment proof packet.
- Do not restore the old `97%` or retired `93%` legacy visual 1:1 marker unless screenshot-grade parity is explicitly reopened.
- Lock work one module at a time:
  - maze generation / topology quality
  - demo AI route / pacing
  - active play movement / collision / reset
  - mobile input / layout / board readability
  - player / trail / HUD readability
- For the active module, name one owner chain, one proof surface, and one mechanics or mobile-readability miss before editing.

## Release rule

- Do not claim production parity with the old game unless the target is explicitly reopened and proved.
- Do not claim active mechanics/mobile completion until the active marker gaps are closed with proof.
- Do not reopen the old recovery/product shell as if it were the authoritative direction.

## Still open

- exact demo AI route/backtrack internals beyond the restored front-door recovery lane, cue/pacing surface, AI-only reset replay, immediate goal-reset handoff, `AiTilePathCheck` candidate gate, and connected reacquire path
- exact active-play feel beyond the keyboard/pointer/focus-loss movement adapters, one-active-pointer mobile guard, pause-reset trail preservation, camera-follow layer alignment, active dynamic corridor overlays, extracted source-exact timer/goal-arrow contract, tighter compact overlay, minimal HUD widget chrome, data-only diagnostics proof, and full proof bounds
- exact generation/reset-flow parity beyond the queued request contract
- final mobile-clean board sizing, player/trail readability, visible touch-control affordances, and same-target pause resume proof while the pause overlay is open
