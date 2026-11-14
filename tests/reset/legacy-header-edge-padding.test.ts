import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import { resolveTouchControlLayout } from '../../src/input-human';
import {
  LEGACY_HEADER_EDGE_INSET_MAX_PX,
  LEGACY_HEADER_EDGE_INSET_MIN_PX,
  resolveLegacyHeaderControlFrame,
  resolveLegacyHeaderEdgeInset
} from '../../src/legacy-runtime/legacyHeaderControl';
import { resolveLegacyMinHitRect } from '../../src/legacy-runtime/legacyHitTarget';
import { resolveLegacyMenuLayout } from '../../src/legacy-runtime/legacyMenuLayout';

const normalizeSourceLineEndings = (source: string): string => source.replace(/\r\n?/g, '\n');

const VIEWPORTS = [
  { height: 568, width: 320 },
  { height: 640, width: 360 },
  { height: 844, width: 390 },
  { height: 932, width: 430 },
  { height: 720, width: 1280 }
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

  test('left (leaderboard) and right (settings) controls mirror at the same edge gap on every viewport', () => {
    const rows: string[] = [];
    for (const viewport of VIEWPORTS) {
      const { leaderboard, settings } = measureHeader(viewport);
      const edge = resolveLegacyHeaderEdgeInset(viewport.width);
      const leftGap = leaderboard.left;
      const rightGap = viewport.width - settings.right;
      rows.push(`${viewport.width}: left ${leftGap} right ${rightGap} (edge ${edge})`);
      expect(leftGap).toBe(edge);
      expect(rightGap).toBe(edge);
      expect(leftGap).toBeGreaterThanOrEqual(LEGACY_HEADER_EDGE_INSET_MIN_PX);
    }
    // 390 is the reference phone: at least 16px on both edges.
    const phone = measureHeader({ height: 844, width: 390 });
    expect(phone.leaderboard.left).toBeGreaterThanOrEqual(16);
    expect(390 - phone.settings.right).toBeGreaterThanOrEqual(16);
    expect(rows).toHaveLength(VIEWPORTS.length);
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
