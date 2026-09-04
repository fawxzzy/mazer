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

  test('routes confirm-progression-reset back to its real origin, not always pause', () => {
    expect(resolveLegacyOverlayBackAction({
      mode: 'play',
      overlay: 'confirm-progression-reset',
      overlayReturn: 'pause'
    })).toEqual({
      kind: 'open-overlay',
      overlay: 'pause'
    });

    expect(resolveLegacyOverlayBackAction({
      mode: 'menu',
      overlay: 'confirm-progression-reset',
      overlayReturn: 'auth'
    })).toEqual({
      kind: 'open-overlay',
      overlay: 'auth'
    });

    // Unknown/unrecorded origin falls back to the prior always-pause behavior
    // rather than routing somewhere it was never actually opened from.
    expect(resolveLegacyOverlayBackAction({
      mode: 'play',
      overlay: 'confirm-progression-reset',
      overlayReturn: 'none'
    })).toEqual({
      kind: 'open-overlay',
      overlay: 'pause'
    });
  });
});
