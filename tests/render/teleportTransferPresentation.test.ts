import { describe, expect, test } from 'vitest';
import {
  resolveTeleportTransferPresentation,
  TELEPORT_TRANSFER_EXTRACTION_OPEN_DIVISOR,
  type TeleportTransferPresentationInput
} from '../../src/render/teleportTransferPresentation';
import type { TeleportAnchorPose } from '../../src/render/teleportAnchorPose';

const POSE: TeleportAnchorPose = {
  id: 3,
  anchorX: 1000,
  anchorY: 400,
  rotation: -0.5,
  portX: 980,
  portY: 385,
  footprint: { x: 960, y: 365, width: 44, height: 44 }
};

const EXTRACTION_TARGET = { x: 200, y: 600 }; // the goal
const DELIVERY_TARGET = { x: 40, y: 40 }; // the next start tile

const baseInput = (overrides: Partial<TeleportTransferPresentationInput> = {}): TeleportTransferPresentationInput => ({
  armed: true,
  deliveryElapsedMs: null,
  deliveryFlashMs: 120,
  deliveryTravelMs: 500,
  nowMs: 0,
  outboundElapsedMs: null,
  primaryPose: POSE,
  extractionTarget: EXTRACTION_TARGET,
  deliveryTarget: DELIVERY_TARGET,
  ...overrides
});

describe('resolveTeleportTransferPresentation: idle/pending/stored/complete (no conduit)', () => {
  test('not armed: fully inactive, zero pixels, no direction', () => {
    const result = resolveTeleportTransferPresentation(baseInput({ armed: false }));
    expect(result.active).toBe(false);
    expect(result.phase).toBe('idle');
    expect(result.direction).toBeNull();
    expect(result.openFraction).toBe(0);
    expect(result.sourcePoint).toBeNull();
    expect(result.targetPoint).toBeNull();
    expect(result.packetPoint).toBeNull();
    expect(result.packetVisible).toBe(false);
  });

  test('armed but no elapsed clocks yet (pending): zero pixels', () => {
    const result = resolveTeleportTransferPresentation(baseInput());
    expect(result.phase).toBe('pending');
    expect(result.active).toBe(false);
    expect(result.openFraction).toBe(0);
  });

  test('stored (outbound finished, no delivery clock yet): zero conduit pixels, but the shell keeps its settled glow', () => {
    const result = resolveTeleportTransferPresentation(baseInput({ outboundElapsedMs: 10_000 }));
    expect(result.phase).toBe('stored');
    expect(result.active).toBe(false);
    expect(result.direction).toBeNull();
    expect(result.openFraction).toBe(0);
    expect(result.packetVisible).toBe(false);
    expect(result.sourceFlareIntensity).toBeGreaterThan(0);
    expect(result.targetFlareIntensity).toBe(0);
  });

  test('complete (delivery clock past travel+flash): zero pixels', () => {
    const result = resolveTeleportTransferPresentation(baseInput({ deliveryElapsedMs: 10_000 }));
    expect(result.phase).toBe('complete');
    expect(result.active).toBe(false);
    expect(result.openFraction).toBe(0);
  });
});

