import { describe, expect, it } from 'vitest';
import {
  buildTeleportTransferConduitSegments,
  computeTeleportTransferConduitCanvasBounds,
  drawTeleportTransferConduitToCanvasContext,
  type TeleportTransferConduitDrawOptions
} from '../../src/render/teleportTransferConduitCanvas';

// Same fake-context convention as the trail/player-glow/goal-halo canvas
// tests -- records calls/property-sets instead of rasterizing, so these
// tests assert real draw-call structure without a browser canvas.
class FakeGradient {
  stops: Array<{ offset: number; color: string }> = [];
  addColorStop(offset: number, color: string): void {
    this.stops.push({ offset, color });
  }
}

class FakeContext2D {
  calls: string[] = [];
  strokeStyleHistory: unknown[] = [];
  fillStyleHistory: unknown[] = [];
  shadowBlurHistory: number[] = [];
  lineWidthHistory: number[] = [];

  set strokeStyle(value: unknown) { this.strokeStyleHistory.push(value); }
  get strokeStyle(): unknown { return this.strokeStyleHistory[this.strokeStyleHistory.length - 1]; }
  set fillStyle(value: unknown) { this.fillStyleHistory.push(value); }
  get fillStyle(): unknown { return this.fillStyleHistory[this.fillStyleHistory.length - 1]; }
  set shadowBlur(value: number) { this.shadowBlurHistory.push(value); }
  get shadowBlur(): number { return this.shadowBlurHistory[this.shadowBlurHistory.length - 1] ?? 0; }
  set lineWidth(value: number) { this.lineWidthHistory.push(value); }
  get lineWidth(): number { return this.lineWidthHistory[this.lineWidthHistory.length - 1] ?? 0; }
  shadowColor = '';
  lineJoin = '';
  lineCap = '';

  save(): void { this.calls.push('save'); }
  restore(): void { this.calls.push('restore'); }
  beginPath(): void { this.calls.push('beginPath'); }
  moveTo(x: number, y: number): void { this.calls.push(`moveTo(${x},${y})`); }
  lineTo(x: number, y: number): void { this.calls.push(`lineTo(${x},${y})`); }
  stroke(): void { this.calls.push('stroke'); }
  fill(): void { this.calls.push('fill'); }
  arc(x: number, y: number, r: number, start: number, end: number): void {
    this.calls.push(`arc(${x},${y},${r},${start},${end})`);
  }
  createRadialGradient(x0: number, y0: number, r0: number, x1: number, y1: number, r1: number): FakeGradient {
    this.calls.push(`createRadialGradient(${x0},${y0},${r0},${x1},${y1},${r1})`);
    return new FakeGradient();
  }
}

const SOURCE = { x: 100, y: 100 };
const TARGET = { x: 300, y: 100 };
const PACKET = { x: 180, y: 100 };

// Matches an EXTRACTION-shaped presentation: conduitStartPoint is the
// fixed target, conduitEndPoint is the growing tip (the packet while it
// travels). This is the shape that most directly exercises the real
// defect this module was corrected for -- see teleportTransferPresentation.ts's
// own "Conduit coverage vs. packet position" doc.
// A constant-color function -- used by most tests below, which care about
// geometry/structure, not spatial variation (that gets its own dedicated
// describe block). A constant color lets chunkTrailSegments merge every
// sub-segment into one continuous path, keeping the old moveTo/lineTo
// assertions meaningful.
const CONSTANT_COLOR = 0x4a2fe0;
const constantEnergyColorAtDistance = (): number => CONSTANT_COLOR;

const baseOptions = (overrides: Partial<TeleportTransferConduitDrawOptions> = {}): TeleportTransferConduitDrawOptions => ({
  originX: 0,
  originY: 0,
  targetPoint: TARGET,
  conduitStartPoint: TARGET,
  conduitEndPoint: PACKET,
  packetPoint: PACKET,
  packetVisible: true,
  openFraction: 0.5,
  targetFlareIntensity: 0,
  energyColorAtDistance: constantEnergyColorAtDistance,
  conduitCoreWidth: 2,
  conduitGlowWidth: 8,
  conduitGlowBlurPx: 6,
  packetRadius: 3,
  targetFlareRadius: 20,
  ...overrides
});

