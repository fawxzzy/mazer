# Mazer Legacy 1:1 Completion Marker

Date: 2026-07-01
Status: active
Current marker: `81%`

## Intent

Use this document as the single percent marker for reaching a truthful `100%` legacy-to-web Mazer port.

The goal is not "keep polishing until it feels close."
The goal is:

- preserve legacy behavior and responsibilities exactly where the browser can support them
- allow structural cleanup, tests, diagnostics, and modularization when they do not change legacy truth
- ratchet progress only when a bounded parity gap is actually closed

## What counts as 100%

For this repo, `100%` means all of the following are true at once:

- the web app reproduces the legacy gameplay loop closely enough that remaining differences are browser/engine container differences, not product-direction drift
- menu flow, overlay responsibilities, play flow, demo flow, and reset flow all match the old project semantically
- screenshot-facing composition, palette roles, and menu-time presentation are close enough that remaining drift is minor rendering variance, not design mismatch
- the proof spine, tests, and owner map are strong enough that future edits do not silently break parity

`100%` does not require pretending the browser is Unreal.
It does require eliminating the major behavior, UI, and visual gaps that still separate the current app from the restored legacy truth.

## Allowed improvements while preserving 1:1

These changes are valid and can count toward completion if behavior stays legacy-faithful:

- extracting scene-local logic into named legacy modules
- adding diagnostics, tests, and proof surfaces
- fixing bugs that move the runtime closer to legacy behavior
- cleaning layout/render code so long as the visible output moves toward legacy truth
- replacing brittle wiring with clearer owner chains when the resulting behavior stays the same

These do not count toward 1:1 completion:

- new product features that did not exist in legacy truth
- visual redesign that is merely "nicer" but less legacy-faithful
- duplicate app/repo/infrastructure surfaces
- claiming parity because the app is cleaner internally while visible behavior still differs

## Non-literal equivalence rules

Some legacy behaviors cannot be literal in the browser. They still count as complete only when the equivalent contract is explicit:

- `Exit`: browser-safe leave/close semantics may stand in for engine quit behavior
- render pipeline: Phaser/browser rendering may differ slightly from Unreal materials if the visual role and composition still match
- random source behavior: deterministic staging and reset semantics matter more than bit-for-bit RNG identity

## Weighted completion model

Use these segment weights for the single repo-wide marker.
The current marker is the sum of the awarded points below.

