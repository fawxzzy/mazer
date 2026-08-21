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
  layoutWidth: number;
  /** Device safe-area inset (notch/dynamic-island) -- pushes the whole top HUD row down below it, same as the title and header icons already do. */
  safeAreaTop?: number;
}

export interface LegacyPlayHudFrame {
  bounds: LegacyHudRect;
  timerBounds: LegacyHudRect;
  timerText: string;
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

const LEGACY_TIMER_HEIGHT = 38;
const LEGACY_TIMER_WIDTH = 112;
const LEGACY_HUD_TOP = 10;

export const resolveLegacyPlayHudFrame = (input: LegacyPlayHudFrameInput): LegacyPlayHudFrame => {
  const timerText = formatLegacyHudClock(input.elapsedMs);
  const hudTop = LEGACY_HUD_TOP + Math.max(0, Math.round(input.safeAreaTop ?? 0));
  // The compass used to anchor the true horizontal center, with the timer
  // sitting beside it -- now that the compass is gone, the timer itself
  // takes the centered slot.
  const timerBounds = createLegacyHudRect(
    Math.round((input.layoutWidth - LEGACY_TIMER_WIDTH) / 2),
    hudTop,
    LEGACY_TIMER_WIDTH,
    LEGACY_TIMER_HEIGHT
  );

  return {
    bounds: timerBounds,
    timerBounds,
    timerText
  };
};
