/**
 * Guide redesign OPTIONS painter (2026-11-23). Options route only (`?guideOptions=A|B|C`, see legacyGuideOptionsVariants.ts).
 *
 * This paints the REAL Guide sheet through the scene's own pieces: the same card, title, kit buttons, icon draw
 * functions (`drawLegacyGuideIcon`, the board's own draws), text helper, scroll rail and the shipped sheet plan. Nothing
 * here is a mock: a variant only changes how the shipped rows are grouped and laid out.
 *
 * The scene is passed as an untyped host because the pieces it calls are private members of MenuScene (Wave 5C file:
 * new behaviour lives here). If an option is picked, the pick is rebuilt as a typed module and this file is deleted.
 */
import {
  GUIDE_OPTIONS_GLOSSARY_ORDER,
  GUIDE_OPTIONS_GROUPS,
  GUIDE_OPTIONS_ROWS,
  GUIDE_OPTIONS_VARIANT_NAMES,
  resolveGuideOptionsVariant,
  type GuideOptionsRow,
  type GuideOptionsRowId,
  type GuideOptionsVariantId
} from './legacyGuideOptionsVariants';
import {
  LEGACY_GUIDE_CLOSE_LABEL,
  LEGACY_GUIDE_ROWS,
  LEGACY_GUIDE_TITLE,
  buildLegacyGuideKeyboardLine
} from './legacyGuideContent';
import {
  LEGACY_GUIDE_SHEET_SIZES,
  buildLegacyGuideSheetPlan,
  resolveLegacyGuideKeyboardLineHeight,
  resolveLegacyGuideRowHeight,
  type LegacyGuideSheetPlan
} from './legacyGuideSheetPlan';
import { cyberArcadeMaterial, toCyberArcadeCssHex } from '../render/cyberArcadeMaterial';
import { readMazerViewportGeometry } from '../boot/viewportGeometry';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Host = any;

export interface GuideOptionsState {
  variant: GuideOptionsVariantId;
  /** B: current page. */
  page: number;
  /** C: selected tile. */
  selected: GuideOptionsRowId;
}

const state: GuideOptionsState = { page: 0, selected: 'goal', variant: 'A' };
let stateReady = false;

export const getGuideOptionsState = (): GuideOptionsState => {
  if (!stateReady) {
    stateReady = true;
    const search = typeof window === 'undefined' ? '' : window.location.search;
    state.variant = resolveGuideOptionsVariant(search) ?? 'A';
    const params = new URLSearchParams(search);
    state.page = Math.max(0, Math.min(GUIDE_OPTIONS_GROUPS.length - 1, Number(params.get('guidePage') ?? 0) || 0));
    const pick = params.get('guideSelect');
    if (pick !== null && pick in GUIDE_OPTIONS_ROWS) {
      state.selected = pick as GuideOptionsRowId;
    }
  }
  return state;
};

export const isGuideOptionsRoute = (): boolean => (
  typeof window !== 'undefined' && resolveGuideOptionsVariant(window.location.search) !== null
);

export const GUIDE_OPTIONS_VARIANT_LABELS = GUIDE_OPTIONS_VARIANT_NAMES;

type Mask = <T>(text: T) => T;

interface Item {
  height: number;
  paint(top: number, g: Host, mask: Mask): void;
}

const S = LEGACY_GUIDE_SHEET_SIZES;
const WHITE = (): string => toCyberArcadeCssHex(cyberArcadeMaterial.rail.white);
const MUTED = (): string => toCyberArcadeCssHex(cyberArcadeMaterial.rail.muted);
const MINT = (): number => cyberArcadeMaterial.rail.mint;

const iconSpecFor = (row: GuideOptionsRow) => LEGACY_GUIDE_ROWS.find((shipped) => shipped.id === row.iconFrom)!.icon;

const rowCopyLines = (host: Host, row: GuideOptionsRow, itemWidth: number): number => (
  host.measureLegacySheetWrappedLines(row.text, Math.max(1, itemWidth - S.badgeSize - S.badgeTextGap) + 16, S.copyFontSize)
);

const rowHeight = (host: Host, row: GuideOptionsRow, itemWidth: number): number => (
  resolveLegacyGuideRowHeight(rowCopyLines(host, row, itemWidth))
);

