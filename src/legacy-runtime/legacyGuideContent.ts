/**
 * How to play: the ONE data module for the Guide sheet.
 *
 * Standing rule (Zac, 2026-11-06): when the game or UI changes, the guide's
 * UI reflections change in the same PR. This module is the single place the
 * guide's rows, icon specs and copy live; the Guide row of both Menu
 * dropdowns (legacyMenuRows.ts, MAZER-UI-095/096: main menu and in-game)
 * opens the same sheet, so they cannot disagree.
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
import { REDUCED_MOTION_SETTING_LABEL } from '../render/reducedMotion';

export type LegacyGuideContext = 'menu' | 'pause';

export type LegacyGuideGlyph =
  | 'goal-star'
  | 'start-marker'
  | 'player-block'
  | 'touch-stick'
  | 'trail-swatch'
  | 'edge-marker'
  | 'bleed-gate'
  | 'level-numeral'
  | 'online-count'
  | 'menu-burger'
  | 'sound-speaker'
  | 'hazard-gate'
  | 'hazard-sentry'
  | 'hazard-hunter'
  | 'hazard-shard';

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
  id: 'goal' | 'start' | 'you' | 'move' | 'trail' | 'wrap' | 'bleed-gate' | 'levels' | 'online' | 'menu' | 'sound' | LegacyGuideHazardRowId;
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
    text: 'Reach the spinning twin stars to clear the maze.'
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
    text: 'The spinning pinwheel on the first tile is where you set off.'
  },
  {
    heading: 'You',
    icon: {
      badge: 'square',
      boardDraw: { module: 'src/render/sparkPlayerSkin.ts', symbol: 'drawSparkPlayer' },
      chipDraw: { marker: 'player', module: 'src/render/boardTileBake.ts', symbol: 'drawBoardMarkers' },
      glyph: 'player-block',
      lane: null,
      reasonId: 'player-legend-calls-shared-marker-draw',
      status: 'shared-with-board'
    },
    id: 'you',
    text: 'You are the colour-shifting spark. It points the way you move.'
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
    text: 'Touch and drag anywhere to move. With a mouse, click and drag. Let go to stop.'
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
    text: `A trail of twinkling star dust marks your route. ${REDUCED_MOTION_SETTING_LABEL} in Settings calms it.`
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
    text: 'Some mazes wrap around open edges. Edge stars fill with your colour as beams hit.'
  },
  {
    // MAZER-L10: the bleed gate (Gate D "Pulse ring"). The icon is the board's own gate draw, lit and still.
    heading: 'Wrap gate',
    icon: {
      badge: 'circle',
      boardDraw: { module: 'src/render/bleedGateRenderer.ts', symbol: 'drawBleedGatePlan' },
      chipDraw: null,
      glyph: 'bleed-gate',
      lane: null,
      reasonId: 'bleed-gate-legend-calls-board-gate-draw',
      status: 'shared-with-board'
    },
    id: 'bleed-gate',
    text: 'Later mazes hide a wrap behind a dashed ring. Walk over the ring to open it.'
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
    text: 'Endless mode: clears show your time and level. Harder mazes add shortcuts and loops.'
  },
  {
    heading: 'Online',
    icon: {
      badge: 'circle',
      boardDraw: { module: 'src/scenes/MenuScene.ts', symbol: 'drawLegacyPresenceGlyphWord' },
      chipDraw: null,
      glyph: 'online-count',
      lane: null,
      reasonId: 'online-count-calls-menu-counter-chip-draw',
      status: 'shared-with-board'
    },
    id: 'online',
    text: 'The dot and number at the top left show how many players are online right now.'
  },
  {
    heading: 'Menu',
    icon: {
      badge: 'circle',
      boardDraw: { module: 'src/render/menuDropdownArt.ts', symbol: 'drawMenuBurgerGlyph' },
      chipDraw: null,
      glyph: 'menu-burger',
      lane: null,
      reasonId: 'menu-legend-calls-header-burger-draw',
      status: 'shared-with-board'
    },
    id: 'menu',
    text: 'Three lines, top right: Settings (Dark mode), Guide, Sound, Profile, Leaderboard.'
  },
  {
    heading: 'Sound',
    icon: {
      badge: 'circle',
      boardDraw: null,
      chipDraw: null,
      glyph: 'sound-speaker',
      lane: null,
      reasonId: 'sound-speaker-guide-local-no-board-counterpart',
      status: 'guide-local'
    },
    id: 'sound',
    text: 'Sound is on by default: soft ticks on steps, bumps and wins. Turn it off from the Menu.'
  }
]);

/**
 * The hazard kinds, spelled locally so the Guide data stays free of the hazard core (the source boundary
 * test pins which legacy files may import it). tests/reset/legacy-hazard-onboarding.test.ts pins this list
 * to the signed schedule's units, in order.
 */
