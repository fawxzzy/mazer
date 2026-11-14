import { describe, expect, test } from 'vitest';
import { resolveLegacyMenuLayout } from '../../src/legacy-runtime/legacyMenuLayout';
import { resolveLegacyHeaderControlFrame } from '../../src/legacy-runtime/legacyHeaderControl';
import {
  LEGACY_PRESENCE_ICON_GAP_PX,
  LEGACY_PRESENCE_TITLE_GAP_PX,
  resolveLegacyPresenceCounterLayout,
  resolveLegacyPresenceCounterPlacement
} from '../../src/legacy-runtime/legacyPresenceCounterLayout';
import { formatOnlineGlyph } from '../../src/legacy-runtime/legacyPresenceContract';

const VIEWPORTS = [
  { height: 568, width: 320 },
  { height: 740, width: 360 },
  { height: 844, width: 390 },
  { height: 915, width: 412 },
  { height: 932, width: 430 },
  { height: 720, width: 1280 }
] as const;

const COUNTS = [1, 7, 42, 999, 1234, 12345];

describe('MAZER-UI-024 presence counter layout', () => {
  test('never overlaps the leading icon or the title, never leaves the viewport, on every phone and desktop width and count', () => {
    for (const viewport of VIEWPORTS) {
      const layout = resolveLegacyMenuLayout(viewport.width, viewport.height, 50, 49, 49, 'menu');
      const leading = resolveLegacyHeaderControlFrame({
        height: layout.height,
        hudHeight: layout.lanes.hud?.height ?? 64,
        hudTop: layout.lanes.hud?.top ?? 0,
        placement: 'leading',
        safeArea: layout.headerSafeInset,
        sizeScale: layout.headerIconScale,
        width: layout.width
      });
      for (const count of COUNTS) {
        for (const showDot of [true, false]) {
          const placement = resolveLegacyPresenceCounterPlacement({ layout, showDot, text: formatOnlineGlyph(count) });
          const label = `${viewport.width}x${viewport.height} n=${count} dot=${showDot}`;
          expect(placement.slotLeft, label).toBe(leading.right + LEGACY_PRESENCE_ICON_GAP_PX);
          if (!placement.visible) {
            continue;
          }
          expect(placement.number, label).not.toBeNull();
          const left = placement.dot ? placement.dot.centerX - placement.dot.radius : placement.number!.left;
          expect(left, label).toBeGreaterThanOrEqual(leading.right + LEGACY_PRESENCE_ICON_GAP_PX);
          expect(placement.right, label).toBeLessThanOrEqual(placement.slotRight);
          expect(placement.right, label).toBeLessThanOrEqual(viewport.width - 8);
          // Vertically centred on the leading icon.
          const centre = placement.number!.top + (placement.number!.height / 2);
          expect(Math.abs(centre - leading.centerY), label).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  test('the title never moves: the slot right limit is the inline title left edge minus the gap', () => {
    const layout = resolveLegacyMenuLayout(390, 844, 50, 49, 49, 'menu');
    const placement = resolveLegacyPresenceCounterPlacement({ layout, showDot: true, text: '7' });
    expect(placement.slotRight).toBeLessThan(layout.titleX);
    expect(placement.slotRight).toBeGreaterThan(placement.slotLeft);
    expect(LEGACY_PRESENCE_TITLE_GAP_PX).toBeGreaterThan(0);
  });

  test('a 390 wide phone shows 0..3 digit numbers (not 4+ characters); desktop adds the word ONLINE', () => {
    const phone = resolveLegacyMenuLayout(390, 844, 50, 49, 49, 'menu');
    for (const text of ['7', '42', '999']) {
      expect(resolveLegacyPresenceCounterPlacement({ layout: phone, showDot: true, text }).visible, text).toBe(true);
    }
    const desktop = resolveLegacyMenuLayout(1280, 720, 50, 49, 49, 'menu');
    const wide = resolveLegacyPresenceCounterPlacement({ layout: desktop, showDot: true, text: '1234' });
    expect(wide.visible).toBe(true);
    expect(wide.word?.text).toBe('ONLINE');
  });

  test('tiers: word at cell 3, word at cell 2, number only at cell 3, number only at cell 2, then hidden', () => {
    const base = { centerY: 40, leadingRight: 50, showDot: false, text: '7', viewportWidth: 2000 };
    const at = (room: number) => resolveLegacyPresenceCounterLayout({ ...base, titleLeft: 50 + 8 + room + 8 });
    const wordCell3 = 5 * 3 + 8 + (35 * 3);
    const wordCell2 = 5 * 2 + 8 + (35 * 2);
    expect(at(wordCell3)).toMatchObject({ cell: 3, visible: true });
    expect(at(wordCell3).word).not.toBeNull();
    expect(at(wordCell3 - 1)).toMatchObject({ cell: 2, visible: true });
    expect(at(wordCell3 - 1).word).not.toBeNull();
    expect(at(wordCell2 - 1)).toMatchObject({ cell: 3, visible: true });
    expect(at(wordCell2 - 1).word).toBeNull();
    expect(at(14)).toMatchObject({ cell: 2, visible: true });
    expect(at(9).visible).toBe(false);
    expect(at(0).visible).toBe(false);
  });

  test('the pulse dot is dropped before the number is when room is tight, and absent when asked (Reduce Motion)', () => {
    const base = { centerY: 40, leadingRight: 50, text: '12', viewportWidth: 2000 };
    const tight = resolveLegacyPresenceCounterLayout({ ...base, showDot: true, titleLeft: 50 + 8 + 22 + 8 });
    expect(tight).toMatchObject({ visible: true, cell: 2 });
    expect(tight.dot).toBeNull();
    const roomy = resolveLegacyPresenceCounterLayout({ ...base, showDot: true, titleLeft: 50 + 8 + 33 + 12 + 8 });
    expect(roomy.dot).not.toBeNull();
    const reduced = resolveLegacyPresenceCounterLayout({ ...base, showDot: false, titleLeft: 50 + 8 + 400 });
    expect(reduced.dot).toBeNull();
  });

  test('hidden for null, empty, zero-like or non-glyph text (nothing is drawn, never a dash)', () => {
    for (const text of [null, undefined, '', ' ', 'x', '1.2k', '1,234', '-', '0 online']) {
      expect(resolveLegacyPresenceCounterLayout({ centerY: 40, leadingRight: 50, showDot: true, text, titleLeft: 300, viewportWidth: 390 }).visible, String(text)).toBe(false);
    }
  });

  test('digits are tabular: every digit advances the same width, so a changing value moves nothing to its left', () => {
    const widths = ['1', '4', '7', '8'].map((digit) => resolveLegacyPresenceCounterLayout({
      centerY: 40, leadingRight: 50, showDot: true, text: digit, titleLeft: 400, viewportWidth: 800
    }).number!.width);
    expect(new Set(widths).size).toBe(1);
    const a = resolveLegacyPresenceCounterLayout({ centerY: 40, leadingRight: 50, showDot: true, text: '11', titleLeft: 400, viewportWidth: 800 });
    const b = resolveLegacyPresenceCounterLayout({ centerY: 40, leadingRight: 50, showDot: true, text: '88', titleLeft: 400, viewportWidth: 800 });
    expect(a.number!.left).toBe(b.number!.left);
    expect(a.number!.width).toBe(b.number!.width);
    expect(a.dot).toEqual(b.dot);
  });
});
