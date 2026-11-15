import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import { resolveTouchControlLayout } from '../../src/input-human';
import {
  LEGACY_HEADER_EDGE_INSET_MAX_PX,
  LEGACY_HEADER_CORNER_DIAMOND_GAP_PX,
  LEGACY_HEADER_CORNER_DIAMOND_REACH_PX,
  LEGACY_HEADER_EDGE_INSET_MIN_PX,
  LEGACY_HEADER_ICON_GLYPH_SCALE,
  resolveLegacyHeaderControlFrame,
  resolveLegacyHeaderCornerDiamondReach,
  resolveLegacyHeaderEdgeInset,
  resolveLegacyHeaderLeadingEdgeInset,
  resolveLegacyHeaderTrailingEdgeInset
} from '../../src/legacy-runtime/legacyHeaderControl';
import { resolveLegacyMinHitRect } from '../../src/legacy-runtime/legacyHitTarget';
import { resolveEdgeCornerTipInset } from '../../src/render/edgeCornerAnchor';
import {
  anchorStationToOuterTip,
  resolveEdgeCornerInset,
  resolveEdgeMarkerPaintedPolygon,
  resolveEdgeStations
} from '../../src/render/edgeMarkers';
import { resolveLegacyMenuLayout } from '../../src/legacy-runtime/legacyMenuLayout';

const normalizeSourceLineEndings = (source: string): string => source.replace(/\r\n?/g, '\n');

const VIEWPORTS = [
  { height: 568, width: 320 },
  { height: 640, width: 360 },
  { height: 667, width: 375 },
  { height: 844, width: 390 },
  { height: 932, width: 430 },
  { height: 720, width: 1280 }
] as const;
/** Tall portrait phones with rounded display corners (MAZER-VIS-054): the corner diamonds sit 16 px in from the corner. */
const ROUNDED_PHONES = [
  { height: 812, width: 375 },
  { height: 844, width: 390 },
  { height: 852, width: 393 },
  { height: 915, width: 412 },
  { height: 932, width: 430 }
] as const;

const measureHeader = (
  viewport: { height: number; width: number },
  safeArea?: { left?: number; right?: number }
) => {
  const layout = resolveLegacyMenuLayout(viewport.width, viewport.height, 50, 49, 49, 'menu', { safeArea });
  const base = {
    height: layout.height,
    hudHeight: layout.lanes.hud?.height ?? 64,
    hudTop: layout.lanes.hud?.top ?? 0,
    safeArea: layout.headerSafeInset,
    sizeScale: layout.headerIconScale,
    width: layout.width
  };
  // MAZER-UI-024: the leaderboard icon leads; the account (profile) icon sits beside the settings cog.
  const leaderboard = resolveLegacyHeaderControlFrame({ ...base, placement: 'leading' });
  const account = resolveLegacyHeaderControlFrame({ ...base, placement: 'trailing', slot: 1 });
  const settings = resolveLegacyHeaderControlFrame({ ...base, placement: 'trailing' });
  return { account, layout, leaderboard, settings };
};

