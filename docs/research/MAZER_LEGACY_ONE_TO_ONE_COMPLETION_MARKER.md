# Mazer Legacy 1:1 Completion Marker

Date: 2026-07-01
Status: active
Current marker: `70%`

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
| Menu screenshot composition and board presentation | `14` | `6` | partial | `src/legacy-runtime/legacyMenuSnapshot.ts` -> `src/legacy-runtime/legacyMenuLayout.ts` -> `src/legacy-runtime/legacyMenuTitle.ts` -> `src/legacy-runtime/legacyMenuButtonChrome.ts` -> `src/legacy-runtime/legacyMenuBackdrop.ts` -> `src/legacy-runtime/legacyMenuRender.ts` -> `src/scenes/MenuScene.ts` | screenshot comparison, `tests/reset/legacy-menu-layout.test.ts`, `tests/reset/legacy-menu-title.test.ts`, `tests/reset/legacy-menu-button-chrome.test.ts`, `tests/reset/legacy-menu-backdrop.test.ts`, `tests/scenes/menu-render-frame.test.ts`, localhost | restored screenshots show denser, thinner Unreal corridor geometry and a different board/material read than the current web board; current work is closer than the old product shell but not near screenshot-grade closure |
| Overlay family and field responsibilities | `14` | `12` | mostly aligned | `src/legacy-runtime/legacyOptionFields.ts` -> `src/legacy-runtime/legacyOverlayFieldCommit.ts` -> `src/legacy-runtime/legacyOverlayToggleFields.ts` -> `src/legacy-runtime/legacyOverlayRouting.ts` -> `src/legacy-runtime/legacyPauseLifecycle.ts` -> `src/scenes/MenuScene.ts` | `tests/reset/legacy-option-fields.test.ts`, `tests/reset/legacy-overlay-field-commit.test.ts`, `tests/reset/legacy-overlay-toggle-fields.test.ts`, `tests/reset/legacy-overlay-routing.test.ts`, `tests/reset/legacy-pause-lifecycle.test.ts`, `tests/reset/legacy-reset.test.ts`, localhost | overlay ownership and routing are strong, but widget-level screenshot and input exactness still need review against the restored UI source and screenshots |
| Active play movement and win/reset loop | `14` | `10` | partial | `src/legacy-runtime/legacyPlayStep.ts` -> `src/legacy-runtime/legacyPlayLifecycle.ts` -> `src/scenes/MenuScene.ts` | `tests/reset/legacy-play-step.test.ts`, `tests/reset/legacy-play-lifecycle.test.ts`, `tests/reset/legacy-reset.test.ts` | simultaneous-key movement buffering, axis-gated collision, and single-request active-play reset return are ported, but full active-play feel, HUD integration, and edge-case equivalence are not yet complete |
| Generation lifecycle exactness | `16` | `9` | partial | `docs/legacy/gameplay-spec.md` -> `src/legacy-runtime/legacyGenerationLifecycle.ts` -> `src/legacy-runtime/legacyPlayLifecycle.ts` -> `src/legacy-runtime/legacyMaze.ts` -> `src/scenes/MenuScene.ts` | `tests/reset/legacy-generation-lifecycle.test.ts`, `tests/reset/legacy-generation-diagnostics.test.ts`, `tests/reset/legacy-play-lifecycle.test.ts`, `tests/reset/legacy-reset.test.ts`, localhost runtime diagnostics | process/stage ownership is mapped and diagnostics show stage-6 row reveal, but the browser builder still resolves topology outside a line-for-line Unreal `CreateGrid`/`MapPath`/`CreatePath`/`CreateShortCuts` port |
| Demo route, backtracking, and pacing | `12` | `8` | partial | `src/legacy-runtime/legacyMenuDemoLifecycle.ts` -> `src/domain/ai/demoWalker.ts` -> `src/scenes/MenuScene.ts` | `tests/ai/demo-walker.test.ts`, `tests/reset/legacy-menu-demo-lifecycle.test.ts`, localhost | recovery cues, AI-only reset replay, goal-reset timing, and `AiTilePathCheck` admission are covered, but the live walker is still not a line-for-line Unreal path-stack/backtracking port |
| In-game HUD and goal-arrow parity | `8` | `5` | partial | `src/scenes/MenuScene.ts` | `tests/reset/legacy-reset.test.ts`, `tests/visual/edge-live-check.test.ts`, `npm run edge:live -- --skip-build true --headless true --run core-only-play`, direct play-route screenshot | the timer/arrow overlay is tighter and bounded, but final legacy HUD timer/goal-arrow semantics and visual exactness are still open |

Current total:

- `70 / 100`

## Why the marker was corrected from 97% to 70%

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

- generation/reset lifecycle ownership is now aligned, but exact topology-builder internals are still browser-native rather than a line-for-line Unreal generator port
- front-door `Exit` semantics are closed through an explicit browser-safe quit equivalence, but the visible front-door composition is still not screenshot-grade
- desktop menu board dominance, title lockup, and button support chrome are closer to legacy screenshot truth, the backdrop field now has an explicit owner plus a closer cloudy/star treatment, and the board material now reads darker and less evenly tiled, but screenshot-grade backdrop/material and final composition exactness are still open
- desktop board tile read is slightly closer after widening the menu trench core and reducing wall-grid noise, but screenshot-grade board material and composition exactness are still open
- connected trench-core rendering reduces the separated-cell/checkerboard read in the current fixed web snapshot, but the screenshot-grade dense corridor geometry remains open
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
- the connected trench-core packet does not earn a point because it improves material continuity inside the current web snapshot but does not close the final screenshot-grade menu composition gap
- the upper-right lattice packet does not earn a point because it improves one fixed snapshot silhouette area but does not close the final screenshot-grade menu composition gap
- the AI/draw-progress diagnostics packet does not earn a point because it improves evidence and future edit safety but does not change gameplay behavior or close a screenshot-grade parity gap

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
