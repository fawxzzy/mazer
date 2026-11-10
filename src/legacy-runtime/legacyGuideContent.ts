/**
 * How to play: the ONE data module for the Guide sheet.
 *
 * Standing rule (Zac, 2026-11-06): when the game or UI changes, the guide's
 * UI reflections change in the same PR. This module is the single place the
 * guide's rows, icon specs and copy live; the main-menu Settings sheet and
 * the in-game Pause Settings both open the same sheet from the same
 * `how-to-play` row (legacySettingsSheetPlan.ts), so they cannot disagree.
 *
 * Truthfulness: every row names only mechanics that exist today. The drift
 * test (tests/reset/legacy-guide-content-drift.test.ts) asserts each claim
 * against live exports and constants, so renaming a setting, removing a key
 * binding, dropping wrap, or deleting a marker draw function fails CI until
 * this module is updated.
 *
 * Icons: each row declares which draw function paints its icon. The aim is
 * that the guide icon is drawn by the SAME function as the board marker or
 * tile, so a later tile-style change (Chip) updates the guide automatically.
 * `shared-with-board` means that is true today; `todo-wiring` means it is not
 * yet and names the lane that must close it. No behavior here: pure data.
 */
import { LEGACY_SETTINGS_GROUP_ROWS } from './legacySettingsSheetPlan';

export type LegacyGuideContext = 'menu' | 'pause';

export type LegacyGuideGlyph =
  | 'goal-star'
  | 'start-marker'
  | 'player-block'
  | 'touch-stick'
  | 'trail-swatch'
  | 'edge-marker'
  | 'level-numeral';

export type LegacyGuideIconStatus = 'shared-with-board' | 'guide-local' | 'todo-wiring';

export interface LegacyGuideDrawRef {
  /** Repo-relative module that owns the draw function. */
  module: string;
  /** Exported function or scene method name; the drift test checks it still exists. */
  symbol: string;
}

export interface LegacyGuideIconSpec {
  glyph: LegacyGuideGlyph;
  /** Badge outline: circle for round things, square for the trail (as today). */
  badge: 'circle' | 'square';
  status: LegacyGuideIconStatus;
  /** The draw function the BOARD uses for this thing today. Null when the thing has no board counterpart. */
  boardDraw: LegacyGuideDrawRef | null;
  /** The Chip (Option B) equivalent in src/render/boardTileBake.ts, once the style is wired. */
  chipDraw: (LegacyGuideDrawRef & { marker: 'start' | 'goal' | 'player' }) | null;
  /** For todo-wiring: which lane closes it. Null otherwise. */
  lane: 'guide-wiring' | 'chip-wiring' | null;
  /**
   * Short kebab id naming why it is (not) shared yet; the prose lives in
   * docs/ui/MAZER-SETTINGS-SHEET-SPEC-2026-11-06.md ("Guide icon reasons").
   * Kept as an id so developer prose is never a player-facing literal.
   */
  reasonId: string;
}

export interface LegacyGuideRow {
  id: 'goal' | 'start' | 'you' | 'move' | 'trail' | 'wrap' | 'levels';
  heading: string;
  text: string;
  icon: LegacyGuideIconSpec;
}

/** A guide row that must exist once its blocker lands. Never shown until then. */
export interface LegacyGuidePendingRow {
  id: string;
  blockedOn: 'rank-surface' | 'first-run-coach' | 'guide-icon-construction';
  /** Kebab id; prose in the spec doc ("Guide icon reasons"). */
  reasonId: string;
}

export interface LegacyGuideKeyBinding {
  /** Text shown in the keyboard line. */
  label: string;
  /** Meaning shown in the keyboard line. */
  does: string;
  /** KeyboardEvent.key values the drift test resolves against the live input maps. */
  keys: readonly string[];
  /** What the live input map must resolve each key to ('move_*' kinds or 'pause'); 'quit' and Escape are scene-level keys (null for Escape). */
  expectedAction: 'move' | 'pause' | 'quit' | null;
}

const TRAIL_FADE_LABEL = LEGACY_SETTINGS_GROUP_ROWS.find((row) => row.id === 'trail-fade')?.label ?? 'Trail Fade';

export const LEGACY_GUIDE_TITLE = 'How to play';
export const LEGACY_GUIDE_CLOSE_LABEL = 'Got it';

