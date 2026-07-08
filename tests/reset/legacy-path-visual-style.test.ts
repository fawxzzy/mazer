import { describe, expect, test } from 'vitest';

import { resolveLegacyPathVisualStyle } from '../../src/legacy-runtime/legacyPathVisualStyle';

describe('legacy path visual style route flag', () => {
  test('defaults to the clean connected corridor style', () => {
    expect(resolveLegacyPathVisualStyle()).toBe('corridor');
    expect(resolveLegacyPathVisualStyle('?theme=aurora')).toBe('corridor');
    expect(resolveLegacyPathVisualStyle('?pathStyle=debug')).toBe('corridor');
  });

  test('enables the hybrid tile-cue research style by route flag only', () => {
    expect(resolveLegacyPathVisualStyle('?pathStyle=hybrid')).toBe('hybrid');
    expect(resolveLegacyPathVisualStyle(new URLSearchParams('pathStyle=HYBRID'))).toBe('hybrid');
    expect(resolveLegacyPathVisualStyle('?pathStyle=corridor')).toBe('corridor');
  });
});
