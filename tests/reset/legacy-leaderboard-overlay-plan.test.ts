import { describe, expect, test } from 'vitest';
import type { LegacyLeaderboardEntry } from '../../src/legacy-runtime/legacyLeaderboard';
import {
  LEGACY_LEADERBOARD_PLAN_VIEWPORTS,
  LEGACY_LEADERBOARD_SHEET_SIZES,
  buildLegacyLeaderboardOverlayPlan,
  resolveLegacyLeaderboardRowScreenRect,
  type LegacyLeaderboardOverlayPlan,
  type LegacyLeaderboardPlanRect
} from '../../src/legacy-runtime/legacyLeaderboardOverlayPlan';
import {
  buildLegacyLeaderboardViewModel,
  type LegacyLeaderboardViewState
} from '../../src/legacy-runtime/legacyLeaderboardView';
import { buildLegacySettingsSheetPlan, LEGACY_SETTINGS_SIZES } from '../../src/legacy-runtime/legacySettingsSheetPlan';
import { LEGACY_UI_MIN_TOUCH_TARGET } from '../../src/legacy-runtime/legacyUiStandards';

const entries = (count: number): LegacyLeaderboardEntry[] => (
  Array.from({ length: count }, (_, i) => ({
    isRequestingUser: false,
    playerLevel: String(500 - i),
    rank: String(i + 1),
    username: `player${i + 1}`
  }))
);

const baseState = (patch: Partial<LegacyLeaderboardViewState> = {}): LegacyLeaderboardViewState => ({
  entries: entries(50),
  errorMessage: null,
  online: true,
  selfRank: { hasUsername: true, playerLevel: '68', rank: '57' },
  selfUsername: 'qa-player',
  signedIn: true,
  status: 'ready',
  usernameGate: 'ok',
  ...patch
});

const SHAPES: Array<[string, Partial<LegacyLeaderboardViewState>]> = [
  ['ready, you outside top N', {}],
  ['ready, no self rank', { selfRank: null }],
  ['ready, 3 rows', { entries: entries(3) }],
  ['loading', { status: 'loading' }],
  ['empty', { entries: [], status: 'empty' }],
  ['error', { status: 'error' }],
  ['offline', { online: false, status: 'error' }],
  ['signed out', { signedIn: false }],
  ['needs username', { usernameGate: 'needs-username' }]
];

const plans = LEGACY_LEADERBOARD_PLAN_VIEWPORTS.flatMap(({ height, width }) => (
  SHAPES.map(([label, patch]) => ({
    label: `${width}x${height} ${label}`,
    plan: buildLegacyLeaderboardOverlayPlan(buildLegacyLeaderboardViewModel(baseState(patch)), width, height),
    height,
    width
  }))
));

const inside = (inner: LegacyLeaderboardPlanRect, outer: LegacyLeaderboardPlanRect): boolean => (
  inner.left >= outer.left - 0.5
  && inner.top >= outer.top - 0.5
  && inner.left + inner.width <= outer.left + outer.width + 0.5
  && inner.top + inner.height <= outer.top + outer.height + 0.5
);
const overlaps = (a: LegacyLeaderboardPlanRect, b: LegacyLeaderboardPlanRect): boolean => (
  a.left < b.left + b.width && b.left < a.left + a.width && a.top < b.top + b.height && b.top < a.top + a.height
);

