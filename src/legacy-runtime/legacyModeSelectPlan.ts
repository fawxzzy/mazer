/**
 * Mode-select item model (MAZER-MODE-002, selector look D since 2026-11-25). Contract:
 * docs/architecture/MAZER-GAME-MODES-PRODUCT-CONTRACT.md, sections 8 to 13. Play on the main menu opens the selector;
 * choosing a playable mode starts that mode's run.
 *
 * Look (owner pick 2026-11-25, option D "Depth and parallax" from game-mode-options.html): a side-scrolling rail of
 * modes floating over the dimmed menu, no sheet container, neighbours peeking in from both edges, cards turning on a
 * perspective as they pass and the star field behind moving slower than the rail. It opens centred on the current mode.
 * The rail itself is DOM (src/ui/modeSelect, loaded by legacyModeSelectLayer.ts); this module is the one item model it
 * draws, so adding a mode only changes the list here.
 *
 * Entries: every registered mode (playable) in registry order, then the locked "Coming soon" entries. Hazards is the
 * reserved slot of legacyGameModes.ts: it is SHOWN locked, and it stays unregistered, unresolvable and unplayable (the
 * hazard lab is still only the ?lab=hazards flag, default off). Sprint and Daily are placeholder names.
 *
 * Pure: no Phaser, no DOM, no storage, no network.
 */
import { LEGACY_DEFAULT_GAME_MODE_ID, LEGACY_GAME_MODES, type LegacyGameModeId } from './legacyGameModes';

/** Ids of the locked entries. Never registered mode ids: nothing resolves, starts or stores them. */
export type LegacyModeSelectLockedId = 'hazards' | 'sprint' | 'daily';

/**
 * One cell of an entry's small maze picture, drawn as Chip tiles: S start, E end, t trail, . corridor, # wall,
 * g gate, x hazard.
 */
export type LegacyModeSelectArtCell = 'S' | 'E' | 't' | '.' | '#' | 'g' | 'x';

export interface LegacyModeSelectItem {
  /** A registered mode id for a playable entry; a locked id for a "Coming soon" entry. */
  readonly id: LegacyGameModeId | LegacyModeSelectLockedId;
  readonly label: string;
  readonly playable: boolean;
  /** One plain line shown under the rail while the entry is centred. */
  readonly tagline: string;
  /** Per-mode facts (level, rank). Empty for a locked entry. */
  readonly stats: readonly { readonly label: string; readonly value: string }[];
  /** The entry's maze picture, rows of LegacyModeSelectArtCell, every row the same width. */
  readonly art: readonly string[];
}

export interface LegacyModeSelectProgress {
  readonly level: number | string;
  readonly rank: string;
}

/** Player-facing line per registered mode. A new registry mode must add one here (pinned by a test). */
export const LEGACY_MODE_SELECT_TAGLINES: Readonly<Record<LegacyGameModeId, string>> = Object.freeze({
  endless: 'Every level harder than the last'
});

/** Maze picture per registered mode. A new registry mode must add one here (pinned by a test). */
export const LEGACY_MODE_SELECT_ART: Readonly<Record<LegacyGameModeId, readonly string[]>> = Object.freeze({
  endless: Object.freeze(['Sttttt#', '#####t#', 'Ettttt#', '#.#####', '#......'])
});

/** The label every locked entry shows on its card and on the disabled Play button. */
export const LEGACY_MODE_SELECT_COMING_SOON_LABEL = 'Coming soon';

/** The locked entries, after the playable ones. Hazards first: it is the reserved slot of legacyGameModes.ts. */
export const LEGACY_MODE_SELECT_LOCKED_ITEMS: readonly LegacyModeSelectItem[] = Object.freeze([
  Object.freeze({
    // (a row that starts with a capital and ends in '...' reads as a sentence to the message-inventory scan)
    art: Object.freeze(['S.g..#.', '#.#.##.', '#...x..', '#.####.', '#E.....']),
    id: 'hazards',
    label: 'Hazards',
    playable: false,
    stats: Object.freeze([]),
    tagline: 'Obstacles and enemies in the corridors'
  } satisfies LegacyModeSelectItem),
  Object.freeze({
    art: Object.freeze(['#######', 'S.....E', '#######', '#.#.#.#', '#######']),
    id: 'sprint',
    label: 'Sprint',
    playable: false,
    stats: Object.freeze([]),
    tagline: 'Beat the clock on short mazes'
  } satisfies LegacyModeSelectItem),
  Object.freeze({
    art: Object.freeze(['S.#...E', '#.#.#.#', '#...#..', '#.###.#', '#.....#']),
    id: 'daily',
    label: 'Daily',
    playable: false,
    stats: Object.freeze([]),
    tagline: 'One new maze every day'
  } satisfies LegacyModeSelectItem)
]);

