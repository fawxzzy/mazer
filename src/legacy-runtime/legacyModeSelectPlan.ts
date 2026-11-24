/**
 * DESIGN-OPTIONS PROTOTYPE (2026-11-23, not shipped): pure layout plan for the mode-select sheet that
 * opens after the main menu's Play. Contract: docs/architecture/MAZER-GAME-MODES-PRODUCT-CONTRACT.md,
 * section 9. Three layout variants share one item model so Zac can pick a layout, not a data shape:
 *   stack  full-width cards in a column (scales by scrolling),
 *   pager  one big card at a time with dots and arrows, one Play button,
 *   tiles  a two-column grid of square tiles with a detail strip and one Play button.
 * Same card, title slot, padding and 48 px kit actions as the Settings / Leaderboard sheets
 * (LEGACY_SETTINGS_SIZES), so the sheet cannot drift from them. Pure: no Phaser, no DOM, no storage.
 */
import { LEGACY_SETTINGS_SIZES, type LegacySettingsRect } from './legacySettingsSheetPlan';
import { LEGACY_UI_COMPACT_BREAKPOINT, resolveLegacyOverlayPanelLayout } from './legacyUiStandards';

export type LegacyModeSelectVariant = 'stack' | 'pager' | 'tiles';
export type LegacyModeSelectRect = LegacySettingsRect;

export interface LegacyModeSelectItem {
  readonly id: string;
  readonly label: string;
  readonly playable: boolean;
  /** One plain line under the name. */
  readonly tagline: string;
  /** Per-mode facts (level, rank). Empty for a locked slot. */
  readonly stats: readonly { readonly label: string; readonly value: string }[];
}

export const LEGACY_MODE_SELECT_SIZES = Object.freeze({
  cardHeightStack: 92,
  tileHeight: 156,
  tileGap: 12,
  pagerHeight: 232,
  detailHeight: 64,
  dotSize: 8,
  dotGap: 12,
  gap: LEGACY_SETTINGS_SIZES.sectionGap,
  actionHeight: LEGACY_SETTINGS_SIZES.actionHeight
});

export interface LegacyModeSelectPlanItem {
  readonly item: LegacyModeSelectItem;
  readonly index: number;
  readonly rect: LegacyModeSelectRect;
  readonly selected: boolean;
}

export interface LegacyModeSelectPlan {
  readonly variant: LegacyModeSelectVariant;
  readonly card: LegacyModeSelectRect;
  readonly title: { readonly centerX: number; readonly centerY: number; readonly text: string };
  readonly items: readonly LegacyModeSelectPlanItem[];
  /** The one Play action (pager, tiles); stack uses the playable card itself as the primary. */
  readonly play: { readonly rect: LegacyModeSelectRect; readonly label: string; readonly disabled: boolean } | null;
  readonly back: LegacyModeSelectRect;
  readonly backLabel: string;
  readonly pager: {
    readonly prev: LegacyModeSelectRect;
    readonly next: LegacyModeSelectRect;
    readonly dots: readonly { readonly cx: number; readonly cy: number; readonly active: boolean }[];
  } | null;
  /** Tiles: the selected mode's detail strip. */
  readonly detail: LegacyModeSelectRect | null;
  readonly naturalCardHeight: number;
}

const rect = (left: number, top: number, width: number, height: number): LegacyModeSelectRect => ({ height, left, top, width });