| Segment | Weight | Current points | Current truth | Owner chain | Proof surface | Exact remaining gap |
| --- | --- | --- | --- | --- | --- | --- |
| Legacy truth restore, extraction, and proof spine | `10` | `10` | locked | `legacy/old-project.zip` -> `docs/current-truth.md` -> `docs/system-map.md` | `npm run legacy:extract`, `npm run verify` | keep current truth and proof docs in sync when runtime truth changes |
| Front-door menu shell semantics | `12` | `10` | mostly aligned | `src/legacy-runtime/legacyDefaults.ts` -> `src/legacy-runtime/legacyExit.ts` -> `src/legacy-runtime/legacyMenuLayout.ts` -> `src/scenes/MenuScene.ts` | `tests/reset/legacy-exit.test.ts`, `tests/reset/legacy-reset.test.ts`, `tests/reset/legacy-menu-layout.test.ts`, localhost | `Exit`, `Start`, and `Options` are restored, but exact widget sizing/placement and desktop-vs-side-browser composition are still visual parity work, not closed 1:1 truth |
| Menu screenshot composition and board presentation | `14` | `12` | partial | `src/legacy-runtime/legacyMenuSnapshot.ts` -> `src/legacy-runtime/legacyMenuLayout.ts` -> `src/legacy-runtime/legacyMenuTitle.ts` -> `src/legacy-runtime/legacyMenuButtonChrome.ts` -> `src/legacy-runtime/legacyMenuBackdrop.ts` -> `src/legacy-runtime/legacyMenuRender.ts` -> `src/scenes/MenuScene.ts` | screenshot comparison, `tests/reset/legacy-menu-layout.test.ts`, `tests/reset/legacy-menu-title.test.ts`, `tests/reset/legacy-menu-button-chrome.test.ts`, `tests/reset/legacy-menu-backdrop.test.ts`, `tests/scenes/menu-render-frame.test.ts`, localhost | fixed menu snapshot now projects the named legacy blueprint into a 49-cell browser grid, menu corridors now carry a shadow-relief pass with quieter wall-grid noise, the wordmark now uses a more translucent legacy-glass opacity profile, the front-door buttons now render through a darker pane-fill chrome instead of translucent white blocks, and the board material now uses darker wall/slab mass with harder path-edge contrast, so desktop/mobile proof has denser, less flat, less modern, and more charcoal/light-gray screenshot-facing menu presentation than the earlier coarse/clean board; exact screenshot silhouette, final material relief, title overlap, button placement/composition, and legacy trail/sprite treatment are still open |
| Overlay family and field responsibilities | `14` | `12` | mostly aligned | `src/legacy-runtime/legacyOptionFields.ts` -> `src/legacy-runtime/legacyOverlayFieldCommit.ts` -> `src/legacy-runtime/legacyOverlayToggleFields.ts` -> `src/legacy-runtime/legacyOverlayRouting.ts` -> `src/legacy-runtime/legacyPauseLifecycle.ts` -> `src/scenes/MenuScene.ts` | `tests/reset/legacy-option-fields.test.ts`, `tests/reset/legacy-overlay-field-commit.test.ts`, `tests/reset/legacy-overlay-toggle-fields.test.ts`, `tests/reset/legacy-overlay-routing.test.ts`, `tests/reset/legacy-pause-lifecycle.test.ts`, `tests/reset/legacy-reset.test.ts`, localhost | overlay ownership and routing are strong, but widget-level screenshot and input exactness still need review against the restored UI source and screenshots |
| Active play movement and win/reset loop | `14` | `10` | partial | `src/legacy-runtime/legacyPlayStep.ts` -> `src/legacy-runtime/legacyPlayLifecycle.ts` -> `src/scenes/MenuScene.ts` | `tests/reset/legacy-play-step.test.ts`, `tests/reset/legacy-play-lifecycle.test.ts`, `tests/reset/legacy-reset.test.ts` | simultaneous-key movement buffering, axis-gated collision, and single-request active-play reset return are ported, but full active-play feel, HUD integration, and edge-case equivalence are not yet complete |
| Generation lifecycle exactness | `16` | `14` | partial | `docs/legacy/gameplay-spec.md` -> `src/legacy-runtime/legacyGenerationLifecycle.ts` -> `src/legacy-runtime/legacyPlayLifecycle.ts` -> `src/legacy-runtime/legacyMaze.ts` -> `src/domain/maze/core.ts` -> `src/domain/maze/generator.ts` -> `src/scenes/MenuScene.ts` | `tests/reset/legacy-generation-lifecycle.test.ts`, `tests/reset/legacy-generation-diagnostics.test.ts`, `tests/reset/legacy-play-lifecycle.test.ts`, `tests/reset/legacy-reset.test.ts`, `tests/maze/maze-domain.test.ts`, localhost runtime diagnostics | process/stage ownership is mapped, diagnostics show stage-6 row reveal, browser shortcut topology creates family-aware route-affecting bypasses with separated canonical-route reconnection proof, rasterized domain play mazes apply the restored legacy `CreateShortCuts` opposite-corridor wall-bridge rule, and active reset-lane generated play mazes now use a source-shaped checkpoint path-builder in `createLegacyMaze()` instead of the earlier DFS perfect-maze owner; that active builder mirrors the `CreateGrid` / `MapPath` / `CreatePath` / `CreateShortCuts` responsibility split, feeds a duplicate-preserving `_WallArray` into shortcut creation, and reports checkpoint/path/wall-array stats; exact Unreal RNG, process-yield timing, and byte-for-byte `MapPath`/`Backtrack` selection remain open |
| Demo route, backtracking, and pacing | `12` | `8` | partial | `src/legacy-runtime/legacyMenuDemoLifecycle.ts` -> `src/domain/ai/demoWalker.ts` -> `src/scenes/MenuScene.ts` | `tests/ai/demo-walker.test.ts`, `tests/reset/legacy-menu-demo-lifecycle.test.ts`, localhost | recovery cues, AI-only reset replay, goal-reset timing, and `AiTilePathCheck` admission are covered, but the live walker is still not a line-for-line Unreal path-stack/backtracking port |
| In-game HUD and goal-arrow parity | `8` | `5` | partial | `src/scenes/MenuScene.ts` | `tests/reset/legacy-reset.test.ts`, `tests/visual/edge-live-check.test.ts`, `npm run edge:live -- --skip-build true --headless true --run core-only-play`, direct play-route screenshot | the timer/arrow overlay is tighter and bounded, but final legacy HUD timer/goal-arrow semantics and visual exactness are still open |

