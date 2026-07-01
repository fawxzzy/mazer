# Current Truth

Use this note as the anti-drift override when older prose, screenshots, or implementation layers disagree.

## Active lane

The active lane is now:

`legacy Unreal truth -> web app reset/port`

This supersedes the prior productized 2D recovery shell as the main implementation direction.

## Source-of-truth order

Read the repo in this order:

1. Restored Unreal legacy truth from `legacy/old-project.zip`
2. Legacy screenshots under `legacy/screenshots/`
3. Legacy specs under `docs/legacy/`
4. Reset-lane contract docs:
   - `docs/research/MAZER_LEGACY_WEB_PORT_CONTRACT.md`
   - `docs/research/MAZER_LEGACY_WEB_PARITY_MATRIX.md`
   - `docs/research/MAZER_LEGACY_ONE_TO_ONE_COMPLETION_MARKER.md`
   - `docs/system-map.md`
5. Current web runtime code

If the current web app disagrees with restored legacy truth, legacy wins for this lane.

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

## Current 1:1 completion marker

Use `docs/research/MAZER_LEGACY_ONE_TO_ONE_COMPLETION_MARKER.md` as the repo-wide completion meter.

Current held marker:

- `87%`

Why it is not higher yet:

- the previous `97%` posture was a contract/proof-surface overstatement for a literal old-Mazer 1:1 clone marker
- restored screenshots and the current localhost browser surface still show material visual drift in board silhouette, final relief, title/button composition, and screenshot-grade menu presentation even after the fixed menu snapshot moved from the earlier 25-cell approximation to a denser 49-cell projection, the menu corridors gained a darker offset relief pass, the wordmark opacity moved closer to the old translucent title treatment, the front-door buttons gained a darker legacy-facing pane-fill chrome plus larger desktop support-plate proportions, the board material gained darker wall/slab mass with harder path-edge contrast, and the cyan menu-demo route gained a thicker corridor-style footprint
- active-play movement/collision/reset-return semantics are closer, menu-demo reset semantics are closer, demo route candidate admission now follows the restored `AiTilePathCheck` gate, and the HUD timer/goal-arrow contract is now extracted/tested/published through visual diagnostics with source-exact bare timer text and degree readback; active-play HUD visual chrome now avoids the prior heavy bordered browser chip, and runtime diagnostics are data-only so no debug/proof panel is drawn over the game, but broader active-play feel and final menu visual parity still need proof
- demo AI route/backtrack candidate gating is now aligned for the known dead-end spur seam; line-for-line topology/path-stack internals remain future tightening work
- maze generation process/stage ownership is mapped, browser shortcut topology now uses family-aware route-affecting bypasses with separated route-reconnection proof instead of random dead-end wall punches, generated domain play-maze rasters apply the restored `CreateShortCuts` opposite-corridor wall-bridge rule, and active reset-lane play mazes now use a checkpoint path-builder in `createLegacyMaze()` that mirrors the legacy `CreateGrid` / `MapPath` / `CreatePath` responsibility split before feeding a duplicate-preserving `_WallArray` into the shortcut stage; `Backtrack()` now resumes from the selected next tile like the restored source instead of the already-carved path candidate; generated play mazes also run a browser-safe playable-topology normalization that removes disconnected floor components and rebases trivially weak goals to the farthest reachable floor so the restored shortcut/path-builder work cannot leave unreachable visual noise or a degenerate play route; exact Unreal RNG/time seeding and line-for-line process-yield timing remain open
- HUD parity is now closed for the currently restored browser-equivalent source seam: active-play timer formatting uses the restored bare `M:SS` text plus `% 10` minute wrap, goal-arrow angle math publishes radians/degrees, proof bounds have a repo-owned helper and diagnostics readback, HUD chrome now stays in a minimal Timer/EndArrow widget lane, and runtime diagnostics stay data-only instead of drawing a visible proof panel; if a stronger Unreal widget blueprint/material source is recovered later, that evidence can reopen a narrower visual-style packet
- active-play maze rendering no longer uses the prior square-cell debug-style path fill; play mode now uses connected corridor segments with a darker edge/core hierarchy, which reduces the white-grid regression while keeping topology, movement, and shortcuts unchanged
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
- fixed front-door menu snapshot now also runs the mistake-enabled legacy recovery lane instead of a solver-only attract path, so the canonical menu demo can surface dead-end, backtrack, reacquire, and AI-only reset behavior
- fixed front-door menu snapshot bootstrap now settles into a visible `explore` pose instead of stopping in `goal-hold` or `reset-hold`, which keeps the first live menu impression closer to the restored legacy screenshots
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
- browser shortcut braiding now scores wall openings by useful loop distance, applies family-specific shortcut profiles, disables weak fallback shortcuts for sparse mazes, adds a bounded route-aware braided bypass pass after endpoint selection that requires separated route reconnection before opening the wall, applies a raster-level legacy shortcut bridge pass, and active `createLegacyMaze()` play snapshots now build topology through a source-shaped checkpoint path pass, convert path-neighbor walls through `CreatePath`-style wall-array collection, then apply the legacy opposite-corridor shortcut bridge rule through random wall-array removal, so generated mazes can expose more than one start-goal route without starting from the previous DFS perfect-maze topology
- active `createLegacyMaze()` play snapshots now prune disconnected floor components after shortcut creation and rebase weak source-selected goals to the farthest reachable floor only when the restored source-shaped path builder would otherwise leave a trivially short route; this is a quality/stability guard for the browser port, not a new claim of exact Unreal RNG/timing parity
- menu static-board drawing now follows the stage-6 row-slice contract during generation application, so the front-door board reveal advances by legacy draw-stage rows instead of appearing only as one completed static pass
- menu stage-6 row-sliced drawing is now cadence-gated, so the front-door board reveal remains visible over time instead of advancing as fast as the browser frame loop can run
- active-play movement now follows the restored Unreal simultaneous-key input buffer: first movement keydown arms a 50ms resolve delay, held direction flags can combine into one composite step, opposing directions cancel, repeat movement resolves the current held vector immediately, and the buffer clears on pause/menu/reset boundaries
- active-play collision now follows the restored Unreal axis-gated movement shape more closely: simultaneous movement checks the horizontal and vertical side gates independently, slides along the open axis when one held axis is blocked, and blocks a true diagonal corner move when the final diagonal tile is a wall
- active-play goal reset now uses the explicit process-8 `LegacyResetRequest` as the single return-to-menu authority, matching the restored Unreal `_ResetGame` -> process `8` branch more closely and removing the redundant scene-local `playResetReturnAtMs` shadow timer
- active-play HUD timer and goal-arrow geometry now route through `src/legacy-runtime/legacyPlayHud.ts`, and visual diagnostics publish source-exact bare `timerText`, `arrowAngleRadians`, and `arrowAngleDegrees` for desktop/mobile play-route proof
- active-play board rendering now shares the connected-corridor path segment treatment instead of drawing each walkable tile as a bright inset square, reducing debug-grid visual drift in generated play mazes without changing maze topology
- legacy front-door `Exit` now routes through an explicit browser-safe quit equivalence contract instead of a temporary explanation overlay, and the dead `message` overlay family has been removed from the active reset lane
- desktop menu layout now gives the front-door board more dominant space in wide viewports, which moves the current web shell closer to the legacy board-first screenshot composition without reopening other menu modules
- desktop title lockup now sits higher and reads less heavily over the board in wide viewports, which moves the wordmark treatment closer to the restored legacy screenshots without reopening button or backdrop ownership
- desktop front-door support chrome now uses narrower button boxes, more inward side-button placement, lighter button treatment, and a slightly stronger button-label/outline read in wide viewports, which moves the lower menu composition closer to the restored legacy screenshots without reopening board or backdrop ownership
- front-door button chrome now uses a darker menu-only pane fill and darker hover fill instead of translucent white block fills, moving `Exit`, `Start`, and `Options` closer to the restored dark support-pane treatment without changing overlay or pause button behavior
- desktop front-door button plates now use a larger legacy-facing width/height envelope while keeping portrait button sizing bounded, which moves the lower menu support plates closer to the restored screenshot proportions without changing button behavior
- legacy menu backdrop field now routes through an explicit backdrop owner contract in `src/legacy-runtime/legacyMenuBackdrop.ts`, with a denser cloudy/star treatment that moves the desktop space field closer to the restored screenshots without claiming final screenshot-grade closure
- desktop menu board material now reads darker and less evenly tiled in wide viewports, which moves the grayscale trench mass closer to the restored screenshots without claiming final screenshot-grade closure
- menu-mode trench rendering now carries a wider light-core read with quieter wall-grid noise, which moves the board tile read a little closer to the restored screenshots without claiming final screenshot-grade closure
- menu-mode trench core rendering now bridges across connected walkable neighbors, so the current fixed web snapshot reads less checkerboarded while still not claiming dense screenshot-grade geometry parity
- menu-mode trench rendering now uses a stronger closed-edge inset and narrower light-core channel, reducing the chunky filled-cell read without claiming final screenshot-grade corridor geometry parity
- menu-mode dynamic trail/start/goal/player overlays now use corridor-framed or inset rendering instead of full square cells, reducing the most obvious modern block-path read without claiming final screenshot-grade board parity
- menu-mode dynamic trail/start/goal/player overlays now also use thinner corridor/highlight ratios, reducing the chunky cyan route and marker footprint in both desktop and mobile browser captures without claiming exact legacy trail/sprite parity
- menu-mode dynamic trail/start/goal/player overlays now use a heavier corridor-style route/marker footprint than the hairline-thin pass, moving the cyan traversal path closer to restored screenshot weight without returning to full-square block cells or claiming exact player sprite parity
- menu-mode static trench rendering now uses segment-based connected strokes and a gray-slab/dark-route role hierarchy, reducing the previous broad filled-cell material read without claiming final screenshot-grade board parity
- menu-mode static route cores now use a wider dark channel and softer static edge pass, reducing the tiny-grid/checker read in dense route areas without claiming final screenshot-grade board parity
- menu-mode static board material now uses the restored screenshot-facing role direction more closely: light-gray connected corridor cores over darker wall/slab fields, with dark edge strokes preserved for trench depth; this improves the board/material read but still does not close screenshot-grade parity
- menu-mode static corridor rendering now adds a dark offset relief shadow behind connected path segments and quiets residual wall-grid noise, reducing the flat modern line-art read in desktop/mobile browser proof without claiming final screenshot-grade material parity
- menu-mode board material now uses darker wall/slab mass and stronger path-edge contrast, moving the board closer to the restored screenshots' hard charcoal/light-gray maze read without claiming exact silhouette, title overlap, or trail/sprite parity
- menu-mode fixed snapshot identity is now explicit on the runtime maze object (`source: 'menu-snapshot'` versus `source: 'play-generated'`), so fixed-snapshot demo policy no longer guesses from size and generated 49-cell play mazes stay on the generic demo path
- `runtimeDiagnostics=1` now flows through the live `MenuScene` update loop and publishes repo-owned runtime diagnostics instead of stopping at helper-only parsing/tests
- runtime diagnostics now publish a proof-only DOM attribute so localhost inspection does not depend on the hidden `window.__MAZER_*` globals alone, without drawing a visible debug/proof panel into the game
- runtime diagnostics expose active menu-demo cue, mistake-enabled lane state, path cursor, and generation stage cursor through the DOM attribute/window proof surfaces so front-door demo and stage-7 finalization proof no longer depends on visible debug text
- the removed visible runtime diagnostics panel was never legacy UI; keeping diagnostics data-only preserves proof while preventing proof tooling from polluting the maintained `4173` browser
- runtime and visual diagnostics now expose live menu-demo AI wrong-branch/backtrack/recovery counters plus stage-6 row-reveal progress, so menu AI review and generation-fluidity review no longer depend on placeholder counters or hidden row state
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

