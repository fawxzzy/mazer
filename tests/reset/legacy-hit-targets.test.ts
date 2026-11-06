import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import { resolveTouchControlLayout } from '../../src/input-human';
import { resolveLegacyHeaderControlFrame } from '../../src/legacy-runtime/legacyHeaderControl';
import {
  LEGACY_MIN_HIT_TARGET_PX,
  resolveLegacyMinHitRect
} from '../../src/legacy-runtime/legacyHitTarget';
import { resolveLegacyMenuLayout } from '../../src/legacy-runtime/legacyMenuLayout';
import {
  resolveLegacyOptionsGuideLayout,
  resolveLegacyOverlayPanelLayout
} from '../../src/legacy-runtime/legacyUiStandards';

const normalizeSourceLineEndings = (source: string): string => source.replace(/\r\n?/g, '\n');

const VIEWPORTS = [
  { height: 568, width: 320 },
  { height: 640, width: 360 },
  { height: 844, width: 390 },
  { height: 932, width: 430 },
  { height: 320, width: 568 },
  { height: 390, width: 844 },
  { height: 720, width: 1280 }
] as const;

interface HitZone {
  height: number;
  name: string;
  width: number;
}

// Mirrors how MenuScene feeds the shared frame resolvers: layout.lanes.hud and
// layout.headerIconScale drive the header trio; the same layout's board rect
// is the touch layout's avoid rect for the in-play pause control.
const enumerateHitZones = (viewport: { height: number; width: number }): HitZone[] => {
  const zones: HitZone[] = [];
  const menuLayout = resolveLegacyMenuLayout(viewport.width, viewport.height, 50, 49, 49, 'menu');
  const headerInput = {
    height: menuLayout.height,
    hudHeight: menuLayout.lanes.hud?.height ?? 64,
    hudTop: menuLayout.lanes.hud?.top ?? 0,
    sizeScale: menuLayout.headerIconScale,
    width: menuLayout.width
  };
  const headerZones = [
    ['menu-header-account', { ...headerInput, placement: 'leading' as const }],
    ['menu-header-leaderboard', { ...headerInput, placement: 'trailing' as const, slot: 1 }],
    ['menu-header-settings', { ...headerInput, placement: 'trailing' as const }]
  ] as const;
  for (const [name, input] of headerZones) {
    const hit = resolveLegacyMinHitRect(resolveLegacyHeaderControlFrame(input), viewport);
    zones.push({ height: hit.height, name, width: hit.width });
  }

  const playLayout = resolveLegacyMenuLayout(viewport.width, viewport.height, 50, 49, 49, 'play');
  const touch = resolveTouchControlLayout(viewport, {
    avoidRect: {
      height: playLayout.boardHeight,
      left: playLayout.boardLeft,
      top: playLayout.boardTop,
      width: playLayout.boardWidth
    },
    compact: true,
    controlMode: 'stick',
    placement: viewport.width >= 720 && viewport.height >= 600 ? 'bottom-centered' : undefined
  });
  zones.push({
    height: touch.controls.pause.height,
    name: 'play-pause',
    width: touch.controls.pause.width
  });

  const panel = resolveLegacyOverlayPanelLayout(viewport.width, viewport.height);
  const guide = resolveLegacyOptionsGuideLayout(panel.width, 5);
  const guideHit = resolveLegacyMinHitRect({
    height: guide.collapsedHeight,
    left: 0,
    top: 100,
    width: Math.min(panel.width - guide.horizontalMargin, guide.cardWidthLimit)
  });
  zones.push({ height: guideHit.height, name: 'options-guide-header', width: guideHit.width });
  return zones;
};