describe.each(plans)('leaderboard plan: $label', ({ plan, height, width }) => {
  test('the card is centred and inside the viewport', () => {
    expect(plan.card.left).toBeGreaterThanOrEqual(0);
    expect(plan.card.left + plan.card.width).toBeLessThanOrEqual(width);
    expect(plan.card.top).toBeGreaterThanOrEqual(0);
    expect(plan.card.top + plan.card.height).toBeLessThanOrEqual(height);
    expect(Math.abs((plan.card.left + (plan.card.width / 2)) - (width / 2))).toBeLessThanOrEqual(1);
    const slackTop = plan.card.top - plan.panel.top;
    const slackBottom = (plan.panel.top + plan.panel.height) - (plan.card.top + plan.card.height);
    expect(Math.abs(slackTop - slackBottom)).toBeLessThanOrEqual(1);
  });

  test('the exit and every action are at least the touch-target floor and inside the card', () => {
    expect(plan.exit.height).toBeGreaterThanOrEqual(LEGACY_UI_MIN_TOUCH_TARGET);
    expect(plan.exit.width).toBeGreaterThanOrEqual(LEGACY_UI_MIN_TOUCH_TARGET);
    expect(inside(plan.exit, plan.card)).toBe(true);
    if (plan.stateBlock?.action) {
      const action = plan.stateBlock.action;
      expect(action.height).toBeGreaterThanOrEqual(LEGACY_UI_MIN_TOUCH_TARGET);
      expect(action.width).toBeGreaterThanOrEqual(LEGACY_UI_MIN_TOUCH_TARGET);
      expect(inside(action, plan.card)).toBe(true);
      expect(overlaps(action, plan.exit)).toBe(false);
    }
  });

  test('rows are at least 44 px; list, header, You row and exit are disjoint and inside the card', () => {
    expect(LEGACY_LEADERBOARD_SHEET_SIZES.rowHeight).toBeGreaterThanOrEqual(44);
    expect(LEGACY_LEADERBOARD_SHEET_SIZES.selfRowHeight).toBeGreaterThanOrEqual(44);
    if (plan.list !== null) {
      for (const row of plan.list.rows) {
        expect(row.rect.height).toBeGreaterThanOrEqual(44);
      }
      expect(inside(plan.list.viewport, plan.card)).toBe(true);
      expect(overlaps(plan.list.viewport, plan.exit)).toBe(false);
      if (plan.columnHeader) {
        expect(overlaps(plan.list.viewport, plan.columnHeader.rect)).toBe(false);
        expect(inside(plan.columnHeader.rect, plan.card)).toBe(true);
      }
      if (plan.selfRow) {
        expect(plan.selfRow.rect.height).toBeGreaterThanOrEqual(44);
        expect(inside(plan.selfRow.rect, plan.card)).toBe(true);
        expect(overlaps(plan.selfRow.rect, plan.list.viewport)).toBe(false);
        expect(plan.selfRow.rect.top).toBeGreaterThanOrEqual(plan.list.viewport.top + plan.list.viewport.height);
      }
    }
  });

  test('the rail exists only when the rows truly overflow the list viewport', () => {
    if (plan.list === null) {
      return;
    }
    expect(plan.list.scrollable).toBe(plan.list.contentHeight > plan.list.viewport.height);
    expect(plan.list.maxScrollOffset).toBe(Math.max(0, plan.list.contentHeight - plan.list.viewport.height));
    // The rail sits in the card padding, never over the rows.
    expect(plan.list.railViewport.left + plan.list.railViewport.width)
      .toBeLessThan(plan.card.left + plan.card.width);
    if (!plan.list.scrollable) {
      expect(plan.card.height).toBe(Math.round(plan.naturalCardHeight));
    }
  });

  test('row columns never collide and keep room for the name', () => {
    for (const row of plan.list?.rows.slice(0, 1) ?? []) {
      expect(row.nameLeft).toBeGreaterThan(row.rankCenterX + 24);
      expect(row.nameMaxWidth).toBeGreaterThanOrEqual(80);
      expect(row.nameLeft + row.nameMaxWidth).toBeLessThanOrEqual(row.levelRight - row.levelMaxWidth);
    }
  });
});

