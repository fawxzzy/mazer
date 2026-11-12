/**
 * Player locator: the "where am I" treatment around the player marker, sized from the TILE (like the end markers),
 * with only the find-me ping sized in css pixels.
 *
 * What it adds (the player's own shape, colour and glow are untouched; this only surrounds them):
 *   1. a dark keyline hugging the player's rounded square (drawn before the core fill), the same thin one-to-two
 *      device pixel outline the end markers trace around their glyphs: it separates the bright core from the trail
 *      running through the same tile;
 *   2. a ring: a thin player-green rounded square that lies INSIDE the player's own tile, flush with the tile edge,
 *      the same width as the chip's lit rim. It reads as the player's cell lighting up in the player's colour and
 *      never reaches into the neighbouring tiles. Where the tile is too small to hold it without touching the block
 *      (tiles under about 8 css px at 1x) it is left out and the glow carries the marker;
 *   3. a soft player-green glow outside the ring (a few equal-alpha concentric rounded squares: Phaser Graphics has
 *      no gradients), bleeding a fraction of a tile past the cell edge as a falloff;
 *   4. a brief "find me" ping (two staggered expanding rings) on spawn, after unpause / level change, and whenever
 *      the player has stood still for `idleMs`. A ping is cancelled the moment the player moves. This is the one part
 *      that is NOT tile-sized: it travels at least `pingMinTravelCss` px out so it can be seen on a dense board, and
 *      it exists only in play (the menu demo has no ping state), so it is the one allowed difference between the
 *      human's marker and the AI's.
 *
 * History: the ring used to be a css-px ring (0.7 of a tile, floored at 11 and capped at 30 css px) with a 2.5 px
 * keyline and a glow out to 1.85x that. That was found by the 2026-11-09 locator card for 5..8 px tiles, but it made
 * the ring 1.4 to 2.75 tiles across (1.5 at a 14.7 px phone tile, 2.7 at 8 px) so it overran the corridor it sat in,
 * and it did not look like the start / goal glyphs, which stay inside their tile. The ping keeps the dense-board
 * findability job; the ring now matches the tile.
 *
 * Shape: the ring, glow and ping are rounded squares with the Chip tile's own corner proportion (radius is
 * CHIP_CORNER_RATIO of the side), concentric with the player's rounded square.
 *
 * End tiles (MAZER-VIS-023): the start and goal tiles are dead-end CAP tiles, whose closed corners are fully round
 * (BOARD_TILE_GEOMETRY.capRadiusRatio) while the square ring's corners kept the 0.3 chip radius, so at large tile
 * sizes the ring's corners poked past the rounded dead-end disc. When the caller passes the tile's own corner radii
 * (`tileCornerRadii`, board tile geometry order tl, tr, br, bl; 0 = an open side) every closed corner of the ring, the
 * glow and the ping follows the tile's curve: the same arc, offset by the ring's inset (so the ring is exactly
 * concentric with the tile edge and never leaves the cap's outline). Open-side corners keep the chip radius.
 * Without radii (any other tile, the Guide icon) the shapes are unchanged.
 *
 * Reduced motion: the glow, ring and keyline are static and the ping is never started.
 *
 * Cost: a handful of Graphics calls per dynamic redraw, no gradients, no canvas, and NO per-frame allocation
 * (colours are numbers, geometry goes through one module-level scratch record, the state machine mutates
 * numeric fields). The ping only forces dynamic redraws while it is visible (about 1.3 s each time).
 *
 * Pure: no Date, no Math.random. The draw is a function of (geometry, timeMs, pingStartMs, reducedMotion).
 */
import {
  BOARD_TILE_GEOMETRY,
  CHIP_CORNER_RATIO,
  boardMaterial,
  snapLineWidth
} from './boardTileStyle';

export const PLAYER_LOCATOR = Object.freeze({
  /** Ring stroke as a share of the tile, snapped to whole device px (at least one), capped in css px. */
  ringStrokeTileRatio: 0.07,
  ringStrokeMaxCss: 2.2,
  ringAlpha: 0.92,
  /** The ring is dropped when its inner edge would sit inside the core's keyline by more than this many device px. */
  ringOverlapToleranceDevicePx: 0.5,
  /** Soft glow: concentric rounded squares from the ring outwards, ending this share of a tile past the ring. */
  glowSteps: 6,
  glowSpreadTileRatio: 0.3,
  glowPeakAlpha: 0.24,
  /** Dark keyline around the player's rounded square: the end markers' keyline, a share of the half-tile. */
  coreKeylineOfRadius: BOARD_TILE_GEOMETRY.endpoint.keylineOfRadius,
  coreKeylineAlpha: 0.9,
  /** Find-me ping (css px: it is the dense-board findability aid, not part of the tile-sized marker). */
  idleMs: 5000,
  idleRepeatMs: 6500,
  pingDurationMs: 1100,
  pingStaggerMs: 220,
  pingCount: 2,
  pingStrokeCss: 2,
  pingKeylineExtraCss: 2,
  pingPeakAlpha: 0.85,
  /** The ping travels from the ring to this multiple of the half-tile, at least `pingMinTravelCss` px out. */
  pingTravelPerHalfTile: 3,
  pingMinTravelCss: 26
});

