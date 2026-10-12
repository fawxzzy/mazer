import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import sharp from 'sharp';
import { compareRawImages, createCornerTrailRegionMask, largestConnectedRegion } from '../../scripts/analysis/lib/rasterCompare.mjs';

// Negative-control proof for the trail-corner raster gate
// (scripts/analysis/verify-trail-corner-raster.mjs): a reviewer
// demonstrated that a whole-image diff-fraction budget alone can pass a
// large, localized, contiguous corruption, because the fraction gets
// diluted by the large area of unaffected floor/starfield in the same
// 3x3-tile capture. This test reproduces that exact corruption against a
// real committed baseline and asserts the comparator (as actually used by
// the raster check, not a reimplementation) rejects it -- proving the gate
// has teeth under its own real, shipped tolerance, not just when that
// tolerance is artificially set to zero.
const BASELINE_PATH = resolve(process.cwd(), 'tests/fixtures/trail-corner-raster/cornerNE.png');

const loadRaw = async (buffer: Buffer) => (
  sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
);

describe('trail corner raster gate: negative controls', () => {
  test('a real baseline compared to itself passes (sanity control)', async () => {
    const baselineBuffer = readFileSync(BASELINE_PATH);
    const image = await loadRaw(baselineBuffer);
    const result = compareRawImages(image, image);
    expect(result.passed).toBe(true);
    expect(result.differingPixels).toBe(0);
  });

  test('a reviewer-supplied negative control (60x60 opaque block over the trail bend) is REJECTED under the real, shipped tolerance -- not just at tolerance zero', async () => {
    const baselineBuffer = readFileSync(BASELINE_PATH);
    const baselineImage = await loadRaw(baselineBuffer);
    expect(baselineImage.info.width).toBe(473);
    expect(baselineImage.info.height).toBe(473);

    // Exact reproduction reported against this exact baseline: blacking out
    // x=348..407, y=348..407 changes 3,600 of 223,729 pixels (1.61%) --
    // comfortably under the whole-image 2% fraction budget on its own.
    const corrupted = await sharp(baselineBuffer)
      .composite([{
        input: { create: { width: 60, height: 60, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } } },
        left: 348,
        top: 348
      }])
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const result = compareRawImages(corrupted, baselineImage);

    // The fraction alone would indeed pass -- confirming this test
    // reproduces the reported false-pass condition, not a different bug.
    expect(result.fraction).toBeLessThan(0.02);
    // But the real gate (fraction AND region-size) must reject it.
    expect(result.passed).toBe(false);
    expect(result.largestRegion).toBeGreaterThan(3000);
    // The actual corner-specific gate must retain this same negative control.
    const masked = compareRawImages(corrupted, baselineImage, createCornerTrailRegionMask(473, 473, 'cornerNE'));
    expect(masked.passed).toBe(false);
    expect(masked.largestRegion).toBeGreaterThan(3000);
  });

  test('a small, scattered speckle pattern (simulating ordinary antialiasing jitter) is still accepted', () => {
    const width = 100;
    const height = 100;
    const differsGrid = new Uint8Array(width * height);
    // Scatter ~150 isolated single-pixel differences (never adjacent to
    // each other), the same order of magnitude and character as the
    // differing-pixel counts measured across repeated real re-renders of
    // the committed baselines (62-245 pixels, largest connected region
    // 20-32px).
    for (let i = 0; i < 150; i += 1) {
      const x = (i * 37) % width;
      const y = (i * 53) % height;
      differsGrid[(y * width) + x] = 1;
    }
    const largest = largestConnectedRegion(differsGrid, width, height);
    expect(largest).toBeLessThan(40);
  });

  test('a representative localized join/corner-style defect (a solid diagonal-ish blob comparable in scale to the original teeth artifact) is REJECTED', () => {
    const width = 100;
    const height = 100;
    const differsGrid = new Uint8Array(width * height);
    // A ragged ~15x15 contiguous blob (225px, well past the 40px cap but
    // far smaller than the 60x60 negative control) -- representative of a
    // localized corner-join artifact rather than a full-block corruption.
    for (let y = 40; y < 55; y += 1) {
      for (let x = 40; x < 55; x += 1) {
        if ((x + y) % 5 !== 0) {
          differsGrid[(y * width) + x] = 1;
        }
      }
    }
    const largest = largestConnectedRegion(differsGrid, width, height);
    expect(largest).toBeGreaterThan(40);
  });
});

describe('trail corner fixture region', () => {
  test.each(['cornerNE', 'cornerNW', 'cornerSE', 'cornerSW'])('protects all five floor cells and excludes only the empty quadrant for %s', (orientation) => {
    const size = 312; // 3 x 100px cells plus the existing 6px border.
    const mask = createCornerTrailRegionMask(size, size, orientation);
    let protectedCells = 0;
    for (let y = 0; y < 3; y += 1) for (let x = 0; x < 3; x += 1) {
      const expected = (orientation.endsWith('E') ? x === 2 : x === 0) || (orientation.startsWith('cornerN') ? y === 2 : y === 0);
      expect(Boolean(mask[(56 + y * 100) * size + 56 + x * 100])).toBe(expected);
      if (expected) protectedCells += 1;
    }
    expect(protectedCells).toBe(5);
  });
  test('ignores a localized background star while still rejecting the same defect over the trail', () => {
    const width = 312;
    const baseline = {info: {width, height: width}, data: Buffer.alloc(width * width * 4)};
    const paint = (x: number, y: number, size: number) => {
      const data = Buffer.from(baseline.data);
      for (let dy = 0; dy < size; dy += 1) for (let dx = 0; dx < size; dx += 1) data[((y + dy) * width + x + dx) * 4] = 255;
      return {info: baseline.info, data};
    };
    const mask = createCornerTrailRegionMask(width, width, 'cornerNE');
    expect(compareRawImages(paint(80, 80, 8), baseline).passed).toBe(false);
    expect(compareRawImages(paint(80, 80, 8), baseline, mask).passed).toBe(true);
    expect(compareRawImages(paint(250, 250, 8), baseline, mask).passed).toBe(false);
    // Broad corruption remains rejected by the unchanged whole-image budget.
    expect(compareRawImages(paint(20, 20, 60), baseline, mask).passed).toBe(false);
  });
  test('rejects malformed or empty comparison masks', () => {
    const image = {info:{width: 2, height: 2}, data: Buffer.alloc(16)};
    expect(() => compareRawImages(image, image, new Uint8Array(4))).toThrow();
    expect(() => compareRawImages(image, image, new Uint8Array([1]))).toThrow();
    expect(() => createCornerTrailRegionMask(10, 10, 'cornerNE')).toThrow();
    expect(() => createCornerTrailRegionMask(473, 473, 'other')).toThrow();
  });
});
