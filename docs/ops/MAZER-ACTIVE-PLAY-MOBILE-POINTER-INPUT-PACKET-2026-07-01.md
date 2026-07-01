# Mazer Active-Play Mobile Pointer Input Packet

Date: 2026-07-01
Lane: legacy Unreal truth -> web app reset/port

## Trigger

The current maintained browser target is a mobile web game surface, but active play still depended on keyboard movement only.

The goal was not to invent a separate mobile movement model. The goal was to make mobile input feed the same legacy movement and collision contract already restored for keyboard play.

## Scope

- `src/legacy-runtime/legacyPlayStep.ts`
- `src/scenes/MenuScene.ts`
- `tests/reset/legacy-play-step.test.ts`
- `docs/current-truth.md`
- `docs/system-map.md`
- `docs/research/MAZER_LEGACY_ONE_TO_ONE_COMPLETION_MARKER.md`
- `docs/research/MAZER_LEGACY_WEB_PARITY_MATRIX.md`

## Change

`legacyPlayStep.ts` now owns `resolveLegacyPointerMoveVector()`.

That helper:

- resolves meaningful swipes by drag direction
- resolves short taps from the player's current screen center
- preserves diagonal intent only when both axes are significant
- returns the same `{ deltaX, deltaY }` shape used by keyboard movement

`MenuScene` now wires play-mode `pointerdown` / `pointerup` into that helper and then calls the existing `tryMovePlayer()` path. The result is that pointer/touch input still passes through `advanceLegacyPlayStep()` and the restored axis-gated collision resolver.

## Non-Goals

- No separate mobile-only gameplay rules.
- No maze topology changes.
- No HUD rewrite.
- No menu visual rewrite.
- No production deploy.

## Proof

Focused proof:

```bash
npm exec vitest -- run tests/reset/legacy-play-step.test.ts tests/reset/legacy-reset.test.ts tests/reset/legacy-marker.test.ts --reporter=dot
npm run lint
```

Browser proof:

```text
tmp/captures/mazer-mobile-pointer-input-2026-07-01/play-mobile-pointer-input-390x844.png
```

The single `4173` preview server was rebuilt before proof. A mobile-size right swipe on the play route moved the diagnostics player coordinate from `(37,33)` to `(38,33)` while preserving the visible HUD and without drawing a visible diagnostics panel.

## Marker Re-Evaluation

The Mazer legacy 1:1 marker moves from `87%` to `88%`.

Reason: this packet closes a real active-play usability gap for the browser/mobile target while preserving legacy movement semantics. Mobile swipes and short taps now resolve through the same legacy play-step vector/collision path as keyboard input.

It does not earn more because exact active-play feel, remaining edge cases, exact Unreal input timing beyond keyboard, and final play-board material parity remain open.

## Next Slice

Continue in the active-play lane unless proof exposes a higher-value blocker:

```text
legacy active-play feel and edge-case exactness review
```

Likely targets:

- active-play movement cadence/feel beyond one-step input
- mobile visual readability while playing
- remaining edge cases in reset and pause boundaries
- generated play-board material parity if it blocks play readability
