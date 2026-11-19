/**
 * MAZER-CTRL-006: the "Halo ring" controller look (Zac picked look A on the 2026-11-19 controller options page) with
 * an 8-direction highlight. Pure: no Phaser, no DOM. src/render/controllerHaloView.ts bakes the shapes once and moves
 * them; this module owns the numbers, the sector maths, the fade, the leash cue and the near-player dimming.
 *
 * VISUAL ONLY. Nothing here feeds movement. The game still resolves every pull to an axis exactly as before
 * (src/input-human/touch.ts resolveStickMovementIntent: the larger of |dx| and |dy| wins, the other axis is the
 * fallback candidate), with the same floating anchor (90 px leash, 140 ms ease), the same constant speed and the
 * same Arrows setting. The lit sector is a read of the TRUE drag angle in 8 sectors of 45 degrees:
 *  - a cardinal sector (right, down, left, up) is lit while the pull is within 22.5 degrees of that axis; there the
 *    game's primary axis is always that same axis;
 *  - a diagonal sector (down-right, ...) is lit while the pull is 22.5..67.5 degrees off the axes; there the game
 *    moves on whichever of the two axes the pull leans to more (the boundary is the exact 45 degree diagonal, the
 *    middle of the lit diagonal sector) and keeps the other axis as its fallback. So near a diagonal the lit sector
 *    shows where the thumb really points while the player moves on its resolved axis.
 * resolveControllerHaloSectorAxisRelation names that relation for diagnostics and tests.
 */

import { phaserMaterialAliases } from '../theme/tokens';

export interface ControllerHaloPoint {
  readonly x: number;
  readonly y: number;
}

/** Look A's geometry and colours, from the options page script (mazer-controller-ui-options-2026-11-19-v1). */
export const CONTROLLER_HALO = Object.freeze({
  /** Ring radius, css px, centred on the anchor. */
  ringRadiusPx: 36,
  ringLineWidthPx: 1.5,
  ringAlpha: 0.32,
  /** The lit sector arc on the ring. */
  litLineWidthPx: 3,
  litAlpha: 0.95,
  /**
   * Half the lit arc's span. Look A lit a quarter (4 directions) with +/-0.55 rad; with 8 sectors of 45 degrees
   * (0.785 rad) a +/-0.30 rad arc leaves a visible gap to its neighbours so two lit arcs can never read as one.
   */
  litHalfSpanRad: 0.3,
  /** The nub: a bright dot that slides toward the pull, at most this far from the anchor. */
  nubRadiusPx: 8,
  nubCoreRadiusPx: 3,
  nubThrowPx: 18,
  nubGlowBlurPx: 10,
  /** Leash cue: past this share of the leash a dashed arc appears at the leash distance and brightens. */
  leashShowRatio: 0.7,
  leashMaxAlpha: 0.6,
  leashHalfSpanRad: 0.4,
  leashLineWidthPx: 1.5,
  leashDashPx: Object.freeze([2, 4]) as readonly number[],
  /** Appear and vanish (reduced motion: both instant). */
  fadeInMs: 90,
  fadeOutMs: 180,
  /** A single fade step never advances more than this (a stalled tab must not pop the ring). */
  maxStepMs: 100,
  /** 8 sectors of 45 degrees; a sector is kept until the pull is this far past its edge. */
  sectorCount: 8,
  sectorHysteresisRad: Math.PI / 30,
  /** Near the player the whole controller drops toward minAlpha so it never covers the Spark or the tiles ahead. */
  nearPlayer: Object.freeze({ minAlpha: 0.3, ringClearancePx: 20, startPx: 14, rangePx: 36 }),
  // Theme tokens semantic.info (the lit cyan) and text.primary (the nub core); no new colour literals.
  colors: Object.freeze({ cyan: phaserMaterialAliases['semantic.info'], white: phaserMaterialAliases['text.primary'] })
});

export const CONTROLLER_HALO_SECTOR_NAMES = Object.freeze([
  'right',
  'down-right',
  'down',
  'down-left',
  'left',
  'up-left',
  'up',
  'up-right'
] as const);

export type ControllerHaloSectorName = typeof CONTROLLER_HALO_SECTOR_NAMES[number];

const TAU = Math.PI * 2;
const SECTOR_RAD = TAU / CONTROLLER_HALO.sectorCount;

const normalizeAngle = (angle: number): number => {
  const wrapped = angle % TAU;
  return wrapped < 0 ? wrapped + TAU : wrapped;
};