export const LEGACY_GUIDE_ROWS: readonly LegacyGuideRow[] = Object.freeze([
  {
    heading: 'Goal',
    icon: {
      badge: 'circle',
      boardDraw: { module: 'src/render/boardTileBake.ts', symbol: 'drawBoardMarkers' },
      chipDraw: { marker: 'goal', module: 'src/render/boardTileBake.ts', symbol: 'drawBoardMarkers' },
      glyph: 'goal-star',
      lane: null,
      reasonId: 'goal-legend-calls-chip-marker-draw',
      status: 'shared-with-board'
    },
    id: 'goal',
    text: 'Reach the star to clear the maze.'
  },
  {
    heading: 'Start',
    icon: {
      badge: 'circle',
      boardDraw: { module: 'src/render/boardTileBake.ts', symbol: 'drawBoardMarkers' },
      chipDraw: { marker: 'start', module: 'src/render/boardTileBake.ts', symbol: 'drawBoardMarkers' },
      glyph: 'start-marker',
      lane: null,
      reasonId: 'start-legend-calls-chip-marker-draw',
      status: 'shared-with-board'
    },
    id: 'start',
    text: 'An arrow on the first tile points the way you set off.'
  },
  {
    heading: 'You',
    icon: {
      badge: 'square',
      boardDraw: { module: 'src/scenes/MenuScene.ts', symbol: 'fillLegacyPlayerMarkerTile' },
      chipDraw: { marker: 'player', module: 'src/render/boardTileBake.ts', symbol: 'drawBoardMarkers' },
      glyph: 'player-block',
      lane: null,
      reasonId: 'player-marker-draw-bound-to-board-graphics',
      status: 'guide-local'
    },
    id: 'you',
    text: 'You are the green rounded block inside a bright ring.'
  },
  {
    heading: 'Move',
    icon: {
      badge: 'circle',
      boardDraw: { module: 'src/scenes/MenuScene.ts', symbol: 'drawLegacyPlayTouchStick' },
      chipDraw: null,
      glyph: 'touch-stick',
      lane: null,
      reasonId: 'stick-mirrors-play-stick-style-independent',
      status: 'guide-local'
    },
    id: 'move',
    text: 'Touch and hold anywhere, then drag the way you want to go. Let go to stop.'
  },
  {
    heading: 'Your trail',
    icon: {
      badge: 'square',
      boardDraw: { module: 'src/render/boardTileBake.ts', symbol: 'computeChipGeometry' },
      chipDraw: null,
      glyph: 'trail-swatch',
      lane: null,
      reasonId: 'trail-legend-uses-chip-tile-geometry',
      status: 'shared-with-board'
    },
    id: 'trail',
    text: `A shimmering, colour-shifting line is your route. ${TRAIL_FADE_LABEL} in Settings fades old trail.`
  },
  {
    heading: 'Wrap',
    icon: {
      badge: 'circle',
      boardDraw: { module: 'src/render/edgeMarkers.ts', symbol: 'drawEdgeMarker' },
      chipDraw: null,
      glyph: 'edge-marker',
      lane: null,
      reasonId: 'wrap-legend-calls-edge-marker-draw',
      status: 'shared-with-board'
    },
    id: 'wrap',
    text: 'Some mazes wrap around open edges. The edge diamonds glow in your trail colours.'
  },
  {
    heading: 'Levels',
    icon: {
      badge: 'circle',
      boardDraw: { module: 'src/scenes/MenuScene.ts', symbol: 'drawLegacyGlyphWordTileBlock' },
      chipDraw: null,
      glyph: 'level-numeral',
      lane: null,
      reasonId: 'level-numeral-calls-wordmark-chip-draw',
      status: 'shared-with-board'
    },
    id: 'levels',
    text: 'Clears show your level, new ranks flash a letter. Harder mazes add shortcuts and loops.'
  }
]);

/**
 * Rows deliberately NOT shown yet. Each names what must land first; the
 * drift test pins that none of them is in LEGACY_GUIDE_ROWS. (The Start row
 * left this list when Chip landed: the start marker is now on the board.)
 */
export const LEGACY_GUIDE_PENDING_ROWS: readonly LegacyGuidePendingRow[] = Object.freeze([
  {
    blockedOn: 'rank-surface',
    id: 'ranks',
    reasonId: 'rank-letters-not-visible-anywhere'
  },
  {
    blockedOn: 'first-run-coach',
    id: 'first-run-coach',
    reasonId: 'level1-coach-is-owner-decision'
  },
  {
    // Gameplay pauses itself when the tab is hidden, the app is backgrounded or
    // the window loses focus, and only Resume continues it. The Pause card is
    // unchanged and no existing row says anything the behaviour contradicts;
    // the row below needs a guide icon, and icon construction is an open
    // owner pick, so the row waits for it instead of borrowing a wrong glyph.
    blockedOn: 'guide-icon-construction',
    id: 'auto-pause',
    reasonId: 'auto-pause-row-needs-owner-icon-pick'
  }
]);

/**
 * Keyboard line, shown only on devices with a keyboard / fine pointer. Built
 * from structured bindings so the drift test can resolve every key against
 * the live input maps.
 */
export const LEGACY_GUIDE_KEY_BINDINGS: readonly LegacyGuideKeyBinding[] = Object.freeze([
  { does: 'to move', expectedAction: 'move', keys: ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'], label: 'Arrow keys' },
  { does: 'to move', expectedAction: 'move', keys: ['w', 'a', 's', 'd'], label: 'WASD' },
  { does: 'pauses', expectedAction: 'pause', keys: ['p'], label: 'P' },
  { does: 'goes back', expectedAction: null, keys: ['Escape'], label: 'Esc' },
  { does: 'twice quits from Pause', expectedAction: 'quit', keys: ['q'], label: 'Q' }
]);

export const buildLegacyGuideKeyboardLine = (): string => {
  const [arrows, wasd, pause, back, quit] = LEGACY_GUIDE_KEY_BINDINGS;
  return `${arrows!.label} or ${wasd!.label} ${wasd!.does}. ${pause!.label} ${pause!.does}. ${back!.label} ${back!.does}. ${quit!.label} ${quit!.does}.`;
};

export interface LegacyGuideSheetModel {
  context: LegacyGuideContext;
  title: typeof LEGACY_GUIDE_TITLE;
  rows: readonly LegacyGuideRow[];
  /** Null when the device has no keyboard. */
  keyboardLine: string | null;
  /** Labelled footer button; closing returns to the Settings sheet it was opened from. */
  closeLabel: typeof LEGACY_GUIDE_CLOSE_LABEL;
}

/** Same rows for both contexts: only the sheet the Guide returns to differs (the caller's overlay stack). */
export const buildLegacyGuideSheetModel = (
  context: LegacyGuideContext,
  options: { hasKeyboard?: boolean } = {}
): LegacyGuideSheetModel => ({
  closeLabel: LEGACY_GUIDE_CLOSE_LABEL,
  context,
  keyboardLine: options.hasKeyboard === true ? buildLegacyGuideKeyboardLine() : null,
  rows: LEGACY_GUIDE_ROWS,
  title: LEGACY_GUIDE_TITLE
});
