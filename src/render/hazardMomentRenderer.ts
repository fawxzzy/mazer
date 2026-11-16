/**
 * Draws the hazard intro card (HAZ-008) and the tier pip (PROG-007), slice H6. Non-modal: a small
 * banner over the board (the board is full-bleed, there is no free lane), never an overlay, so the
 * one-active-overlay rule and input are untouched. The scene builds this view only while the hazard
 * layer is on (lazily, on the first moment), so flag-off play creates no objects.
 *
 * The frame math is pure (`resolveHazardMomentFrame`) and whole-pixel (Phaser CANVAS + roundPixels).
 * The card sits in the half of the board away from the player so it never covers where they start,
 * and fades out over its last 300 ms (instantly under reduced motion).
 */
import Phaser from 'phaser';
import { drawGuideHazardGlyph, resolveGuideHazardAccent, type GuideHazardGlyph } from './guideHazardGlyph';

export interface HazardMomentCardContent {
  readonly glyph: GuideHazardGlyph;
  readonly heading: string;
  readonly text: string;
}

export interface HazardMomentPipContent {
  readonly tier: number;
  readonly label: string;
  readonly glyph: GuideHazardGlyph;
}

export interface HazardMomentFrameInput {
  readonly viewWidth: number;
  readonly viewHeight: number;
  readonly safeTop: number;
  readonly footerY: number;
  /** Screen y of the player, to pick the half of the board away from them. */
  readonly playerY: number;
  readonly cardHeight: number;
  readonly pipHeight: number;
}

export interface HazardMomentFrame {
  readonly side: 'top' | 'bottom';
  readonly cardLeft: number;
  readonly cardTop: number;
  readonly cardWidth: number;
  readonly pipTop: number;
}

export const HAZARD_MOMENT_SIZES = Object.freeze({
  maxCardWidth: 340,
  sideMargin: 16,
  /** Clear of the settings button at the top. */
  topInset: 56,
  /** Clear of the footer chip line at the bottom. */
  bottomInset: 34,
  padX: 14,
  padY: 10,
  iconSize: 26,
  iconGap: 10,
  headingSize: 15,
  textSize: 13,
  lineGap: 4,
  pipGap: 8,
  radius: 10,
  fadeMs: 300
});

/** Whole-pixel frame for the card and the pip, in the half of the view away from the player. */
export const resolveHazardMomentFrame = (input: HazardMomentFrameInput): HazardMomentFrame => {
  const sizes = HAZARD_MOMENT_SIZES;
  const cardWidth = Math.round(Math.max(120, Math.min(sizes.maxCardWidth, input.viewWidth - sizes.sideMargin * 2)));
  const cardLeft = Math.round((input.viewWidth - cardWidth) / 2);
  const side: 'top' | 'bottom' = input.playerY > input.viewHeight / 2 ? 'top' : 'bottom';
  const cardHeight = Math.max(0, Math.round(input.cardHeight));
  const pipHeight = Math.max(0, Math.round(input.pipHeight));
  if (side === 'top') {
    const cardTop = Math.round(input.safeTop + sizes.topInset);
    const pipTop = cardHeight > 0 ? cardTop + cardHeight + sizes.pipGap : cardTop;
    return { side, cardLeft, cardTop, cardWidth, pipTop };
  }
  const bottom = Math.round(input.footerY - sizes.bottomInset);
  const pipTop = bottom - pipHeight;
  const cardTop = (pipHeight > 0 ? pipTop - sizes.pipGap : bottom) - cardHeight;
  return { side, cardLeft, cardTop, cardWidth, pipTop };
};

/** Alpha for a moment shown at `shownAtMs` lasting `durationMs`: 1, then a linear fade over the last fadeMs. */
export const resolveHazardMomentAlpha = (
  nowMs: number,
  shownAtMs: number,
  durationMs: number,
  reducedMotion: boolean
): number => {
  const remaining = shownAtMs + durationMs - nowMs;
  if (remaining <= 0) {
    return 0;
  }
  if (reducedMotion || remaining >= HAZARD_MOMENT_SIZES.fadeMs) {
    return 1;
  }
  return remaining / HAZARD_MOMENT_SIZES.fadeMs;
};