/** Smallest absolute angle between two angles, 0..PI. */
const angularDistance = (a: number, b: number): number => {
  const d = Math.abs(normalizeAngle(a) - normalizeAngle(b));
  return d > Math.PI ? TAU - d : d;
};

/** Centre angle (screen space: y down, 0 = right, PI/2 = down) of a sector index 0..7. */
export const resolveControllerHaloSectorAngle = (sector: number): number => sector * SECTOR_RAD;

/**
 * The lit sector (0 = right, 1 = down-right, 2 = down ... 7 = up-right) for a drag angle in screen space, with
 * hysteresis: once a sector is lit it stays lit until the angle is more than `hysteresisRad` past its edge, so a
 * thumb resting on a boundary does not flicker between two sectors. A non-finite angle returns null.
 */
export const resolveControllerHaloSector = (
  angleRad: number,
  previous: number | null,
  hysteresisRad: number = CONTROLLER_HALO.sectorHysteresisRad
): number | null => {
  if (!Number.isFinite(angleRad)) {
    return null;
  }
  const angle = normalizeAngle(angleRad);
  const raw = Math.round(angle / SECTOR_RAD) % CONTROLLER_HALO.sectorCount;
  if (previous === null || raw === previous || !Number.isInteger(previous) || previous < 0 || previous >= CONTROLLER_HALO.sectorCount) {
    return raw;
  }
  const margin = Math.max(0, hysteresisRad);
  return angularDistance(angle, resolveControllerHaloSectorAngle(previous)) <= (SECTOR_RAD / 2) + margin
    ? previous
    : raw;
};

export type ControllerHaloMovementKind = 'move_right' | 'move_down' | 'move_left' | 'move_up' | string;

const SECTOR_AXES: Readonly<Record<number, readonly string[]>> = Object.freeze({
  0: ['move_right'],
  1: ['move_right', 'move_down'],
  2: ['move_down'],
  3: ['move_down', 'move_left'],
  4: ['move_left'],
  5: ['move_left', 'move_up'],
  6: ['move_up'],
  7: ['move_up', 'move_right']
});

/**
 * How the lit sector relates to the axis the game resolved for the same pull:
 *  - 'same': a cardinal sector lit and the game moves along it;
 *  - 'diagonal-component': a diagonal sector lit and the game moves along one of its two axes (the normal case near
 *    a diagonal: the light shows the true angle, the player moves on its axis);
 *  - 'differs': only possible inside the hysteresis band right at a sector edge, for at most sectorHysteresisRad.
 */
export const resolveControllerHaloSectorAxisRelation = (
  sector: number | null,
  movement: ControllerHaloMovementKind | null
): 'same' | 'diagonal-component' | 'differs' | 'none' => {
  if (sector === null || movement === null) {
    return 'none';
  }
  const axes = SECTOR_AXES[sector] ?? [];
  if (!axes.includes(movement)) {
    return 'differs';
  }
  return axes.length === 1 ? 'same' : 'diagonal-component';
};

/** One fade step toward visible (1) or hidden (0). Reduced motion: no animated fade, the target at once. */
export const stepControllerHaloFade = (
  alpha: number,
  visible: boolean,
  dtMs: number,
  reducedMotion: boolean
): number => {
  const target = visible ? 1 : 0;
  if (reducedMotion) {
    return target;
  }
  const current = Number.isFinite(alpha) ? Math.max(0, Math.min(1, alpha)) : target;
  const step = Math.max(0, Math.min(CONTROLLER_HALO.maxStepMs, Number.isFinite(dtMs) ? dtMs : 0));
  const rate = visible ? CONTROLLER_HALO.fadeInMs : CONTROLLER_HALO.fadeOutMs;
  const delta = target - current;
  return current + (Math.sign(delta) * Math.min(Math.abs(delta), step / rate));
};

/**
 * Leash cue opacity: 0 until the pull passes leashShowRatio of the leash, then rising to leashMaxAlpha at the leash
 * (where the floating anchor starts to follow). Null leash (fixed anchor setting) = no cue: the anchor never follows.
 * A direct function of the pull, not an animation, so reduced motion keeps it.
 */
export const resolveControllerHaloLeashAlpha = (distancePx: number, leashPx: number | null): number => {
  if (leashPx === null || !(leashPx > 0) || !Number.isFinite(distancePx)) {
    return 0;
  }
  const ratio = distancePx / leashPx;
  const show = CONTROLLER_HALO.leashShowRatio;
  if (ratio <= show) {
    return 0;
  }
  return Math.min(1, (ratio - show) / (1 - show)) * CONTROLLER_HALO.leashMaxAlpha;
};

