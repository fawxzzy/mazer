import { describe, expect, test } from 'vitest';

import { resolveLegacyPathVisualStyle } from '../../src/legacy-runtime/legacyPathVisualStyle';

describe('legacy path visual style route flag', () => {
  test('defaults to the clean connected corridor style', () => {
    expect(resolveLegacyPathVisualStyle()).toBe('corridor');
    expect(resolveLegacyPathVisualStyle('?theme=aurora')).toBe('corridor');
    expect(resolveLegacyPathVisualStyle('?pathStyle=debug')).toBe('corridor');
  });

  test('keeps the shipping style corridor-only even when stale URLs request hybrid', () => {
    expect(resolveLegacyPathVisualStyle('?pathStyle=hybrid')).toBe('corridor');
    expect(resolveLegacyPathVisualStyle(new URLSearchParams('pathStyle=HYBRID'))).toBe('corridor');
    expect(resolveLegacyPathVisualStyle('?pathStyle=corridor')).toBe('corridor');
  });
});
