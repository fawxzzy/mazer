import { describe, expect, test } from 'vitest';
import { resolveLegacyMenuButtonChrome } from '../../src/legacy-runtime/legacyMenuButtonChrome';

describe('legacy menu button chrome', () => {
  test('gives the primary Start button slightly stronger chrome than the side buttons', () => {
    const primary = resolveLegacyMenuButtonChrome({
      width: 168,
      height: 54,
      textLength: 5,
      isPrimary: true
    });
    const secondary = resolveLegacyMenuButtonChrome({
      width: 144,
      height: 54,
      textLength: 4,
      isPrimary: false
    });

    expect(primary.baseAlpha).toBeGreaterThan(secondary.baseAlpha);
    expect(primary.baseStroke).toBeGreaterThan(secondary.baseStroke);
    expect(primary.fillColor).toBe(0x0d0715);
    expect(primary.hoverFillColor).toBe(0x151021);
    expect(primary.fontSize).toBeGreaterThanOrEqual(secondary.fontSize);
    expect(primary.labelAlpha).toBeGreaterThan(secondary.labelAlpha);
    expect(primary.strokeWidth).toBeGreaterThanOrEqual(secondary.strokeWidth);
  });

  test('keeps side-button chrome visible enough to survive the narrow live browser pane', () => {
    const secondary = resolveLegacyMenuButtonChrome({
      width: 144,
      height: 54,
      textLength: 7,
      isPrimary: false
    });

    expect(secondary.fontSize).toBeGreaterThanOrEqual(20);
    expect(secondary.fontSize).toBeLessThanOrEqual(32);
    expect(secondary.baseAlpha).toBeGreaterThanOrEqual(0.3);
    expect(secondary.baseAlpha).toBeLessThanOrEqual(0.31);
    expect(secondary.baseStroke).toBeGreaterThanOrEqual(0.52);
    expect(secondary.fillColor).toBe(0x0d0715);
    expect(secondary.hoverAlpha).toBeGreaterThan(0.12);
    expect(secondary.labelAlpha).toBeGreaterThanOrEqual(0.98);
    expect(secondary.strokeWidth).toBe(2);
  });
});
