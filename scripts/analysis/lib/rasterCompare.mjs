/**
 * Pixel-comparison core for verify-trail-corner-raster.mjs, extracted into
 * its own module so a fast vitest unit test can exercise it directly
 * against committed baseline images -- no Playwright/browser needed --
 * proving the comparator itself actually rejects a broken render, not just
 * that its browser-driven caller can invoke it. See that test
 * (tests/analysis/rasterCompare.test.ts) for the negative-control proof a
 * reviewer specifically asked for: a whole-image diff-fraction budget alone
 * can pass a large, localized, contiguous corruption (e.g. a black square
 * dropped on the trail bend) because the fraction is diluted by the large
 * area of unaffected floor/background in the same crop. This module's
 * `largestConnectedRegion` closes that gap: a real defect (the original
 * teeth artifact, or a corrupted-render negative control) reads as one
 * large contiguous run of differing pixels, not the small, scattered,
 * mostly-isolated speckle ordinary cross-environment antialiasing jitter
 * produces -- so the region-size cap catches what the fraction alone
 * cannot.
 */
import sharp from 'sharp';

// Per-channel absolute-difference tolerance and the fraction of pixels
// allowed to exceed it before the check fails. Loose enough to absorb
// ordinary cross-environment antialiasing/font-hinting jitter (repeated
// real re-renders of the same correct state measured 62-245 differing
// pixels out of 223,729, i.e. well under 0.2%), tight enough that a real
// structural regression fails it by a wide margin, not a coin flip.
export const CHANNEL_TOLERANCE = 24;
export const MAX_DIFFERING_PIXEL_FRACTION = 0.02;
// Repeated real re-renders of the same correct baseline never produced a
// connected differing region larger than 32px (measured across multiple
// runs, all four corner orientations); a reviewer-supplied negative
// control (a 60x60 = 3600px opaque block dropped on the trail bend) is
// two orders of magnitude larger. 40px keeps meaningful headroom above the
// measured jitter ceiling while staying far below any real defect's scale.
export const MAX_CONNECTED_DIFF_REGION_PIXELS = 40;

// 4-connected flood fill over a boolean "differs" grid, returning the
// largest connected component's pixel count. Iterative (explicit stack),
// not recursive, so a large corrupted region can't blow the call stack.
export const largestConnectedRegion = (differsGrid, width, height) => {
  const visited = new Uint8Array(width * height);
  let largest = 0;
  const stack = [];
  for (let start = 0; start < differsGrid.length; start += 1) {
    if (!differsGrid[start] || visited[start]) {
      continue;
    }
    let size = 0;
    stack.push(start);
    visited[start] = 1;
    while (stack.length > 0) {
      const idx = stack.pop();
      size += 1;
      const x = idx % width;
      const y = (idx - x) / width;
      const neighbors = [
        x > 0 ? idx - 1 : -1,
        x < width - 1 ? idx + 1 : -1,
        y > 0 ? idx - width : -1,
        y < height - 1 ? idx + width : -1
      ];
      for (const n of neighbors) {
        if (n >= 0 && differsGrid[n] && !visited[n]) {
          visited[n] = 1;
          stack.push(n);
        }
      }
    }
    largest = Math.max(largest, size);
  }
  return largest;
};

/**
 * Compares two same-sized raw RGBA pixel buffers (as returned by sharp's
 * `.raw().toBuffer({resolveWithObject: true})`). Pure and synchronous --
 * no file I/O, no browser -- so it can be unit-tested directly.
 */
export const compareRawImages = (candidate, baseline) => {
  if (candidate.info.width !== baseline.info.width || candidate.info.height !== baseline.info.height) {
    return {
      passed: false,
      differingPixels: null,
      totalPixels: null,
      fraction: null,
      largestRegion: null,
      detail: `size mismatch: candidate ${candidate.info.width}x${candidate.info.height} vs baseline ${baseline.info.width}x${baseline.info.height}`
    };
  }
  const { width, height } = candidate.info;
  const totalPixels = width * height;
  const differsGrid = new Uint8Array(totalPixels);
  let differingPixels = 0;
  for (let p = 0; p < totalPixels; p += 1) {
    const i = p * 4;
    const dr = Math.abs(candidate.data[i] - baseline.data[i]);
    const dg = Math.abs(candidate.data[i + 1] - baseline.data[i + 1]);
    const db = Math.abs(candidate.data[i + 2] - baseline.data[i + 2]);
    const da = Math.abs(candidate.data[i + 3] - baseline.data[i + 3]);
    if (dr > CHANNEL_TOLERANCE || dg > CHANNEL_TOLERANCE || db > CHANNEL_TOLERANCE || da > CHANNEL_TOLERANCE) {
      differsGrid[p] = 1;
      differingPixels += 1;
    }
  }
  const fraction = differingPixels / totalPixels;
  const largestRegion = largestConnectedRegion(differsGrid, width, height);
  const fractionOk = fraction <= MAX_DIFFERING_PIXEL_FRACTION;
  const regionOk = largestRegion <= MAX_CONNECTED_DIFF_REGION_PIXELS;
  return {
    passed: fractionOk && regionOk,
    differingPixels,
    totalPixels,
    fraction,
    largestRegion,
    detail: `${differingPixels}/${totalPixels} pixels (${(fraction * 100).toFixed(2)}%) exceeded tolerance ${CHANNEL_TOLERANCE}/255 (allowed up to ${(MAX_DIFFERING_PIXEL_FRACTION * 100).toFixed(0)}%, ${fractionOk ? 'ok' : 'FAILED'}); largest connected differing region = ${largestRegion}px (allowed up to ${MAX_CONNECTED_DIFF_REGION_PIXELS}px, ${regionOk ? 'ok' : 'FAILED'})`
  };
};

/** Convenience wrapper: decodes two PNG buffers to raw RGBA, then compares. */
export const comparePngBuffers = async (candidatePng, baselinePng) => {
  const [candidate, baseline] = await Promise.all([
    sharp(candidatePng).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
    sharp(baselinePng).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  ]);
  return compareRawImages(candidate, baseline);
};