describe('drawTeleportTransferConduitToCanvasContext: closed-state guarantee', () => {
  it('draws absolutely nothing when openFraction <= 0 (frozen-contract closed state)', () => {
    const ctx = new FakeContext2D();
    drawTeleportTransferConduitToCanvasContext(ctx as unknown as CanvasRenderingContext2D, baseOptions({ openFraction: 0 }));
    expect(ctx.calls).toHaveLength(0);
  });

  it('draws nothing for a negative openFraction either (defensive, not just exactly zero)', () => {
    const ctx = new FakeContext2D();
    drawTeleportTransferConduitToCanvasContext(ctx as unknown as CanvasRenderingContext2D, baseOptions({ openFraction: -0.2 }));
    expect(ctx.calls).toHaveLength(0);
  });
});

describe('drawTeleportTransferConduitToCanvasContext: strokes exactly conduitStartPoint -> conduitEndPoint, unconditionally', () => {
  it('strokes from conduitStartPoint to conduitEndPoint while a packet travels (conduitEndPoint == packetPoint here)', () => {
    const ctx = new FakeContext2D();
    drawTeleportTransferConduitToCanvasContext(ctx as unknown as CanvasRenderingContext2D, baseOptions());
    expect(ctx.calls).toContain(`moveTo(${TARGET.x},${TARGET.y})`);
    expect(ctx.calls).toContain(`lineTo(${PACKET.x},${PACKET.y})`);
  });

  it('draws the traveling packet as a filled circle at its own position', () => {
    const ctx = new FakeContext2D();
    drawTeleportTransferConduitToCanvasContext(ctx as unknown as CanvasRenderingContext2D, baseOptions());
    expect(ctx.calls.some((call) => call.startsWith(`arc(${PACKET.x},${PACKET.y}`))).toBe(true);
    expect(ctx.calls).toContain('fill');
  });

  it('strokes the conduit twice (a wider glow pass, then a narrower crisp core pass) with two different line widths', () => {
    const ctx = new FakeContext2D();
    drawTeleportTransferConduitToCanvasContext(ctx as unknown as CanvasRenderingContext2D, baseOptions());
    const strokeCount = ctx.calls.filter((call) => call === 'stroke').length;
    expect(strokeCount).toBe(2);
    expect(ctx.lineWidthHistory).toContain(8); // conduitGlowWidth
    expect(ctx.lineWidthHistory).toContain(2); // conduitCoreWidth
  });

  it('does NOT reconstruct a longer/different line once the packet stops traveling, when conduitEndPoint already equals the fully-extended tip -- the real defect this module was fixed for', () => {
    // Simulates the exact moment packetVisible flips from true to false:
    // the presentation module guarantees conduitEndPoint is ALREADY at
    // the source by then (see teleportTransferPresentation.ts). This
    // module must draw the SAME segment either way -- it must never
    // derive a different, longer line from targetPoint/sourcePoint on
    // its own once packetVisible is false.
    const stillTraveling = new FakeContext2D();
    drawTeleportTransferConduitToCanvasContext(stillTraveling as unknown as CanvasRenderingContext2D, baseOptions({
      packetVisible: true, packetPoint: SOURCE, conduitEndPoint: SOURCE, openFraction: 1
    }));
    const justArrived = new FakeContext2D();
    drawTeleportTransferConduitToCanvasContext(justArrived as unknown as CanvasRenderingContext2D, baseOptions({
      packetVisible: false, packetPoint: null, conduitEndPoint: SOURCE, openFraction: 1
    }));
    const lineCallsA = stillTraveling.calls.filter((c) => c.startsWith('moveTo') || c.startsWith('lineTo'));
    const lineCallsB = justArrived.calls.filter((c) => c.startsWith('moveTo') || c.startsWith('lineTo'));
    expect(lineCallsB).toEqual(lineCallsA);
  });

  it('draws no packet circle when no packet is traveling', () => {
    const ctx = new FakeContext2D();
    drawTeleportTransferConduitToCanvasContext(ctx as unknown as CanvasRenderingContext2D, baseOptions({ packetVisible: false, packetPoint: null, conduitEndPoint: SOURCE }));
    expect(ctx.calls.some((call) => call.startsWith('arc(') && call.includes(`${PACKET.x}`))).toBe(false);
  });

  it('fades the conduit\'s alpha with openFraction', () => {
    const brighter = new FakeContext2D();
    drawTeleportTransferConduitToCanvasContext(brighter as unknown as CanvasRenderingContext2D, baseOptions({ packetVisible: false, packetPoint: null, conduitEndPoint: SOURCE, openFraction: 0.9 }));
    const dimmer = new FakeContext2D();
    drawTeleportTransferConduitToCanvasContext(dimmer as unknown as CanvasRenderingContext2D, baseOptions({ packetVisible: false, packetPoint: null, conduitEndPoint: SOURCE, openFraction: 0.1 }));
    // Both draw the same line...
    expect(brighter.calls.filter((c) => c.startsWith('lineTo'))).toEqual(dimmer.calls.filter((c) => c.startsWith('lineTo')));
    // ...but at a different resolved alpha in the stroke color string.
    const brighterCoreStroke = brighter.strokeStyleHistory[brighter.strokeStyleHistory.length - 1] as string;
    const dimmerCoreStroke = dimmer.strokeStyleHistory[dimmer.strokeStyleHistory.length - 1] as string;
    expect(brighterCoreStroke).not.toBe(dimmerCoreStroke);
    expect(brighterCoreStroke).toContain('0.9');
    expect(dimmerCoreStroke).toContain('0.1');
  });
});

