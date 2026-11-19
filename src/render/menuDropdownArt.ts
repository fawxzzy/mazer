import type Phaser from 'phaser';
import { cyberArcadeMaterial } from './cyberArcadeMaterial';
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

/**
 * Three lines at progress 0 (closed) .. 1 (an X). `size` is the toggle frame size; the lines are centred on (x, y).
 * Draws into the caller's graphics without clearing it.
 */
export const drawMenuBurgerGlyph = (
  graphics: Phaser.GameObjects.Graphics,
  centerX: number,
  centerY: number,
  size: number,
  progress: number,
  color: number,
  alpha = 1
): void => {
  const metrics = resolveLegacyMenuBurgerMetrics(size);
  for (const segment of resolveLegacyMenuBurgerSegments(centerX, centerY, metrics.halfWidth, metrics.gap, progress)) {
    if (segment.alpha <= 0.01) {
      continue;
    }
    graphics.lineStyle(metrics.lineWidth, color, alpha * segment.alpha);
    graphics.lineBetween(segment.x1, segment.y1, segment.x2, segment.y2);
    // Round caps: Phaser Graphics strokes are butt-ended, so cap each end with a dot of the line's width.
    graphics.fillStyle(color, alpha * segment.alpha);
    graphics.fillCircle(segment.x1, segment.y1, metrics.lineWidth / 2);
    graphics.fillCircle(segment.x2, segment.y2, metrics.lineWidth / 2);
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
