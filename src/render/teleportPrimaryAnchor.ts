/**
 * Wave 4D-B: pure, deterministic primary-anchor selection policy for the
 * frozen docs/assets/reference/teleport-system-v1/ visual authority.
 *
 * This module answers exactly one question -- "which of the eight fixed
 * perimeter anchors owns the current transfer?" -- and nothing else. It has
 * no Phaser, DOM, network, persistence, wall-clock, or randomness
 * dependency, and never mutates its inputs. It does NOT render anything,
 * does not compute anchor screen positions, and does not know about scene
 * lifecycle/phase (outbound/stored/delivering) -- a caller that keeps
 * passing the same heldAnchorId across those phases gets retention "for
 * free" from this function's own retention rule, without this module
 * needing to know what a phase is.
 *
 * Anchor identity reuses the existing eight-slot index convention already
 * in source: MenuScene.ts's title-orbit sigils
 * (LEGACY_MENU_PATH_TITLE_ORBIT_SIGILS = 8, plain integer indices 0..7,
 * resting at the 4 viewport corners + 4 edge midpoints when idle -- see
 * drawLegacyMenuPathTitleOrbitSigils). That existing code already reuses
 * the Teleport System v1 shell asset for ambient menu/title choreography
 * (explicitly permitted by docs/assets/reference/teleport-system-v1/README.md:
 * "The full eight-origin volley is reserved for menu/title choreography...
 * it is never the default gameplay transfer"). This module does not import
 * or depend on that scene code -- it only keeps the same 0..7 identity
 * space so a later pose/render adapter can map between them directly,
 * without a translation layer. There is no other named ID convention
 * (e.g. compass directions) anywhere in source to conflict with.
 *
 * Locked selection contract (docs/assets/reference/teleport-system-v1/README.md,
 * "Primary selection (deterministic, never random)"):
 *   1. Begin with all eight fixed perimeter anchors.
 *   2. Exclude anchors that cannot legally clear HUD/safe-area boundaries.
 *   3. Choose the valid anchor whose inward beam port is closest to the
 *      extraction target.
 *   4. Break ties using a fixed anchor-ID order.
 *   5. Persist the same primary through the full outbound/stored/delivering
 *      cycle; remap only when a viewport or safe-area change invalidates
 *      the held anchor.
 *
 * Distance is by the anchor's measured INWARD BEAM PORT position, never the
 * anchor's sprite/canvas center -- the two disagree in general (the shell's
 * canonical asset, edge-diamond-energized.png, has an off-center visible
 * tip; see the derivative manifest's measured_tip_px), and selecting by
 * center would violate the frozen contract's own explicit wording ("whose
 * inward beam port is closest").
 *
 * Retention (point 5 above) is expressed purely through this function's own
 * input/output, not hidden module state: a caller passes `heldAnchorId`
 * (the transfer's currently-selected anchor, or `null` for a genuinely new
 * transfer) alongside this call's `candidates`. If the held anchor is still
 * present in `candidates` and still `eligible`, it is retained outright --
 * regardless of whether a different candidate is now closer, and regardless
 * of the target changing (e.g. a delivery destination differing from the
 * original extraction target) -- because eligibility, not distance, is the
 * only thing this contract allows to invalidate a held anchor. If the held
 * anchor is missing from `candidates` or now `eligible: false`, that IS the
 * "a viewport or safe-area change invalidated the held anchor" case the
 * contract describes: this function remaps by re-running fresh selection
 * over the remaining eligible candidates. Computing *why* an anchor becomes
 * ineligible (real HUD/safe-area geometry) is entirely the caller/pose
 * adapter's job, supplied here only as each candidate's own `eligible` flag
 * and optional `ineligibleReason` -- this module trusts that input and
 * performs no geometry of its own beyond squared-distance comparison.
 *
 * A `no-valid-anchor` outcome (outcome: 'unavailable') is reported honestly
 * and does not authorize any fallback behavior on its own -- no hanging
 * gameplay, no dropped stored energy, no reintroducing the prohibited
 * eight-beam default volley, no moving a diamond into the HUD. Resolving
 * what the running scene actually does when no anchor is available is the
 * runtime integration slice's job, not this pure policy's.
 */