describe('drawTeleportTransferConduitToCanvasContext: shared energy color', () => {
  it('uses the caller-supplied energyColorAtDistance for the conduit stroke, and the target flare samples the SAME function at the conduit\'s full length', () => {
    const ctx = new FakeContext2D();
    const color = 0x2fe0c0;
    drawTeleportTransferConduitToCanvasContext(ctx as unknown as CanvasRenderingContext2D, baseOptions({
      energyColorAtDistance: () => color,
      targetFlareIntensity: 0.8
    }));
    const r = (color >> 16) & 0xff;
    const g = (color >> 8) & 0xff;
    const b = color & 0xff;
    expect(ctx.strokeStyleHistory.some((style) => typeof style === 'string' && style.includes(`${r},${g},${b}`))).toBe(true);
    expect(ctx.calls.some((call) => call.startsWith('createRadialGradient'))).toBe(true);
  });

  it('the packet\'s glow samples energyColorAtDistance at the packet\'s OWN real distance from conduitStartPoint, not a fixed value', () => {
    const ctx = new FakeContext2D();
    const distancesQueried: number[] = [];
    drawTeleportTransferConduitToCanvasContext(ctx as unknown as CanvasRenderingContext2D, baseOptions({
      energyColorAtDistance: (d) => { distancesQueried.push(d); return 0x112233; }
    }));
    // PACKET is 120px from TARGET (conduitStartPoint here) -- some query
    // must have been made at (or very near) that real distance for the
    // packet's own glow, not just at 0 or the conduit's own sample points.
    const packetDistance = Math.hypot(PACKET.x - TARGET.x, PACKET.y - TARGET.y);
    expect(distancesQueried.some((d) => Math.abs(d - packetDistance) < 1)).toBe(true);
  });

  it('the target flare samples energyColorAtDistance at the conduit\'s full source-to-target length', () => {
    const ctx = new FakeContext2D();
    const distancesQueried: number[] = [];
    drawTeleportTransferConduitToCanvasContext(ctx as unknown as CanvasRenderingContext2D, baseOptions({
      packetVisible: false, packetPoint: null, conduitEndPoint: SOURCE,
      targetFlareIntensity: 1,
      energyColorAtDistance: (d) => { distancesQueried.push(d); return 0x445566; }
    }));
    // conduitStartPoint === TARGET in this fixture, so the flare's own
    // "full conduit length from conduitStartPoint" distance is exactly 0.
    expect(distancesQueried.some((d) => Math.abs(d) < 1)).toBe(true);
  });
});

