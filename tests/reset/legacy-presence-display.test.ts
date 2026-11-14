import { describe, expect, test } from 'vitest';
import {
  PRESENCE_EASE_MS,
  PRESENCE_FADE_IN_MS,
  PRESENCE_FADE_OUT_MS,
  PRESENCE_MAX_EASE_STEPS,
  PRESENCE_MIN_UPDATE_MS,
  PRESENCE_UNKNOWN_GRACE_MS,
  advancePresenceDisplay,
  createPresenceDisplayState,
  pushPresenceSample,
  resolvePresenceDisplayFrame
} from '../../src/legacy-runtime/legacyPresenceDisplay';

const frameAt = (state: ReturnType<typeof createPresenceDisplayState>, now: number, reduced = false) => (
  resolvePresenceDisplayFrame(advancePresenceDisplay(state, now), now, reduced)
);

describe('MAZER-UI-024 presence display model', () => {
  test('starts hidden and stays hidden for zero, unknown and invalid samples (no "0 online", no dash)', () => {
    let state = createPresenceDisplayState();
    expect(frameAt(state, 0).visible).toBe(false);
    for (const bad of [0, -3, 2.5, Number.NaN, null, undefined]) {
      state = pushPresenceSample(state, bad, 100);
      expect(frameAt(state, 100).visible).toBe(false);
      expect(frameAt(state, 100).value).toBeNull();
    }
  });

  test('the first real count appears at once and fades in over PRESENCE_FADE_IN_MS', () => {
    const state = pushPresenceSample(createPresenceDisplayState(), 7, 1000);
    expect(frameAt(state, 1000)).toMatchObject({ alpha: 0, value: 7 });
    const mid = frameAt(state, 1000 + (PRESENCE_FADE_IN_MS / 2));
    expect(mid.value).toBe(7);
    expect(mid.alpha).toBeGreaterThan(0.4);
    expect(mid.alpha).toBeLessThan(0.6);
    expect(mid.animating).toBe(true);
    expect(frameAt(state, 1000 + PRESENCE_FADE_IN_MS)).toMatchObject({ alpha: 1, animating: false, value: 7, visible: true });
  });

  test('a burst of changes is coalesced: at most one accepted per PRESENCE_MIN_UPDATE_MS, the newest wins', () => {
    let state = pushPresenceSample(createPresenceDisplayState(), 5, 0);
    state = pushPresenceSample(state, 6, 200);
    state = pushPresenceSample(state, 7, 400);
    state = pushPresenceSample(state, 8, 600);
    expect(state.accepted).toBe(5);
    expect(frameAt(state, 700, true).value).toBe(5);
    expect(frameAt(state, PRESENCE_MIN_UPDATE_MS + 10, true).value).toBe(8);
  });

  test('the number eases in whole steps, monotonically, ending exactly on the target (no flicker back)', () => {
    let state = pushPresenceSample(createPresenceDisplayState(), 7, 0);
    state = pushPresenceSample(state, 12, PRESENCE_MIN_UPDATE_MS + 1);
    const start = PRESENCE_MIN_UPDATE_MS + 1;
    let previous = 7;
    const seen: number[] = [];
    for (let t = 0; t <= PRESENCE_EASE_MS + 50; t += 16) {
      const value = frameAt(state, start + t).value as number;
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(previous);
      expect(value).toBeLessThanOrEqual(12);
      previous = value;
      seen.push(value);
    }
    expect(seen[seen.length - 1]).toBe(12);
    expect(new Set(seen).size).toBeGreaterThan(2);
  });

  test('a big jump takes at most PRESENCE_MAX_EASE_STEPS visible steps and still lands exactly', () => {
    let state = pushPresenceSample(createPresenceDisplayState(), 7, 0);
    state = pushPresenceSample(state, 1234, 2000);
    const values = new Set<number>();
    for (let t = 0; t <= PRESENCE_EASE_MS + 50; t += 8) {
      values.add(frameAt(state, 2000 + t).value as number);
    }
    expect(values.size).toBeLessThanOrEqual(PRESENCE_MAX_EASE_STEPS);
    expect(frameAt(state, 2000 + PRESENCE_EASE_MS).value).toBe(1234);
  });

  test('Reduce Motion: no fade and no easing, the number simply is the count', () => {
    let state = pushPresenceSample(createPresenceDisplayState(), 7, 0);
    expect(frameAt(state, 0, true)).toMatchObject({ alpha: 1, animating: false, value: 7, visible: true });
    state = pushPresenceSample(state, 30, PRESENCE_MIN_UPDATE_MS + 1);
    expect(frameAt(state, PRESENCE_MIN_UPDATE_MS + 1, true)).toMatchObject({ animating: false, value: 30 });
  });

  test('stale handling: an unknown count keeps the last value for the grace window, then fades out and hides', () => {
    let state = pushPresenceSample(createPresenceDisplayState(), 9, 0);
    state = pushPresenceSample(state, null, 10_000);
    const held = frameAt(state, 10_000 + PRESENCE_UNKNOWN_GRACE_MS - 1);
    expect(held).toMatchObject({ alpha: 1, value: 9, visible: true });
    const fading = frameAt(state, 10_000 + PRESENCE_UNKNOWN_GRACE_MS + (PRESENCE_FADE_OUT_MS / 2));
    expect(fading.visible).toBe(true);
    expect(fading.alpha).toBeLessThan(1);
    expect(frameAt(state, 10_000 + PRESENCE_UNKNOWN_GRACE_MS + PRESENCE_FADE_OUT_MS + 5)).toMatchObject({ value: null, visible: false });
  });

  test('stale handling under Reduce Motion: hides when the grace ends, with no fade', () => {
    let state = pushPresenceSample(createPresenceDisplayState(), 9, 0);
    state = pushPresenceSample(state, null, 1000);
    expect(frameAt(state, 1000 + PRESENCE_UNKNOWN_GRACE_MS - 1, true).visible).toBe(true);
    expect(frameAt(state, 1000 + PRESENCE_UNKNOWN_GRACE_MS, true).visible).toBe(false);
  });

  test('a brief gap that recovers inside the grace window shows no flicker: the value stays visible throughout', () => {
    let state = pushPresenceSample(createPresenceDisplayState(), 9, 0);
    state = pushPresenceSample(state, null, 5000);
    expect(frameAt(state, 6000).visible).toBe(true);
    state = pushPresenceSample(state, 9, 7000);
    for (const t of [5000, 6000, 7000, 7100, 9000]) {
      expect(frameAt(state, t).visible, `t=${t}`).toBe(true);
    }
    expect(frameAt(state, 9000).value).toBe(9);
  });

  test('coming back after the fade-out re-fades in from the new value', () => {
    let state = pushPresenceSample(createPresenceDisplayState(), 9, 0);
    state = pushPresenceSample(state, null, 1000);
    const hiddenAt = 1000 + PRESENCE_UNKNOWN_GRACE_MS + PRESENCE_FADE_OUT_MS + 10;
    state = advancePresenceDisplay(state, hiddenAt);
    expect(frameAt(state, hiddenAt).visible).toBe(false);
    state = pushPresenceSample(state, 4, hiddenAt + 100);
    expect(frameAt(state, hiddenAt + 100)).toMatchObject({ alpha: 0, value: 4 });
    expect(frameAt(state, hiddenAt + 100 + PRESENCE_FADE_IN_MS)).toMatchObject({ alpha: 1, value: 4, visible: true });
  });

  test('a settled counter does not ask for redraws (animating false)', () => {
    const state = pushPresenceSample(createPresenceDisplayState(), 7, 0);
    expect(frameAt(state, 5000).animating).toBe(false);
  });
});