Current total:

- `81 / 100`

## Why the marker was corrected from 97% to 70%, then ratcheted to 81%

The repo is materially past the "rough prototype" stage:

- legacy truth is restored and extracted
- the reset lane has a stable front door
- menu/parity work is now modular instead of broad
- active play, overlays, demo motion, diagnostics, and tests all exist as first-class repo surfaces

However, the previous `97%` value overstated the user-facing 1:1 status. It gave near-full credit for mapped contracts and proof surfaces even when the current runtime still visibly differs from restored legacy truth.

The corrected `70%` marker means:

- the project has a strong restoration/proof foundation
- several legacy behavior contracts are implemented and tested
- the current web app is useful and inspectable on localhost
- the current web app is not yet visually or algorithmically close enough to call it almost done

The biggest remaining gaps are not cosmetic:

- generation/reset lifecycle ownership is now aligned, and active play topology no longer starts from the earlier DFS perfect-maze owner; it now uses a source-shaped checkpoint path-builder and wall-array handoff in `createLegacyMaze()`, but exact Unreal RNG, process-yield timing, and byte-for-byte `MapPath`/`Backtrack` selection remain open
- shortcut topology is no longer the earlier random dead-end braider: it now uses family-aware loop scoring, sparse fallback protection, a bounded route-aware braided bypass pass that rejects candidates without separated canonical-route reconnection, a raster-level legacy opposite-corridor bridge pass, and an active reset-lane `createLegacyMaze()` shortcut bridge pass using the explicit legacy budget plus a duplicate-preserving `_WallArray` collected by the checkpoint path-builder's `CreatePath` equivalent; this improves route alternatives and ports the core `CreateShortCuts` condition plus selection lifecycle shape onto the active runtime owner, but does not close exact legacy randomness
- front-door `Exit` semantics are closed through an explicit browser-safe quit equivalence, but the visible front-door composition is still not screenshot-grade
- desktop menu board dominance, title lockup, and button support chrome are closer to legacy screenshot truth, the front-door buttons now use a darker pane-fill chrome instead of translucent white block fills, the backdrop field now has an explicit owner plus a closer cloudy/star treatment, and the board material now reads darker, higher contrast, and less evenly tiled; the fixed menu snapshot now also renders as a 49-cell projection instead of the earlier coarse 25-cell board, but screenshot-grade backdrop/material and final composition exactness are still open
- desktop board tile read is slightly closer after widening the menu trench core and reducing wall-grid noise, but screenshot-grade board material and composition exactness are still open
- the title lockup now reads more like the legacy translucent green glass wordmark after reducing title/shadow opacity, but exact wordmark material and overlap remain open
- connected trench-core rendering reduces the separated-cell/checkerboard read in the current fixed web snapshot, the 49-cell projection closes the most obvious coarse-grid density miss, and the path-relief shadow pass reduces the flat modern line-art read, but exact screenshot-grade corridor geometry and final material relief remain open
- the upper-left frame/pocket/lattice corner is slightly closer after extending those fixed snapshot branches, but the menu board is still short of final screenshot-grade silhouette closure
- the upper-right title-adjacent lattice is slightly closer after adding one fixed snapshot branch family, but the menu board is still short of final screenshot-grade silhouette closure
- the lower-left interior is slightly closer after adding fixed snapshot shelf density, but the menu board is still short of final screenshot-grade silhouette closure
- stage `7` finalization, process `8` reset entry, menu process-8-to-process-0 reset handoff, process `0` delay-gated entry, the armed level-building scheduler contract, the stage transition graph, shortcut-disabled stage `4 -> 6` progression, stage `0/3/4/5/6` cadence, stage-cursor diagnostics, checkpoint/shortcut budget formulas, and menu stage-6 row-sliced drawing are now explicit and proof-backed
- active play now carries the restored Unreal simultaneous-key buffer contract: first movement keydown waits 50ms, held cardinal flags resolve as one vector, opposing axes cancel, key repeat resolves the current held vector, and reset/pause/menu boundaries clear stale movement
- active-play collision now carries the restored Unreal axis-gated movement shape: horizontal and vertical side gates resolve independently, blocked simultaneous axes can slide along an open axis, and true diagonal corner collisions block instead of cutting through walls
- active-play goal reset now carries one process-8 reset request as the sole return-to-menu authority, which removes the duplicate scene-local reset-return timer and better matches the restored Unreal `_ResetGame` consumption branch
- demo reset and route semantics are closer now that the fixed front-door snapshot also uses the legacy mistake/backtrack lane, no longer boots into a weak `reset-hold` / `goal-hold` first impression, replays AI-only reset without regeneration, queues the menu goal-reset process-8 request immediately after reset-hold, and rejects one-tile spur wrong-turn candidates through the restored `AiTilePathCheck` gate
- HUD parity is closer, but not final
- screenshot-grade menu material/composition is not fully closed