- active reset-lane play topology now uses a source-shaped checkpoint path builder instead of the previous DFS perfect-maze owner, and `Backtrack()` now returns the selected next tile like the restored source; generated play mazes now also reject disconnected playable-looking floor components and avoid trivially weak goals, but exact Unreal RNG/time seeding and process-yield timing are still not claimed
- shortcut topology is stronger than the earlier browser-native random dead-end braider and now proves multiple route-bypass bands plus legacy opposite-corridor bridges in both the domain raster path and active reset-lane play snapshot path; the active reset-lane shortcut pass now consumes a duplicate-preserving `_WallArray` collected during the checkpoint path-builder's `CreatePath` equivalent and reports requested/attempted/created shortcut stats, but exact legacy randomness remains a partial port
- generation/reset branches, stage cadence, budget formulas, process-entry gates, the menu-demo process-8-to-process-0 handoff, shortcut-disabled stage `4 -> 6` progression, and menu stage-6 row-sliced drawing are now explicit runtime contracts
- stage `7` responsibilities, process `8` reset branches, process-0 delay entry, the menu reset handoff, shortcut-disabled stage progression, and stage `0/3/4/5/6` execution cadence are now explicit lifecycle truth
- stage-cursor diagnostics now expose queued process-0 entry and consumed stage-7 finalization, and visual/runtime diagnostics now expose the cadence-gated menu draw-stage row cursor, remaining rows, completion state, and percent progress
- the browser builder still resolves play topology as a one-shot browser-safe stage before stage-6 row reveal, so exact per-tick process-yield timing remains future gameplay/topology work rather than an unstated lifecycle claim; the visible row reveal is paced, and active play topology is now closer to the Unreal checkpoint path-builder and Backtrack return semantics than the prior DFS owner
- demo AI route/backtracking is not a line-for-line Unreal stack port, but live recovery cues, AI-only reset replay, goal reset handoff timing, `AiTilePathCheck` candidate admission, and live wrong-branch/backtrack/recovery diagnostics are now explicitly covered
- active-play movement, collision, and reset-return ownership are closer after the simultaneous-key buffer, axis-gated collision, and single reset-request ports
- in-game HUD is restored for the currently available source-backed browser seam: source-exact timer formatting, goal-arrow radians/degrees, proof bounds, minimal widget chrome, and diagnostics-safe docking are explicit repo-owned contracts
- active-play board material is closer after replacing square debug-cell path fills with connected corridors, but final old-game play-board styling is not yet screenshot-grade
- browser exit cannot literally execute the old engine quit behavior, but the bounded browser-safe quit equivalence is now explicit and proof-backed
- visual/material parity still needs another pass against screenshots and restored assets
- menu static/dynamic material, title opacity, front-door button pane fills/proportions, and cyan route weight are closer after the corridor-frame, thinner-overlay, path-relief, title-glass, button dark-pane, material-contrast, dynamic-trail weight, and button-plate proportion passes, but the restored screenshots still show different exact player sprite treatment, exact maze silhouette, exact button placement, final title overlap, and tighter screenshot-grade composition than the current web runtime
- browser automation localhost still does not expose the published `window.__MAZER_*` globals directly, but runtime diagnostics now have a DOM-backed fallback read surface on the single `4173` preview server without a visible debug panel

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

