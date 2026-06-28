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
| Maze generation lifecycle | `Source/Mazer/MazerGameModeBase.cpp`, `Source/Mazer/Private/MazerGameState.cpp` | `src/domain/maze/generator.ts`, `src/domain/maze/core.ts`, `src/scenes/MenuScene.ts` | `partial` | Current web generator is a rebuild/adaptation, not a literal process-`0/3/4/5/6/7/8` legacy pipeline | Port the explicit staged lifecycle into the web runtime contract |
| Menu demo AI walker | `Source/Mazer/Private/Player/MazerPlayer.cpp` | `src/domain/ai/demoSpectator.ts`, `src/scenes/menuIntentRuntime.ts`, `src/scenes/MenuScene.ts` | `partial` | Legacy backtracking and AI reset behavior were approximated and productized for readability | Re-port legacy demo walker decisions, backtrack policy, and reset semantics exactly |
| Active play movement | `Source/Mazer/Private/Player/MazerPlayer.cpp` | `src/input-human/*`, `src/scenes/MenuScene.ts` | `partial` | Web play mode exists, but it is hidden inside the current spectator shell rather than matching the legacy front door and flow | Tighten movement, collision gating, and play-state transitions against restored legacy behavior |
| Win/reset loop | `Source/Mazer/MazerGameModeBase.cpp`, `Source/Mazer/Private/MazerGameState.cpp` | `src/scenes/MenuScene.ts`, maze/domain runtime | `partial` | Current web runtime keeps a modernized demo/play loop instead of returning through the same legacy menu pipeline | Restore legacy reset branches for play vs menu demo |
| Main menu front door | `Source/Mazer/Private/UI/MainMenuWidget.cpp` | `src/scenes/MenuScene.ts` | `divergent` | Legacy exposed `Start`, `Options`, `Exit` as the public front door; current web app opens on a productized ambient shell | Rebuild the main menu as the web app front door |
| Options overlay | `Source/Mazer/Private/UI/PauseMenuWidget.cpp` | no direct equivalent | `missing` | Legacy editable scale, camera, path RGB, wall RGB panel does not exist as the current primary web overlay | Recreate the options overlay and its fields in the web app |
| Features overlay | `Source/Mazer/Private/UI/FeaturesWidget.cpp` | no direct equivalent | `missing` | Legacy `camera follow` and `trail fade` toggles are not exposed as a dedicated web surface | Recreate features overlay and bind toggles to runtime state |
| Game modes overlay | `Source/Mazer/Private/UI/GameModesWidget.cpp` | no direct equivalent | `missing` | Legacy dark mode toggle has no equivalent first-class overlay in the web menu flow | Recreate game-mode overlay and bind dark-mode semantics |
| In-game pause menu | `Source/Mazer/Private/UI/GamePauseMenu.cpp` | keyboard/touch pause only inside `src/scenes/MenuScene.ts` | `partial` | Pause exists as a runtime control, but not as a legacy-style overlay with `Back`, `Reset`, `Main Menu`, `Features`, and cam-scale field | Recreate pause overlay and match legacy routing |
| HUD timer and end arrow | `Source/Mazer/Private/UI/GameHud.cpp`, `Source/Mazer/Private/Player/MazerPlayer.cpp` | current HUD/render surfaces inside `src/render/*` and `src/scenes/MenuScene.ts` | `divergent` | Current HUD is a modern spectator/product surface, not the legacy play HUD | Restore timer and goal-arrow HUD semantics for active play |
| Single-overlay rule | legacy UI widget flow | `src/scenes/MenuScene.ts` | `partial` | Repo rule exists, but the current shell is not organized around the same legacy overlay family | Reorganize shell around one active legacy overlay at a time |
| Visual composition | legacy screenshots `menu-01..04` | `src/scenes/MenuScene.ts`, `src/render/*`, `src/styles/base.css` | `divergent` | Current shell is board-first but still a modernized recovery/product shell, not the old menu composition | Match legacy board placement, title treatment, backdrop, and button layout |
| Visual palette roles | legacy screenshots plus `Content/Material/*` | `src/render/palette.ts`, `src/render/boardRenderer.ts` | `partial` | Some role colors survive, but the current theme system widened away from the exact old look | Collapse back toward legacy green/cyan/red over grayscale board |
| Backdrop and sky treatment | `Content/GoodSky/**`, screenshot truth | `src/scenes/MenuScene.ts` ambient sky layer | `divergent` | Current ambient sky is an interpretation, not the legacy cosmic backdrop | Rebuild the background toward the screenshot truth |

## Current truthful conclusion

The current web app is **not** a 1:1 legacy port.

It already contains useful ported pieces:

- core maze/runtime work
- demo AI work
- play-mode input work
- board-first rendering work

But the public shell, overlay model, HUD, and visual composition still differ materially from the restored legacy project.

## Recommended execution order

1. legacy front-door menu and overlay parity
2. active-play HUD and reset-flow parity
3. menu demo AI exactness pass
4. generation lifecycle exactness pass
5. final visual/material/background tightening

## Immediate next slice

`legacy main-menu parity packet`

Target:

- restore `Start`, `Options`, `Exit` as first-class web front-door controls
- restore the one-overlay-at-a-time legacy menu structure
- keep the current web app as canonical
- use the restored Unreal project and screenshots as truth while rebuilding the web shell
