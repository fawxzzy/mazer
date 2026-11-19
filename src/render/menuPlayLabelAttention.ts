/**
 * MAZER-UI-094: the front-door TAP TO PLAY label breathes and a band of white light sweeps across it.
 *
 * Owner pick (Zac, 2026-11-19, options page "A mixed with C", beat-aligned 1.2 s grid):
 *   - A, slow breathing: the label grows 1.00 -> 1.04 and back on a 2.4 s (blink) loop, with a soft cyan glow
 *     under it that swells at the peak. Never fully still.
 *   - C, light sweep: every 3.6 s (drift loop) a narrow band of white light runs left to right across the
 *     letters in 0.9 s, then the label rests until the next pass.
 * Both loops start at time 0 of the same clock (beat-aligned), so sweeps alternate between starting on a breath
 * trough and a breath peak (the pair repeats every 7.2 s).
 *
 * Reduced motion (the game's one rule, render/reducedMotion.ts): no scale, no glow, no sweep, so the label is
 * exactly what it was before this card. The rainbow colour drift is not touched here and keeps running.
 *
 * Draw cost: one setScale on the label's existing graphics object, one alpha on a glow image whose texture is
 * painted once, and a per-chip white mix inside the label redraw that already runs every frame. The tap area is
 * a separate rectangle and never scales.
 *
 * Pure: no Phaser, DOM, randomness or wall-clock dependency.
 */
import { MOTION_EASING, MOTION_LOOP_MS } from './motionScale';

/** Breathing loop (the 2.4 s blink loop of the motion scale). */
export const MENU_PLAY_LABEL_BREATH_PERIOD_MS = MOTION_LOOP_MS.blink;
/** Peak growth of the breath: 1.00 -> 1.04. */
export const MENU_PLAY_LABEL_BREATH_SCALE_AMPLITUDE = 0.04;
/** Glow image alpha at the breath trough; it swells by GLOW_SWELL at the peak (0.12 -> 0.62). */
export const MENU_PLAY_LABEL_GLOW_BASE_ALPHA = 0.12;
export const MENU_PLAY_LABEL_GLOW_SWELL_ALPHA = 0.5;

/** Light sweep: one pass every 3.6 s (the drift loop), 0.9 s long, then rest. */
export const MENU_PLAY_LABEL_SWEEP_PERIOD_MS = MOTION_LOOP_MS.drift;
export const MENU_PLAY_LABEL_SWEEP_DURATION_MS = 900;
/** The band centre travels from just off the left edge to just off the right edge (fractions of the word width). */
export const MENU_PLAY_LABEL_SWEEP_START = -0.2;
export const MENU_PLAY_LABEL_SWEEP_END = 1.2;
/** Band shape: a gaussian of this width (fraction of the word width) and this peak white mix. */
export const MENU_PLAY_LABEL_SWEEP_BAND_SIGMA = 0.06;
export const MENU_PLAY_LABEL_SWEEP_PEAK_MIX = 0.7;
/** Below this the white mix is not visible on an 8-bit channel; the chip keeps its plain colour. */
export const MENU_PLAY_LABEL_SWEEP_MIN_MIX = 0.004;

export interface MenuPlayLabelAttention {
  /** Uniform scale for the label graphics object (1 = today's size). */
  scale: number;
  /** Alpha for the glow image under the label (0 = hidden, not drawn). */
  glowAlpha: number;
  /** Band centre as a fraction of the word width, or null while the label rests between passes. */
  sweepCenter: number | null;
}

/** The static state: exactly the label as it was before MAZER-UI-094 (reduced motion uses it). */
export const MENU_PLAY_LABEL_STATIC_ATTENTION: Readonly<MenuPlayLabelAttention> = Object.freeze({
  scale: 1,
  glowAlpha: 0,
  sweepCenter: null
});

const positiveModulo = (value: number, period: number): number => ((value % period) + period) % period;

