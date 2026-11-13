import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { resolveBleedGlowColor } from '../../src/render/bleedGlow';
import {
  BLEED_GLOW_COLOUR_RESYNC_GAP_MS,
  BLEED_GLOW_MAX_COLOUR_STEP,
  BleedGlowColourSmoother,
  limitColourStep,
  resolveBleedGlowStepLimit
} from '../../src/render/bleedGlowColourStep';
import { TRAIL_COLOUR_MAX_CORE_STEP, stepTrailColourRedraw } from '../../src/render/trailColourRedraw';

/**
 * Smoothness bound for the wrap-dock glow colour at the sheen crossing (owner 2026-11-13).
 *
 * Unit: the largest change of any 8-bit channel (0..255) of the glow core colour between two consecutive DISPLAYED
 * frames. The displayed colour only changes on a redraw, so this equals the largest per-redraw step. The bound is
 * BLEED_GLOW_MAX_COLOUR_STEP = TRAIL_COLOUR_MAX_CORE_STEP = 8 (about 3 % of the range, the long-standing core bound).
 * The "pre-fix" pipeline below paints the raw trail-head colour on the shared 33 ms schedule exactly as PR #488 did;
 * the "fixed" pipeline wraps it in BleedGlowColourSmoother exactly as MenuScene does.
 */

const channelDelta = (a: number, b: number): number => Math.max(
  Math.abs(((a >> 16) & 255) - ((b >> 16) & 255)),
  Math.abs(((a >> 8) & 255) - ((b >> 8) & 255)),
  Math.abs((a & 255) - (b & 255))
);

interface Run {
  /** Largest change between consecutive displayed frames. */
  maxFrameStep: number;
  /** Largest difference between the painted colour and the raw trail-head colour at the redraw that painted it. */
  maxLag: number;
  redraws: number;
}

/**
 * Replay a display at `hz` for `durationMs`. `redrawEveryFrame` models a moving player (the board redraws every frame);
 * otherwise only the shared colour schedule redraws. `headTilesPerSecond` moves the head along the trail.
 */
const run = (options: {
  hz: number;
  durationMs: number;
  smooth: boolean;
  animated: boolean;
  reducedMotion?: boolean;
  startDistanceTiles: number;
  headTilesPerSecond?: number;
  redrawEveryFrame?: boolean;
}): Run => {
  const frameMs = 1000 / options.hz;
  const reducedMotion = options.reducedMotion === true;
  const smoother = new BleedGlowColourSmoother();
  let nextDueAtMs = 0;
  let shown: number | null = null;
  let previousShown: number | null = null;
  const out: Run = { maxFrameStep: 0, maxLag: 0, redraws: 0 };
  for (let frame = 0; frame * frameMs <= options.durationMs; frame += 1) {
    const time = frame * frameMs;
    const raw = resolveBleedGlowColor({
      distanceTiles: options.startDistanceTiles + ((options.headTilesPerSecond ?? 0) * time) / 1000,
      timeMs: time,
      animated: options.animated
    }, time, reducedMotion);
    const step = stepTrailColourRedraw(time, nextDueAtMs, reducedMotion);
    nextDueAtMs = step.nextDueAtMs;
    if (step.due || options.redrawEveryFrame === true || shown === null) {
      shown = options.smooth ? smoother.next(raw, time) : raw;
      out.redraws += 1;
      out.maxLag = Math.max(out.maxLag, channelDelta(raw, shown));
    }
    if (previousShown !== null) out.maxFrameStep = Math.max(out.maxFrameStep, channelDelta(previousShown, shown));
    previousShown = shown;
  }
  return out;
};

/** The worst case over every phase of the 9-tile sheen spacing (the ridge crosses the head at every phase). */
const worst = (make: (startDistanceTiles: number) => Run): Run => {
  const result: Run = { maxFrameStep: 0, maxLag: 0, redraws: 0 };
  for (let distance = 0; distance < 9; distance += 0.25) {
    const r = make(distance);
    result.maxFrameStep = Math.max(result.maxFrameStep, r.maxFrameStep);
    result.maxLag = Math.max(result.maxLag, r.maxLag);
    result.redraws = r.redraws;
  }
  return result;
};

const DISPLAYS = [60, 120, 144] as const;

