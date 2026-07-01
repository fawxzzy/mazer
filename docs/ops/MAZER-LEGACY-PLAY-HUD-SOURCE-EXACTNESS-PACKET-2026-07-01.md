# Mazer Legacy Play HUD Source-Exactness Packet

Date: 2026-07-01
Status: landed

## Scope

This packet tightens the active-play HUD timer and goal-arrow contract against restored legacy source without claiming final old-widget visual parity.

Touched segment:

- `In-game HUD and goal-arrow parity`

Marker result:

- `84% -> 85%`
- HUD row: `6 / 8 -> 7 / 8`

## Restored Source Finding

The restored Unreal player HUD update path formats the timer as a bare clock string and publishes the goal-arrow render transform in degrees:

- `Source/Mazer/Private/Player/MazerPlayer.cpp`
- `TickPlayerHud()`
- `FString::Printf(TEXT("%d:%02d"), Minutes, Seconds)`
- `Minutes = ((int)ElapsedTime / 60) % 10`
- `SetRenderTransformAngle(RotationAngleDegrees)`

This means the browser HUD should not add a `Time` prefix, should preserve the one-digit minute wrap, and should expose degree readback alongside the browser renderer's radians value.

## Runtime Change

Owner chain:

- `src/legacy-runtime/legacyPlayHud.ts`
- `src/scenes/MenuScene.ts#drawHud()`

Changes:

- `formatLegacyHudClock()` now preserves the legacy `% 10` minute wrap.
- active-play `timerText` now renders bare `M:SS` text instead of `Time M:SS`.
- `resolveLegacyPlayHudFrame()` now exposes `arrowAngleDegrees` alongside `arrowAngleRadians`.
- timer proof bounds are narrowed to the compact source-shaped clock chip.
- `MenuScene` visual diagnostics now publish `hud.arrowAngleDegrees`.

## Proof

Commands:

```bash
npm exec vitest -- run tests/reset/legacy-play-hud.test.ts tests/reset/legacy-reset.test.ts tests/reset/legacy-marker.test.ts --reporter=dot
npm run build
```

Local-only visual proof artifacts:

- `tmp/captures/mazer-play-hud-source-exactness-2026-07-01/play-hud-source-exactness-desktop-1366x900.png`
- `tmp/captures/mazer-play-hud-source-exactness-2026-07-01/play-hud-source-exactness-mobile-390x844.png`
- `tmp/captures/mazer-play-hud-source-exactness-2026-07-01/play-hud-source-exactness-desktop-headless-1366x900.png`
- `tmp/captures/mazer-play-hud-source-exactness-2026-07-01/play-hud-source-exactness-desktop-headless-diagnostics.json`
- `tmp/captures/mazer-play-hud-source-exactness-2026-07-01/play-hud-source-exactness-mobile-headless-390x844.png`
- `tmp/captures/mazer-play-hud-source-exactness-2026-07-01/play-hud-source-exactness-mobile-headless-diagnostics.json`

Observed diagnostics:

- `hud.kind`: `legacy-play-hud`
- `hud.visible`: `true`
- `hud.timerText`: `0:00`
- `hud.timerBounds.width`: `64`
- `hud.arrowAngleRadians`: present
- `hud.arrowAngleDegrees`: present

## Non-Claims

This packet does not claim:

- exact legacy HUD material parity
- exact old-widget placement parity
- diagnostics-free final HUD styling
- full active-play feel parity
- production deployment

No Supabase, Vercel, GitHub app-resource, or live infrastructure mutation was made.

## Next Honest Seam

The next HUD seam is screenshot-grade widget styling and placement, using the restored HUD widget/source plus desktop/mobile play-route proof.
