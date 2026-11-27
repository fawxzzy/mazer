/**
 * Shards in the play scene (H8 UI v1): the one object the scene talks to. It joins the run state
 * (legacyShardRun.ts), the board and HUD paint (shardSceneLayer.ts), the reusable coach mark
 * (coachMarkView.ts) and in-flow notice (legacyInFlowNoticeHost.ts), and the copy (legacyShardHint.ts).
 * MenuScene keeps only call sites; it builds this only while the hazard layer is on, so flag-off play
 * never constructs any of it.
 */
import type Phaser from 'phaser';
import { createLegacyInFlowNoticeHost, type LegacyInFlowNoticeHost } from '../legacy-runtime/legacyInFlowNoticeHost';
import { resolveLegacyHeaderControlFrame } from '../legacy-runtime/legacyHeaderControl';
import type { LegacyMazeSnapshot, LegacyPoint } from '../legacy-runtime/legacyMaze';
import {
  createLegacyShardRun,
  type LegacyShardArrival,
  type LegacyShardDiagnostics,
  type LegacyShardInstallOptions,
  type LegacyShardRun
} from '../legacy-runtime/legacyShardRun';
import {
  resolveShardFirstNotice,
  SHARD_COACH_LABEL,
  SHARD_HINT_KEYS,
  SHARD_UNLOCKED_NOTICE,
  type ShardNoticeCopy
} from '../legacy-runtime/legacyShardHint';
import { centerOfCell } from './boardTileBake';
import { CoachMarkView } from './coachMarkView';
import { SHARD_LOCKED_GOAL_BEACON_VISIBLE, SHARD_LOOK, type ShardPoint } from './shardLook';
import { ShardSceneLayer, type ShardBoardLayout, type ShardHudFrame } from './shardSceneLayer';
import { designTokens, phaserMaterialAliases } from '../theme/tokens';
import { LEGACY_GUIDE_ROWS, resolveLegacyGuideHazardRow } from '../legacy-runtime/legacyGuideContent';
import { DEFAULT_BOARD_TILE_STYLE } from './boardTileStyle';
import type { MechanicIconId } from './mechanicIcons';
import {
  estimateTextCardHeight,
  resolveTextCardCellRect,
  resolveTextCardMechanicCells,
  resolveTextCardPlacement,
  resolveTextCardWidth,
  type TextCardRect
} from './textCardPlacement';

/** How the scene should paint the end star this frame (null = the shard layer has no say: normal star). */
export interface ShardGoalMarker {
  /** Draw the goal beacon halo/ping (outward). Hidden while caged unless the toggle says otherwise. */
  readonly beacon: boolean;
  /** Multiplier on the star's opacity (dimmed while caged). */
  readonly opacity: number;
  /** The clock the star's spin reads: frozen at 0 while caged, then from the unlock (no snap). */
  readonly clockMs: number;
  /** True while caged: the star holds still (no spin, no blink pulse). */
  readonly still: boolean;
}

export interface ShardFrameInput {
  readonly nowMs: number;
  readonly reducedMotion: boolean;
  readonly layout: ShardBoardLayout;
  readonly goal: LegacyPoint | null;
  /** The player's cell, kept clear of the HUD chip with the end star. */
  readonly player?: LegacyPoint | null;
  /** The header lane; the HUD chip takes its free leading control slot. Null = no chip this frame. */
  readonly header: ShardHeaderInput | null;
  /** False while an overlay, menu or lifecycle lock owns the screen. */
  readonly hudVisible: boolean;
  readonly toScreen: (point: ShardPoint) => ShardPoint;
  readonly viewWidth: number;
  /** View height in CSS px (the notice keeps the shard and the star out of its bottom band too). */
  readonly viewHeight: number;
}

/** What the header control frame needs (legacyHeaderControl.ts), minus the slot: the chip always sits leading. */
export interface ShardHeaderInput {
  readonly width: number;
  readonly height: number;
  readonly hudHeight: number;
  readonly hudTop: number;
  readonly safeArea?: { left?: number; right?: number };
  readonly sizeScale?: number;
}

/** Pure: the HUD chip's frame in the leading header slot (the slot the old leaderboard icon left free). */
export const resolveShardHudFrame = (header: ShardHeaderInput | null): ShardHudFrame | null => {
  if (header === null) return null;
  const frame = resolveLegacyHeaderControlFrame({ ...header, placement: 'leading' });
  return { left: frame.left, top: frame.top, size: frame.height };
};

