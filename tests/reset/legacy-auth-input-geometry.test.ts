import { describe, expect, test } from 'vitest';
import { resolveLegacyAuthInputCssRect } from '../../src/legacy-runtime/legacyAuthInputGeometry';

describe('legacy auth native input geometry', () => {
  test('maps expanded desktop fields through current layout geometry', () => {
    expect(resolveLegacyAuthInputCssRect(
      { x: 720, y: 327.5, width: 420, height: 60 },
      { left: 0, top: 0, width: 1440, height: 900 },
      { width: 1440, height: 900 }
    )).toEqual({ left: 510, top: 297.5, width: 420, height: 60 });
  });

  test('preserves canvas offsets and CSS scaling', () => {
    expect(resolveLegacyAuthInputCssRect(
      { x: 720, y: 300, width: 420, height: 60 },
      { left: 20, top: 10, width: 720, height: 450 },
      { width: 1440, height: 900 }
    )).toEqual({ left: 275, top: 145, width: 210, height: 30 });
  });
});
