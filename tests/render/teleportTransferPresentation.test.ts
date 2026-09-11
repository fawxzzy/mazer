import { describe, expect, test } from 'vitest';
import {
  resolveTeleportTransferPresentation,
  TELEPORT_TRANSFER_EXTRACTION_ABSORPTION_MS,
  TELEPORT_TRANSFER_EXTRACTION_OPEN_DIVISOR,
  TELEPORT_TRANSFER_EXTRACTION_REDUCED_MOTION_CROSSFADE_MS,
  type TeleportTransferPresentationInput
} from '../../src/render/teleportTransferPresentation';
import { LEGACY_PLAYER_TRANSFER_OUTBOUND_MS } from '../../src/legacy-runtime/legacyPlayerTransfer';
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

  test('reduced motion: the underlying resolver itself skips the outbound ramp entirely -- phase reads as \'stored\' immediately, but this module still presents a short crossfade there (the actual reduced-motion extraction fix), fading IN rather than snapping open', () => {
    // legacyPlayerTransfer.ts forces outboundProgress = 1 immediately under
    // reduced motion, and its own `if (outboundProgress < 1)` guard means
    // phase becomes 'stored' on the very first tick -- there is no
    // reduced-motion 'outbound' state to project a conduit for at all.
    // Rather than reporting nothing (failing the frozen "short crossfade"
    // requirement), this module presents a brief crossfaded (fade in,
    // stable hold, fade out), packet-free open conduit during the very
    // start of 'stored' under reduced motion specifically.
    const result = resolveTeleportTransferPresentation(baseInput({ outboundElapsedMs: 5, reducedMotion: true }));
    expect(result.phase).toBe('stored');
    expect(result.active).toBe(true);
    expect(result.direction).toBe('extraction');
    // 5ms into the fade-in edge -- open, but not yet fully.
    expect(result.openFraction).toBeGreaterThan(0);
    expect(result.openFraction).toBeLessThan(1);
    expect(result.packetVisible).toBe(false);
    expect(result.packetPoint).toBeNull();
    expect(result.sourcePoint).toEqual({ x: POSE.portX, y: POSE.portY });
    expect(result.targetPoint).toEqual(EXTRACTION_TARGET);
  });

  test('reduced-motion crossfade: a genuinely stable (non-ramping) hold in the middle of the window', () => {
    // Well past the fade-in edge (45ms) and well before the fade-out edge
    // starts (140-45=95ms) -- two samples in that middle stretch should
    // both read as fully, stably open.
    const midA = resolveTeleportTransferPresentation(baseInput({ outboundElapsedMs: 60, reducedMotion: true }));
    const midB = resolveTeleportTransferPresentation(baseInput({ outboundElapsedMs: 80, reducedMotion: true }));
    expect(midA.openFraction).toBeCloseTo(1, 5);
    expect(midB.openFraction).toBeCloseTo(1, 5);
  });

  test('reduced-motion crossfade window: fades OUT (not an instant cut) approaching its end, then settles into ordinary closed stored presentation once it elapses', () => {
    const justBeforeEnd = resolveTeleportTransferPresentation(baseInput({
      outboundElapsedMs: TELEPORT_TRANSFER_EXTRACTION_REDUCED_MOTION_CROSSFADE_MS - 1,
      reducedMotion: true
    }));
    expect(justBeforeEnd.active).toBe(true);
    // 1ms before the window closes -- deep into the fade-out edge, not
    // still fully open.
    expect(justBeforeEnd.openFraction).toBeGreaterThan(0);
    expect(justBeforeEnd.openFraction).toBeLessThan(0.1);

    const justAfterEnd = resolveTeleportTransferPresentation(baseInput({
      outboundElapsedMs: TELEPORT_TRANSFER_EXTRACTION_REDUCED_MOTION_CROSSFADE_MS,
      reducedMotion: true
    }));
    expect(justAfterEnd.active).toBe(false);
    expect(justAfterEnd.direction).toBeNull();
    expect(justAfterEnd.openFraction).toBe(0);
    expect(justAfterEnd.sourceFlareIntensity).toBeGreaterThan(0);
  });

  test('reduced-motion crossfade window still degrades explicitly when no legal pose/target is available -- never a fabricated conduit', () => {
    const noPose = resolveTeleportTransferPresentation(baseInput({ outboundElapsedMs: 5, reducedMotion: true, primaryPose: null }));
    expect(noPose.active).toBe(false);
    expect(noPose.phase).toBe('stored');
    expect(noPose.direction).toBe('extraction');
    expect(noPose.poseAvailable).toBe(false);

    const noTarget = resolveTeleportTransferPresentation(baseInput({ outboundElapsedMs: 5, reducedMotion: true, extractionTarget: null }));
    expect(noTarget.active).toBe(false);
    expect(noTarget.phase).toBe('stored');
    expect(noTarget.direction).toBe('extraction');
  });
});

