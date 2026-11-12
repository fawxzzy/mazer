import { describe, expect, test } from 'vitest';
import {
  LEGACY_SETTINGS_DANGER_SEPARATION,
  LEGACY_SETTINGS_GROUP_ROWS,
  LEGACY_SETTINGS_PLAN_VIEWPORTS,
  LEGACY_SETTINGS_SIZES,
  buildLegacySettingsSheetModel,
  buildLegacySettingsSheetPlan,
  isLegacySettingsItemFullyVisible,
  resolveLegacySettingsItemScreenRect,
  type LegacySettingsPlanInput,
  type LegacySettingsRect,
  type LegacySettingsSheetPlan
} from '../../src/legacy-runtime/legacySettingsSheetPlan';
import { LEGACY_UI_MIN_TOUCH_TARGET } from '../../src/legacy-runtime/legacyUiStandards';
import { designTokens } from '../../src/theme/tokens';

const overlaps = (a: LegacySettingsRect, b: LegacySettingsRect): boolean => (
  a.left < b.left + b.width
  && b.left < a.left + a.width
  && a.top < b.top + b.height
  && b.top < a.top + a.height
);

const inside = (inner: LegacySettingsRect, outer: LegacySettingsRect): boolean => (
  inner.left >= outer.left
  && inner.top >= outer.top
  && inner.left + inner.width <= outer.left + outer.width
  && inner.top + inner.height <= outer.top + outer.height
);

const plan = (
  context: 'menu' | 'pause',
  viewport: { width: number; height: number },
  extra: Partial<LegacySettingsPlanInput> = {}
): LegacySettingsSheetPlan => buildLegacySettingsSheetPlan({
  context,
  height: viewport.height,
  width: viewport.width,
  ...(context === 'menu' ? { signedIn: true } : { settingsExpanded: true }),
  ...extra
});

