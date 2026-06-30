import { describe, expect, test } from 'vitest';
import { resolveInitialRuntimeMode } from '../../src/legacy-runtime/legacyLaunchMode';

describe('menu launch mode', () => {
  test('defaults to menu mode when the query is absent or unknown', () => {
    expect(resolveInitialRuntimeMode('')).toBe('menu');
    expect(resolveInitialRuntimeMode('?mode=watch')).toBe('menu');
    expect(resolveInitialRuntimeMode('?theme=aurora')).toBe('menu');
  });

  test('promotes the proof route into active play when mode=play is present', () => {
    expect(resolveInitialRuntimeMode('?content=core-only&mode=play&theme=aurora')).toBe('play');
    expect(resolveInitialRuntimeMode('mode=play')).toBe('play');
  });
});
