import { describe, expect, it } from 'vitest';
import {
  computeGoalHaloCanvasBounds,
  drawGoalHaloToCanvasContext
} from '../../src/render/navigationCoreGoalHaloCanvas';

// Same fake-context convention as the trail/player-glow canvas tests --
// records calls/property-sets instead of rasterizing.
class FakeGradient {
  stops: Array<{ offset: number; color: string }> = [];

  addColorStop(offset: number, color: string): void {
    this.stops.push({ offset, color });
  }
}

class FakeContext2D {
  calls: string[] = [];
  fillStyle: unknown = '';
  lastGradient: FakeGradient | null = null;

  createRadialGradient(x0: number, y0: number, r0: number, x1: number, y1: number, r1: number): FakeGradient {
    this.calls.push(`createRadialGradient(${x0},${y0},${r0},${x1},${y1},${r1})`);
    this.lastGradient = new FakeGradient();
    return this.lastGradient;
  }

  beginPath(): void {
    this.calls.push('beginPath');
  }

  arc(x: number, y: number, r: number, start: number, end: number): void {
    this.calls.push(`arc(${x},${y},${r},${start},${end})`);
  }

  fill(): void {
    this.calls.push('fill');
  }
}

const baseOptions = {
  originX: 0,
  originY: 0,
  centerX: 20,
  centerY: 30,
  radius: 15,
  innerColor: 0xe030c0,
  innerAlpha: 0.4,
  outerColor: 0x8b3ff0,
  outerAlpha: 0.3
};

describe('computeGoalHaloCanvasBounds', () => {
  it('sizes a square box centered on the halo, radius + padding on every side', () => {
    const bounds = computeGoalHaloCanvasBounds(20, 30, 15, 5);
    expect(bounds).toEqual({ left: 0, top: 10, width: 40, height: 40 });
  });
});

describe('drawGoalHaloToCanvasContext', () => {
  it('draws one continuous radial gradient fill -- not two separate flat-disc fills', () => {
    const ctx = new FakeContext2D();
    drawGoalHaloToCanvasContext(ctx as unknown as CanvasRenderingContext2D, baseOptions);
    const fillCalls = ctx.calls.filter((call) => call === 'fill');
    expect(fillCalls).toHaveLength(1);
    expect(ctx.calls.some((call) => call.startsWith('createRadialGradient'))).toBe(true);
  });

  it('starts the gradient at the inner color/alpha and ends fully transparent in the outer color, blooming through the outer color partway', () => {
    const ctx = new FakeContext2D();
    drawGoalHaloToCanvasContext(ctx as unknown as CanvasRenderingContext2D, baseOptions);
    const stops = ctx.lastGradient!.stops;
    expect(stops[0]!.offset).toBe(0);
    expect(stops[0]!.color).toContain('rgba(224,48,192'); // innerColor 0xe030c0
    expect(stops[stops.length - 1]!.offset).toBe(1);
    expect(stops[stops.length - 1]!.color).toContain('rgba(139,63,240,0)'); // outerColor, alpha 0
  });

  it('is a no-op for a non-positive radius', () => {
    const ctx = new FakeContext2D();
    drawGoalHaloToCanvasContext(ctx as unknown as CanvasRenderingContext2D, { ...baseOptions, radius: 0 });
    expect(ctx.calls).toHaveLength(0);
  });

  it('offsets the gradient center by originX/originY (canvas-local coordinates)', () => {
    const ctx = new FakeContext2D();
    drawGoalHaloToCanvasContext(ctx as unknown as CanvasRenderingContext2D, {
      ...baseOptions,
      originX: 10,
      originY: 10
    });
    expect(ctx.calls[0]).toBe('createRadialGradient(10,20,0,10,20,15)');
  });
});
