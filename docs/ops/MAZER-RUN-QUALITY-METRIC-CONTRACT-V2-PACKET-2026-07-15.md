# Mazer Run-Quality Metric Contract v2 Packet

Date: `2026-07-15`

## Outcome

Mazer now has one versioned overall run-quality scorer for runtime telemetry,
progression, compact reporting, corpus audit, and offline calibration:

- scorer ID: `mazer.maze-cycle-run-quality`
- scorer version: `1.0.0`
- shortest-path model: `playable-wrap-aware-shortest-path-v1`
- canonical finalized value: `total`, integer `0..100`
- canonical lifecycle signal: `challenge | ease | hold`
- topology metrics version: `1.0.0`

The pre-existing AI decision-pressure scorer remains a separate subordinate
behavior metric. It feeds menu-demo scoring, but it is not presented as the
overall run-quality score.

## Metric glossary and denominators

| Field | Meaning | Denominator / policy |
| --- | --- | --- |
| `shortestViablePathLength` | Node count of the legal start-to-goal route | Playable graph, including paired legal edge wraps |
| `routeOverrunSteps` | Extra recorded path nodes beyond the legal shortest route | `max(0, playerPathLength - shortestViablePathLength)` |
| `routeOverrunRatio` | Extra route length normalized by the legal shortest route | `routeOverrunSteps / shortestViablePathLength` |
| `routeEfficiencyPressureScore` | Bounded route waste pressure | `0..100`; reaches 100 at 150% or greater overrun |
| `timeScore` | Completion pace relative to route length and measured maze complexity | `0..100`; surface-aware expected duration |
| `wrongTurnScore` | Penalty for recorded non-solution deviations | `0..100`; 16 points per wrong turn |
| `backtrackScore` | Penalty for recorded backward route movement | `0..100`; 14 points per backtrack |
| `resetScore` | Whether the attempt completed without reset | `100` without reset, otherwise `0` |
| `stabilityScore` | Render/runtime safety during the attempt | Frame-time pressure; unsafe frames hold progression |
| `total` | Canonical overall run-quality score | Weighted and capped `0..100`; weights differ only for human play versus menu-demo AI |
| `optimalSteps` | Minimum accepted moves from start to goal | Edge count on the playable wrap-aware graph |
| `acceptedSteps` | Accepted moves in the complete source path | `max(0, playerPathLength - 1)` |
| `uniqueVisitedTileCount` | Distinct walkable coordinates in the complete source path | No reconstruction from a stored path preview |
| `walkableTileCount` | All walkable tiles in the maze graph | Coverage denominator |
| `coverageRatio` | Share of all walkable tiles visited | `uniqueVisitedTileCount / walkableTileCount` |
| `shortestCorridorUnionTileCount` | Tiles participating in any equally short valid route | Union where `distance(start,node) + distance(node,goal) = optimalSteps` |
| `explorationRatio` | Optional off-corridor tiles visited | `exploredOptionalTileCount / optionalWalkableTileCount`; undefined when no optional tiles exist |
| `revisitSteps` | Accepted moves that did not add a new tile | `acceptedSteps - (uniqueVisitedTileCount - 1)`, floored at zero |
| `cleanRun` | Completed shortest traversal with no off-corridor visit, revisit, or reset | Boolean; any equally short route qualifies; legacy single-solution deviation counters cannot disqualify a legal alternate/wrap route |
| `explorer` | Completed, non-reset run visiting at least 25% of optional tiles | Boolean; threshold `0.25` |

`single-route` and `multi-route` remain topology cohort labels. They do not
change the denominator after the legal playable shortest path is known. This
prevents two identical traversals from receiving different scores only because
one maze exposes an unused alternate branch.

## Topology parity

The telemetry producer resolves shortest-path truth through
`resolveLegacyPlayableShortestPath()`. A paired legal wrap can therefore be the
shortest or only path. Direct-floor distance is not silently substituted.

The deterministic proof denominator covers:

- a route with no overrun;
- an overrun with the same shortest-path denominator regardless of
  single-route/multi-route cohort label;
- a wrap-only path whose legal two-node route produces zero overrun;
- both branches of an equally short multi-route maze, with identical clean-run
  and corridor-fidelity results;
- optional exploration, revisit, reset, incomplete-run, and truncated-source
  policies;
- stored score match, mismatch, and missing states.

Topology metrics are computed from the complete in-memory path before the
receipt path is truncated to its bounded storage limit. When the complete
source path is unavailable, coverage, exploration, revisit, and corridor
fidelity remain explicitly `null` with `player_path_incomplete`; reports never
reconstruct them from a preview. Failed/incomplete attempts receive no overall
run-quality total and carry `run_incomplete` in the topology metric reasons.

## Stored versus recomputed truth

New local and remote receipts store the complete versioned `runQualityScore`
and `runQualityMetrics` snapshot.
Reports and audits also recompute the current canonical score from preserved
inputs and expose a comparison status:

- `match`
- `mismatch`
- `stored-missing`
- `stored-incomplete`
- `recomputation-unavailable`
- `unavailable`

Historical receipts are never rewritten, deleted, or synthetically backfilled.
A historical receipt without a stored score remains `stored-missing`; its
recomputed score is labeled as recomputed evidence, not historical stored
truth.

## Consumer contract

- Runtime telemetry computes and stores the score once per new receipt.
- Progression calls the same scorer and keeps its existing rolling signal-window
  policy; one score does not directly assign public rank.
- Atlas reports aggregate recomputed canonical totals and component pressure.
- Atlas reports preserve stored topology metrics without reconstructing them
  from bounded path previews.
- Corpus audits preserve stored scores, metric versions, undefined reason
  cohorts, and comparison cohorts.
- Calibration identifies the same scorer ID/version/path model and consumes
  progression results produced by it.
- Remote receipt export includes the future-only stored score; no database
  mutation or historical update is part of this packet.

## Product decision

No operator decision is required to land this contract. The conservative
default is:

- approve `total` as the canonical private/internal `0..100` run score;
- keep public rank derived from existing progression state, not a single run;
- do not expose or relabel the score in player UI in this packet;
- allow the existing shared-status-panel card to display the value only after
  this scorer contract is merged and that UI has its own route-aware proof;
- never backfill historical stored scores.

## Verification

- focused scorer, topology, telemetry, progression, remote receipt, report,
  audit, and consumer-boundary suite: `54/54` passed;
- fast calibration completed across five deterministic scale-37 seeds and
  reported scorer ID/version/path-model/topology-version correlation;
- TypeScript no-emit compilation passed;
- production bundle build passed;
- the final serial repository verifier passed `370/370` across `51/51` files.

Earlier pre-topology aggregate attempts exposed machine-load timeouts in
unchanged rank-ladder/topology tests; every affected test passed in isolated
reruns, and the final serial verifier is fully green. No timeout value or
unrelated generator/AI test was changed in this packet.

No production deployment, Supabase mutation, historical receipt rewrite, or
automatic live calibration is authorized by this packet.
