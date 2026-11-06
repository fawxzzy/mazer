import { describe, expect, test } from 'vitest';
import {
  EDGE_MARKER_CONTROL_CLEARANCE_PX,
  resolveEdgeMarkerBounds,
  resolveEdgeStations,
  resolveHeaderControlRects,
  type EdgeRect
} from '../../src/render/edgeMarkers';
import {
  LEGACY_HEADER_IDENTITY_MIN_FONT_PX,
  LEGACY_HEADER_IDENTITY_TITLE_GAP_PX
} from '../../src/legacy-runtime/legacyHeaderIdentity';
import {
  LEGACY_HEADER_IDENTITY_DIAMOND_CLEARANCE_PX,
  LEGACY_HEADER_IDENTITY_SHORT_FORM_MIN_VISIBLE_CHARS,
  resolveLegacyHeaderIdentityPlacement
} from '../../src/legacy-runtime/legacyHeaderIdentityPlacement';
import { resolveLegacyMenuLayout } from '../../src/legacy-runtime/legacyMenuLayout';
import { resolveLegacyMenuPathTitleLayout, resolveLegacyMenuTitleFontSize } from '../../src/legacy-runtime/legacyMenuTitle';

// Deterministic stand-in for the scene's Phaser measure: 5.5 px per code
// point at 11 px (scaled with font size) + 2 px stroke, text height 1.3em + 2.
const measure = (text: string, fontPx: number): number => (Array.from(text).length * fontPx * 0.5) + 2;
const measureHeight = (fontPx: number): number => Math.ceil(fontPx * 1.2) + 2;

const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 320, height: 568 },
  { width: 1280, height: 720 }
] as const;

const overlaps = (a: EdgeRect, b: EdgeRect): boolean => (
  a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
);

const place = (width: number, height: number, username: string | null) => {
  const layout = resolveLegacyMenuLayout(width, height, 50, 49, 49, 'menu', { menuActionMode: 'authenticated' });
  const controls = resolveHeaderControlRects(layout);
  const stations = resolveEdgeStations({ width, height }, undefined, controls);
  const placement = resolveLegacyHeaderIdentityPlacement({
    edgeStations: stations,
    layout,
    measure,
    measureHeight,
    username
  });
  const titleLayout = resolveLegacyMenuPathTitleLayout(
    layout.titleX,
    layout.titleY,
    resolveLegacyMenuTitleFontSize(layout.titleReserveHeight)
  );
  return { controls, layout, placement, stations, titleLayout };
};