export interface ShardPlayPresenterOptions {
  readonly depth: number;
  readonly crisp?: (text: Phaser.GameObjects.Text) => void;
  readonly notices?: LegacyInFlowNoticeHost;
}

/** The coach ring round the first shard, as a share of the tile (just outside the gem's breath). */
export const SHARD_COACH_RING_OF_TILE = 0.72;

/**
 * The two shard cards wear the rich neon layout: the heading and icon are the Guide row's (no new copy), so the card,
 * the coach mark and the Guide name and draw the same thing.
 */
const SHARD_CARD_RICH: Readonly<Record<string, { heading: string; icon: MechanicIconId }>> = Object.freeze({
  [SHARD_HINT_KEYS.first]: { heading: resolveLegacyGuideHazardRow('shard').heading, icon: 'shard' },
  [SHARD_HINT_KEYS.unlocked]: { heading: LEGACY_GUIDE_ROWS.find((row) => row.icon.glyph === 'goal-star')?.heading ?? '', icon: 'goal' }
});

export class ShardPlayPresenter {
  private readonly run: LegacyShardRun = createLegacyShardRun();
  private readonly layer: ShardSceneLayer;
  private readonly coach: CoachMarkView;
  private readonly notices: LegacyInFlowNoticeHost;
  private hintRequested = false;
  private hintPending = false;
  private coachOn = false;
  private unlockNoticeShown = false;
  private noticesHeld = false;
  private lastCaged: boolean | null = null;
  private noticeTop = 0;
  private viewHeight = 0;
  private viewWidth = 0;
  private reducedMotion = false;
  /** Switch tiles and wrap mouths of the live maze (cards keep them in view). */
  private mechanicCells: LegacyPoint[] = [];

  constructor(scene: Phaser.Scene, options: ShardPlayPresenterOptions) {
    this.layer = new ShardSceneLayer(scene, { depth: options.depth, crisp: options.crisp });
    this.coach = new CoachMarkView(scene, { depth: options.depth, crisp: options.crisp });
    this.notices = options.notices ?? createLegacyInFlowNoticeHost();
  }

  /** Board-space objects for the zoom container (under the crisp cast). */
  get boardObjects(): Phaser.GameObjects.GameObject[] {
    return [this.layer.boardGraphics, this.coach.ringGraphics];
  }

  /** True while the end star is locked for play (the goal tile does not finish the level). */
  get goalLocked(): boolean {
    return this.run.goalLocked;
  }

  get active(): boolean {
    return this.run.active;
  }

  /**
   * The cell of an untaken shard while the star is locked: `offset` 0 is the next one to take, 1 the one after it; null
   * past the last shard or once the star is open. The first-time Shard card (legacyFirstTimeHost.ts) reads it before
   * the step's arrival is noted, to tell a pickup and to ring the shard after it.
   */
  untakenShardCell(offset = 0): LegacyPoint | null {
    const index = this.run.collected + offset;
    if (!this.run.goalLocked || offset < 0 || index >= this.run.count) {
      return null;
    }
    return { x: this.run.shardX(index), y: this.run.shardY(index) };
  }

  /** A new maze went live: place its shards (play only) and drop every moment of the last one. */
  install(maze: LegacyMazeSnapshot, options: LegacyShardInstallOptions, now?: () => number): void {
    this.run.install(maze, options, now);
    this.mechanicCells = resolveTextCardMechanicCells(maze);
    this.layer.reset();
    this.hintRequested = false;
    this.hintPending = false;
    this.coachOn = false;
    this.unlockNoticeShown = false;
    this.lastCaged = null;
    this.notices.close();
  }

  /**
   * Pause > Reset level: a new attempt at the same maze. Every shard goes back, the star locks again, and the hint,
   * the coach mark and the unlock notice close (the first-time hint does not come back: it was already shown).
   */
  restartAttempt(): void {
    this.run.restart();
    this.layer.reset();
    this.hintPending = false;
    this.coachOn = false;
    this.unlockNoticeShown = false;
    this.lastCaged = null;
    this.notices.close();
  }

  /**
   * While a first-time card is up or about to show (legacyFirstTimeHost.ts), the shard cards step aside so two text
   * cards never stack: turning the hold on closes an open shard card, and the unlock card waits until the hold ends
   * (the star stays open, so it still shows once).
   */
  holdNotices(held: boolean): void {
    if (held === this.noticesHeld) {
      return;
    }
    this.noticesHeld = held;
    if (held) {
      this.notices.close();
    }
  }

