/**
 * Scene-facing placement for the header identity label (the canonical
 * username shown top-left, immediately right of the profile icon).
 *
 * Pure: no Phaser, no DOM. It feeds legacyHeaderIdentity.ts the REAL header
 * geometry instead of that module's assumed 220 px title footprint:
 *  - the profile icon frame comes from resolveLegacyHeaderControlFrame (the
 *    same call the icon itself and the diamond-marker avoidance use);
 *  - the title's left edge comes from resolveLegacyMenuPathTitleLayout, the
 *    same layout the scene draws and reports as `title.bounds` in the runtime
 *    diagnostics (measured 2026-11-05: left 113 / width 164 at 390x844,
 *    left 99 / width 123 at 320x568; see
 *    ~/.claude/closeouts/ui-header-measurements-2026-11-05.md);
 *  - when the title is not inline in the header row (fallback lane), the
 *    label is bounded by the leftmost trailing header control instead.
 *
 * The label is also kept clear of every edge diamond: if its text rect would
 * touch a diamond's worst-case bounding square it is nudged down (never up,
 * never below the profile icon's bottom edge); if it still cannot clear, it is
 * hidden rather than overlapping.
 */
import {
  resolveEdgeMarkerBounds,
  resolveHeaderControlRects,
  type EdgeRect,
  type EdgeStation
} from '../render/edgeMarkers';
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

/** Minimum gap between the label's text rect and any edge diamond bounding square. */
export const LEGACY_HEADER_IDENTITY_DIAMOND_CLEARANCE_PX = 1;

export interface LegacyHeaderIdentityPlacementLayout {
  readonly width: number;
  readonly height: number;
  readonly headerIconScale: number;
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
  /** Edge diamonds the label must clear. */
  edgeStations?: ReadonlyArray<Pick<EdgeStation, 'x' | 'y'>>;
}

export interface LegacyHeaderIdentityPlacement {
  identity: LegacyHeaderIdentityLayout;
  /** True when the label is shown. */
  visible: boolean;
  /** Left-anchored, vertically centered anchor point for a Phaser text (origin 0, 0.5). */
  anchor: { x: number; y: number } | null;
  /** Text rect when visible. */
  rect: EdgeRect | null;
  profileFrame: EdgeRect & { centerY: number };
  /** Right limit the label had to stay left of (title left edge, or trailing control). */
  titleLeft: number;
  titleInline: boolean;
  /** Vertical nudge applied to clear a diamond (0 when none needed). */
  nudgeY: number;
  clearsEdgeDiamonds: boolean;
}

const defaultMeasureHeight = (fontPx: number): number => Math.ceil(fontPx * 1.4);

const rectsOverlap = (a: EdgeRect, b: EdgeRect, clearance: number): boolean => (
  a.left < b.right + clearance
  && a.right > b.left - clearance
  && a.top < b.bottom + clearance
  && a.bottom > b.top - clearance
);

export const resolveLegacyHeaderIdentityPlacement = (
  input: LegacyHeaderIdentityPlacementInput
): LegacyHeaderIdentityPlacement => {
  const { layout } = input;
  const profileFrame = resolveLegacyHeaderControlFrame({
    height: layout.height,
    hudHeight: layout.lanes.hud?.height ?? 64,
    hudTop: layout.lanes.hud?.top ?? 0,
    placement: 'leading',
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
      clearsEdgeDiamonds: true,
      identity,
      nudgeY: 0,
      profileFrame: frame,
      rect: null,
      titleInline,
      titleLeft,
      visible: false
    };
  }

  const boxHeight = (input.measureHeight ?? defaultMeasureHeight)(identity.fontPx);
  const rectAt = (centerY: number): EdgeRect => ({
    bottom: centerY + (boxHeight / 2),
    left: identity.left,
    right: identity.right,
    top: centerY - (boxHeight / 2)
  });

  let centerY = profileFrame.centerY;
  let rect = rectAt(centerY);
  const diamonds = (input.edgeStations ?? []).map((station) => resolveEdgeMarkerBounds(station));
  let nudgeY = 0;
  for (const diamond of diamonds) {
    if (rectsOverlap(rect, diamond, LEGACY_HEADER_IDENTITY_DIAMOND_CLEARANCE_PX)) {
      const delta = Math.ceil((diamond.bottom + LEGACY_HEADER_IDENTITY_DIAMOND_CLEARANCE_PX) - rect.top);
      centerY += delta;
      nudgeY += delta;
      rect = rectAt(centerY);
    }
  }
  const clears = diamonds.every((diamond) => !rectsOverlap(rect, diamond, LEGACY_HEADER_IDENTITY_DIAMOND_CLEARANCE_PX))
    && rect.bottom <= profileFrame.bottom + 0.001;
  if (!clears) {
    return {
      anchor: null,
      clearsEdgeDiamonds: false,
      identity,
      nudgeY,
      profileFrame: frame,
      rect: null,
      titleInline,
      titleLeft,
      visible: false
    };
  }
  return {
    anchor: { x: identity.left, y: centerY },
    clearsEdgeDiamonds: true,
    identity,
    nudgeY,
    profileFrame: frame,
    rect,
    titleInline,
    titleLeft,
    visible: true
  };
};
