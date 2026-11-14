/**
 * MAZER-UI-024: geometry for the main-menu "online now" counter.
 *
 * The counter sits where the signed-in username used to be: immediately right of the leading
 * header icon, on that icon's centre line, and never past the inline title's left edge. It is
 * built from the tile glyph font (5x7 chip cells, see legacyMenuTitle.ts) so it reads as the same
 * material as the wordmark. Pure: no Phaser, no DOM.
 *
 * Fit tiers, tried in order, first that fits wins: the number plus the word ONLINE at cell 3, then
 * at cell 2, then the number alone at cell 3, then at cell 2. A pulse dot is added to a tier only
 * when it also fits. When not even a one-digit number at cell 2 fits, the counter is hidden;
 * it never overlaps the icon or the title.
 */
import { resolveLegacyHeaderControlFrame } from './legacyHeaderControl';
import { resolveLegacyGlyphWordColumns, resolveLegacyMenuPathTitleLayout, resolveLegacyMenuTitleFontSize } from './legacyMenuTitle';

export const LEGACY_PRESENCE_WORD = 'ONLINE';
export const LEGACY_PRESENCE_ICON_GAP_PX = 8;
export const LEGACY_PRESENCE_TITLE_GAP_PX = 8;
export const LEGACY_PRESENCE_DOT_DIAMETER_PX = 6;
export const LEGACY_PRESENCE_DOT_GAP_PX = 6;
export const LEGACY_PRESENCE_WORD_GAP_PX = 8;
export const LEGACY_PRESENCE_CELL_SIZES: readonly number[] = Object.freeze([3, 2]);
/** Phaser object name for QA lookups. */
export const LEGACY_PRESENCE_COUNTER_NAME = 'header-online-counter';

export interface LegacyPresenceRect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface LegacyPresenceCounterLayout {
  readonly visible: boolean;
  readonly cell: number;
  /** Pulse dot centre and radius, or null when it does not fit (or Reduce Motion asked for none). */
  readonly dot: { readonly centerX: number; readonly centerY: number; readonly radius: number } | null;
  readonly number: (LegacyPresenceRect & { readonly text: string }) | null;
  readonly word: (LegacyPresenceRect & { readonly text: string }) | null;
  /** Right edge of everything drawn (== left when hidden). */
  readonly right: number;
  /** Left bound of the free slot and its right limit, for tests and diagnostics. */
  readonly slotLeft: number;
  readonly slotRight: number;
}

export interface LegacyPresenceCounterLayoutInput {
  /** Right edge of the leading header icon frame. */
  readonly leadingRight: number;
  /** Vertical centre of the leading header icon frame. */
  readonly centerY: number;
  /** Left edge of the inline title (or of the leftmost trailing control when the title is not inline). */
  readonly titleLeft: number;
  readonly viewportWidth: number;
  /** Glyph-safe text from formatOnlineGlyph (digits, optionally ending in K). */
  readonly text: string | null | undefined;
  /** Draw the pulse dot when there is room (false under Reduce Motion: the dot only exists to pulse). */
  readonly showDot: boolean;
}

const HIDDEN = (slotLeft: number, slotRight: number): LegacyPresenceCounterLayout => ({
  cell: 0,
  dot: null,
  number: null,
  right: slotLeft,
  slotLeft,
  slotRight,
  visible: false,
  word: null
});