/** The subset of Phaser.GameObjects.Graphics the locator paints with (a fake in tests). */
export interface LocatorGraphics {
  fillStyle(color: number, alpha?: number): unknown;
  fillRoundedRect(x: number, y: number, width: number, height: number, radius: number | LocatorCornerRadii): unknown;
  lineStyle(width: number, color: number, alpha?: number): unknown;
  strokeRoundedRect(x: number, y: number, width: number, height: number, radius: number | LocatorCornerRadii): unknown;
}

/** Per-corner radii in Phaser's `RoundedRectRadius` shape. */
export interface LocatorCornerRadii {
  tl: number;
  tr: number;
  bl: number;
  br: number;
}

/** A tile's corner radii in board tile geometry order: top-left, top-right, bottom-right, bottom-left (0 = square). */
export type LocatorTileRadii = readonly [number, number, number, number];

/** Corner radius of a chip-family rounded square of the given half-extent (the Chip tile's corner proportion). */
export const resolveLocatorCornerRadius = (halfExtent: number): number => halfExtent * 2 * CHIP_CORNER_RATIO;

/**
 * Corner radii of a locator square of half-extent `half` drawn on a tile of half-extent `tileHalf` whose own corner
 * radii are `tileRadii`. A closed (rounded) tile corner gives the tile's arc offset by `half - tileHalf` (the same
 * centre, so concentric with the tile edge), never more than `half` (a full semicircle); a square (open-side) corner
 * keeps the chip proportion. Pure; fills and returns `out`.
 */
export const resolveLocatorSquareRadii = (
  half: number,
  tileHalf: number,
  tileRadii: LocatorTileRadii,
  out: LocatorCornerRadii
): LocatorCornerRadii => {
  const uniform = resolveLocatorCornerRadius(half);
  const corner = (tileRadius: number): number => (
    tileRadius > 0 ? Math.min(half, Math.max(0, tileRadius + (half - tileHalf))) : uniform
  );
  out.tl = corner(tileRadii[0]);
  out.tr = corner(tileRadii[1]);
  out.br = corner(tileRadii[2]);
  out.bl = corner(tileRadii[3]);
  return out;
};

/** Scratch for the per-corner path: Phaser reads the radii synchronously inside each call, so one record is reused. */
const RADII_SCRATCH: LocatorCornerRadii = { tl: 0, tr: 0, bl: 0, br: 0 };

const squareRadius = (
  half: number,
  tileHalf: number,
  tileRadii: LocatorTileRadii | null
): number | LocatorCornerRadii => (
  tileRadii === null
    ? resolveLocatorCornerRadius(half)
    : resolveLocatorSquareRadii(half, tileHalf, tileRadii, RADII_SCRATCH)
);

const fillSquare = (
  g: LocatorGraphics, cx: number, cy: number, half: number, tileHalf: number, tileRadii: LocatorTileRadii | null
): void => {
  g.fillRoundedRect(cx - half, cy - half, half * 2, half * 2, squareRadius(half, tileHalf, tileRadii));
};

const strokeSquare = (
  g: LocatorGraphics, cx: number, cy: number, half: number, tileHalf: number, tileRadii: LocatorTileRadii | null
): void => {
  g.strokeRoundedRect(cx - half, cy - half, half * 2, half * 2, squareRadius(half, tileHalf, tileRadii));
};

export interface PlayerLocatorMetrics {
  /** Distance from the cell centre to the ring's stroke centre line (css px). */
  ringHalfCss: number;
  ringStrokeCss: number;
  /** False where the tile cannot hold the ring without touching the player's block. */
  ringVisible: boolean;
  /** Outer half-extent of the glow (css px). */
  glowHalfCss: number;
  /** Width of the dark keyline around the core (css px, whole device px). */
  coreKeylineCss: number;
  /** Half-extent the ping reaches at the end of its travel (css px). */
  pingTravelHalfCss: number;
}

/** The ring, glow and keyline are not part of a tile this small: below this the metrics are all zero. */
const emptyMetrics = (out: PlayerLocatorMetrics): PlayerLocatorMetrics => {
  out.ringHalfCss = 0;
  out.ringStrokeCss = 0;
  out.ringVisible = false;
  out.glowHalfCss = 0;
  out.coreKeylineCss = 0;
  out.pingTravelHalfCss = 0;
  return out;
};

