/**
 * START TILE = PINWHEEL (MAZER-VIS-065, owner pick F on 2026-11-19). Pure geometry, clock and draw code of the start-tile
 * mark. No Phaser, no DOM, no wall clock, no randomness: every function is a function of (tile geometry, device pixel
 * ratio, scene time, reduced motion).
 *
 * THE LOOK (the options page's design F, reproduced): four curved blades that taper from a wide root at the hub to a fine
 * tip at the rim, each sweeping 0.36 of a turn clockwise as it runs outward, around a small pale diamond hub. No circles.
 * Colour: the start green (`SEED_SPIRAL_GREEN`), solid at the hub and fading to 0.75 alpha at the rim; the hub is the green
 * lifted 35 % toward white. A two-device-pixel dark keyline (the board void) rings every blade and the hub so it stays
 * crisp on the mid-tone chip.
 *
 * CONTRAST (measured in the real app, Reduce Motion, seed 7, levels 1/22/120 at 390x844@3, 412x915@2.625, 1280x720):
 * the options page's values (1 dp keyline, fade to 0.55) gave a median contrast against the floor under the mark 0.1 to
 * 0.3 below the Seed spiral's on today's Chip floor. A 2 dp keyline (the options page's own ink width) and a fade to 0.75
 * put every case at or above the Seed spiral's median. Same blades, colour, hub and motion.
 *
 * MOTION. One clockwise turn per 2.17 s (the seed spiral's speed); the blades have 4-fold symmetry, so the motion repeats
 * every quarter turn (542.5 ms) and is quantised into 72 frames of that quarter turn (1.25 degrees each). The whole mark
 * breathes in alpha between 0.86 and 1 once per 2.1 s. Reduce Motion: frame 0 (no turn) and alpha 1 (no breathing); the
 * colour never changes.
 *
 * PAINTING THROUGH FILLS ONLY. The options page stroked a 2-device-px ink line (round joins) and filled with a radial
 * gradient. The Phaser Graphics adapter (the Guide icon) has neither gradients nor join control, so the same picture is
 * built from fills: the keyline is the blade dilated by two device px with the blade itself cut out (non-zero winding),
 * and the radial fade is six nested fills along each blade whose stacked alphas equal the gradient at each band's middle.
 * One function draws the scene's baked strip (startPinwheelLayer.ts), the Guide icon and the unit tests' rasteriser.
 *
 * FIT. Like the seed spiral, the mark is fitted to the CELL, not the fill: its farthest painted point (blade tip plus
 * keyline) stays at least max(0.07 of the half-tile, 0.5 device px) inside the cell edge nearest the optical centre.
 */
import { resolveEndpointCentre } from './endpointOpticalCentre';
import type { EndpointTileRect } from './endpointTiles';
import { cssRgb, cssRgba } from './boardTileStyle';
import { SEED_SPIRAL_GREEN, START_PINWHEEL_CORE } from './palette';
import type { EndpointSkinPainter } from './endpointTileSkins';

const TAU = Math.PI * 2;

export const START_PINWHEEL = Object.freeze({
  color: SEED_SPIRAL_GREEN,
  coreColor: START_PINWHEEL_CORE,
  blades: 4,
  /** One clockwise turn (the options page: 2170 ms). */
  spinPeriodMs: 2170,
  /** Frames baked per symmetric cycle (a quarter turn). */
  frames: 72,
  /** Columns of the baked strip (72 frames = 12 x 6). */
  stripColumns: 12,
  breathPeriodMs: 2100,
  breathAlphaMin: 0.86,
  /** Shares of the reach R: blade root radius, root width, tip width (half), hub diamond half-diagonal. */
  rootOfReach: 0.12,
  widthOfReach: 0.38,
  tipHalfOfReach: 0.015,
  coreOfReach: 0.2,
  /** Each blade sweeps this share of a turn from root to tip. */
  sweepTurns: 0.36,
  /** Dark keyline width around every blade and the hub, device px (see CONTRAST); never over `keylineOfReach` R, never under 1 dp. */
  keylineDevicePx: 2,
  keylineOfReach: 0.15,
  /** The tip sits this many device px inside R (the options page: 1.5 dp). */
  tipInsetDevicePx: 1.5,
  /** Samples along each blade (a multiple of `fadeBands`). */
  steps: 48,
  /** The radial fade: alpha 1 at the axis down to `fadeRimAlpha` at R, in `fadeBands` nested fills (options page 0.55; see CONTRAST). */
  fadeRimAlpha: 0.75,
  fadeBands: 6,
  /** The reach is at most this share of the half-tile (the options page). */
  maxReachOfRadius: 0.92
});

/** The symmetric cycle the frames cover: a quarter turn. */
export const START_PINWHEEL_CYCLE_MS = START_PINWHEEL.spinPeriodMs / START_PINWHEEL.blades;