/** Breath envelope 0..1: 0 at the start of each loop, 1 at its middle, a raised cosine (no kick at either end). */
export const resolveMenuPlayLabelBreath = (timeMs: number): number => {
  if (!Number.isFinite(timeMs)) {
    return 0;
  }
  const phase = positiveModulo(timeMs, MENU_PLAY_LABEL_BREATH_PERIOD_MS) / MENU_PLAY_LABEL_BREATH_PERIOD_MS;
  return (1 - Math.cos(phase * Math.PI * 2)) / 2;
};

/** Band centre for this time, or null while the label rests after the pass. Eased in and out (smoothstep). */
export const resolveMenuPlayLabelSweepCenter = (timeMs: number): number | null => {
  if (!Number.isFinite(timeMs)) {
    return null;
  }
  const local = positiveModulo(timeMs, MENU_PLAY_LABEL_SWEEP_PERIOD_MS);
  if (local >= MENU_PLAY_LABEL_SWEEP_DURATION_MS) {
    return null;
  }
  const eased = MOTION_EASING.smoothstep(local / MENU_PLAY_LABEL_SWEEP_DURATION_MS);
  return MENU_PLAY_LABEL_SWEEP_START + ((MENU_PLAY_LABEL_SWEEP_END - MENU_PLAY_LABEL_SWEEP_START) * eased);
};

export const resolveMenuPlayLabelAttention = (timeMs: number, reducedMotion: boolean): MenuPlayLabelAttention => {
  if (reducedMotion) {
    return { ...MENU_PLAY_LABEL_STATIC_ATTENTION };
  }
  const breath = resolveMenuPlayLabelBreath(timeMs);
  return {
    scale: 1 + (MENU_PLAY_LABEL_BREATH_SCALE_AMPLITUDE * breath),
    glowAlpha: MENU_PLAY_LABEL_GLOW_BASE_ALPHA + (MENU_PLAY_LABEL_GLOW_SWELL_ALPHA * breath),
    sweepCenter: resolveMenuPlayLabelSweepCenter(timeMs)
  };
};

/**
 * White mix 0..PEAK for one chip column. `column / columns` is the same column fraction the rainbow uses, so the
 * band and the rainbow share one axis. Returns 0 when there is no pass or the chip is outside the band.
 */
export const resolveMenuPlayLabelSweepMix = (column: number, columns: number, sweepCenter: number | null): number => {
  if (sweepCenter === null || !Number.isFinite(sweepCenter) || !Number.isFinite(column)) {
    return 0;
  }
  const distance = (column / Math.max(1, columns)) - sweepCenter;
  const mix = MENU_PLAY_LABEL_SWEEP_PEAK_MIX
    * Math.exp(-(distance * distance) / (2 * MENU_PLAY_LABEL_SWEEP_BAND_SIGMA * MENU_PLAY_LABEL_SWEEP_BAND_SIGMA));
  return mix < MENU_PLAY_LABEL_SWEEP_MIN_MIX ? 0 : mix;
};

/** Glow texture: painted once, then only the image alpha changes. Stretched to the glow rect (soft, so no detail is lost). */
export const MENU_PLAY_LABEL_GLOW_TEXTURE_KEY = 'mazer-menu-play-label-glow';
export const MENU_PLAY_LABEL_GLOW_TEXTURE_WIDTH = 256;
export const MENU_PLAY_LABEL_GLOW_TEXTURE_HEIGHT = 64;
/** Cyan of the lit gate ring (token semantic.info #6be8e1), as r,g,b for the canvas gradient. */
export const MENU_PLAY_LABEL_GLOW_RGB = '107, 232, 225';
/** Radial stops (offset, alpha) of the glow, centre to edge. The image alpha multiplies them. */
export const MENU_PLAY_LABEL_GLOW_STOPS: readonly (readonly [number, number])[] = Object.freeze([
  Object.freeze([0, 0.3] as const),
  Object.freeze([0.6, 0.1] as const),
  Object.freeze([1, 0] as const)
]);
/** Glow size relative to the word width: 1.24 wide (radius 0.62), 0.22 of that tall (a flat ellipse under the word). */
export const MENU_PLAY_LABEL_GLOW_WIDTH_RATIO = 1.24;
export const MENU_PLAY_LABEL_GLOW_ASPECT = 0.22;

