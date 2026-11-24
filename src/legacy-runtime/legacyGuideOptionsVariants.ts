/**
 * Guide redesign OPTIONS (2026-11-23): data for the three candidate layouts of the "How to play" sheet.
 * Options route only (`?guideOptions=A|B|C`); the shipped Guide (legacyGuideContent.ts) is untouched.
 *
 * Every variant is built from the SAME shipped rows (LEGACY_GUIDE_ROWS: same icons, same draw functions), plus one new
 * row, `menu-play`, that fixes the known gap: the Menu line could not name Reset level and Main menu inside the
 * 90-character cap, so the menu is told in two lines (main menu, then in a maze). Copy stays <= 90 characters.
 */
import { LEGACY_GUIDE_ROWS, type LegacyGuideRow } from './legacyGuideContent';

export const GUIDE_OPTIONS_COPY_CAP = 90;

export type GuideOptionsVariantId = 'A' | 'B' | 'C';

export const GUIDE_OPTIONS_VARIANT_NAMES: Readonly<Record<GuideOptionsVariantId, string>> = Object.freeze({
  A: 'Section cards',
  B: 'Step by step',
  C: 'Icon glossary'
});

/** Options-only row ids on top of the shipped ones. */
export type GuideOptionsRowId = LegacyGuideRow['id'] | 'menu-play';

export interface GuideOptionsRow {
  id: GuideOptionsRowId;
  heading: string;
  text: string;
  /** The shipped row whose icon this row reuses. */
  iconFrom: LegacyGuideRow['id'];
}

/** The new menu pair. `menu` keeps the shipped text; `menu-play` names the two rows only a running maze has. */
export const GUIDE_OPTIONS_MENU_PLAY_ROW: GuideOptionsRow = Object.freeze({
  heading: 'In a maze',
  iconFrom: 'menu',
  id: 'menu-play',
  text: 'The same menu pauses the run. Reset level restarts the maze, Main menu leaves it.'
});

export const GUIDE_OPTIONS_ROWS: Readonly<Record<GuideOptionsRowId, GuideOptionsRow>> = Object.freeze({
  ...(Object.fromEntries(LEGACY_GUIDE_ROWS.map((row) => [
    row.id,
    { heading: row.heading, iconFrom: row.id, id: row.id, text: row.text }
  ])) as Record<LegacyGuideRow['id'], GuideOptionsRow>),
  'menu-play': GUIDE_OPTIONS_MENU_PLAY_ROW
});

export interface GuideOptionsGroup {
  title: string;
  rows: readonly GuideOptionsRowId[];
}

/** A (scrolling cards) and B (pages) group the rows. */
export const GUIDE_OPTIONS_GROUPS: readonly GuideOptionsGroup[] = Object.freeze([
  { rows: ['goal', 'start', 'you'], title: 'The goal' },
  { rows: ['move', 'trail', 'sound'], title: 'Moving' },
  { rows: ['wrap', 'bleed-gate', 'levels'], title: 'The maze' },
  { rows: ['online', 'menu', 'menu-play'], title: 'Menu' }
]);

/** C shows every row as an icon tile; this is the tile order. */
export const GUIDE_OPTIONS_GLOSSARY_ORDER: readonly GuideOptionsRowId[] = Object.freeze([
  'goal', 'start', 'you', 'move',
  'trail', 'wrap', 'bleed-gate', 'levels',
  'online', 'sound', 'menu', 'menu-play'
]);

export const resolveGuideOptionsVariant = (search: string): GuideOptionsVariantId | null => {
  const raw = new URLSearchParams(search).get('guideOptions');
  if (raw === null) {
    return null;
  }
  const id = raw.toUpperCase();
  return id === 'A' || id === 'B' || id === 'C' ? id : 'A';
};
