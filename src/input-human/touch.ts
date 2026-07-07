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
  controlMode: TouchControlMode;
  frame: TouchRect;
  frames?: TouchRect[];
  stick: {
    deadzoneRadius: number;
    inner: TouchRect;
    outer: TouchRect;
  } | null;
  controls: Record<HumanInputActionKind, TouchRect>;
}

export interface TouchInputState {
  activePointerById: Map<number, HumanInputActionKind>;
  activePointerCountByControl: Map<HumanInputActionKind, number>;
  lastTriggeredAtByControl: Map<HumanInputActionKind, number>;
}

export interface TouchStickPullVector {
  angleRadians: number;
  distanceRatio: number;
  movement: HumanMovementActionKind;
  normalizedX: number;
  normalizedY: number;
}

export interface TouchControlLayoutOptions {
  safeInsets?: TouchSafeInsetsLike;
  compact?: boolean;
  controlMode?: TouchControlMode;
  avoidRect?: {
    left: number;
    top: number;
    width: number;
    height: number;
  };
}

export type TouchControlMode = 'arrows' | 'stick';

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

const EMPTY_TOUCH_RECT = createRect(-10_000, -10_000, 0, 0);

const isPointInRect = (rect: TouchRect, x: number, y: number): boolean => (
  rect.width > 0
  && rect.height > 0
  && x >= rect.left
  && x <= rect.right
  && y >= rect.top
  && y <= rect.bottom
);

export const resolveStickMovementKind = (
  stick: NonNullable<TouchControlLayout['stick']>,
  x: number,
  y: number,
  options: { allowBeyondOuter?: boolean } = {}
): HumanMovementActionKind | null => {
  return resolveStickPullVector(stick, x, y, options)?.movement ?? null;
};

