/**
 * Mazer UI rework -- Wave 2B pure topology/path geometry contract.
 *
 * A "mask" is a 4-bit value (0-15) describing which of the four cardinal directions a maze cell
 * connects to, per the bundle's `spec/topology-path-contract.json` (registered here as
 * `docs/contracts/mazer-ui-rework-topology-path-contract.v1.json`, the single source of truth this
 * module is hand-derived from). This is the shared, renderer-independent geometry contract named
 * `PathGeometry` in `spec/component-registry.json`'s `shared` list, per decision
 * `renderer-ownership-split` -- both the existing Phaser board renderer and any future DOM/adapter
 * renderer are meant to consume the same mask/connection vocabulary, once a later wave (PR 4D,
 * "Shared path renderer and title", `exclusiveFiles: ["board render/title render"]`) actually wires
 * a renderer to it. Per decision `shipping-corridor-not-tiles`, `SHIPPING_PRESENTATION` is the only
 * presentation that ships by default; `DEBUG_PRESENTATIONS` are optional proof/debug-only
 * treatments, never the default.
 *
 * This module is NOT imported by src/scenes/MenuScene.ts, src/future-runtime/phaser/topology.ts
 * (an unrelated fixed satellite-prototype tile graph), docs/architecture/
 * MAZER-EDGE-WRAP-TOPOLOGY-CONTRACT.md's generation-side wrap topology (a different domain: maze
 * *generation* endpoint pairing, not shared UI-rework corridor *rendering* masks), or any other
 * live-render/live-generation path yet -- see docs/architecture/
 * MAZER-UI-REWORK-TOPOLOGY-PATH-CONTRACT.md for what this wave does and does not do.
 *
 * Following the lesson from Wave 1A's self-review (src/state/uiState.ts's doc comment): the
 * direction/bit vocabulary below is hand-authored as an independent `as const` structure, not
 * derived from (or cast from) the JSON import. `maskConnections()` computes each mask's connection
 * list algorithmically from these hand-authored bits, so
 * tests/architecture/topology-path-contract.test.ts's cross-check against the JSON's own
 * `masks[].connections` field is a real, independent comparison -- not the JSON compared to itself.
 */
import topologyPathContract from '../../docs/contracts/mazer-ui-rework-topology-path-contract.v1.json';

export const DIRECTIONS = ['N', 'E', 'S', 'W'] as const;
export type Direction = (typeof DIRECTIONS)[number];

// Hand-authored bit assignment, independent of the JSON import -- mirrors, but is not derived
// from, docs/contracts/mazer-ui-rework-topology-path-contract.v1.json's "bits" field.
export const DIRECTION_BITS: Readonly<Record<Direction, number>> = Object.freeze({
  N: 1,
  E: 2,
  S: 4,
  W: 8
});

export const OPPOSITE_DIRECTION: Readonly<Record<Direction, Direction>> = Object.freeze({
  N: 'S',
  S: 'N',
  E: 'W',
  W: 'E'
});

export const SHIPPING_PRESENTATION = 'connected-corridor' as const;
export type ShippingPresentation = typeof SHIPPING_PRESENTATION;

export const DEBUG_PRESENTATIONS = ['cell-outline', 'centerline', 'mask-label'] as const;
export type DebugPresentation = (typeof DEBUG_PRESENTATIONS)[number];

// All 16 valid 4-bit masks (0-15), hand-authored as a literal tuple so `TopologyMask` is a real
// numeric-literal union, not just `number`.
export const TOPOLOGY_MASKS = [
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15
] as const;
export type TopologyMask = (typeof TOPOLOGY_MASKS)[number];

const TOPOLOGY_MASK_SET: ReadonlySet<number> = new Set(TOPOLOGY_MASKS);

/**
 * Runtime guard for a (possibly untrusted/external) value being a valid topology mask -- an
 * integer in [0, 15]. Deliberately takes `unknown`, the same pattern
 * `collectUiStateSnapshotViolations` (src/state/uiState.ts, Wave 1A) established for validating
 * values the type system hasn't vouched for.
 */
export const isValidTopologyMask = (value: unknown): value is TopologyMask => (
  typeof value === 'number' && Number.isInteger(value) && TOPOLOGY_MASK_SET.has(value)
);

/**
 * The directions a given mask connects to, in canonical N/E/S/W order -- computed by bitwise test
 * against the hand-authored `DIRECTION_BITS`, independent of the JSON contract's own
 * `masks[].connections` field.
 */
export const maskConnections = (mask: TopologyMask): readonly Direction[] => (
  DIRECTIONS.filter((direction) => (mask & DIRECTION_BITS[direction]) !== 0)
);

/**
 * Inverse of `maskConnections`: ORs the bits for a set of connections back into a single mask.
 * Always produces a value in [0, 15] since the four direction bits are the only inputs.
 */
export const connectionsToMask = (connections: readonly Direction[]): TopologyMask => {
  const mask = connections.reduce((accumulator, direction) => accumulator | DIRECTION_BITS[direction], 0);
  if (!isValidTopologyMask(mask)) {
    // Unreachable for any input drawn from `Direction` -- DIRECTION_BITS's four values OR together
    // to at most 15 -- but kept as an explicit, typed failure mode rather than a silent `as` cast.
    throw new Error(`connectionsToMask produced an out-of-range mask: ${mask}`);
  }
  return mask;
};

export const hasConnection = (mask: TopologyMask, direction: Direction): boolean => (
  (mask & DIRECTION_BITS[direction]) !== 0
);

/**
 * Re-exported only so a caller can, if it wants to, read the same JSON module this file's
 * hand-authored constants above are meant to mirror -- not used by this module's own exports.
 * scripts/check-topology-path-contract.mjs / tests/architecture/topology-path-contract.test.ts do
 * the actual mirroring check.
 */
export const topologyPathContractRegistry = topologyPathContract;
