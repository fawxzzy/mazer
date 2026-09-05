import { describe, expect, it } from 'vitest';
import {
  computePlayerGlowCanvasBounds,
  drawPlayerGlowToCanvasContext
} from '../../src/render/navigationCorePlayerGlowCanvas';

// Same fake-context convention as navigationCoreTrailCanvas.test.ts -- records
// calls/property-sets instead of rasterizing, so draw order and which Canvas
// capabilities (shadowBlur/shadowColor) are actually used can be asserted on
// without a real browser canvas in vitest's Node environment.
class FakeContext2D {
  calls: string[] = [];
  shadowBlur = 0;
  shadowColor = '';
  fillStyle = '';

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

  arcTo(x1: number, y1: number, x2: number, y2: number, r: number): void {
    this.calls.push(`arcTo(${x1},${y1},${x2},${y2},${r})`);
  }

  closePath(): void {
    this.calls.push('closePath');
  }

  fill(): void {
    this.calls.push(`fill(style=${this.fillStyle},shadowBlur=${this.shadowBlur},shadowColor=${this.shadowColor})`);
  }
}

const baseOptions = {
  originX: 0,
  originY: 0,
  shapeLeft: 10,
  shapeTop: 20,
  shapeWidth: 40,
  shapeHeight: 40,
  cornerRadius: 5,
  wideGlowColor: 0x123456,
  wideGlowAlpha: 0.3,
  wideGlowBlurPx: 8,
  tightGlowColor: 0xabcdef,
  tightGlowAlpha: 0.5,
  tightGlowBlurPx: 3
};

describe('computePlayerGlowCanvasBounds', () => {
  it('expands the shape bounds by the given padding on every side', () => {
    const bounds = computePlayerGlowCanvasBounds(10, 20, 40, 40, 5);
    expect(bounds).toEqual({ left: 5, top: 15, width: 50, height: 50 });
  });
});

describe('drawPlayerGlowToCanvasContext', () => {
  it('draws exactly two filled shapes (wide then tight) -- not a third fill for the crisp core, which is the caller\'s own responsibility', () => {
    const ctx = new FakeContext2D();
    drawPlayerGlowToCanvasContext(ctx as unknown as CanvasRenderingContext2D, baseOptions);
    const fillCalls = ctx.calls.filter((call) => call.startsWith('fill('));
    expect(fillCalls).toHaveLength(2);
  });

  it('applies the wide glow color/blur on the first pass and the tight glow color/blur on the second', () => {
    const ctx = new FakeContext2D();
    drawPlayerGlowToCanvasContext(ctx as unknown as CanvasRenderingContext2D, baseOptions);
    const fillCalls = ctx.calls.filter((call) => call.startsWith('fill('));
    expect(fillCalls[0]).toContain('shadowBlur=8');
    expect(fillCalls[1]).toContain('shadowBlur=3');
  });

  it('resets shadowBlur to 0 after drawing, so a caller drawing the crisp core right after never inherits a stray blur', () => {
    const ctx = new FakeContext2D();
    drawPlayerGlowToCanvasContext(ctx as unknown as CanvasRenderingContext2D, baseOptions);
    expect(ctx.shadowBlur).toBe(0);
  });

  it('skips a pass entirely when its blur radius is 0 or negative (no fill call, no shadow state touched for it)', () => {
    const ctx = new FakeContext2D();
    drawPlayerGlowToCanvasContext(ctx as unknown as CanvasRenderingContext2D, {
      ...baseOptions,
      wideGlowBlurPx: 0
    });
    const fillCalls = ctx.calls.filter((call) => call.startsWith('fill('));
    expect(fillCalls).toHaveLength(1);
    expect(fillCalls[0]).toContain('shadowBlur=3');
  });

  it('offsets the drawn shape by originX/originY (canvas-local coordinates)', () => {
    const ctx = new FakeContext2D();
    drawPlayerGlowToCanvasContext(ctx as unknown as CanvasRenderingContext2D, {
      ...baseOptions,
      originX: 10,
      originY: 20
    });
    // shapeLeft(10) - originX(10) = 0, shapeTop(20) - originY(20) = 0 --
    // the rounded-rect path's first moveTo is at (left + cornerRadius, top).
    expect(ctx.calls).toContain(`moveTo(${0 + baseOptions.cornerRadius},${0})`);
  });
});
