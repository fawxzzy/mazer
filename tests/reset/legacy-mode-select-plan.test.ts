import { describe, expect, it } from 'vitest';
import {
  buildLegacyModeSelectPlan,
  readLegacyModeSelectPreviewFlags,
  type LegacyModeSelectItem,
  type LegacyModeSelectVariant
} from '../../src/legacy-runtime/legacyModeSelectPlan';

// DESIGN-OPTIONS PROTOTYPE tests (not shipped): the three layouts fit real phone viewports and keep 44 px+ targets.
const items: LegacyModeSelectItem[] = [
  { id: 'endless', label: 'Endless', playable: true, stats: [{ label: 'Level', value: '37' }, { label: 'Rank', value: 'C' }], tagline: 't' },
  { id: 'hazards', label: 'Hazards', playable: false, stats: [], tagline: 't' },
  { id: 'future', label: 'More soon', playable: false, stats: [], tagline: 't' }
];
const variants: LegacyModeSelectVariant[] = ['stack', 'pager', 'tiles'];
const viewports: Array<[number, number]> = [[360, 640], [375, 667], [390, 844], [412, 915], [768, 1024]];

describe('legacy mode-select plan', () => {
  for (const variant of variants) {
    for (const [w, h] of viewports) {
      it(`${variant} fits ${w}x${h} with no overflow and 44 px targets`, () => {
        const plan = buildLegacyModeSelectPlan(variant, items, 0, w, h);
        expect(plan.card.left).toBeGreaterThanOrEqual(0);
        expect(plan.card.left + plan.card.width).toBeLessThanOrEqual(w);
        expect(plan.card.top).toBeGreaterThanOrEqual(0);
        expect(plan.card.top + plan.card.height).toBeLessThanOrEqual(h);
        // The card is its natural height (no scrolling needed) at every supported phone size.
        expect(plan.naturalCardHeight).toBeLessThanOrEqual(plan.card.height);
        expect(plan.back.height).toBeGreaterThanOrEqual(44);
        expect(plan.back.top + plan.back.height).toBeLessThanOrEqual(plan.card.top + plan.card.height);
        if (plan.play !== null) {
          expect(plan.play.rect.height).toBeGreaterThanOrEqual(44);
        }
        for (const entry of plan.items) {
          expect(entry.rect.height).toBeGreaterThanOrEqual(44);
          expect(entry.rect.width).toBeGreaterThanOrEqual(44);
        }
      });
    }
  }

  it('pager steps through every mode and disables Play on a locked slot', () => {
    const endless = buildLegacyModeSelectPlan('pager', items, 0, 390, 844);
    expect(endless.play).toMatchObject({ disabled: false, label: 'Play Endless' });
    const locked = buildLegacyModeSelectPlan('pager', items, 1, 390, 844);
    expect(locked.play).toMatchObject({ disabled: true, label: 'Coming soon' });
    expect(locked.pager?.dots.filter((dot) => dot.active)).toHaveLength(1);
    expect(locked.pager?.prev.width).toBe(48);
  });

  it('clamps an out-of-range selection instead of throwing', () => {
    expect(() => buildLegacyModeSelectPlan('tiles', items, 99, 390, 844)).not.toThrow();
  });

  it('reads the prototype URL flags and ignores everything else', () => {
    expect(readLegacyModeSelectPreviewFlags('')).toEqual({ autoOpen: false, index: 0, sample: false, variant: null });
    expect(readLegacyModeSelectPreviewFlags('?modeSelectPreview=b&modeSelectOpen=1&modeSelectSample=1&modeSelectIndex=2')).toEqual({
      autoOpen: true,
      index: 2,
      sample: true,
      variant: 'pager'
    });
    expect(readLegacyModeSelectPreviewFlags('?modeSelectPreview=zzz&modeSelectIndex=-3').variant).toBeNull();
  });
});
