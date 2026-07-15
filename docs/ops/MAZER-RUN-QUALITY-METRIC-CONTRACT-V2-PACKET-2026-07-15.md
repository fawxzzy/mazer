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
- stored score match, mismatch, and missing states.

## Stored versus recomputed truth

New local and remote receipts store the complete versioned `runQualityScore`.
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
- Corpus audits preserve stored scores and report comparison cohorts.
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

- focused scorer, telemetry, progression, remote receipt, report, audit, and
  consumer-boundary suite: `52/52` passed;
- fast calibration completed across five deterministic scale-37 seeds and
  reported scorer ID/version/path-model correlation;
- TypeScript no-emit compilation passed;
- production bundle build passed;
- the normal serial verification run reached `364/365`; its only red result
  was the pre-existing 5-second rank-ladder timeout under aggregate machine
  load, and that exact test passed `1/1` in `2.35s` immediately afterward;
- an earlier aggregate attempt similarly timed out three unchanged topology
  tests, all of which passed `27/27` in the isolated load-aware rerun.

The aggregate timeout behavior is recorded as verification-infrastructure
evidence rather than mislabeled as a scorer regression. No timeout value or
unrelated generator/AI test was changed in this packet.

No production deployment, Supabase mutation, historical receipt rewrite, or
automatic live calibration is authorized by this packet.
