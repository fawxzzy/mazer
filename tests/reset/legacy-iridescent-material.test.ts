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

  test('cycles the trail through the midnight-rainbow material, varying by both position and time', () => {
    // Swapped with the player per feedback -- the trail now carries the
    // moving rainbow material the player used to have, and the player is
    // the flat green anchor instead (see the player-core test below).
    const headAtStart = resolveLegacyIridescentTrailColor(0, 12, 0, LEGACY_IRIDESCENT_GREEN_ANCHOR);
    const tailAtStart = resolveLegacyIridescentTrailColor(11, 12, 0, LEGACY_IRIDESCENT_GREEN_ANCHOR);
    const headLater = resolveLegacyIridescentTrailColor(0, 12, LEGACY_IRIDESCENT_PLAYER_SHIFT_PERIOD_MS / 4, LEGACY_IRIDESCENT_GREEN_ANCHOR);

    expect(headAtStart).toBe(LEGACY_IRIDESCENT_MIDNIGHT_STOPS[0]);
    // Different position along the trail at the same instant reads a
    // different point in the color cycle than the head does.
    expect(tailAtStart).not.toBe(headAtStart);
    // The same position (the head) reads a different color once time has
    // moved on -- the whole gradient flows, it isn't a static per-tile hue.
    expect(headLater).not.toBe(headAtStart);
    // A single-tile trail has no position spread to vary by -- still time-
    // driven only.
    expect(resolveLegacyIridescentTrailColor(0, 1, 0)).toBe(LEGACY_IRIDESCENT_MIDNIGHT_STOPS[0]);
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

  test('pins the player core to the flat green anchor regardless of time -- the rainbow material moved to the trail', () => {
    const start = resolveLegacyIridescentPlayerCoreColor(0);
    const quarterWay = resolveLegacyIridescentPlayerCoreColor(LEGACY_IRIDESCENT_PLAYER_SHIFT_PERIOD_MS / 4);
    const fullCycle = resolveLegacyIridescentPlayerCoreColor(LEGACY_IRIDESCENT_PLAYER_SHIFT_PERIOD_MS);

    expect(start).toBe(LEGACY_IRIDESCENT_GREEN_ANCHOR);
    expect(quarterWay).toBe(LEGACY_IRIDESCENT_GREEN_ANCHOR);
    expect(fullCycle).toBe(LEGACY_IRIDESCENT_GREEN_ANCHOR);
  });

  test('keeps the accent rim a darker shade of the same green, distinct from the flat core', () => {
    const core = resolveLegacyIridescentPlayerCoreColor(1000);
    const accent = resolveLegacyIridescentPlayerAccentColor(1000);

    expect(core).toBe(LEGACY_IRIDESCENT_GREEN_ANCHOR);
    expect(accent).not.toBe(core);
  });

  test('keeps every midnight-rainbow stop comfortably distant from the pale maze path', () => {
    for (const stop of LEGACY_IRIDESCENT_MIDNIGHT_STOPS) {
      expect(measureLegacyIridescentColorDistance(stop, LEGACY_IRIDESCENT_PATH_CORE_CONTRAST_COLOR))
        .toBeGreaterThanOrEqual(LEGACY_IRIDESCENT_MIN_PATH_COLOR_DISTANCE);
    }
  });
});
