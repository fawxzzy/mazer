# Mazer Legacy Play HUD Visual Source-Widget Packet

Date: 2026-07-01

## Module

Active-play HUD timer / end-arrow visual seam.

## Segment

`In-game HUD and goal-arrow parity`

Marker change:

- before: `86%`
- after: `87%`
- HUD row: `7 / 8 -> 8 / 8`

## Why This Packet Landed

The restored text source only exposes two HUD widget bindings:

- `Timer`
- `EndArrow`

Previous browser HUD passes had already matched the source-owned timer string, minute wrap, arrow angle, and proof bounds. The remaining browser-visible miss was that the live play route still carried a heavier browser-style bordered timer chip, and the maintained `runtimeDiagnostics=1` proof panel covered the top-left timer on desktop.

That made the play route look worse than the actual gameplay state and made the single maintained browser less useful for visual proof.

## Changes

- Active-play runtime diagnostics now publish the scene surface mode and overlay.
- The diagnostics proof panel keeps desktop menu proof in the upper-left gutter, but docks away from the top-left HUD timer when the active surface is `play`.
- The play HUD timer uses a lighter source-shaped text/shadow treatment instead of a bordered browser chip.
- The play goal arrow keeps the compact source-owned image lane with a subtle shadow, without widening gameplay or adding a new HUD concept.

## Proof

Focused tests:

```bash
npm exec vitest -- run tests/scenes/menu-runtime-diagnostics.test.ts tests/scenes/menu-render-frame.test.ts tests/reset/legacy-play-hud.test.ts tests/reset/legacy-marker.test.ts --reporter=dot
npm run lint
npm run build
```

Browser proof from the maintained local preview:

```md
tmp/captures/mazer-play-hud-diagnostics-dock-2026-07-01/play-hud-diagnostics-dock-desktop-1366x900.png
tmp/captures/mazer-play-hud-diagnostics-dock-2026-07-01/play-hud-diagnostics-dock-mobile-390x844.png
tmp/captures/mazer-play-hud-diagnostics-dock-2026-07-01/play-hud-diagnostics-dock-desktop-diagnostics.json
tmp/captures/mazer-play-hud-diagnostics-dock-2026-07-01/play-hud-diagnostics-dock-mobile-diagnostics.json
tmp/captures/mazer-play-hud-diagnostics-dock-2026-07-01/play-hud-diagnostics-dock-console-errors.json
```

Observed proof:

- desktop diagnostics published `surface.mode: play`
- mobile diagnostics published `surface.mode: play`
- desktop diagnostics panel docked at the bottom-left instead of covering the timer
- mobile diagnostics stayed at the compact bottom dock
- console error count: `0`

## Boundary

This closes the current source-backed browser HUD seam.

It does not claim:

- final active-play feel parity
- final play-board material parity
- final menu screenshot parity
- exact Unreal RNG/time-seeding parity
- a production deploy
- any Supabase, Vercel, or duplicate app-resource mutation

If a stronger Unreal widget blueprint/material source is recovered later, that evidence can reopen a narrower HUD visual-style review without invalidating the source-backed timer/arrow contract landed here.
