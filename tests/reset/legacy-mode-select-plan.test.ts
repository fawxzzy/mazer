import { describe, expect, it } from 'vitest';
import { LEGACY_GAME_MODES } from '../../src/legacy-runtime/legacyGameModes';
import {
  LEGACY_MODE_SELECT_LOCKED_SLOT,
  LEGACY_MODE_SELECT_STACK_MAX_ITEMS,
  LEGACY_MODE_SELECT_TAGLINES,
  buildLegacyModeSelectItems,
  buildLegacyModeSelectPlan,
  resolveLegacyModeSelectVariant,
  type LegacyModeSelectItem,
  LEGACY_MODE_SELECT_INPUT_GUARD_MS,
  isLegacyModeSelectInputGuarded,
  resolveLegacyModeSelectKeyboardChoice
} from '../../src/legacy-runtime/legacyModeSelectPlan';

const VIEWPORTS = [
  { height: 640, width: 360 },
  { height: 667, width: 375 },
  { height: 844, width: 390 },
  { height: 915, width: 412 },
  { height: 1024, width: 768 }
] as const;

const progress = { level: 37, rank: 'C' };

const withExtraModes = (count: number): LegacyModeSelectItem[] => {
  const base = buildLegacyModeSelectItems(progress);
  const extra: LegacyModeSelectItem[] = Array.from({ length: count }, (_, index) => ({
    id: 'locked',
    label: `Slot ${index}`,
    playable: false,
    stats: [],
    tagline: 'x'
  }));
  return [...base, ...extra];
};

describe('mode-select items (MAZER-MODE-002)', () => {
  it('lists every registered mode in registry order, then one plain locked More soon slot', () => {
    const items = buildLegacyModeSelectItems(progress);
    expect(items.map((item) => item.id)).toEqual([...LEGACY_GAME_MODES.map((mode) => mode.id), 'locked']);
    const locked = items[items.length - 1]!;
    expect(locked).toEqual(LEGACY_MODE_SELECT_LOCKED_SLOT);
    expect(locked.label).toBe('More soon');
    expect(locked.playable).toBe(false);
    expect(JSON.stringify(items).toLowerCase()).not.toContain('hazard');
  });

  it('shows Endless with the player level and rank it was given, and nothing else playable', () => {
    const items = buildLegacyModeSelectItems(progress);
    const endless = items[0]!;
    expect(endless).toMatchObject({ id: 'endless', label: 'Endless', playable: true });
    expect(endless.stats).toEqual([{ label: 'Level', value: '37' }, { label: 'Rank', value: 'C' }]);
    expect(items.filter((item) => item.playable)).toHaveLength(1);
  });

  it('has a tagline for every registered mode, so a new registry mode cannot ship blank', () => {
    for (const mode of LEGACY_GAME_MODES) {
      expect(LEGACY_MODE_SELECT_TAGLINES[mode.id]?.length ?? 0).toBeGreaterThan(0);
    }
  });
});

describe('mode-select layout variant', () => {
  it('is a Stack up to three entries and flips to Tiles past three', () => {
    expect(LEGACY_MODE_SELECT_STACK_MAX_ITEMS).toBe(3);
    expect(resolveLegacyModeSelectVariant(1)).toBe('stack');
    expect(resolveLegacyModeSelectVariant(2)).toBe('stack');
    expect(resolveLegacyModeSelectVariant(3)).toBe('stack');
    expect(resolveLegacyModeSelectVariant(4)).toBe('tiles');
    expect(resolveLegacyModeSelectVariant(7)).toBe('tiles');
  });

  it('today (Endless plus the locked slot) is a Stack with no separate Play button', () => {
    const plan = buildLegacyModeSelectPlan(buildLegacyModeSelectItems(progress), 0, 390, 844);
    expect(plan.variant).toBe('stack');
    expect(plan.play).toBeNull();
    expect(plan.detail).toBeNull();
    expect(plan.title.text).toBe('Choose a mode');
    expect(plan.backLabel).toBe('Back to Menu');
  });

  it('a fourth entry flips the same item model to Tiles with a detail strip and a Play button', () => {
    const plan = buildLegacyModeSelectPlan(withExtraModes(2), 0, 390, 844);
    expect(plan.variant).toBe('tiles');
    expect(plan.play).not.toBeNull();
    expect(plan.play!.disabled).toBe(false);
    expect(plan.play!.label).toBe('Play Endless');
    expect(plan.detail).not.toBeNull();
  });

  it('Tiles disables Play on a locked selection', () => {
    const plan = buildLegacyModeSelectPlan(withExtraModes(2), 1, 390, 844);
    expect(plan.play!.disabled).toBe(true);
  });

  it('clamps an out-of-range selection', () => {
    const plan = buildLegacyModeSelectPlan(withExtraModes(2), 99, 390, 844);
    expect(plan.items.filter((entry) => entry.selected).map((entry) => entry.index)).toEqual([plan.items.length - 1]);
    expect(buildLegacyModeSelectPlan(withExtraModes(2), -4, 390, 844).items[0]!.selected).toBe(true);
  });
});

