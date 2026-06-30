import { describe, expect, test } from 'vitest';
import { resolveLegacyMenuTitlePresentation } from '../../src/legacy-runtime/legacyMenuTitle';

describe('legacy menu title presentation', () => {
  test('keeps the desktop wordmark large enough to overlap the board like the legacy screen', () => {
    const presentation = resolveLegacyMenuTitlePresentation(833, 17, false);

    expect(presentation.fontSize).toBeGreaterThanOrEqual(184);
    expect(presentation.fontSize).toBeLessThanOrEqual(190);
    expect(presentation.shadowOffsetX).toBeGreaterThanOrEqual(5);
    expect(presentation.shadowOffsetY).toBeGreaterThanOrEqual(7);
    expect(presentation.titleAlpha).toBeGreaterThanOrEqual(0.8);
    expect(presentation.shadowAlpha).toBeLessThan(presentation.titleAlpha);
  });

  test('keeps the portrait wordmark readable while still overlapping the board more deeply', () => {
    const presentation = resolveLegacyMenuTitlePresentation(387, 7, true);

    expect(presentation.fontSize).toBeGreaterThanOrEqual(79);
    expect(presentation.fontSize).toBeLessThanOrEqual(81);
    expect(presentation.shadowOffsetX).toBeGreaterThanOrEqual(4);
    expect(presentation.shadowOffsetY).toBeGreaterThanOrEqual(6);
    expect(presentation.titleAlpha).toBeGreaterThan(0.82);
    expect(presentation.shadowAlpha).toBeLessThan(presentation.titleAlpha);
  });
});
