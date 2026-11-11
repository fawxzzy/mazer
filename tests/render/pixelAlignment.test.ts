import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { alignBoundsToWholePixels, toWholeImagePosition } from '../../src/render/pixelAlignment';
import { computeBoardTileLayout } from '../../src/render/boardTileBake';

describe('pixel alignment: Phaser (roundPixels) floors an Image position, so ours must already be whole', () => {
  test('aligned bounds are whole pixels and contain the original bounds', () => {
    const cases = [
      { left: 10.4, top: 20.9, width: 30.2, height: 5.05 },
      { left: -3.7, top: 0, width: 12, height: 12 },
      { left: 100, top: 100, width: 0.1, height: 0.1 },
      { left: 0.999, top: 7.001, width: 40.5, height: 80.25 }
    ];
    for (const raw of cases) {
      const aligned = alignBoundsToWholePixels(raw);
      for (const v of [aligned.left, aligned.top, aligned.width, aligned.height]) {
        expect(Number.isInteger(v)).toBe(true);
      }
      expect(aligned.left).toBeLessThanOrEqual(raw.left);
      expect(aligned.top).toBeLessThanOrEqual(raw.top);
      expect(aligned.left + aligned.width).toBeGreaterThanOrEqual(raw.left + raw.width);
      expect(aligned.top + aligned.height).toBeGreaterThanOrEqual(raw.top + raw.height);
      // never more than one extra pixel each side
      expect(aligned.width).toBeLessThanOrEqual(Math.ceil(raw.width) + 1);
      expect(aligned.height).toBeLessThanOrEqual(Math.ceil(raw.height) + 1);
    }
  });

  test('a head that moves by a fraction does not change the aligned origin until it crosses a whole pixel', () => {
    const origins = new Set<number>();
    for (let x = 12.01; x < 12.99; x += 0.05) {
      origins.add(alignBoundsToWholePixels({ left: x, top: 0, width: 20, height: 20 }).left);
    }
    expect([...origins]).toEqual([12]);
  });

  test('the board image lands on the whole-pixel board origin at every common phone pixel ratio', () => {
    // 2.63 is what the canvas resolution policy rounds 2.625 to; 2.75 is the Android case that exposed the floor.
    for (const dpr of [1, 2, 2.63, 2.75, 3, 3.5]) {
      for (let boardLeft = 0; boardLeft <= 40; boardLeft += 1) {
        const margin = computeBoardTileLayout({
          grid: Array.from({ length: 4 }, () => Array.from({ length: 4 }, () => true)),
          width: 4,
          height: 4,
          tileSize: 14.84,
          devicePixelRatio: dpr,
          style: 'chip',
          docks: []
        }).originX;
        expect(Number.isInteger(margin), `margin at dpr ${dpr}`).toBe(true);
        const snapped = (Math.round(boardLeft * dpr) / dpr) - margin;
        const imageX = toWholeImagePosition(snapped);
        expect(Number.isInteger(imageX)).toBe(true);
        // what Phaser draws (floor of a whole number) puts the board exactly at the intended origin
        expect(Math.floor(imageX) + margin, `dpr ${dpr} boardLeft ${boardLeft}`).toBe(boardLeft);
      }
    }
  });

  test('flooring would have moved the board a whole pixel (the regression this guards)', () => {
    const dpr = 2.75;
    const margin = 3;
    const snapped = (Math.round(11 * dpr) / dpr) - margin;
    expect(Math.floor(snapped) + margin).toBe(10);
    expect(toWholeImagePosition(snapped) + margin).toBe(11);
  });

  test('the trail and player-glow images are placed through the alignment, and the maze frame origin is whole', () => {
    const source = readFileSync('src/scenes/MenuScene.ts', 'utf8');
    expect(source).toContain('const bounds = alignBoundsToWholePixels(rawBounds);');
    expect(source).toMatch(/const bounds = alignBoundsToWholePixels\(\s*computePlayerGlowCanvasBounds\(/);
    expect(source).toContain('boardLeft: Math.round(boardLeft + safeInset),');
    expect(source).toContain('boardTop: Math.round(boardTop + safeInset),');
  });
});
