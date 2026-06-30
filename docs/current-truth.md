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

- `91%`

Why it is not higher yet:

- generation/reset lifecycle is still approximate
- demo AI exactness is still partial
- HUD parity is still partial
- final screenshot-grade menu material/composition is still open

## What is already restored

- legacy archive extraction command: `npm run legacy:extract`
- restored Unreal truth workspace in ATLAS temp storage
- legacy menu-shaped web front door
- fixed legacy-shaped menu snapshot separated from the play-maze generator
- filled the fixed menu snapshot with staircase and right-spine silhouette branches for closer screenshot parity
- upper-left menu snapshot branches now carry a denser frame/pocket/lattice read, which moves the upper-left corner a little closer to the restored legacy screenshots without claiming final screenshot-grade closure
- lower-left menu snapshot shelves now reduce the oversized empty lower-left block in the fixed front-door board, moving the board silhouette a little closer to the restored legacy screenshots without claiming final screenshot-grade closure
- title lockup is now tuned to sit deeper over the board instead of reading like a small shell label
- legacy-style menu demo board/trail presentation
- legacy menu demo now emits live recovery cues and cue-specific pacing instead of collapsing wrong-turn motion back to plain explore timing
- fixed front-door menu snapshot now also runs the mistake-enabled legacy recovery lane instead of a solver-only attract path, so the canonical menu demo can surface dead-end, backtrack, reacquire, and AI-only reset behavior
- fixed front-door menu snapshot bootstrap now settles into a visible `explore` pose instead of stopping in `goal-hold` or `reset-hold`, which keeps the first live menu impression closer to the restored legacy screenshots
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
- legacy front-door `Exit` now routes through an explicit browser-safe quit equivalence contract instead of a temporary explanation overlay, and the dead `message` overlay family has been removed from the active reset lane
- desktop menu layout now gives the front-door board more dominant space in wide viewports, which moves the current web shell closer to the legacy board-first screenshot composition without reopening other menu modules
- desktop title lockup now sits higher and reads less heavily over the board in wide viewports, which moves the wordmark treatment closer to the restored legacy screenshots without reopening button or backdrop ownership
- desktop front-door support chrome now uses narrower button boxes, more inward side-button placement, lighter button treatment, and a slightly stronger button-label/outline read in wide viewports, which moves the lower menu composition closer to the restored legacy screenshots without reopening board or backdrop ownership
- legacy menu backdrop field now routes through an explicit backdrop owner contract in `src/legacy-runtime/legacyMenuBackdrop.ts`, with a denser cloudy/star treatment that moves the desktop space field closer to the restored screenshots without claiming final screenshot-grade closure
- desktop menu board material now reads darker and less evenly tiled in wide viewports, which moves the grayscale trench mass closer to the restored screenshots without claiming final screenshot-grade closure
- menu-mode trench rendering now carries a wider light-core read with quieter wall-grid noise, which moves the board tile read a little closer to the restored screenshots without claiming final screenshot-grade closure
- `runtimeDiagnostics=1` now flows through the live `MenuScene` update loop and publishes a repo-owned runtime diagnostics surface instead of stopping at helper-only parsing/tests
- runtime diagnostics now also publish a proof-only DOM attribute and visible side-browser diagnostics surface so localhost inspection does not depend on the hidden `window.__MAZER_*` globals alone
- the visible runtime diagnostics panel now also exposes active menu-demo cue, mistake-enabled lane state, and path cursor so front-door demo proof no longer depends on the hidden browser globals
- the visible runtime diagnostics panel now also exposes the generation stage cursor, so the side-browser can show consumed stage-7 finalization without relying on hidden globals
- the visible runtime diagnostics panel now prefers the upper-left desktop gutter and a compact bottom fallback on narrow viewports, which keeps the single maintained `4173` browser more usable for menu-parity inspection without removing the proof surface
- legacy options/pause rebuilds now defer to overlay close instead of rebuilding immediately on field commit
- in-game pause commands now route through an explicit legacy pause lifecycle contract for `Back`, `Reset`, and `Main Menu`
- features and game-modes toggles now route through an explicit legacy overlay-toggle contract, with inverted `On/Off` copy kept only where the legacy widget actually owned it
- menu-time overlay fields now route through an explicit legacy field-commit contract, separating deferred reload-on-back fields from the immediate camera-flag path
- nested overlay routing from `Options` / `Pause` back through `Features` and `Game Modes` now routes through an explicit legacy overlay-routing contract
- legacy-style active play start path
- active-play HUD now uses a tighter timer/goal-arrow overlay and repo-owned proof can bound the full overlay footprint
- legacy-style options/features/game-mode/pause overlay structure
- repo-owned reset-lane tests in `tests/reset/`

## What is not yet 1:1

- maze generation lifecycle is still a reset-lane approximation, not the full old staged process graph
- generation/reset branches, stage cadence, budget formulas, process-entry gates, the menu-demo process-8-to-process-0 handoff, and shortcut-disabled stage `4 -> 6` progression are now explicit runtime contracts, but the full staged process `0/3/4/5/6/7/8` port is still not complete
- stage `7` responsibilities, process `8` reset branches, process-0 delay entry, the menu reset handoff, shortcut-disabled stage progression, and stage `0/3/4/5/6` execution cadence are now explicit, but the remaining staged generator implementation is still not fully ported
- stage-cursor diagnostics now expose queued process-0 entry and consumed stage-7 finalization, but the runtime still consumes each request through the current one-shot maze builder rather than an incremental staged port
- level-building scheduler ownership is clearer now, but the runtime still does not execute the full staged Unreal process graph
- demo AI and backtracking are not yet a full legacy-exact port
- in-game HUD is only partially restored
- browser exit cannot literally execute the old engine quit behavior, but the bounded browser-safe quit equivalence is now explicit and proof-backed
- visual/material parity still needs another pass against screenshots and restored assets
- browser automation localhost still does not expose the published `window.__MAZER_*` globals directly, but runtime diagnostics now have a DOM-backed fallback read surface and visible panel on the single `4173` preview server

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
- exact play HUD parity beyond the tighter compact overlay and full proof bounds
- exact demo AI parity beyond the newly restored front-door recovery lane and cue/pacing surface
- exact generation/reset-flow parity beyond the queued request contract
- final screenshot-grade visual parity
