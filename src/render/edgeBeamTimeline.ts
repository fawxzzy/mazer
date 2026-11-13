/**
 * The edge-beam timeline (MAZER-VIS-030, reworked by MAZER-VIS-038): ONE pure clock-to-state map for every laser that flies
 * between the player/maze and the eight edge diamonds, for how full each diamond is, and for how big it is.
 *
 * Owner spec: the colour inside a diamond FILLS as the incoming laser contacts and enters it, then DRAINS as the outgoing
 * laser shoots out of it, with the timing exact on contact; the laser stays connected to the diamond for the WHOLE fill
 * and the WHOLE drain; the diamonds sit at half size while the maze runs, grow back to full size just before the beams
 * arrive and shrink again once they are empty.
 *
 * Beam model. A beam has a HEAD (the flight, `resolveBeamHead`) and a TAIL (`resolveBeamTail`) on its path
 * (0 = source, 1 = sink). The head is the shipped flight; the tail HOLDS at the source for as long as the diamond end is
 * still being fed or emptied, and only then retracts to the sink over EDGE_BEAM_RETRACT_MS:
 *
 *   incoming  (player -> diamond, the deconstruct): the head CONTACTS the diamond's inner tip at `contactMs` and the beam
 *             stays attached, a steady stream with a pulsing head, while the diamond fills, fill = (c - contactMs) / FILL,
 *             exactly 0 at contact and exactly 1 at `fillEndMs`. Only then does the tail leave the player and run in
 *             (`tailArrivesMs`, the beam is gone).
 *   outgoing  (diamond -> maze, the build): the head LEAVES the diamond's inner tip at `launchMs`; the tail stays on the
 *             tip while the diamond drains, drain = (c - launchMs) / DRAIN, exactly 0 at release and exactly 1 at
 *             `drainEndMs`. Only then does the tail leave the diamond and run to the spawn tile (`inwardGoneMs`).
 *
 * Both ends of a beam sit on the diamond's INNERMOST point (the tip that faces the board): see edgeMarkers.ts
 * `resolveEdgeInnerTip`. Where the colour sits inside the diamond is geometry (edgeBeamArt.ts `resolveDiamondFillShape`):
 * always anchored at the inner tip. A rising fill grows from the inner tip outward; a falling fill retreats the same way
 * back, so the colour leaves from the OUTER tip first and the last of it exits at the inner tip.
 *
 * Size cycle (MAZER-VIS-038). `EDGE_DIAMOND_REST_SCALE` (50%) is the size of a diamond while the maze runs (and at rest
 * everywhere, menu included). The scale is applied about the INNER tip (edgeMarkers.ts `anchorStationToInnerTip`), so the
 * point a beam attaches to never moves:
 *   - departure: from the goal (c = 0) each diamond grows REST -> 1 on a smoothstep and is exactly 100% at its own
 *     `contactMs`, the instant its beam touches it (it is never smaller than full while its beam is attached);
 *   - it stays 100% through the dissolve, the orbit and the build;
 *   - arrival: from `drainEndMs` (the diamond is empty) it shrinks 1 -> REST over EDGE_DIAMOND_SHRINK_MS, per diamond;
 *   - a cold start (no deconstruct before the build) grows with the ring charge (`ringFill`, the intro charges the ring
 *     over its first 400 ms) so the ring is 100% when it is full.
 * The grow window is the head flight itself (0 .. contactMs, 302 .. 400 ms), so no gameplay or unlock time moves.
 *
 * `c` is the master laser clock in ms (the same clock `laserProgress = smoothstep(c / EDGE_BEAM_FLIGHT_MS)` is a
 * function of). The head keeps the exact shipped flight: `resolveBeamHeadFromMaster` is the pre-VIS-030
 * `resolveEdgeBeamProgress` (staggered by at most INTRO_BEAM_STAGGER_MS across the ring, every head still lands by
 * EDGE_BEAM_FLIGHT_MS), so the landing instant, the input unlock and the total transfer duration do not move.
 *
 * Reduced motion: no travelling beam, no pulse and no size animation. The diamonds crossfade over
 * MOTION_REDUCED_MS.crossfade instead (introTimeline.ts `ringFill`) and stay at EDGE_DIAMOND_REST_SCALE.
 *
 * No Phaser, DOM, randomness or wall-clock dependency.
 */