Do not reuse `97%` for the literal 1:1 clone marker unless the remaining screenshot, HUD, topology, and demo-stack gaps have been closed with proof.

Current proof note:

- live runtime diagnostics are now actually bridged through `MenuScene` and covered by repo-owned tests
- the visible runtime panel now also shows the active menu-demo cue and whether the front-door snapshot is using the mistake-enabled legacy lane
- the visible runtime panel and visual diagnostics now also show live menu-demo AI wrong-branch/backtrack/recovery counters plus stage-6 row-reveal progress, making AI/generation-fluidity review evidence-backed without changing gameplay behavior
- the localhost right-pane browser remains useful for visual truth on the single `4173` preview server
- direct browser-automation readback of `window.__MAZER_*` globals is still browser-owned and flaky, but runtime diagnostics now have a DOM-backed fallback surface and visible panel so that seam no longer blocks localhost proof

## Ratchet rule

The marker may move only when a bounded legacy-owned segment changes state with proof.

A ratchet is valid when:

- one named segment above has a specific gap reduced or closed
- the owner chain for that segment was the actual edit path
- the proof surface for that segment passed after the change
- `docs/current-truth.md`, `docs/system-map.md`, and the parity matrix stay synchronized

## Every-pass reevaluation rule

Every legacy 1:1 pass must re-evaluate this marker before closeout, even when no percentage change is justified.

Closeout must answer:

- Which weighted segment was touched?
- Did the segment's current points change?
- If not, why did the evidence fail to justify a ratchet?
- Do `docs/current-truth.md`, this marker, and `docs/research/MAZER_LEGACY_WEB_PARITY_MATRIX.md` still agree?
- Did `npm run verify` pass after the change?

The guard test `tests/reset/legacy-marker.test.ts` enforces the basic marker arithmetic and document-synchronization check. It does not decide whether a ratchet is deserved; the pass owner still must compare the actual legacy evidence.

Do not ratchet for:

- nicer wording
- broader mapping with no behavior change
- unproven visual claims
- internal cleanup that does not improve legacy parity

Current note:

- explicit lifecycle mapping can still be worth landing for restart safety and owner clarity
- but lifecycle mapping alone does not justify a percent move unless it also closes a behavior gap or restores missing legacy-owned semantics
- the stage-cursor packet improved runtime proof and owner clarity but did not ratchet by itself because it was diagnostics-only
- the menu reset-handoff packet earns one point because it changes runtime behavior: process-8 menu reset no longer regenerates inline and instead enqueues the next process-0 generation request
- the shortcut-disabled transition packet earns one point because it removes a real impossible runtime-plan edge: small-maze stage `4` now advances to stage `6` when process `5` is omitted
- the menu draw-stage packet earns one point because stage `6` now changes runtime behavior: menu static-board drawing advances by row batches from the lifecycle plan instead of rendering only as one completed static pass
- the active-play simultaneous-key packet earns one point because movement input now changes runtime behavior to match the old player source's delayed first press, held-direction vector resolution, repeat movement, and stale-key cleanup boundaries
- the active-play axis-gated collision packet earns one point because simultaneous movement now matches the old player source's independent `CheckMoveR/L/U/D` gates instead of checking only the final combined target
- the active-play reset-return packet earns one point because goal reset timing now flows through the explicit process-8 `LegacyResetRequest` only, matching the old `_ResetGame` -> process `8` branch more closely and removing the shadow `playResetReturnAtMs` path
- the menu-demo reset exactness packet earns one point because it changes runtime behavior: goal reset now queues the process-8 menu reset request immediately after reset-hold instead of waiting one extra explore-step delay, and AI-only reset replay is explicitly covered without regenerating the menu maze
- the menu-demo `AiTilePathCheck` packet earns one point because it changes runtime behavior: wrong-turn selection no longer commits into a one-tile spur that the restored Unreal AI would reject for lacking an unvisited onward path
- the menu draw-stage cadence packet does not earn a point because it improves the visible row-reveal timing and proves intermediate `0/25 -> 13/25 -> 25/25` diagnostics on localhost, but the exact Unreal generator timing and line-for-line topology internals remain unrecovered
- the connected trench-core packet does not earn a point because it improves material continuity inside the current web snapshot but does not close the final screenshot-grade menu composition gap
- the upper-right lattice packet does not earn a point because it improves one fixed snapshot silhouette area but does not close the final screenshot-grade menu composition gap
- the AI/draw-progress diagnostics packet does not earn a point because it improves evidence and future edit safety but does not change gameplay behavior or close a screenshot-grade parity gap
- the narrow trench-inset packet does not earn a point because it reduces chunky path-cell rendering in one board/material module but does not close screenshot-grade corridor geometry or full menu composition parity
- the menu dynamic-overlay corridor-frame packet does not earn a point because it reduces the full-square cyan/player marker read in one board/material module but does not close exact legacy trail/sprite treatment or full screenshot-grade board parity
- the menu dynamic-overlay thinner-highlight packet does not earn a point because it reduces the chunky cyan route and marker footprint in desktop/mobile captures, but it does not close exact legacy trail/sprite treatment or full screenshot-grade board parity
- the segment-based static-board material packet does not earn a point because it reduces broad filled-cell drift and restores the gray slab / dark route hierarchy, but visual proof still shows tiny-grid/checker drift and incomplete screenshot-grade board parity
- the wide-route-core/soft-edge static-board material packet does not earn a point because it reduces the tiny-grid/checker read in dense route areas but still does not close screenshot-grade board material, dense corridor geometry, or full menu composition parity
- the maze shortcut topology packet does not earn a point because it replaces the weak random browser braider with family-aware route-affecting bypass logic and tests, but it is still an improved browser-native equivalent rather than a line-for-line Unreal `CreateShortCuts` port
- the maze shortcut route-span packet does not earn a point because it hardens the browser-native bypass pass with separated canonical-route reconnection and multi-band bypass proof, but it still does not recover the literal Unreal `CreateShortCuts` implementation
- the maze raster bridge shortcut packet earns one point because it changes runtime maze topology by restoring the old `CreateShortCuts` wall-selection shape at the raster layer: the browser opens deterministic additive floor bridges only where the selected wall tile has opposite floor/path corridors on one axis and wall blockers on the other axis; it does not earn more because the web builder still does not execute the full Unreal wall-array, random-removal, process-yield, and staged path-builder internals line-for-line
- the active runtime shortcut bridge packet earned one point because it moved the restored opposite-corridor shortcut rule into `src/legacy-runtime/legacyMaze.ts`, which is the active reset-lane maze owner used by `MenuScene`, and wired the explicit legacy shortcut budget into play-mode generation; it did not earn more at that time because the full Unreal staged wall-array lifecycle and checkpoint path builder were still open
- the active runtime wall-array shortcut packet earned one point because active reset-lane shortcut selection built a `_WallArray`-style duplicate-preserving candidate list from path-neighbor walls, randomly removed one entry per attempt, revalidated stale candidates before opening, and reported requested/attempted/created shortcut stats; it did not earn more at that time because the full Unreal checkpoint path builder was still open
- the active runtime checkpoint path-builder packet earns two points because active reset-lane play topology no longer starts from a DFS perfect-maze algorithm; `createLegacyMaze()` now runs a source-shaped `CreateGrid` / `MapPath` / `CreatePath` sequence, records checkpoint/path/wall-array stats, and feeds the resulting duplicate-preserving wall array into shortcut creation. It does not earn the final two generation points because exact Unreal RNG, per-tick process-yield timing, and byte-for-byte `MapPath()` / `Backtrack()` behavior remain browser-safe approximations
- the connected light-core menu-material packet does not earn a point because it moves the static board toward the restored light-corridor / dark-wall screenshot role, but exact corridor density, slab relief, title overlap, and full screenshot-grade composition remain open
- the 49-cell fixed menu snapshot packet earns two points because it changes the actual menu-board runtime topology from the coarse 25-cell approximation to a 49-cell projection of the named legacy snapshot blueprint, preserves contiguous solution/demo path truth, keeps the fixed snapshot source-tagged apart from generated play mazes, and proves the change in desktop and mobile browser captures. It does not earn more because the exact old screenshot silhouette, material relief, wordmark overlap, button composition, and legacy trail/sprite treatment still differ visibly
- the menu path-relief material packet earns one point because it changes visible menu-board runtime rendering: connected path segments now draw a dark offset relief shadow before the light corridor pass, and the remaining wall-grid overlay is quieter. Desktop and mobile browser captures prove a less flat board/material read. It does not earn more because exact old screenshot silhouette, final slab relief, wordmark overlap, button composition, and legacy trail/sprite treatment still differ visibly
- the menu title glass packet earns one point because it changes visible wordmark runtime rendering toward the restored screenshot's translucent green title treatment while preserving existing layout. Desktop and mobile browser captures prove the opacity change. It does not earn more because exact wordmark material, title-over-board overlap, button composition, and final screenshot-grade menu composition remain open
- the menu button dark-pane packet earns one point because it changes visible front-door button rendering toward the restored screenshot's dark support-pane treatment while preserving the existing menu-only button layout and overlay behavior. Desktop and mobile browser captures prove the fill/hover chrome change. It does not earn more because exact button placement, title-over-board overlap, and final screenshot-grade menu composition remain open
- the menu material contrast packet earns one point because it changes visible board-material rendering toward the restored screenshot's harder charcoal/light-gray maze read: wall/slab mass is darker, path cores are slightly less washed out, and path edges carry stronger dark contrast. Completed desktop and mobile browser captures prove the material change after the staged row reveal has finished. It does not earn more because exact maze silhouette, title overlap, button placement, and legacy trail/sprite treatment remain open

## Preferred modular lock order from here

Keep the remaining work bounded in this order unless proof shows a different blocker:

1. final screenshot-grade board/material review
2. final screenshot-grade play HUD polish
3. active-play/HUD edge-case exactness review

Each future packet should name:

- one segment row from this marker
- one owner chain
- one proof surface
- one exact legacy miss being closed
