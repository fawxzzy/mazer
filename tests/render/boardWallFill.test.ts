import { describe, expect, it } from 'vitest';
import { resolveBoardWallFillRect } from '../../src/render/boardWallFill';

// Reference: the per-cell rect formula MenuScene.resolveLegacyPixelTileRect used for the old one-fillRect-per-cell loop.
const cellRect = (originX: number, originY: number, tileSize: number, x: number, y: number) => {
  const left = Math.round(originX + (x * tileSize));
  const top = Math.round(originY + (y * tileSize));
  const right = Math.round(originX + ((x + 1) * tileSize));
  const bottom = Math.round(originY + ((y + 1) * tileSize));
  return { left, top, width: Math.max(1, right - left), height: Math.max(1, bottom - top) };
};

describe('resolveBoardWallFillRect', () => {
  const cases: Array<[number, number, number, number, number]> = [
    [0, 0, 14.72, 25, 55],
    [7.5, 31.25, 14.666666666666666, 25, 57],
    [0.4, 12.6, 15.6, 45, 27],
    [13.49, 99.5, 7.31, 25, 51],
    [3, 3, 1, 4, 4]
  ];

  it.each(cases)('covers exactly the union of the per-cell rects (origin %f,%f tile %f, %ix%i)', (ox, oy, tile, cols, rows) => {
    const rect = resolveBoardWallFillRect(ox, oy, tile, cols, rows);
    expect(rect).not.toBeNull();
    let area = 0;
    let minLeft = Infinity;
    let minTop = Infinity;
    let maxRight = -Infinity;
    let maxBottom = -Infinity;
    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < cols; x += 1) {
        const c = cellRect(ox, oy, tile, x, y);
        area += c.width * c.height;
        minLeft = Math.min(minLeft, c.left);
        minTop = Math.min(minTop, c.top);
        maxRight = Math.max(maxRight, c.left + c.width);
        maxBottom = Math.max(maxBottom, c.top + c.height);
      }
    }
    expect(rect).toEqual({ left: minLeft, top: minTop, width: maxRight - minLeft, height: maxBottom - minTop });
    // No gap and no overlap: the cells tile the rectangle exactly.
    expect(area).toBe(rect!.width * rect!.height);
  });

  it('declines when a cell could be smaller than one pixel or the input is not usable', () => {
    expect(resolveBoardWallFillRect(0, 0, 0.5, 10, 10)).toBeNull();
    expect(resolveBoardWallFillRect(0, 0, 14, 0, 10)).toBeNull();
    expect(resolveBoardWallFillRect(Number.NaN, 0, 14, 10, 10)).toBeNull();
  });
});
