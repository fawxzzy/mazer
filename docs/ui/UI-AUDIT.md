# Mazer UI Audit (Phase 0)

Date: 2026-08-29
Scope: `src/scenes/MenuScene.ts` and everything it owns (menu, active play, pause,
settings, guide, leaderboard, auth/profile), plus the design-token and DOM
component layers that already exist elsewhere in the repo.

This is a documentation-only pass. No rendering code changed as part of this
audit.

## 0. The one finding that changes everything else

**A real, tested, unused DOM component library already exists at
`src/ui/dom/`:** `AppShell`, `StageShell`, `MazerPanel`, `MazerButton`,
`MazerIconButton`, `MazerIcon`, `MazerField`, `MazerPasswordField`,
`MazerSlider`, `MazerSwitch`, `MazerSegmentedControl`, `MazerScrollArea`,
`SettingRow`, `SettingsSection`, `ConfirmDialog`, `StatusBanner`, plus an
`icons.ts` and barrel `index.ts`. It has its own test coverage
(`tests/ui/dom-settings-primitives.test.ts`, part of this branch's known
pre-existing baseline-failure set — one test in it times out, unrelated to
this audit).

**Nothing outside `src/ui/dom/` imports from it.** `index.html` mounts a single
`<div id="app">` for the Phaser canvas; there is no second DOM root. This
library is not wired into the shipping app at all right now.

There is also a real design-token layer underneath the Phaser-side
`cyberArcadeMaterial` (`src/render/cyberArcadeMaterial.ts`), sourced from
`src/theme/tokens.ts`'s `designTokens`: a color map, `spacingPx` scale,
`radiusPx` (control/panel/sheet/round), `strokePx`, `motionMs`
(instant/press/panel/emphasis), `touchTargetMinPx`/`preferredTouchTargetPx`,
and font family tokens (ui/metrics/title). `cyberArcadeMaterial` re-exposes a
Phaser-friendly subset of these as numeric colors instead of CSS variables.

**Before any Phase 1 "build shared primitives" work starts, this needs a
decision, not an assumption:**
- Is `src/ui/dom/*` viable and current (same visual direction, same token
  version), just never finished being wired in? If so, the actual Phase 1
  work is *integration* (how does a DOM overlay coexist with the Phaser
  canvas' own coordinate system, safe-area, and input handling — the
  "mixing DOM and Phaser ownership" risk the redesign brief itself names),
  not *invention*.
- Or is it stale/abandoned from an earlier direction that no longer matches
  `cyberArcadeMaterial`'s current palette/tokens? If so, it's reference
  material at best, and Phase 1 primitives should be built Phaser-native,
  consuming the *existing* `designTokens`/`cyberArcadeMaterial` layer rather
  than inventing a second token system.

Either answer is fine. Proceeding with Phase 1 without asking this question
first risks building a third, parallel component system next to two that
already exist.

## 1. Screen inventory

One file, `src/scenes/MenuScene.ts` (16,466 lines), owns every player-facing
surface. There is no per-screen file/component split at all today.

| Surface | Entry point | Overlay kind |
|---|---|---|
| Boot/loading | `BootScene.ts` (separate scene) | n/a |
| Auth gate (blocking, pre-menu) | drawn inline in menu render path | n/a (`authGateGraphics`, not an `OverlayKind`) |
| Main Menu | `mode === 'menu'`, `overlay === 'none'` | `'none'` |
| Active Play | `mode === 'play'`, `overlay === 'none'` | `'none'` |
| Settings (menu context) | `openOverlay('options')` from menu | `'options'` |
| Settings (play context, via Pause) | reached through Pause | `'options'` (same builder) |
| Pause | `openOverlay('pause')` from play | `'pause'` |
| Login/Account (auth) | `openOverlay('auth')` | `'auth'` |
| Leaderboard | `openOverlay('leaderboard')` | `'leaderboard'` |
| Progression reset confirm | `openOverlay('confirm-progression-reset')` | `'confirm-progression-reset'` |
| Guide | **not a screen** — a section rendered inline inside Settings/Pause via `createLegacyOptionsInfoSection` | n/a |

