import { describe, expect, test } from 'vitest';
import {
  LEGACY_IRIDESCENT_GREEN_ANCHOR,
  LEGACY_IRIDESCENT_MIN_PATH_COLOR_DISTANCE,
  LEGACY_IRIDESCENT_PATH_CORE_CONTRAST_COLOR,
  measureLegacyIridescentColorDistance,
  resolveLegacyIridescentPlayerAccentColor,
  resolveLegacyIridescentPlayerCoreColor,
  resolveLegacyIridescentPlayerHaloColor,
  resolveLegacyIridescentPulseColor,
  resolveLegacyIridescentTrailColor,
  resolveLegacyPathSafeIridescentColor
} from '../../src/legacy-runtime/legacyIridescentMaterial';

describe('legacy iridescent material', () => {
  test('keeps generated material colors separated from the pale maze path', () => {
    const colors = [
      resolveLegacyIridescentTrailColor(0, 8, 0),
      resolveLegacyIridescentTrailColor(4, 8, 1800),
      resolveLegacyIridescentPulseColor(3, 8, 900),
      resolveLegacyIridescentPlayerHaloColor(1200),
      resolveLegacyIridescentPlayerAccentColor(2200)
    ];

    for (const color of colors) {
      expect(measureLegacyIridescentColorDistance(color, LEGACY_IRIDESCENT_PATH_CORE_CONTRAST_COLOR))
        .toBeGreaterThanOrEqual(LEGACY_IRIDESCENT_MIN_PATH_COLOR_DISTANCE);
    }
  });

  test('uses a green-readable anchor while shifting trail colors over time and path position', () => {
    const headColor = resolveLegacyIridescentTrailColor(0, 12, 0, LEGACY_IRIDESCENT_GREEN_ANCHOR);
    const tailColor = resolveLegacyIridescentTrailColor(11, 12, 0, LEGACY_IRIDESCENT_GREEN_ANCHOR);
    const laterHeadColor = resolveLegacyIridescentTrailColor(0, 12, 3600, LEGACY_IRIDESCENT_GREEN_ANCHOR);

    expect(headColor).not.toBe(tailColor);
    expect(headColor).not.toBe(laterHeadColor);
    expect(measureLegacyIridescentColorDistance(headColor, LEGACY_IRIDESCENT_GREEN_ANCHOR)).toBeLessThan(125);
  });

  test('shifts player halo, player accent, and pulse colors without matching the path', () => {
    const earlyHalo = resolveLegacyIridescentPlayerHaloColor(0);
    const lateHalo = resolveLegacyIridescentPlayerHaloColor(1800);
    const earlyAccent = resolveLegacyIridescentPlayerAccentColor(0);
    const lateAccent = resolveLegacyIridescentPlayerAccentColor(2100);
    const earlyPulse = resolveLegacyIridescentPulseColor(2, 10, 0);
    const latePulse = resolveLegacyIridescentPulseColor(2, 10, 900);

    expect(earlyHalo).not.toBe(lateHalo);
    expect(earlyAccent).not.toBe(lateAccent);
    expect(earlyPulse).not.toBe(latePulse);

    for (const color of [lateHalo, lateAccent, latePulse]) {
      expect(measureLegacyIridescentColorDistance(color, LEGACY_IRIDESCENT_PATH_CORE_CONTRAST_COLOR))
        .toBeGreaterThanOrEqual(LEGACY_IRIDESCENT_MIN_PATH_COLOR_DISTANCE);
    }
  });

  test('repairs colors that would be too close to the path core', () => {
    expect(resolveLegacyPathSafeIridescentColor(LEGACY_IRIDESCENT_PATH_CORE_CONTRAST_COLOR))
      .toBe(LEGACY_IRIDESCENT_GREEN_ANCHOR);
  });

  test('keeps the player core locked to the green readability anchor', () => {
    expect(resolveLegacyIridescentPlayerCoreColor()).toBe(0x36ff7d);
  });
});
