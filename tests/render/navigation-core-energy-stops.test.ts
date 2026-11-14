import { describe, expect, it } from 'vitest';
import { NAVIGATION_CORE_TRAIL_ENERGY_STOPS as fromTrail } from '../../src/render/navigationCoreTrail';
import { NAVIGATION_CORE_TRAIL_ENERGY_STOPS as fromPalette } from '../../src/render/trailPalette';

// MAZER-UI-031 slice 1: the Navigation Core ENERGY palette moved to the colour-definition file trailPalette.ts.
// Pixel-identical by construction: the values, their order and the old export are pinned here.
describe('Navigation Core ENERGY stops (MAZER-UI-031 slice 1)', () => {
  it('keeps the exact shipped values in the exact cyclic order', () => {
    expect([...fromPalette]).toEqual([
      0x00d4ff, 0x2f8bff, 0x8b3ff0, 0xe030c0, 0xff3d5c, 0xff8a2f, 0xffd23d, 0x3de07a
    ]);
  });

  it('is still exported, as the same array, from navigationCoreTrail', () => {
    expect(fromTrail).toBe(fromPalette);
  });
});
