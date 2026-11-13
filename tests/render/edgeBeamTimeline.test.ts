import { describe, expect, test } from 'vitest';
import {
  EDGE_BEAM_COUNT,
  EDGE_BEAM_FLIGHT_MS,
  EDGE_BEAM_PULSE_MS,
  inverseSmoothstep,
  resolveBeamHead,
  resolveBeamHeadFromMaster,
  resolveBeamTail,
  resolveBeamTimes,
  resolveDiamondDrainFromOutgoing,
  resolveDiamondFillFromIncoming,
  resolveEdgeBeamPulse,
  resolveEdgeDiamondFills,
  resolveMasterLaserProgress
} from '../../src/render/edgeBeamTimeline';
import {
  INTRO_BEAM_STAGGER_MS,
  INTRO_LASER_MS,
  INTRO_POP_MS,
  OUTRO_LASER_MS,
  resolveIntro,
  resolveIntroDeconstruct,
  resolveIntroDoneMs,
  resolveIntroInputUnlockMs,
  resolveIntroLaserEndMs,
  resolveIntroLaserStartMs,
  resolveOutroTotalMs,
  resolveSpawnLaser
} from '../../src/render/introTimeline';
import { MOTION_DURATION_MS, MOTION_EASING, MOTION_REDUCED_MS } from '../../src/render/motionScale';

const INDEXES = Array.from({ length: EDGE_BEAM_COUNT }, (_, index) => index);

/** The head formula exactly as it shipped before MAZER-VIS-030 (edgeMarkers.resolveEdgeBeamProgress). */
const shippedHead = (laserProgress: number, index: number, count = 8): number => {
  const stagger = INTRO_BEAM_STAGGER_MS / INTRO_LASER_MS;
  const offset = count > 1 ? (Math.max(0, Math.min(count - 1, index)) / (count - 1)) * stagger : 0;
  const local = (laserProgress - offset) / (1 - stagger);
  return Math.max(0, Math.min(1, local));
};

describe('edge beam timeline: constants and the shipped head flight', () => {
  test('flight and pulse are the shipped laser length and one base step; nothing else moved', () => {
    expect(EDGE_BEAM_FLIGHT_MS).toBe(INTRO_LASER_MS);
    expect(EDGE_BEAM_FLIGHT_MS).toBe(OUTRO_LASER_MS);
    expect(EDGE_BEAM_PULSE_MS).toBe(MOTION_DURATION_MS.base);
    expect(EDGE_BEAM_PULSE_MS).toBe(MOTION_REDUCED_MS.crossfade);
  });

  test('the master progress is the shipped smoothstep laser, and each head is the shipped staggered remap of it', () => {
    for (let clock = -50; clock <= 500; clock += 3) {
      const shippedMaster = resolveSpawnLaser(clock).laserProgress;
      expect(resolveMasterLaserProgress(clock)).toBeCloseTo(shippedMaster, 12);
      for (const index of INDEXES) {
        expect(resolveBeamHead(clock, index)).toBeCloseTo(shippedHead(shippedMaster, index), 12);
        expect(resolveBeamHeadFromMaster(shippedMaster, index)).toBe(shippedHead(shippedMaster, index));
      }
    }
  });

  test('inverseSmoothstep inverts the flight curve', () => {
    for (let x = 0; x <= 1; x += 0.01) {
      expect(inverseSmoothstep(MOTION_EASING.smoothstep(x))).toBeCloseTo(x, 9);
    }
    expect(inverseSmoothstep(0)).toBe(0);
    expect(inverseSmoothstep(1)).toBe(1);
  });
});

describe('edge beam timeline: exact contact and release instants', () => {
  test.each(INDEXES)('beam %i: head is 0 until launch, exactly 1 at contact, and the tail lags by exactly one pulse', (index) => {
    const times = resolveBeamTimes(index);
    expect(times.launchMs).toBeGreaterThanOrEqual(0);
    expect(times.contactMs).toBeLessThanOrEqual(EDGE_BEAM_FLIGHT_MS + 1e-9);
    expect(times.contactMs).toBeGreaterThan(times.launchMs);
    expect(resolveBeamHead(times.launchMs - 0.5, index)).toBe(0);
    expect(resolveBeamHead(times.launchMs, index)).toBeCloseTo(0, 9);
    expect(resolveBeamHead(times.launchMs + 0.5, index)).toBeGreaterThan(0);
    expect(resolveBeamHead(times.contactMs - 0.5, index)).toBeLessThan(1);
    expect(resolveBeamHead(times.contactMs, index)).toBeCloseTo(1, 9);
    expect(resolveBeamHead(times.contactMs + 100, index)).toBe(1);
    expect(times.tailLeavesMs).toBeCloseTo(times.launchMs + EDGE_BEAM_PULSE_MS, 12);
    expect(times.tailArrivesMs).toBeCloseTo(times.contactMs + EDGE_BEAM_PULSE_MS, 12);
    expect(resolveBeamTail(times.tailLeavesMs - 0.5, index)).toBe(0);
    expect(resolveBeamTail(times.tailLeavesMs + 0.5, index)).toBeGreaterThan(0);
    expect(resolveBeamTail(times.tailArrivesMs, index)).toBeCloseTo(1, 9);
    for (let clock = -100; clock <= 900; clock += 5) {
      expect(resolveBeamTail(clock, index)).toBeLessThanOrEqual(resolveBeamHead(clock, index) + 1e-12);
    }
  });

  test('the beams are staggered by at most 60 ms and the last head lands exactly at the end of the laser', () => {
    const times = INDEXES.map((index) => resolveBeamTimes(index));
    expect(times[0]!.launchMs).toBe(0);
    expect(Math.max(...times.map((time) => time.contactMs))).toBeCloseTo(EDGE_BEAM_FLIGHT_MS, 9);
    expect(times[7]!.contactMs).toBeCloseTo(EDGE_BEAM_FLIGHT_MS, 9);
    // contact is monotonic over the ring
    for (let index = 1; index < 8; index += 1) {
      expect(times[index]!.contactMs).toBeGreaterThan(times[index - 1]!.contactMs);
      expect(times[index]!.launchMs).toBeGreaterThan(times[index - 1]!.launchMs);
    }
    expect(INTRO_BEAM_STAGGER_MS).toBeLessThanOrEqual(60);
  });
});

