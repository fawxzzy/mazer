# Mazer Legacy Web Parity Matrix

Date: 2026-06-28
Status: initial matrix after legacy restore

Restored legacy truth:

- archive: `legacy/old-project.zip`
- restore root: `tmp/mazer-legacy-unreal-restore`
- archive sha256: `3d266d988c7f66281fb9c9572f5cd9e4b301483d7ab24b6c08a30734ef4f4f08`

## Status key

- `aligned`: current web lane already matches legacy closely enough to preserve
- `partial`: current web lane contains a meaningful port, but not exact legacy truth
- `divergent`: current web lane differs materially and should be rewritten for this lane
- `missing`: legacy-owned behavior exists, but the web app does not currently expose it as a first-class surface

## System matrix

| Legacy system | Legacy owner | Current web owner | Status | Exact gap | Next port target |
| --- | --- | --- | --- | --- | --- |
| Maze generation lifecycle | `Source/Mazer/MazerGameModeBase.cpp`, `Source/Mazer/Private/MazerGameState.cpp` | `src/legacy-runtime/legacyGenerationLifecycle.ts`, `src/legacy-runtime/legacyPlayLifecycle.ts`, `src/legacy-runtime/legacyMaze.ts`, `src/domain/maze/core.ts`, `src/domain/maze/generator.ts`, `src/scenes/MenuScene.ts` | `aligned` | Current web build path queues named reset/generation requests and carries explicit process-0 delay entry, process-8 reset entry, a real menu-demo process-8-to-process-0 handoff instead of inline regeneration, valid shortcut-disabled stage `4 -> 6` progression, stage-`0/3/4/5/6/7/8` cadence/branch contracts, checkpoint/shortcut budget metadata, stage-cursor diagnostics, and cadence-gated menu stage-6 row-sliced static-board drawing. Browser shortcut topology now uses family-aware loop scoring plus a bounded braided route-bypass pass that requires separated canonical-route reconnection before opening a wall, generated domain play-maze rasters apply the restored legacy `CreateShortCuts` opposite-corridor wall-bridge rule using floor-network semantics, and active reset-lane play snapshots now use a source-shaped checkpoint path-builder in `createLegacyMaze()` instead of the previous DFS perfect-maze owner. That builder mirrors `CreateGrid`, `MapPath`, and `CreatePath` responsibilities, records path-builder stats, feeds a duplicate-preserving `_WallArray` into the shortcut pass, and reports requested/attempted/created shortcut stats. Exact Unreal RNG, process-yield timing, and byte-for-byte `MapPath`/`Backtrack` selection remain browser-safe approximations | Keep lifecycle proof green while active play, demo backtracking, final visual gaps, exact RNG/timing review, and any future full generator port work close |
| Menu demo AI walker | `Source/Mazer/Private/Player/MazerPlayer.cpp` | `src/legacy-runtime/legacyMenuDemoLifecycle.ts`, `src/domain/ai/demoWalker.ts`, `src/scenes/MenuScene.ts` | `aligned` | Demo motion now carries live recovery cues and cue-specific pacing, the fixed front-door snapshot no longer suppresses the legacy mistake/backtrack lane, the fixed-snapshot bootstrap no longer lands in `goal-hold` or `reset-hold` on first render, AI-only reset replays the same menu maze without regeneration, goal reset queues the process-8 request immediately after reset-hold, and wrong-turn selection rejects one-tile spur candidates through a restored `AiTilePathCheck`-style onward-path gate | Preserve demo proof while final visual, HUD, and topology-internal gaps close |
| Active play movement | `Source/Mazer/Private/Player/MazerPlayer.cpp` | `src/legacy-runtime/legacyPlayStep.ts`, `src/scenes/MenuScene.ts` | `partial` | Web play mode now carries the restored Unreal simultaneous-key buffer and axis-gated collision shape: first movement keydown waits 50ms, held cardinal flags resolve as one vector, opposing axes cancel, repeat movement resolves the held vector, stale movement clears across pause/menu/reset boundaries, blocked simultaneous axes can slide along the open axis, and diagonal corner collisions block instead of cutting through walls | Keep active-play movement proof green while remaining demo/HUD/visual gaps close |
| Win/reset loop | `Source/Mazer/MazerGameModeBase.cpp`, `Source/Mazer/Private/MazerGameState.cpp` | `src/legacy-runtime/legacyPlayLifecycle.ts`, `src/scenes/MenuScene.ts` | `partial` | Active-play goal reset now flows through the explicit process-8 reset request as the single return-to-menu authority; menu-demo goal reset now consumes immediately after reset-hold and AI-only reset replays without regeneration; demo wrong-turn admission now follows the restored onward-path candidate gate | Preserve reset proof while active-play/HUD and final visual gaps close |
| Main menu front door | `Source/Mazer/Private/UI/MainMenuWidget.cpp` | `src/legacy-runtime/legacyDefaults.ts`, `src/legacy-runtime/legacyExit.ts`, `src/legacy-runtime/legacyMenuLayout.ts`, `src/scenes/MenuScene.ts` | `aligned` | `Start`, `Options`, and `Exit` are restored as first-class controls, and `Exit` now uses an explicit browser-safe quit equivalence instead of a message detour | Preserve the front-door contract while larger runtime and visual gaps close elsewhere |
| Options overlay | `Source/Mazer/Private/UI/PauseMenuWidget.cpp` | `src/legacy-runtime/legacyOptionFields.ts`, `src/legacy-runtime/legacyOverlayFieldCommit.ts`, `src/legacy-runtime/legacyOverlayRouting.ts`, `src/scenes/MenuScene.ts` | `aligned` | The options surface now carries explicit field-commit classes and nested-overlay return routing | Preserve the current contract while larger runtime gaps close elsewhere |
| Features overlay | `Source/Mazer/Private/UI/FeaturesWidget.cpp` | `src/legacy-runtime/legacyOverlayToggleFields.ts`, `src/legacy-runtime/legacyOverlayRouting.ts`, `src/scenes/MenuScene.ts` | `aligned` | Features toggle ownership and nested return routing are now explicit repo truth | Preserve the current contract while larger runtime gaps close elsewhere |
| Game modes overlay | `Source/Mazer/Private/UI/GameModesWidget.cpp` | `src/legacy-runtime/legacyOverlayToggleFields.ts`, `src/legacy-runtime/legacyOverlayRouting.ts`, `src/scenes/MenuScene.ts` | `aligned` | Game modes now carries explicit dark-mode semantics and nested return routing without a made-up state label | Preserve the current contract while larger runtime gaps close elsewhere |
| In-game pause menu | `Source/Mazer/Private/UI/GamePauseMenu.cpp` | `src/legacy-runtime/legacyOverlayFieldCommit.ts`, `src/legacy-runtime/legacyOverlayRouting.ts`, `src/legacy-runtime/legacyPauseLifecycle.ts`, `src/scenes/MenuScene.ts` | `aligned` | Pause now carries explicit command, field, and nested-overlay return contracts | Preserve the current contract while larger runtime gaps close elsewhere |
| HUD timer and end arrow | `Source/Mazer/Private/UI/GameHud.cpp`, `Source/Mazer/Private/Player/MazerPlayer.cpp` | `src/scenes/MenuScene.ts` | `partial` | HUD timer and goal-arrow behavior are only partially restored | Restore timer and goal-arrow HUD semantics for active play |
| Single-overlay rule | legacy UI widget flow | `src/scenes/MenuScene.ts` | `aligned` | Current reset lane now enforces one active overlay family at a time | Preserve this rule while tightening overlay exactness |
| Visual composition | legacy screenshots `menu-01..04` | `src/legacy-runtime/legacyMenuSnapshot.ts`, `src/legacy-runtime/legacyMenuLayout.ts`, `src/legacy-runtime/legacyMenuTitle.ts`, `src/legacy-runtime/legacyMenuButtonChrome.ts`, `src/legacy-runtime/legacyMenuBackdrop.ts`, `src/legacy-runtime/legacyMenuRender.ts`, `src/scenes/MenuScene.ts` | `partial` | The desktop board now occupies the frame more like the restored legacy screenshots, the title lockup reads closer to the legacy wordmark treatment with a more translucent green-glass opacity profile, the front-door support chrome is more compact and now uses a darker menu-only pane fill instead of translucent white block fills, the backdrop field now has an explicit owner plus a denser cloudy/star treatment, and the fixed menu snapshot now projects the named 25-space legacy blueprint into a 49-cell browser grid instead of the earlier coarse 25-cell runtime board. The board material reads darker, less evenly tiled, less checkerboarded, and less flat through a wider trench core, quieter wall-grid noise, connected core bridging across neighboring walkable tiles, a narrower closed-edge trench inset, segment-based connected strokes, a softer static route-edge pass, a wider dark route core, a menu-only gray-slab/dark-route role hierarchy, and a dark offset path-relief shadow behind connected corridors. Menu dynamic trail/start/goal/player overlays now use corridor-framed or inset rendering instead of full square cells, and the current thinner-overlay pass reduces the chunky cyan route/marker footprint in desktop and mobile captures. The upper-left frame, upper-right title-adjacent lattice, title-adjacent pocket/lattice mass, and lower-left shelf density also read closer to the restored screenshots, but exact screenshot silhouette, final material relief, title overlap, remaining route-grid drift, exact button placement, and legacy trail/sprite treatment are still open | Finish screenshot-grade board placement, title treatment, backdrop, dynamic trail/player material, and button layout |
| Visual palette roles | legacy screenshots plus `Content/Material/*` | `src/legacy-runtime/legacyDefaults.ts`, `src/legacy-runtime/legacyMenuRender.ts`, `src/scenes/MenuScene.ts` | `partial` | Role colors are back in the legacy lane, but final palette/material tightening is still open | Collapse the remaining role drift toward legacy green/cyan/red over grayscale board |
| Backdrop and sky treatment | `Content/GoodSky/**`, screenshot truth | `src/scenes/MenuScene.ts` | `partial` | Backdrop density and haze are closer to the screenshots, but not yet final screenshot-grade parity | Finish background treatment toward the restored screenshot truth |

