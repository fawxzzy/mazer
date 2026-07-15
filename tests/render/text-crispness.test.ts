import { describe, expect, test } from 'vitest';
import { resolveHudTextResolution } from '../../src/render/textCrispness';

describe('resolveHudTextResolution', () => {
  test('does not multiply the DPR transform already owned by the game canvas', () => {
    const phoneViewport = { height: 852, width: 393 };

    expect(resolveHudTextResolution(phoneViewport, 1)).toBe(1);
    expect(resolveHudTextResolution(phoneViewport, 1.5)).toBe(1);
    expect(resolveHudTextResolution(phoneViewport, 2)).toBe(1);
    expect(resolveHudTextResolution(phoneViewport, 3)).toBe(1);
  });

  test('keeps the same single text transform at every viewport width', () => {
    expect(resolveHudTextResolution({ height: 932, width: 430 }, 2)).toBe(1);
    expect(resolveHudTextResolution({ height: 768, width: 1024 }, 2)).toBe(1);
  });
});
