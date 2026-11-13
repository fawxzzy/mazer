/**
 * The edge-beam pulse timeline (MAZER-VIS-030): ONE pure clock-to-state map for every laser that flies between the
 * player/maze and the eight edge diamonds, and for how full each diamond is.
 *
 * Owner spec: the colour inside a diamond FILLS as the incoming laser contacts and enters it, then DRAINS as the
 * outgoing laser shoots out of it, with the timing exact on contact.
 *
 * Model. A beam is a PULSE, a head and a tail on its path (0 = source, 1 = target), both riding the SAME flight
 * curve; the tail simply runs `EDGE_BEAM_PULSE_MS` behind the head:
 *
 *   head(c) = flight(c)                tail(c) = flight(c - EDGE_BEAM_PULSE_MS)
 *
 * so the pulse is a rigid-in-time packet of `EDGE_BEAM_PULSE_MS` of energy. That one rule gives both halves:
 *
 *   incoming  (player -> diamond, the deconstruct): the head CONTACTS the diamond at `contactMs`; the packet then
 *             pours in while the tail runs the rest of the way, so fill = (c - contactMs) / PULSE, exactly 0 at
 *             contact and exactly 1 when the tail arrives (`contactMs + PULSE`), the beam fully absorbed.
 *   outgoing  (diamond -> maze, the build): the head LEAVES the diamond at `launchMs`; the diamond empties as the
 *             packet streams out, so drain = (c - launchMs) / PULSE, exactly 0 at release and exactly 1 when the
 *             tail has left (`launchMs + PULSE`): the diamond is empty, the beam fully gone from it.
 *
 * Where the colour sits is geometry, not timing (edgeBeamArt.ts `resolveDiamondFillShape`): it is always anchored at the
 * diamond's INNER tip. A rising fill grows from the inner tip outward; a falling fill retreats the same way back, so the
 * colour leaves from the OUTER tip first and the last of it exits at the inner tip, toward where the outgoing beam goes.
 *
 * `c` is the master laser clock in ms (the same clock `laserProgress = smoothstep(c / EDGE_BEAM_FLIGHT_MS)` is a
 * function of). The head keeps the exact shipped flight: `resolveBeamHeadFromMaster` is the pre-VIS-030
 * `resolveEdgeBeamProgress` (staggered by at most INTRO_BEAM_STAGGER_MS across the ring, every head still lands by
 * EDGE_BEAM_FLIGHT_MS), so the landing instant, the input unlock and the total transfer duration do not move. Only
 * the TAIL (and with it the fill/drain) runs past the landing, inside the 350 ms landing pop that already follows it.
 *
 * Reduced motion: no travelling beam and no pulse. The diamonds crossfade over MOTION_REDUCED_MS.crossfade instead
 * (introTimeline.ts `ringFill`): fill collapses to its end state as an alpha ramp, drain likewise.
 *
 * No Phaser, DOM, randomness or wall-clock dependency.
 */
import { INTRO_BEAM_STAGGER_MS, INTRO_LASER_MS } from './introTimeline';
import { MOTION_DURATION_MS, MOTION_EASING } from './motionScale';

/** Head flight time (launch of the master clock to the last head landing). Equal to the shipped laser length. */
export const EDGE_BEAM_FLIGHT_MS = INTRO_LASER_MS;
/** How far the tail runs behind the head, and so how long a diamond takes to fill or drain: one base step. */
export const EDGE_BEAM_PULSE_MS = MOTION_DURATION_MS.base;
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

/** Tail position 0..1: the head's own curve, `EDGE_BEAM_PULSE_MS` later. */
export const resolveBeamTail = (clockMs: number, index: number, count = EDGE_BEAM_COUNT): number => (
  resolveBeamHead((Number.isFinite(clockMs) ? clockMs : 0) - EDGE_BEAM_PULSE_MS, index, count)
);

export interface EdgeBeamTimes {
  /** Master-clock ms at which the head leaves its source (head > 0 afterwards). */
  readonly launchMs: number;
  /** Master-clock ms at which the head reaches its target (head === 1). */
  readonly contactMs: number;
  /** Master-clock ms at which the tail leaves the source (outgoing: the diamond is empty). */
  readonly tailLeavesMs: number;
  /** Master-clock ms at which the tail reaches the target (incoming: the diamond is full, the beam gone). */
  readonly tailArrivesMs: number;
}

/** The exact instants of one beam. Closed form (the inverse of the shared flight curve), not sampled. */
export const resolveBeamTimes = (index: number, count = EDGE_BEAM_COUNT): EdgeBeamTimes => {
  const offset = beamOffset(index, count);
  const launchMs = EDGE_BEAM_FLIGHT_MS * inverseSmoothstep(offset);
  const contactMs = EDGE_BEAM_FLIGHT_MS * inverseSmoothstep(offset + (1 - staggerFraction()));
  return {
    launchMs,
    contactMs,
    tailLeavesMs: launchMs + EDGE_BEAM_PULSE_MS,
    tailArrivesMs: contactMs + EDGE_BEAM_PULSE_MS
  };
};

export type EdgeBeamDirection = 'inward' | 'outward';

/**
 * Diamond fill 0..1 caused by the INCOMING beam (outward direction, player -> diamond): 0 before contact, rising
 * linearly from exactly `contactMs`, exactly 1 at `tailArrivesMs` and after.
 */
export const resolveDiamondFillFromIncoming = (clockMs: number, index: number, count = EDGE_BEAM_COUNT): number => {
  const { contactMs } = resolveBeamTimes(index, count);
  return clampUnit(((Number.isFinite(clockMs) ? clockMs : 0) - contactMs) / EDGE_BEAM_PULSE_MS);
};

/**
 * Diamond drain 0..1 caused by the OUTGOING beam (inward direction, diamond -> maze): 0 until exactly `launchMs`,
 * rising linearly, exactly 1 at `tailLeavesMs` and after (the diamond is empty).
 */
export const resolveDiamondDrainFromOutgoing = (clockMs: number, index: number, count = EDGE_BEAM_COUNT): number => {
  const { launchMs } = resolveBeamTimes(index, count);
  return clampUnit(((Number.isFinite(clockMs) ? clockMs : 0) - launchMs) / EDGE_BEAM_PULSE_MS);
};

export interface EdgeBeamPulse {
  readonly direction: EdgeBeamDirection;
  /** 0..1 along source -> target. */
  readonly head: number;
  readonly tail: number;
  /** True while any part of the pulse is on the path: head has left AND tail has not arrived. */
  readonly visible: boolean;
  /** True from the instant the head touches the target (incoming: contact; outgoing: the head has landed). */
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
  const tail = resolveBeamTail(clock, index, count);
  const visible = head > VISIBLE_EPSILON && tail < 1 - VISIBLE_EPSILON;
  if (direction === 'outward') {
    return {
      direction,
      head,
      tail,
      visible,
      headLanded: head >= 1,
      diamondFill: resolveDiamondFillFromIncoming(clock, index, count)
    };
  }
  return {
    direction,
    head,
    tail,
    visible,
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
