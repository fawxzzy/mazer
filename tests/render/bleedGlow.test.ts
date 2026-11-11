import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import {
  BLEED_GLOW,
  resolveBleedGlowColor,
  resolveBleedGlowEnvelope,
  resolveBleedGlowProgress,
  resolveBleedGlowRects,
  type BleedGlowDirection
} from '../../src/render/bleedGlow';
import { resolveTrailPaletteBorderColor } from '../../src/render/trailPalette';

const AREAS: Record<BleedGlowDirection, { left: number; top: number; right: number; bottom: number }> = {
  top: { left: 100, top: 20, right: 114, bottom: 62 },
  bottom: { left: 100, top: 700, right: 114, bottom: 742 },
  left: { left: 20, top: 300, right: 62, bottom: 314 },
  right: { left: 300, top: 300, right: 342, bottom: 314 }
};

const input = (direction: BleedGlowDirection, progress: number) => ({
  direction,
  area: AREAS[direction],
  // a device-snapped centre that is deliberately NOT on a whole css pixel, like a real phone tile
  cellCentre: { x: 107.1667, y: 307.5 },
  tileSize: 14.72,
  progress
});

describe('bleed glow: colour is the trail colour the edge diamonds use', () => {
  test('the glow colour is exactly the diamond border colour for the same head, time and motion state', () => {
    const head = { distanceTiles: 37.25, timeMs: 8123, animated: true };
    expect(resolveBleedGlowColor(head, 99999, false)).toBe(resolveTrailPaletteBorderColor(37.25, 8123, false));
    expect(resolveBleedGlowColor({ ...head, animated: false }, 99999, false)).toBe(resolveTrailPaletteBorderColor(37.25, 8123, true));
    expect(resolveBleedGlowColor(head, 99999, true)).toBe(resolveTrailPaletteBorderColor(37.25, 8123, true));
  });

  test('with no trail yet it follows the scene clock from head distance 0, like the diamonds', () => {
    expect(resolveBleedGlowColor(null, 4321, false)).toBe(resolveTrailPaletteBorderColor(0, 4321, false));
    expect(resolveBleedGlowColor(null, 4321, true)).toBe(resolveTrailPaletteBorderColor(0, 4321, true));
  });

  test('it changes over time (a shifting colour, not the old fixed green)', () => {
    const colours = new Set<number>();
    for (let t = 0; t < 7200; t += 400) {
      colours.add(resolveBleedGlowColor({ distanceTiles: 10, timeMs: t, animated: true }, t, false));
    }
    expect(colours.size).toBeGreaterThan(8);
    expect(colours.has(0x00ff66)).toBe(false);
  });
});

describe('bleed glow: geometry', () => {
  test('the lane is centred exactly on the cell centre across the dock, in every direction', () => {
    for (const direction of ['top', 'bottom', 'left', 'right'] as const) {
      const rects = resolveBleedGlowRects(input(direction, 0.5));
      expect(rects.length, direction).toBeGreaterThan(3);
      const vertical = direction === 'top' || direction === 'bottom';
      for (const rect of rects) {
        const centre = vertical ? rect.x + (rect.width / 2) : rect.y + (rect.height / 2);
        expect(centre, direction).toBeCloseTo(vertical ? 107.1667 : 307.5, 6);
        expect(vertical ? rect.width : rect.height).toBeCloseTo(14.72 * BLEED_GLOW.laneOfTile, 6);
      }
    }
  });

  test('steps along the dock share boundaries exactly: no overlap, no seam', () => {
    for (const direction of ['top', 'bottom', 'left', 'right'] as const) {
      const vertical = direction === 'top' || direction === 'bottom';
      for (let progress = 0.05; progress < 1; progress += 0.1) {
        const rects = resolveBleedGlowRects(input(direction, progress));
        const spans = rects.map((r) => (vertical ? [r.y, r.y + r.height] : [r.x, r.x + r.width]) as [number, number])
          .sort((a, b) => a[0] - b[0]);
        for (let i = 1; i < spans.length; i += 1) {
          expect(spans[i]![0], `${direction} ${progress}`).toBeGreaterThanOrEqual(spans[i - 1]![1]);
        }
        for (const [lo, hi] of spans) {
          expect(Number.isInteger(lo) && Number.isInteger(hi)).toBe(true);
        }
      }
    }
  });

  test('everything stays inside the dock area along its length', () => {
    for (const direction of ['top', 'bottom', 'left', 'right'] as const) {
      const a = AREAS[direction];
      for (const rect of resolveBleedGlowRects(input(direction, 0.4))) {
        expect(rect.x + rect.width).toBeLessThanOrEqual(a.right + 14.72);
        expect(rect.y + rect.height).toBeLessThanOrEqual(a.bottom + 14.72);
        if (direction === 'top' || direction === 'bottom') {
          expect(rect.y).toBeGreaterThanOrEqual(a.top);
          expect(rect.y + rect.height).toBeLessThanOrEqual(a.bottom);
        } else {
          expect(rect.x).toBeGreaterThanOrEqual(a.left);
          expect(rect.x + rect.width).toBeLessThanOrEqual(a.right);
        }
      }
    }
  });

  test('the band travels from the grid end to the screen edge and fades at both ends of the loop', () => {
    const peakPosition = (progress: number): number => {
      const rects = resolveBleedGlowRects(input('bottom', progress));
      const best = rects.reduce((a, b) => (b.alpha > a.alpha ? b : a));
      return best.y;
    };
    expect(peakPosition(0.25)).toBeLessThan(peakPosition(0.5));
    expect(peakPosition(0.5)).toBeLessThan(peakPosition(0.75));
    expect(resolveBleedGlowRects(input('bottom', 0))).toEqual([]);
    expect(resolveBleedGlowEnvelope(0)).toBeCloseTo(0, 9);
    expect(resolveBleedGlowEnvelope(0.5)).toBeCloseTo(1, 9);
  });

  test('alphas are bounded and the loop clock wraps', () => {
    for (const rect of resolveBleedGlowRects(input('top', 0.5))) {
      expect(rect.alpha).toBeGreaterThan(0);
      expect(rect.alpha).toBeLessThanOrEqual(BLEED_GLOW.maxAlpha);
    }
    expect(resolveBleedGlowProgress(BLEED_GLOW.periodMs * 3.25)).toBeCloseTo(0.25, 9);
    expect(resolveBleedGlowProgress(-BLEED_GLOW.periodMs * 0.25)).toBeCloseTo(0.75, 9);
  });
});

describe('bleed glow: MenuScene uses the module', () => {
  test('colour and rectangles come from bleedGlow.ts, not the progression palette or hand-rolled steps', () => {
    const source = readFileSync('src/scenes/MenuScene.ts', 'utf8');
    const start = source.indexOf('private drawLegacyBleedOffGlow(');
    const end = source.indexOf('// The board\'s floor.', start);
    const body = source.slice(start, end);
    expect(body).toContain('resolveBleedGlowRects(');
    expect(body).toContain('centerOfCell(');
    expect(body).not.toContain('LEGACY_BLEED_GLOW');
    expect(body).not.toContain('Math.round(area.left)');
    expect(source).toContain('resolveBleedGlowColor(this.trailPaletteHead, time, this.prefersLegacyReducedMotion())');
    expect(source).not.toMatch(/progressionPalette\.trailColor\s*\n\s*\);\s*\n\s*this\.drawLegacyProgressionBadge/);
  });
});
