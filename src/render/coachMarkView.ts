/**
 * Coach mark: a reusable first-time pointer at one spot on the board. A pulsing dotted ring round the
 * spot (board space, so it tracks the tile at any zoom) and a small label pill beside it (screen space,
 * so the text stays a readable caption size). No copy lives here: the caller passes the label.
 *
 * First user: the shard first-time hint (legacyShardHint.ts). The planned first-time card system can
 * reuse it unchanged: give it an anchor, a label, an accent and whether to show it.
 *
 * Skin: the pill wears the neon edge text skin (pick B, 2026-11-27; src/ui/skin/neonTextSkin.ts): an opaque void
 * fill, faint wide accent strokes for the glow, the accent rim, the label in the accent, and optionally the mechanic
 * icon registry image of the thing it points at (the same painter as the board and the Guide). The ring is unchanged.
 *
 * Reduced motion: the ring holds still at full size (same meaning, no pulse). Sizes come from the type
 * scale and the spacing/stroke tokens; durations from the motion scale.
 */
import Phaser from 'phaser';
import { MOTION_LOOP_MS } from './motionScale';
import { getTypeScaleStep, resolveTypeFaceStack } from './typeScale';
import { designTokens, phaserMaterialAliases } from '../theme/tokens';
import { NEON_PILL_GLOW_STEPS, NEON_TEXT_SKIN } from '../ui/skin/neonTextSkin';
import { drawMechanicIconGlyph, type MechanicIconEnv, type MechanicIconId } from './mechanicIcons';

export interface CoachMarkPoint { readonly x: number; readonly y: number }

export interface CoachMarkProps {
  /** The spot to point at, in the ring layer's local space (board space). */
  readonly anchor: CoachMarkPoint;
  /** Ring radius in the same space as `anchor`. */
  readonly ringRadius: number;
  /** Ring dot radius in the same space as `anchor`. */
  readonly dotRadius: number;
  /** Label beside the ring (plain text, sentence case, short). Empty = ring only. */
  readonly label: string;
  /** Ring and pill border colour (0xRRGGBB, from the palette/tokens). */
  readonly accent: number;
  readonly nowMs: number;
  readonly reducedMotion: boolean;
  /** Fade of the host layer, 0..1. */
  readonly alpha: number;
  /** Maps a ring-space point to the screen (the board zoom container's transform). */
  readonly toScreen: (point: CoachMarkPoint) => CoachMarkPoint;
  /** The pill never goes above this screen y (keeps clear of the header). */
  readonly minTop: number;
  readonly viewWidth: number;
  /** Optional registry icon at the start of the pill (the thing the mark points at). */
  readonly icon?: MechanicIconId;
  readonly iconEnv?: MechanicIconEnv;
  /** Optional screen box the pill must not cover when the other side of the ring is clear (the player). */
  readonly avoid?: CoachMarkRect | null;
}

/** A screen rect (CSS px). */
export interface CoachMarkRect { readonly x: number; readonly y: number; readonly width: number; readonly height: number }

export const COACH_MARK = Object.freeze({
  dots: 10,
  pulsePeriodMs: MOTION_LOOP_MS.beat,
  pulseScale: 0.14,
  label: getTypeScaleStep('caption'),
  padX: designTokens.spacingPx[1]!,
  padY: designTokens.spacingPx[0]!,
  gap: designTokens.spacingPx[0]!,
  edge: designTokens.spacingPx[1]!
});

const wrap = (value: number, period: number): number => ((value % period) + period) % period;

/** Ring scale and alpha at `timeMs` (still under reduced motion). */
export const resolveCoachMarkPulse = (timeMs: number, reducedMotion: boolean): { scale: number; alpha: number } => {
  if (reducedMotion || !Number.isFinite(timeMs)) return { scale: 1, alpha: 0.9 };
  const wave = (1 - Math.cos((wrap(timeMs, COACH_MARK.pulsePeriodMs) / COACH_MARK.pulsePeriodMs) * Math.PI * 2)) / 2;
  return { scale: 1 + (COACH_MARK.pulseScale * wave), alpha: 0.95 - (0.35 * wave) };
};

const rectsOverlap = (a: CoachMarkRect, b: CoachMarkRect): boolean => (
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
);

/**
 * Where the pill goes: centred over the ring when there is room under the header, else under it;
 * clamped inside the view. Whole pixels. With `avoid` (the player's box), a pill that would cover it goes to the
 * other side of the ring when that side is clear (a Pulse Gate card rings the gate the player stands next to).
 */
export const resolveCoachMarkPill = (input: {
  centre: CoachMarkPoint;
  ringBelow: number;
  width: number;
  height: number;
  minTop: number;
  viewWidth: number;
  avoid?: CoachMarkRect | null;
}): { left: number; top: number; side: 'above' | 'below' } => {
  const k = COACH_MARK;
  const aboveTop = input.centre.y - input.ringBelow - k.gap - input.height;
  const belowTop = input.centre.y + input.ringBelow + k.gap;
  const half = input.width / 2;
  const cx = Math.min(input.viewWidth - half - k.edge, Math.max(half + k.edge, input.centre.x));
  const left = Math.round(cx - half);
  let side: 'above' | 'below' = aboveTop >= input.minTop ? 'above' : 'below';
  const avoid = input.avoid ?? null;
  if (avoid !== null) {
    const covers = (top: number): boolean => rectsOverlap({ x: left, y: top, width: input.width, height: input.height }, avoid);
    if (side === 'above' && covers(aboveTop) && !covers(belowTop)) side = 'below';
    else if (side === 'below' && covers(belowTop) && aboveTop >= input.minTop && !covers(aboveTop)) side = 'above';
  }
  const top = side === 'above' ? aboveTop : belowTop;
  return { left, top: Math.round(top), side };
};

