import {
  type HumanInputAction,
  type HumanInputActionKind,
  type HumanMovementActionKind
} from './actions.ts';

export interface TouchViewportLike {
  width: number;
  height: number;
}

export interface TouchSafeInsetsLike {
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
}

export interface TouchRuntimeLike {
  navigator?: {
    maxTouchPoints?: number;
    platform?: string;
  };
  matchMedia?(query: string): Pick<MediaQueryList, 'matches'>;
}

export interface TouchPointLike {
  x: number;
  y: number;
  pointerId?: number | null;
  timeStamp?: number;
}

export interface TouchRect {
  left: number;
  top: number;
  width: number;
  height: number;
  right: number;
  bottom: number;
  centerX: number;
  centerY: number;
}

export interface TouchControlLayout {
  compact: boolean;
  frame: TouchRect;
  controls: Record<HumanInputActionKind, TouchRect>;
}

export interface TouchInputState {
  activePointerById: Map<number, HumanInputActionKind>;
  activePointerCountByControl: Map<HumanInputActionKind, number>;
  lastTriggeredAtByControl: Map<HumanInputActionKind, number>;
}

export interface TouchControlLayoutOptions {
  safeInsets?: TouchSafeInsetsLike;
  compact?: boolean;
}

const TOUCH_DPAD_HIT_SLOP_RATIO = 0.32;
const TOUCH_DPAD_DEADZONE_RATIO = 0.24;
const TOUCH_DPAD_AXIS_LOCK_RATIO = 0.12;

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

const createRect = (left: number, top: number, width: number, height: number): TouchRect => ({
  left,
  top,
  width,
  height,
  right: left + width,
  bottom: top + height,
  centerX: left + (width / 2),
  centerY: top + (height / 2)
});

const normalizeInset = (value: unknown): number => (
  typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0
);

const resolveTouchDpadRect = (layout: TouchControlLayout): TouchRect => {
  const up = layout.controls.move_up;
  const down = layout.controls.move_down;
  const left = layout.controls.move_left;
  const right = layout.controls.move_right;
  const size = Math.max(up.width, down.width, left.width, right.width);
  const hitSlop = Math.max(8, Math.round(size * TOUCH_DPAD_HIT_SLOP_RATIO));

  return createRect(
    left.left - hitSlop,
    up.top - hitSlop,
    (right.right - left.left) + (hitSlop * 2),
    (down.bottom - up.top) + (hitSlop * 2)
  );
};

const resolveTouchDpadDirectionAtPoint = (
  layout: TouchControlLayout,
  x: number,
  y: number
): HumanMovementActionKind | null => {
  const dpadRect = resolveTouchDpadRect(layout);
  if (x < dpadRect.left || x > dpadRect.right || y < dpadRect.top || y > dpadRect.bottom) {
    return null;
  }

  const centerX = (layout.controls.move_left.centerX + layout.controls.move_right.centerX) / 2;
  const centerY = (layout.controls.move_up.centerY + layout.controls.move_down.centerY) / 2;
  const radius = Math.max(
    layout.controls.move_up.width,
    layout.controls.move_down.width,
    layout.controls.move_left.height,
    layout.controls.move_right.height
  );
  const dx = x - centerX;
  const dy = y - centerY;
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);
  const deadzone = Math.max(10, Math.round(radius * TOUCH_DPAD_DEADZONE_RATIO));
  const axisLock = Math.max(4, Math.round(radius * TOUCH_DPAD_AXIS_LOCK_RATIO));

  if (absDx <= deadzone && absDy <= deadzone) {
    return null;
  }

  if (Math.abs(absDx - absDy) <= axisLock) {
    return absDx >= absDy
      ? (dx < 0 ? 'move_left' : 'move_right')
      : (dy < 0 ? 'move_up' : 'move_down');
  }

  return absDx > absDy
    ? (dx < 0 ? 'move_left' : 'move_right')
    : (dy < 0 ? 'move_up' : 'move_down');
};

export const resolveTouchInputCapability = (runtime: TouchRuntimeLike | undefined): boolean => {
  if (!runtime) {
    return false;
  }

  if ((runtime.navigator?.maxTouchPoints ?? 0) > 0) {
    return true;
  }

  try {
    return runtime.matchMedia?.('(pointer: coarse)').matches ?? false;
  } catch {
    return false;
  }
};

