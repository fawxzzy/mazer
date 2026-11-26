import { describe, expect, it } from 'vitest';
import {
  INITIAL_MODE_SELECT_WHEEL_STATE,
  MODE_SELECT_WHEEL_COOLDOWN_MS,
  MODE_SELECT_WHEEL_STEP_PX,
  clampModeSelectIndex,
  reduceModeSelectWheel,
  resolveModeSelectRailDepth,
  resolveModeSelectRailEdgePad,
  resolveModeSelectRailKeyAction,
  resolveModeSelectRailNearestIndex,
  resolveModeSelectRailScrollFor
} from '../../src/ui/modeSelect/modeSelectRailMath';

// A 393 px rail with 228 px cards and 8 px side margins, laid out as the CSS does: pad, then margin + card + margin.
const RAIL = 393;
const CARD = 228;
const MARGIN = 8;
const PAD = resolveModeSelectRailEdgePad(RAIL, CARD, MARGIN);
const boxes = [0, 1, 2, 3].map((index) => ({ left: PAD + MARGIN + (index * (CARD + (2 * MARGIN))), width: CARD }));

describe('mode-select rail geometry', () => {
  it('edge room lets the first and last card centre, in whole px', () => {
    expect(PAD).toBe(Math.round(((RAIL - CARD) / 2) - MARGIN));
    expect(resolveModeSelectRailScrollFor(boxes[0]!, RAIL)).toBeLessThanOrEqual(1);
    expect(resolveModeSelectRailEdgePad(200, 260, 8)).toBe(0);
  });

  it('a centred card has depth 0, its neighbours about -1 and +1', () => {
    const scroll = resolveModeSelectRailScrollFor(boxes[1]!, RAIL);
    expect(resolveModeSelectRailDepth(boxes[1]!, scroll, RAIL)).toBeCloseTo(0, 5);
    expect(resolveModeSelectRailDepth(boxes[0]!, scroll, RAIL)).toBeCloseTo(-(CARD + (2 * MARGIN)) / CARD, 5);
    expect(resolveModeSelectRailDepth(boxes[2]!, scroll, RAIL)).toBeCloseTo((CARD + (2 * MARGIN)) / CARD, 5);
    // a not-yet-laid-out card (width 0) still gives a finite depth
    expect(Number.isFinite(resolveModeSelectRailDepth({ left: 0, width: 0 }, 0, 100))).toBe(true);
  });

  it('the nearest card follows the scroll position; an empty rail is index 0', () => {
    boxes.forEach((box, index) => {
      expect(resolveModeSelectRailNearestIndex(boxes, resolveModeSelectRailScrollFor(box, RAIL), RAIL)).toBe(index);
    });
    const between = (resolveModeSelectRailScrollFor(boxes[1]!, RAIL) + resolveModeSelectRailScrollFor(boxes[2]!, RAIL)) / 2;
    expect(resolveModeSelectRailNearestIndex(boxes, between - 1, RAIL)).toBe(1);
    expect(resolveModeSelectRailNearestIndex(boxes, between + 1, RAIL)).toBe(2);
    expect(resolveModeSelectRailNearestIndex([], 0, RAIL)).toBe(0);
  });

  it('clamps indexes into range', () => {
    expect(clampModeSelectIndex(-1, 4)).toBe(0);
    expect(clampModeSelectIndex(9, 4)).toBe(3);
    expect(clampModeSelectIndex(2, 4)).toBe(2);
    expect(clampModeSelectIndex(2, 0)).toBe(0);
  });
});

describe('mode-select rail keys', () => {
  it('arrows step one mode and stop at the ends; Home/End jump', () => {
    expect(resolveModeSelectRailKeyAction('ArrowRight', 0, 4)).toEqual({ kind: 'move', to: 1 });
    expect(resolveModeSelectRailKeyAction('ArrowRight', 3, 4)).toEqual({ kind: 'move', to: 3 });
    expect(resolveModeSelectRailKeyAction('ArrowLeft', 0, 4)).toEqual({ kind: 'move', to: 0 });
    expect(resolveModeSelectRailKeyAction('ArrowLeft', 2, 4)).toEqual({ kind: 'move', to: 1 });
    expect(resolveModeSelectRailKeyAction('Home', 3, 4)).toEqual({ kind: 'move', to: 0 });
    expect(resolveModeSelectRailKeyAction('End', 0, 4)).toEqual({ kind: 'move', to: 3 });
  });

  it('Enter plays, Escape goes back, anything else (Space, letters) is left alone', () => {
    expect(resolveModeSelectRailKeyAction('Enter', 0, 4)).toEqual({ kind: 'play' });
    expect(resolveModeSelectRailKeyAction('Escape', 0, 4)).toEqual({ kind: 'back' });
    expect(resolveModeSelectRailKeyAction(' ', 0, 4)).toEqual({ kind: 'none' });
    expect(resolveModeSelectRailKeyAction('p', 0, 4)).toEqual({ kind: 'none' });
  });
});

describe('mode-select rail wheel', () => {
  it('one mouse-wheel notch steps one mode', () => {
    const down = reduceModeSelectWheel(INITIAL_MODE_SELECT_WHEEL_STATE, 100, 1000);
    expect(down.step).toBe(1);
    const up = reduceModeSelectWheel(INITIAL_MODE_SELECT_WHEEL_STATE, -100, 1000);
    expect(up.step).toBe(-1);
  });

  it('small trackpad deltas accumulate until they pass the step', () => {
    let state = INITIAL_MODE_SELECT_WHEEL_STATE;
    let steps = 0;
    for (let i = 0; i < 3; i += 1) {
      const next = reduceModeSelectWheel(state, 12, 1000 + i);
      state = next.state;
      steps += next.step;
    }
    expect(steps).toBe(0);
    const next = reduceModeSelectWheel(state, MODE_SELECT_WHEEL_STEP_PX, 1010);
    expect(next.step).toBe(1);
  });

  it('inertia right after a step is ignored for the cool-down, then input counts again', () => {
    const first = reduceModeSelectWheel(INITIAL_MODE_SELECT_WHEEL_STATE, 100, 1000);
    const during = reduceModeSelectWheel(first.state, 100, 1000 + MODE_SELECT_WHEEL_COOLDOWN_MS - 1);
    expect(during.step).toBe(0);
    const after = reduceModeSelectWheel(during.state, 100, 1000 + MODE_SELECT_WHEEL_COOLDOWN_MS);
    expect(after.step).toBe(1);
  });
});
