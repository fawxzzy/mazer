import { describe, expect, it } from 'vitest';
import { LEGACY_GAME_MODES, isLegacyGameModeId } from '../../src/legacy-runtime/legacyGameModes';
import {
  LEGACY_MODE_SELECT_ART,
  LEGACY_MODE_SELECT_BACK_LABEL,
  LEGACY_MODE_SELECT_COMING_SOON_LABEL,
  LEGACY_MODE_SELECT_INPUT_GUARD_MS,
  LEGACY_MODE_SELECT_LOCKED_ITEMS,
  LEGACY_MODE_SELECT_TAGLINES,
  LEGACY_MODE_SELECT_TITLE,
  buildLegacyModeSelectItems,
  isLegacyModeSelectInputGuarded,
  resolveLegacyModeSelectInitialIndex,
  resolveLegacyModeSelectKeyboardChoice,
  resolveLegacyModeSelectPlayAction
} from '../../src/legacy-runtime/legacyModeSelectPlan';

const progress = { level: 37 };
const ART_CELLS = new Set(['S', 'E', 't', '.', '#', 'g', 'x']);

describe('mode-select items (MAZER-MODE-002, look D)', () => {
  it('lists every registered mode in registry order, then Hazards, Sprint and Daily locked', () => {
    const items = buildLegacyModeSelectItems(progress);
    expect(items.map((item) => item.id)).toEqual([...LEGACY_GAME_MODES.map((mode) => mode.id), 'hazards', 'sprint', 'daily']);
    expect(items.slice(LEGACY_GAME_MODES.length)).toEqual([...LEGACY_MODE_SELECT_LOCKED_ITEMS]);
    for (const locked of LEGACY_MODE_SELECT_LOCKED_ITEMS) {
      expect(locked.playable).toBe(false);
      expect(locked.stats).toEqual([]);
      // A locked entry is a name only: nothing registers, resolves or starts it.
      expect(isLegacyGameModeId(locked.id)).toBe(false);
    }
  });

  it('shows Endless with the player level it was given (and no rank), and nothing else playable', () => {
    const items = buildLegacyModeSelectItems(progress);
    expect(items[0]).toMatchObject({ id: 'endless', label: 'Endless', playable: true, tagline: 'Every level harder than the last' });
    expect(items[0]!.stats).toEqual([{ label: 'Level', value: '37' }]);
    expect(items.filter((item) => item.playable).map((item) => item.id)).toEqual(['endless']);
  });

  it('every registered mode has a tagline and a picture, so a new registry mode cannot ship blank', () => {
    for (const mode of LEGACY_GAME_MODES) {
      expect(LEGACY_MODE_SELECT_TAGLINES[mode.id]?.length ?? 0).toBeGreaterThan(0);
      expect(LEGACY_MODE_SELECT_ART[mode.id]?.length ?? 0).toBeGreaterThan(0);
    }
  });

  it('every picture is a rectangle of known Chip tile cells with one start', () => {
    for (const item of buildLegacyModeSelectItems(progress)) {
      const width = item.art[0]!.length;
      expect(width).toBeGreaterThan(0);
      for (const row of item.art) {
        expect(row.length).toBe(width);
        for (const cell of row) expect(ART_CELLS.has(cell), `${item.id}: ${cell}`).toBe(true);
      }
      expect(item.art.join('').split('S')).toHaveLength(2);
      expect(item.tagline.length).toBeGreaterThan(0);
    }
  });

  it('opens centred on the current mode (Endless today)', () => {
    const items = buildLegacyModeSelectItems(progress);
    expect(resolveLegacyModeSelectInitialIndex(items)).toBe(0);
    expect(resolveLegacyModeSelectInitialIndex(items, 'endless')).toBe(0);
    expect(resolveLegacyModeSelectInitialIndex([...LEGACY_MODE_SELECT_LOCKED_ITEMS, ...items])).toBe(3);
    expect(resolveLegacyModeSelectInitialIndex([...LEGACY_MODE_SELECT_LOCKED_ITEMS])).toBe(0);
  });

  it('Play reads "Play <mode>" for a playable entry and a disabled "Coming soon" for a locked one', () => {
    const items = buildLegacyModeSelectItems(progress);
    expect(resolveLegacyModeSelectPlayAction(items[0])).toEqual({ disabled: false, label: 'Play Endless' });
    for (const locked of LEGACY_MODE_SELECT_LOCKED_ITEMS) {
      expect(resolveLegacyModeSelectPlayAction(locked)).toEqual({ disabled: true, label: 'Coming soon' });
    }
    expect(resolveLegacyModeSelectPlayAction(undefined).disabled).toBe(true);
    expect(LEGACY_MODE_SELECT_COMING_SOON_LABEL).toBe('Coming soon');
    expect(LEGACY_MODE_SELECT_BACK_LABEL).toBe('Back to Menu');
    expect(LEGACY_MODE_SELECT_TITLE).toBe('Choose a mode');
  });
});

describe('mode-select input guard and keyboard choice (MAZER-MODE-002 review)', () => {
  const items = buildLegacyModeSelectItems({ level: 1 });

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

  it('the guard is measured from the press: a slow double-tap whose press began inside the window is ignored', () => {
    // opened at 1000; the second press began at 1200 and the click landed on release at 1300
    expect(isLegacyModeSelectInputGuarded(1300, 1000)).toBe(false);
    expect(isLegacyModeSelectInputGuarded(1300, 1000, 100)).toBe(true);
    // a press that began after the window still plays
    expect(isLegacyModeSelectInputGuarded(1400, 1000, 100)).toBe(false);
    // a negative age (clock skew) never widens the window
    expect(isLegacyModeSelectInputGuarded(1300, 1000, -500)).toBe(false);
  });

  it('Enter picks the centred playable entry', () => {
    expect(resolveLegacyModeSelectKeyboardChoice(items, 0)).toBe(0);
  });

  it('Enter on a locked entry starts nothing (no fallback: the centred entry is what Enter means)', () => {
    for (let index = 1; index < items.length; index += 1) {
      expect(items[index]!.playable).toBe(false);
      expect(resolveLegacyModeSelectKeyboardChoice(items, index)).toBeNull();
    }
  });

  it('an out-of-range selection is clamped and never returns a locked entry', () => {
    expect(resolveLegacyModeSelectKeyboardChoice(items, -4)).toBe(0);
    expect(resolveLegacyModeSelectKeyboardChoice(items, 99)).toBeNull();
    expect(resolveLegacyModeSelectKeyboardChoice([], 0)).toBeNull();
  });
});
