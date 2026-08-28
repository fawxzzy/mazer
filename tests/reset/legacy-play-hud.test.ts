import { describe, expect, test } from 'vitest';
import { resolveLegacyFrozenElapsedMs } from '../../src/legacy-runtime/legacyPlayHud';

describe('legacy play HUD', () => {
  test('freezes elapsed time at the exact goal-arrival timestamp', () => {
    expect(resolveLegacyFrozenElapsedMs({
      nowMs: 18_000,
      startedAtMs: 10_000
    })).toBe(8_000);
    expect(resolveLegacyFrozenElapsedMs({
      completedAtMs: 16_240,
      nowMs: 99_000,
      startedAtMs: 10_000
    })).toBe(6_240);
  });
});
