/**
 * Scene-facing placement for the header identity label (the canonical
 * username shown top-left, immediately right of the profile icon).
 *
 * Pure: no Phaser, no DOM. It feeds legacyHeaderIdentity.ts the REAL header
 * geometry instead of that module's assumed 220 px title footprint:
 *  - the profile icon frame comes from resolveLegacyHeaderControlFrame (the
 *    same call the icon itself uses);
 *  - the title's left edge comes from resolveLegacyMenuPathTitleLayout, the
 *    same layout the scene draws and reports as `title.bounds` in the runtime
 *    diagnostics (measured 2026-11-05: left 113 / width 164 at 390x844,
 *    left 99 / width 123 at 320x568; see
 *    ~/.claude/closeouts/ui-header-measurements-2026-11-05.md);
 *  - when the title is not inline in the header row (fallback lane), the
 *    label is bounded by the leftmost trailing header control instead.
 *
 * The edge diamonds sit at fixed positions BEHIND all UI (edgeMarkers.ts), so
 * the label no longer avoids them.
 */
import { resolveLegacyHeaderControlFrame } from './legacyHeaderControl';
import {
  LEGACY_HEADER_IDENTITY_PREFERRED_FONT_PX,
  resolveLegacyHeaderIdentityLayout,
  type LegacyHeaderIdentityLayout,
  type LegacyUiSizedTextMeasure
} from './legacyHeaderIdentity';
import { resolveLegacyMenuPathTitleLayout, resolveLegacyMenuTitleFontSize } from './legacyMenuTitle';

/** Phaser object name of the on-screen label (QA scripts find it by this). */
export const LEGACY_HEADER_IDENTITY_LABEL_NAME = 'header-identity';

/** Below this viewport width the label uses the short form (fewer visible characters). */
export const LEGACY_HEADER_IDENTITY_SHORT_FORM_MAX_WIDTH_PX = 360;
/** Visible-character floor of the short form (320 px: ~41 px of room fits "qa-p..." style stubs). */
export const LEGACY_HEADER_IDENTITY_SHORT_FORM_MIN_VISIBLE_CHARS = 4;

/** The label is rasterised at the device pixel ratio, capped here. */
export const LEGACY_HEADER_IDENTITY_LABEL_MAX_RESOLUTION = 3;
/** Vertical padding (px, top and bottom) so descenders are never clipped; no stroke, no plate. */
export const LEGACY_HEADER_IDENTITY_LABEL_PADDING_Y_PX = 2;

/** min(3, devicePixelRatio), never below 1 and never NaN. */
export const resolveLegacyHeaderIdentityLabelResolution = (devicePixelRatio: number): number => (
  Number.isFinite(devicePixelRatio) && devicePixelRatio >= 1
    ? Math.min(LEGACY_HEADER_IDENTITY_LABEL_MAX_RESOLUTION, devicePixelRatio)
    : 1
);