import { INTRO_BEAM_PULSE_MS, INTRO_BEAM_RETRACT_MS, INTRO_BEAM_STAGGER_MS, INTRO_LASER_MS } from './introTimeline';
import { MOTION_DURATION_MS, MOTION_EASING } from './motionScale';

/** Head flight time (launch of the master clock to the last head landing). Equal to the shipped laser length. */
export const EDGE_BEAM_FLIGHT_MS = INTRO_LASER_MS;
/** How long a diamond takes to fill or drain, and so how long its beam stays attached after contact / release: one base step. */
export const EDGE_BEAM_PULSE_MS = INTRO_BEAM_PULSE_MS;
/** How long the tail takes to run from its source to its sink once the fill/drain it fed is complete. */
export const EDGE_BEAM_RETRACT_MS = INTRO_BEAM_RETRACT_MS;
/** A diamond's size while the maze runs, as a fraction of its full size (scaled about its inner tip). */
export const EDGE_DIAMOND_REST_SCALE = 0.5;
/** Full size. */
export const EDGE_DIAMOND_FULL_SCALE = 1;
/** How long an empty diamond takes to shrink back to rest size (one step slower than the fill: a calm settle). */
export const EDGE_DIAMOND_SHRINK_MS = MOTION_DURATION_MS.slow;
/** Number of diamonds the ring has. */
export const EDGE_BEAM_COUNT = 8;

const { smoothstep } = MOTION_EASING;

/** Float noise guard for the closed-form launch/contact instants (the inverse flight curve is exact to ~1e-15). */
const VISIBLE_EPSILON = 1e-9;

const clampUnit = (value: number): number => (
  Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0
);

/** Exact inverse of smoothstep on [0, 1] (the cubic 3x^2 - 2x^3). */
export const inverseSmoothstep = (value: number): number => {
  const y = clampUnit(value);
  if (y <= 0 || y >= 1) {
    return y;
  }
  return 0.5 - Math.sin(Math.asin(1 - (2 * y)) / 3);
};

/** The master laser progress for a laser clock (identical to introTimeline's `resolveSpawnLaser(c).laserProgress`). */
export const resolveMasterLaserProgress = (clockMs: number): number => (
  smoothstep(clampUnit((Number.isFinite(clockMs) ? clockMs : 0) / EDGE_BEAM_FLIGHT_MS))
);

const staggerFraction = (): number => INTRO_BEAM_STAGGER_MS / EDGE_BEAM_FLIGHT_MS;

const beamOffset = (index: number, count: number): number => (
  count > 1 ? (Math.max(0, Math.min(count - 1, index)) / (count - 1)) * staggerFraction() : 0
);

/**
 * Head position 0..1 of beam `index` of `count` from the MASTER laser progress. Staggered by at most
 * INTRO_BEAM_STAGGER_MS across the ring; every head still lands exactly when the master laser does.
 */
export const resolveBeamHeadFromMaster = (masterProgress: number, index: number, count = EDGE_BEAM_COUNT): number => {
  const stagger = staggerFraction();
  return clampUnit(((Number.isFinite(masterProgress) ? masterProgress : 0) - beamOffset(index, count)) / (1 - stagger));
};

/** Head position 0..1 of beam `index` at laser clock `clockMs`. */
export const resolveBeamHead = (clockMs: number, index: number, count = EDGE_BEAM_COUNT): number => (
  resolveBeamHeadFromMaster(resolveMasterLaserProgress(clockMs), index, count)
);

export type EdgeBeamDirection = 'inward' | 'outward';