/**
 * Fills `out` (or a new record) with the css-px geometry for a tile size and device pixel ratio. `coreReachCss` is how
 * far the player's block reaches from the cell centre at its largest resting size (breathing included), as a half
 * extent WITHOUT the keyline; it decides whether the ring fits. Pure.
 */
export const resolvePlayerLocatorMetrics = (
  tileSize: number,
  devicePixelRatio: number,
  coreReachCss: number,
  out: PlayerLocatorMetrics = emptyMetrics({
    ringHalfCss: 0, ringStrokeCss: 0, ringVisible: false, glowHalfCss: 0, coreKeylineCss: 0, pingTravelHalfCss: 0
  })
): PlayerLocatorMetrics => {
  const k = PLAYER_LOCATOR;
  const tile = Number.isFinite(tileSize) && tileSize > 0 ? tileSize : 0;
  if (tile === 0) {
    return emptyMetrics(out);
  }
  const dpr = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
  const half = tile / 2;
  const stroke = Math.min(snapLineWidth(tile * k.ringStrokeTileRatio, dpr), Math.max(k.ringStrokeMaxCss, 1 / dpr));
  const keyline = snapLineWidth(half * k.coreKeylineOfRadius, dpr);
  const ringHalf = half - (stroke / 2);
  const innerEdge = half - stroke;
  const coreEdge = Math.max(0, coreReachCss) + keyline;
  out.ringStrokeCss = stroke;
  out.ringHalfCss = ringHalf;
  out.ringVisible = innerEdge - coreEdge >= -(k.ringOverlapToleranceDevicePx / dpr);
  out.glowHalfCss = half + (tile * k.glowSpreadTileRatio);
  out.coreKeylineCss = keyline;
  out.pingTravelHalfCss = Math.max(half * k.pingTravelPerHalfTile, half + k.pingMinTravelCss);
  return out;
};

/** Alpha of ping ring `index` at `elapsedMs` since the ping started, 0 when that ring is not on screen. */
export const resolvePingRingProgress = (elapsedMs: number, index: number): number => {
  const k = PLAYER_LOCATOR;
  const t = (elapsedMs - (index * k.pingStaggerMs)) / k.pingDurationMs;
  return t >= 0 && t < 1 ? t : -1;
};

/** Total time one ping occupies: the last staggered ring finishes at this elapsed time. */
export const PLAYER_LOCATOR_PING_TOTAL_MS = (
  PLAYER_LOCATOR.pingDurationMs + ((PLAYER_LOCATOR.pingCount - 1) * PLAYER_LOCATOR.pingStaggerMs)
);

const SCRATCH: PlayerLocatorMetrics = emptyMetrics({
  ringHalfCss: 0, ringStrokeCss: 0, ringVisible: false, glowHalfCss: 0, coreKeylineCss: 0, pingTravelHalfCss: 0
});

export interface PlayerLocatorDrawInput {
  /** Cell centre (css px, the same space the marker is drawn in). */
  centerX: number;
  centerY: number;
  tileSize: number;
  devicePixelRatio: number;
  /** The player's current rounded-square half extents (squash/stretch and breathing included) and corner radius. */
  coreHalfWidth: number;
  coreHalfHeight: number;
  coreCornerRadius: number;
  /** The block's largest resting half extent (breathing included, no keyline): decides whether the ring fits. */
  coreReachCss: number;
  /** Lifecycle fade, 0..1. */
  alpha: number;
  timeMs: number;
  /** Start time of the running ping, or a negative number for none. */
  pingStartMs: number;
  reducedMotion: boolean;
  /** The tile's own corner radii when it is a start / goal tile (see the header); omitted elsewhere. */
  tileCornerRadii?: LocatorTileRadii | null;
}