describe('settings sheet model', () => {
  test('menu and pause share the identical Settings group rows in the same order', () => {
    const menu = buildLegacySettingsSheetModel('menu', { signedIn: true });
    const pause = buildLegacySettingsSheetModel('pause');
    const menuGroup = menu.sections.find((section) => section.id === 'settings')!;
    const pauseGroup = pause.sections.find((section) => section.id === 'settings')!;
    expect(menuGroup.rows).toBe(LEGACY_SETTINGS_GROUP_ROWS);
    expect(pauseGroup.rows).toBe(LEGACY_SETTINGS_GROUP_ROWS);
    expect(LEGACY_SETTINGS_GROUP_ROWS.map((r) => r.id)).toEqual([
      'how-to-play',
      'display-heading',
      'trail-fade',
      'trail-shine',
      'animated-background',
      'reduce-motion',
      'reduce-motion-note',
      'haptics'
    ]);
  });

  test('titles, overlay ids and collapse behaviour per context', () => {
    const menu = buildLegacySettingsSheetModel('menu', { signedIn: true });
    const pause = buildLegacySettingsSheetModel('pause');
    expect([menu.title, menu.overlayId]).toEqual(['Settings', 'options']);
    expect([pause.title, pause.overlayId]).toEqual(['Paused', 'pause']);
    expect(menu.sections.find((s) => s.id === 'settings')!.collapsible).toBe(false);
    const pauseSettings = pause.sections.find((s) => s.id === 'settings')!;
    expect(pauseSettings.collapsible).toBe(true);
    expect(pauseSettings.collapsedByDefault).toBe(true);
  });

  test('Account section (Reset progress, Sign out) exists in menu only; pause keeps Resume and Quit to Menu', () => {
    const menuIds = buildLegacySettingsSheetModel('menu', { signedIn: true }).sections.flatMap((s) => s.rows.map((r) => r.id));
    const pauseIds = buildLegacySettingsSheetModel('pause').sections.flatMap((s) => s.rows.map((r) => r.id));
    expect(menuIds).toContain('reset-progress');
    expect(menuIds).toContain('sign-out');
    expect(menuIds).not.toContain('resume');
    expect(menuIds).not.toContain('quit-to-menu');
    // The menu's primary exit is its own row, never the pause Resume row.
    expect(menuIds).toContain('back-to-menu');
    expect(pauseIds).not.toContain('back-to-menu');
    expect(pauseIds).toEqual(expect.arrayContaining(['resume', 'quit-to-menu', 'how-to-play']));
    expect(pauseIds).not.toContain('reset-progress');
    expect(pauseIds).not.toContain('sign-out');
  });

  test('Sign out only when signed in; Reset progress is always offered and ordered before it', () => {
    const guest = buildLegacySettingsSheetModel('menu', { signedIn: false }).sections.flatMap((s) => s.rows.map((r) => r.id));
    expect(guest).toContain('reset-progress');
    expect(guest).not.toContain('sign-out');
    const signed = buildLegacySettingsSheetModel('menu', { signedIn: true }).sections.flatMap((s) => s.rows.map((r) => r.id));
    expect(signed.indexOf('reset-progress')).toBeLessThan(signed.indexOf('sign-out'));
  });

  test('Reset progress opens the confirm flow (never resets directly) and is danger-outline, Sign out is danger', () => {
    const rows = buildLegacySettingsSheetModel('menu', { signedIn: true }).sections.flatMap((s) => s.rows);
    const reset = rows.find((r) => r.id === 'reset-progress')!;
    expect(reset.command).toEqual({ type: 'BEGIN_RESET_PROGRESS' });
    expect(reset.emphasis).toBe('danger-outline');
    expect(rows.find((r) => r.id === 'sign-out')!.emphasis).toBe('danger');
  });

  test('no Close pill, X or back arrow: the primary top row is the exit in both contexts', () => {
    for (const context of ['menu', 'pause'] as const) {
      const model = buildLegacySettingsSheetModel(context, { signedIn: true });
      expect('close' in model).toBe(false);
      const labels = model.sections.flatMap((section) => section.rows.map((r) => r.label));
      expect(labels).not.toContain('Close');
      expect(labels.join('|')).not.toMatch(/[<>‹›←×✕]/);
      // The first row of the first section is the primary action.
      const first = model.sections[0]!.rows[0]!;
      expect(first.emphasis).toBe('primary');
      expect(first.kind).toBe('action');
    }
    const pauseFirst = buildLegacySettingsSheetModel('pause').sections[0]!.rows[0]!;
    expect([pauseFirst.id, pauseFirst.label, pauseFirst.command]).toEqual(['resume', 'Resume', { type: 'RESUME_RUN' }]);
    const menuFirst = buildLegacySettingsSheetModel('menu').sections[0]!.rows[0]!;
    expect([menuFirst.id, menuFirst.label, menuFirst.command]).toEqual(['back-to-menu', 'Back to Menu', { type: 'CLOSE_OVERLAY' }]);
  });

  test('Back to Menu takes the same slot, size and emphasis as Resume', () => {
    const viewport = { height: 844, width: 390 };
    const menuTop = plan('menu', viewport).items[0]!;
    const pauseTop = plan('pause', viewport).items[0]!;
    expect(menuTop.model.id).toBe('back-to-menu');
    expect(pauseTop.model.id).toBe('resume');
    expect(menuTop.model.emphasis).toBe(pauseTop.model.emphasis);
    expect(menuTop.rect.top).toBe(0);
    expect(pauseTop.rect.top).toBe(0);
    expect(menuTop.rect.height).toBe(pauseTop.rect.height);
    expect(menuTop.rect.width).toBe(pauseTop.rect.width);
    expect(menuTop.parts).toEqual(pauseTop.parts);
  });

  test('toggle state words are separate from labels and keep today\'s copy', () => {
    const toggles = LEGACY_SETTINGS_GROUP_ROWS.filter((r) => r.kind === 'toggle');
    expect(toggles.map((r) => [r.label, r.onLabel, r.offLabel])).toEqual([
      ['Trail Fade', 'On', 'Off'],
      ['Trail Shine', 'On', 'Off'],
      ['Animated Background', 'Animated', 'Still'],
      ['Reduce Motion', 'On', 'System'],
      ['Haptics', 'On', 'Off']
    ]);
    for (const toggle of toggles) {
      expect(toggle.label).not.toContain(':');
    }
  });
});

