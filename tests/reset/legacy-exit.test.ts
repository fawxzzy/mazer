import { describe, expect, test, vi } from 'vitest';
import {
  performLegacyBrowserSafeExit,
  resolveLegacyExitAction
} from '../../src/legacy-runtime/legacyExit';

describe('legacy exit', () => {
  test('resolves browser-safe exit to an about:blank replacement fallback', () => {
    expect(resolveLegacyExitAction()).toEqual({
      kind: 'replace-about-blank',
      targetUrl: 'about:blank'
    });
  });

  test('attempts window close before the durable navigation fallback', () => {
    const close = vi.fn();
    const replace = vi.fn();

    const action = performLegacyBrowserSafeExit({
      close,
      location: {
        replace
      }
    });

    expect(action).toEqual({
      kind: 'replace-about-blank',
      targetUrl: 'about:blank'
    });
    expect(close).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith('about:blank');
  });

  test('still navigates to about:blank when window.close throws', () => {
    const replace = vi.fn();

    performLegacyBrowserSafeExit({
      close: () => {
        throw new Error('blocked');
      },
      location: {
        replace
      }
    });

    expect(replace).toHaveBeenCalledWith('about:blank');
  });
});