describe('edge beam timeline: diamond fill (incoming beam)', () => {
  test.each(INDEXES)('diamond %i: fill is 0 before contact, starts at exactly the contact instant, rises linearly, is 1 when the beam is absorbed', (index) => {
    const times = resolveBeamTimes(index);
    expect(resolveDiamondFillFromIncoming(-10, index)).toBe(0);
    expect(resolveDiamondFillFromIncoming(times.contactMs - 0.001, index)).toBe(0);
    expect(resolveDiamondFillFromIncoming(times.contactMs, index)).toBe(0);
    expect(resolveDiamondFillFromIncoming(times.contactMs + 1, index)).toBeCloseTo(1 / EDGE_BEAM_PULSE_MS, 12);
    expect(resolveDiamondFillFromIncoming(times.contactMs + (EDGE_BEAM_PULSE_MS / 2), index)).toBeCloseTo(0.5, 12);
    expect(resolveDiamondFillFromIncoming(times.tailArrivesMs, index)).toBeCloseTo(1, 12);
    expect(resolveDiamondFillFromIncoming(times.tailArrivesMs + 0.001, index)).toBe(1);
    expect(resolveDiamondFillFromIncoming(times.tailArrivesMs + 5000, index)).toBe(1);
    // The beam is at the diamond when the fill starts: head is the whole path at contact.
    expect(resolveEdgeBeamPulse('outward', times.contactMs, index).head).toBeCloseTo(1, 9);
    expect(resolveEdgeBeamPulse('outward', times.contactMs - 1, index).head).toBeLessThan(1);
    // The beam is fully absorbed (tail at the diamond) when the fill is full.
    expect(resolveEdgeBeamPulse('outward', times.tailArrivesMs, index).tail).toBeCloseTo(1, 9);
    expect(resolveEdgeBeamPulse('outward', times.tailArrivesMs - 1, index).tail).toBeLessThan(1);
  });

  test('fill is monotonic and continuous (no step bigger than one ms of the linear ramp) for every diamond', () => {
    for (const index of INDEXES) {
      let previous = 0;
      for (let clock = -100; clock <= 1000; clock += 1) {
        const fill = resolveEdgeBeamPulse('outward', clock, index).diamondFill;
        expect(fill).toBeGreaterThanOrEqual(previous - 1e-12);
        expect(fill - previous).toBeLessThanOrEqual((1 / EDGE_BEAM_PULSE_MS) + 1e-9);
        previous = fill;
      }
      expect(previous).toBe(1);
    }
  });
});