describe('leaderboard plan: specifics', () => {
  const find = (label: string): LegacyLeaderboardOverlayPlan => plans.find((p) => p.label === label)!.plan;

  test('uses the Settings sheet card, padding, exit height and rail overhang (cannot drift)', () => {
    const lb = find('390x844 ready, you outside top N');
    const settings = buildLegacySettingsSheetPlan({ context: 'menu', height: 844, signedIn: true, width: 390 });
    expect(lb.card.width).toBe(settings.card.width);
    expect(lb.card.left).toBe(settings.card.left);
    expect(lb.cardPadding).toBe(settings.cardPadding);
    expect(lb.title.centerY - lb.card.top).toBe(settings.title.centerY - settings.card.top);
    expect(lb.exit.height).toBe(LEGACY_SETTINGS_SIZES.actionHeight);
    expect(lb.exit.width).toBe(settings.items[0]!.rect.width);
    expect(lb.list!.railViewport.width - lb.list!.viewport.width).toBe(LEGACY_SETTINGS_SIZES.scrollRailOverhang);
  });

  test('the You row is pinned under the list and present even when the player is outside the top 50', () => {
    for (const { label } of plans.filter((p) => p.label.endsWith('ready, you outside top N'))) {
      const plan = find(label);
      expect(plan.selfRow).not.toBeNull();
      expect(plan.selfRow!.model.rankText).toBe('57');
      expect(plan.selfRow!.model.inList).toBe(false);
      expect(plan.list!.scrollable).toBe(true);
    }
  });

  test('at 320x568 the list still shows several rows next to the exit, header and You row', () => {
    const plan = find('320x568 ready, you outside top N');
    expect(plan.list!.viewport.height).toBeGreaterThanOrEqual(LEGACY_LEADERBOARD_SHEET_SIZES.rowHeight * 5);
    expect(plan.card.height).toBe(plan.panel.height);
  });

  test('3 rows shrink the card to its content instead of leaving an empty full-height card', () => {
    const plan = find('390x844 ready, 3 rows');
    expect(plan.list!.scrollable).toBe(false);
    expect(plan.card.height).toBeLessThan(plan.panel.height);
  });

  test('scroll offset moves rows inside the viewport and is clamped', () => {
    const plan = find('390x844 ready, you outside top N');
    const row = plan.list!.rows[10]!;
    const at0 = resolveLegacyLeaderboardRowScreenRect(plan, row, 0);
    const at100 = resolveLegacyLeaderboardRowScreenRect(plan, row, 100);
    expect(at0.top - at100.top).toBe(100);
    const clamped = resolveLegacyLeaderboardRowScreenRect(plan, row, 1e9);
    expect(at0.top - clamped.top).toBe(plan.list!.maxScrollOffset);
  });

  test('state phases have a state block, no list, no You row and one action at most', () => {
    for (const label of ['empty', 'error', 'offline', 'signed out', 'needs username']) {
      const plan = find(`390x844 ${label}`);
      expect(plan.list).toBeNull();
      expect(plan.selfRow).toBeNull();
      expect(plan.stateBlock).not.toBeNull();
      expect(plan.card.height).toBeLessThan(plan.panel.height);
    }
    // The fixture player is named, so the empty board offers Edit name (MAZER-ACCT-022).
    expect(find('390x844 empty').stateBlock!.action).not.toBeNull();
    expect(find('390x844 error').stateBlock!.action).not.toBeNull();
  });

  test('loading keeps the header slot (for the status line) and draws skeleton rows', () => {
    const plan = find('390x844 loading');
    expect(plan.columnHeader).not.toBeNull();
    expect(plan.list!.skeletonRows.length).toBeGreaterThan(0);
    expect(plan.list!.rows).toHaveLength(0);
  });

  test('measured body lines grow the state block (so wrapped copy is never clipped)', () => {
    const view = buildLegacyLeaderboardViewModel(baseState({ status: 'error' }));
    const one = buildLegacyLeaderboardOverlayPlan(view, 390, 844, {}, { measureBodyLines: () => 1 });
    const four = buildLegacyLeaderboardOverlayPlan(view, 390, 844, {}, { measureBodyLines: () => 4 });
    expect(four.naturalCardHeight - one.naturalCardHeight).toBe(3 * LEGACY_LEADERBOARD_SHEET_SIZES.stateBodyLineHeight);
    expect((four.stateBlock!.action!.top - four.card.top) - (one.stateBlock!.action!.top - one.card.top)).toBe(3 * LEGACY_LEADERBOARD_SHEET_SIZES.stateBodyLineHeight);
  });

  test('safe-area insets shrink the panel without breaking the plan', () => {
    const view = buildLegacyLeaderboardViewModel(baseState());
    const plan = buildLegacyLeaderboardOverlayPlan(view, 390, 844, { bottom: 34, top: 47 });
    expect(plan.panel.top).toBeGreaterThanOrEqual(47);
    expect(plan.card.top + plan.card.height).toBeLessThanOrEqual(844 - 34);
  });
});
