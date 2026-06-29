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
  });

  test('keeps side-button chrome readable without turning into dense shell UI', () => {
    const secondary = resolveLegacyMenuButtonChrome({
      width: 144,
      height: 54,
      textLength: 7,
      isPrimary: false
    });

    expect(secondary.fontSize).toBeGreaterThanOrEqual(18);
    expect(secondary.fontSize).toBeLessThanOrEqual(30);
    expect(secondary.baseAlpha).toBeLessThan(0.05);
    expect(secondary.hoverAlpha).toBeLessThan(0.1);
    expect(secondary.strokeWidth).toBe(1);
  });
});
