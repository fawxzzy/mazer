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

No live, reachable UI path currently exposes a public theme switch: `index.html`'s boot chain does not wire `src/boot/presentation.ts`'s resolvers into `BootScene.ts` (confirmed directly -- `BootScene.ts` is 11 lines and imports only `phaser`), and a repo-wide search found no code reading a `?theme=` query parameter to alter the shipped player-facing UI. In that sense the "no public theme switch" half of the decision already holds.

**Caveat, corrected and expanded during a later wave's fresh reachability re-proof (2026-08-04):** `src/boot/presentation.ts` defines a `PresentationTheme` type using the exact five names the bundle calls out as archived experiments (`'auto' | 'noir' | 'ember' | 'aurora' | 'vellum' | 'monolith'`), plus a much larger surrounding surface (boot-config resolution, query-string sanitizers, deployment/design profile helpers -- roughly 660 lines in total). The prior classification of "the only consumer is `intentFeedRenderer.ts`, itself unreferenced, therefore dead code importing dead code" undercounted this file's actual reachability and is corrected here:

- `src/render/intentFeedRenderer.ts` imports one type from it and is itself unreferenced by any live entrypoint -- this part of the original finding holds.
- `scripts/analysis/mazer-variety-analysis.ts` (1,413 lines, not wired to any npm script or CI workflow, but real, standalone, functioning source) genuinely calls `resolveAmbientFamilyTheme(...)` and indexes `AMBIENT_FAMILY_THEME_PAIRING_POLICY[...]` multiple times for real maze-variety curation logic -- this is a real, if tooling-only, consumer that a deletion would break.
- `tests/scenes/demo-build.test.ts` imports and directly unit-tests most of `presentation.ts`'s boot-config resolvers (`resolveBootPresentationConfig`, `resolveBootPresentationVariant`, `resolveEffectivePresentationChrome`, `shouldShowPresentationTitle`, `isDeterministicPresentationCapture`) alongside `BootScene`. This file is NOT part of the canonical `test`/`test:verify` scripts (confirmed via `package.json`), and running it directly currently produces **40 failing tests out of 44** -- several of its assertions expect `BootScene.prototype.create` to call `this.scene.start('MenuScene', config)` with a second argument and to invoke `resolveBootPresentationConfig`, neither of which the real, current `BootScene.ts` does. This test file describes an integration between `BootScene` and `presentation.ts` that does not exist in current source and is not gated by anything -- it is itself stale/abandoned, not evidence of a live integration.
- `presentation.ts`'s own git history (`git log --oneline -- src/boot/presentation.ts`) shows ongoing, deliberate feature commits ("Add recovery design inspection mode", "Add recovery widescreen rail profile"), not single-commit accidental residue.

**Net correction:** this is not cleanly `DEAD_UNREACHABLE`. The theme-naming surface is entangled in the same file as a genuinely-used (if non-production) analysis-script dependency, so a clean deletion is not possible without either breaking `mazer-variety-analysis.ts` or first making a product/tooling decision about whether that script itself should be kept, ported, or retired -- a decision outside a bounded architecture-guardrail cleanup's scope. No deletion was performed. This remains prior art for whoever picks up Wave 1B (tokens/theme aliases): the naming collision with the registry's archived-theme list is real and worth a deliberate rename or retirement decision then, not a surprise, but it is not a violation of the `single-canonical-theme` decision today (no public/reachable theme switch exists), and it is not safe to delete today.

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
