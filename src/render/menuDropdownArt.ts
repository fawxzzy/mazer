import type Phaser from 'phaser';
import { cyberArcadeMaterial } from './cyberArcadeMaterial';
import { BUTTON_ICON_PALETTE, cssHexToNumber, resolveMenuToggleDust, resolveSparkPoints } from './buttonIcons';
import {
  LEGACY_MENU_DROPDOWN_CORNER_RADIUS_PX,
  resolveLegacyMenuBurgerMetrics,
  resolveLegacyMenuBurgerSegments,
  type LegacyMenuDropdownRect
} from '../legacy-runtime/legacyMenuDropdown';

/**
 * L6 "Menu A: Dropdown panel" art: the three-line toggle that turns into an X and the glass panel. Phaser Graphics only
 * (exact positions, no flooring), drawn from the pure geometry in legacyMenuDropdown.ts. The Guide's Menu row icon calls
 * drawMenuBurgerGlyph too, so the guide and the button cannot drift apart.
 */

/** Closed toggle lines and row labels. */
export const MENU_DROPDOWN_FOREGROUND = cyberArcadeMaterial.rail.white;
/** Open toggle (the X), highlighted row and the panel keyline. */
export const MENU_DROPDOWN_ACCENT = cyberArcadeMaterial.rail.cyan;
/** Panel fill: the dark control background, nearly opaque so labels stay readable over the trail. */
export const MENU_DROPDOWN_PANEL_FILL = cyberArcadeMaterial.substrate.field;
export const MENU_DROPDOWN_PANEL_FILL_ALPHA = 0.94;

/** MAZER-UI-097: the closed toggle's line ink, C Star Dust's button ink (token line.active). */
export const MENU_TOGGLE_INK = cssHexToNumber(BUTTON_ICON_PALETTE.ink);
const MENU_TOGGLE_SPARK = cssHexToNumber(BUTTON_ICON_PALETTE.spark);
const MENU_TOGGLE_PRESSED_INK = cssHexToNumber(BUTTON_ICON_PALETTE.inkPressed);
const MENU_TOGGLE_PRESSED_SPARK = cssHexToNumber(BUTTON_ICON_PALETTE.sparkPressed);
const MENU_TOGGLE_RING = cssHexToNumber(BUTTON_ICON_PALETTE.ring);

/** The Graphics calls the toggle glyph makes (Phaser.GameObjects.Graphics satisfies it). */
export type MenuBurgerGraphics = Pick<
  Phaser.GameObjects.Graphics,
  'lineStyle' | 'lineBetween' | 'fillStyle' | 'fillCircle' | 'strokeCircle' | 'fillPoints'
>;

/**
 * Three lines at progress 0 (closed) .. 1 (an X). `size` is the toggle frame size; the lines are centred on (x, y).
 * Draws into the caller's graphics without clearing it.
 *
 * MAZER-UI-097 (C Star Dust): the morph geometry and timing are unchanged (resolveLegacyMenuBurgerSegments); only the
 * look follows the icon set (src/render/buttonIcons.ts): C's line weight, a spark ahead of each line's left end that
 * rides with its line and fades out as the lines cross, C's dust dot in the centre of the X, and, while `pressed`,
 * C's soft cyan ring with cyan lines.
 */
