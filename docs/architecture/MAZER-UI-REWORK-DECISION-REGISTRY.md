# Mazer UI Rework Decision Registry

## Status

Wave 0A ("Decision registry and architecture guardrails") of the Mazer UI rework. This document and its machine-readable companion, `docs/contracts/mazer-ui-rework-decision-registry.v1.json`, register the locked planning decisions from the `mazer-everything-bundle-20260803` authoritative handoff. Wave 0A's ownership is new docs/specs/tests only, with no runtime visual mutation — none of the decisions below are implemented by this wave. They are registered so later waves (1 through 7) and their architecture tests have a single source of truth to build against and be checked against.

Per `spec/pr-lanes.json` in the bundle, lane 0A has `exclusiveFiles: []` — it owns nothing exclusively and must not touch any file another lane needs, including every file PR #83 and PR #82 currently own.

## Decisions registered

Each decision below has a stable ID in the registry JSON (`decisions[].id`).

1. `product-direction-precision-arcade` — Mazer's target is the Fawxzzy Precision Arcade direction: mobile-first, installable, precision-arcade maze game; the board is the hero, chrome only explains/enables/protects play.
2. `renderer-ownership-split` — Phaser owns world/maze simulation presentation; DOM owns application shell, forms, HUD, touch controls, settings, dialogs, and system chrome; tokens/state/commands/geometry/diagnostics are shared contracts owned by neither renderer alone.
3. `shipping-corridor-not-tiles` — Shipping maze presentation stays connected corridors. Tile topology is canonical data; visible square-tile boundaries are optional proof/debug treatment only, never the shipping default.
4. `profiles-not-themes` — Mobile/desktop/TV/OBS/arcade/cyberdeck are output profiles (layout/density), not public themes (brand identity).
5. `single-canonical-theme` — One canonical player-facing theme (Fawxzzy Precision Arcade); noir/ember/vellum/aurora/monolith are archived historical experiments, not live options.
6. `proof-surfaces-internal-only` — `proof-surfaces.html` and `visual-proof.html` remain internal verification tools, not public product or release gates.
7. `watch-pass-incubating-no-billing` — Watch Pass stays an incubating companion behind a feature boundary; `watch-pass-paywall.html` is a commerce prototype only, no production billing/entitlement claim.
8. `planet3d-isolated-lab-excluded-from-core-v1` — `planet3d.html` is an isolated lab, excluded from core-v1 release acceptance.
9. `future-phaser-retire-after-adapter-extraction` — `future-phaser.html` is slated for adapter-lesson extraction into tests, then entrypoint retirement.
10. `no-big-bang-menuscene-rewrite` — `MenuScene.ts` is decomposed through characterization and adapters across later waves, never replaced in one rewrite.
11. `pr83-protected-paths-hold` — PR #83's collision paths stay protected/single-owner until its disposition clears via a later, integrator-exclusive reconciliation PR (Wave 0B) — not this lane.
12. `no-redesign-complete-without-acceptance-matrix` — No lane may claim the redesign complete before the bundle's nine-point Definition of Complete passes.

## Registry shape

`docs/contracts/mazer-ui-rework-decision-registry.v1.json` encodes, in addition to the `decisions[]` array:

- `renderOwnership` — the Phaser-owns / DOM-owns / shared-contracts-own lists, each entry traceable to `renderer-ownership-split`.
- `themes.registry` — one entry per named theme (`fawxzzy-precision-arcade` canonical/public; `noir`/`ember`/`vellum`/`aurora`/`monolith` archived/non-public), each `kind: "theme"`.
- `profiles.registry` — one entry per output profile (`web`/`mobile`/`desktop`/`tv`/`obs`/`arcade`/`cyberdeck`), each `kind: "profile"`, cross-referenced from `spec/platform-profiles.json` in the bundle.
- `shippingPresentation` — `default: "corridor"`, `tileSquareIsDefault: false`.
- `entrypoints` — the bundle's `spec/surface-disposition.json` classifications, reused directly and cross-checked against the live repository's HTML entrypoints by the architecture-contract test.
- `coreReleaseAcceptanceSet` — explicitly `["index.html"]` only; `planet3d.html` must never appear here.
- `watchPass`, `planet3d`, `menuSceneDecomposition`, `prProtection`, `redesignComplete` — typed sections mirroring decisions 7, 8, 10, 11, and 12 respectively, in a shape a validator can check directly instead of re-parsing prose.

## Verification spine

`tests/architecture/decision-registry-contract.test.ts` loads this registry and:

- asserts it currently passes with zero violations against the live repository (including live entrypoint-existence cross-checks);
- constructs mutated in-memory copies of the registry that each violate exactly one rule (a second public canonical theme, a profile mislabeled as a theme, Watch Pass claiming production billing, Planet 3D added to the core release acceptance set, tile-square marked as the shipping default, a proof/lab entrypoint reclassified to `product`/`releaseGate: true` without a justifying decision reference, a duplicate decision ID, and an unknown decision-ID reference) and asserts the checker rejects each one;
- runs the same protected-path checker against the real `git status --short` output of this working tree and asserts none of `prProtection.protectedPaths` appear as modified/untracked.

Run in isolation with `npx vitest run tests/architecture/decision-registry-contract.test.ts`, or as part of `npm run test:architecture` (`vitest run tests/architecture`).

## Non-goals of this wave

This wave registers decisions; it does not implement them. It does not touch `MenuScene.ts`, `menuRuntimeDiagnostics.ts`, `src/legacy-runtime/legacyAuth.ts`, `src/legacy-runtime/legacyPlayerMessage.ts`, any capture script, `vite.config.ts`, or `package.json`. It does not begin DOM extraction, renderer migration, token implementation, or visual redesign — those are Waves 1 through 7.