export interface HazardMomentViewOptions {
  readonly depth: number;
  readonly fontFamily: string;
  readonly crisp: (text: Phaser.GameObjects.Text) => Phaser.GameObjects.Text;
}

export interface HazardMomentViewFrameInput extends Omit<HazardMomentFrameInput, 'cardHeight' | 'pipHeight'> {
  readonly nowMs: number;
  readonly visible: boolean;
  readonly reducedMotion: boolean;
}

interface ShownMoment<T> {
  readonly content: T;
  /** Set on the first frame the moment is actually visible (after the maze build-out), so its time is real screen time. */
  shownAtMs: number | null;
  readonly durationMs: number;
}

export class HazardMomentView {
  private readonly graphics: Phaser.GameObjects.Graphics;
  private readonly heading: Phaser.GameObjects.Text;
  private readonly body: Phaser.GameObjects.Text;
  private readonly pipText: Phaser.GameObjects.Text;
  private card: ShownMoment<HazardMomentCardContent> | null = null;
  private pip: ShownMoment<HazardMomentPipContent> | null = null;

  constructor(scene: Phaser.Scene, options: HazardMomentViewOptions) {
    const sizes = HAZARD_MOMENT_SIZES;
    this.graphics = scene.add.graphics().setDepth(options.depth).setVisible(false);
    const text = (size: number, color: string): Phaser.GameObjects.Text => options.crisp(scene.add.text(0, 0, '', {
      fontFamily: options.fontFamily,
      fontSize: `${size}px`,
      color
    })).setOrigin(0, 0).setDepth(options.depth + 1).setVisible(false);
    this.heading = text(sizes.headingSize, '#ffffff');
    this.body = text(sizes.textSize, '#c9d6e8');
    this.pipText = text(sizes.textSize, '#ffffff');
  }

  /** Queues a card. The text is set here, so the card is drawn on the very next visible frame. */
  showCard(content: HazardMomentCardContent, durationMs: number): void {
    this.card = { content, shownAtMs: null, durationMs };
    this.heading.setText(content.heading);
    this.body.setText(content.text);
  }

  showPip(content: HazardMomentPipContent, durationMs: number): void {
    this.pip = { content, shownAtMs: null, durationMs };
    this.pipText.setText(`Tier ${content.tier}  ${content.label}`);
  }

  dismissCard(): void {
    this.card = null;
  }

  clear(): void {
    this.card = null;
    this.pip = null;
    this.hideAll();
  }

  isShowingCard(): boolean {
    return this.card !== null;
  }