export const drawMenuBurgerGlyph = (
  graphics: MenuBurgerGraphics,
  centerX: number,
  centerY: number,
  size: number,
  progress: number,
  color: number,
  alpha = 1,
  pressed = false
): void => {
  const metrics = resolveLegacyMenuBurgerMetrics(size);
  const dust = resolveMenuToggleDust(size);
  const o = Math.min(1, Math.max(0, progress));
  const ink = pressed ? MENU_TOGGLE_PRESSED_INK : color;
  const spark = pressed ? MENU_TOGGLE_PRESSED_SPARK : MENU_TOGGLE_SPARK;
  if (pressed) {
    graphics.fillStyle(MENU_TOGGLE_RING, BUTTON_ICON_PALETTE.ringFillAlpha * alpha);
    graphics.fillCircle(centerX, centerY, dust.ringRadius);
    graphics.lineStyle(1.5, MENU_TOGGLE_RING, BUTTON_ICON_PALETTE.ringStrokeAlpha * alpha);
    graphics.strokeCircle(centerX, centerY, dust.ringRadius);
  }
  for (const segment of resolveLegacyMenuBurgerSegments(centerX, centerY, metrics.halfWidth, metrics.gap, progress)) {
    if (segment.alpha <= 0.01) {
      continue;
    }
    graphics.lineStyle(dust.lineWidth, ink, alpha * segment.alpha);
    graphics.lineBetween(segment.x1, segment.y1, segment.x2, segment.y2);
    // Round caps: Phaser Graphics strokes are butt-ended, so cap each end with a dot of the line's width.
    graphics.fillStyle(ink, alpha * segment.alpha);
    graphics.fillCircle(segment.x1, segment.y1, dust.lineWidth / 2);
    graphics.fillCircle(segment.x2, segment.y2, dust.lineWidth / 2);
    // The spark leads the line's left end along the line and fades out as the lines cross.
    const sparkAlpha = alpha * segment.alpha * (1 - o);
    if (sparkAlpha > 0.01) {
      const length = Math.hypot(segment.x2 - segment.x1, segment.y2 - segment.y1) || 1;
      const ux = (segment.x2 - segment.x1) / length;
      const uy = (segment.y2 - segment.y1) / length;
      graphics.fillStyle(spark, sparkAlpha);
      graphics.fillPoints(
        resolveSparkPoints(segment.x1 - (ux * dust.sparkLead), segment.y1 - (uy * dust.sparkLead), dust.sparkRadius),
        true,
        true
      );
    }
  }
  // C's centre dust dot fades in as the X forms.
  if (o > 0.01) {
    graphics.fillStyle(spark, alpha * o);
    graphics.fillCircle(centerX, centerY, dust.dotRadius);
  }
};

/**
 * The glass panel: soft accent glow (two widening low-alpha keylines; Canvas Graphics has no blur), near-opaque dark
 * fill, accent keyline, and the highlighted row's tint + left bar. `offsetY` is the whole-px slide while it opens.
 */
export const drawMenuDropdownPanel = (
  graphics: Phaser.GameObjects.Graphics,
  panel: LegacyMenuDropdownRect,
  rows: readonly LegacyMenuDropdownRect[],
  alpha: number,
  offsetY: number,
  highlightIndex: number | null
): void => {
  if (alpha <= 0.01) {
    return;
  }
  const radius = LEGACY_MENU_DROPDOWN_CORNER_RADIUS_PX;
  const left = panel.left;
  const top = panel.top + offsetY;
  graphics.lineStyle(6, MENU_DROPDOWN_ACCENT, 0.05 * alpha);
  graphics.strokeRoundedRect(left - 2, top - 2, panel.width + 4, panel.height + 4, radius + 2);
  graphics.lineStyle(3, MENU_DROPDOWN_ACCENT, 0.1 * alpha);
  graphics.strokeRoundedRect(left - 1, top - 1, panel.width + 2, panel.height + 2, radius + 1);
  graphics.fillStyle(MENU_DROPDOWN_PANEL_FILL, MENU_DROPDOWN_PANEL_FILL_ALPHA * alpha);
  graphics.fillRoundedRect(left, top, panel.width, panel.height, radius);
  // Half-px inset keeps a 1 px keyline on whole device pixels at DPR 1 and 3.
  graphics.lineStyle(1, MENU_DROPDOWN_ACCENT, 0.62 * alpha);
  graphics.strokeRoundedRect(left + 0.5, top + 0.5, panel.width - 1, panel.height - 1, radius);
  const row = highlightIndex === null ? undefined : rows[highlightIndex];
  if (row !== undefined) {
    graphics.fillStyle(MENU_DROPDOWN_ACCENT, 0.13 * alpha);
    graphics.fillRoundedRect(row.left + 4, row.top + offsetY + 2, row.width - 8, row.height - 4, 7);
    graphics.fillStyle(MENU_DROPDOWN_ACCENT, alpha);
    graphics.fillRect(row.left + 4, row.top + offsetY + 8, 3, row.height - 16);
  }
};