export interface EdgeBeamTimes {
  /** Master-clock ms at which the head leaves its source (head > 0 afterwards). */
  readonly launchMs: number;
  /** Master-clock ms at which the head reaches its target (head === 1). Departure: the diamond is touched. */
  readonly contactMs: number;
  /** Departure: master-clock ms at which the diamond is full (the beam has been feeding it since `contactMs`). */
  readonly fillEndMs: number;
  /** Arrival: master-clock ms at which the diamond is empty (the beam has been draining it since `launchMs`). */
  readonly drainEndMs: number;
  /** Alias of `drainEndMs`: arrival, the instant the tail lets go of the diamond. */
  readonly tailLeavesMs: number;
  /** Departure: master-clock ms at which the tail has run in and the beam is gone (`fillEndMs` + retract). */
  readonly tailArrivesMs: number;
  /** Arrival: master-clock ms at which the tail has landed and the beam is gone (never before the head lands). */
  readonly inwardGoneMs: number;
}

/** The exact instants of one beam. Closed form (the inverse of the shared flight curve), not sampled. */
export const resolveBeamTimes = (index: number, count = EDGE_BEAM_COUNT): EdgeBeamTimes => {
  const offset = beamOffset(index, count);
  const launchMs = EDGE_BEAM_FLIGHT_MS * inverseSmoothstep(offset);
  const contactMs = EDGE_BEAM_FLIGHT_MS * inverseSmoothstep(offset + (1 - staggerFraction()));
  const fillEndMs = contactMs + EDGE_BEAM_PULSE_MS;
  const drainEndMs = launchMs + EDGE_BEAM_PULSE_MS;
  return {
    launchMs,
    contactMs,
    fillEndMs,
    drainEndMs,
    tailLeavesMs: drainEndMs,
    tailArrivesMs: fillEndMs + EDGE_BEAM_RETRACT_MS,
    inwardGoneMs: Math.max(drainEndMs + EDGE_BEAM_RETRACT_MS, contactMs)
  };
};

/**
 * Tail position 0..1 of beam `index`. It HOLDS at 0 (the source) while the diamond end is still fed or emptied, then
 * runs to the sink on a smoothstep over EDGE_BEAM_RETRACT_MS:
 *   outward (departure): from `fillEndMs` (the diamond is full);
 *   inward (arrival): from `drainEndMs` (the diamond is empty), and never ahead of the head.
 */
export const resolveBeamTail = (
  direction: EdgeBeamDirection,
  clockMs: number,
  index: number,
  count = EDGE_BEAM_COUNT
): number => {
  const clock = Number.isFinite(clockMs) ? clockMs : 0;
  const times = resolveBeamTimes(index, count);
  const releaseMs = direction === 'outward' ? times.fillEndMs : times.drainEndMs;
  const tail = smoothstep(clampUnit((clock - releaseMs) / EDGE_BEAM_RETRACT_MS));
  return direction === 'outward' ? tail : Math.min(tail, resolveBeamHead(clock, index, count));
};

/**
 * Diamond fill 0..1 caused by the INCOMING beam (outward direction, player -> diamond): 0 before contact, rising
 * linearly from exactly `contactMs`, exactly 1 at `fillEndMs` and after.
 */
export const resolveDiamondFillFromIncoming = (clockMs: number, index: number, count = EDGE_BEAM_COUNT): number => {
  const { contactMs } = resolveBeamTimes(index, count);
  return clampUnit(((Number.isFinite(clockMs) ? clockMs : 0) - contactMs) / EDGE_BEAM_PULSE_MS);
};

/**
 * Diamond drain 0..1 caused by the OUTGOING beam (inward direction, diamond -> maze): 0 until exactly `launchMs`,
 * rising linearly, exactly 1 at `drainEndMs` and after (the diamond is empty).
 */
export const resolveDiamondDrainFromOutgoing = (clockMs: number, index: number, count = EDGE_BEAM_COUNT): number => {
  const { launchMs } = resolveBeamTimes(index, count);
  return clampUnit(((Number.isFinite(clockMs) ? clockMs : 0) - launchMs) / EDGE_BEAM_PULSE_MS);
};

