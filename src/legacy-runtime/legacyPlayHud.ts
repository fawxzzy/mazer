export interface LegacyHudPoint {
  x: number;
  y: number;
}

export interface LegacyHudRect {
  bottom: number;
  centerX: number;
  centerY: number;
  height: number;
  left: number;
  right: number;
  top: number;
  width: number;
}

export interface LegacyPlayHudFrameInput {
  compassBounds?: {
    height: number;
    left: number;
    top: number;
    width: number;
  };
  elapsedMs: number;
  goalScreen: LegacyHudPoint;
  layoutWidth: number;
  playerScreen: LegacyHudPoint;
  /** Device safe-area inset (notch/dynamic-island) -- pushes the whole top HUD row down below it, same as the title and header icons already do. */
  safeAreaTop?: number;
}

export interface LegacyPlayHudFrame {
  arrowAngleDegrees: number;
  arrowAngleRadians: number;
  arrowBounds: LegacyHudRect;
  arrowLeft: LegacyHudPoint;
  arrowOrigin: LegacyHudPoint;
  arrowRight: LegacyHudPoint;
  arrowTip: LegacyHudPoint;
  bounds: LegacyHudRect;
  timerBounds: LegacyHudRect;
  timerText: string;
}

export interface LegacyCompassSpinFrameInput {
  durationMs: number;
  elapsedMs: number;
  targetAngleRadians: number;
  turns: number;
}

export interface LegacyCompassSpinFrame {
  active: boolean;
  angleDegrees: number;
  angleRadians: number;
  progress: number;
}

export interface LegacyFrozenElapsedInput {
  completedAtMs?: number | null;
  nowMs: number;
  startedAtMs: number;
}

const createLegacyHudRect = (left: number, top: number, width: number, height: number): LegacyHudRect => ({
  left,
  top,
  width,
  height,
  right: left + width,
  bottom: top + height,
  centerX: left + (width / 2),
  centerY: top + (height / 2)
});

const mergeLegacyHudRects = (...rects: readonly LegacyHudRect[]): LegacyHudRect => {
  const left = Math.min(...rects.map((rect) => rect.left));
  const top = Math.min(...rects.map((rect) => rect.top));
  const right = Math.max(...rects.map((rect) => rect.right));
  const bottom = Math.max(...rects.map((rect) => rect.bottom));

  return createLegacyHudRect(left, top, right - left, bottom - top);
};

export const formatLegacyHudClock = (elapsedMs: number): string => {
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
  const minutes = Math.floor(totalSeconds / 60) % 10;
  const seconds = totalSeconds % 60;

  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

export const resolveLegacyFrozenElapsedMs = ({
  completedAtMs,
  nowMs,
  startedAtMs
}: LegacyFrozenElapsedInput): number => Math.max(
  0,
  Math.round((completedAtMs ?? nowMs) - startedAtMs)
);

export const resolveLegacyHudArrowAngle = (
  playerScreen: LegacyHudPoint,
  goalScreen: LegacyHudPoint
): number => Math.atan2(goalScreen.y - playerScreen.y, goalScreen.x - playerScreen.x);

export const resolveLegacyCompassSpinFrame = ({
  durationMs,
  elapsedMs,
  targetAngleRadians,
  turns
}: LegacyCompassSpinFrameInput): LegacyCompassSpinFrame => {
  const safeDurationMs = Math.max(1, Math.round(durationMs));
  const progress = Math.max(0, Math.min(1, elapsedMs / safeDurationMs));
  const remaining = Math.pow(1 - progress, 3);
  const angleRadians = targetAngleRadians + (remaining * turns * Math.PI * 2);

  return {
    active: progress < 1,
    angleDegrees: (angleRadians * 180) / Math.PI,
    angleRadians,
    progress
  };
};

// The compass itself sits at the true horizontal center of the screen (the
// literal "centered middle" ask) -- the timer moves beside it instead of
// the other way around, since the compass is the one thing that needs to
// read as centered at a glance, not just adjacent to whatever else is
// centered.
const LEGACY_COMPASS_DEFAULT_SIZE = 40;
const LEGACY_COMPASS_TIMER_GAP = 10;
const LEGACY_TIMER_HEIGHT = 38;
const LEGACY_TIMER_WIDTH = 112;
const LEGACY_HUD_TOP = 10;

export const resolveLegacyPlayHudFrame = (input: LegacyPlayHudFrameInput): LegacyPlayHudFrame => {
  const timerText = formatLegacyHudClock(input.elapsedMs);
  const hudTop = LEGACY_HUD_TOP + Math.max(0, Math.round(input.safeAreaTop ?? 0));
  const compassBounds = input.compassBounds
    ? createLegacyHudRect(input.compassBounds.left, input.compassBounds.top, input.compassBounds.width, input.compassBounds.height)
    : createLegacyHudRect(
      Math.round((input.layoutWidth - LEGACY_COMPASS_DEFAULT_SIZE) / 2),
      hudTop + Math.round((LEGACY_TIMER_HEIGHT - LEGACY_COMPASS_DEFAULT_SIZE) / 2),
      LEGACY_COMPASS_DEFAULT_SIZE,
      LEGACY_COMPASS_DEFAULT_SIZE
    );
  const timerBounds = createLegacyHudRect(
    Math.round(compassBounds.left - LEGACY_COMPASS_TIMER_GAP - LEGACY_TIMER_WIDTH),
    hudTop,
    LEGACY_TIMER_WIDTH,
    LEGACY_TIMER_HEIGHT
  );
  const arrowOrigin = {
    x: compassBounds.centerX,
    y: compassBounds.centerY
  };
  const arrowAngleRadians = resolveLegacyHudArrowAngle(input.playerScreen, input.goalScreen);
  const arrowAngleDegrees = (arrowAngleRadians * 180) / Math.PI;
  const length = 14;
  const arrowTip = {
    x: arrowOrigin.x + (Math.cos(arrowAngleRadians) * length),
    y: arrowOrigin.y + (Math.sin(arrowAngleRadians) * length)
  };
  const arrowLeft = {
    x: arrowOrigin.x + (Math.cos(arrowAngleRadians + 2.42) * 6),
    y: arrowOrigin.y + (Math.sin(arrowAngleRadians + 2.42) * 6)
  };
  const arrowRight = {
    x: arrowOrigin.x + (Math.cos(arrowAngleRadians - 2.42) * 6),
    y: arrowOrigin.y + (Math.sin(arrowAngleRadians - 2.42) * 6)
  };
  const arrowBounds = compassBounds;

  return {
    arrowAngleDegrees,
    arrowAngleRadians,
    arrowBounds,
    arrowLeft,
    arrowOrigin,
    arrowRight,
    arrowTip,
    bounds: mergeLegacyHudRects(timerBounds, arrowBounds),
    timerBounds,
    timerText
  };
};
