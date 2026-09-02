# Mazer UI Design Contract (draft, Phase 0 output)

This is a proposed contract, not yet implemented or agreed. It exists so
Phase 1 has something concrete to build against instead of re-deriving
rules per screen. It deliberately builds on the token layers that already
exist (`src/theme/tokens.ts` `designTokens`, `src/render/cyberArcadeMaterial.ts`)
rather than proposing a second one — see `UI-AUDIT.md` §0 for why.

## Visual hierarchy (from the redesign brief, adopted as-is — no disagreement here)

| Area | Contract |
|---|---|
| Background | Near-black space field with quiet motion; never competes with gameplay |
| Surfaces | One dark glass-panel family with restrained mint borders |
| Primary accent | Mint/cyan (`cyberArcadeMaterial.rail.mint` / `.rail.cyan`) for interaction and focus |
| Identity accent | Iridescent rainbow — title, trail, end tile, teleport, exceptional states only |
| Tile font | `MAZER` title, level numbers, major counters, Start/Login-length arcade labels only |
| Body text | One readable sans-serif (`cyberArcadeMaterial.typography.ui`) for settings, guide, account, descriptions |
| Icons | The 3 canonical HUD assets (profile/leaderboard/settings), normalized by visible alpha bounds — not raw canvas size |
| Touch targets | Minimum 44x44 (already a token: `designTokens.touchTargetMinPx`); visible icon size and hit target are separate values |
| Corners | One radius family (`designTokens.radiusPx`: control/panel/sheet/round) across buttons, cards, panels |

## Spacing

`designTokens.spacingPx` already exists as an array — **audit action before
Phase 1, not yet done in this pass:** confirm its actual values match (or
can be extended to match) the brief's proposed `4, 8, 12, 16, 24, 32, 40, 48`
scale, and confirm the Phaser-side code (`MenuScene.ts`) has never had a
numeric equivalent to consume it — right now every panel/row/button in
`MenuScene.ts` computes its own spacing inline (fractions of `panel.width`,
hardcoded pixel offsets like `+ 8`, `- 12`, etc.), not from this array.

## Icon sizing

Formalize what `applyLegacyHudIconFrame` already does as the required
contract for any new or migrated icon, rather than a pattern specific to
the 3 current HUD icons:

- Never scale an icon by its raw source-canvas size.
- Measure the real visible alpha bounds once (Python/Pillow `getbbox()` or
  equivalent), store them as named constants next to the asset's own
  provenance entry in `docs/assets/mazer-vfx-source-provenance.md`.
- Expose one `desiredSize` (the icon's longest visible edge) per placement
  context (header icon, button icon, guide preview, etc.) as a *named*
  constant, not a bare number computed inline at the call site. This
  session's own icon-size fixes (`0.68 -> 1.15`, `0.48 -> 0.9`, `0.42 ->
  0.78`) are the exact kind of unexplained-magic-number drift this rule
  exists to stop.
- Pointer/hit target size is a separate value from the rendered icon size,
  already true in the current header-button code (`hitSize` vs the icon's
  own `desiredSize`) — keep this separation explicit in whatever primitive
  replaces the current per-button closures.

## Typography

- Tile font (`drawLegacyGlyphWordTileBlock`): title, level number,
  Start/Login only. Do not extend to settings rows, guide body copy,
  leaderboard rows, or error/confirmation text — those already correctly
  use `cyberArcadeMaterial.typography.ui`/`.metrics` today; this is a rule
  to *preserve*, not a violation to fix.
- One body font family for everything else, already token-backed
  (`designTokens.fonts.ui`, `"Space Grotesk, ui-sans-serif, system-ui"`
  per `docs/contracts/mazer-ui-rework-design-tokens.v1.json`).
  **Correction, one real exception, not yet reconciled:** the Auth/Account
  surface doesn't use it. `MenuScene.ts:980` defines a separate hardcoded
  `LEGACY_AUTH_UI_FONT_FAMILY` (`'"Segoe UI Variable", "Helvetica Neue",
  Arial, sans-serif'`), used across the auth fields, labels, and actions
  (12 call sites, e.g. `MenuScene.ts:11730-12088`, `12375`) — a genuinely
  different font stack from the token, not just a different name for the
  same thing.

  **Ownership correction (2026-08-30):** an earlier version of this note
  assigned the resolution to "whoever migrates Auth under Wave 3B." That's
  wrong — the constant and every one of its call sites live in
  `MenuScene.ts`, which the decision registry assigns exclusively to Wave
  3A, not Wave 3B (Wave 3B's exclusive paths are `legacyAuth.ts` and
  `legacyPlayerMessage.ts` — auth behavior/messages/domain migration, not
  Phaser presentation). The real ownership:
  - **Wave 3A** owns any change to this existing Phaser Auth/Account font
    constant or its `MenuScene.ts` call sites.
  - **Wave 3B** owns auth behavior, messages, and auth-domain migration —
    not Phaser presentation; it has no standing to decide this.
  - **Wave 3C**, after Wave 4D under the board-first sequence, owns the
    final DOM Auth/Account typography once that surface is actually
    mounted.
  - Until one of those waves acts, `LEGACY_AUTH_UI_FONT_FAMILY` is
    documented here as a transitional legacy exception, not an open
    decision assigned to any wave in particular.

## Motion

`designTokens.motionMs` already defines `instant`/`press`/`panel`/`emphasis`
— confirm these map to the brief's proposed ranges (controls ~120-220ms,
panels/modals ~180-300ms) before treating them as settled, and confirm
every current per-screen animation (blink pulses, overlay open/close,
scroll facades) actually reads from these tokens rather than its own
hardcoded millisecond constant (`LEGACY_MENU_BLINK_PULSE_MS` and similar
are currently `MenuScene.ts`-local, not sourced from `designTokens.motionMs`
— this is the same "token exists, isn't consumed everywhere" pattern as
spacing above).