const colorOf = (color: number): string => `#${color.toString(16).padStart(6, '0').toUpperCase()}`;

/** The pill surface the neon pill paints on (Phaser Graphics; tests pass a recorder). */
export interface CoachMarkPillGraphics {
  fillStyle(color: number, alpha?: number): unknown;
  fillRoundedRect(x: number, y: number, width: number, height: number, radius?: number): unknown;
  lineStyle(width: number, color: number, alpha?: number): unknown;
  strokeRoundedRect(x: number, y: number, width: number, height: number, radius?: number): unknown;
}

/**
 * The neon edge pill: faint wide accent strokes for the glow (outermost first), the opaque void fill, then the accent
 * rim. Shared by every canvas-drawn pill (coach mark, online counter).
 */
export const drawCoachMarkNeonPill = (
  g: CoachMarkPillGraphics,
  left: number,
  top: number,
  width: number,
  height: number,
  accent: number,
  alpha: number
): void => {
  const radius = height / 2;
  for (const step of NEON_PILL_GLOW_STEPS) {
    g.lineStyle(step.widthPx, accent, step.alpha * alpha);
    g.strokeRoundedRect(left, top, width, height, radius);
  }
  g.fillStyle(phaserMaterialAliases[NEON_TEXT_SKIN.fillToken], NEON_TEXT_SKIN.fillAlpha * alpha);
  g.fillRoundedRect(left, top, width, height, radius);
  const rim = NEON_TEXT_SKIN.rimPx;
  g.lineStyle(rim, accent, alpha);
  g.strokeRoundedRect(left + (rim / 2), top + (rim / 2), width - rim, height - rim, (height - rim) / 2);
};

export class CoachMarkView {
  /** Add this to the board container (ring space). */
  readonly ringGraphics: Phaser.GameObjects.Graphics;
  private readonly pillGraphics: Phaser.GameObjects.Graphics;
  private readonly labelText: Phaser.GameObjects.Text;
  private pill: CoachMarkRect | null = null;

  constructor(scene: Phaser.Scene, options: { depth: number; crisp?: (text: Phaser.GameObjects.Text) => void }) {
    this.ringGraphics = scene.add.graphics().setVisible(false);
    this.pillGraphics = scene.add.graphics().setDepth(options.depth).setScrollFactor(0);
    this.labelText = scene.add.text(0, 0, '', {
      color: designTokens.color['text.primary'],
      fontFamily: resolveTypeFaceStack(COACH_MARK.label.face),
      fontSize: `${COACH_MARK.label.sizePx}px`,
      fontStyle: String(COACH_MARK.label.weight)
    }).setOrigin(0.5, 0.5).setDepth(options.depth + 1).setScrollFactor(0).setVisible(false);
    options.crisp?.(this.labelText);
  }

  /** Draws the mark for this frame, or hides it (`null`). */
  draw(props: CoachMarkProps | null): void {
    const ring = this.ringGraphics;
    const pill = this.pillGraphics;
    ring.clear();
    pill.clear();
    this.pill = null;
    if (props === null || props.alpha <= 0) {
      ring.setVisible(false);
      this.labelText.setVisible(false);
      return;
    }
    const pulse = resolveCoachMarkPulse(props.nowMs, props.reducedMotion);
    const radius = props.ringRadius * pulse.scale;
    ring.setVisible(true);
    ring.fillStyle(props.accent, Math.min(1, props.alpha * pulse.alpha));
    for (let i = 0; i < COACH_MARK.dots; i += 1) {
      const a = (i / COACH_MARK.dots) * Math.PI * 2;
      ring.fillCircle(props.anchor.x + (Math.cos(a) * radius), props.anchor.y + (Math.sin(a) * radius), props.dotRadius);
    }
    if (props.label === '') {
      this.labelText.setVisible(false);
      return;
    }
    if (this.labelText.text !== props.label) this.labelText.setText(props.label);
    const centre = props.toScreen(props.anchor);
    const edge = props.toScreen({ x: props.anchor.x, y: props.anchor.y + (props.ringRadius * (1 + COACH_MARK.pulseScale)) });
    const height = Math.ceil(this.labelText.height) + (COACH_MARK.padY * 2);
    const iconSize = props.icon ? Math.ceil(this.labelText.height) : 0;
    const iconRoom = props.icon ? iconSize + COACH_MARK.gap : 0;
    const width = Math.ceil(this.labelText.width) + (COACH_MARK.padX * 2) + iconRoom;
    const place = resolveCoachMarkPill({
      centre,
      ringBelow: Math.max(0, edge.y - centre.y),
      width,
      height,
      minTop: props.minTop,
      viewWidth: props.viewWidth,
      avoid: props.avoid ?? null
    });
    drawCoachMarkNeonPill(pill, place.left, place.top, width, height, props.accent, props.alpha);
    if (props.icon) {
      drawMechanicIconGlyph(pill, props.icon, place.left + COACH_MARK.padX + (iconSize / 2), place.top + (height / 2), iconSize / 2, props.iconEnv);
    }
    this.pill = { x: place.left, y: place.top, width, height };
    this.labelText
      .setColor(colorOf(props.accent))
      .setAlpha(props.alpha)
      .setPosition(Math.round(place.left + (iconRoom / 2) + (width / 2)), Math.round(place.top + (height / 2)))
      .setVisible(true);
  }

  /** The label pill's screen rect this frame (null = no pill), so a text card can keep clear of it. */
  get pillRect(): CoachMarkRect | null {
    return this.pill;
  }

  destroy(): void {
    this.ringGraphics.destroy();
    this.pillGraphics.destroy();
    this.labelText.destroy();
  }
}
