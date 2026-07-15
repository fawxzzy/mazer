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
    expect(primary.fillColor).toBe(0x06170f);
    expect(primary.hoverFillColor).toBe(0x0a2a1a);
    expect(primary.fontSize).toBeGreaterThanOrEqual(secondary.fontSize);
    expect(primary.labelAlpha).toBeGreaterThan(secondary.labelAlpha);
    expect(primary.strokeWidth).toBeGreaterThanOrEqual(secondary.strokeWidth);
    expect(primary.textColor).toBe('#36ff7d');
    expect(secondary.textColor).toBe('#ecfff5');
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
    expect(secondary.fillColor).toBe(0x07131d);
    expect(secondary.hoverFillColor).toBe(0x0b1f2b);
    expect(secondary.strokeColor).toBe(0xb7f2ff);
    expect(secondary.hoverAlpha).toBeGreaterThan(0.12);
    expect(secondary.labelAlpha).toBeGreaterThanOrEqual(0.98);
    expect(secondary.strokeWidth).toBe(2);
  });

  test('reserves vertical breathing room for compact mobile menu buttons', () => {
    const primary = resolveLegacyMenuButtonChrome({
      width: 118,
      height: 42,
      textLength: 5,
      isPrimary: true
    });
    const secondary = resolveLegacyMenuButtonChrome({
      width: 118,
      height: 42,
      textLength: 7,
      isPrimary: false
    });

    expect(primary.fontSize).toBeLessThan(24);
    expect(secondary.fontSize).toBeLessThan(20);
    expect(primary.fontSize).toBeGreaterThanOrEqual(16);
    expect(secondary.fontSize).toBeGreaterThanOrEqual(16);
  });
});
