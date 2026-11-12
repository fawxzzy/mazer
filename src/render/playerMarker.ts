/**
 * The player marker: ONE shape, size, colour, outline and glow for the human's marker in play, the menu demo's AI and
 * the Guide icon. Pure geometry plus one draw function over a tiny Graphics interface; no Phaser import and no
 * allocation per frame (callers pass scratch records).
 *
 * History: the real-play marker was built to the Navigation Core reference (a 60 % rounded block with a ring, a glow
 * and an ambient halo) while the menu demo's walker kept an older flat sharp square (85 % of the tile, a catchlight
 * triangle, no keyline, no glow), so the AI and the player looked like two different things. Both now come through
 * `resolvePlayerMarkerFrame` + `drawPlayerMarker` (plus the glow canvas the scene paints from `PLAYER_MARKER.glow`).
 * The one part that stays play-only is the find-me ping (a state machine, see playerLocator.ts): the demo passes no
 * ping start.
 *
 * Sizing follows the start / goal glyphs (endpointTiles.ts): everything is a share of the TILE, the centre is the
 * device-snapped tile centre (`snappedCellCenter`, the one `centerOfCell` uses for the baked tiles and the end markers)
 * and line widths are whole device pixels, never below one:
 *  - block: PLAYER_SIZE_RATIO (0.6) of the tile across, corner radius CHIP_CORNER_RATIO (0.3) of its width (the Chip
 *    tile's own corner proportion, so it reads as a small chip);
 *  - keyline: the end markers' keyline (a share of the half-tile, whole device px, at least one);
 *  - ring and glow: playerLocator.ts, inside the tile (the glow bleeds a fraction of a tile as a falloff);
 *  - a thin darker-green accent stroke on the block's edge.
 *
 * Motion: a small squash-and-stretch along the direction of travel while gliding (`motionAmount` 0..1 from the glide
 * pose) and a slow breathing pulse; both scale the block about its centre. Reduced motion freezes the breathing.
 * The AI breathes too: the pulse is one multiplication in this function, so skipping it for the AI would add a branch
 * and a difference without saving anything.
 */
import { snappedCellCenter } from './boardTileBake';
import {
  CHIP_CORNER_RATIO,
  PLAYER_SIZE_RATIO,
  clampBoardDevicePixelRatio,
  snapLineWidth
} from './boardTileStyle';
import {
  drawPlayerLocator,
  resolvePlayerLocatorMetrics,
  type LocatorGraphics,
  type LocatorTileRadii
} from './playerLocator';

export const PLAYER_MARKER = Object.freeze({
  /** The block is this share of the tile across. */
  sizeRatio: PLAYER_SIZE_RATIO,
  /** Corner radius as a share of the block's width: the Chip tile's own proportion. */
  cornerRatio: CHIP_CORNER_RATIO,
  /** The reference --player-accent (#2BB868): the block's edge stroke and the tight glow. */
  accentColor: 0x2bb868,
  accentAlpha: 0.86,
  /** Accent stroke as a share of the tile; whole device px, never below one. */
  accentStrokeTileRatio: 2.4 / 64,
  /** Squash-and-stretch while gliding: along the travel direction x(1 + stretch), across x(1 - stretch * squeeze). */
  glideStretch: 0.1,
  glideSqueeze: 0.6,
  /** Idle breathing: the block scales by 1 +/- amount over the period (frozen in reduced motion). */
  breathePeriodMs: 1500,
  breatheAmount: 0.07,
  /** The two shadowBlur glow layers (navigationCorePlayerGlowCanvas.ts): blur radii as shares of the tile. */
  glow: Object.freeze({
    tightBlurTileRatio: 3 / 64,
    tightAlpha: (0xee / 0xff) * 0.55,
    wideBlurTileRatio: 8 / 64,
    wideAlpha: (0x99 / 0xff) * 0.4
  })
});

/** Half-extent of the block at rest (no breathing, no glide pose). */
export const resolvePlayerMarkerRestHalf = (tileSize: number): number => (
  (Math.max(0, tileSize) * PLAYER_MARKER.sizeRatio) / 2
);

/** The block's largest resting half-extent: at the top of a breath. Decides whether the locator ring fits. */
export const resolvePlayerMarkerReach = (tileSize: number): number => (
  resolvePlayerMarkerRestHalf(tileSize) * (1 + PLAYER_MARKER.breatheAmount)
);

