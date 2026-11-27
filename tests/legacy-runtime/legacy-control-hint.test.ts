import { describe, expect, it, vi } from 'vitest';

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
import { LEGACY_CONTROL_HINT_ELEMENT_ID, installLegacyControlHint } from '../../src/render/legacyControlHintOverlay.ts';
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

  describe('Level Preview is a no-write sandbox for the hint (first-time spec F15, slice 0)', () => {
    const DEVICE_KEY = 'mazer.tutorial.acks:device';

    /** Minimal window: spy device storage, a body that records appended nodes, a manual poll tick, key dispatch. */
    const fakeWindow = (search: string, seeded: Record<string, string> = {}) => {
      const stored = new Map(Object.entries(seeded));
      const localStorage = {
        getItem: vi.fn((key: string) => stored.get(key) ?? null),
        setItem: vi.fn((key: string, value: string) => { stored.set(key, value); }),
        removeItem: vi.fn((key: string) => { stored.delete(key); })
      };
      const body: { id: string; remove: () => void }[] = [];
      const listeners = new Map<string, (event: unknown) => void>();
      let tick: () => void = () => undefined;
      const win = {
        location: { search },
        localStorage,
        document: {
          body: { append: (node: { id: string; remove: () => void }) => { body.push(node); } },
          createElement: () => {
            const node = {
              id: '', textContent: '', style: {} as Record<string, string>,
              setAttribute: () => undefined,
              remove: () => { const at = body.indexOf(node); if (at >= 0) body.splice(at, 1); }
            };
            return node;
          }
        },
        navigator: { maxTouchPoints: 0, userAgent: 'test' },
        matchMedia: () => ({ matches: false }),
        performance: { now: () => 0 },
        requestAnimationFrame: (fn: () => void) => { fn(); return 1; },
        setInterval: (fn: () => void) => { tick = fn; return 1; },
        clearInterval: () => undefined,
        setTimeout: (fn: () => void) => { fn(); return 1; },
        addEventListener: (type: string, fn: (event: unknown) => void) => { listeners.set(type, fn); },
        removeEventListener: (type: string) => { listeners.delete(type); }
      };
      const scene = { mode: 'play', overlay: 'none', progressionState: { tracks: { player: { level: '1' } } } };
      const dispose = installLegacyControlHint(win as never, { scene: { getScene: () => scene } });
      return {
        localStorage,
        stored,
        dispose,
        tick: () => tick(),
        hint: () => body.find((node) => node.id === LEGACY_CONTROL_HINT_ELEMENT_ID),
        move: () => listeners.get('keydown')?.({ key: 'ArrowUp', isTrusted: true, target: null })
      };
    };

    const deviceCalls = (storage: ReturnType<typeof fakeWindow>['localStorage']) => (
      storage.getItem.mock.calls.length + storage.setItem.mock.calls.length + storage.removeItem.mock.calls.length
    );

    for (const search of ['?previewLevel=1', '?runtimeDiagnostics=1&previewLevel=1', '?lab=hazards&level=1']) {
      it(`${search}: shows the hint, hides it on the first move, and never touches device storage`, () => {
        const page = fakeWindow(search);
        page.tick();
        expect(page.hint()).toBeDefined();
        page.move();
        expect(page.hint()).toBeUndefined();
        page.tick();
        expect(page.hint()).toBeUndefined();
        expect(deviceCalls(page.localStorage)).toBe(0);
        expect(page.stored.size).toBe(0);
        page.dispose();
      });
    }

    it('preview ignores an ack already on the device (it reads nothing), so the hint still shows', () => {
      const page = fakeWindow('?previewLevel=1', { [DEVICE_KEY]: 'not read in preview' });
      page.tick();
      expect(page.hint()).toBeDefined();
      expect(deviceCalls(page.localStorage)).toBe(0);
      page.dispose();
    });

    for (const search of ['', '?runtimeDiagnostics=1', '?previewLevel=0', '?level=1']) {
      it(`normal play (${search || 'no query'}) is unchanged: reads the device ack and writes it on the first move`, () => {
        const page = fakeWindow(search);
        expect(page.localStorage.getItem).toHaveBeenCalledWith(DEVICE_KEY);
        page.tick();
        expect(page.hint()).toBeDefined();
        page.move();
        expect(page.hint()).toBeUndefined();
        expect(page.localStorage.setItem).toHaveBeenCalledWith(DEVICE_KEY, expect.stringContaining(LEGACY_CONTROL_HINT_TOKEN.id));
        page.dispose();
        // One time per device: the next load on the same device storage shows nothing.
        const again = fakeWindow(search, Object.fromEntries(page.stored));
        again.tick();
        expect(again.hint()).toBeUndefined();
        again.dispose();
      });
    }
  });
});
