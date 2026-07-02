# Mazer Legacy Menu Dynamic Overlay Thinner Highlight Packet

Date: 2026-07-01
Mode: owner-repo implementation
Branch: `codex/mazer-pass2-menu-parity`

## Scope

This packet touches the legacy menu screenshot-composition segment only.

Owner chain:

- `legacy/screenshots/menu-01.png` .. `legacy/screenshots/menu-04.png`
- `docs/legacy/art-direction.md`
- `src/scenes/MenuScene.ts`
- `tests/scenes/menu-render-frame.test.ts`

## Change

The menu-time dynamic trail/start/goal/player overlay footprint was reduced:

- `LEGACY_MENU_DYNAMIC_MARKER_INSET_RATIO`: `0.24` -> `0.3`
- `LEGACY_MENU_DYNAMIC_TRAIL_CORE_RATIO`: `0.34` -> `0.22`
- `LEGACY_MENU_DYNAMIC_TRAIL_EDGE_RATIO`: `0.52` -> `0.42`

This keeps the existing corridor-framed dynamic overlay path but makes the cyan route and marker footprint less blocky in both desktop and mobile captures.

## Negative proof

A segment-core static-board experiment was tried first and rejected because it reintroduced a checkerboard/tiny-grid read that moved the board away from the restored screenshots. That experiment was not kept.

## Proof

Commands:

```bash
npm run test -- tests/scenes/menu-render-frame.test.ts
npm run lint
npm run build
```

Browser proof:

- desktop capture: `tmp/mazer-menu-thin-dynamic-overlay-desktop-2026-07-01.png` (local-only ATLAS scratch)
- mobile capture: `tmp/mazer-menu-thin-dynamic-overlay-mobile-2026-07-01.png` (local-only ATLAS scratch)
- console errors observed during final captures: `0`

## Marker

Repo-wide 1:1 marker remains `70%`.

No ratchet is justified because this reduces one dynamic overlay/material miss, but it does not close screenshot-grade menu composition, exact legacy trail/player sprite treatment, dense board geometry, or full menu material parity.

## Boundaries

- No maze topology or AI behavior changed.
- No deploy was attempted.
- No Supabase, Vercel, or duplicate app-resource mutation occurred.