  /** The level start met shards for the first time: show the notice and the coach mark (once; the record says so). */
  requestFirstHint(): void {
    this.hintRequested = true;
    if (!this.run.active) {
      return;
    }
    this.coachOn = true;
    // Shown on the next frame, once the header frame says where "under the HUD" is.
    this.hintPending = true;
  }

  /** After the player lands on `point`. */
  arrive(point: LegacyPoint, nowMs: number): LegacyShardArrival {
    const index = this.run.collected;
    const arrival = this.run.noteArrival(point);
    if (arrival === null) {
      return null;
    }
    this.layer.noteCollected(index, { x: point.x, y: point.y }, nowMs);
    if (this.coachOn || this.hintPending || this.notices.isOpen(SHARD_HINT_KEYS.first)) {
      this.coachOn = false;
      this.hintPending = false;
      this.notices.close(SHARD_HINT_KEYS.first);
    }
    if (arrival === 'unlocked') {
      this.layer.noteUnlocked(nowMs);
    }
    return arrival;
  }

  goalMarker(nowMs: number, reducedMotion: boolean): ShardGoalMarker | null {
    const visual = this.layer.goalVisual(this.run, nowMs, reducedMotion);
    if (visual === null) {
      return null;
    }
    if (visual.caged) {
      return { beacon: SHARD_LOCKED_GOAL_BEACON_VISIBLE, opacity: SHARD_LOOK.cage.lockedStarOpacity, clockMs: 0, still: true };
    }
    return { beacon: true, opacity: 1, clockMs: visual.spinFromMs === null ? nowMs : Math.max(0, nowMs - visual.spinFromMs), still: false };
  }

  /** Paints this frame. Returns true when the end star's look changed (the scene redraws its dynamic board). */
  frame(input: ShardFrameInput): boolean {
    this.reducedMotion = input.reducedMotion;
    this.viewHeight = input.viewHeight;
    this.viewWidth = input.viewWidth;
    // The notice is DOM over the canvas: it steps aside with the chip and the coach mark while a pause, the Guide or
    // the menu owns the screen, and comes back when play does.
    this.notices.setHidden(!input.hudVisible);
    if (!this.run.active || input.goal === null) {
      this.layer.drawBoard(null, input.layout, { x: 0, y: 0 }, input.nowMs, input.reducedMotion);
      this.layer.drawHud(null, null, input.nowMs, input.reducedMotion, false);
      this.coach.draw(null);
      return false;
    }
    this.layer.drawBoard(this.run, input.layout, input.goal, input.nowMs, input.reducedMotion);
    const keepClear: ShardPoint[] = [];
    for (const cell of [input.goal, input.player ?? null]) {
      const p = cell === null ? null : this.cellScreen(input, cell.x, cell.y);
      if (p !== null) keepClear.push(p);
    }
    const hud = resolveShardHudFrame(input.header);
    this.layer.drawHud(this.run, hud, input.nowMs, input.reducedMotion, input.hudVisible, keepClear);
    if (hud !== null) {
      this.noticeTop = hud.top + hud.size + designTokens.spacingPx[1]!;
    }
    // The coach mark first, so the card can keep clear of its pill too.
    this.drawCoach(input);
    if (this.hintPending && hud !== null && !this.noticesHeld) {
      this.hintPending = false;
      const keepClear = [
        this.cellRect(input, input.player ?? null),
        this.cellRect(input, input.goal),
        this.cellRect(input, { x: this.run.shardX(0), y: this.run.shardY(0) }),
        this.coach.pillRect ?? null,
        ...this.mechanicCells.map((cell) => this.cellRect(input, cell))
      ];
      this.showNotice(SHARD_HINT_KEYS.first, resolveShardFirstNotice(this.run.count), keepClear, () => {
        this.coachOn = false;
      });
    }
    const visual = this.layer.goalVisual(this.run, input.nowMs, input.reducedMotion);
    if (visual !== null && visual.noticeDue && !this.unlockNoticeShown && !this.noticesHeld) {
      this.unlockNoticeShown = true;
      const keepClear = [
        this.cellRect(input, input.player ?? null),
        this.cellRect(input, input.goal),
        ...this.mechanicCells.map((cell) => this.cellRect(input, cell))
      ];
      this.showNotice(SHARD_HINT_KEYS.unlocked, SHARD_UNLOCKED_NOTICE, keepClear);
    }
    const caged = visual?.caged ?? false;
    const changed = this.lastCaged !== null && this.lastCaged !== caged;
    this.lastCaged = caged;
    return changed;
  }