/**
 * Diamond size (`EDGE_DIAMOND_REST_SCALE`..`EDGE_DIAMOND_FULL_SCALE`) at laser clock `clockMs`. See the header.
 * `charge` (0..1, default 1) is the ring charge before the arrival beams leave (the cold-start intro charges the ring;
 * after a deconstruct it is 1). Departure ignores it.
 */
export const resolveEdgeDiamondScale = (
  direction: EdgeBeamDirection,
  clockMs: number,
  index: number,
  count = EDGE_BEAM_COUNT,
  charge = 1
): number => {
  const clock = Number.isFinite(clockMs) ? clockMs : 0;
  const times = resolveBeamTimes(index, count);
  const span = EDGE_DIAMOND_FULL_SCALE - EDGE_DIAMOND_REST_SCALE;
  if (direction === 'outward') {
    // Grows over the head flight itself, exactly full at the instant the beam touches the diamond.
    return EDGE_DIAMOND_REST_SCALE + (span * smoothstep(clampUnit(clock / times.contactMs)));
  }
  const shrink = smoothstep(clampUnit((clock - times.drainEndMs) / EDGE_DIAMOND_SHRINK_MS));
  return EDGE_DIAMOND_REST_SCALE + (span * Math.min(clampUnit(charge), 1 - shrink));
};

/** Ring-level scale for every diamond at laser clock `clockMs`. */
export const resolveEdgeDiamondScales = (
  direction: EdgeBeamDirection,
  clockMs: number,
  charge = 1,
  count = EDGE_BEAM_COUNT
): ReadonlyArray<number> => Array.from({ length: count }, (_, index) => (
  resolveEdgeDiamondScale(direction, clockMs, index, count, charge)
));

export interface EdgeBeamPulse {
  readonly direction: EdgeBeamDirection;
  /** 0..1 along source -> sink. */
  readonly head: number;
  readonly tail: number;
  /** True while any part of the beam is on the path: head has left AND the tail has not yet run in. */
  readonly visible: boolean;
  /** True while the beam is attached at its source end (tail still held there): the diamond is still filling / draining. */
  readonly connected: boolean;
  /** True from the instant the head touches the sink (departure: the diamond; arrival: the spawn tile). */
  readonly headLanded: boolean;
  /** Diamond fill 0..1 as this beam alone leaves it (see resolveEdgeDiamondFill for the ring-level value). */
  readonly diamondFill: number;
}

/**
 * Everything one beam shows at laser clock `clockMs`. `charge` (0..1, default 1) is how full the diamond was when an
 * OUTGOING beam leaves it (1 after a deconstruct; the cold-start ring is charged by the intro before the beams fire).
 */
export const resolveEdgeBeamPulse = (
  direction: EdgeBeamDirection,
  clockMs: number,
  index: number,
  count = EDGE_BEAM_COUNT,
  charge = 1
): EdgeBeamPulse => {
  const clock = Number.isFinite(clockMs) ? clockMs : 0;
  const head = resolveBeamHead(clock, index, count);
  const tail = resolveBeamTail(direction, clock, index, count);
  const visible = head > VISIBLE_EPSILON && tail < 1 - VISIBLE_EPSILON;
  const connected = visible && tail <= VISIBLE_EPSILON;
  if (direction === 'outward') {
    return {
      direction,
      head,
      tail,
      visible,
      connected,
      headLanded: head >= 1,
      diamondFill: resolveDiamondFillFromIncoming(clock, index, count)
    };
  }
  return {
    direction,
    head,
    tail,
    visible,
    connected,
    headLanded: head >= 1,
    diamondFill: clampUnit(charge) * (1 - resolveDiamondDrainFromOutgoing(clock, index, count))
  };
};

/** Ring-level fill 0..1 for every diamond at laser clock `clockMs`. */
export const resolveEdgeDiamondFills = (
  direction: EdgeBeamDirection,
  clockMs: number,
  charge = 1,
  count = EDGE_BEAM_COUNT
): ReadonlyArray<number> => Array.from({ length: count }, (_, index) => (
  resolveEdgeBeamPulse(direction, clockMs, index, count, charge).diamondFill
));