describe('resolveTeleportTransferPresentation: extraction (outbound)', () => {
  test('packet direction: originates at the real extraction target and travels TOWARD the primary\'s measured port', () => {
    const early = resolveTeleportTransferPresentation(baseInput({ outboundElapsedMs: 1 }));
    expect(early.phase).toBe('outbound');
    expect(early.direction).toBe('extraction');
    expect(early.sourcePoint).toEqual({ x: POSE.portX, y: POSE.portY });
    expect(early.targetPoint).toEqual(EXTRACTION_TARGET);
    // At the very start, the packet should read as being at (or very near)
    // the target, not the source -- it has not travelled yet.
    expect(early.packetPoint!.x).toBeCloseTo(EXTRACTION_TARGET.x, 0);
    expect(early.packetPoint!.y).toBeCloseTo(EXTRACTION_TARGET.y, 0);

    const late = resolveTeleportTransferPresentation(baseInput({ outboundElapsedMs: 449 }));
    // Close to fully open -- the packet should now read as much closer to
    // the source (primary) than to the target.
    const distToSource = Math.hypot(late.packetPoint!.x - POSE.portX, late.packetPoint!.y - POSE.portY);
    const distToTarget = Math.hypot(late.packetPoint!.x - EXTRACTION_TARGET.x, late.packetPoint!.y - EXTRACTION_TARGET.y);
    expect(distToSource).toBeLessThan(distToTarget);
  });

  test('openFraction reuses the existing single-primary growth divisor exactly (0.88), not an invented number', () => {
    // 450ms is LEGACY_PLAYER_TRANSFER_OUTBOUND_MS, at which point
    // outboundProgress reaches EXACTLY 1 and the existing resolver itself
    // transitions phase to 'stored' (see legacyPlayerTransfer.ts's own
    // `if (outboundProgress < 1)` guard) -- 449ms stays inside 'outbound'
    // while outboundProgress is still extremely close to saturated, which
    // is what this test needs to exercise the clamp.
    const result = resolveTeleportTransferPresentation(baseInput({ outboundElapsedMs: 449 }));
    expect(result.phase).toBe('outbound');
    expect(result.openFraction).toBeCloseTo(Math.min(1, 1 / TELEPORT_TRANSFER_EXTRACTION_OPEN_DIVISOR), 5);
  });

  test('openFraction is 0 at the very first instant (matches the existing beam staying invisible for its opening span)', () => {
    const result = resolveTeleportTransferPresentation(baseInput({ outboundElapsedMs: 0 }));
    expect(result.openFraction).toBe(0);
    expect(result.packetVisible).toBe(false);
  });

  test('no legal pose available: explicit degradation, never a fabricated conduit, phase/direction still reported', () => {
    const result = resolveTeleportTransferPresentation(baseInput({ outboundElapsedMs: 200, primaryPose: null }));
    expect(result.poseAvailable).toBe(false);
    expect(result.active).toBe(false);
    expect(result.phase).toBe('outbound');
    expect(result.direction).toBe('extraction');
    expect(result.sourcePoint).toBeNull();
    expect(result.packetPoint).toBeNull();
  });

  test('no extraction target supplied: inactive rather than guessing a target', () => {
    const result = resolveTeleportTransferPresentation(baseInput({ outboundElapsedMs: 200, extractionTarget: null }));
    expect(result.active).toBe(false);
    expect(result.direction).toBe('extraction');
    expect(result.targetPoint).toBeNull();
  });

  test('reduced motion: the underlying resolver itself skips the outbound ramp entirely (a pre-existing, real behavior this module does not paper over) -- phase reads as \'stored\' immediately rather than \'outbound\'', () => {
    // legacyPlayerTransfer.ts forces outboundProgress = 1 immediately under
    // reduced motion, and its own `if (outboundProgress < 1)` guard means
    // phase becomes 'stored' on the very first tick -- there is no
    // reduced-motion 'outbound' state to project a conduit for at all.
    // This documents that real interaction rather than silently assuming
    // this module's own reduced-motion branch for 'outbound' is reachable.
    const result = resolveTeleportTransferPresentation(baseInput({ outboundElapsedMs: 5, reducedMotion: true }));
    expect(result.phase).toBe('stored');
    expect(result.active).toBe(false);
    expect(result.openFraction).toBe(0);
    expect(result.sourceFlareIntensity).toBeGreaterThan(0);
  });
});

