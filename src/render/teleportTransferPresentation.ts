/**
 * Wave 4D-B: pure presentation projection for a single-primary Teleport
 * gameplay transfer, per docs/assets/reference/teleport-system-v1/.
 *
 * This module owns NO gameplay timing of its own. It is a stateless view
 * transform layered on top of the one authoritative lifecycle that already
 * exists: src/legacy-runtime/legacyPlayerTransfer.ts's
 * resolveLegacyPlayerTransferVisualState(), which this module calls
 * directly rather than re-deriving phase/progress from scratch. Given that
 * single source of truth plus the real selected primary's measured pose
 * (teleportAnchorPose.ts) and the real extraction/delivery target points,
 * it derives everything a renderer needs to draw ONE continuous conduit
 * for the currently-held primary -- never the eight-origin ambient volley.
 *
 * Playbook this module is built to satisfy:
 * - "One authoritative lifecycle, multiple derived presentation layers."
 *   Phase, outboundProgress, deliveryProgress, and energyAlpha are read
 *   verbatim from the existing resolver; this module never invents a
 *   second clock, a second phase enum, or duplicated player-energy state.
 * - "A stable transfer identity outlives changes to target pose." The
 *   selected primary's pose is a plain input, not something this module
 *   selects or remaps -- that remains teleportPrimaryAnchor.ts's job via
 *   the scene's held-anchor session.
 * - "Preview acceptance is not gameplay acceptance." This module has no
 *   dependency on the QA preview session at all.
 *
 * Direction semantics (frozen contract, "Beam" and "Extraction"/"Spawn"
 * sections):
 * - Extraction (existing 'outbound' phase): the packet originates at the
 *   real extraction target (the goal) and travels TOWARD the primary,
 *   which then absorbs it. This exactly reproduces the growing-tip
 *   direction MenuScene.ts's own drawLegacyPlayerTransferEnergy already
 *   uses for the ambient eight-origin volley (`tipX = targetX + (origin.x
 *   - targetX) * localProgress`) -- same direction convention, just
 *   projected onto the one held primary's real measured port instead of
 *   all eight ambient origins.
 * - Delivery (existing 'delivering' phase): the packet originates at the
 *   primary and travels TOWARD the real delivery target (the next start
 *   tile). MenuScene.ts's current runtime draws NO beam at all for this
 *   phase (only a fading glow) -- this is the actual missing half of the
 *   "continuous conduit" this projection exists to make possible; the
 *   renderer commit that consumes this module supplies the pixels.
 *
 * openFraction reuses the extraction beam's existing per-origin growth
 * fraction exactly (`clamp((outboundProgress - stagger) / 0.88, 0, 1)`
 * with stagger = 0 for a single primary, not eight staggered origins) --
 * MenuScene.ts:~8970-8971. Delivery has no existing equivalent to reuse,
 * so this module defines one from the SAME raw elapsed/duration inputs
 * the existing resolver already takes (deliveryElapsedMs/deliveryTravelMs/
 * deliveryFlashMs): the conduit opens across the travel window, then
 * (a genuinely new-to-delivery behavior the contract requires and the
 * current runtime does not implement) collapses across the flash window,
 * rather than cutting instantly to 'complete' the instant travel ends.
 *
 * Reduced motion ("short state crossfades; a stable conduit; no
 * traveling packet") is applied entirely at this presentation layer, not
 * by changing the underlying clocks: this module forces openFraction to a
 * stable 1 for the whole active window and packetVisible to false. The
 * existing resolver already independently forces outboundProgress to 1
 * immediately under reduced motion (no ramp); it does NOT currently do
 * the same for deliveryProgress (a real, pre-existing gap this module
 * does not silently paper over for the underlying clock -- only this
 * projection's own openFraction/packetVisible fields are held stable).
 * The renderer commit is expected to fade openFraction with a short
 * (~150ms) crossfade rather than a hard cut; that easing is a rendering
 * concern and deliberately not owned by this pure module.
 *
 * When no legal primary pose is currently available (poseAvailable:
 * false), this module never fabricates a conduit: active is forced
 * false and every point is null, but phase/direction are still reported
 * so a caller can distinguish "nothing to show because idle" from
 * "nothing to show because the held primary has no legal pose right
 * now" -- explicit visual degradation, never a silently-invented
 * fallback pose, and never a reason to touch the underlying gameplay
 * clocks (see legacyPlayerTransfer.ts, unchanged by this module).
 */
