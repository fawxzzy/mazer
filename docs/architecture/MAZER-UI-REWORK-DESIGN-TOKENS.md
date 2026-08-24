# Mazer UI Rework Design Tokens

## Status

Wave 1B ("Tokens/theme/profile aliases") establishes the shared source of truth for the Fawxzzy Precision Arcade direction: CSS variables, a typed TypeScript map, Phaser numeric aliases, one canonical player-facing theme, and deprecated query aliases.

Both current renderer boundaries now consume the shared contract. `src/render/cyberArcadeMaterial.ts` imports `phaserMaterialAliases` from `src/theme/tokens.ts`, while `src/styles/base.css` imports `src/theme/tokens.css` exactly once for DOM shell and accessibility/install surfaces. Only existing literals that exactly equal registered tokens are replaced, with identical fallbacks; the differing install-shell palette remains intentionally unchanged. This is presentation-only: maze topology, progression, input admission, collision, scoring, persistence, and lifecycle contracts remain unchanged. DOM-shell extraction remains separately staged.

## Files

- `docs/contracts/mazer-ui-rework-design-tokens.v1.json` -- the single source of truth: color, spacing, radius, stroke, motion, touch-target, and font tokens (reproduced from the bundle's `spec/design-tokens.json`), plus `canonicalThemeId`, `legacyThemeAliases`, and `archivedThemeAliasMap`.
- `src/theme/tokens.ts` -- typed TypeScript token map (`designTokens`), Phaser-numeric color aliases (`phaserMaterialAliases`, `0xRRGGBB` derived from the same hex strings), the canonical theme id, the fail-closed archived-alias resolver (`resolveCanonicalThemeId`), and CSS-variable-name helpers.
- `src/theme/tokens.css` -- a `:root` block of `--mazer-token-*` custom properties, one per token, derived from the same JSON registry.
- `scripts/check-design-tokens.mjs` -- validates the JSON registry's internal shape, cross-checks decision references and every generated CSS declaration, and proves the live base stylesheet imports the token sheet first and exactly once while using the registered semantic-info focus color.
- `tests/architecture/design-tokens-contract.test.ts` -- runs the checker against the real files, cross-checks TypeScript exports and archived aliases, rejects unknown alias resolution, and proves the full current Wave 1B path ceiling remains inside dependency-ordered ownership.
- `src/boot/presentation.ts` -- exposes only `auto` or `precision-arcade` as player-facing theme state. `root`, `noir`, `ember`, `vellum`, `aurora`, and `monolith` remain accepted as deprecated URL aliases but all normalize to `precision-arcade`; invalid values return to `auto`.

## Naming convention

Every CSS custom property is `${cssVariablePrefix}<group>-<name>`, where `cssVariablePrefix` is `--mazer-token-` (registered in the JSON, not hardcoded independently in the checker, CSS, or TS). Colors keep their dotted registry key with the dot replaced by a dash (e.g. `color.bg.canvas` -> `--mazer-token-color-bg-canvas`); spacing steps are named by their pixel value (`--mazer-token-spacing-16`); radius/stroke/motion keep their registry key (`--mazer-token-radius-panel`, `--mazer-token-motion-press`). `fonts.title` (`"topology-rendered"`) is intentionally excluded from the CSS file -- it is not a CSS font stack, it flags that the title is rendered via the topology/path geometry source (Wave 2B/4D), not set with `font-family`.

## Live integration boundary

- `docs/contracts/mazer-ui-rework-design-tokens.v1.json` remains the single source of truth. The material contract test asserts that the live renderer maps its semantic roles back to those exact aliases instead of duplicating color literals.
- `docs/contracts/mazer-ui-rework-decision-registry.v1.json` still locks `single-canonical-theme` and `renderer-ownership-split`. Phaser owns the world visual pass in this release; a DOM shell remains a separate, compatible future lane.
- Ambient family/style rotation remains an offline maze-variety scheduler. Its historical style labels are not player-facing theme IDs and are not exposed by the boot presentation theme contract.
- Visual capture supports `--reduced-motion` and records the exact material version so phone and desktop evidence can verify the same live contract rather than a static token-only registry.

## Non-goals of this wave

This pass does not add a public theme switcher, activate rooms or new gameplay objects, extract the DOM shell, or change ambient maze-family scheduling. Header/profile/diamond revisions and live renderer layout remain later-wave work.