## Current truthful conclusion

The current web app is **not** a 1:1 legacy port.

The repo-wide 1:1 marker is currently held at `80%` after the 2026-07-01 reality check, raster bridge shortcut ratchet, active runtime shortcut bridge ratchet, active runtime wall-array shortcut selection ratchet, active runtime checkpoint path-builder ratchet, fixed menu 49-cell density ratchet, menu path-relief material ratchet, menu title glass ratchet, and menu button dark-pane ratchet. Older ops receipts that mention `97%` are historical packet state, not current marker truth.

It already contains useful ported pieces:

- core maze/runtime work
- demo AI work
- play-mode input work
- board-first rendering work
- restored front-door and overlay family work
- modular reset-lane proof and diagnostics work

But the public shell, overlay model, HUD, and visual composition still differ materially from the restored legacy project.

## Recommended execution order

1. legacy front-door menu and overlay parity
2. active-play HUD and reset-flow parity
3. final visual/material/background tightening
4. active-play HUD and goal-arrow tightening
5. topology-internal audit if visual/HUD closure exposes a gameplay blocker

## Immediate next slice

`legacy screenshot-grade board/material review packet`

Target:

- tighten one screenshot-grade board/material edge case against restored legacy screenshots
- preserve the now-aligned demo, active-play, and generation lifecycle proof while changing only the visual owner chain
- keep the current web app as canonical
- use `legacy/screenshots/`, `docs/legacy/art-direction.md`, and restored assets as truth while tightening visual runtime behavior