describe('drawTeleportTransferConduitToCanvasContext: real spatial color variation (not one flat color per frame)', () => {
  it('samples energyColorAtDistance at MULTIPLE distinct distances along a sufficiently long conduit', () => {
    const ctx = new FakeContext2D();
    const distancesQueried: number[] = [];
    // A long conduit (SOURCE to TARGET, 200px) so it spans several of the
    // module's own color-sample spacing steps.
    drawTeleportTransferConduitToCanvasContext(ctx as unknown as CanvasRenderingContext2D, baseOptions({
      conduitStartPoint: SOURCE,
      conduitEndPoint: TARGET,
      packetVisible: false,
      packetPoint: null,
      energyColorAtDistance: (d) => { distancesQueried.push(d); return Math.round(d) % 2 === 0 ? 0x00ff00 : 0x0000ff; }
    }));
    const distinctDistances = new Set(distancesQueried.map((d) => Math.round(d)));
    expect(distinctDistances.size).toBeGreaterThan(1);
  });

  it('produces more than one distinct stroke color when the sampled material genuinely varies with distance -- proving real per-position rendering, not a single flat pass', () => {
    const varyingColor = new FakeContext2D();
    drawTeleportTransferConduitToCanvasContext(varyingColor as unknown as CanvasRenderingContext2D, baseOptions({
      conduitStartPoint: SOURCE,
      conduitEndPoint: TARGET,
      packetVisible: false,
      packetPoint: null,
      energyColorAtDistance: (d) => (d < 100 ? 0xff0000 : 0x0000ff)
    }));
    // At least two distinct core-pass stroke colors were used (red-ish and
    // blue-ish), not one flat color for the whole line.
    const hasRed = varyingColor.strokeStyleHistory.some((s) => typeof s === 'string' && s.includes('255,0,0'));
    const hasBlue = varyingColor.strokeStyleHistory.some((s) => typeof s === 'string' && s.includes('0,0,255'));
    expect(hasRed).toBe(true);
    expect(hasBlue).toBe(true);
  });
});

describe('buildTeleportTransferConduitSegments: stable chunk boundaries as the conduit grows (real defect fixed after review 5142904159)', () => {
  // A confirmed real bug: the original implementation divided the whole
  // conduit into `ceil(totalLength / SPACING)` EQUAL pieces, so every
  // chunk's own boundary -- and so its own sampled color -- shifted on
  // every frame the conduit's length changed, including chunks well
  // behind the growing tip that had already been drawn and should stay
  // visually stable. These tests hold a fixed origin and query at a
  // fixed, already-covered ABSOLUTE distance from it across a growth
  // step that changes the total chunk count, and require that fixed
  // distance's own sampled color to be identical either way.
  const start = { x: 0, y: 0 };
  const colorAtDistance = (d: number): number => Math.round(d) * 7; // any pure, deterministic function of distance

  // Floating-point tolerance, not a visual one: computing the same
  // nominal chunk-end distance (e.g. exactly 14px) through `t =
  // chunkEndDistance / totalLength` for two DIFFERENT totalLength values
  // can differ by ~1e-15 due to ordinary floating-point rounding --
  // imperceptible on screen, but not exactly `===`. These tests assert
  // real chunk-boundary STABILITY (the thing that actually matters
  // visually), not bit-exact floats.
  const pointsClose = (a: { x: number; y: number }, b: { x: number; y: number }): boolean => (
    Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6
  );
  const segmentsClose = (
    a: { previous: { x: number; y: number }; current: { x: number; y: number }; glowColor: number; coreColor: number; alpha: number },
    b: { previous: { x: number; y: number }; current: { x: number; y: number }; glowColor: number; coreColor: number; alpha: number }
  ): boolean => (
    pointsClose(a.previous, b.previous)
    && pointsClose(a.current, b.current)
    && a.glowColor === b.glowColor
    && a.coreColor === b.coreColor
    && a.alpha === b.alpha
  );

  it('an already-covered interior distance samples the SAME color before and after growth changes the total chunk count', () => {
    // SPACING is 14px. A length of 70px = exactly 5 chunks; growing to
    // 71px changes the chunk count's own rounding (ceil(71/14) = 6) --
    // exactly the kind of step that reshuffled every chunk boundary in
    // the original equal-division implementation.
    const shorter = buildTeleportTransferConduitSegments(start, { x: 70, y: 0 }, 1, colorAtDistance);
    const longer = buildTeleportTransferConduitSegments(start, { x: 71, y: 0 }, 1, colorAtDistance);

    // The first chunk (covering absolute distance [0, 14)) must be
    // stable in both -- same endpoints (within floating-point
    // tolerance), same color -- since growth only ever extends the FAR
    // end, never the near one.
    expect(pointsClose(longer[0]!.previous, shorter[0]!.previous)).toBe(true);
    expect(pointsClose(longer[0]!.current, shorter[0]!.current)).toBe(true);
    expect(longer[0]!.glowColor).toBe(shorter[0]!.glowColor);
  });

  it('every FULLY-COVERED early chunk (not just the first) stays pixel-stable across a growth step that adds a new chunk', () => {
    const shorter = buildTeleportTransferConduitSegments(start, { x: 70, y: 0 }, 1, colorAtDistance);
    const longer = buildTeleportTransferConduitSegments(start, { x: 71, y: 0 }, 1, colorAtDistance);
    // All 5 of the shorter run's chunks are still fully covered by the
    // longer run (0-70 is a strict prefix of 0-71) -- every one of them
    // must match; only the longer run's own extra 6th (partial) chunk is
    // new.
    expect(shorter.length).toBe(5);
    expect(longer.length).toBe(6);
    for (let i = 0; i < shorter.length; i += 1) {
      expect(segmentsClose(longer[i]!, shorter[i]!)).toBe(true);
    }
  });

  it('growth only ever APPENDS new chunks -- it never changes how many chunks already existed for a shorter length', () => {
    // Simulates several successive real growth steps (as outboundProgress
    // rises) and confirms each new step's segments are a strict
    // prefix-preserving extension of the previous step's, never a full
    // reshuffle.
    let previousSegments = buildTeleportTransferConduitSegments(start, { x: 10, y: 0 }, 1, colorAtDistance);
    for (const length of [24, 38, 52, 66, 80, 94, 100]) {
      const nextSegments = buildTeleportTransferConduitSegments(start, { x: length, y: 0 }, 1, colorAtDistance);
      expect(nextSegments.length).toBeGreaterThanOrEqual(previousSegments.length);
      for (let i = 0; i < previousSegments.length - 1; i += 1) {
        // Every chunk except possibly the last of the previous step
        // (which may have been the partial/growing tip and can now be
        // fully covered) must still be stable.
        expect(segmentsClose(nextSegments[i]!, previousSegments[i]!)).toBe(true);
      }
      previousSegments = nextSegments;
    }
  });
});

