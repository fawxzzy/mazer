import { describe, expect, test } from 'vitest';
import {
  clampLegacyOverlayScrollOffset,
  legacyOverlayScrollRectIntersectsViewport,
  resolveLegacyOverlayScrollRenderRect,
  resolveLegacyOverlayScrollMetrics
} from '../../src/legacy-runtime/legacyOverlayScroll';

describe('legacy overlay scroll', () => {
  test('keeps the facade disabled when content fits inside the viewport', () => {
    const metrics = resolveLegacyOverlayScrollMetrics({
      contentHeight: 240,
      offset: 30,
      viewport: { left: 20, top: 40, width: 300, height: 260 }
    });

    expect(metrics.enabled).toBe(false);
    expect(metrics.maxOffset).toBe(0);
    expect(metrics.offset).toBe(0);
    expect(metrics.thumb.height).toBe(metrics.track.height);
    expect(metrics.topFadeAlpha).toBe(0);
    expect(metrics.bottomFadeAlpha).toBe(0);
  });

  test('clamps mobile pause scrolling and maps offset to the vertical rail thumb', () => {
    const metrics = resolveLegacyOverlayScrollMetrics({
      contentHeight: 640,
      offset: 190,
      viewport: { left: 24, top: 96, width: 328, height: 360 }
    });

    expect(metrics.enabled).toBe(true);
    expect(metrics.maxOffset).toBe(280);
    expect(metrics.offset).toBe(190);
    expect(metrics.track.left).toBe(344);
    expect(metrics.track.top).toBe(104);
    expect(metrics.track.height).toBe(344);
    expect(metrics.thumb.height).toBeCloseTo(193.5, 1);
    expect(metrics.thumb.top).toBeGreaterThan(metrics.track.top);
    expect(metrics.thumb.top + metrics.thumb.height).toBeLessThanOrEqual(metrics.track.top + metrics.track.height);
    expect(metrics.topFadeAlpha).toBeGreaterThan(0);
    expect(metrics.bottomFadeAlpha).toBeGreaterThan(0);
  });

  test('prevents negative and over-max scroll offsets', () => {
    expect(clampLegacyOverlayScrollOffset(-20, 120)).toBe(0);
    expect(clampLegacyOverlayScrollOffset(200, 120)).toBe(120);
  });

  test('clips scrolling at the real viewport edge instead of double-counting the offset', () => {
    const viewport = { left: 24, top: 84, width: 342, height: 626 };

    expect(resolveLegacyOverlayScrollRenderRect(viewport)).toEqual({
      height: 622,
      left: 24,
      top: 86,
      width: 342
    });
  });

  test('keeps partially visible labels mounted so the mask can clip them smoothly', () => {
    const viewport = { left: 24, top: 86, width: 342, height: 622 };

    expect(legacyOverlayScrollRectIntersectsViewport(
      { left: 123, top: 83.5, width: 123, height: 21 },
      viewport
    )).toBe(true);
    expect(legacyOverlayScrollRectIntersectsViewport(
      { left: 123, top: 60, width: 123, height: 20 },
      viewport
    )).toBe(false);
  });
});