/** One shipped-style row (badge + heading + copy) at an arbitrary left/width. */
const paintRow = (
  host: Host, row: GuideOptionsRow, left: number, top: number, width: number, height: number, g: Host, mask: Mask
): void => {
  const icon = iconSpecFor(row);
  const accent = host.resolveLegacyGuideAccent(icon.glyph);
  host.drawLegacyGuideIcon(icon, left + (S.badgeSize / 2), top + (height / 2), accent, g);
  const textLeft = left + S.badgeSize + S.badgeTextGap;
  const textWidth = Math.max(1, width - S.badgeSize - S.badgeTextGap);
  const copyLines = Math.max(1, Math.round((height - (S.rowPaddingY * 2) - S.headingLineHeight) / S.copyLineHeight));
  const blockHeight = S.headingLineHeight + (copyLines * S.copyLineHeight);
  const blockTop = top + ((height - blockHeight) / 2);
  mask(host.addLegacySheetWrappedText(row.heading, textLeft - 8, blockTop + (S.headingLineHeight / 2), textWidth + 16,
    toCyberArcadeCssHex(accent), S.headingFontSize, S.headingFontSize, 1, { alpha: 1, bold: true }));
  mask(host.addLegacySheetWrappedText(row.text, textLeft - 8, blockTop + S.headingLineHeight + ((copyLines * S.copyLineHeight) / 2),
    textWidth + 16, WHITE(), S.copyFontSize, S.copyFontSize, copyLines + 1, { alpha: 0.92 }));
};

const hairline = (g: Host, left: number, y: number, width: number): void => {
  g.lineStyle(1, cyberArcadeMaterial.rail.cyan, 0.18);
  g.beginPath();
  g.moveTo(left, y + 0.5);
  g.lineTo(left + width, y + 0.5);
  g.strokePath();
};

const keyboardItem = (host: Host, width: number): Item | null => {
  if (!host.resolveLegacyGuideHasKeyboard()) {
    return null;
  }
  const line = buildLegacyGuideKeyboardLine();
  const lines = host.measureLegacySheetWrappedLines(line, width + 16, S.copyFontSize);
  return {
    height: resolveLegacyGuideKeyboardLineHeight(lines),
    paint: (top, _g, mask) => {
      const h = resolveLegacyGuideKeyboardLineHeight(lines);
      mask(host.addLegacySheetWrappedText(line, host.__guideLeft - 8, top + (h / 2), width + 16, MUTED(), S.copyFontSize, S.copyFontSize, 3, { alpha: 0.92 }));
    }
  };
};

const sectionLabel = (host: Host, text: string, left: number, top: number, width: number, mask: Mask): void => {
  mask(host.addLegacySheetWrappedText(text.toUpperCase(), left - 8, top + 10, width + 16, toCyberArcadeCssHex(MINT()), 14, 14, 1, { alpha: 1, bold: true }));
};

// ---- Option A: section cards --------------------------------------------------------------------------------
const CARD_PAD = 12;
const LABEL_H = 26;

const buildCards = (host: Host, width: number): Item[] => {
  const items: Item[] = GUIDE_OPTIONS_GROUPS.map((group) => {
    const rows = group.rows.map((id) => GUIDE_OPTIONS_ROWS[id]);
    const innerW = width - (CARD_PAD * 2);
    const heights = rows.map((row) => rowHeight(host, row, innerW));
    const height = LABEL_H + (CARD_PAD * 2) + heights.reduce((a, b) => a + b, 0);
    return {
      height,
      paint: (top, g, mask) => {
        const left = host.__guideLeft;
        sectionLabel(host, group.title, left, top, width, mask);
        const cardTop = top + LABEL_H;
        host.drawLegacyCyberPanel(g, {
          alpha: 0.55, fill: cyberArcadeMaterial.substrate.field, height: height - LABEL_H, left, radius: 12,
          stroke: MINT(), top: cardTop, width
        });
        let y = cardTop + CARD_PAD;
        rows.forEach((row, index) => {
          paintRow(host, row, left + CARD_PAD, y, innerW, heights[index]!, g, mask);
          y += heights[index]!;
          if (index < rows.length - 1) {
            hairline(g, left + CARD_PAD + S.badgeSize + S.badgeTextGap, y, innerW - S.badgeSize - S.badgeTextGap);
          }
        });
      }
    };
  });
  const kb = keyboardItem(host, width);
  return kb === null ? items : [...items, kb];
};