  private drawCoach(input: ShardFrameInput): void {
    const layout = input.layout;
    if (!this.coachOn || !input.hudVisible || this.run.collected > 0 || layout.alpha <= 0 || layout.tileSize <= 0) {
      this.coach.draw(null);
      return;
    }
    const [x, y] = centerOfCell(
      { x: this.run.shardX(0), y: this.run.shardY(0) },
      layout.tileSize,
      layout.backingScale,
      layout.originX,
      layout.originY
    );
    this.coach.draw({
      anchor: { x, y },
      ringRadius: layout.tileSize * SHARD_COACH_RING_OF_TILE,
      dotRadius: Math.max(SHARD_LOOK.cage.minDotRadiusCss, layout.tileSize * SHARD_LOOK.cage.dotRadiusOfTile),
      label: SHARD_COACH_LABEL,
      accent: phaserMaterialAliases['semantic.reward'],
      nowMs: input.nowMs,
      reducedMotion: input.reducedMotion,
      alpha: Math.min(1, layout.alpha),
      toScreen: input.toScreen,
      minTop: this.noticeTop,
      viewWidth: input.viewWidth,
      icon: 'shard',
      iconEnv: { boardTileStyle: DEFAULT_BOARD_TILE_STYLE, devicePixelRatio: layout.backingScale }
    });
  }

  private cellScreen(input: ShardFrameInput, cellX: number, cellY: number): ShardPoint | null {
    const layout = input.layout;
    if (layout.tileSize <= 0) {
      return null;
    }
    const [x, y] = centerOfCell({ x: cellX, y: cellY }, layout.tileSize, layout.backingScale, layout.originX, layout.originY);
    return input.toScreen({ x, y });
  }

  /** A cell's keep-clear rect on screen (null = off screen or no layout). */
  private cellRect(input: ShardFrameInput, cell: LegacyPoint | null): TextCardRect | null {
    if (cell === null) return null;
    const centre = this.cellScreen(input, cell.x, cell.y);
    const next = this.cellScreen(input, cell.x + 1, cell.y);
    if (centre === null || next === null) return null;
    return resolveTextCardCellRect(centre, Math.abs(next.x - centre.x));
  }

  private showNotice(key: string, copy: ShardNoticeCopy, keepClear: readonly (TextCardRect | null)[], onDismiss?: () => void): void {
    const rich = SHARD_CARD_RICH[key];
    const cardWidth = resolveTextCardWidth(this.viewWidth);
    const place = resolveTextCardPlacement({
      viewWidth: this.viewWidth,
      viewHeight: this.viewHeight,
      topMin: this.noticeTop,
      bottomInset: designTokens.spacingPx[3]!,
      cardWidth,
      cardHeight: estimateTextCardHeight({ cardWidth, bodyChars: copy.body.length, heading: rich !== undefined, action: copy.actionLabel !== undefined }),
      keepClear
    });
    this.notices.show(key, {
      title: copy.title,
      body: copy.body,
      heading: rich?.heading,
      icon: rich?.icon,
      tone: copy.tone,
      actionLabel: copy.actionLabel,
      autoDismissMs: copy.autoDismissMs,
      topPx: place.topPx,
      bottomPx: place.bottomPx,
      reducedMotion: this.reducedMotion,
      onDismiss: onDismiss ? () => onDismiss() : undefined
    });
  }

  /** True while something moves, so the scene keeps its frame loop busy. */
  needsFrame(nowMs: number, reducedMotion: boolean): boolean {
    return this.run.active && (this.coachOn || this.layer.isAnimating(this.run, nowMs, reducedMotion));
  }

  /** The level ended (goal reached, reset, mode change): close the hint and the coach. */
  levelEnded(): void {
    this.coachOn = false;
    this.hintPending = false;
    this.notices.close(SHARD_HINT_KEYS.first);
  }

  describe(): LegacyShardDiagnostics & { hintRequested: boolean; coach: boolean; unlockedAtMs: number | null } {
    return { ...this.run.describe(), hintRequested: this.hintRequested, coach: this.coachOn, unlockedAtMs: this.layer.unlockedAtMs };
  }

  destroy(): void {
    this.notices.destroy();
    this.layer.destroy();
    this.coach.destroy();
  }
}