/**
 * 1 when the player is clear of the controller, down to nearPlayer.minAlpha as the Spark comes within ~50 px of the
 * ring or the thumb, so the controller never covers the player or the tiles right in front of it.
 */
export const resolveControllerHaloNearPlayerScale = (
  anchor: ControllerHaloPoint,
  finger: ControllerHaloPoint,
  player: ControllerHaloPoint | null
): number => {
  if (player === null || !Number.isFinite(player.x) || !Number.isFinite(player.y)) {
    return 1;
  }
  const near = CONTROLLER_HALO.nearPlayer;
  const toRing = Math.hypot(player.x - anchor.x, player.y - anchor.y) - near.ringClearancePx;
  const toFinger = Math.hypot(player.x - finger.x, player.y - finger.y);
  const clearance = Math.min(toRing, toFinger);
  return Math.max(near.minAlpha, Math.min(1, (clearance - near.startPx) / near.rangePx));
};

export interface ControllerHaloFrameInput {
  /** A finger is down on the play board (the floating stick exists). */
  down: boolean;
  /** Stick centre and finger, in scene css px. Null while no finger is down. */
  anchor: ControllerHaloPoint | null;
  finger: ControllerHaloPoint | null;
  /** The game's pull is outside the dead zone (the scene's own pull vector is non-null). */
  engaged: boolean;
  /** Floating-anchor leash in css px, or null when the anchor is fixed (Settings) and never follows. */
  leashPx: number | null;
  /** Player centre in scene css px, or null when unknown. */
  player: ControllerHaloPoint | null;
  nowMs: number;
  reducedMotion: boolean;
}

export interface ControllerHaloState {
  alpha: number;
  sector: number | null;
  anchor: ControllerHaloPoint | null;
  finger: ControllerHaloPoint | null;
  lastMs: number | null;
}

export const createControllerHaloState = (): ControllerHaloState => ({
  alpha: 0,
  sector: null,
  anchor: null,
  finger: null,
  lastMs: null
});

export interface ControllerHaloFrame {
  visible: boolean;
  /** Fade times near-player scale; every part's alpha below already includes it. */
  alpha: number;
  /** Whole css px (Phaser floors Image positions: src/render/pixelAlignment.ts). */
  anchorX: number;
  anchorY: number;
  nubX: number;
  nubY: number;
  ringAlpha: number;
  nubAlpha: number;
  /** Lit sector 0..7 or null (dead zone, zero-length drag, released). */
  sector: number | null;
  sectorName: ControllerHaloSectorName | null;
  litRotationRad: number;
  litAlpha: number;
  /** True drag angle, for the leash cue. */
  leashRotationRad: number;
  leashAlpha: number;
  /** Nub glow is a static bake, but reduced motion drops it like look A did. */
  nubGlow: boolean;
}

/**
 * Advances the halo state by one frame and returns what to show. Pure apart from mutating `state`.
 */
export const resolveControllerHaloFrame = (
  input: ControllerHaloFrameInput,
  state: ControllerHaloState
): ControllerHaloFrame => {
  const dtMs = state.lastMs === null || !Number.isFinite(input.nowMs) ? 0 : input.nowMs - state.lastMs;
  state.lastMs = Number.isFinite(input.nowMs) ? input.nowMs : state.lastMs;
  const live = input.down && input.anchor !== null && input.finger !== null;
  if (live) {
    state.anchor = { x: input.anchor!.x, y: input.anchor!.y };
    state.finger = { x: input.finger!.x, y: input.finger!.y };
  }
  state.alpha = stepControllerHaloFade(state.alpha, live, dtMs, input.reducedMotion);

  const anchor = state.anchor ?? { x: 0, y: 0 };
  const finger = state.finger ?? anchor;
  const dx = finger.x - anchor.x;
  const dy = finger.y - anchor.y;
  const distance = Math.hypot(dx, dy);
  const hasDirection = live && input.engaged && distance > 0;
  state.sector = hasDirection ? resolveControllerHaloSector(Math.atan2(dy, dx), state.sector) : null;
  if (!live && state.alpha <= 0) {
    state.anchor = null;
    state.finger = null;
  }

  const unitX = distance > 0 ? dx / distance : 0;
  const unitY = distance > 0 ? dy / distance : 0;
  const nubDistance = Math.min(distance, CONTROLLER_HALO.nubThrowPx);
  const anchorX = Math.round(anchor.x);
  const anchorY = Math.round(anchor.y);
  const near = resolveControllerHaloNearPlayerScale(anchor, finger, input.player);
  const alpha = state.alpha * near;
  const sector = state.sector;
  return {
    visible: alpha > 0.005,
    alpha,
    anchorX,
    anchorY,
    nubX: Math.round(anchor.x + (unitX * nubDistance)),
    nubY: Math.round(anchor.y + (unitY * nubDistance)),
    ringAlpha: CONTROLLER_HALO.ringAlpha * alpha,
    nubAlpha: alpha,
    sector,
    sectorName: sector === null ? null : CONTROLLER_HALO_SECTOR_NAMES[sector],
    litRotationRad: sector === null ? 0 : resolveControllerHaloSectorAngle(sector),
    litAlpha: sector === null ? 0 : CONTROLLER_HALO.litAlpha * alpha,
    leashRotationRad: distance > 0 ? Math.atan2(dy, dx) : 0,
    leashAlpha: live ? resolveControllerHaloLeashAlpha(distance, input.leashPx) * alpha : 0,
    nubGlow: !input.reducedMotion
  };
};

