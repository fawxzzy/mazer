# Mazer Active-Play Keyboard Default Consumption Packet

Date: 2026-07-01
Repo: `fawxzzy/mazer`
Branch: `codex/mazer-pass2-menu-parity`
Mode: owner-repo active-play feel guard

## Purpose

Close a narrow browser-feel gap in active play: accepted movement keys should belong to the game loop and should not allow browser default arrow-key behavior to compete with play movement.

## Owner Chain

- `src/scenes/MenuScene.ts`
- `tests/reset/legacy-reset.test.ts`
- `docs/research/MAZER_LEGACY_ONE_TO_ONE_COMPLETION_MARKER.md`
- `docs/current-truth.md`
- `docs/research/MAZER_LEGACY_WEB_PARITY_MATRIX.md`

## Runtime Change

`MenuScene` now calls `event.preventDefault()` for accepted active-play movement keydown and keyup events after the key is recognized as a legacy movement direction.

This keeps the current movement owner intact:

- the simultaneous-key buffer still owns keydown cadence
- held direction flags still resolve through `resolveLegacyPlayMoveVector()`
- movement still routes through `tryMovePlayer()`
- collision still routes through `advanceLegacyPlayStep()`
- the change does not alter mobile pointer/swipe behavior

## Marker Decision

The repo-wide legacy 1:1 marker remains `90%`.

This packet does not earn a point because it is a browser reliability/feel guard inside the already-awarded active-play input segment. It does not close final active-play feel, exact old-game input cadence, or generated play-board material parity.

## Validation

```powershell
npm exec vitest -- run tests\reset\legacy-reset.test.ts tests\reset\legacy-play-step.test.ts --reporter=dot
npm run lint
npm run build
npm run verify
npm run edge:live -- --skip-build true --headless true --run core-only-play
```

Result:

- focused active-play/reset tests: `2` files / `37` tests passed
- TypeScript check: passed
- build: passed
- full verify: `20` files / `113` tests passed
- live play proof: `core-only-play`, `2` captures

## Boundaries

No deploy was attempted.
No Supabase, Vercel, or GitHub app resources were created.
No duplicate Mazer identity was created.
No ATLAS root branch should absorb this owner-repo runtime work except through the separate stack-lock / inventory resync branch.