export interface MenuPlayLabelGlowRect {
  centerX: number;
  centerY: number;
  width: number;
  height: number;
}

const toEvenWholePx = (value: number): number => Math.max(2, 2 * Math.round(Math.max(0, value) / 2));

/**
 * Where the glow image goes. Centre and size are whole css px and the size is even, so with origin 0.5 the image's
 * top-left corner is a whole css px too (the canvas renderer floors Image positions under roundPixels).
 */
export const resolveMenuPlayLabelGlowRect = (centerX: number, centerY: number, wordWidth: number): MenuPlayLabelGlowRect => {
  const width = toEvenWholePx(wordWidth * MENU_PLAY_LABEL_GLOW_WIDTH_RATIO);
  return {
    centerX: Math.round(centerX),
    centerY: Math.round(centerY),
    width,
    height: toEvenWholePx(width * MENU_PLAY_LABEL_GLOW_ASPECT)
  };
};

/** The bits of a 2D context the glow painter uses (a real CanvasRenderingContext2D satisfies it). */
export interface MenuPlayLabelGlowContext {
  clearRect(x: number, y: number, width: number, height: number): void;
  createRadialGradient(x0: number, y0: number, r0: number, x1: number, y1: number, r1: number): {
    addColorStop(offset: number, color: string): void;
  };
  fillStyle: unknown;
  fillRect(x: number, y: number, width: number, height: number): void;
  save(): void;
  restore(): void;
  scale(x: number, y: number): void;
}

/** Paints the glow into a WIDTH x HEIGHT canvas: a radial cyan gradient squashed into an ellipse that fills it. */
export const paintMenuPlayLabelGlow = (context: MenuPlayLabelGlowContext): void => {
  const width = MENU_PLAY_LABEL_GLOW_TEXTURE_WIDTH;
  const height = MENU_PLAY_LABEL_GLOW_TEXTURE_HEIGHT;
  const radius = width / 2;
  context.clearRect(0, 0, width, height);
  context.save();
  context.scale(1, height / width);
  const gradient = context.createRadialGradient(radius, radius, 0, radius, radius, radius);
  for (const [offset, alpha] of MENU_PLAY_LABEL_GLOW_STOPS) {
    gradient.addColorStop(offset, `rgba(${MENU_PLAY_LABEL_GLOW_RGB}, ${alpha})`);
  }
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, width);
  context.restore();
};

/** The bits of Phaser's texture manager the glow needs (kept structural so this module stays Phaser-free). */
export interface MenuPlayLabelGlowTextures {
  exists(key: string): boolean;
  createCanvas(key: string, width: number, height: number): {
    getContext(): MenuPlayLabelGlowContext | null;
    refresh(): unknown;
  } | null;
}

/** Creates the glow texture once per game and returns its key (null if the canvas could not be made). */
export const ensureMenuPlayLabelGlowTexture = (textures: MenuPlayLabelGlowTextures): string | null => {
  if (textures.exists(MENU_PLAY_LABEL_GLOW_TEXTURE_KEY)) {
    return MENU_PLAY_LABEL_GLOW_TEXTURE_KEY;
  }
  const texture = textures.createCanvas(
    MENU_PLAY_LABEL_GLOW_TEXTURE_KEY,
    MENU_PLAY_LABEL_GLOW_TEXTURE_WIDTH,
    MENU_PLAY_LABEL_GLOW_TEXTURE_HEIGHT
  );
  const context = texture?.getContext() ?? null;
  if (!texture || !context) {
    return null;
  }
  paintMenuPlayLabelGlow(context);
  texture.refresh();
  return MENU_PLAY_LABEL_GLOW_TEXTURE_KEY;
};
