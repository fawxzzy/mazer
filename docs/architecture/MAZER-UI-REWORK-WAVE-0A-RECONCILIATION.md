# Mazer UI Rework — Wave 0A Current-Source Reconciliation Report

## Status

Snapshot classification of each locked decision in `docs/contracts/mazer-ui-rework-decision-registry.v1.json` against current `main` (worktree base `1a080b23`, evaluated 2026-08-04). Wave 0A only registers decisions; later waves implement them. Most decisions are correctly `NOT_YET_IMPLEMENTED` here — that is the expected, correct state for a Wave 0A registration and is not itself a defect.

Classification values used: `SATISFIED | PARTIALLY_SATISFIED | NOT_YET_IMPLEMENTED | CURRENT_SOURCE_CONFLICT | PR83_PROTECTED_HOLD | EVIDENCE_MISSING`.

## Classifications

### `product-direction-precision-arcade` — NOT_YET_IMPLEMENTED

No Fawxzzy Precision Arcade token/palette system (deep matte navy/graphite, pale mint, ivory corridor cores, aqua structure lines, etc.) exists in source yet. Current visual treatment predates this direction. Implementation is Wave 1B (tokens) and Wave 4D (renderer).

### `renderer-ownership-split` — NOT_YET_IMPLEMENTED

`src/scenes/MenuScene.ts` is 11,748 lines and currently owns nearly all of world rendering, forms, HUD, settings, dialogs, and chrome itself as one Phaser scene. No DOM application shell exists yet, and no shared state/command contract splits ownership between Phaser and DOM. This is exactly the problem Waves 1-4 are scoped to fix; Wave 0A registers the target split but does not create it.

### `shipping-corridor-not-tiles` — SATISFIED

`src/legacy-runtime/legacyPathVisualStyle.ts` already locks the shipped path-visual style to a single value:

```ts
export type LegacyPathVisualStyle = 'corridor';
```

with an explicit comment that the shipped maze material is locked to connected corridors. No alternate tile-square shipping mode exists. This decision is already true of current source; no later-wave work is required to satisfy it, only to preserve it.

### `profiles-not-themes` — NOT_YET_IMPLEMENTED

No TV/OBS/arcade/cyberdeck output-profile routing exists in source (confirmed via repo-wide search for `arcade`, `cyberdeck`, `kiosk` — no matches outside the planning bundle). `spec/platform-profiles.json` in the bundle is not yet mirrored by any live profile-selection code. Profile routing is Wave 5D.

### `single-canonical-theme` — PARTIALLY_SATISFIED (see caveat)

No live, reachable UI path currently exposes a public theme switch: `index.html`'s boot chain (`src/boot/main.ts`) does not import `src/boot/presentation.ts`, and a repo-wide search found no code reading a `?theme=` query parameter to alter the shipped player-facing UI. In that sense the "no public theme switch" half of the decision already holds.

**Caveat (worth surfacing, not a violation):** `src/boot/presentation.ts` already defines a live `PresentationTheme` type using the exact five names the bundle calls out as archived experiments:

```ts
export type PresentationTheme = 'auto' | 'noir' | 'ember' | 'aurora' | 'vellum' | 'monolith';
```

Its only consumer is `src/render/intentFeedRenderer.ts`, which itself is referenced only by its own unit test (`tests/render/intentFeedRenderer.test.ts`) — it is not imported by `MenuScene.ts`, `src/boot/main.ts`, or any live entrypoint bundle. This appears to be an ambient background maze-family pattern-variation concept (`AmbientFamilyThemePairingPolicy`), not a public player-facing skin switch, and it is currently unreachable dead/scaffolding code from any shipped entrypoint. Flagging this as prior art for whoever picks up Wave 1B (tokens/theme aliases) so the naming collision is a deliberate reconciliation rather than a surprise, not because it currently violates the decision.

### `proof-surfaces-internal-only` — SATISFIED

`proof-surfaces.html` and `visual-proof.html` are already separate, isolated HTML entrypoints. Neither `index.html`, `src/boot/main.ts`, nor `src/scenes/MenuScene.ts` link or navigate to either surface. They are already internal-only in reachability terms; Wave 6A/6D redesign their internals, not their isolation.

### `watch-pass-incubating-no-billing` — SATISFIED