export const resolveStickPullVector = (
  stick: NonNullable<TouchControlLayout['stick']>,
  x: number,
  y: number,
  options: { allowBeyondOuter?: boolean } = {}
): TouchStickPullVector | null => {
  const dx = x - stick.outer.centerX;
  const dy = y - stick.outer.centerY;
  const distance = Math.hypot(dx, dy);
  if (distance < stick.deadzoneRadius) {
    return null;
  }
  if (!options.allowBeyondOuter && distance > stick.outer.width / 2) {
    return null;
  }

  const angle = Math.atan2(dy, dx);
  const octant = (Math.round(angle / (Math.PI / 4)) + 8) % 8;
  let movement: HumanMovementActionKind;
  switch (octant) {
    case 0:
      movement = 'move_right';
      break;
    case 1:
      movement = 'move_down_right';
      break;
    case 2:
      movement = 'move_down';
      break;
    case 3:
      movement = 'move_down_left';
      break;
    case 4:
      movement = 'move_left';
      break;
    case 5:
      movement = 'move_up_left';
      break;
    case 6:
      movement = 'move_up';
      break;
    case 7:
      movement = 'move_up_right';
      break;
    default:
      return null;
  }

  const outerRadius = stick.outer.width / 2;
  const usableRadius = Math.max(1, outerRadius - stick.deadzoneRadius);
  const clampedDistance = Math.min(distance, outerRadius);
  const distanceRatio = clamp((clampedDistance - stick.deadzoneRadius) / usableRadius, 0, 1);
  const unitX = dx / distance;
  const unitY = dy / distance;

  return {
    angleRadians: angle,
    distanceRatio,
    movement,
    normalizedX: unitX * distanceRatio,
    normalizedY: unitY * distanceRatio
  };
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
  const controlMode = options.controlMode ?? 'arrows';
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
    const dpadPad = ultraNarrow ? 6 : Math.max(10, Math.round(buttonSize * 0.3));
    const dpadSpan = (buttonSize * 3) + (gap * 2);
    const dpadFrameWidth = Math.min(
      Math.max(1, viewport.width - safeInsets.left - safeInsets.right),
      dpadSpan + (dpadPad * 2)
    );
    const dpadFrameHeight = dpadSpan + (dpadPad * 2);
    const frameLeft = clamp(
      Math.round((viewport.width - dpadFrameWidth) / 2),
      safeInsets.left,
      Math.max(safeInsets.left, viewport.width - safeInsets.right - dpadFrameWidth)
    );
    const bottomLaneTop = options.avoidRect
      ? clamp(
        Math.round(options.avoidRect.top + options.avoidRect.height),
        0,
        Math.max(0, viewport.height - safeInsets.bottom)
      )
      : null;
    const frameTop = bottomLaneTop !== null
      ? clamp(
        Math.round(bottomLaneTop + (((viewport.height - safeInsets.bottom) - bottomLaneTop - dpadFrameHeight) / 2)),
        bottomLaneTop,
        Math.max(bottomLaneTop, viewport.height - safeInsets.bottom - dpadFrameHeight)
      )
      : clamp(
        Math.round(viewport.height - safeInsets.bottom - dpadFrameHeight - Math.max(12, buttonSize * 0.25)),
        0,
        Math.max(0, viewport.height - dpadFrameHeight)
      );
    const dpadLeft = Math.round(frameLeft + ((dpadFrameWidth - dpadSpan) / 2));
    const dpadTop = Math.round(frameTop + ((dpadFrameHeight - dpadSpan) / 2));
    const topActionHeight = clamp(Math.round(buttonSize * 0.72), 30, ultraNarrow ? 34 : 38);
    const topActionGap = ultraNarrow ? 4 : Math.max(7, Math.round(gap * 0.9));
    const timerSlotWidth = clamp(Math.round(viewport.width * 0.29), ultraNarrow ? 78 : 96, ultraNarrow ? 94 : 116);
    const actionWidth = clamp(
      Math.floor((viewport.width - safeInsets.left - safeInsets.right - timerSlotWidth - (topActionGap * 2) - 16) / 2),
      ultraNarrow ? 50 : 58,
      ultraNarrow ? 70 : 82
    );
    const actionTop = safeInsets.top + (ultraNarrow ? 44 : 8);
    const actionClusterWidth = (actionWidth * 2) + timerSlotWidth + (topActionGap * 2);
    const actionClusterLeft = clamp(
      Math.round((viewport.width - actionClusterWidth) / 2),
      safeInsets.left + 4,
      Math.max(safeInsets.left + 4, viewport.width - safeInsets.right - actionClusterWidth - 4)
    );
    const actionFrame = createRect(
      actionClusterLeft,
      actionTop,
      actionClusterWidth,
      topActionHeight
    );
    const dpadFrame = createRect(frameLeft, frameTop, dpadFrameWidth, dpadFrameHeight);
    const stickOuterSize = Math.min(dpadFrame.width - (dpadPad * 2), dpadFrame.height - (dpadPad * 2));
    const stickOuter = createRect(
      Math.round(dpadFrame.centerX - (stickOuterSize / 2)),
      Math.round(dpadFrame.centerY - (stickOuterSize / 2)),
      stickOuterSize,
      stickOuterSize
    );
    const stickInnerSize = clamp(Math.round(stickOuterSize * 0.34), 34, 54);
    const stickInner = createRect(
      Math.round(stickOuter.centerX - (stickInnerSize / 2)),
      Math.round(stickOuter.centerY - (stickInnerSize / 2)),
      stickInnerSize,
      stickInnerSize
    );

    return {
      compact,
      controlMode,
      frame: dpadFrame,
      frames: [actionFrame, dpadFrame],
      stick: controlMode === 'stick'
        ? {
          deadzoneRadius: Math.max(16, Math.round(stickOuterSize * 0.18)),
          inner: stickInner,
          outer: stickOuter
        }
        : null,
      controls: {
        move_up_left: createRect(dpadLeft, dpadTop, buttonSize, buttonSize),
        move_up: createRect(dpadLeft + buttonSize + gap, dpadTop, buttonSize, buttonSize),
        move_up_right: createRect(dpadLeft + ((buttonSize + gap) * 2), dpadTop, buttonSize, buttonSize),
        move_down_left: createRect(dpadLeft, dpadTop + ((buttonSize + gap) * 2), buttonSize, buttonSize),
        move_down: createRect(dpadLeft + buttonSize + gap, dpadTop + ((buttonSize + gap) * 2), buttonSize, buttonSize),
        move_down_right: createRect(dpadLeft + ((buttonSize + gap) * 2), dpadTop + ((buttonSize + gap) * 2), buttonSize, buttonSize),
        move_left: createRect(dpadLeft, dpadTop + buttonSize + gap, buttonSize, buttonSize),
        move_right: createRect(dpadLeft + ((buttonSize + gap) * 2), dpadTop + buttonSize + gap, buttonSize, buttonSize),
        pause: createRect(actionFrame.left, actionFrame.top, actionWidth, topActionHeight),
        restart_attempt: createRect(actionFrame.right - actionWidth, actionFrame.top, actionWidth, topActionHeight),
        toggle_thoughts: EMPTY_TOUCH_RECT
      }
    };
  }

  const avoidRect = options.avoidRect;
  const splitLandscape = compact && viewport.width > viewport.height && avoidRect !== undefined;
  if (splitLandscape) {
    const avoidLeft = clamp(Math.round(avoidRect.left), safeInsets.left, viewport.width - safeInsets.right);
    const avoidRight = clamp(Math.round(avoidRect.left + avoidRect.width), safeInsets.left, viewport.width - safeInsets.right);
    const avoidTop = clamp(Math.round(avoidRect.top), safeInsets.top, viewport.height - safeInsets.bottom);
    const avoidBottom = clamp(Math.round(avoidRect.top + avoidRect.height), safeInsets.top, viewport.height - safeInsets.bottom);
    const leftGutter = Math.max(0, avoidLeft - safeInsets.left);
    const rightGutter = Math.max(0, viewport.width - safeInsets.right - avoidRight);
    const verticalSpace = Math.max(1, viewport.height - safeInsets.top - safeInsets.bottom);
    const framePad = 8;
    const boardGap = Math.max(18, Math.round(minDim * 0.028));
    const rawButtonSize = Math.round(minDim * 0.112);
    const maxButtonSize = Math.floor(Math.min(
      (leftGutter - boardGap - (framePad * 2)) / 3.3,
      rightGutter - boardGap - (framePad * 2),
      (verticalSpace - (framePad * 2)) / 3.3,
      rawButtonSize
    ));
    const buttonSize = clamp(maxButtonSize, 36, 68);
    const gap = Math.max(8, Math.round(buttonSize * 0.18));
    const dpadSpan = (buttonSize * 3) + (gap * 2);
    const clusterHeight = dpadSpan;
    const dpadFrameWidth = dpadSpan + (framePad * 2);
    const actionFrameWidth = buttonSize + (framePad * 2);
    const frameHeight = clusterHeight + (framePad * 2);
    const leftSlotWidth = leftGutter - boardGap;
    const rightSlotWidth = rightGutter - boardGap;

    if (
      leftSlotWidth >= dpadFrameWidth
      && rightSlotWidth >= actionFrameWidth
      && verticalSpace >= frameHeight
    ) {
      const clusterTop = clamp(
        Math.round(avoidTop + (((avoidBottom - avoidTop) - clusterHeight) / 2)),
        safeInsets.top + framePad,
        viewport.height - safeInsets.bottom - clusterHeight - framePad
      );
      const dpadFrameLeft = Math.round(safeInsets.left + ((leftSlotWidth - dpadFrameWidth) / 2));
      const actionFrameLeft = Math.round(avoidRight + boardGap + ((rightSlotWidth - actionFrameWidth) / 2));
      const dpadLeft = dpadFrameLeft + framePad;
      const actionLeft = actionFrameLeft + framePad;
      const dpadFrame = createRect(dpadFrameLeft, clusterTop - framePad, dpadFrameWidth, frameHeight);
      const actionFrame = createRect(actionFrameLeft, clusterTop - framePad, actionFrameWidth, frameHeight);
      const frame = createRect(
        dpadFrame.left,
        Math.min(dpadFrame.top, actionFrame.top),
        actionFrame.right - dpadFrame.left,
        Math.max(dpadFrame.bottom, actionFrame.bottom) - Math.min(dpadFrame.top, actionFrame.top)
      );

      return {
        compact,
        controlMode,
        frame,
        frames: [dpadFrame, actionFrame],
        stick: null,
        controls: {
          move_up_left: createRect(dpadLeft, clusterTop, buttonSize, buttonSize),
          move_up: createRect(dpadLeft + buttonSize + gap, clusterTop, buttonSize, buttonSize),
          move_up_right: createRect(dpadLeft + ((buttonSize + gap) * 2), clusterTop, buttonSize, buttonSize),
          move_down_left: createRect(dpadLeft, clusterTop + ((buttonSize + gap) * 2), buttonSize, buttonSize),
          move_down: createRect(dpadLeft + buttonSize + gap, clusterTop + ((buttonSize + gap) * 2), buttonSize, buttonSize),
          move_down_right: createRect(dpadLeft + ((buttonSize + gap) * 2), clusterTop + ((buttonSize + gap) * 2), buttonSize, buttonSize),
          move_left: createRect(dpadLeft, clusterTop + buttonSize + gap, buttonSize, buttonSize),
          move_right: createRect(dpadLeft + ((buttonSize + gap) * 2), clusterTop + buttonSize + gap, buttonSize, buttonSize),
          pause: createRect(actionLeft, clusterTop, buttonSize, buttonSize),
          restart_attempt: createRect(actionLeft, clusterTop + buttonSize + gap, buttonSize, buttonSize),
          toggle_thoughts: EMPTY_TOUCH_RECT
        }
      };
    }
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
    move_up_left: createRect(frameLeft, frameTop, buttonSize, buttonSize),
    move_up: createRect(dpadCenterX - Math.round(buttonSize / 2), frameTop, buttonSize, buttonSize),
    move_up_right: createRect(frameLeft + (buttonSize + gap) * 2, frameTop, buttonSize, buttonSize),
    move_down_left: createRect(frameLeft, frameTop + (buttonSize + gap) * 2, buttonSize, buttonSize),
    move_down: createRect(dpadCenterX - Math.round(buttonSize / 2), frameTop + (buttonSize + gap) * 2, buttonSize, buttonSize),
    move_down_right: createRect(frameLeft + (buttonSize + gap) * 2, frameTop + (buttonSize + gap) * 2, buttonSize, buttonSize),
    move_left: createRect(frameLeft, dpadCenterY - Math.round(buttonSize / 2), buttonSize, buttonSize),
    move_right: createRect(frameLeft + (buttonSize + gap) * 2, dpadCenterY - Math.round(buttonSize / 2), buttonSize, buttonSize),
    pause: createRect(buttonStackLeft, buttonColumnTop, buttonSize, buttonSize),
    restart_attempt: createRect(buttonStackLeft, buttonColumnTop + buttonSize + gap, buttonSize, buttonSize),
    toggle_thoughts: EMPTY_TOUCH_RECT
  };

  return {
    compact,
    controlMode,
    frame: createRect(frameLeft, frameTop, frameWidth, frameHeight),
    stick: null,
    controls
  };
};

export const resolveTouchControlKindAtPoint = (
  layout: TouchControlLayout,
  x: number,
  y: number
): HumanInputActionKind | null => {
  for (const kind of ['pause', 'restart_attempt'] as const) {
    const rect = layout.controls[kind];
    if (isPointInRect(rect, x, y)) {
      return kind;
    }
  }

  if (layout.controlMode === 'stick' && layout.stick !== null) {
    return resolveStickMovementKind(layout.stick, x, y);
  }

  for (const kind of [
    'move_up',
    'move_up_right',
    'move_right',
    'move_down_right',
    'move_down',
    'move_down_left',
    'move_left',
    'move_up_left'
  ] as const) {
    const rect = layout.controls[kind];
    if (isPointInRect(rect, x, y)) {
      return kind;
    }
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
