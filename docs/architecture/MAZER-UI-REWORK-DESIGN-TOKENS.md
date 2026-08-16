# Mazer UI Rework Design Tokens

## Status

Wave 1B ("Tokens/theme/profile aliases") established the shared source of truth for the Fawxzzy Precision Arcade direction: CSS variables, a typed TypeScript map, Phaser numeric aliases, one canonical player-facing theme, and archived legacy aliases.

The Phaser integration is now live. `src/render/cyberArcadeMaterial.ts` imports `phaserMaterialAliases` directly from `src/theme/tokens.ts`; `MenuScene` uses that material for the board, connected corridors, title, HUD, controls, settings, and pause shell. The first live pass removes decorative star/rune noise, uses a quiet structured canvas, reduces every shared panel to one surfaced fill and one outline, and renders the topology title without orbit/facet effects. This is explicitly render-only: maze topology, progression, input admission, collision, scoring, persistence, and lifecycle contracts remain unchanged. DOM-shell extraction remains separately staged.

## Files

- `docs/contracts/mazer-ui-rework-design-tokens.v1.json` -- the single source of truth: color, spacing, radius, stroke, motion, touch-target, and font tokens (reproduced from the bundle's `spec/design-tokens.json`), plus `canonicalThemeId`, `legacyThemeAliases`, and `archivedThemeAliasMap`.
- `src/theme/tokens.ts` -- typed TypeScript token map (`designTokens`), Phaser-numeric color aliases (`phaserMaterialAliases`, `0xRRGGBB` derived from the same hex strings), the canonical theme id, the archived-alias resolver (`resolveCanonicalThemeId`), and CSS-variable-name helpers.
- `src/theme/tokens.css` -- a `:root` block of `--mazer-token-*` custom properties, one per token, derived from the same JSON registry.
- `scripts/check-design-tokens.mjs` -- validates the JSON registry's internal shape (canonical theme id set, every legacy alias mapped to it, no unmapped/unregistered aliases), cross-checks `decisionRefs` against `docs/contracts/mazer-ui-rework-decision-registry.v1.json`, and cross-checks `src/theme/tokens.css` contains a matching `--mazer-token-*` declaration for every token the JSON defines.
- `tests/architecture/design-tokens-contract.test.ts` -- runs the above checker against the real files, additionally cross-checks `src/theme/tokens.ts`'s exported values against the JSON registry (color map, Phaser aliases, archived alias map), asserts mutated copies of the registry are rejected for each rule, and re-runs the PR #83/#82 protected-path self-check from Wave 0A against this wave's own changes.

## Naming convention

Every CSS custom property is `${cssVariablePrefix}<group>-<name>`, where `cssVariablePrefix` is `--mazer-token-` (registered in the JSON, not hardcoded independently in the checker, CSS, or TS). Colors keep their dotted registry key with the dot replaced by a dash (e.g. `color.bg.canvas` -> `--mazer-token-color-bg-canvas`); spacing steps are named by their pixel value (`--mazer-token-spacing-16`); radius/stroke/motion keep their registry key (`--mazer-token-radius-panel`, `--mazer-token-motion-press`). `fonts.title` (`"topology-rendered"`) is intentionally excluded from the CSS file -- it is not a CSS font stack, it flags that the title is rendered via the topology/path geometry source (Wave 2B/4D), not set with `font-family`.

## Live integration boundary

- `docs/contracts/mazer-ui-rework-design-tokens.v1.json` remains the single source of truth. The material contract test asserts that the live renderer maps its semantic roles back to those exact aliases instead of duplicating color literals.
- `docs/contracts/mazer-ui-rework-decision-registry.v1.json` still locks `single-canonical-theme` and `renderer-ownership-split`. Phaser owns the world visual pass in this release; a DOM shell remains a separate, compatible future lane.
- Visual capture supports `--reduced-motion` and records the exact material version so phone and desktop evidence can verify the same live contract rather than a static token-only registry.

## Non-goals of this wave

This pass does not add a public theme switcher, does not activate rooms or new gameplay objects, and does not extract the DOM shell or touch `src/boot/presentation.ts`. The presentation-theme naming caveat in `docs/architecture/MAZER-UI-REWORK-WAVE-0A-RECONCILIATION.md` remains separate from this material integration.
