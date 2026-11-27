/**
 * Shard scene layer (H8 UI v1): draws what src/legacy-runtime/legacyShardRun.ts decides, in the live
 * play board. Built only while the hazard layer is on; the scene keeps `null` otherwise.
 *
 *  - Board (`boardGraphics`, a child of the board zoom container under the crisp cast): the sharp gems
 *    in order (next breathes, later ones dimmer), the collect pop, the dotted cage ring that turns
 *    round the still, dimmed end star, the inward star ping, the unlock gather and the burst.
 *  - HUD (top-left corner chip, the Star-ring family): a mini star in a segmented ring that fills one
 *    segment per shard, one dotted outline per missing gem that fills in when taken, and the n / N
 *    counter.
 *
 * The first-time coach mark is NOT drawn here: it is the reusable CoachMarkView (coachMarkView.ts), fed
 * the first gem's position and the copy from legacyShardHint.ts.
 *
 * Numbers and pure geometry live in shardLook.ts; this file only paints. The end star itself stays in
 * drawBoardMarkers (the scene dims it and holds its spin from `goalVisual`).
 */
import Phaser from 'phaser';
import { centerOfCell } from './boardTileBake';
import { boardMaterial } from './boardTileStyle';
import { resolveStarPoints } from './endpointTileSkins';
import { getTypeScaleStep, resolveTypeFaceStack } from './typeScale';
import { designTokens, phaserMaterialAliases } from '../theme/tokens';
import {
  drawShardCageRing,
  drawShardGem,
  resolveShardCageDotRadius,
  resolveShardBreathScale,
  resolveShardCageRotation,
  resolveShardCollectPop,
  resolveShardGatherFlight,
  resolveShardGemGeometry,
  resolveShardGemOutlineDots,
  resolveShardGoalVisual,
  resolveShardHudModel,
  resolveShardInwardPing,
  SHARD_LOOK,
  type ShardGoalVisual,
  type ShardPoint
} from './shardLook';

/** What the layer reads from the run each frame (LegacyShardRun satisfies it). */
export interface ShardLayerSource {
  readonly count: number;
  readonly collected: number;
  readonly active: boolean;
  shardX(index: number): number;
  shardY(index: number): number;
}

export interface ShardBoardLayout {
  readonly originX: number;
  readonly originY: number;
  readonly tileSize: number;
  readonly backingScale: number;
  /** Build/deconstruct fade of the cast, 0..1. */
  readonly alpha: number;
}

export interface ShardHudFrame {
  /** The leading header control slot (top-left): the chip sits in it, on its centre line. */
  readonly left: number;
  readonly top: number;
  readonly size: number;
}

export interface ShardSceneLayerOptions {
  readonly depth: number;
  readonly crisp?: (text: Phaser.GameObjects.Text) => void;
}

const COLOR = phaserMaterialAliases;
const CSS = designTokens.color;
const SPACE = designTokens.spacingPx;
const HAIRLINE = designTokens.strokePx.hairline;

export const SHARD_HUD = Object.freeze({
  padX: SPACE[2]!,
  gap: SPACE[1]!,
  pipGap: SPACE[0]!,
  ringOfSize: 0.56,
  gemHalfHeightOfSize: 0.2,
  counter: getTypeScaleStep('control'),
  /** The chip steps back to this alpha while the end star or the player sits under it (it never hides them). */
  occludedAlpha: 0.38,
  /** How close (CSS px) to the chip a kept-clear point may come before it steps back. */
  clearMarginPx: SPACE[1]!
});

export interface ShardHudRect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/** Pure: the chip's alpha. Steps back when any kept-clear screen point sits on (or next to) the chip. */
export const resolveShardHudAlpha = (rect: ShardHudRect, keepClear: readonly ShardPoint[], marginPx: number = SHARD_HUD.clearMarginPx): number => {
  const hit = keepClear.some((p) => (
    p.x >= rect.left - marginPx && p.x <= rect.left + rect.width + marginPx
    && p.y >= rect.top - marginPx && p.y <= rect.top + rect.height + marginPx
  ));
  return hit ? SHARD_HUD.occludedAlpha : 1;
};

export class ShardSceneLayer {
  readonly boardGraphics: Phaser.GameObjects.Graphics;
  private readonly hudGraphics: Phaser.GameObjects.Graphics;
  private readonly counterText: Phaser.GameObjects.Text;
  private unlockAtMs: number | null = null;
  private collectAt: { index: number; atMs: number } | null = null;
  private lastCollectedCell: ShardPoint | null = null;