export const resolveTouchControlLayout = (
  viewport: TouchViewportLike,
  options: TouchControlLayoutOptions = {}
): TouchControlLayout => {
  const compact = options.compact ?? Math.min(viewport.width, viewport.height) < 720;
  const safeInsets = {
    top: normalizeInset(options.safeInsets?.top),
    right: normalizeInset(options.safeInsets?.right),
    bottom: normalizeInset(options.safeInsets?.bottom),
    left: normalizeInset(options.safeInsets?.left)
  };
  const minDim = Math.max(1, Math.min(viewport.width, viewport.height));
  const phonePortrait = compact && viewport.height > viewport.width && viewport.width <= 430;
  if (phonePortrait) {
    const ultraNarrow = viewport.width < 240;
    const buttonSize = clamp(
      Math.round(minDim * 0.125),
      ultraNarrow ? 36 : 44,
      ultraNarrow ? 44 : 58
    );
    const gap = Math.max(6, Math.round(buttonSize * 0.16));
    const frameWidth = Math.max(1, viewport.width - safeInsets.left - safeInsets.right);
    const pad = ultraNarrow ? 0 : Math.max(10, Math.round(buttonSize * 0.3));
    const dpadSpan = (buttonSize * 3) + (gap * 2);
    const frameHeight = dpadSpan + (pad * 2);
    const frameLeft = clamp(Math.round(safeInsets.left), 0, Math.max(0, viewport.width - frameWidth));
    const frameTop = clamp(
      Math.round(viewport.height - safeInsets.bottom - frameHeight - Math.max(12, buttonSize * 0.25)),
      0,
      Math.max(0, viewport.height - frameHeight)
    );
    const dpadLeft = frameLeft + pad;
    const dpadTop = frameTop + pad;
    const actionLaneWidth = Math.max(
      buttonSize,
      frameWidth - (pad * 2) - dpadSpan - Math.max(14, gap * 2)
    );
    const actionWidth = ultraNarrow ? buttonSize : Math.min(104, actionLaneWidth);
    const actionLeft = frameLeft + frameWidth - pad - actionWidth;
    const actionTop = dpadTop;
    const secondarySize = Math.max(30, Math.round(buttonSize * 0.78));
    const secondaryPairFits = actionWidth >= (secondarySize * 2) + gap;
    const secondaryLeft = actionLeft + Math.round((actionWidth - secondarySize) / 2);
    const secondaryGap = Math.max(5, Math.round(gap * 0.85));

    return {
      compact,
      frame: createRect(frameLeft, frameTop, frameWidth, frameHeight),
      controls: {
        move_up: createRect(dpadLeft + buttonSize + gap, dpadTop, buttonSize, buttonSize),
        move_down: createRect(dpadLeft + buttonSize + gap, dpadTop + ((buttonSize + gap) * 2), buttonSize, buttonSize),
        move_left: createRect(dpadLeft, dpadTop + buttonSize + gap, buttonSize, buttonSize),
        move_right: createRect(dpadLeft + ((buttonSize + gap) * 2), dpadTop + buttonSize + gap, buttonSize, buttonSize),
        pause: createRect(actionLeft, actionTop, actionWidth, buttonSize),
        restart_attempt: createRect(
          secondaryPairFits ? actionLeft : secondaryLeft,
          actionTop + buttonSize + secondaryGap,
          secondarySize,
          secondarySize
        ),
        toggle_thoughts: createRect(
          secondaryPairFits ? actionLeft + actionWidth - secondarySize : secondaryLeft,
          actionTop + buttonSize + secondaryGap + (secondaryPairFits ? 0 : secondarySize + secondaryGap),
          secondarySize,
          secondarySize
        )
      }
    };
  }

  const tightPortrait = compact && viewport.height > viewport.width && viewport.width < 360;
  const buttonSize = clamp(
    Math.round(minDim * (compact ? 0.138 : 0.112)),
    tightPortrait ? 42 : (compact ? 52 : 58),
    tightPortrait ? 58 : (compact ? 82 : 94)
  );
  const gap = tightPortrait
    ? Math.max(7, Math.round(buttonSize * 0.16))
    : Math.max(10, Math.round(buttonSize * 0.18));
  const compactGutter = compact && !tightPortrait ? Math.max(24, Math.round(buttonSize * 0.44)) : 0;
  const usableWidth = Math.max(1, viewport.width - safeInsets.left - safeInsets.right - compactGutter);
  const frameWidth = tightPortrait
    ? Math.max(1, viewport.width - safeInsets.left - safeInsets.right)
    : Math.max(buttonSize * 4 + gap * 5, Math.min(usableWidth, buttonSize * 8));
  const frameHeight = tightPortrait
    ? (buttonSize * 3) + (gap * 4)
    : Math.max(buttonSize * 3 + gap * 4, buttonSize * 4);
  const frameLeft = clamp(Math.round(safeInsets.left + Math.max(12, buttonSize * 0.35)), 0, Math.max(0, viewport.width - frameWidth));
  const frameTop = clamp(Math.round(viewport.height - safeInsets.bottom - frameHeight - Math.max(12, buttonSize * 0.25)), 0, Math.max(0, viewport.height - frameHeight));

  const dpadCenterX = frameLeft + buttonSize + gap + Math.round(buttonSize * 0.5);
  const dpadCenterY = frameTop + buttonSize + gap + Math.round(buttonSize * 0.5);
  const buttonStackLeft = clamp(
    frameLeft + frameWidth - buttonSize - gap,
    frameLeft,
    Math.max(frameLeft, viewport.width - safeInsets.right - buttonSize)
  );
  const buttonColumnTop = frameTop + Math.round(buttonSize * 0.05);

  const controls: Record<HumanInputActionKind, TouchRect> = {
    move_up: createRect(dpadCenterX - Math.round(buttonSize / 2), frameTop, buttonSize, buttonSize),
    move_down: createRect(dpadCenterX - Math.round(buttonSize / 2), frameTop + (buttonSize + gap) * 2, buttonSize, buttonSize),
    move_left: createRect(frameLeft, dpadCenterY - Math.round(buttonSize / 2), buttonSize, buttonSize),
    move_right: createRect(frameLeft + (buttonSize + gap) * 2, dpadCenterY - Math.round(buttonSize / 2), buttonSize, buttonSize),
    pause: createRect(buttonStackLeft, buttonColumnTop, buttonSize, buttonSize),
    restart_attempt: createRect(buttonStackLeft, buttonColumnTop + buttonSize + gap, buttonSize, buttonSize),
    toggle_thoughts: createRect(buttonStackLeft, buttonColumnTop + (buttonSize + gap) * 2, buttonSize, buttonSize)
  };

  return {
    compact,
    frame: createRect(frameLeft, frameTop, frameWidth, frameHeight),
    controls
  };
};