export interface LegacyHeaderRect {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/**
 * The three header controls (profile, leaderboard, settings) exactly as
 * MenuScene lays them out: the same resolveLegacyHeaderControlFrame inputs the
 * draw/hit-test code uses.
 */
export const resolveHeaderControlRects = (layout: {
  readonly width: number;
  readonly height: number;
  readonly headerIconScale: number;
  readonly headerSafeInset?: { readonly left: number; readonly right: number };
  readonly lanes: { readonly hud: { readonly top: number; readonly height: number } | null };
}): ReadonlyArray<LegacyHeaderRect> => {
  const base = {
    height: layout.height,
    hudHeight: layout.lanes.hud?.height ?? 64,
    hudTop: layout.lanes.hud?.top ?? 0,
    safeArea: layout.headerSafeInset,
    sizeScale: layout.headerIconScale,
    width: layout.width
  };
  return [
    resolveLegacyHeaderControlFrame({ ...base, placement: 'leading' }),
    resolveLegacyHeaderControlFrame({ ...base, placement: 'trailing' }),
    resolveLegacyHeaderControlFrame({ ...base, placement: 'trailing', slot: 1 })
  ].map((frame) => ({ left: frame.left, top: frame.top, right: frame.right, bottom: frame.bottom }));
};

export interface LegacyHeaderIdentityPlacementLayout {
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
}

export interface LegacyHeaderIdentityPlacementInput {
  layout: LegacyHeaderIdentityPlacementLayout;
  /** Canonical username only (never an email); null/empty hides the label. */
  username: string | null | undefined;
  /** Real text measure (scene closes over its Text object); includes stroke/padding. */
  measure: LegacyUiSizedTextMeasure;
  /** Rendered text-box height in px at a given font size (includes stroke/padding). */
  measureHeight?: (fontPx: number) => number;
}

export interface LegacyHeaderIdentityPlacement {
  identity: LegacyHeaderIdentityLayout;
  /** True when the label is shown. */
  visible: boolean;
  /** Left-anchored, vertically centered anchor point for a Phaser text (origin 0, 0.5). */
  anchor: { x: number; y: number } | null;
  /** Text rect when visible. */
  rect: LegacyHeaderRect | null;
  profileFrame: LegacyHeaderRect & { centerY: number };
  /** Right limit the label had to stay left of (title left edge, or trailing control). */
  titleLeft: number;
  titleInline: boolean;
}

const defaultMeasureHeight = (fontPx: number): number => Math.ceil(fontPx * 1.4);

export const resolveLegacyHeaderIdentityPlacement = (
  input: LegacyHeaderIdentityPlacementInput
): LegacyHeaderIdentityPlacement => {
  const { layout } = input;
  const profileFrame = resolveLegacyHeaderControlFrame({
    height: layout.height,
    hudHeight: layout.lanes.hud?.height ?? 64,
    hudTop: layout.lanes.hud?.top ?? 0,
    placement: 'leading',
    safeArea: layout.headerSafeInset,
    sizeScale: layout.headerIconScale,
    width: layout.width
  });
  const titleInline = layout.lanes.title === null;
  const trailingLeft = Math.min(...resolveHeaderControlRects(layout).slice(1).map((rect) => rect.left));
  const titleLayout = resolveLegacyMenuPathTitleLayout(
    layout.titleX,
    0,
    resolveLegacyMenuTitleFontSize(layout.titleReserveHeight)
  );
  const titleLeft = titleInline ? titleLayout.left : trailingLeft;

  const identity = resolveLegacyHeaderIdentityLayout({
    fontPx: LEGACY_HEADER_IDENTITY_PREFERRED_FONT_PX,
    measure: input.measure,
    minVisibleChars: layout.width < LEGACY_HEADER_IDENTITY_SHORT_FORM_MAX_WIDTH_PX
      ? LEGACY_HEADER_IDENTITY_SHORT_FORM_MIN_VISIBLE_CHARS
      : undefined,
    profileFrameCenterY: profileFrame.centerY,
    profileFrameRight: profileFrame.right,
    text: input.username,
    titleLeft,
    viewportHeight: layout.height,
    viewportWidth: layout.width
  });
  const frame = {
    bottom: profileFrame.bottom,
    centerY: profileFrame.centerY,
    left: profileFrame.left,
    right: profileFrame.right,
    top: profileFrame.top
  };
  if (!identity.visible) {
    return {
      anchor: null,
      identity,
      profileFrame: frame,
      rect: null,
      titleInline,
      titleLeft,
      visible: false
    };
  }

  const boxHeight = (input.measureHeight ?? defaultMeasureHeight)(identity.fontPx);
  const centerY = profileFrame.centerY;
  const rect: LegacyHeaderRect = {
    bottom: centerY + (boxHeight / 2),
    left: identity.left,
    right: identity.right,
    top: centerY - (boxHeight / 2)
  };
  // Never taller than the profile icon row: hide rather than overlap the content below.
  if (rect.bottom > profileFrame.bottom + 0.001) {
    return {
      anchor: null,
      identity,
      profileFrame: frame,
      rect: null,
      titleInline,
      titleLeft,
      visible: false
    };
  }
  return {
    anchor: { x: identity.left, y: centerY },
    identity,
    profileFrame: frame,
    rect,
    titleInline,
    titleLeft,
    visible: true
  };
};