- Gameplay/transition choreography (maze build/deconstruct, laser sequence,
  player spawn) may run on its own longer timeline — this is a deliberate
  exception, not a violation, per the brief's own "gameplay scene
  transitions may be longer when choreographed."
- Respect `prefersLegacyReducedMotion()` (already exists and is checked
  broadly) as the one central gate for all of the above.

## Z-order contract (staged — correction, 2026-08-30: was a single flat sequence that omitted the title layers and put orbit diamonds before HUD, contradicting the real paint order)

An earlier version of this contract proposed one flat sequence for all
time. That's wrong on two counts, both fixed below: it put "gameplay VFX
(orbit diamonds...)" *before* "HUD (header icons...)", when
`boardZoomContainer`'s real child order does the opposite (header icons
paint before the title/orbit layers — see `UI-SCREEN-MAP.md`'s corrected
list); and it folded the title, orbit-diamond, and tile-font-pool layers
into a vague "gameplay VFX" bucket instead of naming them. Current
implementation order and eventual renderer ownership are related but not
identical — this contract needs both a "what ships now" stage and a
"what Wave 3C changes" stage, not one sequence pretending to cover both.

**Stage A — current Phaser composition, in force through Wave 4D.** Wave
4D must preserve this verified relative order unless a separately
approved visual change deliberately supersedes it (`boardZoomContainer`
child order, `MenuScene.ts:1929-2028`, exactly as corrected in
`UI-SCREEN-MAP.md`'s Z-order section):

```
board/static material (walls, corridor fill, floor, bleed paths)
  -> dynamic path and markers (trail fill, start/goal/player, endpoint glow)
  -> real trail material overlay
  -> transitional legacy Phaser header icons (settings/leaderboard)
  -> titleGraphics (title text)
  -> titleOrbitDiamondImages (orbit diamond sigils/twinkles)
  -> titleTileFontImagePool (tile-font wordmark glyph pool)
```

Screen-fixed effects — `playerSpawnBurstGraphics`,
`playerTransferBeamStripImages`/`playerTransferBeamTargetCapImages`,
`hudGraphics`, `touchSettingsCogIconImage`, `overlayGraphics` — live
outside `boardZoomContainer` in their own top-level coordinate-space
stack (see `UI-SCREEN-MAP.md`) and must not be inferred from the sequence
above; Wave 4D needs to account for both stacks, not assume one implies
the other.

**Stage B — final composite, once Wave 3C mounts.** The HUD moves from
transitional Phaser chrome to DOM, and sits above the Phaser canvas
entirely rather than interleaved with world-space layers:

```
Phaser canvas:
  background/starfield
    -> maze and corridor material
    -> player/trail/start/goal
    -> world-space diamonds, beams, spawn/transfer effects
    -> title and orbit choreography

DOM application layer (above the Phaser canvas):
  HUD and touch controls
    -> application overlays (Settings/Guide/Leaderboard/Auth/Confirm)
    -> confirmation/modal surfaces
    -> blocking/auth interaction surfaces
```

Rules that hold across both stages: Wave 4D owns Phaser/world ordering
and must not prematurely delete, move, or reclassify the legacy Phaser
HUD elements before Wave 3C actually owns their DOM replacement; the
title wordmark, orbit diamonds, and tile-font pool must never be silently
dropped from whichever stage's contract is currently in force; and the
player-trail overlay's existing per-cell exclusion workaround (needed
today because layering alone doesn't prevent it from painting over
markers) is exactly the kind of thing a real, enforced ordering constant
should retire, not something either stage's contract should paper over.

## Correction: this is not an open decision

An earlier draft of this document left "is `src/ui/dom/*` in scope"
unanswered. Per `UI-AUDIT.md` §0, it's already answered by the existing
`renderer-ownership-split` decision and the Wave 2A/2A.1 DOM-primitives
doc: yes, in scope, deliberately unmounted pending Wave 3C. The rules above
(icon normalization, spacing/motion token consumption, typography split,
z-order) apply to whichever wave implements them — this document doesn't
need to re-litigate the renderer choice, only make sure the rules are
consistent with the tokens Wave 1B already shipped
(`src/theme/tokens.ts`/`.css`) rather than proposing new ones.
