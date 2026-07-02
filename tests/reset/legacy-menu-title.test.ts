import { describe, expect, test } from 'vitest';
import { resolveLegacyMenuTitlePresentation } from '../../src/legacy-runtime/legacyMenuTitle';

describe('legacy menu title presentation', () => {
  test('keeps the desktop wordmark large enough to overlap the board like the legacy screen', () => {
    const presentation = resolveLegacyMenuTitlePresentation(833, 17, false);

    expect(presentation.fontSize).toBeGreaterThanOrEqual(184);
    expect(presentation.fontSize).toBeLessThanOrEqual(190);
    expect(presentation.shadowOffsetX).toBeGreaterThanOrEqual(5);
    expect(presentation.shadowOffsetY).toBeGreaterThanOrEqual(7);
    expect(presentation.titleAlpha).toBeGreaterThanOrEqual(0.68);
    expect(presentation.titleAlpha).toBeLessThanOrEqual(0.72);
    expect(presentation.shadowAlpha).toBeGreaterThanOrEqual(0.32);
    expect(presentation.shadowAlpha).toBeLessThanOrEqual(0.36);
    expect(presentation.shadowAlpha).toBeLessThan(presentation.titleAlpha);
  });

  test('keeps the portrait wordmark readable while still overlapping the board more deeply', () => {
    const presentation = resolveLegacyMenuTitlePresentation(387, 7, true);

    expect(presentation.fontSize).toBeGreaterThanOrEqual(79);
    expect(presentation.fontSize).toBeLessThanOrEqual(81);
    expect(presentation.shadowOffsetX).toBeGreaterThanOrEqual(4);
    expect(presentation.shadowOffsetY).toBeGreaterThanOrEqual(6);
    expect(presentation.titleAlpha).toBeGreaterThanOrEqual(0.74);
    expect(presentation.titleAlpha).toBeLessThanOrEqual(0.78);
    expect(presentation.shadowAlpha).toBeGreaterThanOrEqual(0.36);
    expect(presentation.shadowAlpha).toBeLessThanOrEqual(0.4);
    expect(presentation.shadowAlpha).toBeLessThan(presentation.titleAlpha);
  });

  test('caps the wordmark in ultra-narrow side panels without changing normal portrait scale', () => {
    const presentation = resolveLegacyMenuTitlePresentation(147, 3, true, 172);

    expect(presentation.fontSize).toBeGreaterThanOrEqual(42);
    expect(presentation.fontSize).toBeLessThanOrEqual(52);
    expect(presentation.fontSize * 3.25).toBeLessThanOrEqual(172);
    expect(presentation.shadowOffsetX).toBeLessThanOrEqual(4);
    expect(presentation.shadowOffsetY).toBeLessThanOrEqual(5);
    expect(presentation.titleAlpha).toBeGreaterThan(presentation.shadowAlpha);
  });

  test('uses a tighter ultra-narrow wordmark for dense generated menu boards', () => {
    const snapshotPresentation = resolveLegacyMenuTitlePresentation(147, 3, true, 172, 'snapshot');
    const proceduralPresentation = resolveLegacyMenuTitlePresentation(147, 3, true, 172, 'procedural');

    expect(proceduralPresentation.fontSize).toBeLessThan(snapshotPresentation.fontSize);
    expect(proceduralPresentation.fontSize).toBeGreaterThanOrEqual(34);
    expect(proceduralPresentation.fontSize).toBeLessThanOrEqual(36);
    expect(proceduralPresentation.fontSize * 3.25).toBeLessThanOrEqual(118);
    expect(proceduralPresentation.titleAlpha).toBeLessThan(snapshotPresentation.titleAlpha);
    expect(proceduralPresentation.titleAlpha).toBeGreaterThan(proceduralPresentation.shadowAlpha);
  });
});
