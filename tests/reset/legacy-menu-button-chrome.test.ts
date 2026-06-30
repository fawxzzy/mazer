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
    expect(secondary.baseAlpha).toBeGreaterThan(0.06);
    expect(secondary.baseAlpha).toBeLessThan(0.07);
    expect(secondary.hoverAlpha).toBeGreaterThan(0.11);
    expect(secondary.strokeWidth).toBe(2);
  });
});