describe.each(LEGACY_SETTINGS_PLAN_VIEWPORTS.map((v) => [`${v.width}x${v.height}`, v] as const))(
  'settings sheet plan at %s',
  (_name, viewport) => {
    const cases: Array<[string, LegacySettingsSheetPlan]> = [
      ['menu signed-in', plan('menu', viewport)],
      ['menu guest', plan('menu', viewport, { signedIn: false })],
      ['pause expanded', plan('pause', viewport)],
      ['pause collapsed', plan('pause', viewport, { settingsExpanded: false })]
    ];

    test.each(cases)('%s: items never overlap each other or their own parts', (_label, p) => {
      for (let i = 0; i < p.items.length; i += 1) {
        for (let j = i + 1; j < p.items.length; j += 1) {
          expect(overlaps(p.items[i]!.rect, p.items[j]!.rect), `${p.items[i]!.model.id} vs ${p.items[j]!.model.id}`).toBe(false);
        }
      }
      for (const item of p.items) {
        const local: LegacySettingsRect = { height: item.rect.height, left: 0, top: 0, width: item.rect.width };
        const parts = [item.parts.label, item.parts.state, item.parts.switchControl, item.parts.chevron]
          .filter((part): part is LegacySettingsRect => part !== null);
        for (const part of parts) {
          expect(inside(part, local), `${item.model.id} part inside row`).toBe(true);
        }
        // Label, state and switch columns are pairwise disjoint (the 320 clipping bug).
        const columns = [item.parts.label, item.parts.state, item.parts.switchControl, item.parts.chevron]
          .filter((part): part is LegacySettingsRect => part !== null);
        for (let i = 0; i < columns.length; i += 1) {
          for (let j = i + 1; j < columns.length; j += 1) {
            if (item.model.kind === 'toggle' || item.model.kind === 'nav' || item.model.kind === 'disclosure') {
              expect(overlaps(columns[i]!, columns[j]!), `${item.model.id} columns`).toBe(false);
            }
          }
        }
      }
    });

    test.each(cases)('%s: every interactive item is at least the touch-target token tall and wide', (_label, p) => {
      expect(LEGACY_UI_MIN_TOUCH_TARGET).toBe(designTokens.touchTargetMinPx);
      expect(LEGACY_UI_MIN_TOUCH_TARGET).toBeGreaterThanOrEqual(44);
      for (const item of p.items.filter((i) => i.interactive)) {
        expect(item.rect.height, `${item.model.id} height`).toBeGreaterThanOrEqual(LEGACY_UI_MIN_TOUCH_TARGET);
        expect(item.rect.width, `${item.model.id} width`).toBeGreaterThanOrEqual(LEGACY_UI_MIN_TOUCH_TARGET);
      }
      // Headings and the helper note are the only non-interactive rows.
      expect(p.items.filter((i) => !i.interactive).every((i) => i.model.kind === 'heading' || i.model.kind === 'note')).toBe(true);
    });

    test.each(cases)('%s: label fonts never shrink below the body token and labels may wrap', (_label, p) => {
      for (const item of p.items.filter((i) => i.model.kind !== 'note')) {
        expect(item.labelFontSize).toBeGreaterThanOrEqual(designTokens.legacy.fontSizePx.body);
        expect(item.labelMaxLines).toBe(item.model.kind === 'heading' ? 1 : 2);
        expect(item.labelMaxLines * LEGACY_SETTINGS_SIZES.labelLineHeight).toBeLessThanOrEqual(item.rect.height);
      }
    });

    test.each(cases)('%s: card is inside the panel, body is inside the card', (_label, p) => {
      expect(p.card.left).toBeGreaterThanOrEqual(p.panel.left);
      expect(p.card.left + p.card.width).toBeLessThanOrEqual(p.panel.left + p.panel.width);
      expect(p.card.top).toBeGreaterThanOrEqual(p.panel.top);
      expect(p.card.top + p.card.height).toBeLessThanOrEqual(p.panel.top + p.panel.height);
      expect(inside(p.bodyViewport, p.card)).toBe(true);
      expect(p.title.centerY).toBeLessThan(p.bodyViewport.top);
    });

    test.each(cases)('%s: scroll bounds are honest and every item can be reached', (_label, p) => {
      expect(p.scrollable).toBe(p.contentHeight > p.bodyViewport.height);
      expect(p.maxScrollOffset).toBe(Math.max(0, p.contentHeight - p.bodyViewport.height));
      for (const item of p.items) {
        // Some scroll offset in [0, max] shows each item fully.
        const reachable = [0, p.maxScrollOffset].some((offset) => isLegacySettingsItemFullyVisible(p, item, offset))
          || (item.rect.top >= 0 && item.rect.top + item.rect.height <= p.contentHeight);
        expect(reachable).toBe(true);
        if (!p.scrollable) {
          expect(isLegacySettingsItemFullyVisible(p, item, 0), `${item.model.id} fully visible`).toBe(true);
        }
      }
      // Last item is flush with the end of the content.
      const last = p.items.at(-1)!;
      expect(last.rect.top + last.rect.height).toBe(p.contentHeight);
      const lastScreen = resolveLegacySettingsItemScreenRect(p, last, p.maxScrollOffset);
      expect(lastScreen.top + lastScreen.height).toBeLessThanOrEqual(p.bodyViewport.top + p.bodyViewport.height);
    });

    test('Reset progress is separated from Sign out by the danger separation token and both are tappable apart', () => {
      const p = plan('menu', viewport);
      const reset = p.items.find((i) => i.model.id === 'reset-progress')!;
      const signOut = p.items.find((i) => i.model.id === 'sign-out')!;
      const gap = signOut.rect.top - (reset.rect.top + reset.rect.height);
      expect(LEGACY_SETTINGS_DANGER_SEPARATION).toBeGreaterThanOrEqual(24);
      expect(designTokens.spacingPx).toContain(LEGACY_SETTINGS_DANGER_SEPARATION);
      expect(gap).toBeGreaterThanOrEqual(LEGACY_SETTINGS_DANGER_SEPARATION);
      // Sign out is the last row, Reset progress is not the bottom-most control.
      expect(p.items.at(-1)!.model.id).toBe('sign-out');
    });

    test('same row geometry in menu and pause context (shared Settings group)', () => {
      const menu = plan('menu', viewport);
      const pause = plan('pause', viewport);
      expect(menu.card.width).toBe(pause.card.width);
      expect(menu.card.left).toBe(pause.card.left);
      expect(menu.bodyViewport.width).toBe(pause.bodyViewport.width);
      expect(menu.bodyViewport.left).toBe(pause.bodyViewport.left);
      expect(menu.title.fontSize).toBe(pause.title.fontSize);
      const sharedIds = LEGACY_SETTINGS_GROUP_ROWS.map((r) => r.id);
      for (const id of sharedIds) {
        const a = menu.items.find((i) => i.model.id === id)!;
        const b = pause.items.find((i) => i.model.id === id)!;
        expect(a.rect.width, `${id} width`).toBe(b.rect.width);
        expect(a.rect.height, `${id} height`).toBe(b.rect.height);
        expect(a.rect.left, `${id} left`).toBe(b.rect.left);
        expect(a.parts, `${id} parts`).toEqual(b.parts);
        expect(a.labelFontSize).toBe(b.labelFontSize);
        expect(a.stateFontSize).toBe(b.stateFontSize);
      }
      // Rows keep the same relative spacing inside the group.
      const relTops = (p: LegacySettingsSheetPlan): number[] => {
        const group = sharedIds.map((id) => p.items.find((i) => i.model.id === id)!.rect.top);
        return group.map((top) => top - group[0]!);
      };
      expect(relTops(menu)).toEqual(relTops(pause));
    });
  }
);

