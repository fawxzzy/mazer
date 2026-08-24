# Mazer UI Rework Diagnostics v1

## Status

Wave 1C decomposes the legacy runtime diagnostics snapshot behind six fixed, renderer-independent v1 schemas. `MenuScene` remains the source of the flattened legacy snapshot and is intentionally unchanged in this wave.

## Stable compatibility boundary

The existing proof surfaces remain stable:

- window key: `__MAZER_RUNTIME_DIAGNOSTICS__`
- document attribute: `data-mazer-runtime-diagnostics`
- every legacy top-level field remains flattened on the published object
- existing facade exports remain available from `src/scenes/menuRuntimeDiagnostics.ts`
- old flattened captures without an envelope continue to parse

New snapshots additionally carry `diagnosticsEnvelope`, identified by `mazer.menu.runtime-diagnostics.compatibility.v1`. The envelope contains exactly six named schemas:

| Name | Schema ID | Responsibility |
| --- | --- | --- |
| `surfaceState` | `mazer.menu.surface-state.v1` | scene identity, surface mode, auth state, and game toggles |
| `layoutBounds` | `mazer.menu.layout-bounds.v1` | board, player, and goal geometry already present in runtime diagnostics |
| `renderDpr` | `mazer.menu.render-dpr.v1` | visibility, frame/performance state, resources, and marker material diagnostics |
| `input` | `mazer.menu.input.v1` | human input, play input buffer, and world-turn state |
| `worldSemantic` | `mazer.menu.world-semantic.v1` | play lifecycle, hazards, timer, topology fixture, generation, projection, and progression semantics |
| `captureMetadata` | `mazer.menu.capture-metadata.v1` | feed, telemetry, and cycle telemetry evidence |

## Validation and purity

Each schema has exactly `schemaId`, `schemaVersion`, and `payload`. Its payload has an exact v1 key set. Parsers reject an unknown schema ID, version, wrapper key, or payload key. Canonical arrays and plain data objects are cloned from property descriptors; accessors, custom prototypes, symbols, cycles, non-finite numbers, and throwing traps fail closed without escaping an exception.

Builders are pure and deterministic. They do not read clocks, random sources, DOM state, Phaser state, or provider state. Every emitted array and object is a fresh clone, so consumer mutation cannot affect the input snapshot or a later result.

## Migration boundary

This wave does not change renderer behavior, layout, input handling, gameplay, generation, hazards, Auth, provider bindings, or capture orchestration. Header-composition and player-transfer animation clauses are intentionally not invented here because `MenuScene` does not yet publish those clauses through this runtime facade. Their first producer belongs to the later live renderer/command-bridge wave; a future additive schema version must preserve this v1 compatibility adapter.

Unknown future major versions are rejected until an explicit compatibility adapter is registered and tested.
