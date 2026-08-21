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

// A compact size sitting immediately beside the timer pill, both centered
// as one HUD cluster at the true top-middle of the screen -- not tucked
// into a screen corner or embedded inside the touch D-pad/stick, which is
// where this used to default to/get pinned from.
const LEGACY_COMPASS_DEFAULT_SIZE = 40;
const LEGACY_COMPASS_TIMER_GAP = 10;

export const resolveLegacyPlayHudFrame = (input: LegacyPlayHudFrameInput): LegacyPlayHudFrame => {
  const timerText = formatLegacyHudClock(input.elapsedMs);
  const timerBounds = createLegacyHudRect(Math.round((input.layoutWidth - 112) / 2), 10, 112, 38);
  const compassBounds = input.compassBounds
    ? createLegacyHudRect(input.compassBounds.left, input.compassBounds.top, input.compassBounds.width, input.compassBounds.height)
    : createLegacyHudRect(
      Math.round(timerBounds.right + LEGACY_COMPASS_TIMER_GAP),
      Math.round(timerBounds.centerY - (LEGACY_COMPASS_DEFAULT_SIZE / 2)),
      LEGACY_COMPASS_DEFAULT_SIZE,
      LEGACY_COMPASS_DEFAULT_SIZE
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
