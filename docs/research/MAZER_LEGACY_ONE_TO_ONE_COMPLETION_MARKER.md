# Mazer Legacy 1:1 Completion Marker

Date: 2026-06-29
Status: active
Current marker: `79%`

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
| Front-door menu shell semantics | `12` | `11` | close | `src/legacy-runtime/legacyDefaults.ts` -> `src/legacy-runtime/legacyMenuLayout.ts` -> `src/scenes/MenuScene.ts` | `tests/reset/legacy-reset.test.ts`, `tests/reset/legacy-menu-layout.test.ts`, localhost | final `Exit` equivalence and exact front-door behavior polish still need one bounded pass |
| Menu screenshot composition and board presentation | `14` | `10` | partial | `src/legacy-runtime/legacyMenuSnapshot.ts` -> `src/legacy-runtime/legacyMenuLayout.ts` -> `src/legacy-runtime/legacyMenuTitle.ts` -> `src/legacy-runtime/legacyMenuButtonChrome.ts` -> `src/legacy-runtime/legacyMenuRender.ts` -> `src/scenes/MenuScene.ts` | screenshot comparison, `tests/reset/legacy-menu-layout.test.ts`, `tests/scenes/menu-render-frame.test.ts` | final screenshot-grade composition is still open, but board material/tile read is materially closer after the heavier trench pass |
| Overlay family and field responsibilities | `14` | `13` | close | `src/legacy-runtime/legacyOptionFields.ts` -> `src/legacy-runtime/legacyOverlayToggleFields.ts` -> `src/legacy-runtime/legacyPauseLifecycle.ts` -> `src/scenes/MenuScene.ts` | `tests/reset/legacy-option-fields.test.ts`, `tests/reset/legacy-overlay-toggle-fields.test.ts`, `tests/reset/legacy-pause-lifecycle.test.ts`, `tests/reset/legacy-reset.test.ts`, localhost | options/pause rebuild timing now defers to overlay close like legacy truth, pause command routing is explicit, and features/game-modes toggle responsibilities are explicit, but pause field responsibilities and final nested-overlay exactness still remain open |
| Active play movement and win/reset loop | `14` | `10` | partial | `src/legacy-runtime/legacyPlayStep.ts` -> `src/legacy-runtime/legacyPlayLifecycle.ts` -> `src/scenes/MenuScene.ts` | `tests/reset/legacy-play-step.test.ts`, `tests/reset/legacy-play-lifecycle.test.ts`, `tests/reset/legacy-reset.test.ts` | exact movement edge cases and return/reset timing still need tighter legacy proof |
| Generation lifecycle exactness | `16` | `10` | partial | `docs/legacy/gameplay-spec.md` -> `src/legacy-runtime/legacyGenerationLifecycle.ts` -> `src/legacy-runtime/legacyPlayLifecycle.ts` -> `src/legacy-runtime/legacyMaze.ts` -> `src/scenes/MenuScene.ts` | `tests/reset/legacy-generation-lifecycle.test.ts`, `tests/reset/legacy-generation-diagnostics.test.ts`, `tests/reset/legacy-play-lifecycle.test.ts`, `tests/reset/legacy-reset.test.ts` | reset/generation now flow through explicit queued runtime requests, explicit stage-7 finalize state, explicit process-8 reset branches, and explicit menu-vs-play stage cadence, but the full staged legacy process pipeline is still not ported |
| Demo route, backtracking, and pacing | `12` | `8` | partial | `src/legacy-runtime/legacyMenuDemoLifecycle.ts` -> `src/domain/ai/demoWalker.ts` -> `src/scenes/MenuScene.ts` | `tests/ai/demo-walker.test.ts`, localhost | recovery cues and cue-specific pacing now drive the live route, but full legacy reset semantics and final backtrack exactness still remain open |
| In-game HUD and goal-arrow parity | `8` | `7` | partial | `src/scenes/MenuScene.ts` | `tests/reset/legacy-reset.test.ts`, `tests/visual/edge-live-check.test.ts`, `npm run edge:live -- --skip-build true --headless true --run core-only-play`, direct play-route screenshot | the timer/arrow overlay is tighter and the full overlay footprint is now carried by repo-owned proof, but final screenshot-grade exactness is still open |

Current total:

- `79 / 100`

## Why the marker is held at 79%

The repo is materially past the "rough prototype" stage:

- legacy truth is restored and extracted
- the reset lane has a stable front door
- menu/parity work is now modular instead of broad
- active play, overlays, demo motion, diagnostics, and tests all exist as first-class repo surfaces

But `100%` would still be dishonest today because the biggest remaining gaps are not cosmetic:

- generation/reset lifecycle is still approximate
- generation/reset lifecycle is more explicit than before, but still not a full staged process port
- stage `7` finalization, process `8` reset branches, and stage `0/3/4/5/6` cadence are now explicit, but the remaining staged pipeline is still open
- demo route semantics are still partial even after recovery cues/pacing were restored
- HUD parity is closer, but not final
- screenshot-grade menu material/composition is not fully closed
- some overlay and front-door responsibilities still need exactness passes beyond the deferred options/pause rebuild contract, the explicit pause command lifecycle, and the new features/game-modes toggle contract

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

## Preferred modular lock order from here

Keep the remaining work bounded in this order unless proof shows a different blocker:

1. generation/reset staged lifecycle exactness
2. overlay field-by-field responsibility cleanup
3. final screenshot-grade board/material review
4. final screenshot-grade play HUD polish

Each future packet should name:

- one segment row from this marker
- one owner chain
- one proof surface
- one exact legacy miss being closed
