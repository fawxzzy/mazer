/**
 * MAZER-L9 floating-anchor touch controller (pure; no Phaser, no DOM).
 *
 * Today's floating stick plants its centre (the "anchor") where the thumb lands and never moves it, so a long drag
 * leaves the hand far from the anchor and a reversal needs the finger to travel all the way back. This controller
 * keeps the same anchor-at-touch-down, but once the finger is farther than the LEASH (56 CSS px on a phone)
 * the anchor is dragged along behind the finger:
 *
 *   excess = max(0, distance(anchor, finger) - leash)
 *   each step the anchor closes `1 - exp(-dt / easeMs)` of that excess along the line to the finger.
 *
 * So the anchor moves faster the farther the finger is past the leash (speed = excess / easeMs), eases out as it
 * catches up, never overshoots, and is frame-rate independent (closed form, not a per-frame lerp). The scene keeps
 * feeding `finger - anchor` to the existing stick pull maths, so direction picking, deadzone and the stick drawing
 * are unchanged. Lift-and-replace is `up()` then `down()`.
 *
 * MAZER-CTRL-003 option B (Zac picked it 2026-11-19, docs/ops/MAZER-CONTROLS-OPTIONS-2026-11-19.html): this is now the
 * default stick. The device-local Settings toggle stays (see legacyFloatingAnchorPreference.ts) so a player can switch
 * back to the fixed anchor; the leash is 56 px (MAZER-CTRL-005; was the options page's 90 px guess), still unfelt on a real phone. Tune with `npx vite-node scripts/legacy/floating-anchor-harness.ts` (prints trajectories for scripted paths).
 */

export interface FloatingAnchorPoint {
  x: number;
  y: number;
}

export interface FloatingAnchorConfig {
  /** Distance, in the same units as the points, the finger may be from the anchor before the anchor follows. */
  leashPx: number;
  /** Time constant of the catch-up: the anchor closes ~63% of the excess in this many ms. Smaller = snappier. */
  easeMs: number;
  /** A single step never advances time by more than this (a stalled tab must not teleport the anchor). */
  maxStepMs: number;
}

/**
 * The leash, as inches on a phone-class screen: 56 / 160 CSS px per inch = 0.35 in = 56 CSS px (MAZER-CTRL-005).
 * Option B's first guess was 90 px; the floating-anchor harness (quick-reversal, 160 px/in) put a reversal at 1.08 in with
 * 90 px and 0.92 in with 56 px, and a reversal costs roughly the leash plus the dead zone (12 px), so 90 px was 102 px
 * of thumb travel back. 56 px is the smallest leash that is still no smaller than the stick's max pull radius on every
 * screen (33 px on a 393 px phone, 56 px on an iPad: deadzone + 0.6 * (ring radius - deadzone)), so the thumb can still
 * pull the full distance before the anchor starts to follow, and a normal one-tile drag never moves the anchor.
 * Kept as a named constant so the harness and tests can vary it.
 */
export const FLOATING_ANCHOR_LEASH_INCHES = 56 / 160;
export const FLOATING_ANCHOR_EASE_MS = 140;
export const FLOATING_ANCHOR_MAX_STEP_MS = 100;

/** CSS px per physical inch assumed for a phone-class (coarse pointer) screen. See resolveCssPxPerInch. */
export const FLOATING_ANCHOR_PHONE_CSS_PX_PER_INCH = 160;
/** The CSS reference pixel: 96 px per inch. Used for mouse/desktop and as the floor. */
export const FLOATING_ANCHOR_REFERENCE_CSS_PX_PER_INCH = 96;

export interface FloatingAnchorDisplayInput {
  /** window.devicePixelRatio. */
  devicePixelRatio: number;
  /** matchMedia('(pointer: coarse)').matches, or true when touch points are present. */
  coarsePointer: boolean;
}

/**
 * Estimates how many CSS px make one physical inch. The browser cannot report physical size, so this is a
 * heuristic from what it can report:
 *  - fine pointer (mouse, desktop): the CSS reference pixel, 96 px per inch;
 *  - coarse pointer at DPR >= 1.5 (every current phone: iPhones are ~153-163 CSS px per inch at 2x-3x, Androids at
 *    2.6x-3.5x ~150-170): 160;
 *  - coarse pointer at DPR < 1.5 (old/low-density tablets): 130.
 * The estimate is within roughly +/-10% on phones; the harness and the Settings toggle exist so Zac can judge the
 * feel on his own phone, which a headless run cannot.
 */
export const resolveCssPxPerInch = (display: FloatingAnchorDisplayInput): number => {
  const dpr = Number.isFinite(display.devicePixelRatio) && display.devicePixelRatio > 0
    ? display.devicePixelRatio
    : 1;
  if (!display.coarsePointer) {
    return FLOATING_ANCHOR_REFERENCE_CSS_PX_PER_INCH;
  }
  return dpr >= 1.5 ? FLOATING_ANCHOR_PHONE_CSS_PX_PER_INCH : 130;
};