describe('header edge padding (Wave 5C)', () => {
  test('edge inset scales with width: 16px at 390, smaller at 320, capped on desktop', () => {
    expect(resolveLegacyHeaderEdgeInset(390)).toBe(16);
    expect(resolveLegacyHeaderEdgeInset(320)).toBe(10);
    expect(resolveLegacyHeaderEdgeInset(320)).toBeGreaterThanOrEqual(LEGACY_HEADER_EDGE_INSET_MIN_PX);
    expect(resolveLegacyHeaderEdgeInset(360)).toBeGreaterThan(resolveLegacyHeaderEdgeInset(320));
    expect(resolveLegacyHeaderEdgeInset(430)).toBeGreaterThan(resolveLegacyHeaderEdgeInset(390));
    expect(resolveLegacyHeaderEdgeInset(1280)).toBe(LEGACY_HEADER_EDGE_INSET_MAX_PX);
    expect(resolveLegacyHeaderEdgeInset(100)).toBe(LEGACY_HEADER_EDGE_INSET_MIN_PX);
  });

  test('left (leaderboard) and right (settings) controls share the edge gap on every viewport; each side is widened only enough to clear the corner diamond (MAZER-UI-035, VIS-054)', () => {
    const rows: string[] = [];
    for (const viewport of VIEWPORTS) {
      const { leaderboard, settings } = measureHeader(viewport);
      const edge = resolveLegacyHeaderEdgeInset(viewport.width);
      const leftGap = leaderboard.left;
      const rightGap = viewport.width - settings.right;
      rows.push(`${viewport.width}: left ${leftGap} right ${rightGap} (edge ${edge})`);
      // Square-cornered viewports keep the UI-035 behaviour exactly (leading = edge); rounded-display phones clear the moved diamond.
      expect(leftGap).toBe(resolveLegacyHeaderLeadingEdgeInset(viewport.width, leaderboard.width, viewport.height));
      if (resolveEdgeCornerTipInset(viewport) === 0) expect(leftGap).toBe(edge);
      expect(rightGap).toBe(resolveLegacyHeaderTrailingEdgeInset(viewport.width, settings.width, viewport.height));
      expect(rightGap).toBeGreaterThanOrEqual(edge);
      expect(leftGap).toBeGreaterThanOrEqual(LEGACY_HEADER_EDGE_INSET_MIN_PX);
    }
    // 390 is the reference phone: at least 16px on both edges (36+ once the corner diamond sits 16 px in, MAZER-VIS-054).
    const phone = measureHeader({ height: 844, width: 390 });
    expect(phone.leaderboard.left).toBeGreaterThanOrEqual(36);
    expect(390 - phone.settings.right).toBeGreaterThanOrEqual(36);
    // Desktop and square-cornered phones: the pre-VIS-054 numbers.
    expect(measureHeader({ height: 667, width: 375 }).leaderboard.left).toBe(resolveLegacyHeaderEdgeInset(375));
    expect(measureHeader({ height: 720, width: 1280 }).leaderboard.left).toBe(LEGACY_HEADER_EDGE_INSET_MAX_PX);
    expect(rows).toHaveLength(VIEWPORTS.length);
  });

  test('the corner diamond reach constants are pinned to edgeMarkers.ts (square corners: 2 x the half extent; rounded phones: plus the 16 px tip inset)', () => {
    expect(LEGACY_HEADER_CORNER_DIAMOND_REACH_PX).toBeGreaterThanOrEqual(2 * resolveEdgeCornerInset());
    expect(LEGACY_HEADER_CORNER_DIAMOND_REACH_PX - (2 * resolveEdgeCornerInset())).toBeLessThan(1);
    expect(resolveLegacyHeaderCornerDiamondReach(1280, 720)).toBe(LEGACY_HEADER_CORNER_DIAMOND_REACH_PX);
    expect(resolveLegacyHeaderCornerDiamondReach(390)).toBe(LEGACY_HEADER_CORNER_DIAMOND_REACH_PX);
    for (const viewport of ROUNDED_PHONES) {
      const tip = resolveEdgeCornerTipInset(viewport);
      expect(tip).toBe(16);
      const reach = resolveLegacyHeaderCornerDiamondReach(viewport.width, viewport.height);
      expect(reach).toBe(16 + LEGACY_HEADER_CORNER_DIAMOND_REACH_PX);
      expect(reach).toBeGreaterThanOrEqual(tip + (2 * (resolveEdgeCornerInset(viewport) - tip)));
    }
  });

  test('both header glyphs clear the full-size top corner diamonds by the UI-035 gap on 375..430 wide rounded-display phones (MAZER-VIS-054)', () => {
    for (const viewport of ROUNDED_PHONES) {
      const { leaderboard, settings } = measureHeader(viewport);
      const stations = resolveEdgeStations(viewport);
      const box = (id: 0 | 2) => {
        const painted = resolveEdgeMarkerPaintedPolygon(anchorStationToOuterTip(stations[id]!, 1), 1);
        return { left: Math.min(...painted.map((p) => p.x)), right: Math.max(...painted.map((p) => p.x)) };
      };
      const overhang = (settings.width * (LEGACY_HEADER_ICON_GLYPH_SCALE - 1)) / 2;
      const topLeft = box(0);
      const topRight = box(2);
      expect(leaderboard.left - overhang, `${viewport.width} leaderboard glyph vs top-left diamond`)
        .toBeGreaterThanOrEqual(topLeft.right + LEGACY_HEADER_CORNER_DIAMOND_GAP_PX - 0.5);
      expect(settings.right + overhang, `${viewport.width} settings glyph vs top-right diamond`)
        .toBeLessThanOrEqual(topRight.left - LEGACY_HEADER_CORNER_DIAMOND_GAP_PX + 0.5);
      // The reach constant matches the real painted box (rounded up, within a pixel).
      expect(viewport.width - topRight.left).toBeLessThanOrEqual(resolveLegacyHeaderCornerDiamondReach(viewport.width, viewport.height));
      expect(viewport.width - topRight.left).toBeGreaterThan(resolveLegacyHeaderCornerDiamondReach(viewport.width, viewport.height) - 1);
    }
  });

  test('the 44px hit zones stay on screen and the glyph boxes do not overlap at every width', () => {
    for (const viewport of VIEWPORTS) {
      const { account, leaderboard, settings } = measureHeader(viewport);
      for (const frame of [account, leaderboard, settings]) {
        const hit = resolveLegacyMinHitRect(frame, viewport);
        expect(hit.width).toBeGreaterThanOrEqual(44);
        expect(hit.height).toBeGreaterThanOrEqual(44);
        expect(hit.left).toBeGreaterThanOrEqual(0);
        expect(hit.right).toBeLessThanOrEqual(viewport.width);
      }
      expect(account.right).toBeLessThanOrEqual(settings.left);
    }
  });

  test('safe-area left/right insets are added on top of the edge inset (notch / landscape)', () => {
    const viewport = { height: 390, width: 844 };
    const flat = measureHeader(viewport);
    const notched = measureHeader(viewport, { left: 47, right: 47 });
    expect(notched.layout.headerSafeInset).toEqual({ left: 47, right: 47 });
    expect(notched.leaderboard.left).toBe(flat.leaderboard.left + 47);
    expect(viewport.width - notched.settings.right).toBe((viewport.width - flat.settings.right) + 47);
    expect(notched.leaderboard.left).toBeGreaterThanOrEqual(47 + LEGACY_HEADER_EDGE_INSET_MIN_PX);
  });

  test('the in-play pause glyph sits on the same edge gap as the menu settings control', () => {
    for (const viewport of VIEWPORTS) {
      const { settings } = measureHeader(viewport);
      const play = resolveLegacyMenuLayout(viewport.width, viewport.height, 50, 49, 49, 'play');
      const touch = resolveTouchControlLayout(viewport, {
        avoidRect: {
          height: play.boardHeight,
          left: play.boardLeft,
          top: play.boardTop,
          width: play.boardWidth
        },
        compact: true,
        controlMode: 'stick',
        placement: viewport.width >= 720 && viewport.height >= 600 ? 'bottom-centered' : undefined
      });
      const pause = touch.controls.pause;
      // Centres line up within a few px (header glyph boxes squeeze to 32-36, pause assumes 36-40).
      expect(Math.abs(pause.centerX - settings.centerX)).toBeLessThanOrEqual(3);
      // 44px+ zone and the drawn 36px glyph keep at least the edge inset from the screen edge.
      expect(pause.width).toBeGreaterThanOrEqual(44);
      expect(viewport.width - (pause.centerX + 18)).toBeGreaterThanOrEqual(LEGACY_HEADER_EDGE_INSET_MIN_PX - 1);
    }
    // Safe-area right inset moves the pause control in as well.
    const insetTouch = resolveTouchControlLayout({ height: 390, width: 844 }, {
      compact: true,
      safeInsets: { right: 47 }
    });
    const flatTouch = resolveTouchControlLayout({ height: 390, width: 844 }, { compact: true });
    expect(flatTouch.controls.pause.centerX - insetTouch.controls.pause.centerX).toBe(47);
  });

  test('MenuScene feeds the layout safe-area to every header frame it resolves', () => {
    const source = normalizeSourceLineEndings(
      readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8')
    );
    const frameCalls = source.match(/resolveLegacyHeaderControlFrame\(\{[^}]*\}\)/g) ?? [];
    expect(frameCalls.length).toBeGreaterThanOrEqual(5);
    for (const call of frameCalls) {
      expect(call).toContain('safeArea: this.layout.headerSafeInset');
    }
  });
});
