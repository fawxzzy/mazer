# Mazer Active-Play Pointer Identity Packet

Date: 2026-07-03
Mode: owner-repo Mazer legacy 1:1 pass
Branch: `codex/mazer-active-pointer-identity`

## Scope

Bounded active-play mobile input tightening.

Owner chain:

- `src/legacy-runtime/legacyPlayStep.ts`
- `src/scenes/MenuScene.ts`
- `tests/reset/legacy-play-step.test.ts`
- `tests/scenes/menu-render-frame.test.ts`

## Change

- Added repo-owned pointer identity helpers for active play.
- Bound each in-flight swipe/tap to one pointer identity.
- Ignored competing touches instead of letting them overwrite the active pointer start.
- Wired `pointerupoutside` through the same active-play release path so inside-board starts may still complete after leaving the canvas.
- Cleared stale pointer starts on Phaser `gameout`.

## Why

The previous mobile pointer path had correct vector mapping and board-bounds admission, but a second touch could overwrite the original start point and a window-edge release could leave the active pointer state stale. That creates wrong or sticky movement on mobile even though keyboard and single-touch tests pass.

## Marker

The legacy 1:1 marker remains `93%`.

Reason: this closes a real mobile-web active-play feel edge case inside the already-awarded mobile input segment. It does not close final active-play feel, exact legacy player sprite treatment, generated play-board material parity, Unreal RNG/time seeding, or process-yield timing.

## Proof

```powershell
npm exec vitest -- run tests/reset/legacy-play-step.test.ts tests/scenes/menu-render-frame.test.ts --reporter=dot
npm run lint
npm run verify
npm run edge:live -- --skip-build true --headless true --run core-only-play
```

Result:

- focused tests: `32` passed
- TypeScript lint: passed
- full verify: `20` test files / `131` tests passed, production build passed
- edge live play: `2` captures; phone and desktop board overflow, HUD overlap, and HUD clip all passed