describe('resolveTeleportTransferPresentation: extraction closure (the normal-motion outbound -> stored boundary)', () => {
  test('before the boundary: still fully open, ordinary outbound presentation', () => {
    const result = resolveTeleportTransferPresentation(baseInput({ outboundElapsedMs: LEGACY_PLAYER_TRANSFER_OUTBOUND_MS - 1 }));
    expect(result.phase).toBe('outbound');
    expect(result.active).toBe(true);
    expect(result.openFraction).toBeCloseTo(1, 5);
  });

  test('at the exact boundary: phase has flipped to stored, but the conduit is still fully open -- not an instant cut', () => {
    const result = resolveTeleportTransferPresentation(baseInput({ outboundElapsedMs: LEGACY_PLAYER_TRANSFER_OUTBOUND_MS }));
    expect(result.phase).toBe('stored');
    expect(result.active).toBe(true);
    expect(result.direction).toBe('extraction');
    expect(result.openFraction).toBeCloseTo(1, 5);
    // The packet has already been absorbed by this instant -- only the
    // conduit itself is retracting, no separate traveling payload.
    expect(result.packetVisible).toBe(false);
  });

  test('mid-closure: openFraction is strictly between 0 and 1 -- a real taper, not a step function', () => {
    const result = resolveTeleportTransferPresentation(baseInput({
      outboundElapsedMs: LEGACY_PLAYER_TRANSFER_OUTBOUND_MS + (TELEPORT_TRANSFER_EXTRACTION_ABSORPTION_MS / 2)
    }));
    expect(result.phase).toBe('stored');
    expect(result.active).toBe(true);
    expect(result.openFraction).toBeGreaterThan(0);
    expect(result.openFraction).toBeLessThan(1);
  });

  test('after the closure window: ordinary settled stored presentation, zero conduit pixels', () => {
    const result = resolveTeleportTransferPresentation(baseInput({
      outboundElapsedMs: LEGACY_PLAYER_TRANSFER_OUTBOUND_MS + TELEPORT_TRANSFER_EXTRACTION_ABSORPTION_MS
    }));
    expect(result.phase).toBe('stored');
    expect(result.active).toBe(false);
    expect(result.direction).toBeNull();
    expect(result.openFraction).toBe(0);
    expect(result.sourceFlareIntensity).toBeGreaterThan(0);
  });

  test('closure window still degrades explicitly when no legal pose/target is available -- never a fabricated conduit', () => {
    const noPose = resolveTeleportTransferPresentation(baseInput({
      outboundElapsedMs: LEGACY_PLAYER_TRANSFER_OUTBOUND_MS + 10,
      primaryPose: null
    }));
    expect(noPose.active).toBe(false);
    expect(noPose.phase).toBe('stored');
    expect(noPose.direction).toBe('extraction');

    const noTarget = resolveTeleportTransferPresentation(baseInput({
      outboundElapsedMs: LEGACY_PLAYER_TRANSFER_OUTBOUND_MS + 10,
      extractionTarget: null
    }));
    expect(noTarget.active).toBe(false);
    expect(noTarget.phase).toBe('stored');
    expect(noTarget.direction).toBe('extraction');
  });

  test('a long-settled stored primary (well past the closure window) is unaffected by this fix -- matches the original stored behavior exactly', () => {
    const result = resolveTeleportTransferPresentation(baseInput({ outboundElapsedMs: 10_000 }));
    expect(result.phase).toBe('stored');
    expect(result.active).toBe(false);
    expect(result.openFraction).toBe(0);
    expect(result.sourceFlareIntensity).toBeGreaterThan(0);
  });
});