describe('settings sheet plan specifics', () => {
  test('pause collapsed hides the group rows but keeps Resume, Settings disclosure and Quit to Menu', () => {
    const p = plan('pause', { height: 844, width: 390 }, { settingsExpanded: false });
    expect(p.items.map((i) => i.model.id)).toEqual(['resume', 'settings-disclosure', 'quit-to-menu']);
    expect(p.scrollable).toBe(false);
  });

  test('pause expanded lists Resume, disclosure, group rows, then Quit to Menu last', () => {
    const p = plan('pause', { height: 844, width: 390 });
    expect(p.items.map((i) => i.model.id)).toEqual([
      'resume',
      'settings-disclosure',
      'how-to-play',
      'display-heading',
      'trail-fade',
      'trail-shine',
      'animated-background',
      'reduce-motion',
      'reduce-motion-note',
      'haptics',
      'quit-to-menu'
    ]);
  });

  test('menu is always open: Back to Menu, group rows, then Account heading, Reset progress, Sign out', () => {
    const p = plan('menu', { height: 844, width: 390 }, { settingsExpanded: false });
    expect(p.settingsExpanded).toBe(true);
    expect(p.items.map((i) => i.model.id)).toEqual([
      'back-to-menu',
      'how-to-play',
      'display-heading',
      'trail-fade',
      'trail-shine',
      'animated-background',
      'reduce-motion',
      'reduce-motion-note',
      'haptics',
      'account-heading',
      'reset-progress',
      'sign-out'
    ]);
  });

  test('320x568 menu needs scrolling but 1280x720 shows the whole sheet; titles come from the model', () => {
    expect(plan('menu', { height: 568, width: 320 }).scrollable).toBe(true);
    const wide = plan('menu', { height: 720, width: 1280 });
    expect(wide.title.text).toBe('Settings');
    expect(plan('pause', { height: 720, width: 1280 }).title.text).toBe('Paused');
  });

  test('safe-area insets shrink the available panel without breaking the plan', () => {
    const p = buildLegacySettingsSheetPlan({
      context: 'menu',
      height: 844,
      safeArea: { bottom: 34, top: 47 },
      signedIn: true,
      width: 390
    });
    expect(p.panel.top).toBeGreaterThanOrEqual(47);
    expect(p.card.top + p.card.height).toBeLessThanOrEqual(844 - 34);
  });

  test('sizes use the token scale', () => {
    const scale = designTokens.spacingPx;
    expect(scale).toContain(LEGACY_SETTINGS_SIZES.rowGap);
    expect(scale).toContain(LEGACY_SETTINGS_SIZES.sectionGap);
    expect(scale).toContain(LEGACY_SETTINGS_SIZES.rowPadding);
    expect(scale).toContain(LEGACY_SETTINGS_SIZES.cardPaddingCompact);
    expect(scale).toContain(LEGACY_SETTINGS_SIZES.cardPaddingRegular);
    expect(LEGACY_SETTINGS_SIZES.actionHeight).toBeGreaterThanOrEqual(designTokens.touchTargetMinPx);
    expect(LEGACY_SETTINGS_SIZES.rowHeight).toBeGreaterThanOrEqual(designTokens.touchTargetMinPx);
    expect(LEGACY_SETTINGS_SIZES.labelFontSize).toBe(designTokens.legacy.fontSizePx.label);
  });
});

