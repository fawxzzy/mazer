# Mazer Edge-wrap Topology Contract

## Status

`legacy-wrap-topology-v1` is the current generated-maze contract. It is always available to play and generated-menu mazes, and each axis becomes mandatory when the active `LegacyMazeGenerationProfile.requiredOppositeBorderConnections` flag requires it. The fixed archival menu snapshot is not retrofitted into generated topology.

## Ownership

- Maze generation owns paired opposite-border endpoints, inward connectivity, required-axis guarantees, and the durable per-maze diagnostic snapshot.
- The `playable-wrap-aware` graph owns legal neighbors, navigation, shortest-path benchmarks, and completed-route validation. It rejects self-wraps, duplicate neighbors, and one-sided endpoints.
- The direct generator `solutionPath` remains a `direct-floor` route. It is not silently replaced by the playable benchmark.
- Shared menu/play rendering owns decorative folded-corner and top-center-notch masks. A legal graph edge does not become illegal merely because its continuation crosses decorative chrome; `decorativeCutoutCandidates` identifies where masking may be needed and `decorativeCutoutPolicy` stays `renderer-mask-owned`.
- Telemetry owns stored-versus-recomputed scorer/version distinctions. This contract is forward-only and does not rewrite historical receipts or synthesize missing topology fields.

## Per-maze diagnostics

Every generated maze publishes `wrapTopologyDiagnostics` with:

- contract and graph policy identifiers;
- required flags, endpoint counts, pair counts, satisfaction state, and unpaired endpoints for horizontal and vertical axes;
- corner floors, inward-disconnected endpoints, and decorative cutout candidates;
- direct-floor and playable-wrap-aware shortest step counts plus the playable shortcut delta;
- a completed-route audit of the generated `solutionPath`, including its first illegal step, if any, and whether its step count respects the playable shortest-path lower bound.

The same bounded fields and endpoint counts are exposed under runtime diagnostics at `generation.maze.wrapTopologyDiagnostics`, so route-aware browser proof can correlate the rendered menu/play surface with the exact generated topology without exporting raw paths.

`graphTopologyValid` requires paired non-corner endpoints, inward connectivity, and every required axis. Decorative cutout candidates are deliberately not graph-invalidating because the renderer owns the visible notch/corner exclusion.

## Route invariant

A completed path is admitted only when it starts at the maze start, ends at the maze goal, and every step is a neighbor in the playable graph. Every admitted completed route must have at least as many steps as `resolveLegacyPlayableShortestPath(...)`. A shorter sequence is evidence of an illegal step or a contract defect, never a better valid route.

## Verification spine

- Fixed anomaly pack: horizontal wrap, vertical wrap, multi-route wrap, one-sided invalid endpoint, and the historical shortcut fixture.
- Generated audit: play/menu, required axes enabled and disabled, bounded seed and scale bands.
- Renderer proof: legal continuation classification, folded-corner caps, and top-notch split masks on the shared menu/play renderer.
- Route-aware browser proof: actual generated menu and play surfaces at phone and desktop viewports before board completion.

## Progression handoff

V1 wraps are an always-available topology capability whose required axes are selected by the difficulty profile. Later maze-feature progression may change when axes become required, but it must consume this contract rather than invent renderer-only wrap behavior or collapse the direct-floor generator route into the playable benchmark.
