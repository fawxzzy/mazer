# Mazer Legacy Menu Button Plate Proportion Packet

Date: 2026-07-01

## Scope

Tighten the front-door menu button plate proportions only.

Touched owner chain:

- `src/legacy-runtime/legacyMenuLayout.ts`
- `tests/reset/legacy-menu-layout.test.ts`
- marker/current-truth/parity docs

Not in scope:

- board topology
- title placement
- menu AI/demo route behavior
- maze generation
- overlay behavior
- production deploy
- Supabase or Vercel resource mutation

## Change

The restored legacy screenshots show the front-door `Exit`, `Start`, and `Options` buttons as larger support plates than the current web runtime.

This packet changes only the desktop layout envelope:

- increases desktop button height scaling and min/max bounds
- increases desktop side-button width scaling and min/max bounds
- increases desktop Start button width scaling and max bound
- leaves portrait button sizing bounded by the existing portrait branch

The result is a stronger desktop support-plate read without changing button behavior or mobile fit.

## Browser proof

Captured from the single local preview server on `127.0.0.1:4173`:

- `tmp/captures/mazer-menu-button-plate-proportion-2026-07-01/menu-button-plate-proportion-desktop-1366x900.png`
- `tmp/captures/mazer-menu-button-plate-proportion-2026-07-01/menu-button-plate-proportion-mobile-390x844.png`

## Verification

Commands:

```bash
npm exec vitest -- run tests/reset/legacy-menu-layout.test.ts tests/reset/legacy-menu-button-chrome.test.ts tests/reset/legacy-marker.test.ts --reporter=dot
npm run build
```

## Marker decision

Marker moves from `82%` to `83%`.

Reason: this is a visible runtime front-door shell improvement backed by desktop and mobile browser captures. The desktop buttons now carry a larger support-plate envelope closer to the restored screenshots while portrait remains bounded.

It does not earn more than one point because exact final button placement, title overlap, whole-menu screenshot composition, and legacy player sprite treatment remain open.