export interface FloatingAnchorConfigInput extends FloatingAnchorDisplayInput {
  /** Logical (game) units per CSS px: layout.width / canvas CSS width. 1 when the canvas is not scaled. */
  logicalPerCssPx?: number;
  leashInches?: number;
  easeMs?: number;
}

/** Builds the controller config from the display, converting the inch leash to the scene's logical px. */
export const resolveFloatingAnchorConfig = (input: FloatingAnchorConfigInput): FloatingAnchorConfig => {
  const logicalPerCssPx = Number.isFinite(input.logicalPerCssPx) && (input.logicalPerCssPx ?? 0) > 0
    ? input.logicalPerCssPx as number
    : 1;
  const inches = Number.isFinite(input.leashInches) && (input.leashInches ?? 0) > 0
    ? input.leashInches as number
    : FLOATING_ANCHOR_LEASH_INCHES;
  const easeMs = Number.isFinite(input.easeMs) && (input.easeMs ?? 0) > 0
    ? input.easeMs as number
    : FLOATING_ANCHOR_EASE_MS;
  return {
    easeMs,
    leashPx: inches * resolveCssPxPerInch(input) * logicalPerCssPx,
    maxStepMs: FLOATING_ANCHOR_MAX_STEP_MS
  };
};

/**
 * One anchor step. Pure. `dtMs <= 0` or a finger inside the leash returns the anchor unchanged.
 */
export const advanceFloatingAnchor = (
  anchor: FloatingAnchorPoint,
  finger: FloatingAnchorPoint,
  dtMs: number,
  config: FloatingAnchorConfig
): FloatingAnchorPoint => {
  const dx = finger.x - anchor.x;
  const dy = finger.y - anchor.y;
  const distance = Math.hypot(dx, dy);
  const excess = distance - config.leashPx;
  if (!(excess > 0) || !(dtMs > 0) || distance === 0) {
    return anchor;
  }
  const step = Math.min(dtMs, config.maxStepMs);
  const closed = excess * (1 - Math.exp(-step / config.easeMs));
  const scale = closed / distance;
  return { x: anchor.x + (dx * scale), y: anchor.y + (dy * scale) };
};

export interface FloatingAnchorController {
  /** True between down() and up(). */
  readonly active: boolean;
  /** The current anchor, or null while no finger is down. */
  readonly anchor: FloatingAnchorPoint | null;
  /** The last finger position, or null while no finger is down. */
  readonly finger: FloatingAnchorPoint | null;
  /** Touch-down: plants the anchor at the finger. */
  down(point: FloatingAnchorPoint, timeMs: number): FloatingAnchorPoint;
  /** Finger moved: advances the anchor to `timeMs`, then records the finger. Returns the anchor. */
  move(point: FloatingAnchorPoint, timeMs: number): FloatingAnchorPoint | null;
  /** Time passed with the finger still: advances the anchor. Returns it (null when no finger is down). */
  tick(timeMs: number): FloatingAnchorPoint | null;
  /** Lift: forgets the anchor. The next down() plants a fresh one. */
  up(): void;
  setConfig(config: FloatingAnchorConfig): void;
}

export const createFloatingAnchorController = (initialConfig: FloatingAnchorConfig): FloatingAnchorController => {
  let config = initialConfig;
  let anchor: FloatingAnchorPoint | null = null;
  let finger: FloatingAnchorPoint | null = null;
  let lastTimeMs = 0;

  const advanceTo = (timeMs: number): void => {
    if (anchor === null || finger === null) {
      return;
    }
    const dt = Number.isFinite(timeMs) ? timeMs - lastTimeMs : 0;
    if (dt > 0) {
      anchor = advanceFloatingAnchor(anchor, finger, dt, config);
      lastTimeMs = timeMs;
    }
  };

  return {
    get active() { return anchor !== null; },
    get anchor() { return anchor; },
    get finger() { return finger; },
    down(point, timeMs) {
      anchor = { x: point.x, y: point.y };
      finger = { x: point.x, y: point.y };
      lastTimeMs = Number.isFinite(timeMs) ? timeMs : 0;
      return anchor;
    },
    move(point, timeMs) {
      if (anchor === null) {
        return null;
      }
      // The anchor chases where the finger WAS for the elapsed interval, then the finger jumps to its new spot.
      advanceTo(timeMs);
      finger = { x: point.x, y: point.y };
      return anchor;
    },
    tick(timeMs) {
      advanceTo(timeMs);
      return anchor;
    },
    up() {
      anchor = null;
      finger = null;
    },
    setConfig(next) {
      config = next;
    }
  };
};