export const resolveTouchControlKindAtPoint = (
  layout: TouchControlLayout,
  x: number,
  y: number
): HumanInputActionKind | null => {
  for (const kind of ['pause', 'restart_attempt', 'toggle_thoughts'] as const) {
    const rect = layout.controls[kind];
    if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
      return kind;
    }
  }

  const dpadDirection = resolveTouchDpadDirectionAtPoint(layout, x, y);
  if (dpadDirection) {
    return dpadDirection;
  }

  return null;
};

export const createTouchInputState = (): TouchInputState => ({
  activePointerById: new Map(),
  activePointerCountByControl: new Map(),
  lastTriggeredAtByControl: new Map()
});

export const resetTouchInputState = (state: TouchInputState): void => {
  state.activePointerById.clear();
  state.activePointerCountByControl.clear();
  state.lastTriggeredAtByControl.clear();
};

export const releaseTouchPointer = (state: TouchInputState, pointerId: number): void => {
  const activeControl = state.activePointerById.get(pointerId);
  if (!activeControl) {
    return;
  }

  const nextCount = Math.max(0, (state.activePointerCountByControl.get(activeControl) ?? 0) - 1);
  state.activePointerById.delete(pointerId);

  if (nextCount === 0) {
    state.activePointerCountByControl.delete(activeControl);
    return;
  }

  state.activePointerCountByControl.set(activeControl, nextCount);
};

export const resolveHumanTouchAction = (
  point: TouchPointLike,
  layout: TouchControlLayout,
  state: TouchInputState,
  nowMs = Date.now()
): HumanInputAction | null => {
  const pointerId = Number.isFinite(point.pointerId ?? NaN) ? Math.max(0, Math.round(point.pointerId ?? 0)) : null;
  if (pointerId === null) {
    return null;
  }

  const control = resolveTouchControlKindAtPoint(layout, point.x, point.y);
  if (!control) {
    return null;
  }

  if (state.activePointerById.has(pointerId)) {
    return null;
  }

  state.activePointerById.set(pointerId, control);
  state.activePointerCountByControl.set(control, (state.activePointerCountByControl.get(control) ?? 0) + 1);
  state.lastTriggeredAtByControl.set(control, Number.isFinite(point.timeStamp ?? NaN) ? Math.max(0, Math.round(point.timeStamp ?? nowMs)) : nowMs);

  return {
    kind: control,
    source: 'touch',
    atMs: Number.isFinite(point.timeStamp ?? NaN) ? Math.max(0, Math.round(point.timeStamp ?? nowMs)) : nowMs,
    repeat: false,
    key: `touch:${control}`
  };
};