  constructor(scene: Phaser.Scene, options: ShardSceneLayerOptions) {
    this.boardGraphics = scene.add.graphics();
    this.hudGraphics = scene.add.graphics().setDepth(options.depth).setScrollFactor(0);
    this.counterText = scene.add.text(0, 0, '', {
      color: CSS['text.primary'],
      fontFamily: resolveTypeFaceStack(SHARD_HUD.counter.face),
      fontSize: `${SHARD_HUD.counter.sizePx}px`,
      fontStyle: String(SHARD_HUD.counter.weight)
    }).setOrigin(0, 0.5).setDepth(options.depth + 1).setScrollFactor(0).setVisible(false);
    options.crisp?.(this.counterText);
  }

  /** A new maze (or a reset): no unlock, no pop. */
  reset(): void {
    this.unlockAtMs = null;
    this.collectAt = null;
    this.lastCollectedCell = null;
  }

  noteCollected(index: number, cell: ShardPoint, nowMs: number): void {
    this.collectAt = { index, atMs: nowMs };
    this.lastCollectedCell = cell;
  }

  noteUnlocked(nowMs: number): void {
    this.unlockAtMs = nowMs;
  }

  get unlockedAtMs(): number | null {
    return this.unlockAtMs;
  }

  /** The star's visual state (caged, gather, burst, open). Inactive runs read as open. */
  goalVisual(source: ShardLayerSource | null, nowMs: number, reducedMotion: boolean): ShardGoalVisual | null {
    if (source === null || !source.active) return null;
    return resolveShardGoalVisual(this.unlockAtMs, nowMs, source.count, reducedMotion);
  }

  /** True while something on the board moves, so the scene keeps drawing frames. */
  isAnimating(source: ShardLayerSource | null, nowMs: number, reducedMotion: boolean): boolean {
    const visual = this.goalVisual(source, nowMs, reducedMotion);
    if (visual === null) return false;
    if (!reducedMotion) return visual.phase !== 'open' || (source?.collected ?? 0) < (source?.count ?? 0);
    return visual.phase === 'burst' || (this.collectAt !== null && nowMs - this.collectAt.atMs < SHARD_LOOK.collect.popMs);
  }