/** Paints glow, ring, ping and the core keyline. Call BEFORE the player's own fill so the core stays on top. */
export const drawPlayerLocator = (g: LocatorGraphics, input: PlayerLocatorDrawInput): void => {
  const k = PLAYER_LOCATOR;
  const alpha = Math.max(0, Math.min(1, input.alpha));
  if (alpha <= 0) {
    return;
  }
  const m = resolvePlayerLocatorMetrics(input.tileSize, input.devicePixelRatio, input.coreReachCss, SCRATCH);
  const { centerX: cx, centerY: cy } = input;
  const half = input.tileSize / 2;
  const tileRadii = input.tileCornerRadii ?? null;
  // The glow and the ping start at the ring's outer edge, or at the tile edge where the ring is left out.
  const innerRadius = m.ringVisible ? m.ringHalfCss : half;

  // 1. soft glow: equal-alpha concentric rounded squares, stacked so the cumulative alpha at the ring is glowPeakAlpha.
  const perStep = 1 - ((1 - k.glowPeakAlpha) ** (1 / k.glowSteps));
  g.fillStyle(boardMaterial.player, perStep * alpha);
  for (let i = 0; i < k.glowSteps; i += 1) {
    const r = innerRadius + ((m.glowHalfCss - innerRadius) * (1 - (i / k.glowSteps)));
    fillSquare(g, cx, cy, r, half, tileRadii);
  }

  // 2. the ring: the player's cell lit in the player's colour, inside the tile.
  if (m.ringVisible) {
    g.lineStyle(m.ringStrokeCss, boardMaterial.player, k.ringAlpha * alpha);
    strokeSquare(g, cx, cy, m.ringHalfCss, half, tileRadii);
  }

  // 3. find-me ping: expanding rings (never in reduced motion; the caller also never starts one).
  if (!input.reducedMotion && input.pingStartMs >= 0) {
    const elapsed = input.timeMs - input.pingStartMs;
    for (let i = 0; i < k.pingCount; i += 1) {
      const t = resolvePingRingProgress(elapsed, i);
      if (t < 0) {
        continue;
      }
      const eased = 1 - ((1 - t) * (1 - t));
      const radius = innerRadius + ((m.pingTravelHalfCss - innerRadius) * eased);
      const fade = k.pingPeakAlpha * (1 - t) * alpha;
      g.lineStyle(k.pingStrokeCss + k.pingKeylineExtraCss, boardMaterial.void, fade * 0.7);
      strokeSquare(g, cx, cy, radius, half, tileRadii);
      g.lineStyle(k.pingStrokeCss, boardMaterial.playerEdge, fade);
      strokeSquare(g, cx, cy, radius, half, tileRadii);
    }
  }

  // 4. dark keyline hugging the core (stroke centred half a line-width outside the core edge).
  const w = m.coreKeylineCss;
  g.lineStyle(w, boardMaterial.void, k.coreKeylineAlpha * alpha);
  g.strokeRoundedRect(
    cx - input.coreHalfWidth - (w / 2),
    cy - input.coreHalfHeight - (w / 2),
    (input.coreHalfWidth * 2) + w,
    (input.coreHalfHeight * 2) + w,
    input.coreCornerRadius + (w / 2)
  );
};

/**
 * Decides when a find-me ping starts. Fed once per scene frame with plain numbers/booleans:
 *   - `live`: the player marker is on screen and the game is running (play mode, no overlay, build/spawn done);
 *   - the player's logical cell (a change means the player moved: idle clock resets, a running ping stops).
 * A rising edge of `live` (spawn, unpause, next level) starts a ping; so does `idleMs` without movement, then
 * every `idleRepeatMs` while still idle. Reduced motion never starts one.
 */
export class PlayerLocatorState {
  private wasLive = false;
  private cellX = Number.NaN;
  private cellY = Number.NaN;
  private nextIdlePingAtMs = 0;
  private pingStartMs = -1;
  private redrawPending = false;

  /** Start time of the running ping, or -1. Read by the draw. */
  get activePingStartMs(): number {
    return this.pingStartMs;
  }

  update(timeMs: number, live: boolean, cellX: number, cellY: number, reducedMotion: boolean): void {
    const k = PLAYER_LOCATOR;
    if (!live) {
      this.wasLive = false;
      this.cancelPing();
      return;
    }
    const moved = cellX !== this.cellX || cellY !== this.cellY;
    this.cellX = cellX;
    this.cellY = cellY;
    if (!this.wasLive) {
      this.wasLive = true;
      this.nextIdlePingAtMs = timeMs + k.idleMs;
      this.startPing(timeMs, reducedMotion);
    } else if (moved) {
      this.nextIdlePingAtMs = timeMs + k.idleMs;
      this.cancelPing();
    } else if (timeMs >= this.nextIdlePingAtMs) {
      this.nextIdlePingAtMs = timeMs + k.idleRepeatMs;
      this.startPing(timeMs, reducedMotion);
    }
    if (this.pingStartMs >= 0 && timeMs - this.pingStartMs >= PLAYER_LOCATOR_PING_TOTAL_MS) {
      this.cancelPing();
    }
  }

  /** True while the ping is on screen, plus one more frame after it ends so the last ring gets cleared. */
  needsRedraw(): boolean {
    const active = this.pingStartMs >= 0;
    const needs = active || this.redrawPending;
    this.redrawPending = active;
    return needs;
  }

  private startPing(timeMs: number, reducedMotion: boolean): void {
    if (reducedMotion) {
      return;
    }
    this.pingStartMs = timeMs;
    this.redrawPending = true;
  }

  private cancelPing(): void {
    if (this.pingStartMs >= 0) {
      this.pingStartMs = -1;
      this.redrawPending = true;
    }
  }
}
