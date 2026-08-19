import { describe, expect, test } from 'vitest';
import {
  resolveLegacyHeaderControlFrame,
  resolveLegacyHeaderControlMetricFontSize
} from '../../src/legacy-runtime/legacyHeaderControl';

describe('legacy header controls', () => {
  test('uses one square size for the level and settings controls', () => {
    const shared = {
      height: 958,
      hudHeight: 64,
      hudTop: 0,
      width: 405
    };
    const level = resolveLegacyHeaderControlFrame({ ...shared, placement: 'leading' });
    const settings = resolveLegacyHeaderControlFrame({ ...shared, placement: 'trailing' });

    expect(level.width).toBe(36);
    expect(level.height).toBe(36);
    expect(settings.width).toBe(level.width);
    expect(settings.height).toBe(level.height);
    expect(settings.top).toBe(level.top);
    expect(settings.left).toBeGreaterThan(level.left);
  });

  test('keeps a secondary menu metric square between the player level and settings control', () => {
    const shared = {
      height: 568,
      hudHeight: 56,
      hudTop: 0,
      width: 320
    };
    const playerLevel = resolveLegacyHeaderControlFrame({ ...shared, placement: 'leading' });
    const aiLevel = resolveLegacyHeaderControlFrame({ ...shared, placement: 'leading', slot: 1 });
    const settings = resolveLegacyHeaderControlFrame({ ...shared, placement: 'trailing' });

    expect(aiLevel.width).toBe(playerLevel.width);
    expect(aiLevel.height).toBe(playerLevel.height);
    expect(aiLevel.left - playerLevel.right).toBeGreaterThanOrEqual(8);
    expect(settings.left - aiLevel.right).toBeGreaterThanOrEqual(8);
    expect(aiLevel.top).toBe(playerLevel.top);
  });

  test('stays in the declared compact range at phone and desktop sizes', () => {
    const phone = resolveLegacyHeaderControlFrame({
      height: 844,
      hudHeight: 60,
      hudTop: 0,
      placement: 'leading',
      width: 390
    });
    const desktop = resolveLegacyHeaderControlFrame({
      height: 900,
      hudHeight: 72,
      hudTop: 0,
      placement: 'leading',
      width: 1440
    });

    expect(phone.width).toBe(36);
    expect(desktop.width).toBe(40);
    expect(desktop.left).toBeGreaterThanOrEqual(8);
    expect(desktop.top).toBeGreaterThanOrEqual(6);
  });

  test('keeps current and future metric values readable without widening the square', () => {
    expect(resolveLegacyHeaderControlMetricFontSize(7, 44)).toBeGreaterThan(
      resolveLegacyHeaderControlMetricFontSize(99, 44)
    );
    expect(resolveLegacyHeaderControlMetricFontSize(99, 44)).toBeGreaterThanOrEqual(14);
    expect(resolveLegacyHeaderControlMetricFontSize(100, 44)).toBeGreaterThanOrEqual(14);
  });
});
