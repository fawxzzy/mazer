import { describe, expect, test } from 'vitest';
import { resolveLegacyMenuTitlePresentation } from '../../src/legacy-runtime/legacyMenuTitle';

describe('legacy menu title presentation', () => {
  test('keeps the desktop wordmark large enough to overlap the board like the legacy screen', () => {
    const presentation = resolveLegacyMenuTitlePresentation(637, 13, false);

    expect(presentation.fontSize).toBeGreaterThanOrEqual(148);
    expect(presentation.fontSize).toBeLessThanOrEqual(152);
    expect(presentation.shadowOffsetX).toBeGreaterThanOrEqual(5);
    expect(presentation.shadowOffsetY).toBeGreaterThanOrEqual(7);
    expect(presentation.titleAlpha).toBeGreaterThan(0.74);
    expect(presentation.shadowAlpha).toBeLessThan(presentation.titleAlpha);
  });

  test('keeps the portrait wordmark readable while still overlapping the board more deeply', () => {
    const presentation = resolveLegacyMenuTitlePresentation(387, 7, true);

    expect(presentation.fontSize).toBeGreaterThanOrEqual(76);
    expect(presentation.fontSize).toBeLessThanOrEqual(80);
    expect(presentation.shadowOffsetX).toBeGreaterThanOrEqual(4);
    expect(presentation.shadowOffsetY).toBeGreaterThanOrEqual(6);
    expect(presentation.titleAlpha).toBeGreaterThan(0.76);
    expect(presentation.shadowAlpha).toBeLessThan(presentation.titleAlpha);
  });
});