// ---------- bake geometry and drawing (Canvas 2D; the view bakes each shape once) ----------

export interface ControllerHaloBakeBox {
  /** Css px size of the baked image (even, so a 0.5 origin lands on a whole css px). */
  widthCss: number;
  heightCss: number;
  /** Where the anchor sits inside the image, css px from its top-left. */
  originXCss: number;
  originYCss: number;
}

const evenCeil = (value: number): number => {
  const whole = Math.ceil(value);
  return whole % 2 === 0 ? whole : whole + 1;
};

/** Ring and lit arc share one square box centred on the anchor. */
export const resolveControllerHaloRingBox = (): ControllerHaloBakeBox => {
  const reach = CONTROLLER_HALO.ringRadiusPx + (Math.max(CONTROLLER_HALO.ringLineWidthPx, CONTROLLER_HALO.litLineWidthPx) / 2) + 2;
  const size = evenCeil(reach * 2);
  return { widthCss: size, heightCss: size, originXCss: size / 2, originYCss: size / 2 };
};

export const resolveControllerHaloNubBox = (): ControllerHaloBakeBox => {
  const reach = CONTROLLER_HALO.nubRadiusPx + (CONTROLLER_HALO.nubGlowBlurPx * 1.6);
  const size = evenCeil(reach * 2);
  return { widthCss: size, heightCss: size, originXCss: size / 2, originYCss: size / 2 };
};

/** The leash arc, drawn pointing right (angle 0) with the anchor on the image's left edge, vertically centred. */
export const resolveControllerHaloLeashBox = (leashPx: number): ControllerHaloBakeBox => {
  const radius = Math.max(1, leashPx);
  const pad = CONTROLLER_HALO.leashLineWidthPx + 2;
  const halfHeight = (radius * Math.sin(CONTROLLER_HALO.leashHalfSpanRad)) + pad;
  const heightCss = evenCeil(halfHeight * 2);
  return { widthCss: evenCeil(radius + pad), heightCss, originXCss: 0, originYCss: heightCss / 2 };
};

export interface ControllerHaloCanvasContext {
  save(): void;
  restore(): void;
  beginPath(): void;
  arc(x: number, y: number, radius: number, start: number, end: number): void;
  stroke(): void;
  fill(): void;
  setLineDash(segments: number[]): void;
  lineWidth: number;
  lineCap: string;
  strokeStyle: string;
  fillStyle: string;
  globalAlpha: number;
  shadowColor: string;
  shadowBlur: number;
}

export const toControllerHaloCss = (color: number): string => `#${Math.trunc(color).toString(16).padStart(6, '0').slice(-6)}`;

/** Full-opacity ring; the view sets the image alpha (ringAlpha) per frame. Context is already scaled to css px. */
export const drawControllerHaloRing = (ctx: ControllerHaloCanvasContext, box: ControllerHaloBakeBox): void => {
  ctx.save();
  ctx.strokeStyle = toControllerHaloCss(CONTROLLER_HALO.colors.cyan);
  ctx.lineWidth = CONTROLLER_HALO.ringLineWidthPx;
  ctx.beginPath();
  ctx.arc(box.originXCss, box.originYCss, CONTROLLER_HALO.ringRadiusPx, 0, TAU);
  ctx.stroke();
  ctx.restore();
};

/** The lit arc pointing right (sector 0); the view rotates the image to the lit sector. */
export const drawControllerHaloLitArc = (ctx: ControllerHaloCanvasContext, box: ControllerHaloBakeBox): void => {
  ctx.save();
  ctx.strokeStyle = toControllerHaloCss(CONTROLLER_HALO.colors.cyan);
  ctx.lineWidth = CONTROLLER_HALO.litLineWidthPx;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(box.originXCss, box.originYCss, CONTROLLER_HALO.ringRadiusPx, -CONTROLLER_HALO.litHalfSpanRad, CONTROLLER_HALO.litHalfSpanRad);
  ctx.stroke();
  ctx.restore();
};

