import { describe, expect, test } from 'vitest';
import { resolveLegacyOverlayBackAction } from '../../src/legacy-runtime/legacyOverlayRouting';

describe('legacy overlay routing', () => {
  test('opens pause from active play and closes top-level overlays otherwise', () => {
    expect(resolveLegacyOverlayBackAction({
      mode: 'play',
      overlay: 'none',
      overlayReturn: 'none'
    })).toEqual({
      kind: 'open-overlay',
      overlay: 'pause'
    });

    expect(resolveLegacyOverlayBackAction({
      mode: 'menu',
      overlay: 'none',
      overlayReturn: 'none'
    })).toEqual({
      kind: 'noop'
    });

    expect(resolveLegacyOverlayBackAction({
      mode: 'menu',
      overlay: 'options',
      overlayReturn: 'none'
    })).toEqual({
      kind: 'close-overlay'
    });

    expect(resolveLegacyOverlayBackAction({
      mode: 'play',
      overlay: 'pause',
      overlayReturn: 'none'
    })).toEqual({
      kind: 'close-overlay'
    });
  });
});
