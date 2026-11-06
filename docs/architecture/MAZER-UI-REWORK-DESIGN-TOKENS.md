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
- `docs/contracts/mazer-ui-rework-design-tokens-evidence.v1.json` -- machine-checked provenance for every token added after the original set (tone/scrim colors, `motion.*`, `legacy.*`): each entry cites the shipped file(s) containing the identical literal.
- `scripts/report-off-token-literals.mjs` -- report-only migration meter (see "Migration meter"); never a gate.
- `tests/architecture/design-tokens-sync.test.ts` -- fails if `tokens.ts`, `tokens.css` and the JSON contract disagree (names and values, both directions), if any original token value changes, or if an added token loses its evidence.
- `tests/architecture/off-token-report.test.ts` -- pins the meter's behavior (not the repo's counts).
- `src/boot/presentation.ts` -- exposes only `auto` or `precision-arcade` as player-facing theme state. `root`, `noir`, `ember`, `vellum`, `aurora`, and `monolith` remain accepted as deprecated URL aliases but all normalize to `precision-arcade`; invalid values return to `auto`.

## Naming convention

Every CSS custom property is `${cssVariablePrefix}<group>-<name>`, where `cssVariablePrefix` is `--mazer-token-` (registered in the JSON, not hardcoded independently in the checker, CSS, or TS). Colors keep their dotted registry key with the dot replaced by a dash (e.g. `color.bg.canvas` -> `--mazer-token-color-bg-canvas`); spacing steps are named by their pixel value (`--mazer-token-spacing-16`); radius/stroke/motion keep their registry key (`--mazer-token-radius-panel`, `--mazer-token-motion-press`). `fonts.title` (`"topology-rendered"`) is intentionally excluded from the CSS file -- it is not a CSS font stack, it flags that the title is rendered via the topology/path geometry source (Wave 2B/4D), not set with `font-family`.

## Motion, legacy and tone tokens (additive, zero visual change)

Every token added in this pass equals a value that already ships; no call site was migrated, so rendered output is unchanged. Migration is per owning wave.

- `color.tone.*` / `color.overlay.scrim` -- the four player-message tone colors and the overlay dim color exactly as shipped (`legacyPlayerMessage.ts`, `tuning.ts`, `MenuScene.ts`). They are real roles whose *values* are not yet the canonical palette; retuning them (for example to the `semantic.*` colors) is a deliberate later change made by editing one JSON value and its tests.
- `motion` -- `durationMs` (fast 120, base 200, slow 300, long 400, reveal 700), `introBeatMs` 1200, `staggerMs.beamTotal` 60, `loopMs` (beat 1200, blink 2400, drift 3600), `reducedMotionMs` (the four currently divergent crossfade lengths 250/150/140/45, kept distinct on purpose), `easing.css` (`ease`, `ease-in-out`) and `easing.functions` (smoothstep, smootherstep, easeOutCubic, sineInOut; implemented as `motionEasing` in `tokens.ts`, numerically identical to the live copies). The 2026-11-06 motion audit proposed a retuned ladder (120/200/320/480/720, 40 ms stagger); those values do not ship today, so they are intentionally NOT in the contract yet and need an explicit, visible retune PR.
- `legacy` -- named shipping values that are not canonical tokens (`legacy.color.*`, `legacy.spacingPx`, `legacy.radiusPx`, `legacy.hitTargetPx`, `legacy.fontSizePx`, `legacy.fonts.system`). They exist so off-scale literals have a registry name to migrate to and a single place to be collapsed or retuned later; the header hit targets (32/36/40) remain below the 44 px `touchTargetMinPx` until that wave changes them.

CSS names: color keys keep their registry spelling with dots turned into dashes; every other group converts camelCase to kebab-case (`--mazer-token-motion-duration-fast`, `--mazer-token-legacy-spacing-row-gap`, `--mazer-token-legacy-hit-target-header-max`). `listCssCustomProperties()` in `tokens.ts` and `deriveExpectedCssDeclarations()` in the checker implement the same rule independently and the sync test requires them to agree with `tokens.css`.

## Migration meter

`node scripts/report-off-token-literals.mjs [--json] [--top N]` counts hex colors (`#rgb`, `#rrggbb`, `0xRRGGBB`) and duration literals under `src/` (excluding `src/theme/`), bucketed as canonical-valued / legacy-named / unregistered, and counts files importing the token module. It is report-only and always exits 0. Progress means the literal totals falling and `tokenReferences` rising as each owning wave migrates its call sites.

## Live integration boundary

- `docs/contracts/mazer-ui-rework-design-tokens.v1.json` remains the single source of truth. The material contract test asserts that the live renderer maps its semantic roles back to those exact aliases instead of duplicating color literals.
- `docs/contracts/mazer-ui-rework-decision-registry.v1.json` still locks `single-canonical-theme` and `renderer-ownership-split`. Phaser owns the world visual pass in this release; a DOM shell remains a separate, compatible future lane.
- Ambient family/style rotation remains an offline maze-variety scheduler. Its historical style labels are not player-facing theme IDs and are not exposed by the boot presentation theme contract.
- Visual capture supports `--reduced-motion` and records the exact material version so phone and desktop evidence can verify the same live contract rather than a static token-only registry.

## Non-goals of this wave

This pass does not add a public theme switcher, activate rooms or new gameplay objects, extract the DOM shell, or change ambient maze-family scheduling. Header/profile/diamond revisions and live renderer layout remain later-wave work.
