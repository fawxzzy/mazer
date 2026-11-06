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
      'board-zoom',
      'trail-fade',
      'trail-shine',
      'animated-background'
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

  test('close affordance is labelled text in both contexts, never a bare chevron', () => {
    for (const context of ['menu', 'pause'] as const) {
      const close = buildLegacySettingsSheetModel(context).close;
      expect(close.label).toBe('Close');
      expect(close.label).not.toMatch(/^[<‹←]+$/);
      expect(close.accessibleName.length).toBeGreaterThan(5);
    }
    expect(buildLegacySettingsSheetModel('pause').close.command).toEqual({ type: 'RESUME_RUN' });
    expect(buildLegacySettingsSheetModel('menu').close.command).toEqual({ type: 'CLOSE_OVERLAY' });
  });

  test('toggle state words are separate from labels and keep today\'s copy', () => {
    const toggles = LEGACY_SETTINGS_GROUP_ROWS.filter((r) => r.kind === 'toggle');
    expect(toggles.map((r) => [r.label, r.onLabel, r.offLabel])).toEqual([
      ['Trail Fade', 'On', 'Off'],
      ['Trail Shine', 'On', 'Off'],
      ['Animated Background', 'Animated', 'Still']
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
        const parts = [item.parts.label, item.parts.state, item.parts.switchControl, item.parts.track, item.parts.chevron]
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
        if (item.model.kind === 'slider') {
          expect(overlaps(item.parts.label, item.parts.track!)).toBe(false);
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
      expect(p.close.rect.height).toBeGreaterThanOrEqual(LEGACY_UI_MIN_TOUCH_TARGET);
      expect(p.close.rect.width).toBeGreaterThanOrEqual(LEGACY_UI_MIN_TOUCH_TARGET);
      // Headings are the only non-interactive rows.
      expect(p.items.filter((i) => !i.interactive).every((i) => i.model.kind === 'heading')).toBe(true);
    });

    test.each(cases)('%s: label fonts never shrink below the body token and labels may wrap', (_label, p) => {
      for (const item of p.items) {
        expect(item.labelFontSize).toBeGreaterThanOrEqual(designTokens.legacy.fontSizePx.body);
        expect(item.labelMaxLines).toBe(item.model.kind === 'heading' || item.model.kind === 'slider' ? 1 : 2);
        expect(item.labelMaxLines * LEGACY_SETTINGS_SIZES.labelLineHeight).toBeLessThanOrEqual(item.rect.height);
      }
    });

    test.each(cases)('%s: close sits clear of the card, card is inside the panel, body is inside the card', (_label, p) => {
      expect(overlaps(p.close.rect, p.card)).toBe(false);
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
      expect(menu.close.rect).toEqual(pause.close.rect);
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
      'board-zoom',
      'trail-fade',
      'trail-shine',
      'animated-background',
      'quit-to-menu'
    ]);
  });

  test('menu is always open: group rows then Account heading, Reset progress, Sign out', () => {
    const p = plan('menu', { height: 844, width: 390 }, { settingsExpanded: false });
    expect(p.settingsExpanded).toBe(true);
    expect(p.items.map((i) => i.model.id)).toEqual([
      'how-to-play',
      'display-heading',
      'board-zoom',
      'trail-fade',
      'trail-shine',
      'animated-background',
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
    expect(overlaps(p.close.rect, p.card)).toBe(false);
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
