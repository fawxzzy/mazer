import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import {
  LEGACY_HEADER_IDENTITY_MIN_FONT_PX,
  LEGACY_HEADER_IDENTITY_TITLE_GAP_PX
} from '../../src/legacy-runtime/legacyHeaderIdentity';
import {
  LEGACY_HEADER_IDENTITY_LABEL_PADDING_Y_PX,
  resolveHeaderControlRects,
  resolveLegacyHeaderIdentityPlacement,
  type LegacyHeaderRect as EdgeRect
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
  const placement = resolveLegacyHeaderIdentityPlacement({
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
  return { controls, layout, placement, titleLayout };
};

describe('header identity placement (username top-left, right of the profile icon)', () => {
  test.each(VIEWPORTS)('is visible, right of the profile icon and clear of icon and title at $width x $height', ({ width, height }) => {
    const { controls, layout, placement, titleLayout } = place(width, height, 'qa-player');
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
    // Vertically centred on the profile icon: the diamonds sit behind the UI, so there is no nudge.
    expect(placement.anchor?.y).toBe(placement.profileFrame.centerY);
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
    // 113 - 8 gap - (51.5 + 8 left) = ~46 px of room (the 16px header edge inset cost ~7px vs the old 8px inset).
    expect(phone.placement.identity.maxWidth).toBeGreaterThan(45);
    expect(phone.placement.identity.maxWidth).toBeLessThan(48);
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

  // MAZER-ACCT-032: measured 2026-11-12, 'renamed-qa' (10 characters) was hidden at
  // 390 px while 'qa-player' showed 'qa-pla…'. A name that does not fit is cut, never hidden.
  test.each(VIEWPORTS)('a long name is cut with an ellipsis instead of hiding the label at $width x $height', ({ width, height }) => {
    for (const name of ['renamed-qa', 'abcdefghijklmno']) {
      const { placement } = place(width, height, name);
      expect(placement.visible).toBe(true);
      const text = placement.identity.displayText;
      expect(text.length).toBeGreaterThan(0);
      if (text !== name) {
        expect(text.endsWith('…')).toBe(true);
        expect(name.startsWith(text.slice(0, -1))).toBe(true);
      }
      expect((placement.rect as EdgeRect).right).toBeLessThanOrEqual(placement.titleLeft - LEGACY_HEADER_IDENTITY_TITLE_GAP_PX);
    }
  });

  test('narrow widths keep the label: a 15-character name shows a stub, a short name is unchanged', () => {
    for (const width of [320, 360, 375, 390, 430]) {
      const { placement } = place(width, 844, 'abcdefghijklmno');
      expect(placement.visible).toBe(true);
      expect(placement.identity.displayText.endsWith('…')).toBe(true);
    }
    expect(place(390, 844, 'Zac').placement.identity.displayText).toBe('Zac');
    expect(place(1280, 720, 'qa-player').placement.identity.displayText).toBe('qa-player');
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

  test('no diamond-avoid nudge: the label stays centred on the profile icon even in the tightest header', () => {
    for (const { width, height } of VIEWPORTS) {
      const { placement } = place(width, height, 'qa-player');
      expect(placement.anchor?.y).toBe(placement.profileFrame.centerY);
      expect('nudgeY' in placement).toBe(false);
      expect('clearsEdgeDiamonds' in placement).toBe(false);
    }
    const source = readFileSync(resolve(process.cwd(), 'src/legacy-runtime/legacyHeaderIdentityPlacement.ts'), 'utf8');
    expect(source).not.toContain("from '../render/edgeMarkers'");
    expect(source).not.toContain('edgeStations');
  });

  test('MAZER-UI-024: the scene no longer builds the label (the online counter took its spot); the module stays for its own geometry contract', () => {
    expect(LEGACY_HEADER_IDENTITY_LABEL_PADDING_Y_PX).toBeGreaterThanOrEqual(2);

    const source = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8').replace(/\r\n/g, '\n');
    expect(source).not.toContain('createLegacyHeaderIdentityLabel');
    expect(source).not.toContain('legacyHeaderIdentityPlacement');
    // The placement still fits the leading icon band for the geometry callers that remain.
    for (const { width, height } of VIEWPORTS) {
      const { placement } = place(width, height, 'qa-player');
      expect(placement.visible).toBe(true);
    }
  });
});
