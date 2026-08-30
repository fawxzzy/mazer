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
| Auth-resolution boot blocker | automatic while `authGateAwaitingResolution` is true; `overlay` stays `'none'` throughout | `syncLegacyAuthGateLoadingScreen` — a full-screen, max-depth interactive rectangle plus a pulsing loading glyph, independent of `overlay` | top-level (own max-depth blocker, above everything) | nothing — no `LegacyOverlayKind` covers this state; see `UI-AUDIT.md` §1's correction |
| Main Menu | `mode='menu'`, `overlay='none'` | `rebuildUi()`'s `overlay==='none'` branch, `drawLegacyMenuSettingsCog`, `drawLegacyMenuLeaderboardIcon`, `createLegacyMenuProfileButton`, `drawLegacyMenuPathTitle` | `boardZoomContainer` (title/icons), top-level buttons | Active Play (shares the whole board/backdrop/title rendering pipeline) |
| Active Play | `mode='play'` | `drawDynamicBoard`, `drawHud`, `drawLegacyPlayTouchControls` | `boardZoomContainer` + `hudGraphics` | Main Menu (board pipeline); Pause (touch cog uses the same real settings icon as the menu header) |
| Settings | `openOverlay('options')` (menu only — there is no route from Pause into this overlay) | `buildOptionsOverlay` -> `createLegacyOptionsInfoSection` (Guide) + `createFeatureControlRows` | `overlayGraphics` + `uiButtons` | **Pause** (Pause calls the same two builder functions directly, not by navigating here — see below) |
| Pause | `openOverlay('pause')` from play (a distinct overlay kind, not reached through Settings) | `buildPauseOverlay` -> the *same* `createLegacyOptionsInfoSection` + `createFeatureControlRows` calls Settings makes, inlined directly, plus `createLegacyOverlayHomeButton` | `overlayGraphics` + `uiButtons` | **Settings** (see `UI-AUDIT.md` §2 — this is direct content duplication between two independent overlay kinds, not a navigation relationship) |
| Guide | not a screen; a section inside Settings/Pause | `createLegacyOptionsInfoSection`, `createLegacyOptionsGuideHeaderButton`, `drawLegacyOptionsGuideGlyph(s)` | inside the Settings/Pause overlay content | n/a |
| Login/Account (auth) | `openOverlay('auth')`, or `update()` force-setting `overlay='auth'` once resolution finishes locked (signed-out, no guest access) | `buildAuthOverlay`, `createLegacyAuthActionButton`, `createLegacyAuthPasswordVisibilityButton` — same `'auth'` overlay kind either way (correction: this row and the boot-blocker row above were previously merged into one; they're genuinely two different states — see `UI-AUDIT.md` §1's third-pass correction) | `overlayGraphics` + `uiButtons`, **plus a real native DOM input layer outside both — see below** | none |
| Leaderboard | `openOverlay('leaderboard')` | `buildLeaderboardOverlay`, `drawLegacyLeaderboardTitleGlyph`, `resolveLegacyLeaderboardRowAccent` | `overlayGraphics` + `uiButtons` | none (own icon glyph, own row rendering) |
| Progression reset confirm | **Two entry points, one hardcoded return** — from the authenticated Account section of the Auth overlay (`buildAuthenticatedAccountSection`, `MenuScene.ts:11491`) and from Pause (`applyLegacyPauseCommand('reset-progression')`, `MenuScene.ts:14951`), both via `openOverlay('confirm-progression-reset')` | `buildProgressionResetConfirmationOverlay` | `overlayGraphics` + `uiButtons` | shares `drawOverlayPanel` (universal) and `createOverlayTitle`; does **not** call `createOverlayBackChevronButton` — see the corrected "Shared shell" section below. **Confirmed defect, not just a doc gap:** `legacyOverlayRouting.ts:31-35` always routes Cancel/back from this overlay to `'pause'`, unconditionally — so cancelling from the Account entry point currently opens the play-oriented Pause surface while still in menu mode. `UI-MIGRATION-PLAN.md`'s first-integration-proof section requires restoring focus to the invoking control; a Wave 3C proof built only against the Pause path would miss this and could ship the same defect in DOM form. |

## Shared shell (correction: only one function is actually common to all 5)

`rebuildUi()` -> `drawOverlayPanel()` -> `switch (this.overlay)` -> one
`build*Overlay()` call. Only `drawOverlayPanel()` (`MenuScene.ts:10371`,
one call site) is genuinely common to all 5 overlay kinds through
`rebuildUi()`. An earlier version of this section also claimed
`createOverlayTitle`, `createOverlayBackChevronButton`,
`drawLegacyCyberPanel`, and `drawLegacyOverlayScrollFacade` were shared
across all 5 — checked against actual call sites, none of them are:

- `createOverlayTitle`: called by Leaderboard, Progression-reset-confirm,
  and Auth (4 call sites) — **not** by Options or Pause.
- `createOverlayBackChevronButton`: called by Options, Pause, Leaderboard,
  and Auth (4 call sites) — **not** by the progression-reset confirmation.
- `drawLegacyCyberPanel`: one of its 4 call sites is inside Options'
  own Guide subsection; the other 3 are elsewhere in the file entirely
  unrelated to any overlay builder. Not a shared outer-overlay shell at
  all.
- `drawLegacyOverlayScrollFacade`: only 2 call sites, Options and Pause —
  the two overlays that share scrollable content per §2, not all 5.