  frame(input: HazardMomentViewFrameInput): void {
    const sizes = HAZARD_MOMENT_SIZES;
    if (!input.visible || (this.card === null && this.pip === null)) {
      this.hideAll();
      return;
    }
    if (this.card && this.card.shownAtMs === null) this.card.shownAtMs = input.nowMs;
    if (this.pip && this.pip.shownAtMs === null) this.pip.shownAtMs = input.nowMs;
    const cardAlpha = this.card
      ? resolveHazardMomentAlpha(input.nowMs, this.card.shownAtMs ?? input.nowMs, this.card.durationMs, input.reducedMotion)
      : 0;
    const pipAlpha = this.pip
      ? resolveHazardMomentAlpha(input.nowMs, this.pip.shownAtMs ?? input.nowMs, this.pip.durationMs, input.reducedMotion)
      : 0;
    if (cardAlpha === 0) this.card = null;
    if (pipAlpha === 0) this.pip = null;
    if (this.card === null && this.pip === null) {
      this.hideAll();
      return;
    }
    const cardWidthGuess = Math.min(sizes.maxCardWidth, input.viewWidth - sizes.sideMargin * 2);
    const textLeftOffset = sizes.padX + sizes.iconSize + sizes.iconGap;
    const wrap = Math.max(40, cardWidthGuess - textLeftOffset - sizes.padX);
    this.body.setWordWrapWidth(wrap, true);
    const cardHeight = this.card
      ? Math.round(Math.max(sizes.iconSize, this.heading.height + sizes.lineGap + this.body.height) + sizes.padY * 2)
      : 0;
    const pipHeight = this.pip ? Math.round(this.pipText.height + 10) : 0;
    const frame = resolveHazardMomentFrame({ ...input, cardHeight, pipHeight });
    const g = this.graphics;
    g.clear().setVisible(true);
    if (this.card) {
      const accent = resolveGuideHazardAccent(this.card.content.glyph);
      g.fillStyle(0x070b14, 0.9 * cardAlpha);
      g.fillRoundedRect(frame.cardLeft, frame.cardTop, frame.cardWidth, cardHeight, sizes.radius);
      g.lineStyle(2, accent, 0.9 * cardAlpha);
      g.strokeRoundedRect(frame.cardLeft, frame.cardTop, frame.cardWidth, cardHeight, sizes.radius);
      const iconX = frame.cardLeft + sizes.padX + sizes.iconSize / 2;
      const iconY = Math.round(frame.cardTop + cardHeight / 2);
      g.fillStyle(accent, 0.16 * cardAlpha);
      g.fillCircle(iconX, iconY, sizes.iconSize / 2);
      g.lineStyle(1.2, accent, 0.7 * cardAlpha);
      g.strokeCircle(iconX, iconY, sizes.iconSize / 2);
      drawGuideHazardGlyph(g, this.card.content.glyph, iconX, iconY, (sizes.iconSize / 2) * 0.9, accent);
      const textLeft = frame.cardLeft + textLeftOffset;
      this.heading.setPosition(textLeft, frame.cardTop + sizes.padY).setAlpha(cardAlpha).setVisible(true);
      this.body.setPosition(textLeft, Math.round(frame.cardTop + sizes.padY + this.heading.height + sizes.lineGap))
        .setAlpha(cardAlpha).setVisible(true);
    } else {
      this.heading.setVisible(false);
      this.body.setVisible(false);
    }
    if (this.pip) {
      const accent = resolveGuideHazardAccent(this.pip.content.glyph);
      const dotGap = 7;
      const dots = Math.max(1, Math.min(12, this.pip.content.tier));
      const dotsWidth = dots * dotGap;
      const pillWidth = Math.round(10 + dotsWidth + 6 + this.pipText.width + 12);
      const pillLeft = Math.round((input.viewWidth - pillWidth) / 2);
      g.fillStyle(0x070b14, 0.88 * pipAlpha);
      g.fillRoundedRect(pillLeft, frame.pipTop, pillWidth, pipHeight, Math.floor(pipHeight / 2));
      g.lineStyle(1.5, accent, 0.85 * pipAlpha);
      g.strokeRoundedRect(pillLeft, frame.pipTop, pillWidth, pipHeight, Math.floor(pipHeight / 2));
      const dotY = Math.round(frame.pipTop + pipHeight / 2);
      for (let index = 0; index < dots; index += 1) {
        g.fillStyle(accent, (index === dots - 1 ? 1 : 0.5) * pipAlpha);
        g.fillCircle(pillLeft + 12 + index * dotGap, dotY, index === dots - 1 ? 3 : 2);
      }
      this.pipText.setPosition(pillLeft + 10 + dotsWidth + 6, frame.pipTop + 5).setAlpha(pipAlpha).setVisible(true);
    } else {
      this.pipText.setVisible(false);
    }
  }

  destroy(): void {
    this.graphics.destroy();
    this.heading.destroy();
    this.body.destroy();
    this.pipText.destroy();
  }

  private hideAll(): void {
    this.graphics.clear().setVisible(false);
    this.heading.setVisible(false);
    this.body.setVisible(false);
    this.pipText.setVisible(false);
  }
}