export interface PlayerMarkerDiagnosticRadii {
  /** Half the block's resting width: what `drawPlayerMarker` fills (no breathing, no glide pose). */
  coreRadius: number;
  /** Half the locator ring's outer extent: the player's own cell edge, where the ring is stroked flush. */
  haloRadius: number;
}

/**
 * The radii the runtime diagnostics (`markerStyle.playerCoreRadius` / `playerHaloRadius`) report, derived from the same
 * functions the drawing uses (`resolvePlayerMarkerRestHalf`, `resolvePlayerLocatorMetrics`), so they cannot drift from
 * what is on screen. They used to be the diamond-era ratios 0.46 and 0.72 of the tile, which matched nothing drawn.
 */
export const resolvePlayerMarkerDiagnosticRadii = (
  tileSize: number,
  devicePixelRatio: number,
  out: PlayerMarkerDiagnosticRadii = { coreRadius: 0, haloRadius: 0 }
): PlayerMarkerDiagnosticRadii => {
  const locator = resolvePlayerLocatorMetrics(tileSize, devicePixelRatio, resolvePlayerMarkerReach(tileSize));
  out.coreRadius = resolvePlayerMarkerRestHalf(tileSize);
  // The ring is stroked centred `ringHalfCss` out with `ringStrokeCss` width, so its outer edge is their sum (the
  // tile edge); where the tile is too small for a ring the glow starts from the tile edge, the same distance.
  out.haloRadius = locator.ringHalfCss + (locator.ringStrokeCss / 2);
  return out;
};

/** A start / goal tile's geometry as far as the ring needs it: its corner radii in board tile order. */
export interface PlayerMarkerEndpointTile {
  radii: LocatorTileRadii;
}

/**
 * The corner radii the locator ring should follow when the marker sits on the start or goal tile, else null (every
 * other tile keeps the plain chip-corner ring). `cellX` / `cellY` may be fractional while gliding: the nearest cell
 * decides, so the ring takes the end tile's curve once the block is more than half way into it.
 */
export const resolvePlayerMarkerEndpointRadii = (
  cellX: number,
  cellY: number,
  start: { x: number; y: number } | null | undefined,
  goal: { x: number; y: number } | null | undefined,
  tiles: { start: PlayerMarkerEndpointTile | null; goal: PlayerMarkerEndpointTile | null }
): LocatorTileRadii | null => {
  const x = Math.round(cellX);
  const y = Math.round(cellY);
  if (start && start.x === x && start.y === y) {
    return tiles.start?.radii ?? null;
  }
  if (goal && goal.x === x && goal.y === y) {
    return tiles.goal?.radii ?? null;
  }
  return null;
};

export interface PlayerMarkerCenter {
  x: number;
  y: number;
}

/**
 * The marker's centre for a (possibly fractional, while gliding) cell position. A whole cell is exactly
 * `centerOfCell` (the device-snapped centre of the baked tile and of the end glyphs); between cells it moves linearly
 * between the two snapped centres, so the block lands on the tile's centre at the end of every step instead of up to
 * half a device pixel beside it.
 */
export const resolvePlayerMarkerCenter = (
  cellX: number,
  cellY: number,
  tileSize: number,
  devicePixelRatio: number,
  originX: number,
  originY: number,
  out: PlayerMarkerCenter = { x: 0, y: 0 }
): PlayerMarkerCenter => {
  const scale = clampBoardDevicePixelRatio(devicePixelRatio);
  const axis = (cell: number, origin: number): number => {
    const base = Math.floor(cell);
    const fraction = cell - base;
    const from = snappedCellCenter(base, tileSize, scale);
    return origin + (fraction === 0 ? from : from + ((snappedCellCenter(base + 1, tileSize, scale) - from) * fraction));
  };
  out.x = axis(cellX, originX);
  out.y = axis(cellY, originY);
  return out;
};

export interface PlayerMarkerFrame {
  centerX: number;
  centerY: number;
  /** Current half extents (glide pose and breathing applied) and the corner radius. */
  coreHalfWidth: number;
  coreHalfHeight: number;
  coreCornerRadius: number;
  /** Largest resting half extent (see `resolvePlayerMarkerReach`). */
  coreReachCss: number;
  /** Accent stroke width, whole device px. */
  accentStrokeCss: number;
}

export interface PlayerMarkerFrameInput {
  centerX: number;
  centerY: number;
  tileSize: number;
  devicePixelRatio: number;
  timeMs: number;
  reducedMotion: boolean;
  /** Glide pose: 0 at rest .. 1 mid-step, and the heading (any scale; only the dominant axis is used). */
  motionAmount: number;
  headingX: number;
  headingY: number;
}