export const buildLegacyModeSelectPlan = (
  variant: LegacyModeSelectVariant,
  items: readonly LegacyModeSelectItem[],
  selectedIndex: number,
  width: number,
  height: number,
  safeArea: { bottom?: number; top?: number } = {}
): LegacyModeSelectPlan => {
  const s = LEGACY_SETTINGS_SIZES;
  const z = LEGACY_MODE_SELECT_SIZES;
  const panel = resolveLegacyOverlayPanelLayout(width, height, safeArea);
  const compact = panel.width < LEGACY_UI_COMPACT_BREAKPOINT;
  const pad = compact ? s.cardPaddingCompact : s.cardPaddingRegular;
  const titleHeight = compact ? s.titleHeightCompact : s.titleHeightRegular;
  const titleGap = compact ? s.titleGapCompact : s.titleGapRegular;
  const cardWidth = Math.min(compact ? 360 : 400, Math.max(1, panel.width - (compact ? 16 : 48)));
  const innerWidth = Math.max(1, cardWidth - (pad * 2));
  const sel = Math.max(0, Math.min(items.length - 1, selectedIndex));

  const head = (pad * 2) + titleHeight + titleGap;
  let body = 0;
  if (variant === 'stack') {
    body = (items.length * z.cardHeightStack) + (Math.max(0, items.length - 1) * z.gap) + z.gap + z.actionHeight;
  } else if (variant === 'pager') {
    body = z.pagerHeight + z.gap + z.dotSize + z.gap + z.actionHeight + z.gap + z.actionHeight;
  } else {
    const rows = Math.ceil(items.length / 2);
    body = (rows * z.tileHeight) + (Math.max(0, rows - 1) * z.tileGap) + z.gap + z.detailHeight + z.gap + z.actionHeight + z.gap + z.actionHeight;
  }
  const naturalCardHeight = head + body;
  const cardHeight = Math.min(naturalCardHeight, panel.height);
  const cardTop = Math.round(panel.top + ((panel.height - cardHeight) / 2));
  const cardLeft = Math.round(panel.centerX - (cardWidth / 2));
  const left = cardLeft + pad;
  let y = cardTop + pad + titleHeight + titleGap;

  const planItems: LegacyModeSelectPlanItem[] = [];
  let play: LegacyModeSelectPlan['play'] = null;
  let pager: LegacyModeSelectPlan['pager'] = null;
  let detail: LegacyModeSelectRect | null = null;
  let back: LegacyModeSelectRect;

  if (variant === 'stack') {
    items.forEach((item, index) => {
      planItems.push({ index, item, rect: rect(left, y, innerWidth, z.cardHeightStack), selected: index === sel });
      y += z.cardHeightStack + z.gap;
    });
    back = rect(left, y, innerWidth, z.actionHeight);
  } else if (variant === 'pager') {
    const current = items[sel];
    if (current !== undefined) {
      planItems.push({ index: sel, item: current, rect: rect(left, y, innerWidth, z.pagerHeight), selected: true });
    }
    y += z.pagerHeight + z.gap;
    const dotsWidth = (items.length * z.dotSize) + (Math.max(0, items.length - 1) * z.dotGap);
    const dotsLeft = Math.round(left + ((innerWidth - dotsWidth) / 2));
    pager = {
      dots: items.map((_, index) => ({ active: index === sel, cx: dotsLeft + (index * (z.dotSize + z.dotGap)) + (z.dotSize / 2), cy: y + (z.dotSize / 2) })),
      next: rect(left + innerWidth - 48, planItems[0]!.rect.top + Math.round((z.pagerHeight - 48) / 2), 48, 48),
      prev: rect(left, planItems[0]!.rect.top + Math.round((z.pagerHeight - 48) / 2), 48, 48)
    };
    y += z.dotSize + z.gap;
    const playable = current?.playable === true;
    play = { disabled: !playable, label: playable ? `Play ${current.label}` : 'Coming soon', rect: rect(left, y, innerWidth, z.actionHeight) };
    y += z.actionHeight + z.gap;
    back = rect(left, y, innerWidth, z.actionHeight);
  } else {
    const tileWidth = Math.floor((innerWidth - z.tileGap) / 2);
    items.forEach((item, index) => {
      const col = index % 2;
      const row = Math.floor(index / 2);
      planItems.push({
        index,
        item,
        rect: rect(left + (col * (tileWidth + z.tileGap)), y + (row * (z.tileHeight + z.tileGap)), tileWidth, z.tileHeight),
        selected: index === sel
      });
    });
    const rows = Math.ceil(items.length / 2);
    y += (rows * z.tileHeight) + (Math.max(0, rows - 1) * z.tileGap) + z.gap;
    detail = rect(left, y, innerWidth, z.detailHeight);
    y += z.detailHeight + z.gap;
    const current = items[sel];
    const playable = current?.playable === true;
    play = { disabled: !playable, label: playable ? `Play ${current.label}` : 'Coming soon', rect: rect(left, y, innerWidth, z.actionHeight) };
    y += z.actionHeight + z.gap;
    back = rect(left, y, innerWidth, z.actionHeight);
  }

  return {
    back,
    backLabel: 'Back to Menu',
    card: rect(cardLeft, cardTop, cardWidth, cardHeight),
    detail,
    items: planItems,
    naturalCardHeight,
    pager,
    play,
    title: { centerX: panel.centerX, centerY: cardTop + pad + Math.round(titleHeight / 2), text: 'Choose a mode' },
    variant
  };
};

export interface LegacyModeSelectPreviewFlags {
  readonly variant: LegacyModeSelectVariant | null;
  readonly autoOpen: boolean;
  readonly sample: boolean;
  readonly index: number;
}

/** Prototype-only URL flags: ?modeSelectPreview=A|B|C, &modeSelectOpen=1, &modeSelectSample=1, &modeSelectIndex=N. */
export const readLegacyModeSelectPreviewFlags = (search: string): LegacyModeSelectPreviewFlags => {
  const params = new URLSearchParams(search);
  const raw = (params.get('modeSelectPreview') ?? '').toLowerCase();
  const variant: LegacyModeSelectVariant | null = raw === 'a' ? 'stack' : raw === 'b' ? 'pager' : raw === 'c' ? 'tiles' : null;
  const index = Number(params.get('modeSelectIndex') ?? 0);
  return {
    autoOpen: params.get('modeSelectOpen') === '1',
    index: Number.isInteger(index) && index >= 0 ? index : 0,
    sample: params.get('modeSelectSample') === '1',
    variant
  };
};