/**
 * The selector's entries: every registered mode in registry order with that mode's own stats, then the locked
 * entries. Stats are read from the progression the player already has (Endless is today's single ladder, so its stats
 * are the existing level and rank, untouched).
 */
export const buildLegacyModeSelectItems = (progress: LegacyModeSelectProgress): LegacyModeSelectItem[] => [
  ...LEGACY_GAME_MODES.map((mode): LegacyModeSelectItem => ({
    art: LEGACY_MODE_SELECT_ART[mode.id],
    id: mode.id,
    label: mode.label,
    playable: true,
    stats: [{ label: 'Level', value: String(progress.level) }, { label: 'Rank', value: String(progress.rank) }],
    tagline: LEGACY_MODE_SELECT_TAGLINES[mode.id]
  })),
  ...LEGACY_MODE_SELECT_LOCKED_ITEMS
];

/**
 * The entry the selector opens centred on: the current mode. Endless is the only mode a run can be in today, so this
 * is the default mode's index (or the first playable entry, or 0).
 */
export const resolveLegacyModeSelectInitialIndex = (
  items: readonly LegacyModeSelectItem[],
  currentModeId: LegacyGameModeId = LEGACY_DEFAULT_GAME_MODE_ID
): number => {
  const current = items.findIndex((item) => item.playable && item.id === currentModeId);
  if (current >= 0) return current;
  const playable = items.findIndex((item) => item.playable);
  return playable >= 0 ? playable : 0;
};

/** The Play button for the centred entry: "Play <mode>" for a playable entry, "Coming soon" (disabled) otherwise. */
export const resolveLegacyModeSelectPlayAction = (
  item: LegacyModeSelectItem | undefined
): { readonly label: string; readonly disabled: boolean } => (
  item?.playable === true
    ? { disabled: false, label: `Play ${item.label}` }
    : { disabled: true, label: LEGACY_MODE_SELECT_COMING_SOON_LABEL }
);

/** The selector's one exit row (also Escape): the standard back action. */
export const LEGACY_MODE_SELECT_BACK_LABEL = 'Back to Menu';
/** Small heading above the rail. */
export const LEGACY_MODE_SELECT_TITLE = 'Choose a mode';

/**
 * Taps on the selector are ignored for this long after it opens and after it closes, so a double-tap on Play cannot
 * land on the Endless card and a double-tap on Back cannot re-open the selector (MAZER-MODE-002 review).
 */
export const LEGACY_MODE_SELECT_INPUT_GUARD_MS = 250;

/**
 * True while selector input is still inside the guard window that started at `guardStartedAtMs`. `pressAgeMs` is how
 * long before `nowMs` the input's press began: a DOM click lands on release, and the guard is measured from the press
 * (as the old canvas pointerdown path did), so a slow double-tap whose second press began inside the window is ignored.
 */
export const isLegacyModeSelectInputGuarded = (nowMs: number, guardStartedAtMs: number | null, pressAgeMs = 0): boolean => (
  guardStartedAtMs !== null && nowMs - Math.max(0, pressAgeMs) - guardStartedAtMs < LEGACY_MODE_SELECT_INPUT_GUARD_MS
);

/**
 * Keyboard Enter on the selector: the centred entry when it is playable, otherwise nothing. A locked entry never
 * starts anything, not even a fallback (with look D the centred entry is what Enter means, like the Play button).
 * Returns an index into `items`.
 */
export const resolveLegacyModeSelectKeyboardChoice = (
  items: readonly LegacyModeSelectItem[],
  selectedIndex: number
): number | null => {
  if (items.length === 0) return null;
  const clamped = Math.min(items.length - 1, Math.max(0, selectedIndex));
  return items[clamped]?.playable === true ? clamped : null;
};
