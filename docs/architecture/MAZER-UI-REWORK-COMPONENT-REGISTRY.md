# Mazer UI Rework Component Registry

## Status

Wave 1A registers the authoritative component ownership taxonomy without rendering or wiring any component. It prevents later lanes from collapsing DOM application UI back into `MenuScene.ts` or duplicating Phaser world ownership in the shell.

## Ownership categories

- `shared` — renderer-independent state, commands, view models, profiles, diagnostics, layout, and geometry contracts.
- `domFoundation` — accessible shell primitives and controls.
- `domProduct` — product screens, HUD, controls, result, install, connection, and update UI.
- `phaser` — maze/world/title/trail/effects renderers.
- `internal` — proof, fixture, diagnostic, canary, and capture tooling.

The names and order in `docs/contracts/mazer-ui-rework-component-registry.v1.json` match `spec/component-registry.json`, with one evidence-backed current-main addendum: `LeaderboardScreen` is retained as its own DOM product surface because the live application already exposes that route. `scripts/check-ui-component-registry.mjs` rejects missing, extra, reordered, multiply-owned, or unknown top-level component categories and cross-checks decision references.

## Implementation truth

The registry is architectural intent, not a false claim that every component exists. Wave 1A implements only the shared state foundation: `UiStore`, command contract/bus boundary, view models, and profile resolver. Diagnostics, viewport layout, path geometry, DOM components, Phaser adapters, and internal components retain their later-wave ownership.

## Boundaries

- No DOM or Phaser runtime import is introduced.
- No component is wired to `MenuScene` or an entrypoint.
- No runtime layout, accessibility, gameplay, provider, or persistence behavior changes.
