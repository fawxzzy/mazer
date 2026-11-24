/**
 * Mode-select sheet plan (MAZER-MODE-002). Contract: docs/architecture/MAZER-GAME-MODES-PRODUCT-CONTRACT.md,
 * sections 8 to 13. Play on the main menu opens this sheet; choosing a mode starts that mode's run.
 *
 * Layout (owner decision 2026-11-24): a Stack (one full-width card per mode, tap a playable card to
 * start it) while there are up to three entries, flipping to Tiles (two-column grid, detail strip and
 * a Play button) when there are more. One item model feeds both, so adding a mode only changes the list.
 * Same card, title slot, padding and 48 px kit actions as the Settings / Leaderboard sheets
 * (LEGACY_SETTINGS_SIZES), so the sheet cannot drift from them.
 *
 * Pure: no Phaser, no DOM, no storage, no network.
 */
import { LEGACY_GAME_MODES, type LegacyGameModeId } from './legacyGameModes';
import { LEGACY_SETTINGS_SIZES, type LegacySettingsRect } from './legacySettingsSheetPlan';
import { LEGACY_UI_COMPACT_BREAKPOINT, resolveLegacyOverlayPanelLayout } from './legacyUiStandards';

export type LegacyModeSelectVariant = 'stack' | 'tiles';
export type LegacyModeSelectRect = LegacySettingsRect;

/** The Stack holds this many entries (playable plus locked); one more flips the sheet to Tiles. */
export const LEGACY_MODE_SELECT_STACK_MAX_ITEMS = 3;

export interface LegacyModeSelectItem {
  /** A registered mode id for a playable entry; 'locked' for the plain "More soon" slot. */
  readonly id: LegacyGameModeId | 'locked';
  readonly label: string;
  readonly playable: boolean;
  /** One plain line under the name. */
  readonly tagline: string;
  /** Per-mode facts (level, rank). Empty for a locked slot. */
  readonly stats: readonly { readonly label: string; readonly value: string }[];
}

export interface LegacyModeSelectProgress {
  readonly level: number | string;
  readonly rank: string;
}

/** Player-facing line per registered mode. A new registry mode must add one here (pinned by a test). */
export const LEGACY_MODE_SELECT_TAGLINES: Readonly<Record<LegacyGameModeId, string>> = Object.freeze({
  endless: 'Every level harder than the last'
});

export const LEGACY_MODE_SELECT_LOCKED_SLOT: LegacyModeSelectItem = Object.freeze({
  id: 'locked',
  label: 'More soon',
  playable: false,
  stats: Object.freeze([]),
  tagline: 'New modes land here'
});

/**
 * The sheet's entries: every registered mode in registry order with that mode's own stats, then one
 * plain locked "More soon" slot. Stats are read from the progression the player already has (Endless
 * is today's single ladder, so its stats are the existing level and rank, untouched).
 */
export const buildLegacyModeSelectItems = (progress: LegacyModeSelectProgress): LegacyModeSelectItem[] => [
  ...LEGACY_GAME_MODES.map((mode): LegacyModeSelectItem => ({
    id: mode.id,
    label: mode.label,
    playable: true,
    stats: [{ label: 'Level', value: String(progress.level) }, { label: 'Rank', value: String(progress.rank) }],
    tagline: LEGACY_MODE_SELECT_TAGLINES[mode.id]
  })),
  LEGACY_MODE_SELECT_LOCKED_SLOT
];

export const resolveLegacyModeSelectVariant = (itemCount: number): LegacyModeSelectVariant => (
  itemCount > LEGACY_MODE_SELECT_STACK_MAX_ITEMS ? 'tiles' : 'stack'
);

export const LEGACY_MODE_SELECT_SIZES = Object.freeze({
  cardHeightStack: 92,
  tileHeight: 156,
  tileGap: 12,
  detailHeight: 64,
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
  /** Tiles only: the one Play action. The Stack uses the playable card itself as the action. */
  readonly play: { readonly rect: LegacyModeSelectRect; readonly label: string; readonly disabled: boolean } | null;
  readonly back: LegacyModeSelectRect;
  readonly backLabel: string;
  /** Tiles only: the selected mode's detail strip. */
  readonly detail: LegacyModeSelectRect | null;
  readonly naturalCardHeight: number;
}

const rect = (left: number, top: number, width: number, height: number): LegacyModeSelectRect => ({ height, left, top, width });

export const buildLegacyModeSelectPlan = (
  items: readonly LegacyModeSelectItem[],
  selectedIndex: number,
  width: number,
  height: number,
  safeArea: { bottom?: number; top?: number } = {}
): LegacyModeSelectPlan => {
  const s = LEGACY_SETTINGS_SIZES;
  const z = LEGACY_MODE_SELECT_SIZES;
  const variant = resolveLegacyModeSelectVariant(items.length);
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
  let detail: LegacyModeSelectRect | null = null;
  let back: LegacyModeSelectRect;

  if (variant === 'stack') {
    items.forEach((item, index) => {
      planItems.push({ index, item, rect: rect(left, y, innerWidth, z.cardHeightStack), selected: index === sel });
      y += z.cardHeightStack + z.gap;
    });
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
    play = { disabled: !playable, label: playable ? `Play ${current.label}` : 'Locked', rect: rect(left, y, innerWidth, z.actionHeight) };
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
    play,
    title: { centerX: panel.centerX, centerY: cardTop + pad + Math.round(titleHeight / 2), text: 'Choose a mode' },
    variant
  };
};
