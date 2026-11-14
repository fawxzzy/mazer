/**
 * MAZER-UI-024: pure display model for the main-menu "online now" counter.
 *
 * Turns the raw, jumpy stream of counts from the presence client into something calm:
 *  - coalesces bursts (a new count is accepted at most once per PRESENCE_MIN_UPDATE_MS),
 *  - eases the shown number toward the accepted count in whole-number steps (no flicker),
 *  - holds the last known value through a brief connection gap (PRESENCE_UNKNOWN_GRACE_MS)
 *    before fading out,
 *  - fades in and out (instant under Reduce Motion),
 *  - never shows zero or unknown.
 *
 * Time is injected (`nowMs`); no timers, no Phaser, no DOM. Every function returns a new state.
 */

/** A newly reported count is accepted at most this often. */
export const PRESENCE_MIN_UPDATE_MS = 1500;
/** The shown number walks to a new target over about this long. */
export const PRESENCE_EASE_MS = 700;
/** Largest number of visible number steps in one ease (a jump of 40 reads as 8 quick steps). */
export const PRESENCE_MAX_EASE_STEPS = 8;
export const PRESENCE_FADE_IN_MS = 450;
export const PRESENCE_FADE_OUT_MS = 300;
/** After the count becomes unknown the last value stays for this long, then fades out. */
export const PRESENCE_UNKNOWN_GRACE_MS = 5000;

export interface PresenceDisplayState {
  /** Latest accepted count (>= 1) or null while unknown. */
  readonly accepted: number | null;
  /** Count reported but held back by the coalescing window (undefined = nothing held). */
  readonly pending: number | undefined;
  readonly acceptedAtMs: number;
  /** Number the current ease started from. */
  readonly easeFrom: number | null;
  readonly easeStartMs: number;
  /** When the count became unknown (null while known). */
  readonly unknownSinceMs: number | null;
  /** Start of the current fade and its direction. */
  readonly fadeStartMs: number;
  readonly fadeDirection: 'in' | 'out' | 'none';
  /** Last value ever shown; kept during the unknown grace window. */
  readonly lastValue: number | null;
}

export interface PresenceDisplayFrame {
  readonly visible: boolean;
  /** Whole number to draw, null when hidden. */
  readonly value: number | null;
  readonly alpha: number;
  /** True while anything is still changing (the scene should keep redrawing). */
  readonly animating: boolean;
}

export const createPresenceDisplayState = (): PresenceDisplayState => ({
  accepted: null,
  acceptedAtMs: Number.NEGATIVE_INFINITY,
  easeFrom: null,
  easeStartMs: 0,
  fadeDirection: 'none',
  fadeStartMs: 0,
  lastValue: null,
  pending: undefined,
  unknownSinceMs: null
});

const normalize = (count: number | null | undefined): number | null => (
  typeof count === 'number' && Number.isSafeInteger(count) && count >= 1 ? count : null
);

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

const isFadedOut = (state: PresenceDisplayState, nowMs: number): boolean => (
  state.fadeDirection === 'out' && nowMs - state.fadeStartMs >= PRESENCE_FADE_OUT_MS
);

const acceptCount = (state: PresenceDisplayState, count: number, nowMs: number): PresenceDisplayState => {
  const fresh = state.lastValue === null || isFadedOut(state, nowMs) || state.fadeDirection === 'out';
  return {
    ...state,
    accepted: count,
    acceptedAtMs: nowMs,
    easeFrom: fresh ? count : (state.accepted ?? state.lastValue),
    easeStartMs: nowMs,
    fadeDirection: fresh ? 'in' : state.fadeDirection,
    fadeStartMs: fresh ? nowMs : state.fadeStartMs,
    lastValue: count,
    pending: undefined,
    unknownSinceMs: null
  };
};

