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
    knobRadius: number;
    outer: TouchRect;
    travelRadius: number;
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
  movementCandidates: HumanMovementActionKind[];
  normalizedX: number;
  normalizedY: number;
}

export interface TouchClientPointTransformInput {
  canvas: {
    height: number;
    left: number;
    top: number;
    width: number;
  };
  clientX: number;
  clientY: number;
  logicalHeight: number;
  logicalWidth: number;
}

export interface TouchControlLayoutOptions {
  safeInsets?: TouchSafeInsetsLike;
  compact?: boolean;
  controlMode?: TouchControlMode;
  placement?: 'bottom-centered';
  phonePortraitOverride?: boolean;
  avoidRect?: {
    left: number;
    top: number;
    width: number;
    height: number;
  };
}

export type TouchControlMode = 'arrows' | 'stick';

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

// The outer ring has no chrome of its own (nothing is drawn at the actual
// edge), so dragging all the way out to it before the stick registers full
// speed reads as "the control needs way more travel than it should." Reaching
// max pull at a fraction of the way there keeps the knob's visual travel
// (driven by distanceRatio, unchanged) exactly the same while cutting the
// physical thumb distance needed to get there.
const STICK_MAX_PULL_REACH_RATIO = 0.6;

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

const resolveTopRightPauseRect = (
  viewport: TouchViewportLike,
  safeInsets: Required<TouchSafeInsetsLike>,
  requestedSize: number
): TouchRect => {
  const size = clamp(Math.round(requestedSize), 36, 56);
  const inset = Math.max(8, Math.round(size * 0.18));
  const left = clamp(
    Math.round(viewport.width - safeInsets.right - size - inset),
    safeInsets.left + 4,
    Math.max(safeInsets.left + 4, viewport.width - safeInsets.right - size - 4)
  );
  const top = clamp(
    safeInsets.top + 4,
    safeInsets.top + 4,
    Math.max(safeInsets.top + 4, viewport.height - safeInsets.bottom - size - 4)
  );

  return createRect(left, top, size, size);
};
const TOUCH_MOVEMENT_KINDS = [
  'move_up',
  'move_up_right',
  'move_right',
  'move_down_right',
  'move_down',
  'move_down_left',
  'move_left',
  'move_up_left'
] as const satisfies readonly HumanMovementActionKind[];

export interface StickPullOptions {
  allowBeyondOuter?: boolean;
}

export interface TouchArrowMovementOptions {
  allowBeyondFrame?: boolean;
  centerFallback?: HumanMovementActionKind | null;
}

const isPointInRect = (rect: TouchRect, x: number, y: number): boolean => (
  rect.width > 0
  && rect.height > 0
  && x >= rect.left
  && x <= rect.right
  && y >= rect.top
  && y <= rect.bottom
);

const uniqueMovementCandidates = (
  candidates: readonly HumanMovementActionKind[]
): HumanMovementActionKind[] => {
  const unique: HumanMovementActionKind[] = [];
  for (const candidate of candidates) {
    if (!unique.includes(candidate)) {
      unique.push(candidate);
    }
  }
  return unique;
};

export const resolveStickMovementIntent = (
  angle: number
): {
  movement: HumanMovementActionKind;
  movementCandidates: HumanMovementActionKind[];
} => {
  const axes: Array<{ magnitude: number; movement: HumanMovementActionKind; order: number }> = [
    {
      magnitude: Math.abs(Math.cos(angle)),
      movement: Math.cos(angle) >= 0 ? 'move_right' : 'move_left',
      order: 0
    },
    {
      magnitude: Math.abs(Math.sin(angle)),
      movement: Math.sin(angle) >= 0 ? 'move_down' : 'move_up',
      order: 1
    }
  ];
  const rankedAxes = axes.filter((axis) => axis.magnitude > 0.001);
  rankedAxes.sort((left, right) => {
    const magnitudeDelta = right.magnitude - left.magnitude;
    return Math.abs(magnitudeDelta) <= 0.000_001 ? left.order - right.order : magnitudeDelta;
  });
  const movementCandidates = uniqueMovementCandidates(rankedAxes.map((axis) => axis.movement));
  return {
    movement: movementCandidates[0] ?? 'move_right',
    movementCandidates
  };
};

