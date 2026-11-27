/**
 * The Guide ("How to play") painter: an icon glossary. Every row of the Guide model is a tile (the board's own icon
 * plus its heading); tapping a tile shows that row's copy in the detail panel below the grid. Picked by Zac as option C
 * of the 2026-11-23 Guide redesign options.
 *
 * Nothing here is a mock: it paints through the scene's own pieces (card, title, kit buttons, `drawLegacyGuideIcon`,
 * the text helper, scroll rail) and the shared sheet plan. The scene is passed as an untyped host because those pieces
 * are private members of MenuScene (a Wave 5C file: new behaviour lives in new modules).
 */
import type { LegacyGuideRow, LegacyGuideSheetModel } from './legacyGuideContent';
import {
  LEGACY_GUIDE_SHEET_SIZES,
  buildLegacyGuideSheetPlan,
  resolveLegacyGuideKeyboardLineHeight,
  resolveLegacyGuideRowHeight,
  type LegacyGuideSheetPlan
} from './legacyGuideSheetPlan';
import { cyberArcadeMaterial, toCyberArcadeCssHex } from '../render/cyberArcadeMaterial';
import { readMazerViewportGeometry } from '../boot/viewportGeometry';
import { drawLegacyGuideRowIcon } from './legacyGuideIconRoute';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Host = any;
type Mask = <T>(text: T) => T;

interface Item {
  height: number;
  paint(top: number, g: Host, mask: Mask): void;
}

export const GUIDE_GLOSSARY_COLUMNS = 4;
export const GUIDE_GLOSSARY_TILE_GAP = 8;
export const GUIDE_GLOSSARY_TILE_HEIGHT = 76;
const PANEL_PAD = 12;

const S = LEGACY_GUIDE_SHEET_SIZES;
const WHITE = (): string => toCyberArcadeCssHex(cyberArcadeMaterial.rail.white);
const MUTED = (): string => toCyberArcadeCssHex(cyberArcadeMaterial.rail.muted);
const MINT_CSS = (): string => toCyberArcadeCssHex(cyberArcadeMaterial.rail.mint);

let selectedId: string | null = null;

/** Called when the Guide closes so it always opens on its first tile. */
export const resetGuideGlossarySelection = (): void => {
  selectedId = null;
};

/** Height of the glossary grid for `count` tiles. */
export const resolveGuideGlossaryGridHeight = (count: number): number => {
  const lines = Math.max(1, Math.ceil(count / GUIDE_GLOSSARY_COLUMNS));
  return (lines * GUIDE_GLOSSARY_TILE_HEIGHT) + ((lines - 1) * GUIDE_GLOSSARY_TILE_GAP);
};

const copyLinesFor = (host: Host, row: LegacyGuideRow, width: number): number => (
  host.measureLegacySheetWrappedLines(row.text, Math.max(1, width - S.badgeSize - S.badgeTextGap) + 16, S.copyFontSize)
);

const buildItems = (host: Host, model: LegacyGuideSheetModel, width: number): Item[] => {
  const rows = model.rows;
  const tileW = (width - (GUIDE_GLOSSARY_TILE_GAP * (GUIDE_GLOSSARY_COLUMNS - 1))) / GUIDE_GLOSSARY_COLUMNS;
  const selectedRow = (): LegacyGuideRow => rows.find((row) => row.id === selectedId) ?? rows[0]!;
  const grid: Item = {
    height: resolveGuideGlossaryGridHeight(rows.length),
    paint: (top, g, mask) => {
      const left = host.__guideLeft as number;
      const current = selectedRow();
      rows.forEach((row, index) => {
        const tileLeft = left + ((index % GUIDE_GLOSSARY_COLUMNS) * (tileW + GUIDE_GLOSSARY_TILE_GAP));
        const tileTop = top + (Math.floor(index / GUIDE_GLOSSARY_COLUMNS) * (GUIDE_GLOSSARY_TILE_HEIGHT + GUIDE_GLOSSARY_TILE_GAP));
        const selected = current.id === row.id;
        host.drawLegacyCyberPanel(g, {
          active: selected,
          alpha: selected ? 0.9 : 0.5,
          fill: cyberArcadeMaterial.substrate.field,
          height: GUIDE_GLOSSARY_TILE_HEIGHT,
          left: tileLeft,
          radius: 12,
          stroke: selected ? cyberArcadeMaterial.rail.mint : cyberArcadeMaterial.rail.cyan,
          top: tileTop,
          width: tileW
        });
        drawLegacyGuideRowIcon(host, row.icon, tileLeft + (tileW / 2), tileTop + 26, host.resolveLegacyGuideAccent(row.icon.glyph), g);
        const centerX = tileLeft + (tileW / 2);
        const centerY = tileTop + GUIDE_GLOSSARY_TILE_HEIGHT - 14;
        mask(host.addLegacySheetWrappedText(row.heading, tileLeft, centerY, tileW + 8, selected ? MINT_CSS() : WHITE(), 14, 12, 1,
          { alpha: selected ? 1 : 0.92, bold: selected }).setOrigin(0.5, 0.5).setPosition(centerX, centerY).setAlign('center'));
        host.uiButtons.push(host.createLegacyAuthActionButton(
          centerX, tileTop + (GUIDE_GLOSSARY_TILE_HEIGHT / 2), tileW, GUIDE_GLOSSARY_TILE_HEIGHT, '',
          () => { selectedId = row.id; host.uiDirty = true; }, 'ghost'
        ));
      });
    }
  };
  // The panel holds the tallest row's copy so the sheet never jumps between tiles.
  const detailLines = Math.max(...rows.map((row) => copyLinesFor(host, row, width - (PANEL_PAD * 2))));
  const detailHeight = resolveLegacyGuideRowHeight(detailLines) + (PANEL_PAD * 2) - 20;
  const detail: Item = {
    height: detailHeight,
    paint: (top, g, mask) => {
      const left = host.__guideLeft as number;
      const row = selectedRow();
      host.drawLegacyCyberPanel(g, {
        alpha: 0.55, fill: cyberArcadeMaterial.substrate.field, height: detailHeight, left, radius: 12,
        stroke: cyberArcadeMaterial.rail.mint, top, width
      });
      const rowLeft = left + PANEL_PAD;
      const rowWidth = width - (PANEL_PAD * 2);
      const rowHeight = detailHeight - (PANEL_PAD * 2) + 20;
      const rowTop = top + PANEL_PAD - 10;
      const accent = host.resolveLegacyGuideAccent(row.icon.glyph) as number;
      drawLegacyGuideRowIcon(host, row.icon, rowLeft + (S.badgeSize / 2), rowTop + (rowHeight / 2), accent, g);
      const textLeft = rowLeft + S.badgeSize + S.badgeTextGap;
      const textWidth = Math.max(1, rowWidth - S.badgeSize - S.badgeTextGap);
      const copyLines = Math.max(1, Math.round((rowHeight - (S.rowPaddingY * 2) - S.headingLineHeight) / S.copyLineHeight));
      const blockHeight = S.headingLineHeight + (copyLines * S.copyLineHeight);
      const blockTop = rowTop + ((rowHeight - blockHeight) / 2);
      mask(host.addLegacySheetWrappedText(row.heading, textLeft - 8, blockTop + (S.headingLineHeight / 2), textWidth + 16,
        toCyberArcadeCssHex(accent), S.headingFontSize, S.headingFontSize, 1, { alpha: 1, bold: true }));
      mask(host.addLegacySheetWrappedText(row.text, textLeft - 8, blockTop + S.headingLineHeight + ((copyLines * S.copyLineHeight) / 2),
        textWidth + 16, WHITE(), S.copyFontSize, S.copyFontSize, copyLines + 1, { alpha: 0.92 }));
    }
  };
  const items: Item[] = [grid, detail];
  const keyboardLine = model.keyboardLine;
  if (keyboardLine !== null) {
    const lines = host.measureLegacySheetWrappedLines(keyboardLine, width + 16, S.copyFontSize) as number;
    const height = resolveLegacyGuideKeyboardLineHeight(lines);
    items.push({
      height,
      paint: (top, _g, mask) => {
        mask(host.addLegacySheetWrappedText(keyboardLine, (host.__guideLeft as number) - 8, top + (height / 2), width + 16, MUTED(),
          S.copyFontSize, S.copyFontSize, 3, { alpha: 0.92 }));
      }
    });
  }
  return items;
};