import {
  resolveLegacyPlayerTransferVisualState,
  type LegacyPlayerTransferPhase,
  type LegacyPlayerTransferVisualInput
} from '../legacy-runtime/legacyPlayerTransfer';
import type { TeleportAnchorPose } from './teleportAnchorPose';

export type TeleportTransferDirection = 'extraction' | 'delivery';

export interface TeleportTransferPoint {
  readonly x: number;
  readonly y: number;
}

// Matches drawLegacyPlayerTransferEnergy's own per-origin growth fraction
// for the single-primary (stagger = 0) case -- see module doc above.
export const TELEPORT_TRANSFER_EXTRACTION_OPEN_DIVISOR = 0.88;

export interface TeleportTransferPresentationInput extends LegacyPlayerTransferVisualInput {
  /**
   * The currently-held primary's real measured pose, or null when no
   * legal pose is available right now (viewport/safe-area invalidation,
   * or no transfer session yet holds an anchor at all). Never mutated.
   */
  readonly primaryPose: TeleportAnchorPose | null;
  /** Real pixel position of the extraction target (the accepted goal). */
  readonly extractionTarget: TeleportTransferPoint | null;
  /** Real pixel position of the delivery target (the next start tile). */
  readonly deliveryTarget: TeleportTransferPoint | null;
}

export interface TeleportTransferPresentation {
  readonly active: boolean;
  readonly phase: LegacyPlayerTransferPhase;
  readonly direction: TeleportTransferDirection | null;
  readonly poseAvailable: boolean;
  /** 0 => zero conduit/glow/packet/rail pixels (frozen-contract closed state). */
  readonly openFraction: number;
  /** Always the primary's measured beam port -- never its anchor center. */
  readonly sourcePoint: TeleportTransferPoint | null;
  readonly targetPoint: TeleportTransferPoint | null;
  readonly packetPoint: TeleportTransferPoint | null;
  readonly packetVisible: boolean;
  readonly sourceFlareIntensity: number;
  readonly targetFlareIntensity: number;
}

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

const normalizeElapsedMs = (value: number | null): number | null => (
  value === null || !Number.isFinite(value) ? null : Math.max(0, value)
);

const normalizeDurationMs = (value: number): number => (
  Number.isFinite(value) && value > 0 ? value : 1
);

const lerpPoint = (
  from: TeleportTransferPoint,
  to: TeleportTransferPoint,
  fraction: number
): TeleportTransferPoint => ({
  x: from.x + ((to.x - from.x) * fraction),
  y: from.y + ((to.y - from.y) * fraction)
});

const INACTIVE_PRESENTATION_BASE = {
  active: false,
  direction: null,
  openFraction: 0,
  sourcePoint: null,
  targetPoint: null,
  packetPoint: null,
  packetVisible: false,
  sourceFlareIntensity: 0,
  targetFlareIntensity: 0
} as const;