export const resolveTouchClientPoint = ({
  canvas,
  clientX,
  clientY,
  logicalHeight,
  logicalWidth
}: TouchClientPointTransformInput): { x: number; y: number } => {
  const canvasWidth = Math.max(1, canvas.width);
  const canvasHeight = Math.max(1, canvas.height);
  return {
    x: ((clientX - canvas.left) / canvasWidth) * Math.max(1, logicalWidth),
    y: ((clientY - canvas.top) / canvasHeight) * Math.max(1, logicalHeight)
  };
};

export const resolveStickMovementKind = (
  stick: NonNullable<TouchControlLayout['stick']>,
  x: number,
  y: number,
  options: StickPullOptions = {}
): HumanMovementActionKind | null => {
  return resolveStickPullVector(stick, x, y, options)?.movement ?? null;
};

export const resolveStickPullVector = (
  stick: NonNullable<TouchControlLayout['stick']>,
  x: number,
  y: number,
  options: StickPullOptions = {}
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
  const intent = resolveStickMovementIntent(angle);

  const outerRadius = stick.outer.width / 2;
  const maxPullRadius = stick.deadzoneRadius
    + ((outerRadius - stick.deadzoneRadius) * STICK_MAX_PULL_REACH_RATIO);
  const usableRadius = Math.max(1, maxPullRadius - stick.deadzoneRadius);
  const clampedDistance = Math.min(distance, maxPullRadius);
  const distanceRatio = clamp((clampedDistance - stick.deadzoneRadius) / usableRadius, 0, 1);
  const unitX = dx / distance;
  const unitY = dy / distance;

  return {
    angleRadians: angle,
    distanceRatio,
    movement: intent.movement,
    movementCandidates: intent.movementCandidates,
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
  const phonePortrait = compact
    && viewport.height > viewport.width
    && (viewport.width <= 430 || options.phonePortraitOverride === true);
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
      ? (() => {
        const availableLaneSpace = Math.max(
          0,
          (viewport.height - safeInsets.bottom) - bottomLaneTop - dpadFrameHeight
        );
        // Keep the controller visually connected to the board instead of marooning it
        // at the bottom of a tall phone. The bottom safe area remains available for thumb reach.
        const boardControlGap = Math.round(availableLaneSpace * 0.42);
        return clamp(
          Math.round(bottomLaneTop + boardControlGap),
          bottomLaneTop,
          Math.max(bottomLaneTop, viewport.height - safeInsets.bottom - dpadFrameHeight)
        );
      })()
      : clamp(
        Math.round(viewport.height - safeInsets.bottom - dpadFrameHeight - Math.max(12, buttonSize * 0.25)),
        0,
        Math.max(0, viewport.height - dpadFrameHeight)
      );
    const dpadLeft = Math.round(frameLeft + ((dpadFrameWidth - dpadSpan) / 2));
    const dpadTop = Math.round(frameTop + ((dpadFrameHeight - dpadSpan) / 2));
    const actionFrame = resolveTopRightPauseRect(viewport, safeInsets, buttonSize);
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
    const stickKnobRadius = clamp(Math.round(stickOuterSize * 0.075), 10, 14);
    // How far the knob visually travels from the anchor dot at full pull --
    // was effectively the whole outer half-radius (~40%+ of the control),
    // which read as dragging way further than a thumb needs to. Heavily
    // cut down and decoupled from the outer/deadzone geometry so it stays
    // a short, tight throw regardless of how big the touch zone itself is.
    const stickTravelRadius = Math.round(clamp(stickOuterSize * 0.16, 18, 34));

    return {
      compact,
      controlMode,
      frame: dpadFrame,
      frames: [actionFrame, dpadFrame],
      stick: controlMode === 'stick'
        ? {
          deadzoneRadius: Math.max(12, Math.round(stickOuterSize * 0.12)),
          inner: stickInner,
          knobRadius: stickKnobRadius,
          outer: stickOuter,
          travelRadius: stickTravelRadius
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
        pause: createRect(actionFrame.left, actionFrame.top, actionFrame.width, actionFrame.height),
        restart_attempt: EMPTY_TOUCH_RECT,
        toggle_thoughts: EMPTY_TOUCH_RECT
      }
    };
  }

  const avoidRect = options.avoidRect;
  if (options.placement === 'bottom-centered' && avoidRect !== undefined) {
    const boardBottom = clamp(Math.round(avoidRect.top + avoidRect.height), safeInsets.top, viewport.height - safeInsets.bottom);
    const buttonSize = clamp(Math.round(minDim * 0.078), 44, 64);
    const gap = Math.max(8, Math.round(buttonSize * 0.16));
    const framePad = 8;
    const dpadSpan = (buttonSize * 3) + (gap * 2);
    const dpadFrameWidth = dpadSpan + (framePad * 2);
    const dpadFrameHeight = dpadSpan + (framePad * 2);
    const bottomLaneTop = Math.min(
      viewport.height - safeInsets.bottom - dpadFrameHeight,
      boardBottom + Math.max(10, Math.round(buttonSize * 0.2))
    );
    const dpadFrameTop = clamp(
      Math.round(bottomLaneTop + (((viewport.height - safeInsets.bottom) - bottomLaneTop - dpadFrameHeight) / 2)),
      bottomLaneTop,
      Math.max(bottomLaneTop, viewport.height - safeInsets.bottom - dpadFrameHeight)
    );
    const dpadFrameLeft = clamp(
      Math.round((viewport.width - dpadFrameWidth) / 2),
      safeInsets.left,
      Math.max(safeInsets.left, viewport.width - safeInsets.right - dpadFrameWidth)
    );
    const dpadLeft = dpadFrameLeft + framePad;
    const dpadTop = dpadFrameTop + framePad;
    const dpadFrame = createRect(dpadFrameLeft, dpadFrameTop, dpadFrameWidth, dpadFrameHeight);
    const actionFrame = resolveTopRightPauseRect(viewport, safeInsets, buttonSize);
    const stickOuterSize = Math.min(dpadFrame.width - (framePad * 2), dpadFrame.height - (framePad * 2));
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
    const stickKnobRadius = clamp(Math.round(stickOuterSize * 0.075), 10, 14);
    // How far the knob visually travels from the anchor dot at full pull --
    // was effectively the whole outer half-radius (~40%+ of the control),
    // which read as dragging way further than a thumb needs to. Heavily
    // cut down and decoupled from the outer/deadzone geometry so it stays
    // a short, tight throw regardless of how big the touch zone itself is.
    const stickTravelRadius = Math.round(clamp(stickOuterSize * 0.16, 18, 34));

    return {
      compact,
      controlMode,
      frame: dpadFrame,
      frames: [actionFrame, dpadFrame],
      stick: controlMode === 'stick'
        ? {
          deadzoneRadius: Math.max(12, Math.round(stickOuterSize * 0.12)),
          inner: stickInner,
          knobRadius: stickKnobRadius,
          outer: stickOuter,
          travelRadius: stickTravelRadius
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
        pause: createRect(actionFrame.left, actionFrame.top, actionFrame.width, actionFrame.height),
        restart_attempt: EMPTY_TOUCH_RECT,
        toggle_thoughts: EMPTY_TOUCH_RECT
      }
    };
  }

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
    const frameHeight = clusterHeight + (framePad * 2);
    const leftSlotWidth = leftGutter - boardGap;

    if (
      leftSlotWidth >= dpadFrameWidth
      && verticalSpace >= frameHeight
    ) {
      const clusterTop = clamp(
        Math.round(avoidTop + (((avoidBottom - avoidTop) - clusterHeight) / 2)),
        safeInsets.top + framePad,
        viewport.height - safeInsets.bottom - clusterHeight - framePad
      );
      const dpadFrameLeft = Math.round(safeInsets.left + ((leftSlotWidth - dpadFrameWidth) / 2));
      const dpadLeft = dpadFrameLeft + framePad;
      const dpadFrame = createRect(dpadFrameLeft, clusterTop - framePad, dpadFrameWidth, frameHeight);
      const actionFrame = resolveTopRightPauseRect(viewport, safeInsets, buttonSize);
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
          pause: actionFrame,
          restart_attempt: EMPTY_TOUCH_RECT,
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
  const pauseFrame = resolveTopRightPauseRect(viewport, safeInsets, buttonSize);

  const controls: Record<HumanInputActionKind, TouchRect> = {
    move_up_left: createRect(frameLeft, frameTop, buttonSize, buttonSize),
    move_up: createRect(dpadCenterX - Math.round(buttonSize / 2), frameTop, buttonSize, buttonSize),
    move_up_right: createRect(frameLeft + (buttonSize + gap) * 2, frameTop, buttonSize, buttonSize),
    move_down_left: createRect(frameLeft, frameTop + (buttonSize + gap) * 2, buttonSize, buttonSize),
    move_down: createRect(dpadCenterX - Math.round(buttonSize / 2), frameTop + (buttonSize + gap) * 2, buttonSize, buttonSize),
    move_down_right: createRect(frameLeft + (buttonSize + gap) * 2, frameTop + (buttonSize + gap) * 2, buttonSize, buttonSize),
    move_left: createRect(frameLeft, dpadCenterY - Math.round(buttonSize / 2), buttonSize, buttonSize),
    move_right: createRect(frameLeft + (buttonSize + gap) * 2, dpadCenterY - Math.round(buttonSize / 2), buttonSize, buttonSize),
    pause: pauseFrame,
    restart_attempt: EMPTY_TOUCH_RECT,
    toggle_thoughts: EMPTY_TOUCH_RECT
  };

  return {
    compact,
    controlMode,
    frame: createRect(frameLeft, frameTop, frameWidth, frameHeight),
    frames: [pauseFrame, createRect(frameLeft, frameTop, frameWidth, frameHeight)],
    stick: null,
    controls
  };
};

export const resolveTouchControlKindAtPoint = (
  layout: TouchControlLayout,
  x: number,
  y: number
): HumanInputActionKind | null => {
  for (const kind of ['pause'] as const) {
    const rect = layout.controls[kind];
    if (isPointInRect(rect, x, y)) {
      return kind;
    }
  }

  if (layout.controlMode === 'stick' && layout.stick !== null) {
    return resolveStickMovementKind(layout.stick, x, y);
  }

  for (const kind of TOUCH_MOVEMENT_KINDS) {
    const rect = layout.controls[kind];
    if (isPointInRect(rect, x, y)) {
      return kind;
    }
  }

  return null;
};

export const resolveTouchArrowMovementKindAtPoint = (
  layout: TouchControlLayout,
  x: number,
  y: number,
  options: TouchArrowMovementOptions = {}
): HumanMovementActionKind | null => {
  if (layout.controlMode !== 'arrows') {
    return null;
  }

  const exactControl = resolveTouchControlKindAtPoint(layout, x, y);
  if (exactControl !== null && TOUCH_MOVEMENT_KINDS.includes(exactControl as HumanMovementActionKind)) {
    return exactControl as HumanMovementActionKind;
  }

  if (!options.allowBeyondFrame && !isPointInRect(layout.frame, x, y)) {
    return null;
  }

  const dx = x - layout.frame.centerX;
  const dy = y - layout.frame.centerY;
  const centerDeadzoneRadius = Math.max(
    12,
    Math.min(layout.controls.move_up.width, layout.controls.move_left.height) * 0.34
  );
  if (Math.hypot(dx, dy) <= centerDeadzoneRadius) {
    return options.centerFallback ?? null;
  }

  return resolveStickMovementIntent(Math.atan2(dy, dx)).movement;
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
