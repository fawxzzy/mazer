# Mazer Legacy Menu Demo Reset Exactness Packet

Date: 2026-06-30
Status: landed
Lane: legacy Unreal truth -> web app reset/port

## Packet

`legacy menu-demo backtrack and reset exactness packet`

This packet closes one bounded menu-demo reset seam without claiming full demo route or final visual parity.

## Owner Chain

- `src/legacy-runtime/legacyMenuDemoLifecycle.ts`
- `src/domain/ai/demoWalker.ts`
- `src/scenes/MenuScene.ts`
- `tests/reset/legacy-menu-demo-lifecycle.test.ts`

## Behavior Change

Before this packet, the menu demo goal-reset branch could finish reset-hold and then wait an extra next-frame movement delay before the scene consumed the process-8 reset request and queued the next process-0 menu generation request.

After this packet:

- menu-demo goal reset creates an immediate process-8 `LegacyResetRequest` once reset-hold has elapsed
- scene-owned menu reset consumption still converts process-8 into the next process-0 menu generation request
- AI-only path-exhausted reset replay remains in the same menu maze and does not request regeneration
- active-play reset-return ownership remains unchanged

## Proof

Focused proof:

```bash
npm run test -- tests/reset/legacy-menu-demo-lifecycle.test.ts tests/ai/demo-walker.test.ts tests/reset/legacy-play-lifecycle.test.ts tests/reset/legacy-reset.test.ts
```

Result:

- `17` test files passed
- `87` tests passed

## Marker Effect

The repo-wide 1:1 marker moves from `95%` to `96%`.

Reason:

- this is a behavior-backed reset-semantics correction, not wording-only documentation
- one concrete menu-demo reset delay gap is removed
- AI-only reset replay is explicitly covered

Still not claimed:

- full legacy-exact demo route/backtracking
- final screenshot-grade board/material parity
- final active-play HUD parity
- line-for-line Unreal topology generation internals