  drawBoard(source: ShardLayerSource | null, layout: ShardBoardLayout, goal: ShardPoint, nowMs: number, reducedMotion: boolean): void {
    const g = this.boardGraphics;
    g.clear();
    if (source === null || !source.active || layout.alpha <= 0 || layout.tileSize <= 0) {
      g.setVisible(false);
      return;
    }
    g.setVisible(true);
    const tile = layout.tileSize;
    const centre = (x: number, y: number): ShardPoint => {
      const [cx, cy] = centerOfCell({ x, y }, tile, layout.backingScale, layout.originX, layout.originY);
      return { x: cx, y: cy };
    };
    const fade = Math.min(1, layout.alpha);
    const hh = tile * SHARD_LOOK.gem.halfHeightOfTile;
    const hw = tile * SHARD_LOOK.gem.halfWidthOfTile;
    // Gems still on the board, in order: the next one breathes, later ones sit back.
    for (let index = source.collected; index < source.count; index += 1) {
      const p = centre(source.shardX(index), source.shardY(index));
      const next = index === source.collected;
      const scale = next ? resolveShardBreathScale(nowMs, reducedMotion) : 1;
      drawShardGem(g, p.x, p.y, hh * scale, hw * scale, fade * (next ? 1 : SHARD_LOOK.gem.laterAlpha), HAIRLINE);
    }
    // Collect pop on the gem just taken.
    if (this.collectAt !== null && this.unlockAtMs === null) {
      const pop = resolveShardCollectPop(nowMs - this.collectAt.atMs, reducedMotion);
      if (pop !== null) {
        const p = centre(source.shardX(this.collectAt.index), source.shardY(this.collectAt.index));
        drawShardGem(g, p.x, p.y, hh * pop.scale, hw * pop.scale, fade * pop.alpha, HAIRLINE);
      }
    }
    const star = centre(goal.x, goal.y);
    const visual = resolveShardGoalVisual(this.unlockAtMs, nowMs, source.count, reducedMotion);
    if (visual.cageAlpha > 0) {
      const rotation = resolveShardCageRotation(nowMs, reducedMotion);
      const radius = tile * SHARD_LOOK.cage.radiusOfTile * (visual.phase === 'burst' && visual.burst !== null ? 1 + (visual.burst * 0.25) : 1);
      this.drawDottedRing(star, radius, SHARD_LOOK.cage.dots, tile, rotation, COLOR['line.active'], fade * SHARD_LOOK.cage.alpha * visual.cageAlpha);
    }
    if (visual.phase === 'locked') {
      const ping = resolveShardInwardPing(nowMs, tile, reducedMotion);
      if (ping !== null) {
        const pts = resolveStarPoints(star.x, star.y, ping.radius, ping.radius * SHARD_LOOK.inwardPing.innerShare, 5, 0);
        g.lineStyle(SHARD_LOOK.inwardPing.strokeCss, boardMaterial.goal, fade * ping.alpha);
        g.beginPath();
        g.moveTo(pts[0]!, pts[1]!);
        for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i]!, pts[i + 1]!);
        g.closePath();
        g.strokePath();
      }
    }
    if (this.unlockAtMs !== null && !reducedMotion) {
      const since = nowMs - this.unlockAtMs;
      const from = this.lastCollectedCell ? centre(this.lastCollectedCell.x, this.lastCollectedCell.y) : star;
      for (let index = 0; index < source.count; index += 1) {
        const flight = resolveShardGatherFlight(index, source.count, since, from, star);
        if (flight !== null) drawShardGem(g, flight.x, flight.y, hh * flight.scale, hw * flight.scale, fade * flight.alpha, HAIRLINE);
      }
      if (visual.burst !== null) this.drawBurst(star, tile, visual.burst, fade);
    }
  }

  private drawDottedRing(c: ShardPoint, radius: number, dots: number, tile: number, rotation: number, color: number, alpha: number): void {
    drawShardCageRing(this.boardGraphics, c.x, c.y, radius, dots, resolveShardCageDotRadius(tile), rotation, color, alpha);
  }

  private drawBurst(c: ShardPoint, tile: number, t: number, fade: number): void {
    const g = this.boardGraphics;
    const k = SHARD_LOOK.burst;
    const travel = tile * k.travelOfTile * (1 - ((1 - t) ** 3));
    const alpha = fade * (1 - t);
    const r = tile * k.sparkRadiusOfTile * (1 - (t * 0.5));
    for (let i = 0; i < k.sparks; i += 1) {
      const a = (-Math.PI / 2) + ((i / k.sparks) * Math.PI * 2);
      const sx = c.x + (Math.cos(a) * travel);
      const sy = c.y + (Math.sin(a) * travel);
      const pts = resolveStarPoints(sx, sy, r, r * 0.26, 4, 0);
      g.fillStyle(i % 2 === 0 ? COLOR['semantic.reward'] : COLOR['text.primary'], alpha);
      g.fillPoints(Array.from({ length: pts.length / 2 }, (_, j) => ({ x: pts[j * 2]!, y: pts[(j * 2) + 1]! })), true);
    }
    // One gold flash ring at the star, gone by half-way.
    if (t < 0.5) {
      g.lineStyle(SHARD_LOOK.inwardPing.strokeCss, COLOR['semantic.reward'], alpha * (1 - (t * 2)));
      g.strokeCircle(c.x, c.y, tile * (0.4 + (t * 0.8)));
    }
  }

  /**
   * The top-left chip. Hidden when `visible` is false (overlays, menus, lifecycle locks). Steps back (alpha) while
   * any `keepClear` screen point (the end star, the player) sits under it.
   */
  drawHud(
    source: ShardLayerSource | null,
    frame: ShardHudFrame | null,
    nowMs: number,
    reducedMotion: boolean,
    visible: boolean,
    keepClear: readonly ShardPoint[] = []
  ): void {
    const g = this.hudGraphics;
    g.clear();
    const show = visible && source !== null && source.active && frame !== null;
    this.counterText.setVisible(false);
    if (!show || source === null || frame === null) return;
    const size = frame.size;
    const model = resolveShardHudModel(source.count, source.collected);
    const visual = resolveShardGoalVisual(this.unlockAtMs, nowMs, source.count, reducedMotion);
    this.counterText.setText(model.label);
    const ring = Math.round(size * SHARD_HUD.ringOfSize);
    const gemHh = Math.round(size * SHARD_HUD.gemHalfHeightOfSize);
    const gemHw = Math.max(2, Math.round(gemHh * (SHARD_LOOK.gem.halfWidthOfTile / SHARD_LOOK.gem.halfHeightOfTile)));
    const pips = model.pips ?? [];
    const pipsWidth = pips.length > 0 ? (pips.length * gemHw * 2) + ((pips.length - 1) * SHARD_HUD.pipGap) : 0;
    const textWidth = Math.ceil(this.counterText.width);
    const width = SHARD_HUD.padX + ring + SHARD_HUD.gap + (pipsWidth > 0 ? pipsWidth + SHARD_HUD.gap : 0) + textWidth + SHARD_HUD.padX;
    const left = Math.round(frame.left);
    const top = Math.round(frame.top);
    const cy = top + (size / 2);
    const chipAlpha = resolveShardHudAlpha({ left, top, width, height: size }, keepClear);
    g.setAlpha(chipAlpha);
    this.counterText.setAlpha(chipAlpha);
    // Chip body: the kit's panel at 92%, hairline line.normal, fully round.
    g.fillStyle(COLOR['bg.panel'], 0.92);
    g.fillRoundedRect(left, top, width, size, size / 2);
    g.lineStyle(HAIRLINE, COLOR['line.normal'], 1);
    g.strokeRoundedRect(left + 0.5, top + 0.5, width - 1, size - 1, (size - 1) / 2);
    // Star ring: one arc segment per shard (a continuous fill past the pip cap), round a mini end star.
    const rcx = left + SHARD_HUD.padX + (ring / 2);
    const rr = (ring / 2) - 1.5;
    const segments = model.pips === null ? 1 : source.count;
    const gapRad = segments > 1 ? 0.28 : 0;
    const taken = Math.min(source.collected, source.count);
    for (let i = 0; i < segments; i += 1) {
      const a0 = (-Math.PI / 2) + ((i / segments) * Math.PI * 2) + (gapRad / 2);
      const a1 = (-Math.PI / 2) + (((i + 1) / segments) * Math.PI * 2) - (gapRad / 2);
      g.lineStyle(designTokens.strokePx.normal, COLOR['line.normal'], 1);
      g.beginPath();
      g.arc(rcx, cy, rr, a0, a1, false);
      g.strokePath();
    }
    if (taken > 0) {
      g.lineStyle(designTokens.strokePx.normal, boardMaterial.goal, 1);
      if (model.pips === null) {
        g.beginPath();
        g.arc(rcx, cy, rr, -Math.PI / 2, (-Math.PI / 2) + ((taken / source.count) * Math.PI * 2), false);
        g.strokePath();
      } else {
        for (let i = 0; i < taken; i += 1) {
          const a0 = (-Math.PI / 2) + ((i / segments) * Math.PI * 2) + (gapRad / 2);
          const a1 = (-Math.PI / 2) + (((i + 1) / segments) * Math.PI * 2) - (gapRad / 2);
          g.beginPath();
          g.arc(rcx, cy, rr, a0, a1, false);
          g.strokePath();
        }
      }
    }
    const starR = rr * 0.62;
    const starPts = resolveStarPoints(rcx, cy + (starR * 0.08), starR, starR * 0.46, 5, 0);
    g.fillStyle(boardMaterial.goal, visual.caged ? SHARD_LOOK.cage.lockedStarOpacity : 1);
    g.fillPoints(Array.from({ length: starPts.length / 2 }, (_, j) => ({ x: starPts[j * 2]!, y: starPts[(j * 2) + 1]! })), true);
    // Gem slots: a dotted outline per missing gem, a full gem per taken one.
    let x = left + SHARD_HUD.padX + ring + SHARD_HUD.gap;
    for (const filled of pips) {
      const gx = x + gemHw;
      if (filled) {
        drawShardGem(g, gx, cy, gemHh, gemHw, 1, HAIRLINE);
      } else {
        g.fillStyle(COLOR['text.muted'], 1);
        for (const dot of resolveShardGemOutlineDots(resolveShardGemGeometry(gx, cy, gemHh, gemHw), 3)) {
          g.fillCircle(dot.x, dot.y, 0.9);
        }
      }
      x += (gemHw * 2) + SHARD_HUD.pipGap;
    }
    if (pips.length > 0) x += SHARD_HUD.gap - SHARD_HUD.pipGap;
    this.counterText.setPosition(Math.round(x), Math.round(cy)).setVisible(true);
  }

  setHudHidden(): void {
    this.hudGraphics.clear();
    this.counterText.setVisible(false);
  }

  destroy(): void {
    this.boardGraphics.destroy();
    this.hudGraphics.destroy();
    this.counterText.destroy();
  }
}