// ---- Option B: step by step ----------------------------------------------------------------------------------
const buildPage = (host: Host, width: number, pageIndex: number): Item => {
  const group = GUIDE_OPTIONS_GROUPS[pageIndex]!;
  const rows = group.rows.map((id) => GUIDE_OPTIONS_ROWS[id]);
  const heights = rows.map((row) => rowHeight(host, row, width));
  const header = 34;
  const kb = pageIndex === 1 ? keyboardItem(host, width) : null;
  const height = header + heights.reduce((a, b) => a + b, 0) + (kb === null ? 0 : kb.height);
  return {
    height,
    paint: (top, g, mask) => {
      const left = host.__guideLeft;
      mask(host.addLegacySheetWrappedText(group.title, left - 8, top + 12, width + 16, toCyberArcadeCssHex(MINT()), 18, 18, 1, { alpha: 1, bold: true }));
      mask(host.addLegacySheetWrappedText(`${pageIndex + 1} of ${GUIDE_OPTIONS_GROUPS.length}`, left + width + 8, top + 12, 80, MUTED(), 14, 14, 1, { alpha: 0.92, originX: 1 }));
      let y = top + header;
      rows.forEach((row, index) => {
        paintRow(host, row, left, y, width, heights[index]!, g, mask);
        y += heights[index]!;
        if (index < rows.length - 1) {
          hairline(g, left + S.badgeSize + S.badgeTextGap, y, width - S.badgeSize - S.badgeTextGap);
        }
      });
      kb?.paint(y, g, mask);
    }
  };
};

// ---- Option C: icon glossary ---------------------------------------------------------------------------------
const TILE_COLS = 4;
const TILE_GAP = 8;
const TILE_H = 76;

const buildGlossary = (host: Host, width: number): Item[] => {
  const tileW = (width - (TILE_GAP * (TILE_COLS - 1))) / TILE_COLS;
  const rows = Math.ceil(GUIDE_OPTIONS_GLOSSARY_ORDER.length / TILE_COLS);
  const gridHeight = (rows * TILE_H) + ((rows - 1) * TILE_GAP);
  const grid: Item = {
    height: gridHeight,
    paint: (top, g, mask) => {
      const left = host.__guideLeft;
      GUIDE_OPTIONS_GLOSSARY_ORDER.forEach((id, index) => {
        const row = GUIDE_OPTIONS_ROWS[id];
        const col = index % TILE_COLS;
        const line = Math.floor(index / TILE_COLS);
        const tileLeft = left + (col * (tileW + TILE_GAP));
        const tileTop = top + (line * (TILE_H + TILE_GAP));
        const selected = state.selected === id;
        const accent = host.resolveLegacyGuideAccent(iconSpecFor(row).glyph);
        host.drawLegacyCyberPanel(g, {
          active: selected, alpha: selected ? 0.9 : 0.5, fill: cyberArcadeMaterial.substrate.field, height: TILE_H, left: tileLeft,
          radius: 12, stroke: selected ? MINT() : cyberArcadeMaterial.rail.cyan, top: tileTop, width: tileW
        });
        host.drawLegacyGuideIcon(iconSpecFor(row), tileLeft + (tileW / 2), tileTop + 26, accent, g);
        mask(host.addLegacySheetWrappedText(row.heading, tileLeft, tileTop + TILE_H - 14, tileW + 16,
          selected ? toCyberArcadeCssHex(MINT()) : WHITE(), 14, 12, 1, { alpha: selected ? 1 : 0.92, bold: selected })
          .setOrigin(0.5, 0.5).setPosition(tileLeft + (tileW / 2), tileTop + TILE_H - 14).setAlign('center'));
        host.uiButtons.push(host.createLegacyAuthActionButton(
          tileLeft + (tileW / 2), tileTop + (TILE_H / 2), tileW, TILE_H, '',
          () => { state.selected = id; host.uiDirty = true; }, 'ghost'
        ));
      });
    }
  };
  const detailRows = GUIDE_OPTIONS_GLOSSARY_ORDER.map((id) => GUIDE_OPTIONS_ROWS[id]);
  const detailLines = Math.max(...detailRows.map((row) => rowCopyLines(host, row, width - (CARD_PAD * 2))));
  const detailHeight = resolveLegacyGuideRowHeight(detailLines) + (CARD_PAD * 2) - 20;
  const detail: Item = {
    height: detailHeight,
    paint: (top, g, mask) => {
      const left = host.__guideLeft;
      const row = GUIDE_OPTIONS_ROWS[state.selected];
      host.drawLegacyCyberPanel(g, { alpha: 0.55, fill: cyberArcadeMaterial.substrate.field, height: detailHeight, left, radius: 12, stroke: MINT(), top, width });
      paintRow(host, row, left + CARD_PAD, top + CARD_PAD - 10, width - (CARD_PAD * 2), detailHeight - (CARD_PAD * 2) + 20, g, mask);
    }
  };
  const kb = keyboardItem(host, width);
  return kb === null ? [grid, detail] : [grid, detail, kb];
};

