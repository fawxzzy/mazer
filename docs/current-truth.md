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
  - message
- The current menu shell is intentionally simpler and closer to the archived Unreal menu composition than the previous recovery shell.

## What is already restored

- legacy archive extraction command: `npm run legacy:extract`
- restored Unreal truth workspace in ATLAS temp storage
- legacy menu-shaped web front door
- legacy-style menu demo board/trail presentation
- legacy-style active play start path
- legacy-style options/features/game-mode/pause overlay structure
- repo-owned reset-lane tests in `tests/reset/`

## What is not yet 1:1

- maze generation lifecycle is still a reset-lane approximation, not the full old staged process graph
- demo AI and backtracking are not yet a full legacy-exact port
- in-game HUD is only partially restored
- browser exit cannot literally execute the old engine quit behavior
- visual/material parity still needs another pass against screenshots and restored assets

## Current proof rule

For the reset lane, the local proof spine is:

1. `npm run legacy:extract`
2. `npm run verify`

Current `verify` means:

- reset-lane tests
- demo walker reset-flow proof tests
- production build

The older visual matrix / Edge live proof lane is now archival for comparison, not current closure truth for the reset lane.

## Release rule

- Do not claim production parity with the old game yet.
- Do not claim 1:1 parity until the parity matrix gaps are actually closed.
- Do not reopen the old recovery/product shell as if it were the authoritative direction.

## Still open

- exact main-menu behavior polish
- exact play HUD parity
- exact demo AI parity
- exact generation/reset-flow parity
- final screenshot-grade visual parity
