// Phase 2 hand-off: where geometry difficulty ends and hazards (obstacles /
// enemies) would have to take over. Hazards are NOT implemented and NOT enabled:
// this module only declares the interface and keeps the switch off.
//
// Product state (2026-11-06): Zac said "wait on phase 2 for now". The hazard
// contract (obstacle / enemy semantics, contact rules, AI awareness) is an
// unsigned draft, and the "no play object" decision of 2026-08-24 still stands.
// Until a signed contract exists, every code path below returns the dormant
// answer, and tests/reset/legacy-hazard-handoff.test.ts proves no maze snapshot,
// profile or progression output carries a hazard.
//
// Hand-off contract for the future hazard lane:
//  - `hazardBudgetLevels` = level - GEOMETRY_BUDGET_SATURATION_LEVEL (>= 0, +1 per
//    level, unbounded): the amount of difficulty the geometry can no longer
//    supply. Hazard allocation should spend exactly this budget.
//  - GEOMETRY_BUDGET_SATURATION_LEVEL (218; it was 268 until the one-tile stub rule halved the fringe capacity) is the END of the fringe, not of the felt ramp: the
//    felt number saturates first (GEOMETRY_BUDGET_FELT_SATURATION_LEVEL, level 198), then
//    geometry still rises by zero-felt-cost side stubs (the fringe, to the saturation level,
//    legacyGeometryBudget.ts). Hazards owe nothing in that stretch: it stays 0. (A mastery tier
//    from 269 to 388 briefly moved the saturation level to 388; with the double lure on every
//    level it has nothing left to ramp and the saturation level is back at the end of the fringe.)
//  - Below the saturation level it is 0 and must stay 0.
//  - The geometry at and above the saturation level is the frozen ceiling class
//    (same target, same fringe, same reverse floor, deterministic, mazes differ by seed), so adding hazards on top
//    changes nothing about the geometry gate.

import { resolveContinuousDifficulty } from './legacyGeometryBudget';

// The single switch. A literal `false` type: nothing can flip it at run time, and
// enabling hazards is a deliberate source change that has to touch this line (and
// the dormancy test) in review.
export const LEGACY_HAZARD_LAYER_ENABLED = false as const;

export const LEGACY_PHASE2_FEATURE_REGISTRY = Object.freeze({
  hazards: Object.freeze({
    id: 'phase2-hazards',
    enabled: LEGACY_HAZARD_LAYER_ENABLED,
    status: 'dormant-awaiting-product-contract',
    // Kinds the contract draft names; none exist in runtime code.
    kinds: Object.freeze(['obstacle', 'enemy'] as const)
  })
});

export interface LegacyHazardHandoff {
  readonly level: number;
  // True once geometry difficulty has reached its ceiling for this level.
  readonly geometrySaturated: boolean;
  // Difficulty owed to hazards by this level (0 until saturation).
  readonly hazardBudgetLevels: number;
  // Always false while the layer is dormant; consumers must gate on this.
  readonly hazardsActive: boolean;
  // Hazards generated for this level. Always empty while dormant.
  readonly obstacles: readonly never[];
  readonly enemies: readonly never[];
}

const NO_HAZARDS: readonly never[] = Object.freeze([]);

export const resolveLegacyHazardHandoff = (level: number): LegacyHazardHandoff => {
  const difficulty = resolveContinuousDifficulty(level);
  return {
    level: difficulty.level,
    geometrySaturated: difficulty.geometrySaturated,
    hazardBudgetLevels: difficulty.hazardBudgetLevels,
    hazardsActive: LEGACY_HAZARD_LAYER_ENABLED,
    obstacles: NO_HAZARDS,
    enemies: NO_HAZARDS
  };
};