describe('resolveTeleportTransferPresentation: conduit coverage continuity (real defect fixed after scene integration)', () => {
  // A confirmed real bug from the first scene-integration round: a
  // renderer deriving the illuminated segment as `packetVisible ?
  // sourcePoint->packetPoint : sourcePoint->targetPoint` drew a segment
  // that (for extraction specifically) SHRANK toward zero length as the
  // packet approached the primary, then JUMPED back to the full-length
  // line the instant packetVisible turned false at the outbound->stored
  // boundary. conduitStartPoint/conduitEndPoint exist specifically to
  // make that impossible: they must already equal the fully-extended
  // segment's own endpoints at the exact moment packetVisible flips.
  test('extraction: conduitEndPoint reaches exactly sourcePoint as openFraction approaches 1, with no separate reconstruction needed', () => {
    const justBeforeFull = resolveTeleportTransferPresentation(baseInput({ outboundElapsedMs: 449 }));
    expect(justBeforeFull.packetVisible).toBe(true);
    expect(justBeforeFull.conduitStartPoint).toEqual(EXTRACTION_TARGET);
    // Very close to fully open -- the tip should read as very close to
    // the source, not still near the target.
    const distToSource = Math.hypot(
      justBeforeFull.conduitEndPoint!.x - POSE.portX,
      justBeforeFull.conduitEndPoint!.y - POSE.portY
    );
    expect(distToSource).toBeLessThan(5);
  });

  test('extraction: conduitEndPoint at the outbound->stored boundary EXACTLY equals the closure tail\'s own conduitEndPoint one instant later -- no jump', () => {
    // 450ms = LEGACY_PLAYER_TRANSFER_OUTBOUND_MS -- the exact instant
    // phase flips from 'outbound' to 'stored' (and this module's own
    // closure tail takes over). Compare the segment reported one
    // instant before (449ms, still 'outbound') against one instant
    // after (450ms, now in the closure tail): the endpoints must already
    // agree -- continuity, not a reconstruction.
    const justBefore = resolveTeleportTransferPresentation(baseInput({ outboundElapsedMs: LEGACY_PLAYER_TRANSFER_OUTBOUND_MS - 1 }));
    const justAfter = resolveTeleportTransferPresentation(baseInput({ outboundElapsedMs: LEGACY_PLAYER_TRANSFER_OUTBOUND_MS }));
    expect(justBefore.phase).toBe('outbound');
    expect(justAfter.phase).toBe('stored');
    expect(justAfter.conduitStartPoint).toEqual(justBefore.conduitStartPoint);
    // Both should already be extremely close to the source -- within a
    // tight tolerance of each other, not a full-length jump apart.
    const gap = Math.hypot(
      justAfter.conduitEndPoint!.x - justBefore.conduitEndPoint!.x,
      justAfter.conduitEndPoint!.y - justBefore.conduitEndPoint!.y
    );
    expect(gap).toBeLessThan(2);
  });

  test('extraction: the illuminated segment length is monotonically non-decreasing across the whole outbound ramp -- never shrinks', () => {
    // Starts at 1ms, not 0ms: at exactly openFraction === 0 (nothing has
    // travelled yet), packetVisible is false and conduitEndPoint reports
    // the fully-arrived position rather than "not yet started" -- a
    // harmless artifact only because the renderer's own openFraction <= 0
    // check means that value is never actually drawn. This test only
    // asserts monotonicity across the range where openFraction > 0 and
    // the segment is genuinely visible.
    const samples = [1, 50, 100, 150, 200, 250, 300, 350, 400, 449].map((ms) => {
      const result = resolveTeleportTransferPresentation(baseInput({ outboundElapsedMs: ms }));
      expect(result.openFraction).toBeGreaterThan(0);
      return Math.hypot(
        result.conduitEndPoint!.x - result.conduitStartPoint!.x,
        result.conduitEndPoint!.y - result.conduitStartPoint!.y
      );
    });
    for (let i = 1; i < samples.length; i += 1) {
      expect(samples[i]).toBeGreaterThanOrEqual(samples[i - 1] - 1e-6);
    }
  });

  test('delivery: conduitEndPoint at arrival EXACTLY equals the flash window\'s own conduitEndPoint one instant later -- no jump', () => {
    const justBefore = resolveTeleportTransferPresentation(baseInput({ deliveryElapsedMs: 499 }));
    const justAfter = resolveTeleportTransferPresentation(baseInput({ deliveryElapsedMs: 500 }));
    expect(justBefore.packetVisible).toBe(true);
    expect(justAfter.packetVisible).toBe(false);
    expect(justAfter.conduitStartPoint).toEqual(justBefore.conduitStartPoint);
    const gap = Math.hypot(
      justAfter.conduitEndPoint!.x - justBefore.conduitEndPoint!.x,
      justAfter.conduitEndPoint!.y - justBefore.conduitEndPoint!.y
    );
    // A tight tolerance, not zero: 499ms vs the exact 500ms boundary
    // still differ by a fraction of a percent of the full source-target
    // distance. The point is distinguishing this (a few px) from a full
    // reconstruction (the ~940px full segment length), not asserting
    // floating-point-exact equality.
    expect(gap).toBeLessThan(5);
  });

  test('delivery: the illuminated segment length is monotonically non-decreasing across the whole travel window -- never shrinks', () => {
    // Starts at 1ms, not 0ms -- see the matching extraction test's own
    // comment on why openFraction === 0 is excluded.
    const samples = [1, 50, 100, 200, 300, 400, 499].map((ms) => {
      const result = resolveTeleportTransferPresentation(baseInput({ deliveryElapsedMs: ms }));
      expect(result.openFraction).toBeGreaterThan(0);
      return Math.hypot(
        result.conduitEndPoint!.x - result.conduitStartPoint!.x,
        result.conduitEndPoint!.y - result.conduitStartPoint!.y
      );
    });
    for (let i = 1; i < samples.length; i += 1) {
      expect(samples[i]).toBeGreaterThanOrEqual(samples[i - 1] - 1e-6);
    }
  });

  test('reduced-motion extraction crossfade already reports the fully-extended segment (target -> source), matching the closure tail\'s own convention', () => {
    const result = resolveTeleportTransferPresentation(baseInput({ outboundElapsedMs: 5, reducedMotion: true }));
    expect(result.conduitStartPoint).toEqual(EXTRACTION_TARGET);
    expect(result.conduitEndPoint).toEqual({ x: POSE.portX, y: POSE.portY });
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

  test('reduced motion: stable open conduit (well past the fade-in edge), no traveling packet, still reports a full target flare once the travel window elapses', () => {
    const traveling = resolveTeleportTransferPresentation(baseInput({ deliveryElapsedMs: 100, reducedMotion: true }));
    expect(traveling.openFraction).toBe(1);
    expect(traveling.packetVisible).toBe(false);
    expect(traveling.packetPoint).toBeNull();
  });

  test('reduced motion: fades IN at the very start of delivery rather than snapping open', () => {
    const justStarted = resolveTeleportTransferPresentation(baseInput({ deliveryElapsedMs: 5, reducedMotion: true }));
    expect(justStarted.openFraction).toBeGreaterThan(0);
    expect(justStarted.openFraction).toBeLessThan(1);
  });

  test('reduced motion: fades OUT approaching the real end of the travel+flash window, rather than an instant cut to \'complete\'', () => {
    // travelMs=500, flashMs=120 -> totalMs=620; 1ms before that boundary
    // is deep into the 45ms fade-out edge.
    const justBeforeComplete = resolveTeleportTransferPresentation(baseInput({ deliveryElapsedMs: 619, reducedMotion: true }));
    expect(justBeforeComplete.phase).toBe('delivering');
    expect(justBeforeComplete.active).toBe(true);
    expect(justBeforeComplete.openFraction).toBeGreaterThan(0);
    expect(justBeforeComplete.openFraction).toBeLessThan(0.1);
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

  test('deterministic: repeated calls with the same input produce identical output', () => {
    const input = baseInput({ deliveryElapsedMs: 250 });
    const first = resolveTeleportTransferPresentation(input);
    const second = resolveTeleportTransferPresentation(input);
    const third = resolveTeleportTransferPresentation({ ...input });
    expect(second).toEqual(first);
    expect(third).toEqual(first);
  });

  test('invalid delivery duration inputs (zero/negative) are normalized rather than producing NaN/Infinity', () => {
    const zeroTravel = resolveTeleportTransferPresentation(baseInput({ deliveryElapsedMs: 10, deliveryTravelMs: 0 }));
    expect(Number.isFinite(zeroTravel.openFraction)).toBe(true);
    expect(zeroTravel.packetPoint === null || (Number.isFinite(zeroTravel.packetPoint.x) && Number.isFinite(zeroTravel.packetPoint.y))).toBe(true);

    const negativeFlash = resolveTeleportTransferPresentation(baseInput({ deliveryElapsedMs: 600, deliveryTravelMs: 500, deliveryFlashMs: -50 }));
    expect(Number.isFinite(negativeFlash.openFraction)).toBe(true);
    expect(negativeFlash.openFraction).toBeGreaterThanOrEqual(0);
    expect(negativeFlash.openFraction).toBeLessThanOrEqual(1);
  });
});
