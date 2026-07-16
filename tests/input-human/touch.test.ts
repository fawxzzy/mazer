import { describe, expect, test } from 'vitest';

import {
  createTouchInputState,
  releaseTouchPointer,
  resolveHumanTouchAction,
  resolveStickMovementIntent,
  resolveStickMovementKind,
  resolveStickPullVector,
  resolveTouchArrowMovementKindAtPoint,
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

    expect(layout.controlMode).toBe('arrows');
    expect(layout.frame.width).toBeGreaterThan(0);
    expect(layout.frames).toHaveLength(2);
    expect(layout.stick).toBeNull();
    expect(layout.frame.left).toBeGreaterThan(80);
    expect(layout.frame.right).toBeLessThan(310);
    expect(layout.controls.move_up.width).toBeGreaterThanOrEqual(44);
    expect(layout.controls.move_up_left.centerX).toBeLessThan(layout.controls.move_up.centerX);
    expect(layout.controls.move_up_right.centerX).toBeGreaterThan(layout.controls.move_up.centerX);
    expect(layout.controls.move_down_left.centerY).toBeGreaterThan(layout.controls.move_left.centerY);
    expect(layout.controls.move_down_right.centerY).toBeGreaterThan(layout.controls.move_right.centerY);
    expect(layout.controls.move_up.centerY).toBeLessThan(layout.controls.move_down.centerY);
    expect(layout.controls.move_left.centerX).toBeLessThan(layout.controls.move_right.centerX);
    expect(layout.controls.pause.top).toBeLessThan(layout.controls.move_up.top);
    expect(layout.controls.pause.top).toBeLessThan(16);
    expect(layout.controls.pause.right).toBeGreaterThan(370);
    expect(layout.frames?.[0].right).toBeGreaterThan(370);
    expect(layout.frames?.[0].height).toBeLessThan(layout.controls.move_up.height);
    expect(layout.controls.pause.width).toBeLessThan(90);
    expect(layout.controls.pause.left).toBeGreaterThan(280);
    expect(layout.controls.restart_attempt.width).toBe(0);
    expect(layout.controls.restart_attempt.height).toBe(0);
    expect(layout.controls.toggle_thoughts.width).toBe(0);
    expect(layout.controls.toggle_thoughts.height).toBe(0);
    expect(resolveTouchControlKindAtPoint(layout, layout.controls.pause.centerX, layout.controls.pause.centerY)).toBe('pause');
    expect(resolveTouchControlKindAtPoint(layout, layout.controls.restart_attempt.centerX, layout.controls.restart_attempt.centerY)).toBeNull();
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
    expect(resolveTouchControlKindAtPoint(layout, layout.controls.move_up_left.centerX, layout.controls.move_up_left.centerY)).toBe('move_up_left');
    expect(resolveTouchControlKindAtPoint(layout, layout.controls.move_down_right.centerX, layout.controls.move_down_right.centerY)).toBe('move_down_right');
    expect(resolveTouchControlKindAtPoint(layout, layout.controls.move_right.centerX, layout.controls.move_right.centerY)).toBe('move_right');
    expect(resolveTouchArrowMovementKindAtPoint(
      layout,
      layout.controls.move_up.centerX,
      layout.controls.move_up.centerY
    )).toBe('move_up');
    expect(resolveTouchArrowMovementKindAtPoint(
      layout,
      layout.controls.move_right.centerX,
      layout.controls.move_down.centerY
    )).toBe('move_down_right');
    expect(resolveTouchArrowMovementKindAtPoint(
      layout,
      layout.frame.centerX,
      layout.frame.centerY
    )).toBeNull();
    expect(resolveTouchArrowMovementKindAtPoint(
      layout,
      layout.frame.right + 20,
      layout.frame.centerY
    )).toBeNull();
    expect(resolveTouchArrowMovementKindAtPoint(
      layout,
      layout.frame.right + 120,
      layout.frame.centerY,
      { allowBeyondFrame: true }
    )).toBe('move_right');
    expect(resolveTouchArrowMovementKindAtPoint(
      layout,
      layout.frame.centerX,
      layout.frame.centerY,
      { centerFallback: 'move_left' }
    )).toBe('move_left');
  });

  test('supports a stick control mode with a compass deadzone and 360-degree movement ring', () => {
    const layout = resolveTouchControlLayout({
      width: 390,
      height: 844
    }, {
      controlMode: 'stick'
    });

    expect(layout.controlMode).toBe('stick');
    expect(layout.stick).not.toBeNull();
    expect(layout.stick!.deadzoneRadius).toBeLessThan(layout.stick!.inner.width / 2);
    expect(layout.stick!.knobRadius).toBeGreaterThanOrEqual(10);
    expect(layout.stick!.travelRadius).toBeGreaterThan(layout.stick!.outer.width * 0.3);
    expect(layout.stick!.travelRadius + layout.stick!.knobRadius).toBeLessThan(layout.stick!.outer.width / 2);
    expect(Math.abs(layout.stick!.inner.centerX - layout.stick!.outer.centerX)).toBeLessThanOrEqual(1);
    expect(Math.abs(layout.stick!.inner.centerY - layout.stick!.outer.centerY)).toBeLessThanOrEqual(1);
    expect(resolveTouchControlKindAtPoint(layout, layout.stick!.inner.centerX, layout.stick!.inner.centerY)).toBeNull();
    expect(resolveTouchControlKindAtPoint(layout, layout.stick!.outer.centerX, layout.stick!.outer.top + 4)).toBe('move_up');
    expect(resolveTouchControlKindAtPoint(layout, layout.stick!.outer.right - 4, layout.stick!.outer.centerY)).toBe('move_right');
    expect(resolveTouchControlKindAtPoint(layout, layout.stick!.outer.centerX, layout.stick!.outer.bottom - 4)).toBe('move_down');
    expect(resolveTouchControlKindAtPoint(layout, layout.stick!.outer.left + 4, layout.stick!.outer.centerY)).toBe('move_left');
    expect(resolveTouchControlKindAtPoint(
      layout,
      layout.stick!.outer.centerX + (layout.stick!.outer.width * 0.32),
      layout.stick!.outer.centerY + (layout.stick!.outer.height * 0.32)
    )).toBe('move_down_right');
    expect(resolveTouchControlKindAtPoint(
      layout,
      layout.stick!.outer.right + 20,
      layout.stick!.outer.centerY
    )).toBeNull();
    expect(resolveStickMovementKind(
      layout.stick!,
      layout.stick!.outer.right + 20,
      layout.stick!.outer.centerY,
      { allowBeyondOuter: true }
    )).toBe('move_right');
    expect(resolveStickMovementKind(
      layout.stick!,
      layout.stick!.outer.centerX - 500,
      layout.stick!.outer.centerY - 320,
      { allowBeyondOuter: true }
    )).toBe('move_left');
    expect(resolveStickMovementKind(
      layout.stick!,
      layout.stick!.outer.centerX - 500,
      layout.stick!.outer.centerY - 500,
      { allowBeyondOuter: true }
    )).toBe('move_up_left');
    expect(resolveStickMovementKind(
      layout.stick!,
      layout.stick!.outer.centerX - 48,
      layout.stick!.outer.centerY - 80,
      { allowBeyondOuter: true }
    )).toBe('move_up');
    expect(resolveStickMovementKind(
      layout.stick!,
      layout.stick!.outer.centerX - 80,
      layout.stick!.outer.centerY - 48,
      { allowBeyondOuter: true }
    )).toBe('move_left');
    expect(resolveStickMovementIntent(-Math.PI / 2)).toEqual({
      intentSegment: 12,
      movement: 'move_up',
      movementCandidates: ['move_up']
    });
    expect(resolveStickMovementIntent(-Math.PI / 4)).toEqual({
      intentSegment: 14,
      movement: 'move_up_right',
      movementCandidates: ['move_right', 'move_up']
    });
    expect(resolveStickMovementIntent(Math.PI / 16, { previousIntentSegment: 0 })).toEqual({
      intentSegment: 0,
      movement: 'move_right',
      movementCandidates: ['move_right']
    });
    expect(resolveStickMovementIntent(Math.PI / 8, { previousIntentSegment: 0 })).toEqual({
      intentSegment: 1,
      movement: 'move_right',
      movementCandidates: ['move_right', 'move_down']
    });
    expect(resolveStickMovementIntent(Math.PI / 12, { previousIntentSegment: 0 })).toEqual({
      intentSegment: 0,
      movement: 'move_right',
      movementCandidates: ['move_right']
    });
    expect(resolveStickMovementIntent(Math.PI / 2, { previousIntentSegment: 0 }).intentSegment).toBe(4);
    const partialPull = resolveStickPullVector(
      layout.stick!,
      layout.stick!.outer.centerX + (layout.stick!.outer.width * 0.18),
      layout.stick!.outer.centerY - (layout.stick!.outer.height * 0.22),
      { allowBeyondOuter: true }
    );
    expect(partialPull?.movement).toBe('move_up_right');
    expect(partialPull?.intentSegment).toBe(14);
    expect(partialPull?.movementCandidates).toEqual(['move_right', 'move_up']);
    expect(partialPull?.distanceRatio).toBeGreaterThan(0);
    expect(partialPull?.distanceRatio).toBeLessThan(1);
    expect(partialPull?.normalizedX).toBeGreaterThan(0);
    expect(partialPull?.normalizedY).toBeLessThan(0);
    const stickyBoundaryPull = resolveStickPullVector(
      layout.stick!,
      layout.stick!.outer.centerX + 90,
      layout.stick!.outer.centerY + 18,
      { allowBeyondOuter: true, previousIntentSegment: 0 }
    );
    expect(stickyBoundaryPull?.intentSegment).toBe(0);
    expect(stickyBoundaryPull?.movementCandidates).toEqual(['move_right']);
    const farPull = resolveStickPullVector(
      layout.stick!,
      layout.stick!.outer.centerX + 900,
      layout.stick!.outer.centerY,
      { allowBeyondOuter: true }
    );
    expect(farPull?.movement).toBe('move_right');
    expect(farPull?.distanceRatio).toBe(1);
    expect(farPull?.normalizedX).toBe(1);
    expect(farPull?.normalizedY).toBe(0);
  });

  test('matches the phone Pause action height to the shared run-status panel height', () => {
    const layout = resolveTouchControlLayout({
      width: 390,
      height: 844
    }, {
      controlMode: 'stick',
      topActionHeight: 62
    });

    expect(layout.controls.pause.height).toBe(62);
    expect(layout.frames?.[0].height).toBe(62);

    const ultraNarrow = resolveTouchControlLayout({
      width: 220,
      height: 480
    }, {
      controlMode: 'stick',
      topActionHeight: 62
    });
    expect(ultraNarrow.controls.pause.height).toBe(62);
  });

  test('places phone controls low in the bottom lane below the board when board bounds are known', () => {
    const board = {
      left: 31,
      top: 70,
      width: 374,
      height: 374
    };
    const layout = resolveTouchControlLayout({
      width: 390,
      height: 844
    }, {
      avoidRect: board,
      controlMode: 'stick'
    });
    const bottomLaneTop = board.top + board.height;
    const bottomLaneCenterY = bottomLaneTop + ((844 - bottomLaneTop) / 2);

    expect(layout.frame.top).toBeGreaterThanOrEqual(bottomLaneTop);
    expect(layout.frame.bottom).toBeLessThanOrEqual(844);
    expect(layout.frame.centerY).toBeGreaterThan(bottomLaneCenterY);
    expect(layout.frame.bottom).toBeLessThanOrEqual(844);
    expect(Math.abs(layout.stick!.outer.centerX - 195)).toBeLessThanOrEqual(1);
    expect(Math.abs(layout.stick!.outer.centerY - layout.frame.centerY)).toBeLessThanOrEqual(1);
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
    expect(layout.controls.move_up_left.left).toBeGreaterThanOrEqual(0);
    expect(layout.controls.move_down_right.right).toBeLessThanOrEqual(172);
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
    expect(layout.controls.move_up_right.right).toBeLessThanOrEqual(board.left - 8);
    expect(layout.controls.move_down_left.left).toBeGreaterThanOrEqual(0);
    expect(layout.controls.pause.left).toBeGreaterThanOrEqual(board.left + board.width + 8);
    expect(layout.controls.restart_attempt.width).toBe(0);
    expect(layout.controls.toggle_thoughts.width).toBe(0);
    expect(resolveTouchControlKindAtPoint(layout, layout.controls.pause.centerX, layout.controls.pause.centerY)).toBe('pause');
    expect(resolveTouchControlKindAtPoint(layout, layout.controls.move_left.centerX, layout.controls.move_left.centerY)).toBe('move_left');
  });

  test('centers wide play controls below the board while reserving the top-right pause lane', () => {
    const board = {
      left: 444,
      top: 64,
      width: 392,
      height: 392
    };
    const layout = resolveTouchControlLayout({
      width: 1280,
      height: 720
    }, {
      compact: true,
      placement: 'bottom-centered',
      avoidRect: board
    });

    expect(Math.abs(layout.frame.centerX - 640)).toBeLessThanOrEqual(1);
    expect(layout.frame.top).toBeGreaterThanOrEqual(board.top + board.height);
    expect(layout.frame.bottom).toBeLessThanOrEqual(720);
    expect(layout.controls.pause.left).toBeGreaterThanOrEqual(board.left + board.width + 8);
    expect(layout.controls.pause.bottom).toBeLessThanOrEqual(board.top);
    expect(layout.frames).toHaveLength(2);
  });

  test('maps touch points into the shared human action schema and releases held pointers', () => {
    const layout = resolveTouchControlLayout({
      width: 390,
      height: 844
    });
    const state = createTouchInputState();
    const movePoint = layout.controls.move_down_left;

    const move = resolveHumanTouchAction({
      x: movePoint.centerX,
      y: movePoint.centerY,
      pointerId: 7,
      timeStamp: 128
    }, layout, state, 128);

    expect(move).toEqual({
      kind: 'move_down_left',
      source: 'touch',
      atMs: 128,
      repeat: false,
      key: 'touch:move_down_left'
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
