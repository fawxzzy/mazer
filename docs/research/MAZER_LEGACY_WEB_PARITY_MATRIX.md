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
| Maze generation lifecycle | `Source/Mazer/MazerGameModeBase.cpp`, `Source/Mazer/Private/MazerGameState.cpp` | `src/legacy-runtime/legacyGenerationLifecycle.ts`, `src/legacy-runtime/legacyPlayLifecycle.ts`, `src/legacy-runtime/legacyMaze.ts`, `src/scenes/MenuScene.ts` | `partial` | Current web build path now queues named reset/generation requests and carries explicit process-0 delay entry, process-8 reset entry, stage-`0/3/4/5/6/7/8` cadence/branch contracts, and checkpoint/shortcut budget metadata, but it is still not a literal staged legacy pipeline implementation | Port the remaining staged lifecycle into the reset-lane runtime contract |
| Menu demo AI walker | `Source/Mazer/Private/Player/MazerPlayer.cpp` | `src/legacy-runtime/legacyMenuDemoLifecycle.ts`, `src/domain/ai/demoWalker.ts`, `src/scenes/MenuScene.ts` | `partial` | Demo motion now carries live recovery cues and cue-specific pacing, but legacy backtracking/reset semantics are still not fully exact | Re-port the remaining legacy demo walker backtrack and reset semantics exactly |
| Active play movement | `Source/Mazer/Private/Player/MazerPlayer.cpp` | `src/legacy-runtime/legacyPlayStep.ts`, `src/scenes/MenuScene.ts` | `partial` | Web play mode now exists as a first-class legacy-shaped lane, but edge-case movement/collision behavior still needs exact tightening | Tighten movement, collision gating, and play-state transitions against restored legacy behavior |
| Win/reset loop | `Source/Mazer/MazerGameModeBase.cpp`, `Source/Mazer/Private/MazerGameState.cpp` | `src/legacy-runtime/legacyPlayLifecycle.ts`, `src/scenes/MenuScene.ts` | `partial` | Reset timing and return flow are now explicit request branches for play vs menu demo, but the remaining staged behavior split is still not fully ported | Restore the remaining exact legacy reset semantics around the staged generator |
| Main menu front door | `Source/Mazer/Private/UI/MainMenuWidget.cpp` | `src/legacy-runtime/legacyDefaults.ts`, `src/legacy-runtime/legacyExit.ts`, `src/legacy-runtime/legacyMenuLayout.ts`, `src/scenes/MenuScene.ts` | `aligned` | `Start`, `Options`, and `Exit` are restored as first-class controls, and `Exit` now uses an explicit browser-safe quit equivalence instead of a message detour | Preserve the front-door contract while larger runtime and visual gaps close elsewhere |
| Options overlay | `Source/Mazer/Private/UI/PauseMenuWidget.cpp` | `src/legacy-runtime/legacyOptionFields.ts`, `src/legacy-runtime/legacyOverlayFieldCommit.ts`, `src/legacy-runtime/legacyOverlayRouting.ts`, `src/scenes/MenuScene.ts` | `aligned` | The options surface now carries explicit field-commit classes and nested-overlay return routing | Preserve the current contract while larger runtime gaps close elsewhere |
| Features overlay | `Source/Mazer/Private/UI/FeaturesWidget.cpp` | `src/legacy-runtime/legacyOverlayToggleFields.ts`, `src/legacy-runtime/legacyOverlayRouting.ts`, `src/scenes/MenuScene.ts` | `aligned` | Features toggle ownership and nested return routing are now explicit repo truth | Preserve the current contract while larger runtime gaps close elsewhere |
| Game modes overlay | `Source/Mazer/Private/UI/GameModesWidget.cpp` | `src/legacy-runtime/legacyOverlayToggleFields.ts`, `src/legacy-runtime/legacyOverlayRouting.ts`, `src/scenes/MenuScene.ts` | `aligned` | Game modes now carries explicit dark-mode semantics and nested return routing without a made-up state label | Preserve the current contract while larger runtime gaps close elsewhere |
| In-game pause menu | `Source/Mazer/Private/UI/GamePauseMenu.cpp` | `src/legacy-runtime/legacyOverlayFieldCommit.ts`, `src/legacy-runtime/legacyOverlayRouting.ts`, `src/legacy-runtime/legacyPauseLifecycle.ts`, `src/scenes/MenuScene.ts` | `aligned` | Pause now carries explicit command, field, and nested-overlay return contracts | Preserve the current contract while larger runtime gaps close elsewhere |
| HUD timer and end arrow | `Source/Mazer/Private/UI/GameHud.cpp`, `Source/Mazer/Private/Player/MazerPlayer.cpp` | `src/scenes/MenuScene.ts` | `partial` | HUD timer and goal-arrow behavior are only partially restored | Restore timer and goal-arrow HUD semantics for active play |
| Single-overlay rule | legacy UI widget flow | `src/scenes/MenuScene.ts` | `aligned` | Current reset lane now enforces one active overlay family at a time | Preserve this rule while tightening overlay exactness |
| Visual composition | legacy screenshots `menu-01..04` | `src/legacy-runtime/legacyMenuSnapshot.ts`, `src/legacy-runtime/legacyMenuLayout.ts`, `src/legacy-runtime/legacyMenuTitle.ts`, `src/legacy-runtime/legacyMenuButtonChrome.ts`, `src/legacy-runtime/legacyMenuRender.ts`, `src/scenes/MenuScene.ts` | `partial` | The desktop board now occupies the frame more like the restored legacy screenshots, the title lockup reads closer to the legacy wordmark treatment, and the front-door support chrome is more compact, but final backdrop and board-material closure is still open | Finish screenshot-grade board placement, title treatment, backdrop, and button layout |
| Visual palette roles | legacy screenshots plus `Content/Material/*` | `src/legacy-runtime/legacyDefaults.ts`, `src/legacy-runtime/legacyMenuRender.ts`, `src/scenes/MenuScene.ts` | `partial` | Role colors are back in the legacy lane, but final palette/material tightening is still open | Collapse the remaining role drift toward legacy green/cyan/red over grayscale board |
| Backdrop and sky treatment | `Content/GoodSky/**`, screenshot truth | `src/scenes/MenuScene.ts` | `partial` | Backdrop density and haze are closer to the screenshots, but not yet final screenshot-grade parity | Finish background treatment toward the restored screenshot truth |

## Current truthful conclusion

The current web app is **not** a 1:1 legacy port.

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
3. menu demo AI exactness pass
4. generation lifecycle exactness pass
5. final visual/material/background tightening

## Immediate next slice

`legacy screenshot-grade menu composition packet`

Target:

- keep `Start`, `Options`, and `Exit` locked as front-door truth
- tighten screenshot-facing board/material/title/backdrop parity
- keep the current web app as canonical
- use the restored Unreal project and screenshots as truth while rebuilding the web shell