/** The existing eight-slot identity space (see module doc above). */
export type TeleportAnchorId = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

const VALID_ANCHOR_IDS: ReadonlySet<TeleportAnchorId> = new Set([0, 1, 2, 3, 4, 5, 6, 7]);

/**
 * One candidate anchor as already resolved by the (not-yet-built) pose/
 * placement adapter -- its measured inward beam-port position in ONE
 * explicit logical coordinate space (this module is agnostic to which:
 * board pixels, screen pixels, or anything else, as long as every
 * candidate and the target share the same space for a given call), plus
 * whether it may legally be used right now.
 */
export interface TeleportAnchorCandidate {
  readonly id: TeleportAnchorId;
  readonly portX: number;
  readonly portY: number;
  readonly eligible: boolean;
  /** Present when `eligible` is false; surfaced back in a result's `rejected` list. */
  readonly ineligibleReason?: string;
}

/** The point selection distance is measured to -- the real extraction/delivery target, in the same coordinate space as every candidate's port. */
export interface TeleportAnchorTarget {
  readonly x: number;
  readonly y: number;
}

export type TeleportAnchorSelectionOutcome =
  | 'new' // heldAnchorId was null: a fresh transfer selected an anchor for the first time.
  | 'retained' // the held anchor is still present and eligible; kept regardless of distance/target.
  | 'remapped' // the held anchor was missing or ineligible; a different eligible anchor was selected.
  | 'unavailable' // selection (fresh or remap) found no eligible candidate at all.
  | 'invalid-input'; // candidates/target failed validation; no selection was attempted.

export interface TeleportAnchorRejection {
  readonly id: TeleportAnchorId;
  readonly reason: string;
}

export interface TeleportAnchorSelectionResult {
  readonly outcome: TeleportAnchorSelectionOutcome;
  /** null exactly when outcome is 'unavailable' or 'invalid-input'. */
  readonly selectedId: TeleportAnchorId | null;
  readonly reason: string;
  readonly rejected: ReadonlyArray<TeleportAnchorRejection>;
}

export interface SelectTeleportPrimaryAnchorInput {
  readonly candidates: ReadonlyArray<TeleportAnchorCandidate>;
  readonly target: TeleportAnchorTarget;
  /** The transfer's currently-held anchor, or null for a genuinely new transfer that must select fresh. */
  readonly heldAnchorId: TeleportAnchorId | null;
}

const DEFAULT_INELIGIBLE_REASON = 'ineligible';

const invalidInputResult = (reason: string): TeleportAnchorSelectionResult => ({
  outcome: 'invalid-input',
  selectedId: null,
  reason,
  rejected: []
});

const isFiniteNumber = (value: unknown): value is number => (
  typeof value === 'number' && Number.isFinite(value)
);

/**
 * Validates candidates/target without mutating anything. Returns a reason
 * string on the first violation found (deterministic candidate scan order),
 * or null if the input is well-formed. Malformed input rejects the whole
 * call rather than silently dropping the offending candidate and
 * continuing -- a caller bug here should be loud, not partially recovered.
 */
const validateInput = (input: SelectTeleportPrimaryAnchorInput): string | null => {
  if (!isFiniteNumber(input.target?.x) || !isFiniteNumber(input.target?.y)) {
    return 'target.x/target.y must be finite numbers.';
  }
  if (input.heldAnchorId !== null && !VALID_ANCHOR_IDS.has(input.heldAnchorId)) {
    return `heldAnchorId ${JSON.stringify(input.heldAnchorId)} is not one of the eight known anchor identities (0-7).`;
  }

  const seenIds = new Set<number>();
  for (const candidate of input.candidates) {
    if (!VALID_ANCHOR_IDS.has(candidate?.id as TeleportAnchorId)) {
      return `candidate id ${JSON.stringify(candidate?.id)} is not one of the eight known anchor identities (0-7).`;
    }
    if (seenIds.has(candidate.id)) {
      return `candidate id ${candidate.id} appears more than once -- each of the eight anchors may appear at most once per call.`;
    }
    seenIds.add(candidate.id);
    if (!isFiniteNumber(candidate.portX) || !isFiniteNumber(candidate.portY)) {
      return `candidate id ${candidate.id} has a non-finite port position.`;
    }
  }

  return null;
};

