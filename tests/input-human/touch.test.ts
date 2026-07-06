import { describe, expect, test } from 'vitest';

import {
  createTouchInputState,
  releaseTouchPointer,
  resolveHumanTouchAction,
  resolveTouchControlLayout,
  resolveTouchControlKindAtPoint,
  resolveTouchInputCapability
} from '../../src/input-human';

describe('input-human touch bridge', () => {
  test('detects touch-capable runtimes and resolves a stable mobile layout', () => {
    expect(resolveTouchInputCapability({
      navigator: { maxTouchPoints: 2 }
    })).toBe(true);
    expect(resolveTouchInputCapability({
      navigator: { maxTouchPoints: 0 },
      matchMedia: () => ({ matches: true })
    })).toBe(true);
    expect(resolveTouchInputCapability({
      navigator: { maxTouchPoints: 0 },
      matchMedia: () => ({ matches: false })
    })).toBe(false);

    const layout = resolveTouchControlLayout({
      width: 390,
      height: 844
    });

    expect(layout.frame.width).toBeGreaterThan(0);
    expect(layout.frames).toHaveLength(2);
    expect(layout.frame.left).toBeGreaterThan(80);
    expect(layout.frame.right).toBeLessThan(310);
    expect(layout.controls.move_up.width).toBeGreaterThanOrEqual(44);
    expect(layout.controls.move_up.centerY).toBeLessThan(layout.controls.move_down.centerY);
    expect(layout.controls.move_left.centerX).toBeLessThan(layout.controls.move_right.centerX);
    expect(layout.controls.pause.top).toBeLessThan(layout.controls.move_up.top);
    expect(layout.controls.restart_attempt.left).toBeGreaterThan(layout.controls.pause.right);
    expect(layout.controls.toggle_thoughts.width).toBe(0);
    expect(layout.controls.toggle_thoughts.height).toBe(0);
    expect(layout.controls.restart_attempt.centerY).toBe(layout.controls.pause.centerY);
    expect(resolveTouchControlKindAtPoint(layout, layout.controls.pause.centerX, layout.controls.pause.centerY)).toBe('pause');
    expect(resolveTouchControlKindAtPoint(
      layout,
      (layout.controls.move_left.centerX + layout.controls.move_right.centerX) / 2,
      (layout.controls.move_up.centerY + layout.controls.move_down.centerY) / 2
    )).toBeNull();
    expect(resolveTouchControlKindAtPoint(
      layout,
      layout.controls.move_left.right + 1,
      layout.controls.move_left.centerY
    )).toBeNull();
    expect(resolveTouchControlKindAtPoint(layout, layout.controls.move_right.centerX, layout.controls.move_right.centerY)).toBe('move_right');
  });

  test('keeps ultra-narrow portrait controls inside the viewport without oversized hit plates', () => {
    const layout = resolveTouchControlLayout({
      width: 172,
      height: 407
    });

    expect(layout.frame.left).toBeGreaterThanOrEqual(0);
    expect(layout.frame.right).toBeLessThanOrEqual(172);
    expect(layout.frame.bottom).toBeLessThanOrEqual(407);
    expect(layout.controls.move_up.width).toBeLessThan(52);
    expect(layout.controls.move_left.left).toBeGreaterThanOrEqual(0);
    expect(layout.controls.pause.right).toBeLessThanOrEqual(172);
    expect(layout.controls.toggle_thoughts.width).toBe(0);
    expect(layout.controls.pause.top).toBeLessThan(layout.controls.move_up.top);
    expect(resolveTouchControlKindAtPoint(
      layout,
      layout.controls.move_left.centerX,
      layout.controls.move_left.centerY
    )).toBe('move_left');
  });

  test('splits compact landscape controls into board-safe side gutters when board bounds are known', () => {
    const board = {
      left: 330,
      top: 58,
      width: 604,
      height: 604
    };
    const layout = resolveTouchControlLayout({
      width: 1280,
      height: 690
    }, {
      compact: true,
      avoidRect: board
    });

    expect(layout.frames).toHaveLength(2);
    expect(layout.frames?.[0].right).toBeLessThanOrEqual(board.left - 18);
    expect(layout.frames?.[1].left).toBeGreaterThanOrEqual(board.left + board.width + 18);
    expect(layout.controls.move_right.right).toBeLessThanOrEqual(board.left - 8);
    expect(layout.controls.pause.left).toBeGreaterThanOrEqual(board.left + board.width + 8);
    expect(layout.controls.restart_attempt.left).toBe(layout.controls.pause.left);
    expect(layout.controls.toggle_thoughts.width).toBe(0);
    expect(resolveTouchControlKindAtPoint(layout, layout.controls.pause.centerX, layout.controls.pause.centerY)).toBe('pause');
    expect(resolveTouchControlKindAtPoint(layout, layout.controls.move_left.centerX, layout.controls.move_left.centerY)).toBe('move_left');
  });

  test('maps touch points into the shared human action schema and releases held pointers', () => {
    const layout = resolveTouchControlLayout({
      width: 390,
      height: 844
    });
    const state = createTouchInputState();
    const movePoint = layout.controls.move_right;

    const move = resolveHumanTouchAction({
      x: movePoint.centerX,
      y: movePoint.centerY,
      pointerId: 7,
      timeStamp: 128
    }, layout, state, 128);

    expect(move).toEqual({
      kind: 'move_right',
      source: 'touch',
      atMs: 128,
      repeat: false,
      key: 'touch:move_right'
    });
    expect(resolveHumanTouchAction({
      x: movePoint.centerX,
      y: movePoint.centerY,
      pointerId: 7,
      timeStamp: 160
    }, layout, state, 160)).toBeNull();

    releaseTouchPointer(state, 7);

    const pausePoint = layout.controls.pause;
    expect(resolveHumanTouchAction({
      x: pausePoint.centerX,
      y: pausePoint.centerY,
      pointerId: 9,
      timeStamp: 300
    }, layout, state, 300)?.kind).toBe('pause');
  });
});