const mod = (value: number, period: number): number => ((value % period) + period) % period;

export interface StartPinwheelClock {
  /** Baked frame index in [0, frames). */
  readonly frame: number;
  /** Clockwise angle of that frame (radians): frame / frames of a quarter turn. */
  readonly rotation: number;
  /** Breathing alpha in [breathAlphaMin, 1]. */
  readonly alpha: number;
}

/** Rotation of baked frame `frame`. */
export const resolveStartPinwheelFrameRotation = (frame: number): number => (
  (frame / START_PINWHEEL.frames) * (TAU / START_PINWHEEL.blades)
);

/** The frame and breath for scene time `timeMs`. Reduce Motion (or a non-finite clock): frame 0, alpha 1. */
export const resolveStartPinwheelClock = (timeMs: number, reducedMotion: boolean): StartPinwheelClock => {
  if (reducedMotion || !Number.isFinite(timeMs)) {
    return { frame: 0, rotation: 0, alpha: 1 };
  }
  const k = START_PINWHEEL;
  const phase = mod(timeMs, START_PINWHEEL_CYCLE_MS) / START_PINWHEEL_CYCLE_MS;
  const frame = Math.min(k.frames - 1, Math.floor(phase * k.frames));
  // Cosine, so scene time 0 is the Reduce Motion frame (alpha 1) and the Guide icon equals the first live frame.
  const wave = 0.5 + (0.5 * Math.cos((mod(timeMs, k.breathPeriodMs) / k.breathPeriodMs) * TAU));
  return {
    frame,
    rotation: resolveStartPinwheelFrameRotation(frame),
    alpha: k.breathAlphaMin + ((1 - k.breathAlphaMin) * wave)
  };
};

export interface StartPinwheelSpec {
  /** Spin axis (the tile's optical centre), in the caller's units (board-local css px, or device px for the bake). */
  readonly cx: number;
  readonly cy: number;
  /** Reach R: the radius the shares above are taken of. */
  readonly reach: number;
  /** One device pixel in the same units. */
  readonly dp: number;
  /** Farthest painted point from the axis (blade tip plus keyline), any rotation. */
  readonly extent: number;
}

interface BladeSample { x: number; y: number; ux: number; uy: number; nx: number; ny: number; half: number }

interface Blade {
  readonly left: number[];
  readonly right: number[];
  /** Keyline outline: the blade dilated by `keylineDevicePx` (flat [x0, y0, ...], closed). */
  readonly ink: number[];
}

/** Keyline width: `keylineDevicePx`, thinned on tiny marks (to no less than one device px) so they still fit their cell. */
export const resolveStartPinwheelKeyline = (reach: number, dp: number): number => (
  Math.min(START_PINWHEEL.keylineDevicePx * dp, Math.max(dp, reach * START_PINWHEEL.keylineOfReach))
);

const resolveBlade = (cx: number, cy: number, reach: number, dp: number, base: number): Blade => {
  const k = START_PINWHEEL;
  const r0 = reach * k.rootOfReach;
  const r1 = reach - (k.tipInsetDevicePx * dp);
  const kw = resolveStartPinwheelKeyline(reach, dp);
  const sweep = k.sweepTurns * TAU;
  const left: number[] = [];
  const right: number[] = [];
  const inkLeft: number[] = [];
  const inkRight: number[] = [];
  let first: BladeSample | null = null;
  let last: BladeSample | null = null;
  for (let i = 0; i <= k.steps; i += 1) {
    const t = i / k.steps;
    const r = r0 + ((r1 - r0) * t);
    const a = base + (sweep * t);
    const half = ((reach * k.widthOfReach * (1 - t) * (1 - (t * 0.2))) / 2) + (reach * k.tipHalfOfReach);
    const dx = ((r1 - r0) * Math.cos(a)) - (r * sweep * Math.sin(a));
    const dy = ((r1 - r0) * Math.sin(a)) + (r * sweep * Math.cos(a));
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const nx = -uy;
    const ny = ux;
    const x = cx + (Math.cos(a) * r);
    const y = cy + (Math.sin(a) * r);
    left.push(x + (nx * half), y + (ny * half));
    right.push(x - (nx * half), y - (ny * half));
    inkLeft.push(x + (nx * (half + kw)), y + (ny * (half + kw)));
    inkRight.push(x - (nx * (half + kw)), y - (ny * (half + kw)));
    const sample: BladeSample = { x, y, ux, uy, nx, ny, half: half + kw };
    if (i === 0) first = sample;
    last = sample;
  }
  const ink: number[] = [];
  const cap = (s: BladeSample, sign: number, side: number): void => {
    ink.push(s.x + (s.ux * kw * sign) + (s.nx * s.half * side), s.y + (s.uy * kw * sign) + (s.ny * s.half * side));
  };
  // Root cap (one keyline behind the root), the left side out, the tip cap (one keyline past the tip), the right side back.
  cap(first!, -1, 1);
  ink.push(...inkLeft);
  cap(last!, 1, 1);
  cap(last!, 1, -1);
  for (let i = inkRight.length - 2; i >= 0; i -= 2) {
    ink.push(inkRight[i]!, inkRight[i + 1]!);
  }
  cap(first!, -1, -1);
  return { left, right, ink };
};