Net correction: this shell is thinner than previously documented. Only
`drawOverlayPanel()`'s outer dispatch is a real, universal primitive.
Whoever plans Wave 3C's extraction should treat the other four as
partially-shared, per-overlay-subset helpers, not as an existing
all-overlay primitive ready to lift as-is.

## Auth/Account's real native DOM input layer (missing from earlier passes)

The Auth/Account surface isn't Phaser-only. Focusing an Auth or Account
field creates a real `<input>` element outside the Phaser canvas
entirely, via three symmetric pairs of methods in `MenuScene.ts`:

- **Auth form fields** (email/password/etc.): `createLegacyAuthNativeInput(fieldId)`
  (`MenuScene.ts:13278`), `positionLegacyAuthNativeInput(fieldId, bounds)`
  (`:13405`), `destroyLegacyAuthNativeInput()` (`:13433`).
- **Account username field**: `createAccountUsernameNativeInput()`
  (`MenuScene.ts:11835`), `positionAccountUsernameNativeInput(bounds)`
  (`:11886`), `destroyAccountUsernameNativeInput()` (`:11905`).

Both `create*` methods append their `<input>` directly to
`document.body` (`document.body.appendChild(input)`, `:13368` and
`:11881`) at `zIndex: '2147483647'` (`:13303` and `:11857`) — the
maximum valid CSS z-index, placed above everything the Phaser canvas or
any overlay chrome can render. Each pair keeps its own stored element
reference, position/size sync, event listeners, and destroy path,
independent of `overlayGraphics`/`uiButtons`; the Auth-field input and
the Account-username input are two separate instances with two separate
lifecycles, not one shared control.

**Current teardown coverage** (so a Wave 3C migration doesn't
accidentally drop any of it): both `destroy*` calls fire together at
scene/mode shutdown (`MenuScene.ts:2090-2091`), together on overlay close
while `overlay === 'auth'` (`:14897-14898`), and `destroyLegacyAuthNativeInput()`
alone fires on auth-form field reset (`:13583`) and at several other
form-state-change points. This existing coverage is real, not
theoretical — but it's scattered across call sites rather than centralized,
which is exactly the kind of thing a DOM migration can silently miss one
of.

**Wave 3C migration invariant, recorded here so it isn't rediscovered the
hard way:** a replacement DOM Auth/Account form must not mount while a
legacy shadow input is still alive.

- Legacy inputs must be destroyed (or explicitly retired) before a
  replacement DOM control takes ownership of focus, pointer input,
  keyboard input, or browser-native password-manager/autocomplete/autofill
  behavior for the same logical field.
- At most one intended active input should exist for a given field at any
  time — never a legacy shadow input plus a new DOM control both present.
- Closing or unmounting the Auth/Account surface must remove every native
  input and listener this layer owns, the same way the current
  overlay-close/scene-shutdown/field-reset paths already do.
- A new DOM form rendering visually above a surviving legacy input is not
  sufficient — the legacy input is still focusable/interactive at
  `z-index: 2147483647` even if visually obscured.

This section documents current ownership and the required teardown
boundary only — it does not redesign the Auth screen.

## Z-order (menu/play board space, `boardZoomContainer` children, in paint order)

1. `boardStaticGraphics` (walls)
2. `boardPathGraphics` (corridor color fill)
3. `boardFloorTileSprite` + `boardFloorMaskGraphics` (real floor material, masked to walkable cells)
4. `boardBleedPathImages` (real bleed-path asset, pooled)
5. `boardDynamicGraphics` (trail color fill, start/goal/player markers, endpoint glow — all one Graphics object)
6. `playerTrailImages` (real trail asset overlay, pooled) — **above** `boardDynamicGraphics`, so it can't render under the player/start/goal markers without also being excluded from those specific cells (it is, via the same exclusion the color-fill loop uses)
7. `headerSettingsIconImage`, `headerLeaderboardIconImage` (real HUD icons)
8. `titleGraphics` (title text)
9. `titleOrbitDiamondImages` (orbit diamond sigils/twinkles)
10. `titleTileFontImagePool` (the tile-font wordmark glyph pool)

**Correction:** an earlier version of this list ended at `titleGraphics`
and separately, incorrectly, called `titleOrbitDiamondImages` top-level.
Both `titleOrbitDiamondImages` (`MenuScene.ts:2017-2020`) and
`titleTileFontImagePool` (`MenuScene.ts:2024-2028`) are added to
`boardZoomContainer` via their own `.add()` calls *after* the main array
that ends with `titleGraphics` (`MenuScene.ts:1929-1953`) — both paint
above `titleGraphics`, and `titleTileFontImagePool` was omitted from this
list entirely. Getting this right matters because `UI-DESIGN-CONTRACT.md`'s
Z-order section proposes formalizing this exact map as Wave 4D's enforced
renderer order — an incomplete sequence here would make that wave
reproduce the title layers in the wrong stacking order.

Top-level (screen-fixed, outside `boardZoomContainer`): `overlayGraphics`,
`hudGraphics`, `touchSettingsCogIconImage`, `playerSpawnBurstGraphics`,
`playerTransferBeamStripImages`/`playerTransferBeamTargetCapImages`. The
"which objects are board-space vs screen-fixed" boundary is not obvious
from any one place in the file and had to be traced call-by-call for this
map — that traceability gap is itself a P1-worthy finding for whatever
replaces this structure.

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
