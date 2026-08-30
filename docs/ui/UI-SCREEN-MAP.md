# Mazer UI Screen Map

Companion to `UI-AUDIT.md`. One row per surface: how you get there, what
draws it, what layer it lives on, and what it currently shares with other
screens.

All rendering happens inside `src/scenes/MenuScene.ts` unless noted.
"Layer" refers to the Phaser display-list groupings that exist today:
`boardZoomContainer` (board-space, affected by board zoom), `overlayGraphics`
+ tracked `uiButtons`/`uiTexts` (overlay screens), `hudGraphics` (play-mode
HUD chrome), and a handful of standalone top-level Graphics/Image objects
(`playerSpawnBurstGraphics`, the HUD icon Images, etc.).

| Screen | Reached via | Builder(s) | Layer | Shares content with |
|---|---|---|---|---|
| Boot/loading | app start | `BootScene.ts` (separate scene) | n/a | nothing |
| Auth gate | blocks menu until auth resolves | inline in menu render path, `authGateGraphics` | top-level | nothing |
| Main Menu | `mode='menu'`, `overlay='none'` | `rebuildUi()`'s `overlay==='none'` branch, `drawLegacyMenuSettingsCog`, `drawLegacyMenuLeaderboardIcon`, `createLegacyMenuProfileButton`, `drawLegacyMenuPathTitle` | `boardZoomContainer` (title/icons), top-level buttons | Active Play (shares the whole board/backdrop/title rendering pipeline) |
| Active Play | `mode='play'` | `drawDynamicBoard`, `drawHud`, `drawLegacyPlayTouchControls` | `boardZoomContainer` + `hudGraphics` | Main Menu (board pipeline); Pause (touch cog uses the same real settings icon as the menu header) |
| Settings | `openOverlay('options')` (menu only — there is no route from Pause into this overlay) | `buildOptionsOverlay` -> `createLegacyOptionsInfoSection` (Guide) + `createFeatureControlRows` | `overlayGraphics` + `uiButtons` | **Pause** (Pause calls the same two builder functions directly, not by navigating here — see below) |
| Pause | `openOverlay('pause')` from play (a distinct overlay kind, not reached through Settings) | `buildPauseOverlay` -> the *same* `createLegacyOptionsInfoSection` + `createFeatureControlRows` calls Settings makes, inlined directly, plus `createLegacyOverlayHomeButton` | `overlayGraphics` + `uiButtons` | **Settings** (see `UI-AUDIT.md` §2 — this is direct content duplication between two independent overlay kinds, not a navigation relationship) |
| Guide | not a screen; a section inside Settings/Pause | `createLegacyOptionsInfoSection`, `createLegacyOptionsGuideHeaderButton`, `drawLegacyOptionsGuideGlyph(s)` | inside the Settings/Pause overlay content | n/a |
| Login/Account (auth) | `openOverlay('auth')` | `buildAuthOverlay`, `createLegacyAuthActionButton`, `createLegacyAuthPasswordVisibilityButton` | `overlayGraphics` + `uiButtons` | none |
| Leaderboard | `openOverlay('leaderboard')` | `buildLeaderboardOverlay`, `drawLegacyLeaderboardTitleGlyph`, `resolveLegacyLeaderboardRowAccent` | `overlayGraphics` + `uiButtons` | none (own icon glyph, own row rendering) |
| Progression reset confirm | `openOverlay('confirm-progression-reset')` | `buildProgressionResetConfirmationOverlay` | `overlayGraphics` + `uiButtons` | shares the generic `drawOverlayPanel`/`createOverlayTitle`/`createOverlayBackChevronButton` shell every overlay uses |

## Shared shell (every overlay kind routes through this)

`rebuildUi()` -> `drawOverlayPanel()` -> `switch (this.overlay)` -> one
`build*Overlay()` call. `drawOverlayPanel`, `createOverlayTitle`,
`createOverlayBackChevronButton`, `drawLegacyCyberPanel`, and
`drawLegacyOverlayScrollFacade` are genuinely shared across all 5 overlay
kinds already — this part of the architecture is in reasonable shape.

## Z-order (menu/play board space, `boardZoomContainer` children, in paint order)

1. `boardStaticGraphics` (walls)
2. `boardPathGraphics` (corridor color fill)
3. `boardFloorTileSprite` + `boardFloorMaskGraphics` (real floor material, masked to walkable cells)
4. `boardBleedPathImages` (real bleed-path asset, pooled)
5. `boardDynamicGraphics` (trail color fill, start/goal/player markers, endpoint glow — all one Graphics object)
6. `playerTrailImages` (real trail asset overlay, pooled) — **above** `boardDynamicGraphics`, so it can't render under the player/start/goal markers without also being excluded from those specific cells (it is, via the same exclusion the color-fill loop uses)
7. `headerSettingsIconImage`, `headerLeaderboardIconImage` (real HUD icons)
8. `titleGraphics` (title text, orbit diamond sigils, orbit-diamond twinkles)

Top-level (screen-fixed, outside `boardZoomContainer`): `overlayGraphics`,
`hudGraphics`, `touchSettingsCogIconImage`, `playerSpawnBurstGraphics`,
`playerTransferBeamStripImages`/`playerTransferBeamTargetCapImages`,
`titleOrbitDiamondImages`... — **note:** `titleOrbitDiamondImages` is
actually inside `boardZoomContainer` (added via a separate `.add()` call
right after the main array), not top-level; listed here only to flag that
the "which objects are board-space vs screen-fixed" boundary is not
obvious from any one place in the file and had to be traced call-by-call
for this map. That traceability gap is itself a P1-worthy finding for
whatever replaces this structure.

## Open questions this map surfaces

1. Does Active Play get its own Guide/Settings entry point independent of
   Pause, or does Pause remain the only path to Settings during play?
   Today there is no route at all from Pause into the `options` overlay —
   Pause duplicates Settings' content instead of navigating to it (see the
   table above). Whichever screen Wave 3C's mounting work settles on,
   Guide (currently reachable only as a section inside both) needs an
   explicit decision about whether it becomes reachable from the main
   menu directly too.

(The `src/ui/dom/*` question previously listed here is resolved — see
`UI-AUDIT.md` §0. It is in scope; Wave 3C owns when/how it gets mounted.)
