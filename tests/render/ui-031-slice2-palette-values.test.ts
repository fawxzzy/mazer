import { describe, expect, it } from 'vitest';
import { LEGACY_IRIDESCENT_MIDNIGHT_STOPS, resolveLegacyIridescentPlayerAccentColor } from '../../src/legacy-runtime/legacyIridescentMaterial';
import { LEGACY_IRIDESCENT_BLACK, LEGACY_IRIDESCENT_MIDNIGHT_STOPS_VALUE, LEGACY_IRIDESCENT_PATH_FALLBACK_PINK } from '../../src/render/trailPalette';
import { MIDNIGHT_RAINBOW_STOPS } from '../../src/render/palette';

// MAZER-UI-031 slice 2: literals moved to colour-definition files; values and order pinned (no visible change).
describe('MAZER-UI-031 slice 2 palette values', () => {
  it('keeps the board midnight-rainbow ramp', () => {
    expect([...MIDNIGHT_RAINBOW_STOPS]).toEqual([0x1e1238, 0x35206a, 0x6d2fb0, 0xb83f98, 0xf28d4c, 0x23b4ad]);
  });
  it('keeps the legacy iridescent stops, fallback and black', () => {
    expect([...LEGACY_IRIDESCENT_MIDNIGHT_STOPS]).toEqual([0x8b2fe0, 0x4a2fe0, 0x2f7fe0, 0x2fe0c0, 0x2fe06a, 0xe02f9c]);
    expect(LEGACY_IRIDESCENT_MIDNIGHT_STOPS).toBe(LEGACY_IRIDESCENT_MIDNIGHT_STOPS_VALUE);
    expect(LEGACY_IRIDESCENT_PATH_FALLBACK_PINK).toBe(0xff61c7);
    expect(LEGACY_IRIDESCENT_BLACK).toBe(0x000000);
  });
});
