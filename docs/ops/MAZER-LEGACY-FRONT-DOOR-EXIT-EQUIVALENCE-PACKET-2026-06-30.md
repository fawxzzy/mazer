# Mazer Legacy Front-Door Exit Equivalence Packet

Date: 2026-06-30
Status: landed
Segment: `Front-door menu shell semantics`
Marker move: `83% -> 84%`

## Goal

Close the last named front-door behavior gap by replacing the temporary message-overlay explanation with a browser-safe, proof-backed equivalent of the legacy Unreal `quit` command.

## Legacy truth

- Legacy owner: `tmp/mazer-legacy-unreal-restore/Source/Mazer/Private/UI/MainMenuWidget.cpp`
- Exact recovered behavior:
  - `Exit_Button` binds `OnExitClicked`
  - `OnExitClicked()` runs `PlayerController->ConsoleCommand("quit");`

## Current web owner chain

1. `src/legacy-runtime/legacyExit.ts`
2. `src/scenes/MenuScene.ts`
3. `tests/reset/legacy-exit.test.ts`
4. `tests/reset/legacy-reset.test.ts`

## Landed contract

- Front-door `Exit` no longer opens a message overlay.
- The repo now treats browser-safe quit equivalence as:
  1. best-effort `window.close()`
  2. durable fallback `location.replace('about:blank')`
- This is the bounded browser equivalent of the old Unreal `quit` command.
- The old `message` overlay family has been removed from the active reset-lane contract because it no longer owns any live legacy-facing behavior.

## Why this counts

- The legacy front door is behavior-owned by `Start`, `Options`, and `Exit`.
- `Start` and `Options` were already restored as first-class controls.
- `Exit` previously preserved only the label while detouring into a web-only explanation overlay.
- This packet moves `Exit` back into a first-class action path with explicit non-literal equivalence rules, which closes the remaining front-door semantics gap.

## Proof

Ran clean:

- `npm run test -- tests/reset/legacy-exit.test.ts`
- `npm run test -- tests/reset/legacy-reset.test.ts`
- `npm run verify`

## Boundaries preserved

- No duplicate app identity
- No deploy
- No live resource mutation
- No claim that browser quit is literally Unreal quit
- Shipping current web repo remains canonical

## Result

- Front-door menu shell semantics are now treated as `aligned`.
- The repo-wide legacy 1:1 completion marker ratchets from `83%` to `84%`.
