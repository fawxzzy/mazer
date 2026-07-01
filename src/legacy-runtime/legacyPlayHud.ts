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
  elapsedMs: number;
  goalScreen: LegacyHudPoint;
  layoutWidth: number;
  playerScreen: LegacyHudPoint;
}

export interface LegacyPlayHudFrame {
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
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

export const resolveLegacyHudArrowAngle = (
  playerScreen: LegacyHudPoint,
  goalScreen: LegacyHudPoint
): number => Math.atan2(goalScreen.y - playerScreen.y, goalScreen.x - playerScreen.x);

export const resolveLegacyPlayHudFrame = (input: LegacyPlayHudFrameInput): LegacyPlayHudFrame => {
  const timerText = `Time ${formatLegacyHudClock(input.elapsedMs)}`;
  const arrowOrigin = {
    x: input.layoutWidth - 30,
    y: 22
  };
  const arrowAngleRadians = resolveLegacyHudArrowAngle(input.playerScreen, input.goalScreen);
  const length = 18;
  const timerBounds = createLegacyHudRect(14, 14, 118, 22);
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
  const arrowBoundsLeft = Math.floor(Math.min(arrowOrigin.x, arrowTip.x, arrowLeft.x, arrowRight.x)) - 2;
  const arrowBoundsTop = Math.floor(Math.min(arrowOrigin.y, arrowTip.y, arrowLeft.y, arrowRight.y)) - 2;
  const arrowBoundsRight = Math.ceil(Math.max(arrowOrigin.x, arrowTip.x, arrowLeft.x, arrowRight.x)) + 2;
  const arrowBoundsBottom = Math.ceil(Math.max(arrowOrigin.y, arrowTip.y, arrowLeft.y, arrowRight.y)) + 2;
  const arrowBounds = createLegacyHudRect(
    arrowBoundsLeft,
    arrowBoundsTop,
    arrowBoundsRight - arrowBoundsLeft,
    arrowBoundsBottom - arrowBoundsTop
  );

  return {
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
