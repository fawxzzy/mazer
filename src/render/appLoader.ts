/**
 * The one app loader (MAZER-VIS-039): the Mazer app image centred on the dark neon background with a soft ring, used
 * by the static HTML boot splash and by the in-game loading cover. This module is the pure timeline both follow.
 *
 * What it fixes (compare the Fitness loader, docs/ops/MAZER-LOADER-STUDY-2026-11-13.md):
 *   - no pop: the loader fades IN (base step) instead of mounting at full opacity, and fades OUT (slow step) instead
 *     of unmounting; the exit is a crossfade into the first real frame;
 *   - no flash: nothing shows until a wait has lasted LOADER_SHOW_DELAY_MS, and once shown it holds for at least
 *     LOADER_MIN_HOLD_MS before the exit starts, so a fast load never blinks the loader on and off;
 *   - no jump: a wait that ends mid fade-in just finishes the hold, and a new wait during a fade-out turns the
 *     fade around from the CURRENT opacity, so opacity is continuous in every case;
 *   - no stutter: the pose is four numbers (opacity, icon scale, ring scale, ring opacity), applied with transforms and
 *     alpha only; nothing is redrawn per frame.
 *
 * Every length comes off the shared motion scale (motionScale.ts). The show delay and minimum hold are not motion
 * durations (no pixel moves during them), so they are named thresholds here, not new ladder steps.
 *
 * Reduced motion (reducedMotion.ts): the fades become the one 200 ms crossfade, the icon and ring stop moving (the ring
 * is held as a still halo); the delay and hold are unchanged because they are timing policy, not movement.
 *
 * Pure: no Phaser, DOM, randomness or wall-clock dependency; the caller passes the time.
 */
import {
  MOTION_DURATION_MS,
  MOTION_EASING,
  MOTION_LOOP_MS,
  MOTION_REDUCED_MS,
  motionLoopPhase
} from './motionScale';

/** A wait shorter than this never shows the loader. */
export const LOADER_SHOW_DELAY_MS = 150;
/** Once shown, the loader stays at least this long (from the first fade-in frame) before it starts to leave. */
export const LOADER_MIN_HOLD_MS = 350;
export const LOADER_FADE_IN_MS = MOTION_DURATION_MS.base;
export const LOADER_FADE_OUT_MS = MOTION_DURATION_MS.slow;
/** The ring and icon breathe once per beat, the same period as every other loop (MOTION_LOOP_MS.beat). */
export const LOADER_PULSE_PERIOD_MS = MOTION_LOOP_MS.beat;

/** Icon size: 30% of the short side, clamped. The iOS launch image uses the same 30% of the width (portrait). */
export const LOADER_ICON_SIZE_RATIO = 0.3;
export const LOADER_ICON_MIN_PX = 88;
export const LOADER_ICON_MAX_PX = 150;
/** Peak icon scale on the beat (movement; dropped under reduced motion). */
export const LOADER_ICON_PULSE_SCALE = 0.03;
/** The ring starts at the icon edge and grows by this much while it fades out over one beat. */
export const LOADER_RING_GROWTH = 0.22;
export const LOADER_RING_PEAK_ALPHA = 0.5;
/** Reduced motion: the ring is a still halo, slightly outside the icon. */
export const LOADER_RING_REDUCED_SCALE = 1.08;
export const LOADER_RING_REDUCED_ALPHA = 0.28;

export const resolveLoaderIconSizePx = (viewportWidth: number, viewportHeight: number): number => {
  const shortSide = Math.min(viewportWidth, viewportHeight);
  if (!Number.isFinite(shortSide) || shortSide <= 0) {
    return LOADER_ICON_MIN_PX;
  }
  return Math.round(Math.min(LOADER_ICON_MAX_PX, Math.max(LOADER_ICON_MIN_PX, shortSide * LOADER_ICON_SIZE_RATIO)));
};

/** The label sits this far under the icon (CSS `top: calc(100% + 22px)` in index.html) and is ~16 px tall. */
export const LOADER_LABEL_GAP_PX = 22;
export const LOADER_LABEL_HEIGHT_PX = 16;

export interface LoaderLayout {
  readonly centreX: number;
  readonly centreY: number;
  readonly iconSizePx: number;
  /** Vertical centre of the label line. */
  readonly labelCentreY: number;
}

