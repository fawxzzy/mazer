import { describe, expect, test } from 'vitest';
import { EDGE_DIAMOND_FULL_SCALE, EDGE_DIAMOND_REST_SCALE } from '../../src/render/edgeBeamTimeline';
import {
  anchorStationToOuterTip,
  resolveEdgeInnerTip,
  resolveEdgeRingScales,
  resolveEdgeStations,
  resolveOrbitingEdgeStation,
  type EdgeRingLifecycle
} from '../../src/render/edgeMarkers';
import { resolveEdgeStarGrowth, resolveEdgeStarScale } from '../../src/render/edgeStarMotion';
import { resolveIntro, resolveIntroDeconstruct, resolveOutroTotalMs } from '../../src/render/introTimeline';

const TILES = 300;
const FRAME_MS = 1;

describe('edge star size curve (edgeStarMotion.ts)', () => {
  test('rest size at fill 0, full size at fill 1, monotone in between', () => {
    expect(resolveEdgeStarScale(0)).toBe(EDGE_DIAMOND_REST_SCALE);
    expect(resolveEdgeStarScale(1)).toBe(EDGE_DIAMOND_FULL_SCALE);
    let previous = resolveEdgeStarScale(0);
    for (let step = 1; step <= 1000; step += 1) {
      const value = resolveEdgeStarScale(step / 1000);
      expect(value).toBeGreaterThanOrEqual(previous);
      previous = value;
    }
  });

  test('zero slope at both ends (no kink where a fill or drain starts or ends); bad input is empty', () => {
    const h = 1e-4;
    expect((resolveEdgeStarScale(h) - resolveEdgeStarScale(0)) / h).toBeLessThan(1e-6);
    expect((resolveEdgeStarScale(1) - resolveEdgeStarScale(1 - h)) / h).toBeLessThan(1e-6);
    expect(resolveEdgeStarGrowth(Number.NaN)).toBe(0);
    expect(resolveEdgeStarScale(-3)).toBe(EDGE_DIAMOND_REST_SCALE);
    expect(resolveEdgeStarScale(7)).toBe(EDGE_DIAMOND_FULL_SCALE);
  });

  test('the steepest size change per 1 ms of a 200 ms fill is a small fraction of the size range (no pop)', () => {
    let steepest = 0;
    for (let ms = 0; ms < 200; ms += 1) {
      steepest = Math.max(steepest, Math.abs(resolveEdgeStarScale((ms + 1) / 200) - resolveEdgeStarScale(ms / 200)));
    }
    expect(steepest).toBeLessThan((EDGE_DIAMOND_FULL_SCALE - EDGE_DIAMOND_REST_SCALE) * 0.015);
  });
});

interface StarFrame {
  readonly scale: number;
  /** Where the star is drawn: its centre and its inner tip (the beam contact), after outer-tip anchoring at its current size. */
  readonly x: number;
  readonly y: number;
  readonly tipX: number;
  readonly tipY: number;
  readonly side: string;
}

/** What the scene draws for one frame, per station (mirrors drawEdgeMarkers / resolveEdgeBeams). */
const frameOf = (
  viewport: { width: number; height: number },
  lifecycle: EdgeRingLifecycle | null,
  spinRad: number
): ReadonlyArray<StarFrame> => {
  const rest = resolveEdgeStations(viewport);
  const scales = resolveEdgeRingScales(lifecycle);
  return rest.map((station, index) => {
    const placed = spinRad !== 0 ? resolveOrbitingEdgeStation(viewport, station.id, spinRad, rest) : station;
    const scale = Math.min(scales[index] as number, placed.maxScale ?? 1);
    const anchored = anchorStationToOuterTip(placed, scale);
    const tip = resolveEdgeInnerTip(placed, scale);
    return { scale, x: anchored.x, y: anchored.y, tipX: tip.x, tipY: tip.y, side: spinRad !== 0 ? placed.side : 'rest' };
  });
};

interface Sample { readonly lifecycle: EdgeRingLifecycle | null; readonly spinRad: number }

/** The outro (deconstruct), as MenuScene.resolveLegacyEdgeRing feeds it. */
const outroSample = (ms: number): Sample => {
  const outro = resolveIntroDeconstruct(ms, { reducedMotion: false, tileCount: TILES });
  return { lifecycle: { clockMs: outro.laserClockMs, direction: 'outward', ringFill: outro.ringFill }, spinRad: outro.ringSpinRad };
};