describe('wrap-dock glow colour step at the sheen crossing', () => {
  it('the bound is the long-standing core bound', () => {
    expect(BLEED_GLOW_MAX_COLOUR_STEP).toBe(TRAIL_COLOUR_MAX_CORE_STEP);
    expect(BLEED_GLOW_MAX_COLOUR_STEP).toBe(8);
  });

  it('PRE-FIX: the raw trail-head colour on the shared 33 ms schedule steps far past the bound at the sheen crossing', () => {
    for (const hz of DISPLAYS) {
      const pre = worst((startDistanceTiles) => run({ hz, durationMs: 8000, smooth: false, animated: true, startDistanceTiles }));
      expect(pre.maxFrameStep, `${hz} Hz`).toBeGreaterThan(BLEED_GLOW_MAX_COLOUR_STEP * 2);
    }
  });

  it('FIXED: no displayed frame changes the glow colour by more than the bound at 60, 120 and 144 Hz (idle head)', () => {
    for (const hz of DISPLAYS) {
      const fixed = worst((startDistanceTiles) => run({ hz, durationMs: 8000, smooth: true, animated: true, startDistanceTiles }));
      expect(fixed.maxFrameStep, `${hz} Hz`).toBeLessThanOrEqual(BLEED_GLOW_MAX_COLOUR_STEP);
      expect(fixed.maxFrameStep, `${hz} Hz`).toBeGreaterThan(0);
    }
  });

  it('FIXED: still within the bound while the player walks (head at 8 tiles a second, board redrawing every frame)', () => {
    for (const hz of DISPLAYS) {
      const fixed = worst((startDistanceTiles) => run({
        hz, durationMs: 4000, smooth: true, animated: true, startDistanceTiles, headTilesPerSecond: 8, redrawEveryFrame: true
      }));
      expect(fixed.maxFrameStep, `${hz} Hz`).toBeLessThanOrEqual(BLEED_GLOW_MAX_COLOUR_STEP);
    }
  });

  it('FIXED: keeps the cheap schedule (redraw count unchanged by the smoothing) and follows the trail colour closely', () => {
    for (const hz of DISPLAYS) {
      const plain = run({ hz, durationMs: 10_000, smooth: false, animated: true, startDistanceTiles: 0 });
      const fixed = run({ hz, durationMs: 10_000, smooth: true, animated: true, startDistanceTiles: 0 });
      expect(fixed.redraws).toBe(plain.redraws);
      expect(fixed.redraws / 10).toBeLessThan(31);
      // The ridge peak is shaved, never turned into a different colour: the lag stays modest.
      expect(worst((startDistanceTiles) => run({ hz, durationMs: 8000, smooth: true, animated: true, startDistanceTiles })).maxLag).toBeLessThan(60);
    }
  });

  it('the hue sweep alone is never altered: equal to the trail-head colour with Trail Shine off and under reduced motion', () => {
    for (const hz of DISPLAYS) {
      const noShine = run({ hz, durationMs: 8000, smooth: true, animated: false, startDistanceTiles: 3 });
      expect(noShine.maxLag).toBe(0);
      const reduced = run({ hz, durationMs: 8000, smooth: true, animated: true, reducedMotion: true, startDistanceTiles: 3 });
      expect(reduced.maxLag).toBe(0);
      expect(reduced.maxFrameStep).toBeGreaterThan(0); // reduced motion keeps its colour drift
      expect(reduced.maxFrameStep).toBeLessThanOrEqual(BLEED_GLOW_MAX_COLOUR_STEP);
    }
  });
});

describe('limitColourStep and BleedGlowColourSmoother', () => {
  it('returns the target when it is within the step, otherwise moves along the straight line', () => {
    expect(limitColourStep(0x102030, 0x142536, 8)).toBe(0x142536);
    const moved = limitColourStep(0x000000, 0x400020, 8); // worst channel 64: scale 1/8
    expect(moved).toBe(0x080004);
    expect(channelDelta(0x000000, moved)).toBe(8);
  });

  it('never moves any channel by more than the limit, for any target', () => {
    for (let i = 0; i < 400; i += 1) {
      const a = Math.imul(i + 1, 2654435761) & 0xffffff;
      const b = Math.imul(i + 7, 40503 * 977) & 0xffffff;
      for (const limit of [1, 3, 8]) {
        expect(channelDelta(a, limitColourStep(a, b, limit))).toBeLessThanOrEqual(limit);
      }
    }
  });

  it('scales the allowed step with the gap (same slew rate) and never above the bound', () => {
    expect(resolveBleedGlowStepLimit(33)).toBe(8);
    expect(resolveBleedGlowStepLimit(45)).toBe(8);
    expect(resolveBleedGlowStepLimit(1000)).toBe(8);
    expect(resolveBleedGlowStepLimit(16.7)).toBeLessThan(resolveBleedGlowStepLimit(33));
    expect(resolveBleedGlowStepLimit(0.1)).toBe(1);
  });

  it('starts on the target, is stable within one timestamp, ramps, and resyncs after a long gap or a clock reset', () => {
    const s = new BleedGlowColourSmoother();
    expect(s.next(0x000000, 100)).toBe(0x000000);
    expect(s.next(0xffffff, 133)).toBe(0x080808);
    expect(s.next(0x123456, 133)).toBe(0x080808); // same frame: unchanged
    expect(s.next(0xffffff, 166)).toBe(0x101010);
    expect(s.next(0xff0000, 166 + BLEED_GLOW_COLOUR_RESYNC_GAP_MS + 1)).toBe(0xff0000);
    expect(s.next(0x00ff00, 10)).toBe(0x00ff00); // clock went backwards
    expect(s.next(0x0000ff, Number.NaN)).toBe(0x0000ff);
    s.reset();
    expect(s.next(0x777777, 5)).toBe(0x777777);
  });
});

describe('MenuScene wiring (glow colour step)', () => {
  const source = readFileSync('src/scenes/MenuScene.ts', 'utf8');

  it('paints the glow through the bounded smoother, not the raw trail-head colour', () => {
    expect(source).toContain('this.bleedGlowColourSmoother.next(resolveBleedGlowColor(this.trailPaletteHead, time, this.prefersLegacyReducedMotion()), time)');
    expect(source).toContain('new BleedGlowColourSmoother()');
  });
});
