/**
 * L6 main-menu dropdown (owner pick "Menu A: Dropdown panel", 2026-11-19).
 *
 * One three-line button in the trailing header slot replaces the separate settings / profile / leaderboard corner icons.
 * Tapping it turns the three lines into an X and drops a glass panel under it with one row per destination. A tap on a
 * row opens that surface; a tap on the X, anywhere outside the panel, or Esc closes it; a tap on the panel's own padding
 * does nothing. While the panel is open no tap may start a run (the tap-anywhere start must not fire through it).
 *
 * MAZER-UI-095 / MAZER-UI-096: a played game reuses the same panel, rows and timings for its in-game Menu, and both
 * screens take their rows from one row model (legacyMenuRows.ts): Settings, Guide, Sound first, then Profile and
 * Leaderboard here, Reset level and Main menu in a game. The model is generic over the row id, and a row may carry a
 * right-aligned state word (Sound On/Off) or be disabled (drawn dim, taps on it do nothing).
 *
 * Pure: no Phaser, no DOM. Geometry is whole css px (Phaser CANVAS floors Images/Text, Graphics are exact, so every
 * position the panel hands to text and icon images is an integer). Rendering lives in src/render/menuDropdownArt.ts and
 * src/render/menuDropdownButtons.ts.
 */
import { designTokens } from '../theme/tokens';
import { LEGACY_MIN_HIT_TARGET_PX } from './legacyHitTarget';
import { LEGACY_MENU_ROW_PANEL_WIDTH_PX, buildLegacyMenuRows, type LegacyMainMenuRowId } from './legacyMenuRows';

export type LegacyMenuDropdownItemId = LegacyMainMenuRowId;

export interface LegacyMenuDropdownItem<TId extends string = LegacyMenuDropdownItemId> {
  readonly id: TId;
  /** Visible row label. */
  readonly label: string;
  /** Name published to visual QA; kept equal to the retired corner buttons' names so harnesses keep finding them. */
  readonly semanticAction: string;
  /** Optional state word drawn right-aligned in the row (Sound On/Off). */
  readonly stateText?: string | null;
  /** A disabled row is drawn dim and a tap on it counts as a tap on the panel (nothing happens). */
  readonly disabled?: boolean;
}

/** The main menu's rows with Sound on (the scene rebuilds them with the live Sound state and Profile availability). */
export const LEGACY_MENU_DROPDOWN_ITEMS: readonly LegacyMenuDropdownItem[] = buildLegacyMenuRows('main', { soundEnabled: true });

/** Name the toggle button publishes to visual QA. */
export const LEGACY_MENU_DROPDOWN_TOGGLE_ACTION = 'Menu';

/** Every row is a full touch target (design drew 34 px rows; the 44 px floor wins). */
export const LEGACY_MENU_DROPDOWN_ROW_HEIGHT_PX = Math.max(44, LEGACY_MIN_HIT_TARGET_PX);
export const LEGACY_MENU_DROPDOWN_PANEL_PADDING_Y_PX = 6;
export const LEGACY_MENU_DROPDOWN_PANEL_WIDTH_PX = LEGACY_MENU_ROW_PANEL_WIDTH_PX;
/** Gap between the toggle's touch target and the panel's top edge. */
export const LEGACY_MENU_DROPDOWN_PANEL_GAP_PX = 4;
/** The panel never comes closer than this to a screen edge (plus the device safe area). */
export const LEGACY_MENU_DROPDOWN_EDGE_MARGIN_PX = 8;
export const LEGACY_MENU_DROPDOWN_CORNER_RADIUS_PX = 10;
/** Row icon centre and label left edge, from the panel's left edge. */
export const LEGACY_MENU_DROPDOWN_ICON_CENTER_X_PX = 26;
export const LEGACY_MENU_DROPDOWN_LABEL_LEFT_PX = 48;
export const LEGACY_MENU_DROPDOWN_ICON_SIZE_PX = 20;
export const LEGACY_MENU_DROPDOWN_LABEL_FONT_PX = 15;
/** Right inset of a row's optional state word, from the panel's right edge. */
export const LEGACY_MENU_DROPDOWN_STATE_RIGHT_INSET_PX = 14;
/** Label/icon alpha of a disabled row. */
export const LEGACY_MENU_DROPDOWN_DISABLED_ALPHA = 0.4;
export const LEGACY_MENU_DROPDOWN_OPEN_MS = 180;
/** Close = the registered press motion token (140 ms); open (180 ms) has no token and stays a literal. */
export const LEGACY_MENU_DROPDOWN_CLOSE_MS = designTokens.motionMs.press;
/** The panel slides down this far while it opens. */
export const LEGACY_MENU_DROPDOWN_SLIDE_PX = 10;

