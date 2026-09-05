import { describe, expect, it } from 'vitest';
import {
  chunkTrailSegments,
  computeTrailCanvasBounds,
  drawTrailToCanvasContext,
  type TrailCanvasSegment
} from '../../src/render/navigationCoreTrailCanvas';

const point = (x: number, y: number) => ({ x, y });

// A minimal fake 2D context that records every call/property-set instead of
// actually rasterizing -- enough to assert on draw ORDER, path shape, and
// which canvas capabilities (lineJoin/lineCap/shadowBlur) are actually used,
// without needing a real browser canvas in vitest's Node environment. Real
// pixel-level verification (does this actually look smooth) is a Playwright
// evidence-capture concern, same as the rest of this render module.
class FakeContext2D {
  calls: string[] = [];
  lineJoin = '';
  lineCap = '';
  shadowBlur = 0;
  shadowColor = '';
  strokeStyle = '';
  lineWidth = 0;

  save(): void {
    this.calls.push('save');
  }

  restore(): void {
    this.calls.push('restore');
  }

  beginPath(): void {
    this.calls.push('beginPath');
  }

  moveTo(x: number, y: number): void {
    this.calls.push(`moveTo(${x},${y})`);
  }

  lineTo(x: number, y: number): void {
    this.calls.push(`lineTo(${x},${y})`);
  }

  stroke(): void {
    this.calls.push(`stroke(width=${this.lineWidth},style=${this.strokeStyle},shadowBlur=${this.shadowBlur},shadowColor=${this.shadowColor})`);
  }
}

const buildSegments = (
  points: readonly { x: number; y: number }[],
  color: number,
  alpha: number
): TrailCanvasSegment[] => {
  const segments: TrailCanvasSegment[] = [];
  for (let i = 1; i < points.length; i += 1) {
    segments.push({ previous: points[i - 1]!, current: points[i]!, glowColor: color, coreColor: color, alpha });
  }
  return segments;
};

const defaultOptions = {
  originX: 0,
  originY: 0,
  coreWidth: 4,
  glowWidth: 8,
  glowAlphaRatio: 0.22,
  glowBlurPx: 6
};

describe('chunkTrailSegments', () => {
  it('groups an entire straight run of identical color/alpha into one chunk', () => {
    const points = Array.from({ length: 20 }, (_, i) => point(i * 4, 0));
    const segments = buildSegments(points, 0xff8800, 1);
    const chunks = chunkTrailSegments(segments);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toHaveLength(19);
  });

  it('starts a new chunk once core color drifts past the tolerance', () => {
    const points = Array.from({ length: 10 }, (_, i) => point(i * 4, 0));
    const segments = buildSegments(points, 0x000000, 1);
    // Push the color far away for the back half.
    for (let i = 5; i < segments.length; i += 1) {
      segments[i]!.coreColor = 0xffffff;
    }
    const chunks = chunkTrailSegments(segments);
    expect(chunks.length).toBeGreaterThan(1);
  });

  it('starts a new chunk once glow color drifts past the tolerance, even if core color is unchanged', () => {
    const points = Array.from({ length: 10 }, (_, i) => point(i * 4, 0));
    const segments = buildSegments(points, 0x000000, 1);
    for (let i = 5; i < segments.length; i += 1) {
      segments[i]!.glowColor = 0xffffff;
    }
    const chunks = chunkTrailSegments(segments);
    expect(chunks.length).toBeGreaterThan(1);
  });

  it('never bridges a subpath break (non-adjacent segments) even when colors match exactly', () => {
    const segments: TrailCanvasSegment[] = [
      { previous: point(0, 0), current: point(4, 0), glowColor: 0x123456, coreColor: 0x123456, alpha: 1 },
      // Not adjacent to the previous segment's `current` -- a real
      // wraparound-style discontinuity. Must not be merged into the same
      // continuous stroked path as the first segment.
      { previous: point(100, 100), current: point(104, 100), glowColor: 0x123456, coreColor: 0x123456, alpha: 1 }
    ];
    const chunks = chunkTrailSegments(segments);
    expect(chunks).toHaveLength(2);
  });

  it('keeps alpha-only changes past tolerance in separate chunks too', () => {
    const points = Array.from({ length: 6 }, (_, i) => point(i * 4, 0));
    const segments = buildSegments(points, 0x808080, 1);
    segments[3]!.alpha = 0.2;
    segments[4]!.alpha = 0.2;
    const chunks = chunkTrailSegments(segments);
    expect(chunks.length).toBeGreaterThan(1);
  });
});

describe('computeTrailCanvasBounds', () => {
  it('returns null for an empty segment list', () => {
    expect(computeTrailCanvasBounds([], 10)).toBeNull();
  });

  it('expands the tight bounding box by the given padding on every side', () => {
    const segments = buildSegments([point(10, 20), point(50, 20), point(50, 80)], 0xffffff, 1);
    const bounds = computeTrailCanvasBounds(segments, 5);
    expect(bounds).toEqual({ left: 5, top: 15, width: 50, height: 70 });
  });
});