export type LegacyGuideHazardKind = 'pulseGate' | 'sentry' | 'hunter' | 'shard';

export type LegacyGuideHazardRowId = 'hazard-gate' | 'hazard-sentry' | 'hazard-hunter' | 'hazard-shard';

/** A Guide row for one hazard kind (slice H6). Its heading and text are also the kind's intro card. */
export interface LegacyGuideHazardRow extends LegacyGuideRow {
  id: LegacyGuideHazardRowId;
  kind: LegacyGuideHazardKind;
}

const hazardGlyphIcon = (glyph: LegacyGuideGlyph, reasonId: string): LegacyGuideIconSpec => ({
  badge: 'circle',
  boardDraw: null,
  chipDraw: null,
  glyph,
  lane: null,
  reasonId,
  status: 'guide-local'
});

/**
 * Hazard rows (slice H6), in schedule order. NEVER part of LEGACY_GUIDE_ROWS: the sheet shows a
 * hazard row only while the hazard layer is on (build flag or `?lab=hazards`) AND the player has
 * met that kind AND the kind is live in play (legacyHazardOnboarding.ts decides which), so the
 * flag-off Guide is unchanged. The same heading and text are the kind's one-line intro card, so
 * the card and the Guide cannot disagree. Each claim is pinned to the signed schedule manifest by
 * tests/reset/legacy-hazard-onboarding.test.ts.
 */
export const LEGACY_GUIDE_HAZARD_ROWS: readonly LegacyGuideHazardRow[] = Object.freeze([
  {
    heading: 'Pulse Gate',
    icon: hazardGlyphIcon('hazard-gate', 'hazard-gate-glyph-guide-local-until-board-layer'),
    id: 'hazard-gate',
    kind: 'pulseGate',
    text: 'Gates open and shut on a beat. Wait for the gap, then go through.'
  },
  {
    heading: 'Sentry',
    icon: hazardGlyphIcon('hazard-sentry', 'hazard-sentry-glyph-guide-local-until-board-layer'),
    id: 'hazard-sentry',
    kind: 'sentry',
    text: 'Sentries pace a short route. A touch sends you back to your last junction.'
  },
  {
    heading: 'Hunter',
    icon: hazardGlyphIcon('hazard-hunter', 'hazard-hunter-glyph-guide-local-until-board-layer'),
    id: 'hazard-hunter',
    kind: 'hunter',
    text: 'A Hunter chases you, slower than you move. It gives up after three catches.'
  },
  {
    heading: 'Shard',
    icon: hazardGlyphIcon('hazard-shard', 'hazard-shard-glyph-guide-local-until-board-layer'),
    id: 'hazard-shard',
    kind: 'shard',
    text: 'Collect the shard first. The star stays locked until you do.'
  }
]);

export const resolveLegacyGuideHazardRow = (kind: LegacyGuideHazardKind): LegacyGuideHazardRow => (
  LEGACY_GUIDE_HAZARD_ROWS.find((row) => row.kind === kind)!
);

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
  { does: 'twice quits while paused', expectedAction: 'quit', keys: ['q'], label: 'Q' }
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
  /** Labelled footer button; closing returns to the Menu it was opened from. */
  closeLabel: typeof LEGACY_GUIDE_CLOSE_LABEL;
}

/**
 * Same rows for both contexts: only the sheet the Guide returns to differs (the caller's overlay stack).
 * `hazardKinds` (slice H6) appends the hazard rows for those kinds, in schedule order; empty or omitted
 * (the hazard layer off) returns LEGACY_GUIDE_ROWS itself, so the flag-off sheet is unchanged.
 */
export const buildLegacyGuideSheetModel = (
  context: LegacyGuideContext,
  options: { hasKeyboard?: boolean; hazardKinds?: readonly LegacyGuideHazardKind[] } = {}
): LegacyGuideSheetModel => {
  const hazardKinds = options.hazardKinds ?? [];
  const hazardRows = LEGACY_GUIDE_HAZARD_ROWS.filter((row) => hazardKinds.includes(row.kind));
  return {
    closeLabel: LEGACY_GUIDE_CLOSE_LABEL,
    context,
    keyboardLine: options.hasKeyboard === true ? buildLegacyGuideKeyboardLine() : null,
    rows: hazardRows.length === 0 ? LEGACY_GUIDE_ROWS : [...LEGACY_GUIDE_ROWS, ...hazardRows],
    title: LEGACY_GUIDE_TITLE
  };
};