describe('header identity placement (username top-left, right of the profile icon)', () => {
  test.each(VIEWPORTS)('is visible, right of the profile icon and clear of icon, title and diamonds at $width x $height', ({ width, height }) => {
    const { controls, layout, placement, stations, titleLayout } = place(width, height, 'qa-player');
    expect(layout.lanes.title).toBeNull();
    expect(placement.visible).toBe(true);
    const rect = placement.rect as EdgeRect;
    const profile = controls[0] as EdgeRect;

    // Immediately right of the profile icon, 8 px gap, never overlapping it.
    expect(rect.left).toBe(profile.right + 8);
    expect(overlaps(rect, profile)).toBe(false);
    // Left of the REAL title footprint with the 8 px title gap.
    const titleRect: EdgeRect = {
      bottom: titleLayout.top + titleLayout.height,
      left: titleLayout.left,
      right: titleLayout.left + titleLayout.width,
      top: titleLayout.top
    };
    expect(placement.titleLeft).toBe(titleLayout.left);
    expect(rect.right).toBeLessThanOrEqual(titleRect.left - LEGACY_HEADER_IDENTITY_TITLE_GAP_PX);
    expect(overlaps(rect, titleRect)).toBe(false);
    // Clear of every one of the 8 diamond bounding squares (incl. top-left corner and top-centre).
    for (const station of stations) {
      expect(overlaps(rect, resolveEdgeMarkerBounds(station)), `station ${station.id}`).toBe(false);
    }
    // Stays inside the profile icon's vertical band and the other header controls are untouched.
    expect(rect.top).toBeGreaterThanOrEqual(profile.top - 1);
    expect(rect.bottom).toBeLessThanOrEqual(profile.bottom);
    for (const other of controls.slice(1)) {
      expect(overlaps(rect, other)).toBe(false);
    }
    expect(placement.identity.fontPx).toBeGreaterThanOrEqual(LEGACY_HEADER_IDENTITY_MIN_FONT_PX);
  });

  test('replaces the assumed 220 px title width with the real title footprint (measured 390: left 113 / width 164)', () => {
    const phone = place(390, 844, 'qa-player');
    expect(phone.titleLayout.left).toBe(113);
    expect(phone.titleLayout.width).toBe(164);
    expect(phone.placement.titleLeft).toBe(113);
    // 113 - 8 gap - (43.5 + 8 left) = ~53 px of room, as measured on the real game.
    expect(phone.placement.identity.maxWidth).toBeGreaterThan(52);
    expect(phone.placement.identity.maxWidth).toBeLessThan(55);
    const tight = place(320, 568, 'qa-player');
    expect(tight.titleLayout.left).toBe(99);
    expect(tight.titleLayout.width).toBe(123);
    expect(tight.placement.identity.maxWidth).toBeGreaterThan(40);
    expect(tight.placement.identity.maxWidth).toBeLessThan(45);
  });

  test('truncates a long username with an ellipsis to the available width and never exceeds it', () => {
    for (const { width, height } of VIEWPORTS) {
      const { placement } = place(width, height, 'WWWWWWWWWWWWWWWWWWWWWWWW');
      if (!placement.visible) {
        continue;
      }
      const rect = placement.rect as EdgeRect;
      if (placement.identity.displayText !== 'WWWWWWWWWWWWWWWWWWWWWWWW') {
        expect(placement.identity.displayText.endsWith('…')).toBe(true);
      }
      expect(rect.right - rect.left).toBeLessThanOrEqual(placement.identity.maxWidth + 0.001);
    }
  });

  test('uses a short form at 320 px (fewer visible characters) instead of dropping to icon-only', () => {
    const tight = place(320, 568, 'qa-player');
    expect(tight.placement.visible).toBe(true);
    const text = tight.placement.identity.displayText;
    expect(text.endsWith('…')).toBe(true);
    expect(Array.from(text).length - 1).toBeGreaterThanOrEqual(LEGACY_HEADER_IDENTITY_SHORT_FORM_MIN_VISIBLE_CHARS);
    // A phone wide enough keeps the longer rule: the same name there is whole or longer than the short form.
    const phone = place(390, 844, 'qa-player');
    expect(Array.from(phone.placement.identity.displayText).length).toBeGreaterThanOrEqual(Array.from(text).length);
  });

  test('is hidden when signed out, guest, blank or email-shaped (no label object at all)', () => {
    for (const { width, height } of VIEWPORTS) {
      for (const username of [null, undefined, '', '   ', 'someone@example.com']) {
        const { placement } = place(width, height, username as string | null);
        expect(placement.visible).toBe(false);
        expect(placement.anchor).toBeNull();
        expect(placement.rect).toBeNull();
      }
    }
  });

  test('nudges down (never up, never past the profile icon) to clear the top-left diamond, or hides', () => {
    const { controls, placement, stations } = place(320, 568, 'qa-player');
    const topLeft = resolveEdgeMarkerBounds(stations[0] as { x: number; y: number });
    const rect = placement.rect as EdgeRect;
    expect(rect.top).toBeGreaterThanOrEqual(topLeft.bottom + LEGACY_HEADER_IDENTITY_DIAMOND_CLEARANCE_PX);
    expect(placement.nudgeY).toBeGreaterThanOrEqual(0);
    expect(rect.bottom).toBeLessThanOrEqual((controls[0] as EdgeRect).bottom);

    // A diamond that can never be cleared inside the icon band hides the label.
    const layout = resolveLegacyMenuLayout(320, 568, 50, 49, 49, 'menu', { menuActionMode: 'authenticated' });
    const blocked = resolveLegacyHeaderIdentityPlacement({
      edgeStations: [{ x: 70, y: 40 }],
      layout,
      measure,
      measureHeight,
      username: 'qa-player'
    });
    expect(blocked.visible).toBe(false);
    expect(blocked.clearsEdgeDiamonds).toBe(false);
  });

  test('keeps the diamond-vs-header clearance contract the diamonds were built for', () => {
    // The corner diamonds were nudged clear of the 36 px header controls + 8 px;
    // the label sits in the slot those diamonds slid past, so re-assert it here.
    for (const { width, height } of VIEWPORTS) {
      const { controls, stations } = place(width, height, 'qa-player');
      for (const station of stations) {
        const bounds = resolveEdgeMarkerBounds(station);
        for (const control of controls) {
          const inflated: EdgeRect = {
            bottom: control.bottom + EDGE_MARKER_CONTROL_CLEARANCE_PX,
            left: control.left - EDGE_MARKER_CONTROL_CLEARANCE_PX,
            right: control.right + EDGE_MARKER_CONTROL_CLEARANCE_PX,
            top: control.top - EDGE_MARKER_CONTROL_CLEARANCE_PX
          };
          expect(overlaps(bounds, inflated)).toBe(false);
        }
      }
    }
  });
});