export interface LegacyMenuDropdownRect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface LegacyMenuDropdownRowLayout<TId extends string = LegacyMenuDropdownItemId> {
  readonly item: LegacyMenuDropdownItem<TId>;
  readonly rect: LegacyMenuDropdownRect;
  readonly iconCenterX: number;
  readonly labelLeft: number;
  /** Right edge of the optional state word. */
  readonly stateRight: number;
  readonly centerY: number;
}

export interface LegacyMenuDropdownLayout<TId extends string = LegacyMenuDropdownItemId> {
  readonly panel: LegacyMenuDropdownRect;
  readonly rows: readonly LegacyMenuDropdownRowLayout<TId>[];
  /** The toggle's touch target, carried so hit tests need one object. */
  readonly toggle: LegacyMenuDropdownRect;
}

export interface LegacyMenuDropdownLayoutInput<TId extends string = LegacyMenuDropdownItemId> {
  /** The toggle's visual frame (the trailing header slot). */
  readonly toggleFrame: LegacyMenuDropdownRect;
  /** The toggle's touch target (the frame grown to the 44 px floor). */
  readonly toggleHit: LegacyMenuDropdownRect;
  readonly viewport: { readonly width: number; readonly height: number };
  readonly safeArea?: { readonly left?: number; readonly right?: number };
  readonly items?: readonly LegacyMenuDropdownItem<TId>[];
  /** Panel width override (the in-game menu needs room for "Tap again to reset"). Default 176. */
  readonly panelWidth?: number;
}

/**
 * The panel hangs under the toggle, right-aligned to the toggle frame's right edge, and is shifted (never shrunk below
 * the row floor) to stay inside the viewport and safe area. Every value is a whole css px.
 */
