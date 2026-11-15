/**
 * MAZER-UI-033: geometry for the main-menu "online now" counter, an exact copy of the website header counter
 * (FawxzzyWeb `.site-nav__presence`): a round dot, then the number, then the word "online", left to right.
 *
 *   live:  dot (8px, accent, glow, pulse 1 -> 0.55 -> 1 over 2.6s)  "7 online"   (muted 13px text, same size for both)
 *   idle:  dim dot only (opacity 0.35), no number, no word
 *
 * The row sits where the signed-in username used to be: right of the leading header icon, on its centre line, never
 * past the inline title's left edge. Pure: no Phaser, no DOM (text width is measured by an injected function).
 * Fit tiers, first that fits wins: dot + "N online", dot + "N", dot alone. Nothing ever overlaps the icon or title.
 */
import { resolveLegacyHeaderControlFrame } from './legacyHeaderControl';
import { resolveLegacyMenuPathTitleLayout, resolveLegacyMenuTitleFontSize } from './legacyMenuTitle';

export const LEGACY_PRESENCE_WORD = 'online';
export const LEGACY_PRESENCE_ICON_GAP_PX = 8;
export const LEGACY_PRESENCE_TITLE_GAP_PX = 4;
/** Web: 0.5rem. */
export const LEGACY_PRESENCE_DOT_DIAMETER_PX = 8;
/** Web: gap 0.45rem. */
export const LEGACY_PRESENCE_DOT_GAP_PX = 7;
/** Web: font-size 0.82rem (13px); Mazer draws it at 12px (readability pass, MAZER-UI-056). */
export const LEGACY_PRESENCE_FONT_PX = 12;
/** Dark outline around the number and word so they stay readable over the menu board and glow. */
export const LEGACY_PRESENCE_TEXT_STROKE_PX = 3;
export const LEGACY_PRESENCE_PULSE_MS = 2600;
export const LEGACY_PRESENCE_PULSE_LOW_ALPHA = 0.55;
export const LEGACY_PRESENCE_IDLE_DOT_ALPHA = 0.35;
/** Web: box-shadow 0 0 10px accent at 0.55. */
export const LEGACY_PRESENCE_GLOW_RADIUS_PX = 8;
export const LEGACY_PRESENCE_GLOW_ALPHA = 0.4;
/** The drawn inline MAZER wordmark is 5 letters of 5 columns and 4 single-column gaps. */
export const LEGACY_PRESENCE_INLINE_TITLE_COLUMNS = 29;
/** Phaser object name for QA lookups. */
export const LEGACY_PRESENCE_COUNTER_NAME = 'header-online-counter';

export interface LegacyPresenceCounterLayout {
  readonly visible: boolean;
  /** Dot centre and radius (always present when visible). */
  readonly dot: { readonly centerX: number; readonly centerY: number; readonly radius: number } | null;
  /** The number (+ word) text, null when idle or when only the dot fits. */
  readonly text: { readonly left: number; readonly centerY: number; readonly value: string } | null;
  readonly right: number;
  readonly slotLeft: number;
  readonly slotRight: number;
}

export interface LegacyPresenceCounterLayoutInput {
  readonly leadingRight: number;
  readonly centerY: number;
  /** Left edge of the inline title (or of the leftmost trailing control when the title is not inline). */
  readonly titleLeft: number;
  readonly viewportWidth: number;
  /** Web-format count text (formatOnline: `7`, `1.2k`, `12k`), or null/empty for the idle dim dot. */
  readonly countText: string | null | undefined;
  /** Width in px of a string in the counter font. */
  readonly measure: (value: string) => number;
}

const HIDDEN = (slotLeft: number, slotRight: number): LegacyPresenceCounterLayout => ({
  dot: null,
  right: slotLeft,
  slotLeft,
  slotRight,
  text: null,
  visible: false
});

export const resolveLegacyPresenceCounterLayout = (
  input: LegacyPresenceCounterLayoutInput
): LegacyPresenceCounterLayout => {
  const slotLeft = Number.isFinite(input.leadingRight) ? input.leadingRight + LEGACY_PRESENCE_ICON_GAP_PX : 0;
  const slotRight = Number.isFinite(input.titleLeft) && Number.isFinite(input.viewportWidth)
    ? Math.min(input.titleLeft - LEGACY_PRESENCE_TITLE_GAP_PX, input.viewportWidth - 8)
    : slotLeft;
  const room = slotRight - slotLeft;
  if (!Number.isFinite(input.centerY) || room < LEGACY_PRESENCE_DOT_DIAMETER_PX) {
    return HIDDEN(slotLeft, slotRight);
  }
  const count = typeof input.countText === 'string' ? input.countText.trim() : '';
  const dot = {
    centerX: slotLeft + (LEGACY_PRESENCE_DOT_DIAMETER_PX / 2),
    centerY: input.centerY,
    radius: LEGACY_PRESENCE_DOT_DIAMETER_PX / 2
  };
  const textLeft = slotLeft + LEGACY_PRESENCE_DOT_DIAMETER_PX + LEGACY_PRESENCE_DOT_GAP_PX;
  const candidates = count.length === 0 || !/^[0-9]+(\.[0-9])?k?$/u.test(count)
    ? []
    : [`${count} ${LEGACY_PRESENCE_WORD}`, count];
  for (const value of candidates) {
    const width = input.measure(value);
    if (Number.isFinite(width) && textLeft + width <= slotRight) {
      return {
        dot,
        right: textLeft + width,
        slotLeft,
        slotRight,
        text: { centerY: input.centerY, left: textLeft, value },
        visible: true
      };
    }
  }
  return { dot, right: slotLeft + LEGACY_PRESENCE_DOT_DIAMETER_PX, slotLeft, slotRight, text: null, visible: true };
};

/** Dot opacity: web keyframes 1 -> 0.55 (50%) -> 1 over 2.6s ease-in-out; static (1) under Reduce Motion; 0.35 when idle. */
export const resolveLegacyPresenceDotAlpha = (live: boolean, timeMs: number, reducedMotion: boolean): number => {
  if (!live) {
    return LEGACY_PRESENCE_IDLE_DOT_ALPHA;
  }
  if (reducedMotion || !Number.isFinite(timeMs)) {
    return 1;
  }
  const phase = (((timeMs % LEGACY_PRESENCE_PULSE_MS) + LEGACY_PRESENCE_PULSE_MS) % LEGACY_PRESENCE_PULSE_MS) / LEGACY_PRESENCE_PULSE_MS;
  const dip = 0.5 - (0.5 * Math.cos(phase * Math.PI * 2));
  return 1 - ((1 - LEGACY_PRESENCE_PULSE_LOW_ALPHA) * dip);
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
  readonly countText: string | null | undefined;
  readonly measure: (value: string) => number;
}

/** Real header geometry: the leading icon frame and the drawn inline title's left edge. */
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
  let titleLeft = trailingLeft;
  if (titleInline) {
    const path = resolveLegacyMenuPathTitleLayout(layout.titleX, 0, resolveLegacyMenuTitleFontSize(layout.titleReserveHeight));
    titleLeft = Math.round(layout.titleX - ((LEGACY_PRESENCE_INLINE_TITLE_COLUMNS * path.cellSize) / 2));
  }
  return resolveLegacyPresenceCounterLayout({
    centerY: leading.centerY,
    countText: input.countText,
    leadingRight: leading.right,
    measure: input.measure,
    titleLeft,
    viewportWidth: layout.width
  });
};