export const resolveTeleportTransferPresentation = (
  input: TeleportTransferPresentationInput
): TeleportTransferPresentation => {
  const transfer = resolveLegacyPlayerTransferVisualState(input);
  const poseAvailable = input.primaryPose !== null;
  const reducedMotion = input.reducedMotion === true;

  if (!transfer.active || (transfer.phase !== 'outbound' && transfer.phase !== 'delivering')) {
    // 'idle' / 'pending' / 'stored' / 'complete': no conduit. 'stored'
    // still has a real settled glow (transfer.energyAlpha), which belongs
    // to the shell itself, not a conduit -- surfaced via
    // sourceFlareIntensity so a renderer can keep the primary glowing
    // without drawing any conduit/packet pixels.
    return {
      ...INACTIVE_PRESENTATION_BASE,
      phase: transfer.phase,
      poseAvailable,
      sourceFlareIntensity: transfer.phase === 'stored' ? transfer.energyAlpha : 0
    };
  }

  if (!poseAvailable) {
    // Explicit visual degradation (Playbook: never fabricate a conduit
    // when no legal pose exists). Gameplay progress itself is untouched
    // -- transfer.phase/progress keep advancing via the caller's own
    // elapsed-ms inputs regardless of what this module returns.
    return {
      ...INACTIVE_PRESENTATION_BASE,
      phase: transfer.phase,
      direction: transfer.phase === 'outbound' ? 'extraction' : 'delivery',
      poseAvailable: false
    };
  }

  const sourcePoint: TeleportTransferPoint = { x: input.primaryPose!.portX, y: input.primaryPose!.portY };

  if (transfer.phase === 'outbound') {
    const targetPoint = input.extractionTarget;
    if (targetPoint === null) {
      return { ...INACTIVE_PRESENTATION_BASE, phase: transfer.phase, direction: 'extraction', poseAvailable };
    }
    const openFraction = reducedMotion
      ? 1
      : clamp01(transfer.outboundProgress / TELEPORT_TRANSFER_EXTRACTION_OPEN_DIVISOR);
    const packetVisible = !reducedMotion && openFraction > 0;
    return {
      active: true,
      phase: transfer.phase,
      direction: 'extraction',
      poseAvailable,
      openFraction,
      sourcePoint,
      targetPoint,
      packetPoint: packetVisible ? lerpPoint(targetPoint, sourcePoint, openFraction) : null,
      packetVisible,
      sourceFlareIntensity: transfer.energyAlpha,
      targetFlareIntensity: 0
    };
  }

  // transfer.phase === 'delivering'
  const targetPoint = input.deliveryTarget;
  if (targetPoint === null) {
    return { ...INACTIVE_PRESENTATION_BASE, phase: transfer.phase, direction: 'delivery', poseAvailable };
  }

  const deliveryElapsedMs = normalizeElapsedMs(input.deliveryElapsedMs) ?? 0;
  const travelMs = normalizeDurationMs(input.deliveryTravelMs);
  const flashMs = normalizeDurationMs(input.deliveryFlashMs);
  // deliveryElapsedMs is guaranteed non-null here: resolveLegacyPlayerTransferVisualState
  // only returns phase 'delivering' when it is. The packet has fully
  // "reached contained start energy" (frozen-contract Spawn sequence) the
  // instant elapsed reaches travelMs -- treat that boundary itself as
  // arrived (flash begun), not as one more traveling frame.
  const travelFraction = clamp01(deliveryElapsedMs / travelMs);
  const arrived = deliveryElapsedMs >= travelMs;
  const flashFraction = arrived ? clamp01((deliveryElapsedMs - travelMs) / flashMs) : 0;
  const traveling = !arrived;

  const openFraction = reducedMotion
    ? 1
    : (traveling ? travelFraction : clamp01(1 - flashFraction));
  const packetVisible = !reducedMotion && traveling && openFraction > 0;

  return {
    active: true,
    phase: transfer.phase,
    direction: 'delivery',
    poseAvailable,
    openFraction,
    sourcePoint,
    targetPoint,
    packetPoint: packetVisible ? lerpPoint(sourcePoint, targetPoint, travelFraction) : null,
    packetVisible,
    sourceFlareIntensity: transfer.energyAlpha,
    targetFlareIntensity: traveling ? travelFraction : 1
  };
};
