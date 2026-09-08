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
 *   Preserving that timing source does NOT mean copying every old visual
 *   envelope unchanged, though: legacyPlayerTransfer.ts documents itself
 *   as a visual-only resolver that does not own gameplay timing, so this
 *   module is free to derive a richer visual envelope from the SAME raw
 *   elapsed-ms inputs the scene already supplies, even across a coarse
 *   phase boundary the resolver itself draws (see "Extraction closure"
 *   below) -- it never changes what those raw inputs mean or when they
 *   advance.
 * - "A stable transfer identity outlives changes to target pose." The
 *   selected primary's pose is a plain input, not something this module
 *   selects or remaps -- that remains teleportPrimaryAnchor.ts's job via
 *   the scene's held-anchor session.
 * - "Preview acceptance is not gameplay acceptance." This module has no
 *   dependency on the QA preview session at all.
 *
 * Direction semantics (frozen contract, "Beam" and "Extraction"/"Spawn"
 * sections):
 * - Extraction (existing 'outbound' phase, plus this module's own closure
 *   tail described below): the packet originates at the real extraction
 *   target (the goal) and travels TOWARD the primary, which then absorbs
 *   it. This exactly reproduces the growing-tip direction MenuScene.ts's
 *   own drawLegacyPlayerTransferEnergy already uses for the ambient
 *   eight-origin volley (`tipX = targetX + (origin.x - targetX) *
 *   localProgress`) -- same direction convention, just projected onto the
 *   one held primary's real measured port instead of all eight ambient
 *   origins.
 * - Delivery (existing 'delivering' phase): the packet originates at the
 *   primary and travels TOWARD the real delivery target (the next start
 *   tile). MenuScene.ts's current runtime draws NO beam at all for this
 *   phase (only a fading glow) -- this is the actual missing half of the
 *   "continuous conduit" this projection exists to make possible; the
 *   renderer commit that consumes this module supplies the pixels.
 *
 * openFraction (extraction, while phase is still 'outbound') reuses the
 * existing beam's per-origin growth fraction exactly (`clamp((outboundProgress
 * - stagger) / 0.88, 0, 1)` with stagger = 0 for a single primary, not
 * eight staggered origins) -- MenuScene.ts:~8970-8971.
 *
 * Extraction closure (the actual fix for a real gap found reading this
 * module together with the existing resolver): outboundProgress saturates
 * at 1 well before the resolver's own phase flips from 'outbound' to
 * 'stored' at exactly LEGACY_PLAYER_TRANSFER_OUTBOUND_MS elapsed, so the
 * un-adjusted projection above stayed pinned fully OPEN right up to that
 * instant, then cut to fully CLOSED the moment 'stored' began -- a hard
 * cut, not a collapse ("conduit collapses -> primary enters stored state"
 * per the frozen contract). Because the scene keeps incrementing the same
 * outboundElapsedMs clock well past that phase boundary (it is only reset
 * once a full transfer genuinely completes), this module can read past
 * the boundary and continue presenting a short closing extraction window
 * during the FIRST EXTRACTION_ABSORPTION_MS of 'stored' -- a real visual
 * envelope this presentation layer owns, without changing when the
 * resolver's own phase flips or what triggers it.
 *
 * Reduced motion ("short state crossfades; a stable conduit; no
 * traveling packet"): the existing resolver already independently forces
 * outboundProgress to 1 immediately under reduced motion, so its own
 * `if (outboundProgress < 1)` guard means phase jumps straight to
 * 'stored' -- there is no reduced-motion 'outbound' tick to project a
 * conduit for at all. Rather than silently treating that as "nothing to
 * show" (which would fail the frozen "short crossfade" requirement), this
 * module presents a brief, STABLE (non-ramping) open conduit during the
 * first EXTRACTION_REDUCED_MOTION_CROSSFADE_MS of 'stored' under reduced
 * motion specifically -- no traveling packet, matching the contract
 * exactly, and shorter than the normal-motion absorption tail since there
 * was no travel animation to close out. Delivery's reduced-motion
 * handling is unchanged from the original implementation (a stable, fully
 * open conduit with no packet for the whole real travel+flash window) --
 * a real, narrower pre-existing gap than extraction's (it does not
 * shorten the underlying deliveryProgress ramp under reduced motion,
 * since that ramp is real gameplay-adjacent timing this module does not
 * own), left as-is since it already satisfies "stable conduit, no
 * traveling packet" and was not the specific defect being corrected here.
 *
 * When no legal primary pose is currently available (poseAvailable:
 * false), this module never fabricates a conduit: active is forced
 * false and every point is null, but phase/direction are still reported
 * so a caller can distinguish "nothing to show because idle" from
 * "nothing to show because the held primary has no legal pose right
 * now" -- explicit visual degradation, never a silently-invented
 * fallback pose, and never a reason to touch the underlying gameplay
 * clocks (see legacyPlayerTransfer.ts, unchanged by this module).
 *
 * Conduit coverage vs. packet position (real defect found in the first
 * scene-integration round and fixed here): `sourcePoint`/`targetPoint`
 * name the transfer's two fixed geometric endpoints (the primary's port
 * and the real extraction/delivery target), but a renderer must NOT
 * derive the conduit's currently-ILLUMINATED extent by branching on
 * `packetVisible` and picking between `packetPoint` and one of those two
 * endpoints -- doing so drew a correct, growing segment while the packet
 * traveled, then, the instant the packet arrived and packetVisible
 * flipped to false, jumped to redrawing the FULL fixed-endpoint-to-
 * fixed-endpoint segment, which is only pixel-identical to where the
 * growing segment already was for delivery (grows from source, so the
 * full line is source->target, matching where the tip ended up) but
 * NOT for extraction (grows from target TOWARD source, so at full
 * openFraction the tip has reached source and the actually-drawn extent
 * was target->source already -- correct -- yet re-deriving "target
 * ->source" from scratch using target/source directly, rather than
 * continuing from the tip's own last position, is where the two
 * conventions silently diverged: the FIRST integration round's renderer
 * always anchored the fixed end at `sourcePoint` regardless of
 * direction, which is only correct for delivery; for extraction the
 * fixed end must be `targetPoint`, matching the existing eight-origin
 * volley's own convention exactly (`lineBetween(targetX, targetY, tipX,
 * tipY)` -- fixed at the target, growing tip toward the origin).
 *
 * `conduitStartPoint`/`conduitEndPoint` below are this module's fix:
 * the two points a renderer should ALWAYS stroke between, unconditional
 * on packetVisible. `conduitStartPoint` is the direction's fixed anchor
 * (target for extraction, source for delivery). `conduitEndPoint` is the
 * growing tip while a packet travels (`packetPoint`, by construction),
 * and is DELIBERATELY the SAME point the tip already reached the instant
 * it stops traveling -- source for extraction, target for delivery --
 * so the segment never jumps or is reconstructed when packetVisible
 * changes; only the separately-drawn packet marker disappears, and only
 * the segment's overall alpha (`openFraction`) continues its own
 * already-continuous fade from wherever it was.
 */
import {
  resolveLegacyPlayerTransferVisualState,
  LEGACY_PLAYER_TRANSFER_OUTBOUND_MS,
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

// This presentation layer's own closure envelope, not a legacy value:
// how long, after the resolver's outbound clock crosses
// LEGACY_PLAYER_TRANSFER_OUTBOUND_MS, the conduit keeps visibly
// collapsing rather than cutting to zero pixels instantly.
export const TELEPORT_TRANSFER_EXTRACTION_ABSORPTION_MS = 160;

// This presentation layer's own reduced-motion crossfade envelope: how
// long, from the start of the (effectively instant, under reduced
// motion) outbound clock, a stable open conduit is shown before settling
// into the ordinary closed 'stored' presentation.
export const TELEPORT_TRANSFER_EXTRACTION_REDUCED_MOTION_CROSSFADE_MS = 140;

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
  /**
   * The segment a renderer should ALWAYS stroke between when openFraction
   * > 0 -- unconditional on packetVisible. See the module doc's "Conduit
   * coverage vs. packet position" section: conduitStartPoint is the
   * direction's fixed anchor (target for extraction, source for
   * delivery); conduitEndPoint is the growing tip while a packet
   * travels, and stays exactly where that tip arrived once it stops.
   */
  readonly conduitStartPoint: TeleportTransferPoint | null;
  readonly conduitEndPoint: TeleportTransferPoint | null;
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
  conduitStartPoint: null,
  conduitEndPoint: null,
  packetPoint: null,
  packetVisible: false,
  sourceFlareIntensity: 0,
  targetFlareIntensity: 0
} as const;

/**
 * The 'stored' phase's extraction closure/crossfade tail, checked before
 * falling back to ordinary settled-stored presentation. Returns null when
 * neither window applies (ordinary stored, or no outbound clock at all).
 */
const resolveExtractionClosurePresentation = (
  input: TeleportTransferPresentationInput,
  storedEnergyAlpha: number,
  poseAvailable: boolean,
  reducedMotion: boolean
): TeleportTransferPresentation | null => {
  const outboundElapsedMs = normalizeElapsedMs(input.outboundElapsedMs);
  if (outboundElapsedMs === null) {
    return null;
  }

  if (reducedMotion) {
    if (outboundElapsedMs >= TELEPORT_TRANSFER_EXTRACTION_REDUCED_MOTION_CROSSFADE_MS) {
      return null;
    }
    if (!poseAvailable || input.extractionTarget === null) {
      // Explicit degradation still applies inside the crossfade window --
      // never fabricate a conduit without a real pose/target.
      return {
        ...INACTIVE_PRESENTATION_BASE,
        phase: 'stored',
        direction: 'extraction',
        poseAvailable
      };
    }
    const reducedMotionSourcePoint = { x: input.primaryPose!.portX, y: input.primaryPose!.portY };
    return {
      active: true,
      phase: 'stored',
      direction: 'extraction',
      poseAvailable,
      openFraction: 1,
      sourcePoint: reducedMotionSourcePoint,
      targetPoint: input.extractionTarget,
      // Fully extended and stable -- extraction's fixed anchor is the
      // target, with the tip already at the source (see module doc).
      conduitStartPoint: input.extractionTarget,
      conduitEndPoint: reducedMotionSourcePoint,
      packetPoint: null,
      packetVisible: false,
      sourceFlareIntensity: Math.max(storedEnergyAlpha, 1),
      targetFlareIntensity: 0
    };
  }

  const overshootMs = outboundElapsedMs - LEGACY_PLAYER_TRANSFER_OUTBOUND_MS;
  if (overshootMs < 0 || overshootMs >= TELEPORT_TRANSFER_EXTRACTION_ABSORPTION_MS) {
    return null;
  }
  if (!poseAvailable || input.extractionTarget === null) {
    return {
      ...INACTIVE_PRESENTATION_BASE,
      phase: 'stored',
      direction: 'extraction',
      poseAvailable
    };
  }
  const openFraction = clamp01(1 - (overshootMs / TELEPORT_TRANSFER_EXTRACTION_ABSORPTION_MS));
  const closureSourcePoint = { x: input.primaryPose!.portX, y: input.primaryPose!.portY };
  return {
    active: true,
    phase: 'stored',
    direction: 'extraction',
    poseAvailable,
    openFraction,
    sourcePoint: closureSourcePoint,
    targetPoint: input.extractionTarget,
    // Fully extended (fixed anchor = target, tip already at source --
    // see module doc); only the overall alpha (openFraction) continues
    // fading from wherever it already was, never a reconstructed line.
    conduitStartPoint: input.extractionTarget,
    conduitEndPoint: closureSourcePoint,
    // The packet has already been absorbed by the time this tail begins
    // (the contract's "same shell absorbs it" happens at the outbound/
    // stored boundary) -- only the conduit itself retracts, no separate
    // traveling payload.
    packetPoint: null,
    packetVisible: false,
    sourceFlareIntensity: Math.max(storedEnergyAlpha, openFraction),
    targetFlareIntensity: 0
  };
};

export const resolveTeleportTransferPresentation = (
  input: TeleportTransferPresentationInput
): TeleportTransferPresentation => {
  const transfer = resolveLegacyPlayerTransferVisualState(input);
  const poseAvailable = input.primaryPose !== null;
  const reducedMotion = input.reducedMotion === true;

  if (transfer.phase === 'stored') {
    const closure = resolveExtractionClosurePresentation(input, transfer.energyAlpha, poseAvailable, reducedMotion);
    if (closure !== null) {
      return closure;
    }
  }

  if (!transfer.active || (transfer.phase !== 'outbound' && transfer.phase !== 'delivering')) {
    // 'idle' / 'pending' / 'stored' (outside its own closure/crossfade
    // tail, handled above) / 'complete': no conduit. 'stored' still has a
    // real settled glow (transfer.energyAlpha), which belongs to the
    // shell itself, not a conduit -- surfaced via sourceFlareIntensity so
    // a renderer can keep the primary glowing without drawing any
    // conduit/packet pixels.
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
    // Extraction's fixed anchor is the TARGET (matches the existing
    // eight-origin volley's own convention); the tip grows from target
    // toward source as openFraction rises, reaching exactly sourcePoint
    // at openFraction 1 -- the same point the closure tail above starts
    // from, so there is no jump when packetVisible later turns false.
    const conduitEndPoint = packetVisible ? lerpPoint(targetPoint, sourcePoint, openFraction) : sourcePoint;
    return {
      active: true,
      phase: transfer.phase,
      direction: 'extraction',
      poseAvailable,
      openFraction,
      sourcePoint,
      targetPoint,
      conduitStartPoint: targetPoint,
      conduitEndPoint,
      packetPoint: packetVisible ? conduitEndPoint : null,
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
  // Delivery's fixed anchor is the SOURCE (the primary); the tip grows
  // from source toward target as it travels, reaching exactly
  // targetPoint on arrival -- the same point the flash/closure window
  // below continues from, so there is no jump when packetVisible turns
  // false.
  const conduitEndPoint = packetVisible ? lerpPoint(sourcePoint, targetPoint, travelFraction) : targetPoint;

  return {
    active: true,
    phase: transfer.phase,
    direction: 'delivery',
    poseAvailable,
    openFraction,
    sourcePoint,
    targetPoint,
    conduitStartPoint: sourcePoint,
    conduitEndPoint,
    packetPoint: packetVisible ? conduitEndPoint : null,
    packetVisible,
    sourceFlareIntensity: transfer.energyAlpha,
    targetFlareIntensity: traveling ? travelFraction : 1
  };
};