const squaredDistance = (ax: number, ay: number, bx: number, by: number): number => {
  const dx = ax - bx;
  const dy = ay - by;
  return (dx * dx) + (dy * dy);
};

const rejectionsFor = (candidates: ReadonlyArray<TeleportAnchorCandidate>): TeleportAnchorRejection[] => (
  candidates
    .filter((candidate) => !candidate.eligible)
    .map((candidate) => ({ id: candidate.id, reason: candidate.ineligibleReason ?? DEFAULT_INELIGIBLE_REASON }))
    // Fixed, input-order-independent presentation order for reviewability.
    .sort((a, b) => a.id - b.id)
);

/**
 * Selects the nearest eligible candidate to `target` by squared distance to
 * its port, breaking ties by the fixed (lowest-first) anchor-ID order. Pure
 * function of `candidates`/`target` only -- independent of input array
 * order, so shuffling `candidates` between calls never changes the result.
 */
const selectNearestEligible = (
  candidates: ReadonlyArray<TeleportAnchorCandidate>,
  target: TeleportAnchorTarget
): TeleportAnchorId | null => {
  let bestId: TeleportAnchorId | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  // Iterate in fixed ascending-ID order (not input array order) so ties
  // resolve to the lowest ID regardless of how candidates were passed in.
  const byId = [...candidates].sort((a, b) => a.id - b.id);
  for (const candidate of byId) {
    if (!candidate.eligible) continue;
    const distance = squaredDistance(candidate.portX, candidate.portY, target.x, target.y);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestId = candidate.id;
    }
    // Strict '<' above already keeps the lowest-ID candidate on an exact
    // tie, since byId is ascending and a later equal-distance candidate
    // fails the strict comparison against the earlier (lower-ID) one.
  }

  return bestId;
};

/**
 * Resolves which of the eight fixed perimeter anchors is the current
 * transfer's primary. See module doc above for the full contract.
 */
export const selectTeleportPrimaryAnchor = (
  input: SelectTeleportPrimaryAnchorInput
): TeleportAnchorSelectionResult => {
  const invalidReason = validateInput(input);
  if (invalidReason !== null) {
    return invalidInputResult(invalidReason);
  }

  const { candidates, target, heldAnchorId } = input;
  const rejected = rejectionsFor(candidates);

  if (heldAnchorId !== null) {
    const held = candidates.find((candidate) => candidate.id === heldAnchorId);
    if (held !== undefined && held.eligible) {
      return {
        outcome: 'retained',
        selectedId: heldAnchorId,
        reason: 'held anchor is still present and eligible; retained regardless of distance or target changes.',
        rejected
      };
    }

    const remappedId = selectNearestEligible(candidates, target);
    if (remappedId === null) {
      return {
        outcome: 'unavailable',
        selectedId: null,
        reason: held === undefined
          ? 'held anchor is no longer in the candidate set and no eligible anchor is available to remap to.'
          : 'held anchor became ineligible and no eligible anchor is available to remap to.',
        rejected
      };
    }
    return {
      outcome: 'remapped',
      selectedId: remappedId,
      reason: held === undefined
        ? 'held anchor is no longer in the candidate set (invalidated); remapped to the nearest eligible anchor.'
        : 'held anchor became ineligible (invalidated); remapped to the nearest eligible anchor.',
      rejected
    };
  }

  const freshId = selectNearestEligible(candidates, target);
  if (freshId === null) {
    return {
      outcome: 'unavailable',
      selectedId: null,
      reason: 'no eligible anchor is available for this new transfer.',
      rejected
    };
  }
  return {
    outcome: 'new',
    selectedId: freshId,
    reason: 'new transfer; selected the nearest eligible anchor.',
    rejected
  };
};
