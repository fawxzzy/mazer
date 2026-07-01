# Mazer Legacy Menu Title Glass Packet

Date: 2026-07-01
Mode: owner-repo visual parity packet
Repo lane: Mazer legacy 1:1 reset/port

## Scope

This packet tightens one bounded menu-title gap:

- owner chain: `src/legacy-runtime/legacyMenuLayout.ts` -> `src/legacy-runtime/legacyMenuTitle.ts` -> `src/scenes/MenuScene.ts`
- proof chain: `tests/reset/legacy-menu-title.test.ts` -> desktop/mobile localhost captures
- completion marker row: `Menu screenshot composition and board presentation`

## Change

The menu wordmark opacity profile now reads closer to the restored screenshots' translucent green title treatment:

- desktop title alpha lowered from the older solid profile to `0.7`
- desktop shadow alpha lowered to `0.34`
- portrait title alpha lowered to `0.76`
- portrait shadow alpha lowered to `0.38`

This preserves the existing board/title layout and does not change:

- menu snapshot topology
- board rendering
- button layout
- demo AI behavior
- active play behavior
- HUD behavior

## Proof

Focused proof:

```bash
npm exec vitest -- run tests/reset/legacy-menu-title.test.ts tests/reset/legacy-marker.test.ts
npm run build
```

Browser proof from the single maintained `4173` localhost tab:

- `tmp/captures/mazer-menu-title-glass-2026-07-01/menu-title-glass-desktop-1366x900.png`
- `tmp/captures/mazer-menu-title-glass-2026-07-01/menu-title-glass-mobile-390x844.png`

## Marker decision

The repo-wide marker moves from `78%` to `79%`.

Reason:

- the touched visual segment changed runtime output, not just documentation
- desktop and mobile captures show the completed board with the more translucent wordmark active
- the weighted row, current truth, parity matrix, system map, and proof surface now agree

Limit:

- exact wordmark material, title-over-board overlap, button composition, and final screenshot-grade menu composition remain open
- this is one point only, not final title/menu closure

