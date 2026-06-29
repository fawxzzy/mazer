import { describe, expect, test } from 'vitest';
import { resolveLegacyMenuTitlePresentation } from '../../src/legacy-runtime/legacyMenuTitle';

describe('legacy menu title presentation', () => {
  test('keeps the desktop wordmark translucent and compact relative to the board', () => {
    const presentation = resolveLegacyMenuTitlePresentation(637, 13, false);

    expect(presentation.fontSize).toBeGreaterThanOrEqual(80);
    expect(presentation.fontSize).toBeLessThanOrEqual(90);
    expect(presentation.shadowOffsetX).toBeGreaterThanOrEqual(3);
    expect(presentation.shadowOffsetY).toBeGreaterThanOrEqual(5);
    expect(presentation.titleAlpha).toBeLessThan(0.5);
    expect(presentation.shadowAlpha).toBeLessThan(presentation.titleAlpha);
  });

  test('keeps the portrait wordmark readable without inflating to recovery-shell scale', () => {
    const presentation = resolveLegacyMenuTitlePresentation(387, 7, true);

    expect(presentation.fontSize).toBeGreaterThanOrEqual(42);
    expect(presentation.fontSize).toBeLessThanOrEqual(46);
    expect(presentation.shadowOffsetX).toBeGreaterThanOrEqual(2);
    expect(presentation.shadowOffsetY).toBeGreaterThanOrEqual(4);
    expect(presentation.titleAlpha).toBeLessThan(0.5);
    expect(presentation.shadowAlpha).toBeLessThan(presentation.titleAlpha);
  });
});
