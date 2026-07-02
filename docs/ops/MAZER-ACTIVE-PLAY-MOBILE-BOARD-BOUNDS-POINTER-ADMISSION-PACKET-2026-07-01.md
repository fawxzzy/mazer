# Mazer Active-Play Mobile Board-Bounds Pointer Admission Packet

Date: 2026-07-01
Repo: `fawxzzy/mazer`
Branch: `codex/mazer-pass2-menu-parity`
Mode: owner-repo runtime parity packet

## Purpose

Close one active-play mobile feel edge case without widening scope into visual polish or infrastructure: touch/pointer starts outside the active maze board should not move the player.

## Owner Chain

- `src/legacy-runtime/legacyPlayStep.ts`
- `src/scenes/MenuScene.ts`
- `src/scenes/menuRuntimeDiagnostics.ts`
- `scripts/visual/edge-live-check.mjs`
- `tests/reset/legacy-play-step.test.ts`
- `tests/scenes/menu-runtime-diagnostics.test.ts`
- `tests/visual/edge-live-check.test.ts`

## Runtime Change

The mobile pointer adapter now supports an explicit active-board bounds contract.

Behavior:

- pointer starts outside the active board return a zero movement vector
- `MenuScene` rejects pointer-down events outside the current play-board rectangle
- the board rectangle includes the active camera-follow board offset
- inside-board swipes still resolve through the same one-step vector contract
- inside-board swipes may release outside the board and still resolve, preserving normal swipe behavior
- final movement still goes through the existing axis-gated collision path
- runtime diagnostics now expose read-only play board/player coordinates for proof harnesses
- the mobile touch smoke proof now swipes from the live player point instead of assuming a virtual D-pad

## Marker Decision

The repo-wide legacy 1:1 marker moves from `89%` to `90%`.

This earns one point in the `Active play movement and win/reset loop` segment because it closes a real mobile gameplay edge case in the active-play owner chain. It does not earn more because final active-play feel and exact generated play-board material parity remain open.

## Validation

Focused validation:

```powershell
npm exec vitest -- run tests\reset\legacy-play-step.test.ts tests\reset\legacy-play-lifecycle.test.ts tests\reset\legacy-reset.test.ts --reporter=dot
npm exec vitest -- run tests\visual\edge-live-check.test.ts tests\scenes\menu-runtime-diagnostics.test.ts --reporter=dot
npm run lint
npm run build
npm run visual:matrix -- --preset core --skip-build true
npm run edge:live -- --skip-build true --headless true --run mobile-touch-smoke
npm run verify
```

Result:

- focused active-play/reset tests: `3` files / `41` tests passed
- visual/diagnostics proof tests: `2` files / `14` tests passed
- TypeScript check: passed
- build: passed
- core visual matrix: passed, `8` captures
- mobile touch smoke: passed, `1` capture
- full verify: passed, `20` files / `113` tests passed

## Boundaries

No deploy was attempted.
No Supabase, Vercel, or GitHub app resources were created.
No duplicate Mazer identity was created.
No ATLAS root branch should absorb this owner-repo runtime work except through the separate stack-lock / inventory resync branch.