/** Nub: cyan dot (optionally with its glow) and a white core. `shadowScale` = canvas px per css px for shadowBlur. */
export const drawControllerHaloNub = (
  ctx: ControllerHaloCanvasContext,
  box: ControllerHaloBakeBox,
  glow: boolean,
  shadowScale: number
): void => {
  ctx.save();
  ctx.fillStyle = toControllerHaloCss(CONTROLLER_HALO.colors.cyan);
  if (glow) {
    ctx.shadowColor = toControllerHaloCss(CONTROLLER_HALO.colors.cyan);
    // shadowBlur is in raw canvas px; the context transform does not scale it.
    ctx.shadowBlur = CONTROLLER_HALO.nubGlowBlurPx * shadowScale;
  }
  ctx.beginPath();
  ctx.arc(box.originXCss, box.originYCss, CONTROLLER_HALO.nubRadiusPx, 0, TAU);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = toControllerHaloCss(CONTROLLER_HALO.colors.white);
  ctx.beginPath();
  ctx.arc(box.originXCss, box.originYCss, CONTROLLER_HALO.nubCoreRadiusPx, 0, TAU);
  ctx.fill();
  ctx.restore();
};

/** Dashed leash arc at the leash distance, pointing right; the view rotates it to the true drag angle. */
export const drawControllerHaloLeashArc = (
  ctx: ControllerHaloCanvasContext,
  box: ControllerHaloBakeBox,
  leashPx: number
): void => {
  ctx.save();
  ctx.strokeStyle = toControllerHaloCss(CONTROLLER_HALO.colors.cyan);
  ctx.lineWidth = CONTROLLER_HALO.leashLineWidthPx;
  ctx.setLineDash([...CONTROLLER_HALO.leashDashPx]);
  ctx.beginPath();
  ctx.arc(box.originXCss, box.originYCss, Math.max(1, leashPx), -CONTROLLER_HALO.leashHalfSpanRad, CONTROLLER_HALO.leashHalfSpanRad);
  ctx.stroke();
  ctx.restore();
};

/** Minimal Phaser-Graphics-like surface for the Guide icon. */
export interface ControllerHaloGuideGraphics {
  lineStyle(width: number, color: number, alpha?: number): unknown;
  fillStyle(color: number, alpha?: number): unknown;
  beginPath(): unknown;
  arc(x: number, y: number, radius: number, startAngle: number, endAngle: number, anticlockwise?: boolean): unknown;
  strokePath(): unknown;
  strokeCircle(x: number, y: number, radius: number): unknown;
  fillCircle(x: number, y: number, radius: number): unknown;
}

/**
 * The Guide's "Move" icon: a miniature halo (ring, the up-right diagonal lit, nub pulled toward it), so the Guide
 * shows the 8-direction light the board uses. Static, so it is the same with reduced motion.
 */
export const drawControllerHaloGuideGlyph = (
  graphics: ControllerHaloGuideGraphics,
  centerX: number,
  centerY: number,
  size: number
): void => {
  const radius = size * 0.82;
  const sectorAngle = resolveControllerHaloSectorAngle(7);
  const cyan = CONTROLLER_HALO.colors.cyan;
  graphics.lineStyle(Math.max(1, size * 0.08), cyan, 0.5);
  graphics.strokeCircle(centerX, centerY, radius);
  graphics.lineStyle(Math.max(1.5, size * 0.16), cyan, CONTROLLER_HALO.litAlpha);
  graphics.beginPath();
  graphics.arc(centerX, centerY, radius, sectorAngle - CONTROLLER_HALO.litHalfSpanRad, sectorAngle + CONTROLLER_HALO.litHalfSpanRad);
  graphics.strokePath();
  const nubOffset = radius * (CONTROLLER_HALO.nubThrowPx / CONTROLLER_HALO.ringRadiusPx);
  const nubX = centerX + (Math.cos(sectorAngle) * nubOffset);
  const nubY = centerY + (Math.sin(sectorAngle) * nubOffset);
  graphics.fillStyle(cyan, 1);
  graphics.fillCircle(nubX, nubY, size * 0.22 * (CONTROLLER_HALO.nubRadiusPx / 8));
  graphics.fillStyle(CONTROLLER_HALO.colors.white, 1);
  graphics.fillCircle(nubX, nubY, size * 0.09);
};
