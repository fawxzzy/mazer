/**
 * Per-mode tab shell for the Leaderboard sheet (lane L11).
 *
 * One tab per registered game mode (legacyGameModes.ts). Today that is a single `Endless` tab, so
 * the strip is a label that says which board is shown; it is display-only and has no switch
 * behaviour. When a second mode is registered the same tabs get interactive hit areas (>= 44 px) and
 * the scene gains a selected-mode state; until then nothing here can pick a mode other than Endless.
 *
 * The strip appears whenever a board (or its loading/empty/failure state) is the body, and not for
 * the signed-out or username-gate bodies, which replace the whole board.
 *
 * Pure: no Phaser, no DOM, no network. No query field is added: the Endless tab uses the existing
 * leaderboard calls, which rank Endless by definition (contract section 3).
 */
import {
  LEGACY_DEFAULT_GAME_MODE_ID,
  LEGACY_GAME_MODES,
  resolveLegacyGameMode,
  type LegacyGameModeId
} from './legacyGameModes';

export interface LegacyLeaderboardModeTab {
  readonly id: LegacyGameModeId;
  readonly label: string;
  readonly selected: boolean;
  readonly accessibilityLabel: string;
}

export interface LegacyLeaderboardModeTabsModel {
  readonly tabs: readonly LegacyLeaderboardModeTab[];
  readonly selectedId: LegacyGameModeId;
}

export const LEGACY_LEADERBOARD_MODE_TAB_SIZES = Object.freeze({
  /** Chip height (display-only today; interactive tabs need a 44 px hit area when a second mode ships). */
  height: 28,
  /** Horizontal chip padding around the label. */
  padX: 14,
  /** Gap between two chips. */
  gap: 8,
  fontSize: 13,
  /** Estimated glyph width used to size the chip (the scene text is centred in it). */
  charWidth: 8
});

export const buildLegacyLeaderboardModeTabs = (
  selected: unknown = LEGACY_DEFAULT_GAME_MODE_ID
): LegacyLeaderboardModeTabsModel => {
  const selectedId = resolveLegacyGameMode(selected).id;
  return {
    selectedId,
    tabs: LEGACY_GAME_MODES.map((mode) => ({
      accessibilityLabel: `${mode.label} leaderboard${mode.id === selectedId ? ', selected' : ''}`,
      id: mode.id,
      label: mode.label,
      selected: mode.id === selectedId
    }))
  };
};

export interface LegacyLeaderboardModeTabRect {
  readonly id: LegacyGameModeId;
  readonly label: string;
  readonly selected: boolean;
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/** Centred strip layout for the tabs inside an inner width starting at `innerLeft`. */
export const layoutLegacyLeaderboardModeTabs = (
  model: LegacyLeaderboardModeTabsModel,
  innerLeft: number,
  innerWidth: number,
  top: number
): readonly LegacyLeaderboardModeTabRect[] => {
  const z = LEGACY_LEADERBOARD_MODE_TAB_SIZES;
  const widths = model.tabs.map((tab) => (tab.label.length * z.charWidth) + (z.padX * 2));
  const total = widths.reduce((sum, w) => sum + w, 0) + (z.gap * Math.max(0, widths.length - 1));
  let cursor = innerLeft + Math.max(0, Math.round((innerWidth - total) / 2));
  return model.tabs.map((tab, index) => {
    const width = Math.min(widths[index]!, innerWidth);
    const rect: LegacyLeaderboardModeTabRect = {
      height: z.height,
      id: tab.id,
      label: tab.label,
      left: cursor,
      selected: tab.selected,
      top,
      width
    };
    cursor += width + z.gap;
    return rect;
  });
};
