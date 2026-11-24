import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import { resolveTouchControlLayout } from '../../src/input-human';
import { resolveLegacyHeaderControlFrame } from '../../src/legacy-runtime/legacyHeaderControl';
import {
  LEGACY_MIN_HIT_TARGET_PX,
  resolveLegacyMinHitRect
} from '../../src/legacy-runtime/legacyHitTarget';
import { resolveLegacyMenuDropdownLayout } from '../../src/legacy-runtime/legacyMenuDropdown';
import { resolveLegacyMenuLayout } from '../../src/legacy-runtime/legacyMenuLayout';
import { LEGACY_PLAY_MENU_PANEL_WIDTH_PX, buildLegacyPlayMenuRows } from '../../src/legacy-runtime/legacyPlayMenu';
import { buildLegacyGuideSheetPlan } from '../../src/legacy-runtime/legacyGuideSheetPlan';
import { buildLegacySettingsSheetPlan } from '../../src/legacy-runtime/legacySettingsSheetPlan';

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
  // L6: one menu button in the trailing slot replaced the leaderboard / account / settings trio; its dropdown rows
  // are touch targets too.
  const menuFrame = resolveLegacyHeaderControlFrame({ ...headerInput, placement: 'trailing' });
  const menuHit = resolveLegacyMinHitRect(menuFrame, viewport);
  zones.push({ height: menuHit.height, name: 'menu-header-menu', width: menuHit.width });
  const dropdown = resolveLegacyMenuDropdownLayout({
    safeArea: menuLayout.headerSafeInset,
    toggleFrame: menuFrame,
    toggleHit: menuHit,
    viewport
  });
  for (const row of dropdown.rows) {
    zones.push({ height: row.rect.height, name: `menu-dropdown-${row.item.id}`, width: row.rect.width });
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
  // MAZER-UI-095: the in-game Menu dropdown opens from that same control (its X is Resume); its rows are touch targets.
  const pause = touch.controls.pause;
  const playMenu = resolveLegacyMenuDropdownLayout({
    items: buildLegacyPlayMenuRows({ quitArmed: false, resetArmed: false, resetAvailable: true, soundEnabled: true }),
    panelWidth: LEGACY_PLAY_MENU_PANEL_WIDTH_PX,
    safeArea: { left: 0, right: 0 },
    toggleFrame: { height: 36, left: pause.left + ((pause.width - 36) / 2), top: pause.top + ((pause.height - 36) / 2), width: 36 },
    toggleHit: { height: pause.height, left: pause.left, top: pause.top, width: pause.width },
    viewport
  });
  zones.push({ height: playMenu.toggle.height, name: 'play-menu-resume', width: playMenu.toggle.width });
  for (const row of playMenu.rows) {
    zones.push({ height: row.rect.height, name: `play-menu-${row.item.id}`, width: row.rect.width });
  }

  // The shared Settings sheet (menu + pause) and the Guide sheet are painted
  // from their plans, so the plan rects ARE the hit zones.
  const plans = [
    buildLegacySettingsSheetPlan({ context: 'menu', height: viewport.height, signedIn: true, width: viewport.width }),
    buildLegacySettingsSheetPlan({ context: 'pause', height: viewport.height, width: viewport.width })
  ];
  for (const plan of plans) {
    for (const item of plan.items) {
      if (item.interactive) {
        zones.push({ height: item.rect.height, name: `settings-row-${item.model.id}`, width: item.rect.width });
      }
    }
  }
  const guide = buildLegacyGuideSheetPlan({ height: viewport.height, itemHeights: [58, 58, 78, 78, 78, 58, 60], width: viewport.width });
  zones.push({ height: guide.footer.height, name: 'guide-got-it', width: guide.footer.width });
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
    // The header menu button and its rows, play pause / the in-game Menu (the 2026-11-06 UI audit's under-44 px controls) plus
    // every interactive row of the shared Settings sheet (Back to Menu / Resume are the exits; no Close pill) and the Guide sheet (Got it).
    expect([...names].sort()).toEqual([
      'guide-got-it',
      'menu-dropdown-guide',
      'menu-dropdown-leaderboard',
      'menu-dropdown-profile',
      'menu-dropdown-settings',
      'menu-dropdown-sound',
      'menu-header-menu',
      'play-menu-guide',
      'play-menu-main-menu',
      'play-menu-reset-level',
      'play-menu-resume',
      'play-menu-settings',
      'play-menu-sound',
      'play-pause',
      'settings-row-back-to-menu',
      'settings-row-dark-mode',
      'settings-row-floating-anchor',
      'settings-row-haptics',
      'settings-row-reduce-motion',
      'settings-row-resume'
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
    createButton: 'generic button; front-door Start/Login use the full-screen zone',
    createLegacyAuthActionButton: 'account failure fallback: the one Try again button (44+)',
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

  test('the header menu button sizes its zone through the shared 44 px resolver', () => {
    expect(source).not.toMatch(/Math\.max\(36,\s*(?:pauseRect|rect|frame)\.width/);
    // L6: one header control (the menu dropdown button); its rows are 44 px by construction (legacyMenuDropdown.ts).
    const build = source.slice(source.indexOf('private buildLegacyMenuDropdownButtons('), source.indexOf('private clearUi('));
    expect(build).toContain('resolveLegacyMinHitRect(frame, this.layout)');
  });

  test('the menu dropdown module owns exactly its three hand-built zones: toggle, scrim and rows', () => {
    const dropdown = normalizeSourceLineEndings(readFileSync(resolve(process.cwd(), 'src/render/menuDropdownButtons.ts'), 'utf8'));
    const sites = [...dropdown.matchAll(/\.setInteractive\(/g)].map((match) => {
      const before = dropdown.slice(0, match.index ?? 0);
      const methods = [...before.matchAll(/^ {2}(?:private |public )?([A-Za-z0-9_]+)\(/gm)];
      return methods[methods.length - 1]?.[1];
    });
    expect(sites).toEqual(['createToggle', 'createScrim', 'createRow']);
  });
});