describe('edge beam timeline: diamond drain (outgoing beam)', () => {
  test.each(INDEXES)('diamond %i: stays full until the exact release instant, drains linearly, is empty once the beam has left', (index) => {
    const times = resolveBeamTimes(index);
    expect(resolveEdgeBeamPulse('inward', -500, index).diamondFill).toBe(1);
    expect(resolveEdgeBeamPulse('inward', times.launchMs - 0.001, index).diamondFill).toBe(1);
    expect(resolveEdgeBeamPulse('inward', times.launchMs, index).diamondFill).toBe(1);
    expect(resolveEdgeBeamPulse('inward', times.launchMs + 1, index).diamondFill).toBeCloseTo(1 - (1 / EDGE_BEAM_PULSE_MS), 12);
    expect(resolveEdgeBeamPulse('inward', times.launchMs + (EDGE_BEAM_PULSE_MS / 2), index).diamondFill).toBeCloseTo(0.5, 12);
    expect(resolveEdgeBeamPulse('inward', times.tailLeavesMs, index).diamondFill).toBeCloseTo(0, 12);
    expect(resolveEdgeBeamPulse('inward', times.tailLeavesMs + 0.001, index).diamondFill).toBe(0);
    expect(resolveEdgeBeamPulse('inward', times.tailLeavesMs + 5000, index).diamondFill).toBe(0);
    // The beam leaves exactly when the drain starts (head is still 0 at the release instant, > 0 right after) ...
    expect(resolveDiamondDrainFromOutgoing(times.launchMs, index)).toBe(0);
    expect(resolveBeamHead(times.launchMs + 0.5, index)).toBeGreaterThan(0);
    // ... and the diamond is empty exactly when the tail leaves it.
    expect(resolveBeamTail(times.tailLeavesMs - 0.5, index)).toBe(0);
    expect(resolveBeamTail(times.tailLeavesMs + 0.5, index)).toBeGreaterThan(0);
  });

  test('drain is monotonic and continuous, and scales with the charge the ring had', () => {
    for (const index of INDEXES) {
      let previous = 1;
      for (let clock = -100; clock <= 1000; clock += 1) {
        const fill = resolveEdgeBeamPulse('inward', clock, index).diamondFill;
        expect(fill).toBeLessThanOrEqual(previous + 1e-12);
        expect(previous - fill).toBeLessThanOrEqual((1 / EDGE_BEAM_PULSE_MS) + 1e-9);
        previous = fill;
      }
      expect(previous).toBe(0);
      expect(resolveEdgeBeamPulse('inward', -1, index, 8, 0.4).diamondFill).toBeCloseTo(0.4, 12);
    }
    expect(resolveEdgeDiamondFills('inward', -1)).toEqual(Array.from({ length: 8 }, () => 1));
    expect(resolveEdgeDiamondFills('outward', -1)).toEqual(Array.from({ length: 8 }, () => 0));
  });
});

describe('edge beam timeline: the cycle and gameplay timing', () => {
  const TILES = 300;

  test('input unlock and the total transfer durations are unchanged (heads land on the shipped schedule, tails end inside the landing pop)', () => {
    const buildEnd = 100 + 3200;
    expect(resolveIntroLaserStartMs(TILES)).toBe(buildEnd);
    expect(resolveIntroLaserEndMs(TILES)).toBe(buildEnd + 400);
    expect(resolveIntroInputUnlockMs(false, TILES)).toBe(buildEnd + 400);
    expect(resolveIntroDoneMs(TILES)).toBe(buildEnd + 400 + 350);
    expect(resolveOutroTotalMs(TILES)).toBe(400 + 3000 + 300);
    // The tail of the last beam lands one pulse after its head, inside the 350 ms landing pop that already follows it.
    const lastTailMs = Math.max(...INDEXES.map((index) => resolveBeamTimes(index).tailArrivesMs));
    expect(lastTailMs).toBeCloseTo(EDGE_BEAM_FLIGHT_MS + EDGE_BEAM_PULSE_MS, 9);
    expect(lastTailMs).toBeLessThan(INTRO_LASER_MS + INTRO_POP_MS);
    // The input unlock is the head landing, not the tail: the intro state unlocks at exactly the shipped instant.
    expect(resolveIntro(buildEnd + 399, { reducedMotion: false, tileCount: TILES }).inputUnlocked).toBe(false);
    expect(resolveIntro(buildEnd + 400, { reducedMotion: false, tileCount: TILES }).inputUnlocked).toBe(true);
  });

  test('the states expose the same clock the laser progress is a function of', () => {
    const options = { reducedMotion: false, tileCount: TILES } as const;
    const launch = resolveIntroLaserStartMs(TILES);
    for (const clock of [-5, 0, 37, 200, 399, 400, 600]) {
      const intro = resolveIntro(launch + clock, options);
      expect(intro.laserClockMs).toBe(clock);
      if (clock >= 0 && clock <= 400) {
        expect(intro.laserProgress).toBeCloseTo(resolveMasterLaserProgress(clock), 12);
      }
    }
    for (const clock of [0, 37, 200, 400]) {
      const outro = resolveIntroDeconstruct(clock, options);
      expect(outro.laserClockMs).toBe(clock);
      expect(outro.laserProgress).toBeCloseTo(resolveMasterLaserProgress(clock), 12);
    }
  });

  test('a full cycle returns to rest: full after the deconstruct, empty after the build, parked on the rest layout at both ends', () => {
    const options = { reducedMotion: false, tileCount: TILES, digitAlreadyVisible: true } as const;
    const outroEnd = resolveOutroTotalMs(TILES);
    const outro = resolveIntroDeconstruct(outroEnd, options);
    expect(outro.ringSpinRad).toBe(0);
    expect(resolveEdgeDiamondFills('outward', outro.laserClockMs).every((fill) => fill === 1)).toBe(true);
    const intro = resolveIntro(resolveIntroDoneMs(TILES), options);
    expect(intro.done).toBe(true);
    expect(intro.ringSpinRad).toBe(0);
    expect(resolveEdgeDiamondFills('inward', intro.laserClockMs, intro.ringFill).every((fill) => fill === 0)).toBe(true);
  });
});
