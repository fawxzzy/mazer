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
  (`designTokens.fonts.ui`).

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

## Z-order contract (proposed, formalizing what's implicit today)

```
background/starfield
  -> maze (static walls, corridor material)
  -> path/trail (color fill + real trail material overlay)
  -> gameplay VFX (orbit diamonds, laser, spawn burst, endpoint glow)
  -> HUD (header icons, touch controls)
  -> overlays (Settings/Pause/Guide/Leaderboard/Auth/Confirm)
  -> modal/blocking interaction (auth gate, confirm dialogs)
```

This already roughly matches `boardZoomContainer`'s real child order (see
`UI-SCREEN-MAP.md`), but it has never been written down, which is how the
player-trail overlay ended up needing an explicit per-cell exclusion
workaround to avoid painting over markers instead of the layering simply
preventing it by construction. Any new primitive-based rendering should
make this order a real, enforced constant, not an emergent property of
`.add()` call sequence.

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