/** Paints the Guide sheet for `model`; returns the card rect (the scene stores it as the overlay bounds). */
export const paintGuideGlossarySheet = (
  host: Host, model: LegacyGuideSheetModel
): { left: number; top: number; width: number; height: number } => {
  const planInput = { height: host.layout.height as number, safeArea: readMazerViewportGeometry().safeArea, width: host.layout.width as number };
  let plan: LegacyGuideSheetPlan = buildLegacyGuideSheetPlan({
    ...planInput, itemHeights: buildItems(host, model, Number.MAX_SAFE_INTEGER / 4).map((item) => item.height)
  });
  // Measure at the real column width (the rail gutter narrows it when the body scrolls), then re-plan.
  for (let pass = 0; pass < 2; pass += 1) {
    host.__guideLeft = plan.bodyViewport.left;
    plan = buildLegacyGuideSheetPlan({ ...planInput, itemHeights: buildItems(host, model, plan.itemWidth).map((item) => item.height) });
  }
  host.__guideLeft = plan.bodyViewport.left;
  const items = buildItems(host, model, plan.itemWidth);

  host.overlayMovementSpeedSliderBounds = null;
  host.drawLegacySheetCard(plan.card);
  host.createOverlayTitle(plan.title.text, plan.title.centerY);

  const scrollMetrics = host.applyLegacySheetScroll(plan.scrollRailViewport, plan.contentHeight, plan.scrollable);
  const scrollOffset = (scrollMetrics?.offset ?? 0) as number;
  const viewport = plan.bodyViewport;
  let g: Host = host.overlayGraphics;
  let guideMask: unknown = null;
  if (plan.scrollable) {
    g = host.add.graphics();
    host.overlayGuideGraphics = g;
    const maskGraphics = host.make.graphics({ x: 0, y: 0 }, false);
    maskGraphics.fillStyle(cyberArcadeMaterial.rail.white, 1);
    maskGraphics.fillRect(viewport.left, viewport.top, viewport.width, viewport.height);
    guideMask = maskGraphics.createGeometryMask();
    g.setMask(guideMask);
    host.overlayGuideMaskGraphics = maskGraphics;
    host.overlayGuideMask = guideMask;
  }
  const mask: Mask = (text) => {
    if (guideMask !== null) {
      (text as unknown as { setMask(m: unknown): void }).setMask(guideMask);
    }
    return text;
  };
  items.forEach((item, index) => {
    const top = viewport.top + (plan.itemTops[index] ?? 0) - scrollOffset;
    if (top < viewport.top + viewport.height && top + item.height > viewport.top) {
      item.paint(top, g, mask);
    }
  });
  if (scrollMetrics !== null) {
    host.drawLegacyOverlayScrollFacade(scrollMetrics);
  }
  host.uiButtons.push(host.createLegacyAuthActionButton(
    plan.footer.left + (plan.footer.width / 2), plan.footer.top + (plan.footer.height / 2), plan.footer.width, plan.footer.height,
    model.closeLabel, () => host.closeLegacyGuideSheet(), 'primary'
  ));
  return plan.card;
};