/** The intro (rebuild). The ring is back at rest with no lifecycle once the intro is done. */
const introSample = (ms: number, digitAlreadyVisible: boolean): Sample => {
  const intro = resolveIntro(ms, { reducedMotion: false, tileCount: TILES, digitAlreadyVisible });
  return intro.done
    ? { lifecycle: null, spinRad: 0 }
    : { lifecycle: { clockMs: intro.laserClockMs, direction: 'inward', ringFill: intro.ringFill }, spinRad: intro.ringSpinRad };
};

const REST_SAMPLE: Sample = { lifecycle: null, spinRad: 0 };

interface Jump {
  /** Largest size change in one frame. */
  readonly size: number;
  /** Largest on-screen speed (px per frame) of a star centre or inner tip. */
  readonly position: number;
  /**
   * Largest change of that speed from one frame to the next (px per frame^2): a pop, a cut or a start from a standstill is a spike
   * here. The orbit path turns at the screen corners and its speed in px steps with the side length (390 px wide top, 844 px tall right
   * side: that is the shipped orbit parametrisation, not part of this lane), so frames where a star changes side are not counted.
   */
  readonly kink: number;
}

/** Largest frame-to-frame change in size, in screen position (speed) and in velocity over a sequence of samples (one per FRAME_MS). */
const largestStep = (viewport: { width: number; height: number }, samples: ReadonlyArray<Sample>): Jump => {
  let size = 0;
  let position = 0;
  let kink = 0;
  let previous = frameOf(viewport, (samples[0] as Sample).lifecycle, (samples[0] as Sample).spinRad);
  let speeds: number[] = previous.flatMap(() => [0, 0]);
  let previousSideChanged: boolean[] = [];
  for (let index = 1; index < samples.length; index += 1) {
    const sample = samples[index] as Sample;
    const next = frameOf(viewport, sample.lifecycle, sample.spinRad);
    const nextSpeeds: number[] = [];
    const sideChanged: boolean[] = [];
    next.forEach((star, id) => {
      const before = previous[id] as StarFrame;
      sideChanged.push(star.side !== before.side);
      size = Math.max(size, Math.abs(star.scale - before.scale));
      const centre = Math.hypot(star.x - before.x, star.y - before.y);
      const tip = Math.hypot(star.tipX - before.tipX, star.tipY - before.tipY);
      nextSpeeds.push(centre, tip);
      position = Math.max(position, centre, tip);
    });
    if (index > 1) {
      nextSpeeds.forEach((value, k) => {
        const id = Math.floor(k / 2);
        if (!sideChanged[id] && !(previousSideChanged[id] ?? false)) {
          kink = Math.max(kink, Math.abs(value - (speeds[k] as number)));
        }
      });
    }
    speeds = nextSpeeds;
    previousSideChanged = sideChanged;
    previous = next;
  }
  return { size, position, kink };
};

const range = (from: number, to: number): number[] => Array.from({ length: Math.max(0, Math.ceil((to - from) / FRAME_MS)) }, (_, i) => from + (i * FRAME_MS));

// A pop or a cut is a size step, a speed spike or a velocity kick in one frame. Legitimate orbit travel is at most a few px per ms
// (the whole perimeter in about 4 s) and its velocity changes by hundredths of a px per ms.
const MAX_SIZE_STEP = (EDGE_DIAMOND_FULL_SCALE - EDGE_DIAMOND_REST_SCALE) * 0.02;
const MAX_POSITION_STEP_PX = 4;
const MAX_KINK_PX = 0.15;