const acceptUnknown = (state: PresenceDisplayState, nowMs: number): PresenceDisplayState => ({
  ...state,
  accepted: null,
  acceptedAtMs: nowMs,
  pending: undefined,
  unknownSinceMs: state.unknownSinceMs ?? nowMs
});

/** Feed a raw count (or null = unknown) from the presence client. */
export const pushPresenceSample = (
  state: PresenceDisplayState,
  rawCount: number | null | undefined,
  nowMs: number
): PresenceDisplayState => {
  const count = normalize(rawCount);
  if (count === null) {
    if (state.accepted === null && state.pending === undefined) {
      return state;
    }
    return acceptUnknown(state, nowMs);
  }
  if (state.accepted === count && state.pending === undefined) {
    return state;
  }
  // First value, or back from unknown: show it at once. Otherwise coalesce bursts.
  if (state.accepted === null || nowMs - state.acceptedAtMs >= PRESENCE_MIN_UPDATE_MS) {
    return acceptCount(state, count, nowMs);
  }
  return { ...state, pending: count };
};

/** Advance time: release a held-back sample and expire the unknown grace. Returns the same object when nothing changed. */
export const advancePresenceDisplay = (state: PresenceDisplayState, nowMs: number): PresenceDisplayState => {
  let next = state;
  if (next.pending !== undefined && nowMs - next.acceptedAtMs >= PRESENCE_MIN_UPDATE_MS) {
    next = acceptCount(next, next.pending, nowMs);
  }
  if (
    next.accepted === null
    && next.lastValue !== null
    && next.unknownSinceMs !== null
    && next.fadeDirection !== 'out'
    && nowMs - next.unknownSinceMs >= PRESENCE_UNKNOWN_GRACE_MS
  ) {
    next = { ...next, fadeDirection: 'out', fadeStartMs: next.unknownSinceMs + PRESENCE_UNKNOWN_GRACE_MS };
  }
  return next;
};

const resolveEasedValue = (state: PresenceDisplayState, nowMs: number, reducedMotion: boolean): number | null => {
  if (state.accepted === null) {
    return state.lastValue;
  }
  if (reducedMotion || state.easeFrom === null || state.easeFrom === state.accepted) {
    return state.accepted;
  }
  const distance = state.accepted - state.easeFrom;
  const steps = Math.min(Math.abs(distance), PRESENCE_MAX_EASE_STEPS);
  const progress = clamp01((nowMs - state.easeStartMs) / PRESENCE_EASE_MS);
  if (progress >= 1) {
    return state.accepted;
  }
  // Whole-number steps, the first one immediately, the last one exactly on the target.
  const step = Math.min(steps, Math.floor(progress * steps) + 1);
  return Math.round(state.easeFrom + (distance * step) / steps);
};

export const resolvePresenceDisplayFrame = (
  state: PresenceDisplayState,
  nowMs: number,
  reducedMotion: boolean
): PresenceDisplayFrame => {
  const value = resolveEasedValue(state, nowMs, reducedMotion);
  const hidden: PresenceDisplayFrame = { alpha: 0, animating: false, value: null, visible: false };
  if (value === null) {
    return hidden;
  }
  let alpha = 1;
  let animating = false;
  if (state.fadeDirection === 'out') {
    if (reducedMotion || isFadedOut(state, nowMs)) {
      return hidden;
    }
    alpha = 1 - clamp01((nowMs - state.fadeStartMs) / PRESENCE_FADE_OUT_MS);
    animating = true;
  } else if (state.fadeDirection === 'in' && !reducedMotion) {
    const progress = clamp01((nowMs - state.fadeStartMs) / PRESENCE_FADE_IN_MS);
    alpha = progress;
    animating = progress < 1;
  }
  if (state.accepted !== null && value !== state.accepted) {
    animating = true;
  }
  if (state.pending !== undefined || (state.accepted === null && state.unknownSinceMs !== null)) {
    animating = true;
  }
  return { alpha, animating, value, visible: alpha > 0 };
};
