# Mazer Legacy Play HUD Contract Packet

Date: 2026-07-01
Repo: `fawxzzy/mazer`
Branch: `codex/mazer-pass2-menu-parity`
Mode: owner-repo bounded legacy 1:1 packet

## Scope

This packet tightens the active-play HUD timer and goal-arrow lane without broad menu or gameplay rewrites.

Changed owner chain:

- `src/legacy-runtime/legacyPlayHud.ts`
- `src/scenes/MenuScene.ts#drawHud()`
- `tests/reset/legacy-play-hud.test.ts`
- `tests/reset/legacy-reset.test.ts`

## What Landed

- Extracted legacy play HUD timer formatting into `formatLegacyHudClock()`.
- Extracted goal-arrow direction math into `resolveLegacyHudArrowAngle()`.
- Added `resolveLegacyPlayHudFrame()` as the repo-owned timer/arrow geometry contract.
- Routed `MenuScene.drawHud()` through the new HUD frame contract.
- Published `timerText` and `arrowAngleRadians` through `window.__MAZER_VISUAL_DIAGNOSTICS__`.
- Added focused reset-lane tests for timer formatting, arrow angle, timer bounds, arrow bounds, and scene wiring.

## Proof

Focused tests:

```bash
npm exec vitest -- run tests/reset/legacy-play-hud.test.ts tests/reset/legacy-reset.test.ts tests/reset/legacy-marker.test.ts --reporter=dot
npm run lint
npm run build
```

Browser proof paths:

```text
C:\ATLAS\tmp\captures\mazer-play-hud-contract-2026-07-01\play-hud-contract-desktop-1366x900.png
C:\ATLAS\tmp\captures\mazer-play-hud-contract-2026-07-01\play-hud-contract-desktop-diagnostics.json
C:\ATLAS\tmp\captures\mazer-play-hud-contract-2026-07-01\play-hud-contract-mobile-390x844.png
C:\ATLAS\tmp\captures\mazer-play-hud-contract-2026-07-01\play-hud-contract-mobile-diagnostics.json
```

The corrected diagnostics readback showed:

- `hud.kind = legacy-play-hud`
- `hud.visible = true`
- `hud.timerText = Time 0:00`
- `hud.arrowAngleRadians` non-null
- `runtime.mode = play`

## Marker Decision

Segment touched:

- `In-game HUD and goal-arrow parity`

Marker movement:

- `83% -> 84%`
- row points: `5 / 8 -> 6 / 8`

Why only one point:

- The timer/arrow contract is now repo-owned, tested, wired into the scene, and proved in desktop/mobile diagnostics.
- Exact old HUD material, exact placement, diagnostics-free screenshot styling, and active-play feel edge cases remain open.

## Boundaries

- No production deploy.
- No live resource mutation.
- No Supabase or Vercel app-resource mutation.
- No duplicate app identity.
- No broad menu visual pass.
- No claim that the Mazer web app is 1:1 complete.

## Next Honest Slice

Continue with one bounded packet, not a broad pass:

- final screenshot-grade board/material review, or
- final screenshot-grade play HUD visual polish, or
- active-play/HUD edge-case exactness review
