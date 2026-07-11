import { describe, expect, test } from 'vitest';
import {
  DEFAULT_LEGACY_RUNTIME_SEED,
  createLegacyRuntimeRandomSeed,
  normalizeLegacyRuntimeSeed,
  parseLegacyRuntimeSeed,
  resolveInitialLegacyRuntimeSeed
} from '../../src/legacy-runtime/legacyRuntimeSeed';

describe('legacy runtime seed ownership', () => {
  test('normalizes invalid or empty seeds back to the legacy fallback', () => {
    expect(normalizeLegacyRuntimeSeed(0)).toBe(DEFAULT_LEGACY_RUNTIME_SEED);
    expect(normalizeLegacyRuntimeSeed(Number.NaN)).toBe(DEFAULT_LEGACY_RUNTIME_SEED);
    expect(normalizeLegacyRuntimeSeed(-42)).toBe(42);
    expect(normalizeLegacyRuntimeSeed(42.9)).toBe(42);
  });

  test('supports deterministic explicit seed query parameters for proof routes', () => {
    expect(parseLegacyRuntimeSeed('?content=core-only&mazeSeed=902')).toBe(902);
    expect(parseLegacyRuntimeSeed('mode=play&seed=3749')).toBe(3749);
    expect(parseLegacyRuntimeSeed('?mazeSeed=bad&seed=18')).toBe(18);
    expect(resolveInitialLegacyRuntimeSeed('?mazeSeed=144')).toEqual({
      explicit: true,
      seed: 144
    });
  });

  test('creates fresh unpinned launch seeds from runtime entropy', () => {
    const firstSeed = createLegacyRuntimeRandomSeed({
      nowMs: 1200,
      previousSeed: 3749,
      random: () => 0.125
    });
    const secondSeed = createLegacyRuntimeRandomSeed({
      nowMs: 1201,
      previousSeed: 3749,
      random: () => 0.875
    });

    expect(firstSeed).not.toBe(3749);
    expect(secondSeed).not.toBe(3749);
    expect(secondSeed).not.toBe(firstSeed);
    expect(resolveInitialLegacyRuntimeSeed('', {
      nowMs: 1200,
      previousSeed: 3749,
      random: () => 0.125
    })).toEqual({
      explicit: false,
      seed: firstSeed
    });
  });
});
