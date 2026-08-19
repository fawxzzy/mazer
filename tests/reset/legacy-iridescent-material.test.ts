import { describe, expect, test } from 'vitest';
import {
  LEGACY_IRIDESCENT_GREEN_ANCHOR,
  LEGACY_IRIDESCENT_MIDNIGHT_STOPS,
  LEGACY_IRIDESCENT_MIN_PATH_COLOR_DISTANCE,
  LEGACY_IRIDESCENT_PATH_CORE_CONTRAST_COLOR,
  LEGACY_IRIDESCENT_PLAYER_SHIFT_PERIOD_MS,
  LEGACY_TRAIL_SHINE_COLOR,
  LEGACY_TRAIL_SHINE_EDGE_COLOR,
  measureLegacyIridescentColorDistance,
  resolveLegacyIridescentPlayerAccentColor,
  resolveLegacyIridescentPlayerCoreColor,
  resolveLegacyIridescentPlayerHaloColor,
  resolveLegacyIridescentPulseColor,
  resolveLegacyIridescentTrailColor,
  resolveLegacyPathSafeIridescentColor
} from '../../src/legacy-runtime/legacyIridescentMaterial';
import { cyberArcadeMaterial } from '../../src/render/cyberArcadeMaterial';

describe('legacy iridescent material', () => {
  test('keeps generated material colors separated from the pale maze path', () => {
    const colors = [
      resolveLegacyIridescentTrailColor(0, 8, 0),
      resolveLegacyIridescentTrailColor(4, 8, 1800),
      resolveLegacyIridescentPlayerHaloColor(1200),
      resolveLegacyIridescentPlayerAccentColor(2200)
    ];

    for (const color of colors) {
      expect(measureLegacyIridescentColorDistance(color, LEGACY_IRIDESCENT_PATH_CORE_CONTRAST_COLOR))
        .toBeGreaterThanOrEqual(LEGACY_IRIDESCENT_MIN_PATH_COLOR_DISTANCE);
    }
  });

  test('pins trail colors to the green readability anchor while rainbow material is deferred', () => {
    const headColor = resolveLegacyIridescentTrailColor(0, 12, 0, LEGACY_IRIDESCENT_GREEN_ANCHOR);
    const tailColor = resolveLegacyIridescentTrailColor(11, 12, 0, LEGACY_IRIDESCENT_GREEN_ANCHOR);
    const laterHeadColor = resolveLegacyIridescentTrailColor(0, 12, 3600, LEGACY_IRIDESCENT_GREEN_ANCHOR);

    expect(headColor).toBe(LEGACY_IRIDESCENT_GREEN_ANCHOR);
    expect(tailColor).toBe(LEGACY_IRIDESCENT_GREEN_ANCHOR);
    expect(laterHeadColor).toBe(LEGACY_IRIDESCENT_GREEN_ANCHOR);
  });

  test('uses the canonical halo and quiet path shine', () => {
    const earlyHalo = resolveLegacyIridescentPlayerHaloColor(0);
    const lateHalo = resolveLegacyIridescentPlayerHaloColor(1800);
    const earlyPulse = resolveLegacyIridescentPulseColor(2, 10, 0);
    const latePulse = resolveLegacyIridescentPulseColor(2, 10, 900);

    expect(earlyHalo).toBe(cyberArcadeMaterial.signal.playerHalo);
    expect(lateHalo).toBe(cyberArcadeMaterial.signal.playerHalo);
    expect(earlyPulse).toBe(LEGACY_TRAIL_SHINE_COLOR);
    expect(latePulse).toBe(LEGACY_TRAIL_SHINE_COLOR);
    expect(resolveLegacyIridescentPulseColor(2, 10, 900, LEGACY_TRAIL_SHINE_EDGE_COLOR))
      .toBe(LEGACY_TRAIL_SHINE_EDGE_COLOR);

    expect(measureLegacyIridescentColorDistance(lateHalo, LEGACY_IRIDESCENT_PATH_CORE_CONTRAST_COLOR))
      .toBeGreaterThanOrEqual(LEGACY_IRIDESCENT_MIN_PATH_COLOR_DISTANCE);
  });

  test('repairs colors that would be too close to the path core', () => {
    expect(resolveLegacyPathSafeIridescentColor(LEGACY_IRIDESCENT_PATH_CORE_CONTRAST_COLOR))
      .toBe(LEGACY_IRIDESCENT_GREEN_ANCHOR);
  });

  test('cycles the player core through the midnight-rainbow jewel-tone stops over time (Terraria Midnight Rainbow dye style)', () => {
    const start = resolveLegacyIridescentPlayerCoreColor(0);
    const quarterWay = resolveLegacyIridescentPlayerCoreColor(LEGACY_IRIDESCENT_PLAYER_SHIFT_PERIOD_MS / 4);
    const fullCycle = resolveLegacyIridescentPlayerCoreColor(LEGACY_IRIDESCENT_PLAYER_SHIFT_PERIOD_MS);

    expect(start).toBe(LEGACY_IRIDESCENT_MIDNIGHT_STOPS[0]);
    expect(quarterWay).not.toBe(start);
    expect(fullCycle).toBe(start);
  });

  test('keeps the accent rim a quarter-phase ahead of the core so they read as two adjacent hues, not one flat color', () => {
    const core = resolveLegacyIridescentPlayerCoreColor(1000);
    const accent = resolveLegacyIridescentPlayerAccentColor(1000);

    expect(accent).not.toBe(core);
  });

  test('keeps every midnight-rainbow stop comfortably distant from the pale maze path', () => {
    for (const stop of LEGACY_IRIDESCENT_MIDNIGHT_STOPS) {
      expect(measureLegacyIridescentColorDistance(stop, LEGACY_IRIDESCENT_PATH_CORE_CONTRAST_COLOR))
        .toBeGreaterThanOrEqual(LEGACY_IRIDESCENT_MIN_PATH_COLOR_DISTANCE);
    }
  });
});