// ---- shared sheet --------------------------------------------------------------------------------------------
export const paintGuideOptionsSheet = (host: Host): { left: number; top: number; width: number; height: number } => {
  const current = getGuideOptionsState();
  const baseSafe = readMazerViewportGeometry().safeArea;
  // The picker bar sits above the game; keep the card clear of it.
  const safeArea = { ...baseSafe, top: (baseSafe?.top ?? 0) + 46 };
  const planInput = { height: host.layout.height, safeArea, width: host.layout.width };
  const itemsFor = (width: number): Item[] => {
    if (current.variant === 'A') {
      return buildCards(host, width);
    }
    if (current.variant === 'B') {
      // Every page holds the tallest page's height so the card never jumps while paging.
      const pages = GUIDE_OPTIONS_GROUPS.map((_group, index) => buildPage(host, width, index));
      const tallest = Math.max(...pages.map((page) => page.height)) + 16; // room for the page dots
      const page = pages[current.page]!;
      return [{ height: tallest, paint: page.paint }];
    }
    return buildGlossary(host, width);
  };
  let plan: LegacyGuideSheetPlan = buildLegacyGuideSheetPlan({ ...planInput, itemHeights: itemsFor(Number.MAX_SAFE_INTEGER / 4).map((item) => item.height) });
  for (let pass = 0; pass < 2; pass += 1) {
    host.__guideLeft = plan.bodyViewport.left;
    plan = buildLegacyGuideSheetPlan({ ...planInput, itemHeights: itemsFor(plan.itemWidth).map((item) => item.height) });
  }
  host.__guideLeft = plan.bodyViewport.left;
  const items = itemsFor(plan.itemWidth);

  host.overlayMovementSpeedSliderBounds = null;
  host.drawLegacySheetCard(plan.card);
  host.createOverlayTitle(LEGACY_GUIDE_TITLE, plan.title.centerY);

  const scrollMetrics = host.applyLegacySheetScroll(plan.scrollRailViewport, plan.contentHeight, plan.scrollable);
  const scrollOffset = scrollMetrics?.offset ?? 0;
  const viewport = plan.bodyViewport;
  let g: Host = host.overlayGraphics;
  let guideMask: unknown = null;
  if (plan.scrollable) {
    g = host.add.graphics();
    host.overlayGuideGraphics = g;
    const maskGraphics = host.make.graphics({ x: 0, y: 0 }, false);
    maskGraphics.fillStyle(16777215, 1);
    maskGraphics.fillRect(viewport.left, viewport.top, viewport.width, viewport.height);
    guideMask = maskGraphics.createGeometryMask();
    g.setMask(guideMask);
    host.overlayGuideMaskGraphics = maskGraphics;
    host.overlayGuideMask = guideMask;
  }
  const mask = <T,>(text: T): T => {
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

  const footer = plan.footer;
  const centerY = footer.top + (footer.height / 2);
  const close = (): void => host.closeLegacyGuideSheet();
  if (current.variant !== 'B') {
    host.uiButtons.push(host.createLegacyAuthActionButton(footer.left + (footer.width / 2), centerY, footer.width, footer.height, LEGACY_GUIDE_CLOSE_LABEL, close, 'primary'));
    return plan.card;
  }
  // B: pager footer. Page dots sit in the gap above the buttons; Back is the outlined secondary (Skip, a ghost, on page 1).
  const last = GUIDE_OPTIONS_GROUPS.length - 1;
  const dotsY = footer.top - 8;
  const dotsLeft = footer.left + (footer.width / 2) - (((last * 14) + 8) / 2);
  GUIDE_OPTIONS_GROUPS.forEach((_group, index) => {
    const on = index === current.page;
    g.fillStyle(on ? MINT() : cyberArcadeMaterial.rail.muted, on ? 1 : 0.5);
    g.fillCircle(dotsLeft + (index * 14) + 4, dotsY, on ? 4 : 3);
  });
  const gap = 12;
  const half = (footer.width - gap) / 2;
  const goto = (page: number): void => { state.page = Math.max(0, Math.min(last, page)); host.resetLegacyOverlayScrollState(); host.uiDirty = true; };
  host.uiButtons.push(host.createLegacyAuthActionButton(
    footer.left + (half / 2), centerY, half, footer.height,
    current.page === 0 ? 'Skip' : 'Back',
    current.page === 0 ? close : () => goto(current.page - 1),
    current.page === 0 ? 'ghost' : 'secondary'
  ));
  host.uiButtons.push(host.createLegacyAuthActionButton(
    footer.left + half + gap + (half / 2), centerY, half, footer.height,
    current.page === last ? LEGACY_GUIDE_CLOSE_LABEL : 'Next',
    current.page === last ? close : () => goto(current.page + 1),
    'primary'
  ));  return plan.card;
};