describe('drawTrailToCanvasContext', () => {
  it('is a no-op (no path calls) for an empty segment list', () => {
    const ctx = new FakeContext2D();
    drawTrailToCanvasContext(ctx as unknown as CanvasRenderingContext2D, [], defaultOptions);
    expect(ctx.calls).toEqual([]);
  });

  it('draws each chunk as ONE continuous path (a single moveTo, then chained lineTo calls, then one stroke) -- not one stroke per segment', () => {
    const points = Array.from({ length: 5 }, (_, i) => point(i * 4, 0));
    const segments = buildSegments(points, 0xff8800, 1);
    const ctx = new FakeContext2D();
    drawTrailToCanvasContext(ctx as unknown as CanvasRenderingContext2D, segments, defaultOptions);
    // One chunk for the glow pass, one for the core pass -- each is
    // beginPath, ONE moveTo, N lineTo, ONE stroke (never N independent
    // beginPath/moveTo/lineTo/stroke cycles for N segments).
    const beginPathCount = ctx.calls.filter((c) => c === 'beginPath').length;
    const moveToCount = ctx.calls.filter((c) => c.startsWith('moveTo')).length;
    const strokeCount = ctx.calls.filter((c) => c.startsWith('stroke(')).length;
    expect(beginPathCount).toBe(2); // one glow chunk + one core chunk
    expect(moveToCount).toBe(2);
    expect(strokeCount).toBe(2);
  });

  it('sets lineJoin and lineCap to round', () => {
    const segments = buildSegments([point(0, 0), point(4, 0)], 0x00ff00, 1);
    const ctx = new FakeContext2D();
    drawTrailToCanvasContext(ctx as unknown as CanvasRenderingContext2D, segments, defaultOptions);
    expect(ctx.lineJoin).toBe('round');
    expect(ctx.lineCap).toBe('round');
  });

  it('applies shadowBlur/shadowColor for the glow pass, then clears it before the crisp core pass', () => {
    const segments = buildSegments([point(0, 0), point(4, 0)], 0x00ff00, 1);
    const ctx = new FakeContext2D();
    drawTrailToCanvasContext(ctx as unknown as CanvasRenderingContext2D, segments, defaultOptions);
    const strokeCalls = ctx.calls.filter((c) => c.startsWith('stroke('));
    expect(strokeCalls[0]).toContain('shadowBlur=6');
    expect(strokeCalls[1]).toContain('shadowBlur=0');
  });

  it('offsets every drawn point by originX/originY (canvas-local coordinates)', () => {
    const segments = buildSegments([point(100, 200), point(104, 200)], 0x00ff00, 1);
    const ctx = new FakeContext2D();
    drawTrailToCanvasContext(ctx as unknown as CanvasRenderingContext2D, segments, { ...defaultOptions, originX: 100, originY: 200, glowBlurPx: 0 });
    expect(ctx.calls).toContain('moveTo(0,0)');
    expect(ctx.calls).toContain('lineTo(4,0)');
  });

  it('scales the glow alpha by glowAlphaRatio, keeping the core at the segment\'s own alpha', () => {
    const segments: TrailCanvasSegment[] = [{ previous: point(0, 0), current: point(4, 0), glowColor: 0xff0000, coreColor: 0xff0000, alpha: 0.8 }];
    const ctx = new FakeContext2D();
    drawTrailToCanvasContext(ctx as unknown as CanvasRenderingContext2D, segments, { ...defaultOptions, glowAlphaRatio: 0.25, glowBlurPx: 0 });
    const strokeCalls = ctx.calls.filter((c) => c.startsWith('stroke('));
    expect(strokeCalls[0]).toContain('rgba(255,0,0,0.2)'); // 0.8 * 0.25
    expect(strokeCalls[1]).toContain('rgba(255,0,0,0.8)');
  });

  it('uses glowColor for the glow pass and coreColor for the core pass, even when they differ (the shine highlight brightens the core only, not the glow)', () => {
    const segments: TrailCanvasSegment[] = [{
      previous: point(0, 0),
      current: point(4, 0),
      glowColor: 0x0000ff, // plain base spectral color
      coreColor: 0xffffff, // shine-highlighted (blended toward white)
      alpha: 1
    }];
    const ctx = new FakeContext2D();
    drawTrailToCanvasContext(ctx as unknown as CanvasRenderingContext2D, segments, { ...defaultOptions, glowAlphaRatio: 1, glowBlurPx: 0 });
    const strokeCalls = ctx.calls.filter((c) => c.startsWith('stroke('));
    expect(strokeCalls[0]).toContain('rgba(0,0,255,1)');
    expect(strokeCalls[1]).toContain('rgba(255,255,255,1)');
  });
});