describe('legacy hit targets (Wave 5C)', () => {
  test('resolveLegacyMinHitRect grows only the zone, centered, and never shrinks', () => {
    const grown = resolveLegacyMinHitRect({ height: 36, left: 10, top: 12, width: 36 });
    expect(grown).toMatchObject({ height: 44, left: 6, top: 8, width: 44 });
    expect(grown.centerX).toBe(28);
    expect(grown.centerY).toBe(30);

    const alreadyBig = resolveLegacyMinHitRect({ height: 48, left: 0, top: 0, width: 306 });
    expect(alreadyBig).toMatchObject({ height: 48, left: 0, top: 0, width: 306 });

    // Only the short axis grows.
    expect(resolveLegacyMinHitRect({ height: 40, left: 32, top: 68, width: 236 })).toMatchObject({
      height: 44,
      top: 66,
      width: 236
    });
  });

  test('shifts into the viewport instead of shrinking when a control hugs an edge', () => {
    const hit = resolveLegacyMinHitRect({ height: 32, left: 1, top: 1, width: 32 }, { height: 568, width: 320 });
    expect(hit.left).toBe(0);
    expect(hit.top).toBe(0);
    expect(hit.width).toBe(LEGACY_MIN_HIT_TARGET_PX);
    expect(hit.height).toBe(LEGACY_MIN_HIT_TARGET_PX);
  });

  test('every enumerated interactive zone is at least 44x44 on every supported viewport', () => {
    const names = new Set<string>();
    const undersized: string[] = [];
    for (const viewport of VIEWPORTS) {
      for (const zone of enumerateHitZones(viewport)) {
        names.add(zone.name);
        if (zone.width < LEGACY_MIN_HIT_TARGET_PX || zone.height < LEGACY_MIN_HIT_TARGET_PX) {
          undersized.push(`${zone.name} at ${viewport.width}x${viewport.height} is ${zone.width}x${zone.height}`);
        }
      }
    }
    expect(undersized).toEqual([]);
    // The five controls the 2026-11-06 UI audit found under 44 px.
    expect([...names].sort()).toEqual([
      'menu-header-account',
      'menu-header-leaderboard',
      'menu-header-settings',
      'options-guide-header',
      'play-pause'
    ]);
  });
});

describe('MenuScene interactive-zone inventory', () => {
  const source = normalizeSourceLineEndings(
    readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8')
  );

  const findEnclosingMethod = (index: number): string => {
    const before = source.slice(0, index);
    const matches = [...before.matchAll(/^ {2}(?:private |public |protected )?(?:async )?([A-Za-z0-9_]+)(?:<[^>]*>)?\(/gm)];
    return matches[matches.length - 1]?.[1] ?? '(unknown)';
  };

  // Every hand-built hit zone in MenuScene. Adding a setInteractive site
  // without listing it here fails this test, which forces a deliberate size
  // review (>= 44 px effective, or a documented non-touch/full-screen zone).
  const EXPECTED_INTERACTIVE_SITES: Record<string, string> = {
    createAuthFieldBox: 'auth field: full-width row',
    createAuthFooterLink: 'auth footer link row',
    createAuthScreenLink: 'auth screen link: row height = LEGACY_AUTH_SCREEN_LINK_ROW_HEIGHT (44)',
    createBoardZoomSliderRow: 'settings slider row (52+)',
    createButton: 'generic button; front-door Start/Login use the full-screen zone',
    createInputFieldBox: 'options input field row',
    createLegacyAuthActionButton: 'auth action button (44+)',
    createLegacyAuthPasswordVisibilityButton: 'password visibility toggle: size passed by caller',
    createLegacyMenuLeaderboardButton: 'header: grown to LEGACY_MIN_HIT_TARGET_PX via resolveLegacyMinHitRect',
    createLegacyMenuProfileButton: 'header: grown to LEGACY_MIN_HIT_TARGET_PX via resolveLegacyMinHitRect',
    createLegacyMenuSettingsCogButton: 'header: grown to LEGACY_MIN_HIT_TARGET_PX via resolveLegacyMinHitRect',
    createLegacyOptionsGuideHeaderButton: 'guide header: grown to LEGACY_MIN_HIT_TARGET_PX via resolveLegacyMinHitRect',
    createMovementSpeedSliderRow: 'settings slider row (52+)',
    createOverlayBackChevronButton: 'back chevron (72x64)',
    createToggleSwitchRow: 'toggle card (52+)'
  };

  test('every setInteractive site is inventoried', () => {
    const found = new Set<string>();
    for (const match of source.matchAll(/\.setInteractive\(/g)) {
      found.add(findEnclosingMethod(match.index ?? 0));
    }
    // authGateLoadingBlocker is an intentional full-screen input shield.
    found.delete('syncLegacyAuthGateLoadingScreen');
    expect([...found].sort()).toEqual(Object.keys(EXPECTED_INTERACTIVE_SITES).sort());
  });

  test('the header trio and Guide header size their zones through the shared 44 px resolver', () => {
    expect(source).not.toMatch(/Math\.max\(36,\s*(?:pauseRect|rect|frame)\.width/);
    expect(source.match(/resolveLegacyMinHitRect\(/g)?.length).toBeGreaterThanOrEqual(4);
  });
});
