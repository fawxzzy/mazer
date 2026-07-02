# Mazer Active-Play Focus-Loss Input Cleanup Packet

Date: 2026-07-02
Mode: owner-repo Mazer legacy 1:1 pass

## Scope

Module:

- active-play movement and input feel

Owner chain:

- `src/legacy-runtime/legacyPlayStep.ts`
- `src/scenes/MenuScene.ts`
- `src/scenes/menuRuntimeDiagnostics.ts`
- `tests/reset/legacy-reset.test.ts`
- `tests/scenes/menu-runtime-diagnostics.test.ts`

## Problem

The restored active-play movement lane already carried:

- delayed first key press
- held movement flags
- repeat movement
- keyup flag release
- pause/menu/reset buffer cleanup

The browser still had one runtime edge that Unreal normally owns through engine input focus:

- if the page/window lost focus before `keyup`, held movement flags and the pending 50ms movement timer could survive until focus returned

That could create stale movement after the player returned to the maintained browser tab.

## Change

`MenuScene` now installs browser focus guards on create:

- `window.blur`
- `document.visibilitychange`

When focus is lost or the document becomes hidden, the scene calls the existing active-play input cleanup path:

- clears the pending simultaneous-key movement timer
- resets held movement flags
- clears any active pointer start

The guard is detached on scene shutdown.

Runtime diagnostics now count this focus guard in the listener breakdown so the maintained browser proof surface reflects the actual listener shape.

The heavy menu-AI wrong-branch route proof also now declares its `15_000` ms timeout explicitly. The route proof was passing with the larger budget, but full-suite `npm run verify` could overrun Vitest's default 5s per-test limit under serial verification load. This does not change AI runtime behavior; it keeps the existing invalid-jump proof admitted by the repo's normal verify command.

## Proof

Focused proof:

```bash
npm run test -- tests/reset/legacy-reset.test.ts tests/reset/legacy-play-step.test.ts
npm exec vitest -- run tests/scenes/menu-runtime-diagnostics.test.ts tests/visual/edge-live-check.test.ts tests/reset/legacy-reset.test.ts --reporter=dot
npm exec vitest -- run tests/ai/demo-walker.test.ts --reporter=dot
npm run lint
npm run build
npm run edge:live -- --skip-build true --headless true --run core-only-play
npm run verify
```

Results:

- reset/play-step focused proof passed
- scene/runtime/edge-live config proof passed: `3` files, `36` tests
- menu-AI invalid-jump proof passed under its explicit route-proof budget
- lint passed
- build passed
- active-play edge-live proof captured `2` frames
- full verify passed: `20` files, `114` tests

## Marker Decision

The repo-wide legacy 1:1 marker ratchets from `91%` to `92%`.

Reason:

- the touched segment is `Active play movement and win/reset loop`
- the segment moves from `12 / 14` to `13 / 14`
- this closes a real active-play browser-runtime input edge case, not only documentation or diagnostics

Remaining active-play gaps:

- final active-play feel
- exact old-game play-board material
- any edge cases beyond the current keyboard, pointer, focus-loss, collision, HUD, and reset-request contracts

## Boundaries

No deploy.
No live resource mutation.
No Supabase or Vercel mutation.
No duplicate Mazer identity.
No production claim.