`LegacyOverlayKind` (`src/legacy-runtime/legacyOverlayRouting.ts`) is the
complete list: `'none' | 'options' | 'pause' | 'auth' |
'confirm-progression-reset' | 'leaderboard'`. There is no dedicated
`'guide'` kind — confirmed below, this is a real structural issue, not just
a visual one.

## 2. Confirmed: Pause is literally Settings' own content, reused

`buildPauseOverlay()` (`MenuScene.ts:11031`) and `buildOptionsOverlay()`
(`MenuScene.ts:10527`) both call:
- `this.createLegacyOptionsInfoSection(...)` — the Guide section
- `this.createFeatureControlRows(...)` — the settings toggle/slider rows

Pause's own additions on top of that shared content are just: a different
header (Home + back-chevron instead of the menu's own header icons) and
`includeMovementSpeed: false` on the control-row builder. Everything else —
guide cards, every settings row, the scroll behavior — is the *exact same
function call* Settings makes. This is direct, code-level confirmation of
"Pause behaves too much like another settings screen," not just a visual
impression from a screenshot.

## 3. Confirmed: icon duplication survives past this session's own icon work

This session wired real HUD icon assets (`hud-profile.png`,
`hud-leaderboard.png`, `hud-settings.png`) into the main menu header, the
profile buttons, and the in-play pause control. But
`drawLegacyLeaderboardTitleGlyph` (`MenuScene.ts:11123`) — the decorative
icon drawn next to the title *on the Leaderboard screen itself* — is still a
completely separate, hand-drawn "three ascending bars" procedural glyph,
not the real leaderboard asset. Its own comment says the intent was for it
to "read as 'the thing that icon opens,'" but it draws its own bars from
scratch instead of reusing `applyLegacyHudIconFrame` +
`MAZER_HUD_LEADERBOARD_ICON_METRICS` the header button now uses. Same
glyph, two independent implementations, one real and one procedural,
visible one screen apart.

The Guide section's own illustrative icons (`drawLegacyOptionsGuideGlyph`,
`drawLegacyOptionsGuideMoveGlyph`, `drawLegacyOptionsGuideTrailGlyph`,
`MenuScene.ts:10946-11030`) are a third visual language again: thin-line
procedural icons for concepts (move, trail) that have no real asset at all
today. Not necessarily wrong (some guide concepts may never need a full art
asset), but worth an explicit decision per the redesign brief's own Guide
section ("Player, Trail, End Tile, Edge Diamonds, Diamond Energy, Teleport
Beam, Bleed-Off Paths... use the same canonical gameplay assets").

## 4. Function inventory (representative, not exhaustive)

64 `drawLegacy*`/`createLegacy*Button`/`createLegacy*Overlay`-style private
methods exist in `MenuScene.ts`. Grouped by the surface they actually
serve:

**Backdrop / board (shared by menu + play, always running):**
`drawBackdrop`, `drawLegacyBackdropShard`, `drawLegacyBackdropRune`,
`drawLegacyBackdropSigils`, `drawStaticBoard`, `drawLegacyPathMaterialTile`,
`drawLegacyPathTileFacet`, `drawLegacyPathBorderDock(Facet)`,
`drawLegacyBleedPathImage`, `drawLegacyBleedOffGlow`, `drawBoardPaths`.

**Title / orbit diamonds (menu + play, decorative):**
`drawLegacyMenuPathTitleCell/PrismSweep/GemFacets/Diamond/OrbitSigils(Twinkle)/Title`,
`drawLegacyPlayerTransferEnergy`, `drawLegacyPlayerSpawnBurst`.

**HUD chrome (menu header + play touch controls):**
`drawLegacyMenuSettingsCog`, `drawLegacyMenuLeaderboardIcon`,
`drawLegacySettingsCogControl`, `drawLegacyPlayTouchControls`,
`drawLegacyPlayTouchStick`, `createLegacyMenuSettingsCogButton`,
`createLegacyMenuLeaderboardButton`, `createLegacyMenuProfileButton`.

**Trail / markers / level announcer:**
`drawLegacyTrailBorder`, `drawLegacyPlayerTrailTileOverlay`,
`drawLegacyPlayDynamicTrailPulse`, `drawLegacyDynamicTrailBorderDock`,
`drawLegacyEndpointGlow`, `drawLegacyGoalStarMarker`,
`drawLegacyProgressionBadge`, `drawLegacyLevelAnnouncer(NumberGlyph)`,
`drawLegacyGlyphWordTileBlock` (the shared tile-font renderer, genuinely
reused well — see §6).

**Overlay shell (shared by all 5 overlay kinds):**
`drawLegacyCyberPanel`, `drawOverlayPanel`,
`drawLegacyOverlayScrollFacade`, `createOverlayTitle`,
`createOverlayBackChevronButton`, `createButton`.

**Per-overlay content (NOT shared, one implementation per screen even
where the content overlaps — see §2):**
`buildOptionsOverlay`, `buildPauseOverlay`, `buildAuthOverlay`,
`buildLeaderboardOverlay`, `buildProgressionResetConfirmationOverlay`,
`createLegacyOptionsGuideHeaderButton`, `drawLegacyOptionsGuideGlyph(s)`,
`drawLegacyLeaderboardTitleGlyph`, `createLegacyAuthActionButton`,
`createLegacyAuthPasswordVisibilityButton`, `createLegacyOverlayUsernameButton`,
`createLegacyOverlayHomeButton`, `drawLegacyProfileIcon`.

## 5. What is already good and should be kept

- `cyberArcadeMaterial` + `designTokens` (§0): a real semantic color/typography/
  spacing/radius/motion token layer exists and much of the file already
  reads colors from it (`cyberArcadeMaterial.signal.player`, `.rail.mint`,
  etc.) rather than hardcoding hex values inline.
- `applyLegacyHudIconFrame` (this session): a genuinely shared, tested
  primitive for the 3 canonical HUD icons, consumed by 4 independent call
  sites. This is the pattern the rest of the redesign should generalize,
  not replace.
- `drawLegacyGlyphWordTileBlock`: one shared tile-font renderer used by the
  title, both front-door buttons, and the level number. Already exactly
  the "one shared primitive, many call sites" shape the redesign wants.
- `resolveLegacyHeaderControlFrame`, `resolveOverlayPanelFrame`,
  `resolveLegacyOverlayShellLayout`: real shared layout-resolver functions
  (not components, but not one-off math either) already factor out header/
  panel geometry.

## 6. Issue log

Severity per the redesign brief's own scale.

**P0 — structural / blocking for a coherent redesign**
- No dedicated `'guide'` overlay kind; Guide is a section glued into
  Settings/Pause, not a real screen (§2).
- `src/ui/dom/*` component library exists, is tested, and is completely
  disconnected from the shipping app (§0) — must be resolved (adopt or
  shelve) before Phase 1 primitive work starts, or the project risks a
  third parallel system.
- Pause has no content of its own distinct from Settings (§2).

**P1 — major hierarchy/duplication**
- Leaderboard screen's own title icon is a second, procedural
  reimplementation of an icon that already has a real asset one screen
  away (§3).
- Per-call-site magic-number sizing: this session alone tuned icon
  `desiredSize` ratios per call site (0.68/1.15, 0.48/0.9, 0.42/0.78) with
  no shared "icon size" token — every future icon placement will need the
  same manual eyeball pass again.
- One 16,466-line file owns every screen; there is no per-surface
  ownership boundary at all, which is why unrelated screens (Pause,
  Settings) can't help sharing bugs and can't be worked on independently
  without re-reading the whole file's context.

**P2 — polish/consistency**
- Guide's illustrative icons (move/trail glyphs) are a third procedural
  visual language, distinct from both the real HUD icon assets and the
  real gameplay VFX assets (diamond/beam/trail) the guide is describing.
- Tile-font usage is already fairly disciplined (title, level number,
  Start/Login) — worth confirming as a rule going forward rather than a
  problem to fix.

**P3 — optional**
- `summarizeCyberArcadeMaterial()` exists for diagnostics but isn't
  surfaced anywhere in the UI itself; could back a future "about/version"
  debug panel.

## 7. What this audit does NOT cover

No screenshots are included. Per the standing note from prior sessions,
reliable in-browser screenshot capture has not worked consistently in this
environment; the "visual-proof harness" the redesign brief calls for is a
real open task, not something this pass could produce. Everything above is
derived from reading the actual source, not from visual inspection.