## Current parity execution rule

- Do not run broad menu-wide polish passes by default.
- Do not ratchet the 1:1 marker without a bounded segment proof packet.
- Do not restore the old `97%` marker by counting mapped owner contracts as visual/gameplay closure.
- On every legacy 1:1 pass, re-evaluate the marker before closeout and state whether the weighted table changed or held flat.
- Lock menu parity one module at a time:
  - title lockup
  - button chrome
  - board silhouette
  - board material / tile read
  - backdrop field
  - demo route / pacing
- For the active module, name one owner chain, one proof surface, and one visible legacy miss before editing.

## Release rule

- Do not claim production parity with the old game yet.
- Do not claim 1:1 parity until the parity matrix gaps are actually closed.
- Do not reopen the old recovery/product shell as if it were the authoritative direction.

## Still open

- exact menu snapshot silhouette and attract-route parity
- final desktop backdrop/material exactness still needs screenshot-grade tightening even after the board-dominance, title-lockup, button-support, explicit backdrop-owner, darker board-material, and lower-left snapshot shelf corrections
- connected trench-core rendering reduces the separated-cell read in the current fixed menu snapshot, but the restored screenshots still have denser, thinner corridor geometry than the web snapshot
- the narrower trench-inset pass reduces the chunky menu-cell read, but full screenshot-grade corridor density and silhouette exactness are still open
- the menu dynamic-overlay corridor-frame and thinner-overlay passes reduce full-square cyan/player marker drift, but they do not close final legacy trail/sprite/material exactness
- the segment-based static-board material pass and follow-up wide-route-core/soft-edge pass reduce broad filled-cell drift, restore the gray slab / dark route hierarchy, and make dense route areas read less checker-like, but the current web board still is not screenshot-grade 1:1
- the connected light-core material pass moves the menu board closer to the restored screenshot role split, but the current web board still differs in exact corridor density, slab relief, and title-over-board composition
- the upper-right title-adjacent lattice is closer, but the full menu snapshot silhouette is still not screenshot-grade 1:1
- exact demo AI route/backtrack internals beyond the newly restored front-door recovery lane, cue/pacing surface, AI-only reset replay, immediate goal-reset handoff, and `AiTilePathCheck` candidate gate
- exact active-play feel beyond the extracted source-exact timer/goal-arrow contract, tighter compact overlay, minimal HUD widget chrome, data-only diagnostics proof, and full proof bounds
- exact demo AI route parity beyond the newly restored front-door recovery lane, cue/pacing surface, AI-only reset replay, immediate goal-reset handoff, and `AiTilePathCheck` candidate gate
- exact generation/reset-flow parity beyond the queued request contract
- final screenshot-grade visual parity