`watch-pass-setup.html`, `watch-pass-preview.html`, and `watch-pass-paywall.html` exist as isolated entrypoints (14-31 lines each). A search of `watch-pass-paywall.html` for billing/payment/Stripe/subscription/charge keywords found zero matches — there is no production billing or entitlement claim in current source to begin with.

### `planet3d-isolated-lab-excluded-from-core-v1` — SATISFIED

`planet3d.html` exists as an isolated entrypoint, is not linked from `index.html`/`MenuScene.ts`, and is not referenced by any release-gating script (`npm run verify`, `npm run test`, `npm run build`). Nothing in current source treats it as part of core-v1 acceptance.

### `future-phaser-retire-after-adapter-extraction` — NOT_YET_IMPLEMENTED

`future-phaser.html` still exists as a live entrypoint; no adapter-lesson extraction into tests or entrypoint retirement has occurred. This is Wave 6E work.

### `no-big-bang-menuscene-rewrite` — NOT_YET_IMPLEMENTED

No decomposition of `MenuScene.ts` (characterization tests, adapters, or otherwise) has started. The decision itself is a constraint on how future waves must proceed; since decomposition hasn't begun, there is nothing yet to be either compliant or non-compliant with beyond "not violated." Recorded `NOT_YET_IMPLEMENTED` rather than `SATISFIED` because the registry's job here is to record intent for Wave 3, not to claim work already done.

### `pr83-protected-paths-hold` — PR83_PROTECTED_HOLD

As designed. PR #83 (`gh pr diff 83 --repo fawxzzy/mazer --name-only`) currently owns `src/scenes/MenuScene.ts`, `src/scenes/menuRuntimeDiagnostics.ts`, `src/legacy-runtime/legacyAuth.ts`, `src/legacy-runtime/legacyPlayerMessage.ts`, three capture scripts under `scripts/analysis/`, `package.json`, `.env.example`, and its own test files. PR #82 also currently touches `package.json`. Independently verified via `git log 462030ac..HEAD -- <each protected path>`: zero commits between the bundle's evidence-snapshot commit and current `HEAD` touch any of these paths, so the hold is clean — nothing has drifted underneath it. This wave (0A) touches none of them (see verification section below); reconciliation is deferred to Wave 0B, integrator-exclusive.

### `no-redesign-complete-without-acceptance-matrix` — NOT_YET_IMPLEMENTED

No lane has claimed the redesign complete (correct — none should yet), and the bundle's nine-point Definition of Complete has no automated enforcement in this repository yet. `docs/contracts/mazer-ui-rework-decision-registry.v1.json`'s `redesignComplete.claimed` is registered as `false` with no `acceptanceEvidenceRef`, matching current reality.

## Summary table

| Decision ID | Classification |
|---|---|
| `product-direction-precision-arcade` | NOT_YET_IMPLEMENTED |
| `renderer-ownership-split` | NOT_YET_IMPLEMENTED |
| `shipping-corridor-not-tiles` | SATISFIED |
| `profiles-not-themes` | NOT_YET_IMPLEMENTED |
| `single-canonical-theme` | PARTIALLY_SATISFIED |
| `proof-surfaces-internal-only` | SATISFIED |
| `watch-pass-incubating-no-billing` | SATISFIED |
| `planet3d-isolated-lab-excluded-from-core-v1` | SATISFIED |
| `future-phaser-retire-after-adapter-extraction` | NOT_YET_IMPLEMENTED |
| `no-big-bang-menuscene-rewrite` | NOT_YET_IMPLEMENTED |
| `pr83-protected-paths-hold` | PR83_PROTECTED_HOLD |
| `no-redesign-complete-without-acceptance-matrix` | NOT_YET_IMPLEMENTED |

No decision below is classified `CURRENT_SOURCE_CONFLICT` or `EVIDENCE_MISSING`. Five of twelve are already `SATISFIED` by pre-existing source behavior (corridor rendering, proof/Watch Pass/Planet 3D isolation); one is `PARTIALLY_SATISFIED` with a documented caveat about unreachable dead code sharing theme names; one is process-governed (`PR83_PROTECTED_HOLD`); the remaining five are correctly `NOT_YET_IMPLEMENTED` pending Waves 1-6.