/** Where the loader sits for a viewport: dead centre, the same place the HTML splash puts it. */
export const resolveLoaderLayout = (viewportWidth: number, viewportHeight: number): LoaderLayout => {
  const iconSizePx = resolveLoaderIconSizePx(viewportWidth, viewportHeight);
  const centreX = viewportWidth / 2;
  const centreY = viewportHeight / 2;
  return {
    centreX,
    centreY,
    iconSizePx,
    labelCentreY: centreY + (iconSizePx / 2) + LOADER_LABEL_GAP_PX + (LOADER_LABEL_HEIGHT_PX / 2)
  };
};

export const resolveLoaderFadeMs =(direction: 'in' | 'out', reducedMotion: boolean): number => {
  if (reducedMotion) {
    return MOTION_REDUCED_MS.crossfade;
  }
  return direction === 'in' ? LOADER_FADE_IN_MS : LOADER_FADE_OUT_MS;
};

export type LoaderPhase = 'idle' | 'waiting' | 'fading-in' | 'holding' | 'fading-out';

export interface LoaderMachine {
  readonly phase: LoaderPhase;
  /** When the current phase began (ms on the caller's clock). */
  readonly phaseStartMs: number;
  /** Opacity at the start of the current phase: a fade starts from here, so opacity is continuous. */
  readonly phaseStartAlpha: number;
  /** When the loader first became visible in this showing: the minimum hold counts from here. */
  readonly shownAtMs: number;
}

export interface LoaderFrame {
  readonly machine: LoaderMachine;
  /** 0..1 opacity of the whole loader (backdrop, icon, ring and label). */
  readonly alpha: number;
  /** True while anything should be drawn at all. */
  readonly visible: boolean;
}

export const createLoaderMachine = (): LoaderMachine => ({
  phase: 'idle',
  phaseStartMs: 0,
  phaseStartAlpha: 0,
  shownAtMs: 0
});

export interface StepLoaderOptions {
  /**
   * A cover that must be fully opaque from this frame because something else (the HTML boot splash) is already
   * showing the same loader: starts at full opacity with the minimum hold already served by that splash.
   * Only read when the machine is idle and the wait is active.
   */
  readonly instant?: boolean;
}

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

const fadeProgress = (nowMs: number, startMs: number, durationMs: number): number => (
  durationMs <= 0 ? 1 : clamp01((nowMs - startMs) / durationMs)
);

/**
 * Advances the loader one frame. `active` is "something is currently being waited on". Deterministic in
 * (machine, active, nowMs, reducedMotion, options). A clock that goes backwards is treated as no time passing.
 */
export const stepLoader = (
  machine: LoaderMachine,
  active: boolean,
  nowMs: number,
  reducedMotion: boolean,
  options: StepLoaderOptions = {}
): LoaderFrame => {
  const now = Number.isFinite(nowMs) ? Math.max(nowMs, machine.phaseStartMs) : machine.phaseStartMs;
  let current = machine;

  // At most two transitions can chain in one frame (e.g. waiting -> fading-in, holding -> fading-out), so a short
  // bounded loop keeps the machine total without recursion.
  for (let guard = 0; guard < 3; guard += 1) {
    const next = advance(current, active, now, reducedMotion, options);
    if (next === current) {
      break;
    }
    current = next;
  }

  const alpha = alphaOf(current, now, reducedMotion);
  return { machine: current, alpha, visible: current.phase !== 'idle' && current.phase !== 'waiting' && alpha > 0 };
};

const advance = (
  machine: LoaderMachine,
  active: boolean,
  now: number,
  reducedMotion: boolean,
  options: StepLoaderOptions
): LoaderMachine => {
  switch (machine.phase) {
    case 'idle':
      if (!active) {
        return machine;
      }
      if (options.instant === true) {
        return { phase: 'holding', phaseStartMs: now, phaseStartAlpha: 1, shownAtMs: now - LOADER_MIN_HOLD_MS };
      }
      return { phase: 'waiting', phaseStartMs: now, phaseStartAlpha: 0, shownAtMs: 0 };
    case 'waiting':
      if (!active) {
        return { phase: 'idle', phaseStartMs: now, phaseStartAlpha: 0, shownAtMs: 0 };
      }
      if (now - machine.phaseStartMs >= LOADER_SHOW_DELAY_MS) {
        return { phase: 'fading-in', phaseStartMs: now, phaseStartAlpha: 0, shownAtMs: now };
      }
      return machine;
    case 'fading-in':
      if (fadeProgress(now, machine.phaseStartMs, resolveLoaderFadeMs('in', reducedMotion)) >= 1) {
        return { phase: 'holding', phaseStartMs: now, phaseStartAlpha: 1, shownAtMs: machine.shownAtMs };
      }
      return machine;
    case 'holding':
      if (!active && now - machine.shownAtMs >= LOADER_MIN_HOLD_MS) {
        return { phase: 'fading-out', phaseStartMs: now, phaseStartAlpha: 1, shownAtMs: machine.shownAtMs };
      }
      return machine;
    case 'fading-out':
      if (active) {
        // A new wait while leaving: turn around from where the opacity is NOW (no pop back to full or to zero).
        return {
          phase: 'fading-in',
          phaseStartMs: now,
          phaseStartAlpha: alphaOf(machine, now, reducedMotion),
          shownAtMs: now
        };
      }
      if (fadeProgress(now, machine.phaseStartMs, resolveLoaderFadeMs('out', reducedMotion)) >= 1) {
        return { phase: 'idle', phaseStartMs: now, phaseStartAlpha: 0, shownAtMs: 0 };
      }
      return machine;
  }
};