describe.each(VIEWPORTS)('mode-select plan at $width x $height', ({ width, height }) => {
  for (const [name, items] of [['stack (today)', buildLegacyModeSelectItems(progress)], ['tiles (past three)', withExtraModes(2)]] as const) {
    it(`${name} fits the viewport with 44px+ targets`, () => {
      const plan = buildLegacyModeSelectPlan(items, 0, width, height, { bottom: 0, top: 0 });
      expect(plan.card.left).toBeGreaterThanOrEqual(0);
      expect(plan.card.left + plan.card.width).toBeLessThanOrEqual(width);
      expect(plan.card.top).toBeGreaterThanOrEqual(0);
      expect(plan.card.top + plan.card.height).toBeLessThanOrEqual(height);
      expect(plan.naturalCardHeight).toBeLessThanOrEqual(plan.card.height);
      expect(plan.back.height).toBeGreaterThanOrEqual(44);
      expect(plan.back.top + plan.back.height).toBeLessThanOrEqual(plan.card.top + plan.card.height);
      for (const entry of plan.items) {
        expect(entry.rect.height).toBeGreaterThanOrEqual(44);
        expect(entry.rect.width).toBeGreaterThanOrEqual(44);
      }
      if (plan.play !== null) {
        expect(plan.play.rect.height).toBeGreaterThanOrEqual(44);
      }
    });
  }
});

describe('mode-select input guard and keyboard choice (MAZER-MODE-002 review)', () => {
  const items = buildLegacyModeSelectItems({ level: 1, rank: 'E' });

  it('the guard window is one pinned constant of 250 ms', () => {
    expect(LEGACY_MODE_SELECT_INPUT_GUARD_MS).toBe(250);
  });

  it('input is ignored inside the window and accepted at and after its end', () => {
    expect(isLegacyModeSelectInputGuarded(1000, null)).toBe(false);
    expect(isLegacyModeSelectInputGuarded(1000, 1000)).toBe(true);
    expect(isLegacyModeSelectInputGuarded(1249, 1000)).toBe(true);
    expect(isLegacyModeSelectInputGuarded(1250, 1000)).toBe(false);
    expect(isLegacyModeSelectInputGuarded(5000, 1000)).toBe(false);
  });

  it('Enter picks the selected playable entry', () => {
    expect(resolveLegacyModeSelectKeyboardChoice(items, 0)).toBe(0);
  });

  it('Enter on a locked selection falls back to the only playable entry', () => {
    const lockedIndex = items.findIndex((item) => !item.playable);
    expect(lockedIndex).toBeGreaterThan(0);
    expect(resolveLegacyModeSelectKeyboardChoice(items, lockedIndex)).toBe(0);
  });

  it('an out-of-range selection is clamped and never returns a locked entry', () => {
    expect(resolveLegacyModeSelectKeyboardChoice(items, 99)).toBe(0);
    expect(resolveLegacyModeSelectKeyboardChoice(items, -4)).toBe(0);
  });

  it('with several playable entries and a locked selection Enter picks nothing; with none it picks nothing', () => {
    const playable = (id: string) => ({ ...items[0]!, label: id });
    const locked = items.find((item) => !item.playable)!;
    expect(resolveLegacyModeSelectKeyboardChoice([playable('a'), playable('b'), locked], 2)).toBeNull();
    expect(resolveLegacyModeSelectKeyboardChoice([playable('a'), playable('b'), locked], 1)).toBe(1);
    expect(resolveLegacyModeSelectKeyboardChoice([locked], 0)).toBeNull();
    expect(resolveLegacyModeSelectKeyboardChoice([], 0)).toBeNull();
  });
});
