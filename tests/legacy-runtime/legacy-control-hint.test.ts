import { describe, expect, it } from 'vitest';

import {
  LEGACY_CONTROL_HINT_COPY_KEYS,
  LEGACY_CONTROL_HINT_COPY_MOUSE,
  LEGACY_CONTROL_HINT_COPY_NEUTRAL,
  LEGACY_CONTROL_HINT_COPY_TOUCH,
  classifyLegacyControlHintPointer,
  resolveLegacyControlHintInput,
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

  it('has fixed wording per input kind: two short lines, move line then the goal', () => {
    expect(LEGACY_CONTROL_HINT_COPY_TOUCH).toBe('Touch and drag anywhere to move.\nReach the star to clear the maze.');
    expect(LEGACY_CONTROL_HINT_COPY_MOUSE).toBe('Click and drag, or use arrows / WASD.\nReach the star to clear the maze.');
    expect(LEGACY_CONTROL_HINT_COPY_KEYS).toBe('Arrow keys or WASD to move.\nReach the star to clear the maze.');
    expect(LEGACY_CONTROL_HINT_COPY_NEUTRAL).toBe('Drag anywhere, or use arrows / WASD.\nReach the star to clear the maze.');
    for (const input of ['touch', 'mouse', 'keys', 'neutral'] as const) {
      const lines = resolveLegacyControlHintCopy(input).split('\n');
      expect(lines).toHaveLength(2);
      for (const line of lines) expect(line.length).toBeLessThanOrEqual(40);
    }
    expect(resolveLegacyControlHintCopy('touch')).toBe(LEGACY_CONTROL_HINT_COPY_TOUCH);
    expect(resolveLegacyControlHintCopy('mouse')).toBe(LEGACY_CONTROL_HINT_COPY_MOUSE);
    expect(resolveLegacyControlHintCopy('keys')).toBe(LEGACY_CONTROL_HINT_COPY_KEYS);
    expect(resolveLegacyControlHintCopy('neutral')).toBe(LEGACY_CONTROL_HINT_COPY_NEUTRAL);
  });

  it('is an instant fade under reduced motion', () => {
    expect(resolveLegacyControlHintFadeMs(true)).toBe(0);
    expect(resolveLegacyControlHintFadeMs(false)).toBeGreaterThan(0);
  });

  describe('input resolver: touch by default, then the input actually used', () => {
    const phone = { coarsePointer: true, finePointer: false, hoverCapable: false };
    const computer = { coarsePointer: false, finePointer: true, hoverCapable: true, maxTouchPoints: 0 };
    const hybrid = { coarsePointer: false, finePointer: true, hoverCapable: true, maxTouchPoints: 10 };

    it('defaults to touch unless the device positively looks like a computer', () => {
      expect(resolveLegacyControlHintInput({})).toBe('touch');
      expect(resolveLegacyControlHintInput(phone)).toBe('touch');
      expect(resolveLegacyControlHintInput({ coarsePointer: false, finePointer: false })).toBe('touch');
      expect(resolveLegacyControlHintInput({ ...computer, standalone: true })).toBe('touch');
      expect(resolveLegacyControlHintInput({ ...computer, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)' })).toBe('touch');
      expect(resolveLegacyControlHintInput({ ...computer, userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) Mobile' })).toBe('touch');
      expect(resolveLegacyControlHintInput({ ...computer, userAgent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/120' })).toBe('neutral');
      expect(resolveLegacyControlHintInput(computer)).toBe('neutral');
      expect(resolveLegacyControlHintInput(hybrid)).toBe('neutral');
    });

    it('the last real input wins, on any device', () => {
      expect(resolveLegacyControlHintInput({ ...computer, lastInput: 'mouse' })).toBe('mouse');
      expect(resolveLegacyControlHintInput({ ...computer, lastInput: 'keys' })).toBe('keys');
      expect(resolveLegacyControlHintInput({ ...computer, lastInput: 'touch' })).toBe('touch');
      expect(resolveLegacyControlHintInput({ ...hybrid, lastInput: 'touch' })).toBe('touch');
      expect(resolveLegacyControlHintInput({ ...phone, lastInput: 'keys' })).toBe('keys');
      expect(resolveLegacyControlHintInput({ ...phone, lastInput: 'mouse' })).toBe('mouse');
      expect(resolveLegacyControlHintInput({ ...phone, lastInput: null })).toBe('touch');
    });

    it('classifies pointer events: touch and pen are touch, mouse is mouse, unknown is ignored', () => {
      expect(classifyLegacyControlHintPointer('touch')).toBe('touch');
      expect(classifyLegacyControlHintPointer('pen')).toBe('touch');
      expect(classifyLegacyControlHintPointer('mouse')).toBe('mouse');
      expect(classifyLegacyControlHintPointer('')).toBeNull();
    });

    it('a hybrid switches touch -> keys -> touch as the player changes input', () => {
      let last: 'touch' | 'mouse' | 'keys' | null = null;
      const input = () => resolveLegacyControlHintInput({ ...hybrid, lastInput: last });
      expect(input()).toBe('neutral');
      last = 'touch'; expect(input()).toBe('touch');
      last = 'keys'; expect(input()).toBe('keys');
      last = 'touch'; expect(input()).toBe('touch');
      last = 'mouse'; expect(input()).toBe('mouse');
    });
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