describe.each([
  { width: 390, height: 844 },
  { width: 360, height: 780 },
  { width: 1280, height: 720 }
])('no discontinuity in size or position, viewport $width x $height', (viewport) => {
  const outroMs = resolveOutroTotalMs(TILES);
  const outro = range(-50, outroMs + 300).map(outroSample);
  const introDone = 9000;
  const intro = range(-50, introDone).map((ms) => introSample(Math.max(0, ms), true));

  test('departure: from rest through the fill, full, the orbit and the end of the outro', () => {
    const jump = largestStep(viewport, [REST_SAMPLE, ...outro]);
    expect(jump.size).toBeLessThan(MAX_SIZE_STEP);
    expect(jump.position).toBeLessThan(MAX_POSITION_STEP_PX);
    expect(jump.kink).toBeLessThan(MAX_KINK_PX);
  });

  test('level change: the end of the outro into the start of the rebuild (full ring held across the seam)', () => {
    const jump = largestStep(viewport, [...outro.slice(-300), ...intro]);
    expect(jump.size).toBeLessThan(MAX_SIZE_STEP);
    expect(jump.position).toBeLessThan(MAX_POSITION_STEP_PX);
    expect(jump.kink).toBeLessThan(MAX_KINK_PX);
  });

  test('rebuild: orbit, parked ring, drain, and the teardown of the ring back to rest', () => {
    const jump = largestStep(viewport, [...intro, REST_SAMPLE, REST_SAMPLE]);
    expect(jump.size).toBeLessThan(MAX_SIZE_STEP);
    expect(jump.position).toBeLessThan(MAX_POSITION_STEP_PX);
    expect(jump.kink).toBeLessThan(MAX_KINK_PX);
  });

  test('cold start: rest -> charge-up -> rebuild -> rest', () => {
    const cold = range(-50, introDone).map((ms) => introSample(Math.max(0, ms), false));
    const jump = largestStep(viewport, [REST_SAMPLE, ...cold, REST_SAMPLE]);
    expect(jump.size).toBeLessThan(MAX_SIZE_STEP);
    expect(jump.position).toBeLessThan(MAX_POSITION_STEP_PX);
    expect(jump.kink).toBeLessThan(MAX_KINK_PX);
  });

  test('the orbit starts and ends from a standstill: the first and last orbit frames move almost nothing', () => {
    const spinning = outro.filter((sample) => sample.spinRad !== 0);
    expect(spinning.length).toBeGreaterThan(100);
    const before = (sample: Sample): ReadonlyArray<StarFrame> => frameOf(viewport, sample.lifecycle, sample.spinRad);
    const startA = before(outro[outro.indexOf(spinning[0] as Sample) - 1] as Sample);
    const startB = before(spinning[0] as Sample);
    const startC = before(spinning[3] as Sample);
    startB.forEach((star, id) => {
      expect(Math.hypot(star.x - (startA[id] as StarFrame).x, star.y - (startA[id] as StarFrame).y)).toBeLessThan(0.05);
      expect(Math.hypot(star.tipX - (startC[id] as StarFrame).tipX, star.tipY - (startC[id] as StarFrame).tipY)).toBeLessThan(0.5);
    });
    const last = spinning.length - 1;
    const endA = before(spinning[last] as Sample);
    const endB = before(outro[outro.indexOf(spinning[last] as Sample) + 1] as Sample);
    endA.forEach((star, id) => {
      expect(Math.hypot(star.x - (endB[id] as StarFrame).x, star.y - (endB[id] as StarFrame).y)).toBeLessThan(0.5);
    });
  });

  test('the first frame of the cycle is the rest layout exactly, and the intro ends with no lifecycle', () => {
    const rest = frameOf(viewport, null, 0);
    const first = frameOf(viewport, outro[0]!.lifecycle, outro[0]!.spinRad);
    first.forEach((star, id) => {
      expect(star.scale).toBe((rest[id] as StarFrame).scale);
      expect(star.x).toBeCloseTo((rest[id] as StarFrame).x, 9);
      expect(star.tipX).toBeCloseTo((rest[id] as StarFrame).tipX, 9);
    });
    expect(introSample(introDone, true).lifecycle).toBeNull();
  });

  test('a full star is exactly full size for the whole time it is full (VIS-060: full-size stars stay full size)', () => {
    const fullFrom = outro.findIndex((sample) => resolveEdgeRingScales(sample.lifecycle).every((scale) => scale === EDGE_DIAMOND_FULL_SCALE));
    expect(fullFrom).toBeGreaterThan(0);
    for (const sample of outro.slice(fullFrom)) {
      expect(resolveEdgeRingScales(sample.lifecycle).every((scale) => scale === EDGE_DIAMOND_FULL_SCALE)).toBe(true);
    }
  });
});

describe('orbit start: the narrow-phone corner size cap eases in, it does not step', () => {
  test('a star leaving its capped corner changes its size cap smoothly with the orbit phase', () => {
    const viewport = { width: 360, height: 780 };
    const rest = resolveEdgeStations(viewport);
    const cap = Math.min(1, rest[0]?.maxScale ?? 1);
    expect(cap).toBeLessThan(1);
    for (const phase of [1e-4, 1e-3, 1e-2, 0.05]) {
      const placed = resolveOrbitingEdgeStation(viewport, 0, phase, rest);
      const size = Math.min(1, placed.maxScale ?? 1);
      // The cap leaves its corner value continuously: the change is proportional to how far the orbit has turned.
      expect(Math.abs(size - cap)).toBeLessThan(2 * phase);
    }
  });
});