/** The hub diamond's four vertices at half-diagonal `q`, turned by `rotation`. */
const diamond = (cx: number, cy: number, q: number, rotation: number): number[] => {
  const out: number[] = [];
  for (let i = 0; i < 4; i += 1) {
    const a = rotation + ((i * TAU) / 4);
    out.push(cx + (Math.cos(a) * q), cy + (Math.sin(a) * q));
  }
  return out;
};

export interface StartPinwheelShape {
  /** Per blade: the fill outline (left side out, right side back). */
  readonly blades: readonly number[][];
  /** Per blade: the keyline outline (blade dilated by `keylineDevicePx`). */
  readonly bladeInk: readonly number[][];
  /** Per blade: left/right side samples, root first (for the nested fade fills). */
  readonly sides: readonly { left: readonly number[]; right: readonly number[] }[];
  readonly core: readonly number[];
  readonly coreInk: readonly number[];
}

/** The mark's outlines about (cx, cy) at `rotation` (clockwise radians). */
export const resolveStartPinwheelShape = (
  cx: number,
  cy: number,
  reach: number,
  dp: number,
  rotation: number
): StartPinwheelShape => {
  const k = START_PINWHEEL;
  const blades: number[][] = [];
  const bladeInk: number[][] = [];
  const sides: { left: number[]; right: number[] }[] = [];
  for (let b = 0; b < k.blades; b += 1) {
    const blade = resolveBlade(cx, cy, reach, dp, rotation + ((b * TAU) / k.blades));
    const outline = [...blade.left];
    for (let i = blade.right.length - 2; i >= 0; i -= 2) {
      outline.push(blade.right[i]!, blade.right[i + 1]!);
    }
    blades.push(outline);
    bladeInk.push(blade.ink);
    sides.push({ left: blade.left, right: blade.right });
  }
  const q = reach * k.coreOfReach;
  return {
    blades,
    bladeInk,
    sides,
    core: diamond(cx, cy, q, rotation),
    // A miter offset of w along each edge of a right-angled diamond moves each vertex out by w * sqrt(2).
    coreInk: diamond(cx, cy, q + (resolveStartPinwheelKeyline(reach, dp) * Math.SQRT2), rotation)
  };
};

const farthest = (cx: number, cy: number, pts: readonly number[], seed: number): number => {
  let out = seed;
  for (let i = 0; i < pts.length; i += 2) {
    out = Math.max(out, Math.hypot(pts[i]! - cx, pts[i + 1]! - cy));
  }
  return out;
};

/** Farthest painted point from the axis for reach `reach` (distance to the axis does not depend on the rotation). */
export const resolveStartPinwheelExtent = (reach: number, dp: number): number => {
  const shape = resolveStartPinwheelShape(0, 0, reach, dp, 0);
  let out = farthest(0, 0, shape.coreInk, 0);
  for (const ink of shape.bladeInk) {
    out = farthest(0, 0, ink, out);
  }
  return out;
};

/**
 * The pinwheel for one start tile, in the tile's units (board-local css px). Reach as on the options page
 * (min(room, 0.92 of the half-tile)), then pulled in until the farthest painted point fits the room.
 */
export const resolveStartPinwheelTile = (tile: EndpointTileRect, devicePixelRatio: number): StartPinwheelSpec => {
  const dpr = devicePixelRatio > 0 ? devicePixelRatio : 1;
  const dp = 1 / dpr;
  const at = resolveEndpointCentre(tile);
  const radius = Math.min(tile.width, tile.height) / 2;
  const cellRoom = Math.min(
    at.x - tile.left,
    (tile.left + tile.width) - at.x,
    at.y - tile.top,
    (tile.top + tile.height) - at.y
  );
  const room = Math.max(0, cellRoom - Math.max(radius * 0.07, 0.5 * dp));
  let reach = Math.max(dp, Math.min(room, radius * START_PINWHEEL.maxReachOfRadius));
  let extent = resolveStartPinwheelExtent(reach, dp);
  for (let i = 0; i < 6 && extent > room && reach > dp; i += 1) {
    reach = Math.max(dp, reach - (extent - room) - (dp * 0.01));
    extent = resolveStartPinwheelExtent(reach, dp);
  }
  return { cx: at.x, cy: at.y, reach, dp, extent };
};