describe('scroll rail and narrow rows (wiring lane, 2026-11-06)', () => {
  const plans = LEGACY_SETTINGS_PLAN_VIEWPORTS.flatMap(({ height, width }) => (
    (['menu', 'pause'] as const).map((context) => [
      `${context} ${width}x${height}`,
      buildLegacySettingsSheetPlan({ context, height, settingsExpanded: true, signedIn: true, width })
    ] as const)
  ));

  test.each(plans)('%s: rows keep the full inner width and the rail sits in the card padding', (_label, plan) => {
    for (const item of plan.items) {
      expect(item.rect.width).toBe(plan.bodyViewport.width);
    }
    const overhang = plan.scrollRailViewport.left + plan.scrollRailViewport.width;
    expect(overhang).toBeGreaterThan(plan.bodyViewport.left + plan.bodyViewport.width);
    expect(overhang).toBeLessThanOrEqual(plan.card.left + plan.card.width);
    expect(plan.scrollRailViewport.top).toBe(plan.bodyViewport.top);
    expect(plan.scrollRailViewport.height).toBe(plan.bodyViewport.height);
  });

  // Close pill removal (2026-11-06): the 46 + 6/8 px header reserve that held it is
  // reclaimed. A sheet that fits is centred in the whole panel; one that does not
  // fills the whole panel height.
  test.each(plans)('%s: the card is centred in the full panel height (no header reserve)', (_label, plan) => {
    expect(plan.availableHeight).toBe(plan.panel.height);
    const slackTop = plan.card.top - plan.panel.top;
    const slackBottom = (plan.panel.top + plan.panel.height) - (plan.card.top + plan.card.height);
    expect(Math.abs(slackTop - slackBottom)).toBeLessThanOrEqual(1);
    if (plan.naturalCardHeight > plan.panel.height) {
      expect(plan.card.height).toBe(plan.panel.height);
      expect(plan.card.top).toBe(plan.panel.top);
    } else {
      expect(plan.card.height).toBe(plan.naturalCardHeight);
      expect(plan.scrollable).toBe(false);
    }
  });

  test('at 320x568 the expanded Pause card (now with the Haptics row) overflows the 552 panel and uses the scroll rail', () => {
    const plan = buildLegacySettingsSheetPlan({ context: 'pause', height: 568, settingsExpanded: true, signedIn: true, width: 320 });
    // Before the header reserve was freed: panel.height 552 minus 52 = 500 available. Now: all 552.
    expect(plan.panel.height).toBe(552);
    // Board Zoom's removal had let the expanded pause card fit at 538. The Haptics toggle row (MAZER-CTRL-001) and
    // the Reduce Motion toggle + helper note (MAZER-MOTION-004) make the natural card taller than the panel,
    // so the card fills the panel and scrolls (the rail is expected).
    expect(plan.naturalCardHeight).toBe(754);
    expect(plan.card.height).toBe(plan.panel.height);
    expect(plan.scrollable).toBe(true);
    // The signed-in menu sheet is still 590 tall at 320x568: it genuinely overflows and keeps the rail.
    const menu = buildLegacySettingsSheetPlan({ context: 'menu', height: 568, signedIn: true, width: 320 });
    expect(menu.card.height).toBe(menu.panel.height);
    expect(menu.scrollable).toBe(true);
  });

  test('the scroll rail appears only when the content truly overflows the body', () => {
    for (const { height, width } of LEGACY_SETTINGS_PLAN_VIEWPORTS) {
      for (const context of ['menu', 'pause'] as const) {
        const p = buildLegacySettingsSheetPlan({ context, height, settingsExpanded: true, signedIn: true, width });
        expect(p.scrollable).toBe(p.contentHeight > p.bodyViewport.height);
        if (!p.scrollable) {
          expect(p.card.height).toBe(p.naturalCardHeight);
        }
      }
    }
    // 390x844 and 1280x720 hold the whole menu sheet without a rail now that the reserve is gone.
    expect(plan('menu', { height: 844, width: 390 }).scrollable).toBe(false);
    // The Reduce Motion toggle + note (156 px) tip the signed-in menu sheet over 720 px tall: it scrolls there now.
    expect(plan('menu', { height: 720, width: 1280 }).scrollable).toBe(true);
  });

  test('at 320 wide the label column still holds a 14 px "Background" on its own line', () => {
    const plan = buildLegacySettingsSheetPlan({ context: 'menu', height: 568, signedIn: true, width: 320 });
    const toggle = plan.items.find((item) => item.model.id === 'animated-background')!;
    // "Background" at 14 px is about 78 px wide; the label column must not be narrower.
    expect(toggle.parts.label.width).toBeGreaterThanOrEqual(88);
    expect(toggle.parts.state!.width).toBeGreaterThanOrEqual(58);
  });
});