export const createPlayerMarkerFrame = (): PlayerMarkerFrame => ({
  centerX: 0,
  centerY: 0,
  coreHalfWidth: 0,
  coreHalfHeight: 0,
  coreCornerRadius: 0,
  coreReachCss: 0,
  accentStrokeCss: 0
});

/** Fills `out` with the marker's geometry for one frame. Pure: same input, same frame, in play and in the demo. */
export const resolvePlayerMarkerFrame = (
  input: PlayerMarkerFrameInput,
  out: PlayerMarkerFrame
): PlayerMarkerFrame => {
  const k = PLAYER_MARKER;
  const scale = clampBoardDevicePixelRatio(input.devicePixelRatio);
  const rest = resolvePlayerMarkerRestHalf(input.tileSize);
  let halfWidth = rest;
  let halfHeight = rest;
  if (input.motionAmount > 0) {
    const stretch = input.motionAmount * k.glideStretch;
    const along = 1 + stretch;
    const across = 1 - (stretch * k.glideSqueeze);
    const horizontal = Math.abs(input.headingX) >= Math.abs(input.headingY);
    halfWidth = rest * (horizontal ? along : across);
    halfHeight = rest * (horizontal ? across : along);
  }
  if (!input.reducedMotion) {
    const breathe = 1 + (Math.sin((input.timeMs / k.breathePeriodMs) * Math.PI * 2) * k.breatheAmount);
    halfWidth *= breathe;
    halfHeight *= breathe;
  }
  out.centerX = input.centerX;
  out.centerY = input.centerY;
  out.coreHalfWidth = halfWidth;
  out.coreHalfHeight = halfHeight;
  out.coreCornerRadius = rest * 2 * k.cornerRatio;
  out.coreReachCss = resolvePlayerMarkerReach(input.tileSize);
  out.accentStrokeCss = snapLineWidth(input.tileSize * k.accentStrokeTileRatio, scale);
  return out;
};

export interface PlayerMarkerDrawInput {
  tileSize: number;
  devicePixelRatio: number;
  /** Lifecycle fade, 0..1. */
  alpha: number;
  timeMs: number;
  /** The player's (iridescent) core colour for this frame. */
  coreColor: number;
  /** Running find-me ping start, or negative for none (always negative in the menu demo and the Guide). */
  pingStartMs: number;
  reducedMotion: boolean;
  /** On a start / goal tile: that tile's corner radii, so the ring follows the cap shape (playerLocator.ts). */
  tileCornerRadii?: LocatorTileRadii | null;
  /** 0..1 share of the cap shape on those corners while gliding on or off the tile (playerRingMorph.ts); omitted = 1. */
  tileCornerBlend?: number;
}

/**
 * Paints the marker's Graphics layers in order: locator (glow, ring, ping, keyline), core fill, accent stroke. The
 * soft shadowBlur glow is a canvas image the scene composites underneath (it cannot be a Graphics call).
 */
export const drawPlayerMarker = (
  g: LocatorGraphics,
  frame: PlayerMarkerFrame,
  input: PlayerMarkerDrawInput
): void => {
  const alpha = Math.max(0, Math.min(1, input.alpha));
  if (alpha <= 0) {
    return;
  }
  drawPlayerLocator(g, {
    centerX: frame.centerX,
    centerY: frame.centerY,
    tileSize: input.tileSize,
    devicePixelRatio: input.devicePixelRatio,
    coreHalfWidth: frame.coreHalfWidth,
    coreHalfHeight: frame.coreHalfHeight,
    coreCornerRadius: frame.coreCornerRadius,
    coreReachCss: frame.coreReachCss,
    alpha,
    timeMs: input.timeMs,
    pingStartMs: input.pingStartMs,
    reducedMotion: input.reducedMotion,
    tileCornerRadii: input.tileCornerRadii ?? null,
    tileCornerBlend: input.tileCornerBlend ?? 1
  });
  const left = frame.centerX - frame.coreHalfWidth;
  const top = frame.centerY - frame.coreHalfHeight;
  const width = frame.coreHalfWidth * 2;
  const height = frame.coreHalfHeight * 2;
  g.fillStyle(input.coreColor, alpha);
  g.fillRoundedRect(left, top, width, height, frame.coreCornerRadius);
  g.lineStyle(frame.accentStrokeCss, PLAYER_MARKER.accentColor, Math.min(PLAYER_MARKER.accentAlpha, alpha * PLAYER_MARKER.accentAlpha));
  g.strokeRoundedRect(left, top, width, height, frame.coreCornerRadius);
};
