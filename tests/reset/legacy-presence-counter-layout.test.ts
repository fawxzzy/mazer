import { describe, expect, test } from 'vitest';
import { resolveLegacyMenuLayout } from '../../src/legacy-runtime/legacyMenuLayout';
import { resolveLegacyHeaderControlFrame } from '../../src/legacy-runtime/legacyHeaderControl';
import {
  LEGACY_PRESENCE_DOT_DIAMETER_PX,
  LEGACY_PRESENCE_DOT_GAP_PX,
  LEGACY_PRESENCE_ICON_GAP_PX,
  LEGACY_PRESENCE_IDLE_DOT_ALPHA,
  LEGACY_PRESENCE_PULSE_MS,
  LEGACY_PRESENCE_TITLE_GAP_PX,
  resolveLegacyPresenceCounterLayout,
  resolveLegacyPresenceCounterPlacement,
  resolveLegacyPresenceDotAlpha
} from '../../src/legacy-runtime/legacyPresenceCounterLayout';
import { formatOnline } from '../../src/legacy-runtime/legacyPresenceContract';

// UI font stand-in (12px counter font): about 7px per character.
const measure = (value: string): number => value.length * 7;

const VIEWPORTS = [
  { height: 568, width: 320 },
  { height: 740, width: 360 },
  { height: 844, width: 390 },
  { height: 915, width: 412 },
  { height: 932, width: 430 },
  { height: 720, width: 1280 }
] as const;
const COUNTS = [1, 7, 42, 999, 1234, 12345];

describe('MAZER-UI-033 presence counter layout (copy of the website header counter)', () => {
  test('starts at the leading header slot, never overlaps the title and never leaves the viewport, at every width and count', () => {
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
      for (const count of [null, ...COUNTS]) {
        const placement = resolveLegacyPresenceCounterPlacement({ countText: formatOnline(count), layout, measure });
        const label = `${viewport.width}x${viewport.height} n=${count}`;
        // L6: the leaderboard corner icon is gone (menu dropdown), so the counter starts at the leading slot edge.
        expect(placement.slotLeft, label).toBe(leading.left);
        if (!placement.visible) {
          continue;
        }
        expect(placement.dot!.centerX - placement.dot!.radius, label).toBeGreaterThanOrEqual(placement.slotLeft);
        expect(placement.right, label).toBeLessThanOrEqual(placement.slotRight);
        expect(placement.right, label).toBeLessThanOrEqual(viewport.width - 8);
        expect(Math.abs(placement.dot!.centerY - leading.centerY), label).toBeLessThanOrEqual(1);
      }
    }
  });

  test('the title never moves: the slot ends before the drawn MAZER wordmark', () => {
    for (const [width, height] of [[360, 740], [390, 844], [412, 915]]) {
      const layout = resolveLegacyMenuLayout(width, height, 50, 49, 49, 'menu');
      const placement = resolveLegacyPresenceCounterPlacement({ countText: '7', layout, measure });
      expect(placement.slotRight).toBeLessThan(layout.titleX);
      expect(placement.slotRight).toBeGreaterThan(placement.slotLeft);
    }
  });

  test('live reads dot, number, word left to right: "7 online"', () => {
    const placement = resolveLegacyPresenceCounterPlacement({
      countText: '7',
      layout: resolveLegacyMenuLayout(1280, 720, 50, 49, 49, 'menu'),
      measure
    });
    expect(placement.text?.value).toBe('7 online');
    expect(placement.text!.left).toBe(placement.slotLeft + LEGACY_PRESENCE_DOT_DIAMETER_PX + LEGACY_PRESENCE_DOT_GAP_PX);
    expect(placement.dot!.radius * 2).toBe(8);
  });

  test('idle (no count) is the dim dot alone: no number and no word', () => {
    for (const countText of [null, undefined, '', ' ']) {
      const layout = resolveLegacyPresenceCounterLayout({
        centerY: 40, countText, leadingRight: 50, measure, titleLeft: 400, viewportWidth: 800
      });
      expect(layout.visible).toBe(true);
      expect(layout.text).toBeNull();
      expect(layout.dot).not.toBeNull();
    }
  });

  test('count text the website does not use is never drawn (no K glyph, no commas)', () => {
    for (const countText of ['1K', '12K', '1,234', 'x', '-', '0 online']) {
      const layout = resolveLegacyPresenceCounterLayout({
        centerY: 40, countText, leadingRight: 50, measure, titleLeft: 400, viewportWidth: 800
      });
      expect(layout.text, countText).toBeNull();
    }
    expect(resolveLegacyPresenceCounterLayout({
      centerY: 40, countText: '1.2k', leadingRight: 50, measure, titleLeft: 400, viewportWidth: 800
    }).text?.value).toBe('1.2k online');
  });

  test('tiers: dot + "N online", then dot + "N", then the dot alone, then hidden', () => {
    const base = { centerY: 40, countText: '7', leadingRight: 50, measure, viewportWidth: 2000 };
    const at = (room: number) => resolveLegacyPresenceCounterLayout({ ...base, titleLeft: 50 + LEGACY_PRESENCE_ICON_GAP_PX + room + LEGACY_PRESENCE_TITLE_GAP_PX });
    const chrome = LEGACY_PRESENCE_DOT_DIAMETER_PX + LEGACY_PRESENCE_DOT_GAP_PX;
    expect(at(chrome + measure('7 online')).text?.value).toBe('7 online');
    expect(at(chrome + measure('7 online') - 1).text?.value).toBe('7');
    expect(at(chrome + measure('7') - 1).text).toBeNull();
    expect(at(chrome + measure('7') - 1).visible).toBe(true);
    expect(at(LEGACY_PRESENCE_DOT_DIAMETER_PX - 1).visible).toBe(false);
    expect(at(0).visible).toBe(false);
  });

  test('dot opacity: idle 0.35, live pulses 1 -> 0.55 -> 1 over 2.6s, static 1 under Reduce Motion', () => {
    expect(resolveLegacyPresenceDotAlpha(false, 1300, false)).toBe(LEGACY_PRESENCE_IDLE_DOT_ALPHA);
    expect(resolveLegacyPresenceDotAlpha(false, 1300, true)).toBe(LEGACY_PRESENCE_IDLE_DOT_ALPHA);
    expect(resolveLegacyPresenceDotAlpha(true, 0, false)).toBeCloseTo(1, 6);
    expect(resolveLegacyPresenceDotAlpha(true, LEGACY_PRESENCE_PULSE_MS / 2, false)).toBeCloseTo(0.55, 6);
    expect(resolveLegacyPresenceDotAlpha(true, LEGACY_PRESENCE_PULSE_MS, false)).toBeCloseTo(1, 6);
    for (const time of [0, 400, 1300, 2000]) {
      expect(resolveLegacyPresenceDotAlpha(true, time, true)).toBe(1);
    }
  });
});
