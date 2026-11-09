/**
 * Player locator: a clean "where am I" treatment for the play-mode player marker, sized in CSS PIXELS so it
 * scales with the board and never shrinks to a dot on dense boards (tiles of 5..8 css px).
 *
 * What it adds (the player's own shape, colour and glow are untouched; this only surrounds them):
 *   1. a soft player-green glow disc (a few equal-alpha concentric discs: Phaser Graphics has no gradients),
 *   2. a crisp ring around the player: a dark keyline stroke under a bright player-green stroke, so it reads
 *      against both the teal chips and the rainbow trail,
 *   3. a dark keyline hugging the player's rounded square (drawn before the core fill), which separates the
 *      bright core from the trail running through the same tile,
 *   4. a brief "find me" ping (two staggered expanding rings) on spawn, after unpause / level change, and
 *      whenever the player has stood still for `idleMs`. A ping is cancelled the moment the player moves.
 *
 * Reduced motion: the glow, ring and keyline are static and the ping is never started.
 *
 * Cost: a handful of Graphics calls per dynamic redraw, no gradients, no canvas, and NO per-frame allocation
 * (colours are numbers, geometry goes through one module-level scratch record, the state machine mutates
 * numeric fields). The ping only forces dynamic redraws while it is visible (about 1.3 s each time).
 *
 * Pure: no Date, no Math.random. The draw is a function of (geometry, timeMs, pingStartMs, reducedMotion).
 */
import { boardMaterial } from './boardTileStyle';

export const PLAYER_LOCATOR = Object.freeze({
  /** Ring radius as a share of the tile, floored and capped in css px so it reads on every board size. */
  ringRadiusTileRatio: 0.7,
  minRingRadiusCss: 11,
  maxRingRadiusCss: 30,
  ringStrokeCss: 1.75,
  /** The dark keyline under the ring is this much wider than the ring stroke (total, not per side). */
  ringKeylineExtraCss: 2.5,
  ringAlpha: 0.92,
  keylineAlpha: 0.78,
  /** Soft glow: concentric discs from the ring outwards. */
  glowSteps: 6,
  glowRadiusPerRing: 1.85,
  glowPeakAlpha: 0.24,
  /** Dark keyline around the player's rounded square (css px, outside the core edge). */
  coreKeylineCss: 1.5,
  coreKeylineAlpha: 0.9,
  /** Find-me ping. */
  idleMs: 5000,
  idleRepeatMs: 6500,
  pingDurationMs: 1100,
  pingStaggerMs: 220,
  pingCount: 2,
  pingStrokeCss: 2,
  pingKeylineExtraCss: 2,
  pingPeakAlpha: 0.85,
  /** The ping travels from the ring to this multiple of the ring radius, at least `pingMinTravelCss` px out. */
  pingTravelPerRing: 3,
  pingMinTravelCss: 26
});

/** The subset of Phaser.GameObjects.Graphics the locator paints with (a fake in tests). */
export interface LocatorGraphics {
  fillStyle(color: number, alpha?: number): unknown;
  fillCircle(x: number, y: number, radius: number): unknown;
  lineStyle(width: number, color: number, alpha?: number): unknown;
  strokeCircle(x: number, y: number, radius: number): unknown;
  strokeRoundedRect(x: number, y: number, width: number, height: number, radius: number): unknown;
}

export interface PlayerLocatorMetrics {
  ringRadiusCss: number;
  glowRadiusCss: number;
  pingTravelRadiusCss: number;
}

