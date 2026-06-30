import { describe, expect, test } from 'vitest';
import {
  resolveLegacyNestedOverlayOpen,
  resolveLegacyOverlayBackAction
} from '../../src/legacy-runtime/legacyOverlayRouting';

describe('legacy overlay routing', () => {
  test('opens nested overlays with an explicit parent return target', () => {
    expect(resolveLegacyNestedOverlayOpen('features', 'options')).toEqual({
      overlay: 'features',
      overlayReturn: 'options'
    });

    expect(resolveLegacyNestedOverlayOpen('gameModes', 'pause')).toEqual({
      overlay: 'gameModes',
      overlayReturn: 'pause'
    });
  });

  test('returns from nested overlays to the correct parent surface', () => {
    expect(resolveLegacyOverlayBackAction({
      mode: 'menu',
      overlay: 'features',
      overlayReturn: 'options'
    })).toEqual({
      kind: 'return-parent',
      overlay: 'options',
      overlayReturn: 'none'
    });

    expect(resolveLegacyOverlayBackAction({
      mode: 'play',
      overlay: 'gameModes',
      overlayReturn: 'pause'
    })).toEqual({
      kind: 'return-parent',
      overlay: 'pause',
      overlayReturn: 'none'
    });
  });

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
  });
});
