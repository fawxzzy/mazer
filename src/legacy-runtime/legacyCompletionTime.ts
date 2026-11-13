/**
 * Completion Time (MAZER-FLOW-015): the "Completion Time: MM:SS" line shown ABOVE the level number in the
 * between-levels announcer, fading in and out with it.
 *
 * DISPLAY ONLY. Nothing here is persisted, sent, saved, ranked or written to a receipt. The number it shows
 * is the SAME per-level run timer the scene already keeps (`playStartedAtMs` / `playCompletedAtMs`, read
 * through `resolveLegacyFrozenElapsedMs`), so there is no second clock to drift from it:
 *
 *  - Start: the maze has finished building and input is open (`resolveLegacyStaticDrawPlayTimerStartAtMs`),
 *    so the intro and the build never count. The same instant the lifecycle reports `timerRunning`.
 *  - Stop: the move that lands on the goal tile (`playCompletedAtMs`).
 *  - Pause: the scene's lifecycle hold (`legacyLifecycleHold.ts`) moves both anchors forward by every held
 *    frame (settings sheet open, pause menu, hidden page). Hidden time is therefore excluded and the clock is
 *    the engine's monotonic frame time, never wall time, so the value cannot go negative or jump.
 *  - Reset: a new level starts a new run; "Restart" from the pause menu restarts the run timer too, so the
 *    time shown is the time of the attempt that reached the goal.
 *
 * This module only turns that elapsed value into text, decides when a value is worth showing, and lays the
 * line out. Pure: no Phaser, no DOM, no clock.
 */

import { designTokens } from '../theme/tokens';

/** Theme colours: primary text with a canvas-coloured outline, so the line stays readable over any board tile. */
export const LEGACY_COMPLETION_TIME_TEXT_COLOR = designTokens.color['text.primary'];
export const LEGACY_COMPLETION_TIME_STROKE_COLOR = designTokens.color['bg.canvas'];

/** The label. Kept here (not as a literal in the scene) so the player-message inventory has one home for it. */
export const LEGACY_COMPLETION_TIME_LABEL = 'Completion Time';

/** Display cap: 99:59. Anything longer reads as 99:59 (MM:SS stays two digits wide, no layout jump). */
export const LEGACY_COMPLETION_TIME_CAP_SECONDS = (99 * 60) + 59;

const MS_PER_SECOND = 1000;

/**
 * The value to remember when a run finishes, or null when there is nothing real to show.
 * Non-finite, negative and zero values are dropped (a zero means the timer never ran, for example a goal
 * reached while the timer was still frozen, and "00:00" would be a bogus claim). Giant values are clamped.
 */
export const captureLegacyCompletionTimeMs = (elapsedMs: unknown): number | null => {
  if (typeof elapsedMs !== 'number' || !Number.isFinite(elapsedMs) || elapsedMs <= 0) {
    return null;
  }
  return Math.min(elapsedMs, (LEGACY_COMPLETION_TIME_CAP_SECONDS + 1) * MS_PER_SECOND - 1);
};

/** `MM:SS`, whole seconds rounded DOWN (a 59.9 s run reads 00:59, like every stopwatch), capped at 99:59. */
export const formatLegacyCompletionTime = (elapsedMs: number): string => {
  const safeMs = Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) : 0;
  const totalSeconds = Math.min(LEGACY_COMPLETION_TIME_CAP_SECONDS, Math.floor(safeMs / MS_PER_SECOND));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

/** `Completion Time: MM:SS`. */
export const formatLegacyCompletionTimeLine = (elapsedMs: number): string => (
  `${LEGACY_COMPLETION_TIME_LABEL}: ${formatLegacyCompletionTime(elapsedMs)}`
);

/** The widest the line can ever be, in characters ("Completion Time: 99:59"). */
export const LEGACY_COMPLETION_TIME_LINE_MAX_CHARS = formatLegacyCompletionTimeLine(0).length;

/** The line to draw, or null. Menu-demo mazes are never timed for the player, so only Play mode shows it. */
export const resolveLegacyCompletionTimeLine = (input: {
  readonly completedMs: number | null;
  readonly mode: 'menu' | 'play';
}): string | null => {
  if (input.mode !== 'play') {
    return null;
  }
  const captured = captureLegacyCompletionTimeMs(input.completedMs);
  return captured === null ? null : formatLegacyCompletionTimeLine(captured);
};

/**
 * Whether the remembered time should still be kept. It is dropped as soon as the player is off the menu or
 * starts moving on the next level, so it can only ever appear in the announcer that follows the run it
 * measured (the fade-in during the deconstruct and the fade-out during the next build), never on a later
 * level or after a quit and re-entry.
 */
export const shouldRetainLegacyCompletionTime = (input: {
  readonly mode: 'menu' | 'play';
  readonly nextRunStarted: boolean;
}): boolean => input.mode === 'play' && !input.nextRunStarted;

export interface LegacyCompletionTimeLineLayout {
  /** Font size in whole css px. */
  readonly fontPx: number;
  /** Whole css px y of the text's BOTTOM edge (draw with origin y = 1). */
  readonly bottomY: number;
  /** Whole css px x of the text's centre. */
  readonly centerX: number;
}

/**
 * Where the line goes: horizontally centred, its bottom edge a small gap above the number's FULL-SIZE top
 * edge. It does not follow the number's scale animation, so the text never moves or re-rasterises while it
 * fades (Reduce Motion is therefore automatically movement-free for it). Whole pixels everywhere so the
 * Phaser canvas renderer (roundPixels) draws it crisp.
 */
export const resolveLegacyCompletionTimeLineLayout = (input: {
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  readonly numberCenterY: number;
  readonly numberHeight: number;
}): LegacyCompletionTimeLineLayout => {
  const shortSide = Math.min(input.viewportWidth, input.viewportHeight);
  // ~0.6 em per monospace character, leave 10 percent of the width spare.
  const widthCap = Math.floor((input.viewportWidth * 0.9) / (LEGACY_COMPLETION_TIME_LINE_MAX_CHARS * 0.62));
  const fontPx = Math.max(10, Math.min(Math.round(shortSide * 0.036), widthCap, 28));
  const gap = Math.max(8, Math.round(fontPx * 0.8));
  return {
    bottomY: Math.round(input.numberCenterY - (input.numberHeight / 2) - gap),
    centerX: Math.round(input.viewportWidth / 2),
    fontPx
  };
};
