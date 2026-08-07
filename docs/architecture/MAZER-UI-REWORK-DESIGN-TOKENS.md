# Mazer UI Rework Design Tokens

## Status

Wave 1B ("Tokens/theme/profile aliases") of the Mazer UI rework, per `blueprint/09_MIGRATION_WAVES_AND_PR_LANES.md` in the `mazer-everything-bundle-20260803` authoritative handoff: "CSS variables; TypeScript token map; Phaser material aliases; canonical theme; archived theme mapping." Per `spec/pr-lanes.json`, lane 1B is `parallel: yes` with `exclusiveFiles: ["token exports"]` -- it is independent of PR #83's collision files and does not require PR #83 (Wave 0B) to be reconciled first.

This wave registers and contract-tests the token set; it does **not** wire tokens into `index.html`, `vite.config.ts`, `src/styles/base.css`, `src/scenes/MenuScene.ts`, or any other live-render path. `src/scenes/MenuScene.ts`, `src/scenes/menuRuntimeDiagnostics.ts`, `src/legacy-runtime/legacyAuth.ts`, `src/legacy-runtime/legacyPlayerMessage.ts`, the three `scripts/analysis/*capture*` scripts, `vite.config.ts`, and `package.json` remain untouched -- they are `prProtection.protectedPaths` in `docs/contracts/mazer-ui-rework-decision-registry.v1.json`, held for PR #83's Wave 0B integrator-exclusive reconciliation. Consuming these tokens from the shipping DOM shell or Phaser scenes is Wave 2A (DOM foundation) and Wave 4D (shared path renderer/title) work.

## Files

- `docs/contracts/mazer-ui-rework-design-tokens.v1.json` -- the single source of truth: color, spacing, radius, stroke, motion, touch-target, and font tokens (reproduced from the bundle's `spec/design-tokens.json`), plus `canonicalThemeId`, `legacyThemeAliases`, and `archivedThemeAliasMap`.
- `src/theme/tokens.ts` -- typed TypeScript token map (`designTokens`), Phaser-numeric color aliases (`phaserMaterialAliases`, `0xRRGGBB` derived from the same hex strings), the canonical theme id, the archived-alias resolver (`resolveCanonicalThemeId`), and CSS-variable-name helpers.
- `src/theme/tokens.css` -- a `:root` block of `--mazer-token-*` custom properties, one per token, derived from the same JSON registry.
- `scripts/check-design-tokens.mjs` -- validates the JSON registry's internal shape (canonical theme id set, every legacy alias mapped to it, no unmapped/unregistered aliases), cross-checks `decisionRefs` against `docs/contracts/mazer-ui-rework-decision-registry.v1.json`, and cross-checks `src/theme/tokens.css` contains a matching `--mazer-token-*` declaration for every token the JSON defines.
- `tests/architecture/design-tokens-contract.test.ts` -- runs the above checker against the real files, additionally cross-checks `src/theme/tokens.ts`'s exported values against the JSON registry (color map, Phaser aliases, archived alias map), asserts mutated copies of the registry are rejected for each rule, and re-runs the PR #83/#82 protected-path self-check from Wave 0A against this wave's own changes.

## Naming convention

Every CSS custom property is `${cssVariablePrefix}<group>-<name>`, where `cssVariablePrefix` is `--mazer-token-` (registered in the JSON, not hardcoded independently in the checker, CSS, or TS). Colors keep their dotted registry key with the dot replaced by a dash (e.g. `color.bg.canvas` -> `--mazer-token-color-bg-canvas`); spacing steps are named by their pixel value (`--mazer-token-spacing-16`); radius/stroke/motion keep their registry key (`--mazer-token-radius-panel`, `--mazer-token-motion-press`). `fonts.title` (`"topology-rendered"`) is intentionally excluded from the CSS file -- it is not a CSS font stack, it flags that the title is rendered via the topology/path geometry source (Wave 2B/4D), not set with `font-family`.

## Why this is safe to land independently of PR #83 / Wave 0B

- No file this wave adds or edits appears in `prProtection.protectedPaths`; the test suite re-asserts this via `git status --short` against the real working tree, the same pattern Wave 0A's `decision-registry-contract.test.ts` established.
- Nothing is imported by a live entrypoint (`index.html`, `proof-surfaces.html`, etc.) or by `vite.config.ts`'s build input map, so there is no visual or behavioral change to verify beyond "the new files exist, are internally consistent, and type-check."
- `docs/contracts/mazer-ui-rework-decision-registry.v1.json` already locks `single-canonical-theme` and `renderer-ownership-split`; this wave's `decisionRefs` point at those same two decisions rather than inventing new ones, keeping one registry of decisions.

## Non-goals of this wave

This wave does not implement the Fawxzzy Precision Arcade visual redesign, does not add a theme switcher, does not touch `src/boot/presentation.ts` (whose `PresentationTheme` naming-collision caveat is recorded separately in `docs/architecture/MAZER-UI-REWORK-WAVE-0A-RECONCILIATION.md` and is out of scope here), and does not begin DOM extraction or Phaser material migration -- those are Waves 2 and 4.