/** The same mark in another unit system (e.g. device px for the bake): centre moved, lengths scaled. */
export const scaleStartPinwheelSpec = (spec: StartPinwheelSpec, cx: number, cy: number, scale: number): StartPinwheelSpec => ({
  cx,
  cy,
  reach: spec.reach * scale,
  dp: spec.dp * scale,
  extent: spec.extent * scale
});

/**
 * Alphas of the nested fade fills, outermost (whole blade) first: stacked over each other, band i (root = 0) shows
 * 1 - (1 - fade) * r / R at the band's middle radius.
 */
export const resolveStartPinwheelFadeAlphas = (): number[] => {
  const k = START_PINWHEEL;
  const n = k.fadeBands;
  const r0 = k.rootOfReach;
  const target = (band: number): number => {
    // Shares of R; the tip inset (device px) is ignored here: it moves the bands by under a device px.
    const r = r0 + ((1 - r0) * ((band + 0.5) / n));
    return 1 - ((1 - k.fadeRimAlpha) * Math.min(1, r));
  };
  // Layer j covers bands 0..j. Solve from the outermost layer (all bands) inward.
  const layer: number[] = new Array<number>(n).fill(0);
  layer[n - 1] = target(n - 1);
  for (let j = n - 2; j >= 0; j -= 1) {
    layer[j] = 1 - ((1 - target(j)) / (1 - target(j + 1)));
  }
  return layer.reverse();
};

const tracePolygon = (p: EndpointSkinPainter, pts: readonly number[], reverse = false): void => {
  const n = pts.length / 2;
  const at = (i: number): number => (reverse ? n - 1 - i : i) * 2;
  p.move(pts[at(0)]!, pts[at(0) + 1]!);
  for (let i = 1; i < n; i += 1) {
    p.line(pts[at(i)]!, pts[at(i) + 1]!);
  }
  p.close();
};

/** Blade prefix from the root to sample `upTo` (inclusive): left side out, right side back. */
const tracePrefix = (p: EndpointSkinPainter, side: { left: readonly number[]; right: readonly number[] }, upTo: number): void => {
  p.move(side.left[0]!, side.left[1]!);
  for (let i = 1; i <= upTo; i += 1) {
    p.line(side.left[i * 2]!, side.left[(i * 2) + 1]!);
  }
  for (let i = upTo; i >= 0; i -= 1) {
    p.line(side.right[i * 2]!, side.right[(i * 2) + 1]!);
  }
  p.close();
};

/** Paint ops `drawStartPinwheel` issues: blade keyline, hub keyline, the fade fills, the hub. */
export const START_PINWHEEL_PAINT_OPS = 3 + START_PINWHEEL.fadeBands;

/**
 * Paints the pinwheel at `rotation` (use a clock's quantised rotation): blade keyline ring, hub keyline, the nested fade
 * fills, then the opaque hub. `alpha` multiplies every fill (the baked strip paints at 1 and breathes through its Image).
 */
export const drawStartPinwheel = (
  p: EndpointSkinPainter,
  ink: number,
  spec: StartPinwheelSpec,
  rotation: number,
  alpha = 1,
  ox = 0,
  oy = 0
): void => {
  const k = START_PINWHEEL;
  const a = Math.max(0, Math.min(1, alpha));
  const shape = resolveStartPinwheelShape(spec.cx + ox, spec.cy + oy, spec.reach, spec.dp, rotation);
  const inkStyle = a >= 1 ? cssRgb(ink) : cssRgba(ink, a);
  // Keyline ring: each dilated blade with the blade itself cut out (traced backwards, so non-zero winding leaves a hole).
  p.fillStyle(inkStyle);
  p.begin();
  for (let b = 0; b < shape.blades.length; b += 1) {
    tracePolygon(p, shape.bladeInk[b]!);
    tracePolygon(p, shape.blades[b]!, true);
  }
  p.fill();
  // Hub keyline: a solid diamond one keyline width larger (the opaque hub covers its middle).
  p.fillStyle(inkStyle);
  p.begin();
  tracePolygon(p, shape.coreInk);
  p.fill();
  // Radial fade: nested fills, the whole blade first, each next one a shorter prefix from the root.
  const per = k.steps / k.fadeBands;
  const layers = resolveStartPinwheelFadeAlphas();
  for (let j = 0; j < layers.length; j += 1) {
    const upTo = k.steps - (j * per);
    p.fillStyle(cssRgba(k.color, layers[j]! * a));
    p.begin();
    for (const side of shape.sides) {
      tracePrefix(p, side, upTo);
    }
    p.fill();
  }
  p.fillStyle(a >= 1 ? cssRgb(k.coreColor) : cssRgba(k.coreColor, a));
  p.begin();
  tracePolygon(p, shape.core);
  p.fill();
};