export const resolveLegacyPresenceCounterLayout = (
  input: LegacyPresenceCounterLayoutInput
): LegacyPresenceCounterLayout => {
  const slotLeft = Number.isFinite(input.leadingRight) ? input.leadingRight + LEGACY_PRESENCE_ICON_GAP_PX : 0;
  const slotRight = Number.isFinite(input.titleLeft) && Number.isFinite(input.viewportWidth)
    ? Math.min(input.titleLeft - LEGACY_PRESENCE_TITLE_GAP_PX, input.viewportWidth - 8)
    : slotLeft;
  const text = typeof input.text === 'string' ? input.text.trim().toUpperCase() : '';
  if (text.length === 0 || !/^[0-9]+K?$/u.test(text) || !Number.isFinite(input.centerY) || slotRight <= slotLeft) {
    return HIDDEN(slotLeft, slotRight);
  }
  const room = slotRight - slotLeft;
  const numberColumns = resolveLegacyGlyphWordColumns(text);
  const wordColumns = resolveLegacyGlyphWordColumns(LEGACY_PRESENCE_WORD);
  const dotWidth = LEGACY_PRESENCE_DOT_DIAMETER_PX + LEGACY_PRESENCE_DOT_GAP_PX;

  const tiers: Array<{ cell: number; word: boolean }> = [];
  for (const withWord of [true, false]) {
    for (const cell of LEGACY_PRESENCE_CELL_SIZES) {
      tiers.push({ cell, word: withWord });
    }
  }
  for (const tier of tiers) {
    const numberWidth = numberColumns * tier.cell;
    const wordWidth = tier.word ? LEGACY_PRESENCE_WORD_GAP_PX + (wordColumns * tier.cell) : 0;
    const bare = numberWidth + wordWidth;
    const withDot = input.showDot ? bare + dotWidth : null;
    const useDot = withDot !== null && withDot <= room;
    const total = useDot ? (withDot as number) : bare;
    if (total > room) {
      continue;
    }
    const height = 7 * tier.cell;
    const top = Math.round(input.centerY - (height / 2));
    let cursor = slotLeft;
    let dot: LegacyPresenceCounterLayout['dot'] = null;
    if (useDot) {
      dot = {
        centerX: cursor + (LEGACY_PRESENCE_DOT_DIAMETER_PX / 2),
        centerY: input.centerY,
        radius: LEGACY_PRESENCE_DOT_DIAMETER_PX / 2
      };
      cursor += dotWidth;
    }
    const number = { height, left: cursor, text, top, width: numberWidth };
    cursor += numberWidth;
    let word: LegacyPresenceCounterLayout['word'] = null;
    if (tier.word) {
      cursor += LEGACY_PRESENCE_WORD_GAP_PX;
      word = { height, left: cursor, text: LEGACY_PRESENCE_WORD, top, width: wordColumns * tier.cell };
      cursor += wordColumns * tier.cell;
    }
    return { cell: tier.cell, dot, number, right: cursor, slotLeft, slotRight, visible: true, word };
  }
  return HIDDEN(slotLeft, slotRight);
};

export interface LegacyPresenceCounterPlacementInput {
  readonly layout: {
    readonly width: number;
    readonly height: number;
    readonly headerIconScale: number;
    readonly headerSafeInset?: { readonly left: number; readonly right: number };
    readonly titleX: number;
    readonly titleReserveHeight: number;
    readonly lanes: {
      readonly hud: { readonly top: number; readonly height: number } | null;
      readonly title: unknown | null;
    };
  };
  readonly text: string | null | undefined;
  readonly showDot: boolean;
}

/**
 * Real header geometry: the leading icon frame (the icon the counter sits beside) and the inline
 * title's left edge, the same two sources the old username label used.
 */
export const resolveLegacyPresenceCounterPlacement = (
  input: LegacyPresenceCounterPlacementInput
): LegacyPresenceCounterLayout => {
  const { layout } = input;
  const hudHeight = layout.lanes.hud?.height ?? 64;
  const hudTop = layout.lanes.hud?.top ?? 0;
  const base = {
    height: layout.height,
    hudHeight,
    hudTop,
    safeArea: layout.headerSafeInset,
    sizeScale: layout.headerIconScale,
    width: layout.width
  };
  const leading = resolveLegacyHeaderControlFrame({ ...base, placement: 'leading' });
  const titleInline = layout.lanes.title === null;
  const trailingLeft = Math.min(
    resolveLegacyHeaderControlFrame({ ...base, placement: 'trailing' }).left,
    resolveLegacyHeaderControlFrame({ ...base, placement: 'trailing', slot: 1 }).left
  );
  const titleLeft = titleInline
    ? resolveLegacyMenuPathTitleLayout(layout.titleX, 0, resolveLegacyMenuTitleFontSize(layout.titleReserveHeight)).left
    : trailingLeft;
  return resolveLegacyPresenceCounterLayout({
    centerY: leading.centerY,
    leadingRight: leading.right,
    showDot: input.showDot,
    text: input.text,
    titleLeft,
    viewportWidth: layout.width
  });
};
