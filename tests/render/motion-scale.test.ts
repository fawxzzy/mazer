import { describe, expect, it } from 'vitest';
import {
  MOTION_DURATION_MS,
  MOTION_DURATION_STEPS_MS,
  MOTION_EASING,
  MOTION_LOOP_MS,
  MOTION_PHASER_EASE_SINE_IN_OUT,
  MOTION_REDUCED_MS,
  MOTION_STAGGER_BEAM_TOTAL_MS,
  isMotionBeatHarmonic,
  motionLoopPhase,
  nearestMotionDurationStepMs
} from '../../src/render/motionScale';
import { EDGE_MARKER_FLASH_MS, EDGE_MARKER_IDLE_PERIOD_MS } from '../../src/render/edgeMarkers';
import {
  INTRO_BEAM_STAGGER_MS,
  INTRO_DIGIT_IN_MS,
  INTRO_LASER_MS,
  INTRO_REDUCED_MOTION_MS,
  OUTRO_DIGIT_IN_MS,
  OUTRO_HANDOFF_MS,
  OUTRO_LASER_MS,
  OUTRO_REDUCED_MOTION_MS,
  easeOutCubic
} from '../../src/render/introTimeline';
import { IRIDESCENT_TRAIL_SWEEP_PERIOD_MS } from '../../src/render/trailPalette';
import { LEGACY_PLAYER_TRANSFER_SWIRL_PERIOD_MS } from '../../src/legacy-runtime/legacyPlayerTransfer';
import {
  TELEPORT_TRANSFER_EXTRACTION_REDUCED_MOTION_CROSSFADE_MS,
  TELEPORT_TRANSFER_REDUCED_MOTION_FADE_EDGE_MS
} from '../../src/render/teleportTransferPresentation';

describe('motion scale', () => {
  it('pins the shipped values (no retune)', () => {
    expect(MOTION_DURATION_MS).toEqual({ fast: 120, base: 200, slow: 300, long: 400, reveal: 700 });
    expect(MOTION_LOOP_MS).toEqual({ beat: 1200, blink: 2400, drift: 3600 });
    expect(MOTION_REDUCED_MS).toEqual({ crossfade: 200, teleportCrossfade: 200, teleportFadeEdge: 45 });
    // MOTION-005: the one reduced-motion crossfade length sits on the duration ladder (the base step).
    expect(MOTION_REDUCED_MS.crossfade).toBe(MOTION_DURATION_MS.base);
    expect(MOTION_STAGGER_BEAM_TOTAL_MS).toBe(60);
  });

  it('keeps every loop a whole harmonic of the beat and the ladder ascending', () => {
    for (const period of Object.values(MOTION_LOOP_MS)) expect(isMotionBeatHarmonic(period)).toBe(true);
    expect(isMotionBeatHarmonic(3000)).toBe(false);
    expect(isMotionBeatHarmonic(Number.NaN)).toBe(false);
    expect([...MOTION_DURATION_STEPS_MS]).toEqual([120, 200, 300, 400, 700]);
  });

  it('migrated constants equal their old literals', () => {
    expect([INTRO_DIGIT_IN_MS, INTRO_LASER_MS, INTRO_BEAM_STAGGER_MS, INTRO_REDUCED_MOTION_MS]).toEqual([200, 400, 60, 200]);
    expect([OUTRO_LASER_MS, OUTRO_DIGIT_IN_MS, OUTRO_HANDOFF_MS, OUTRO_REDUCED_MOTION_MS]).toEqual([400, 300, 300, 200]);
    expect([EDGE_MARKER_FLASH_MS, EDGE_MARKER_IDLE_PERIOD_MS, IRIDESCENT_TRAIL_SWEEP_PERIOD_MS]).toEqual([120, 3600, 3600]);
    expect(LEGACY_PLAYER_TRANSFER_SWIRL_PERIOD_MS).toBe(1200);
    expect(TELEPORT_TRANSFER_EXTRACTION_REDUCED_MOTION_CROSSFADE_MS).toBe(200);
    // One crossfade length, shared by intro, outro and teleport.
    expect(new Set([INTRO_REDUCED_MOTION_MS, OUTRO_REDUCED_MOTION_MS, TELEPORT_TRANSFER_EXTRACTION_REDUCED_MOTION_CROSSFADE_MS]).size).toBe(1);
    expect(TELEPORT_TRANSFER_REDUCED_MOTION_FADE_EDGE_MS).toBe(45);
    expect(easeOutCubic).toBe(MOTION_EASING.easeOutCubic);
    expect(MOTION_PHASER_EASE_SINE_IN_OUT).toBe('Sine.easeInOut');
  });

  it('snaps to the nearest step and wraps loop phase', () => {
    expect(nearestMotionDurationStepMs(110)).toBe(120);
    expect(nearestMotionDurationStepMs(160)).toBe(120);
    expect(nearestMotionDurationStepMs(250)).toBe(200);
    expect(nearestMotionDurationStepMs(350)).toBe(300);
    expect(nearestMotionDurationStepMs(Number.NaN)).toBe(120);
    expect(motionLoopPhase(1800, 1200)).toBeCloseTo(0.5, 12);
    expect(motionLoopPhase(-300, 1200)).toBeCloseTo(0.75, 12);
    expect(motionLoopPhase(5, 0)).toBe(0);
  });
});