const alphaOf = (machine: LoaderMachine, now: number, reducedMotion: boolean): number => {
  switch (machine.phase) {
    case 'idle':
    case 'waiting':
      return 0;
    case 'holding':
      return 1;
    case 'fading-in': {
      const eased = MOTION_EASING.smoothstep(fadeProgress(now, machine.phaseStartMs, resolveLoaderFadeMs('in', reducedMotion)));
      return clamp01(machine.phaseStartAlpha + ((1 - machine.phaseStartAlpha) * eased));
    }
    case 'fading-out': {
      const eased = MOTION_EASING.smoothstep(fadeProgress(now, machine.phaseStartMs, resolveLoaderFadeMs('out', reducedMotion)));
      return clamp01(machine.phaseStartAlpha * (1 - eased));
    }
  }
};

export interface LoaderPose {
  /** Opacity of the dark backdrop that covers the screen (the crossfade into the first real frame). */
  readonly backdropAlpha: number;
  readonly iconAlpha: number;
  readonly iconScale: number;
  readonly ringAlpha: number;
  /** Ring scale relative to the icon edge (1 = on the edge). */
  readonly ringScale: number;
  readonly labelAlpha: number;
}

/**
 * The pose for one frame. `pulseTimeMs` is time since the loader first showed (so the first ring always starts at
 * the icon edge). Under reduced motion nothing moves: no icon pulse, a still halo ring.
 */
export const resolveLoaderPose = (alpha: number, pulseTimeMs: number, reducedMotion: boolean): LoaderPose => {
  const a = clamp01(alpha);
  if (reducedMotion || !Number.isFinite(pulseTimeMs)) {
    return {
      backdropAlpha: a,
      iconAlpha: a,
      iconScale: 1,
      ringAlpha: a * LOADER_RING_REDUCED_ALPHA,
      ringScale: LOADER_RING_REDUCED_SCALE,
      labelAlpha: a
    };
  }
  const phase = motionLoopPhase(pulseTimeMs, LOADER_PULSE_PERIOD_MS);
  const breath = MOTION_EASING.sineInOut(phase < 0.5 ? phase * 2 : (1 - phase) * 2);
  return {
    backdropAlpha: a,
    iconAlpha: a,
    iconScale: 1 + (LOADER_ICON_PULSE_SCALE * breath),
    ringAlpha: a * LOADER_RING_PEAK_ALPHA * (1 - MOTION_EASING.easeOutCubic(phase)),
    ringScale: 1 + (LOADER_RING_GROWTH * MOTION_EASING.easeOutCubic(phase)),
    labelAlpha: a
  };
};

/**
 * The HTML boot splash side. The splash's stage fades in by CSS (delay LOADER_SHOW_DELAY_MS, length LOADER_FADE_IN_MS),
 * so the only decision left to script is the exit: given how long that animation has run (`elapsedMs`, the CSS
 * animation's currentTime), how many ms to wait before the exit fade starts. Never shown yet (still inside the delay)
 * or unknown: 0, leave at once. Shown: wait out the rest of the minimum hold.
 *
 * `instant` (MAZER-ACCT-042, the hand-off from the account host's loader): the stage was visible from the first paint,
 * so there is no show delay to subtract: the loader has been up for `elapsedMs` and only the minimum hold remains.
 */
export const resolveBootSplashExitDelayMs = (elapsedMs: number | null, instant = false): number => {
  if (elapsedMs === null || !Number.isFinite(elapsedMs)) {
    return 0;
  }
  if (instant) {
    return Math.max(0, LOADER_MIN_HOLD_MS - elapsedMs);
  }
  if (elapsedMs < LOADER_SHOW_DELAY_MS) {
    return 0;
  }
  return Math.max(0, LOADER_SHOW_DELAY_MS + LOADER_MIN_HOLD_MS - elapsedMs);
};