describe('resolveTeleportTransferPresentation: delivery (delivering)', () => {
  test('packet direction: originates at the primary\'s measured port and travels TOWARD the real delivery target', () => {
    const early = resolveTeleportTransferPresentation(baseInput({ deliveryElapsedMs: 1 }));
    expect(early.phase).toBe('delivering');
    expect(early.direction).toBe('delivery');
    expect(early.sourcePoint).toEqual({ x: POSE.portX, y: POSE.portY });
    expect(early.targetPoint).toEqual(DELIVERY_TARGET);
    // 1ms into a 500ms travel window has moved only a fraction of a
    // percent -- close to, not exactly at, the source.
    const earlyDistFromSource = Math.hypot(early.packetPoint!.x - POSE.portX, early.packetPoint!.y - POSE.portY);
    const earlyDistFromTarget = Math.hypot(early.packetPoint!.x - DELIVERY_TARGET.x, early.packetPoint!.y - DELIVERY_TARGET.y);
    expect(earlyDistFromSource).toBeLessThan(earlyDistFromTarget);
    expect(earlyDistFromSource).toBeLessThan(10);

    const late = resolveTeleportTransferPresentation(baseInput({ deliveryElapsedMs: 499 }));
    const distToSource = Math.hypot(late.packetPoint!.x - POSE.portX, late.packetPoint!.y - POSE.portY);
    const distToTarget = Math.hypot(late.packetPoint!.x - DELIVERY_TARGET.x, late.packetPoint!.y - DELIVERY_TARGET.y);
    expect(distToTarget).toBeLessThan(distToSource);
  });

  test('during travel, openFraction ramps up with progress and the packet is visible', () => {
    const result = resolveTeleportTransferPresentation(baseInput({ deliveryElapsedMs: 250 }));
    expect(result.openFraction).toBeGreaterThan(0);
    expect(result.openFraction).toBeLessThan(1);
    expect(result.packetVisible).toBe(true);
    expect(result.targetFlareIntensity).toBeGreaterThan(0);
    expect(result.targetFlareIntensity).toBeLessThan(1);
  });

  test('arrival (travel complete, still in the flash window): packet disappears into a full target flare, conduit begins collapsing -- not an instant cut', () => {
    // travelMs=500, flashMs=120 -- 500 is the exact travel/flash boundary.
    const justArrived = resolveTeleportTransferPresentation(baseInput({ deliveryElapsedMs: 500 }));
    expect(justArrived.phase).toBe('delivering');
    expect(justArrived.packetVisible).toBe(false);
    expect(justArrived.targetFlareIntensity).toBe(1);
    expect(justArrived.openFraction).toBeCloseTo(1, 5);

    const midFlash = resolveTeleportTransferPresentation(baseInput({ deliveryElapsedMs: 560 }));
    expect(midFlash.phase).toBe('delivering');
    expect(midFlash.packetVisible).toBe(false);
    expect(midFlash.targetFlareIntensity).toBe(1);
    // Conduit is tapering closed during the flash window, not still fully
    // open and not yet fully collapsed.
    expect(midFlash.openFraction).toBeGreaterThan(0);
    expect(midFlash.openFraction).toBeLessThan(1);

    const endOfFlash = resolveTeleportTransferPresentation(baseInput({ deliveryElapsedMs: 619 }));
    expect(endOfFlash.phase).toBe('delivering');
    expect(endOfFlash.openFraction).toBeCloseTo(0, 1);
  });

  test('no legal pose available during delivery: explicit degradation', () => {
    const result = resolveTeleportTransferPresentation(baseInput({ deliveryElapsedMs: 250, primaryPose: null }));
    expect(result.poseAvailable).toBe(false);
    expect(result.active).toBe(false);
    expect(result.phase).toBe('delivering');
    expect(result.direction).toBe('delivery');
  });

  test('no delivery target supplied: inactive rather than guessing a target', () => {
    const result = resolveTeleportTransferPresentation(baseInput({ deliveryElapsedMs: 250, deliveryTarget: null }));
    expect(result.active).toBe(false);
    expect(result.direction).toBe('delivery');
  });

  test('reduced motion: stable open conduit, no traveling packet, still reports a full target flare once the travel window elapses', () => {
    const traveling = resolveTeleportTransferPresentation(baseInput({ deliveryElapsedMs: 100, reducedMotion: true }));
    expect(traveling.openFraction).toBe(1);
    expect(traveling.packetVisible).toBe(false);
    expect(traveling.packetPoint).toBeNull();
  });
});

describe('resolveTeleportTransferPresentation: identity stability across direction changes', () => {
  test('the same primary pose feeds both extraction and delivery -- this module never re-selects or remaps it', () => {
    const extraction = resolveTeleportTransferPresentation(baseInput({ outboundElapsedMs: 200 }));
    const delivery = resolveTeleportTransferPresentation(baseInput({ deliveryElapsedMs: 200 }));
    expect(extraction.sourcePoint).toEqual(delivery.sourcePoint);
    expect(extraction.sourcePoint).toEqual({ x: POSE.portX, y: POSE.portY });
  });

  test('does not mutate its input', () => {
    const input = baseInput({ outboundElapsedMs: 200 });
    const snapshot = JSON.parse(JSON.stringify(input));
    resolveTeleportTransferPresentation(input);
    expect(JSON.parse(JSON.stringify(input))).toEqual(snapshot);
  });
});