export const resolveLegacyMenuDropdownLayout = <TId extends string = LegacyMenuDropdownItemId>(
  input: LegacyMenuDropdownLayoutInput<TId>
): LegacyMenuDropdownLayout<TId> => {
  const items = input.items ?? (LEGACY_MENU_DROPDOWN_ITEMS as unknown as readonly LegacyMenuDropdownItem<TId>[]);
  const safeLeft = Math.max(0, Math.round(input.safeArea?.left ?? 0));
  const safeRight = Math.max(0, Math.round(input.safeArea?.right ?? 0));
  const minLeft = safeLeft + LEGACY_MENU_DROPDOWN_EDGE_MARGIN_PX;
  const maxRight = Math.round(input.viewport.width) - safeRight - LEGACY_MENU_DROPDOWN_EDGE_MARGIN_PX;
  // The panel's right edge lines up with the toggle; the width then shrinks to whatever fits left of that edge (not
  // left of the viewport edge), so a narrow screen with wide safe areas never pushes the panel past the toggle.
  const right = Math.min(maxRight, Math.round(input.toggleFrame.left + input.toggleFrame.width));
  const width = Math.max(
    LEGACY_MIN_HIT_TARGET_PX,
    Math.min(Math.round(input.panelWidth ?? LEGACY_MENU_DROPDOWN_PANEL_WIDTH_PX), right - minLeft)
  );
  const left = Math.max(minLeft, right - width);
  const top = Math.round(input.toggleHit.top + input.toggleHit.height + LEGACY_MENU_DROPDOWN_PANEL_GAP_PX);
  const height = (LEGACY_MENU_DROPDOWN_PANEL_PADDING_Y_PX * 2) + (items.length * LEGACY_MENU_DROPDOWN_ROW_HEIGHT_PX);
  const rows = items.map((item, index): LegacyMenuDropdownRowLayout<TId> => {
    const rowTop = top + LEGACY_MENU_DROPDOWN_PANEL_PADDING_Y_PX + (index * LEGACY_MENU_DROPDOWN_ROW_HEIGHT_PX);
    return {
      centerY: rowTop + (LEGACY_MENU_DROPDOWN_ROW_HEIGHT_PX / 2),
      iconCenterX: left + LEGACY_MENU_DROPDOWN_ICON_CENTER_X_PX,
      item,
      labelLeft: left + LEGACY_MENU_DROPDOWN_LABEL_LEFT_PX,
      rect: { height: LEGACY_MENU_DROPDOWN_ROW_HEIGHT_PX, left, top: rowTop, width },
      stateRight: left + width - LEGACY_MENU_DROPDOWN_STATE_RIGHT_INSET_PX
    };
  });
  return {
    panel: { height, left, top, width },
    rows,
    toggle: {
      height: Math.round(input.toggleHit.height),
      left: Math.round(input.toggleHit.left),
      top: Math.round(input.toggleHit.top),
      width: Math.round(input.toggleHit.width)
    }
  };
};

const inside = (rect: LegacyMenuDropdownRect, x: number, y: number): boolean => (
  x >= rect.left && x <= rect.left + rect.width && y >= rect.top && y <= rect.top + rect.height
);

export type LegacyMenuDropdownTap<TId extends string = LegacyMenuDropdownItemId> =
  | { readonly kind: 'toggle' }
  | { readonly kind: 'row'; readonly id: TId }
  | { readonly kind: 'panel' }
  | { readonly kind: 'outside' };

/**
 * What a tap at (x, y) means while the panel is open. Rows win over the panel; the toggle wins over everything. A
 * disabled row reads as the panel (the tap is swallowed, nothing happens and the panel stays open).
 */
export const resolveLegacyMenuDropdownTap = <TId extends string = LegacyMenuDropdownItemId>(
  layout: LegacyMenuDropdownLayout<TId>,
  point: { readonly x: number; readonly y: number }
): LegacyMenuDropdownTap<TId> => {
  if (inside(layout.toggle, point.x, point.y)) {
    return { kind: 'toggle' };
  }
  const row = layout.rows.find((candidate) => inside(candidate.rect, point.x, point.y));
  if (row !== undefined) {
    return row.item.disabled === true ? { kind: 'panel' } : { id: row.item.id, kind: 'row' };
  }
  if (inside(layout.panel, point.x, point.y)) {
    return { kind: 'panel' };
  }
  return { kind: 'outside' };
};

/** Open/closed with the time of the last change and the visual progress it started from (so a reversal is smooth). */
export interface LegacyMenuDropdownState {
  readonly open: boolean;
  readonly changedAt: number;
  readonly fromProgress: number;
}

export const CLOSED_LEGACY_MENU_DROPDOWN_STATE: LegacyMenuDropdownState = Object.freeze({
  changedAt: Number.NEGATIVE_INFINITY,
  fromProgress: 0,
  open: false
});

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));
/** Cubic ease-out, the same curve the options page drew. */
export const easeOutLegacyMenuDropdown = (t: number): number => 1 - ((1 - clamp01(t)) ** 3);

