import { describe, expect, it } from 'vitest';

import {
  LEGACY_CONTROL_HINT_COPY_KEYS,
  LEGACY_CONTROL_HINT_COPY_TOUCH,
  LEGACY_CONTROL_HINT_DEVICE_ID,
  LEGACY_CONTROL_HINT_REGISTRY,
  LEGACY_CONTROL_HINT_TOKEN,
  isLegacyControlHintDrag,
  isLegacyControlHintMoveKey,
  resolveLegacyControlHintCopy,
  resolveLegacyControlHintFadeMs,
  shouldShowLegacyControlHint
} from '../../src/legacy-runtime/legacyControlHint.ts';
import { createTutorialAckStore } from '../../src/tutorial/tutorialAckStore.ts';
import { validateTutorialRegistry } from '../../src/tutorial/tutorialRegistry.ts';

const memoryStorage = () => {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => { data.set(k, v); },
    removeItem: (k: string) => { data.delete(k); }
  };
};

describe('legacy control hint (MAZER-FLOW-001)', () => {
  const base = { mode: 'play', overlay: 'none', level: 1, acknowledged: false };

  it('shows only for a new player in play on level 1 with no overlay', () => {
    expect(shouldShowLegacyControlHint(base)).toBe(true);
    expect(shouldShowLegacyControlHint({ ...base, level: 2 })).toBe(false);
    expect(shouldShowLegacyControlHint({ ...base, level: null })).toBe(false);
    expect(shouldShowLegacyControlHint({ ...base, mode: 'menu' })).toBe(false);
    expect(shouldShowLegacyControlHint({ ...base, overlay: 'options' })).toBe(false);
    expect(shouldShowLegacyControlHint({ ...base, acknowledged: true })).toBe(false);
  });

  it('counts arrows, WASD and a real drag as the first move, not a tap or other keys', () => {
    for (const key of ['ArrowUp', 'a', 'D']) expect(isLegacyControlHintMoveKey(key)).toBe(true);
    for (const key of ['Enter', 'p', 'Escape']) expect(isLegacyControlHintMoveKey(key)).toBe(false);
    expect(isLegacyControlHintDrag(2, 2)).toBe(false);
    expect(isLegacyControlHintDrag(0, 12)).toBe(true);
  });

  it('uses one line of copy per input kind and an instant fade under reduced motion', () => {
    expect(resolveLegacyControlHintCopy(true)).toBe(LEGACY_CONTROL_HINT_COPY_TOUCH);
    expect(resolveLegacyControlHintCopy(false)).toBe(LEGACY_CONTROL_HINT_COPY_KEYS);
    expect(resolveLegacyControlHintFadeMs(true)).toBe(0);
    expect(resolveLegacyControlHintFadeMs(false)).toBeGreaterThan(0);
  });

  it('is a valid one-time tutorial token acknowledged per device, not per account', () => {
    expect(validateTutorialRegistry(LEGACY_CONTROL_HINT_REGISTRY).ok).toBe(true);
    const storage = memoryStorage();
    const store = createTutorialAckStore({ storage, accountId: LEGACY_CONTROL_HINT_DEVICE_ID });
    expect(store.isAcknowledged(LEGACY_CONTROL_HINT_TOKEN)).toBe(false);
    store.acknowledge(LEGACY_CONTROL_HINT_TOKEN);
    const again = createTutorialAckStore({ storage, accountId: LEGACY_CONTROL_HINT_DEVICE_ID });
    expect(again.isAcknowledged(LEGACY_CONTROL_HINT_TOKEN)).toBe(true);
  });
});