/** Fills `out` (or a new record) with the css-px geometry for a tile size. Pure. */
export const resolvePlayerLocatorMetrics = (
  tileSize: number,
  out: PlayerLocatorMetrics = { ringRadiusCss: 0, glowRadiusCss: 0, pingTravelRadiusCss: 0 }
): PlayerLocatorMetrics => {
  const k = PLAYER_LOCATOR;
  const tile = Number.isFinite(tileSize) && tileSize > 0 ? tileSize : 0;
  const ring = Math.min(k.maxRingRadiusCss, Math.max(k.minRingRadiusCss, tile * k.ringRadiusTileRatio));
  out.ringRadiusCss = ring;
  out.glowRadiusCss = ring * k.glowRadiusPerRing;
  out.pingTravelRadiusCss = Math.max(ring * k.pingTravelPerRing, ring + k.pingMinTravelCss);
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

const SCRATCH: PlayerLocatorMetrics = { ringRadiusCss: 0, glowRadiusCss: 0, pingTravelRadiusCss: 0 };

export interface PlayerLocatorDrawInput {
  /** Cell centre (css px, the same space the marker is drawn in). */
  centerX: number;
  centerY: number;
  tileSize: number;
  /** The player's current rounded-square half extents (squash/stretch and breathing included) and corner radius. */
  coreHalfWidth: number;
  coreHalfHeight: number;
  coreCornerRadius: number;
  /** Lifecycle fade, 0..1. */
  alpha: number;
  timeMs: number;
  /** Start time of the running ping, or a negative number for none. */
  pingStartMs: number;
  reducedMotion: boolean;
}

/** Paints glow, ring, ping and the core keyline. Call BEFORE the player's own fill so the core stays on top. */
export const drawPlayerLocator = (g: LocatorGraphics, input: PlayerLocatorDrawInput): void => {
  const k = PLAYER_LOCATOR;
  const alpha = Math.max(0, Math.min(1, input.alpha));
  if (alpha <= 0) {
    return;
  }
  const m = resolvePlayerLocatorMetrics(input.tileSize, SCRATCH);
  const { centerX: cx, centerY: cy } = input;

  // 1. soft glow: equal-alpha concentric discs, stacked so the cumulative alpha at the ring is glowPeakAlpha.
  const perStep = 1 - ((1 - k.glowPeakAlpha) ** (1 / k.glowSteps));
  g.fillStyle(boardMaterial.player, perStep * alpha);
  for (let i = 0; i < k.glowSteps; i += 1) {
    const r = m.ringRadiusCss + ((m.glowRadiusCss - m.ringRadiusCss) * (1 - (i / k.glowSteps)));
    g.fillCircle(cx, cy, r);
  }

  // 2. crisp ring: dark keyline under the bright stroke.
  g.lineStyle(k.ringStrokeCss + k.ringKeylineExtraCss, boardMaterial.void, k.keylineAlpha * alpha);
  g.strokeCircle(cx, cy, m.ringRadiusCss);
  g.lineStyle(k.ringStrokeCss, boardMaterial.player, k.ringAlpha * alpha);
  g.strokeCircle(cx, cy, m.ringRadiusCss);

  // 3. find-me ping: expanding rings (never in reduced motion; the caller also never starts one).
  if (!input.reducedMotion && input.pingStartMs >= 0) {
    const elapsed = input.timeMs - input.pingStartMs;
    for (let i = 0; i < k.pingCount; i += 1) {
      const t = resolvePingRingProgress(elapsed, i);
      if (t < 0) {
        continue;
      }
      const eased = 1 - ((1 - t) * (1 - t));
      const radius = m.ringRadiusCss + ((m.pingTravelRadiusCss - m.ringRadiusCss) * eased);
      const fade = k.pingPeakAlpha * (1 - t) * alpha;
      g.lineStyle(k.pingStrokeCss + k.pingKeylineExtraCss, boardMaterial.void, fade * 0.7);
      g.strokeCircle(cx, cy, radius);
      g.lineStyle(k.pingStrokeCss, boardMaterial.playerEdge, fade);
      g.strokeCircle(cx, cy, radius);
    }
  }

  // 4. dark keyline hugging the core (stroke centred half a line-width outside the core edge).
  const w = k.coreKeylineCss;
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
