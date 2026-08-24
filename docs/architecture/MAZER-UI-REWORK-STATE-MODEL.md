# Mazer UI Rework State Model

## Status

Wave 1A ("Shared state, commands, profiles, view models") completes the shared, renderer-independent foundation declared across `spec/ui-state-model.json`, `spec/platform-profiles.json`, `spec/component-registry.json`, and blueprint 03/06/08/09 in the authoritative `mazer-everything-bundle-20260803` handoff.

This wave does **not** wire the foundation into `index.html`, `vite.config.ts`, `src/scenes/MenuScene.ts`, Phaser, or DOM APIs. `uiLegacyProjection.ts` is a pure mapping contract and fixture seam; mapping the live scene and making the command bridge load-bearing remains Wave 3A. The former PR #83/#131 branch hold is retired; dependency-ordered registry ownership now protects the shared paths.

## Files

- `docs/contracts/mazer-ui-rework-state-model.v1.json` -- the single source of truth: primary surfaces, modal surfaces, game/auth/connection/install phases, control modes, motion modes, effects-quality tiers (reproduced from the bundle's `spec/ui-state-model.json`), plus the model's four `invariants` and a `structurallyCheckableInvariants` subset naming exactly which of those four this wave's TypeScript shape actually enforces by construction.
- `src/state/uiState.ts` -- typed TypeScript literal-union types for each category, the `UiStateSnapshot` interface, and `collectUiStateSnapshotViolations`, a runtime validator (typed to accept `unknown`, not just `UiStateSnapshot`) for snapshot-shaped values against the registered enums, useful once a real value needs checking rather than trusted at the type level alone. Fails closed on a malformed top-level value (`null`, `undefined`, or anything else that isn't an object) with a single sentinel-field violation instead of throwing, in addition to failing closed per-field via `memberCheck`.
- `src/state/uiCommands.ts` -- exhaustive discriminated command union, fail-closed runtime validator, and the actual subscribe/dispatch command bus for every command family named in blueprint 03.
- `src/state/uiStore.ts` -- immutable snapshot store; `dispatch` is the sole UI-owned state-transition path and every transition returns a validated frozen snapshot. Domain commands are emitted through the command bus but do not let a renderer invent game, auth, connection, or install results.
- `src/state/uiProfiles.ts` -- all seven authoritative output profiles and a fail-closed resolver. Auth and sync capability types are intentionally distinct; profiles vary capabilities/chrome, never brand identity.
- `src/state/uiViewModels.ts` -- immutable, geometry-free projections for the authoritative view-model families plus the current-main `LeaderboardViewModel` addendum.
- `src/state/uiLegacyProjection.ts` -- pure, renderer-independent projection seam from explicit legacy mode/overlay facts into a validated immutable snapshot.
- `scripts/check-ui-state-model.mjs` -- validates categories/invariants and exact authoritative command/view-model lists, cross-checks decisions, and applies dependency-ordered ownership without any stale pull-request exception.
- `tests/architecture/ui-state-model-contract.test.ts` -- runs the above checker against the real files, cross-checks `src/state/uiState.ts`'s exported category arrays against the JSON registry (values and order), asserts mutated copies of the registry are rejected for each rule, exercises the canonical snapshot and immutable command boundaries adversarially, and re-runs dependency-ordered `integratorWaveOwnership.assignments` checks (including a disposable-fixture regression proving a fully committed wrong-wave change is still caught even with a clean `git status --short`).

## Why "exactly-one-primary-surface" and "zero-or-one-modal" are structural, not just asserted

`UiStateSnapshot.primarySurface` and `.modalSurface` are each a single required field of one of the registered literal-union types (not an array, not optional). A well-typed `UiStateSnapshot` value therefore cannot have zero or multiple primary surfaces, and `modalSurface` is always present with `'none'` as the explicit zero-modal member -- so both invariants hold by TypeScript's type system alone, for any value that type-checks. The other two invariants in the JSON (`modal-focus-trap`, `domain-state-not-mutated-by-renderers`) are behavioral properties of whatever eventually *consumes* this snapshot (a real DOM/Phaser adapter with actual focus management and actual renderer wiring), not properties the snapshot shape itself can guarantee -- they are listed in `invariants` as documented commitments for later waves to honor, but deliberately left out of `structurallyCheckableInvariants`, and `scripts/check-ui-state-model.mjs` fails if that boundary is blurred (e.g. if the JSON's `structurallyCheckableInvariants` ever grows to claim more than this wave's code actually enforces without someone updating both together).

## Fitness pattern intake

- `ADOPT` one-overlay/recoverable interaction: owner `UiStore`; proved by command/store architecture tests.
- `ADAPT` accessible motion preferences: owner `UiStateSnapshot`/view models; proved as semantic state only, with visual behavior deferred to renderer waves.
- `ADOPT` versioned explainable persistent state: owner shared state contract; no persistence write is added in this wave.
- `NOT_APPLICABLE` safe areas, persistent bottom controls, responsive layout, install capability, and served-build provenance: their runtime owners are later layout/system/release waves; this source-only foundation neither copies Fitness UI nor claims route-level proof.

## Current-main addendum

The August packet predates the live leaderboard route. Current Mazer exposes leaderboard as a real primary surface, so Wave 1A registers `leaderboard`, `LeaderboardViewModel`, and `LeaderboardScreen` rather than silently projecting that screen into another route. This additive truth is covered by the same state/component registries and does not widen runtime behavior.

## Non-goals of this wave

This wave does not begin DOM extraction, render components, mutate domain state, perform auth/provider work, or make the Wave 3A command bridge load-bearing.