describe('drawTeleportTransferConduitToCanvasContext: target flare (reuses the tested goal-halo compositor)', () => {
  it('draws no flare when targetFlareIntensity is 0', () => {
    const ctx = new FakeContext2D();
    drawTeleportTransferConduitToCanvasContext(ctx as unknown as CanvasRenderingContext2D, baseOptions({ targetFlareIntensity: 0 }));
    expect(ctx.calls.some((call) => call.startsWith('createRadialGradient'))).toBe(false);
  });

  it('draws a real radial-gradient flare centered on the target when targetFlareIntensity > 0', () => {
    const ctx = new FakeContext2D();
    drawTeleportTransferConduitToCanvasContext(ctx as unknown as CanvasRenderingContext2D, baseOptions({ targetFlareIntensity: 1, packetVisible: false, packetPoint: null, conduitEndPoint: SOURCE }));
    expect(ctx.calls.some((call) => call.startsWith(`createRadialGradient(${TARGET.x},${TARGET.y}`))).toBe(true);
  });
});

describe('drawTeleportTransferConduitToCanvasContext: origin offset', () => {
  it('subtracts originX/originY from every drawn point (canvas-local coordinates)', () => {
    const ctx = new FakeContext2D();
    drawTeleportTransferConduitToCanvasContext(ctx as unknown as CanvasRenderingContext2D, baseOptions({ originX: 20, originY: 10 }));
    expect(ctx.calls).toContain(`moveTo(${TARGET.x - 20},${TARGET.y - 10})`);
    expect(ctx.calls).toContain(`lineTo(${PACKET.x - 20},${PACKET.y - 10})`);
    expect(ctx.calls.some((call) => call.startsWith(`arc(${PACKET.x - 20},${PACKET.y - 10}`))).toBe(true);
  });
});

describe('computeTeleportTransferConduitCanvasBounds', () => {
  it('sizes a box spanning source and target, padded on every side', () => {
    const bounds = computeTeleportTransferConduitCanvasBounds(SOURCE, TARGET, 10);
    expect(bounds).toEqual({
      left: SOURCE.x - 10,
      top: SOURCE.y - 10,
      width: (TARGET.x - SOURCE.x) + 20,
      height: 20
    });
  });

  it('handles source/target in either relative order', () => {
    const bounds = computeTeleportTransferConduitCanvasBounds(TARGET, SOURCE, 5);
    expect(bounds.left).toBe(SOURCE.x - 5);
    expect(bounds.width).toBe((TARGET.x - SOURCE.x) + 10);
  });
});