/** Linear (un-eased) progress 0..1 at `now`; 1 = fully open. Reduced motion jumps straight to the end state. */
export const resolveLegacyMenuDropdownLinearProgress = (
  state: LegacyMenuDropdownState,
  now: number,
  reducedMotion: boolean
): number => {
  const target = state.open ? 1 : 0;
  if (reducedMotion || !Number.isFinite(state.changedAt) || !Number.isFinite(now)) {
    return target;
  }
  const duration = state.open ? LEGACY_MENU_DROPDOWN_OPEN_MS : LEGACY_MENU_DROPDOWN_CLOSE_MS;
  const span = Math.abs(target - state.fromProgress);
  if (span <= 0) {
    return target;
  }
  const t = clamp01((now - state.changedAt) / (duration * span));
  return state.fromProgress + ((target - state.fromProgress) * t);
};

/** Eased progress 0..1 at `now`, for drawing. */
export const resolveLegacyMenuDropdownProgress = (
  state: LegacyMenuDropdownState,
  now: number,
  reducedMotion: boolean
): number => {
  const linear = resolveLegacyMenuDropdownLinearProgress(state, now, reducedMotion);
  return state.open ? easeOutLegacyMenuDropdown(linear) : 1 - easeOutLegacyMenuDropdown(1 - linear);
};

export const setLegacyMenuDropdownOpen = (
  state: LegacyMenuDropdownState,
  open: boolean,
  now: number,
  reducedMotion: boolean,
  instant = false
): LegacyMenuDropdownState => {
  if (state.open === open && !instant) {
    return state;
  }
  if (instant) {
    return { changedAt: Number.NEGATIVE_INFINITY, fromProgress: open ? 1 : 0, open };
  }
  return {
    changedAt: now,
    fromProgress: resolveLegacyMenuDropdownLinearProgress(state, now, reducedMotion),
    open
  };
};

/** Row label/icon alpha: rows fade in one after another as the panel opens (design: clamp(o * 2.2 - i * 0.3)). */
export const resolveLegacyMenuDropdownRowAlpha = (progress: number, index: number): number => (
  clamp01((progress * 2.2) - (index * 0.3))
);

/** Whole-px vertical offset of the panel while it slides in (negative = above its resting place). */
export const resolveLegacyMenuDropdownSlideOffset = (progress: number): number => (
  // 0 - x, not -x: a settled panel reports +0 (never -0).
  0 - Math.round((1 - clamp01(progress)) * LEGACY_MENU_DROPDOWN_SLIDE_PX)
);

export interface LegacyMenuBurgerSegment {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
  readonly alpha: number;
}

/**
 * The three lines of the toggle at progress 0..1: the top and bottom lines slide to the centre and rotate +-45 degrees
 * into an X while the middle line fades out. `halfWidth` is half a line's length, `gap` the closed line spacing.
 */
export const resolveLegacyMenuBurgerSegments = (
  centerX: number,
  centerY: number,
  halfWidth: number,
  gap: number,
  progress: number
): readonly LegacyMenuBurgerSegment[] => {
  const o = clamp01(progress);
  const offset = gap * (1 - o);
  const angle = o * (Math.PI / 4);
  const dx = Math.cos(angle) * halfWidth;
  const dy = Math.sin(angle) * halfWidth;
  return [
    { alpha: 1, x1: centerX - dx, x2: centerX + dx, y1: centerY - offset - dy, y2: centerY - offset + dy },
    { alpha: 1 - o, x1: centerX - halfWidth, x2: centerX + halfWidth, y1: centerY, y2: centerY },
    { alpha: 1, x1: centerX - dx, x2: centerX + dx, y1: centerY + offset + dy, y2: centerY + offset - dy }
  ];
};

/** Line geometry for a toggle frame of `size` css px (the trailing header slot is 32-40 px). */
export const resolveLegacyMenuBurgerMetrics = (size: number): { halfWidth: number; gap: number; lineWidth: number } => ({
  gap: Math.max(4, Math.round(size * 0.16)),
  halfWidth: Math.max(7, Math.round(size * 0.28)),
  lineWidth: Math.max(2, Math.round(size * 0.075 * 10) / 10)
});
