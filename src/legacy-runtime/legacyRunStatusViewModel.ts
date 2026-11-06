import type { LegacyProgressionRank } from './legacyProgression';
import {
  resolveLegacyRunStatusPanelLayout,
  type LegacyRunStatusPanelLayout
} from './legacyUiStandards';

/**
 * Pure view-model for the shared run-status panel (menu + play).
 *
 * No rendering, no Phaser, no scene wiring. Callers hand in the rank, the
 * maze level and an optional canonical 0-100 run score; they get back two
 * display rows with stable strings. The same input yields byte-identical
 * output regardless of surface mode, so menu and play cannot drift.
 *
 * Score authority: this module never calculates a score. It only formats a
 * value that the run-quality scorer already finalized.
 */

export const LEGACY_RUN_STATUS_SCORE_MIN = 0;
export const LEGACY_RUN_STATUS_SCORE_MAX = 100;
export const LEGACY_RUN_STATUS_MISSING_TEXT = '--';
export const LEGACY_RUN_STATUS_RANK_PREFIX = 'Rank';
export const LEGACY_RUN_STATUS_LEVEL_PREFIX = 'Maze Lvl';
export const LEGACY_RUN_STATUS_SCORE_PREFIX = 'Score';
export const LEGACY_RUN_STATUS_ROW_SEPARATOR = ' | ';

const RANKS: readonly LegacyProgressionRank[] = ['E', 'D', 'C', 'B', 'A', 'S'];
const UNSIGNED_DECIMAL_PATTERN = /^\d+$/;

export type LegacyRunStatusMode = 'menu' | 'play';

export interface LegacyRunStatusInput {
  /**
   * Surface the panel is shown on. Accepted for call-site clarity only: it
   * deliberately has no effect on the produced strings.
   */
  mode?: LegacyRunStatusMode;
  /** Public rank letter. Anything outside E..S renders as the placeholder. */
  rank?: unknown;
  /** Visible maze level ordinal: number, bigint or canonical decimal string. */
  mazeLevel?: unknown;
  /** Finalized canonical 0-100 run-quality score, or absent before finalization. */
  score?: unknown;
}

export interface LegacyRunStatusRow {
  /** Full row text as drawn. */
  text: string;
  /** Row text split into atomic segments, in order, for compact fitting. */
  segments: readonly string[];
  /** Screen-reader label for the row. */
  accessibilityLabel: string;
}

export interface LegacyRunStatusViewModel {
  /** Row 1: rank-only public badge. */
  rankRow: LegacyRunStatusRow;
  /** Row 2: maze level plus score. */
  detailRow: LegacyRunStatusRow;
  rows: readonly [LegacyRunStatusRow, LegacyRunStatusRow];
  /** Normalized values, for tests and diagnostics (never re-derive from text). */
  values: {
    rank: LegacyProgressionRank | null;
    mazeLevel: string | null;
    /** Rounded and clamped 0-100 integer, or null when no canonical score exists. */
    score: number | null;
  };
  accessibilityLabel: string;
}

export const normalizeLegacyRunStatusRank = (value: unknown): LegacyProgressionRank | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const candidate = value.trim().toUpperCase();
  return (RANKS as readonly string[]).includes(candidate) ? (candidate as LegacyProgressionRank) : null;
};

/**
 * Canonical unsigned decimal string (>= 1) or null. The maze level has no
 * application ceiling and may exceed Number.MAX_SAFE_INTEGER, so unsafe
 * numbers are rejected instead of rounded.
 */
export const normalizeLegacyRunStatusMazeLevel = (value: unknown): string | null => {
  let parsed: bigint | null = null;
  if (typeof value === 'bigint') {
    parsed = value;
  } else if (typeof value === 'number') {
    parsed = Number.isFinite(value) && Math.abs(value) <= Number.MAX_SAFE_INTEGER
      ? BigInt(Math.floor(value))
      : null;
  } else if (typeof value === 'string' && UNSIGNED_DECIMAL_PATTERN.test(value.trim())) {
    parsed = BigInt(value.trim());
  }
  if (parsed === null) {
    return null;
  }
  return (parsed < 1n ? 1n : parsed).toString();
};

/** Rounded (half up) and clamped 0-100 integer, or null for missing/non-finite input. */
export const normalizeLegacyRunStatusScore = (value: unknown): number | null => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }
  const rounded = Math.round(value);
  const clamped = Math.min(LEGACY_RUN_STATUS_SCORE_MAX, Math.max(LEGACY_RUN_STATUS_SCORE_MIN, rounded));
  // Normalize -0 (Math.round(-0.4)) so String() and toBe(0) stay stable.
  return clamped === 0 ? 0 : clamped;
};

export const buildLegacyRunStatusViewModel = (input: LegacyRunStatusInput = {}): LegacyRunStatusViewModel => {
  const rank = normalizeLegacyRunStatusRank(input.rank);
  const mazeLevel = normalizeLegacyRunStatusMazeLevel(input.mazeLevel);
  const score = normalizeLegacyRunStatusScore(input.score);

  const rankSegment = `${LEGACY_RUN_STATUS_RANK_PREFIX}: ${rank ?? LEGACY_RUN_STATUS_MISSING_TEXT}`;
  const levelSegment = `${LEGACY_RUN_STATUS_LEVEL_PREFIX} ${mazeLevel ?? LEGACY_RUN_STATUS_MISSING_TEXT}`;
  const scoreSegment = `${LEGACY_RUN_STATUS_SCORE_PREFIX}: ${score ?? LEGACY_RUN_STATUS_MISSING_TEXT}/${LEGACY_RUN_STATUS_SCORE_MAX}`;

  const rankLabel = rank === null ? 'Rank not available' : `Rank ${rank}`;
  const levelLabel = mazeLevel === null ? 'Maze level not available' : `Maze level ${mazeLevel}`;
  const scoreLabel = score === null
    ? 'Run score not available yet'
    : `Run score ${score} out of ${LEGACY_RUN_STATUS_SCORE_MAX}`;

  const rankRow: LegacyRunStatusRow = {
    text: rankSegment,
    segments: [rankSegment],
    accessibilityLabel: rankLabel
  };
  const detailRow: LegacyRunStatusRow = {
    text: [levelSegment, scoreSegment].join(LEGACY_RUN_STATUS_ROW_SEPARATOR),
    segments: [levelSegment, scoreSegment],
    accessibilityLabel: `${levelLabel}, ${scoreLabel}`
  };

  return {
    rankRow,
    detailRow,
    rows: [rankRow, detailRow],
    values: { rank, mazeLevel, score },
    accessibilityLabel: `${rankRow.accessibilityLabel}. ${detailRow.accessibilityLabel}`
  };
};

export interface LegacyRunStatusViewModelLayout {
  /** Unchanged output of resolveLegacyRunStatusPanelLayout. */
  panel: LegacyRunStatusPanelLayout;
  /** Pixel budget for one text row inside the panel (padding and safety ratio applied). */
  maxTextWidth: number;
}

/**
 * Layout hook: reuses the shared panel geometry as-is and derives the text
 * budget a renderer should fit each row into. Wiring it up is a later packet.
 */
export const resolveLegacyRunStatusViewModelLayout = (
  viewportWidth: number,
  availableWidth: number = viewportWidth
): LegacyRunStatusViewModelLayout => {
  const panel = resolveLegacyRunStatusPanelLayout(viewportWidth, availableWidth);
  const maxTextWidth = Math.max(
    1,
    Math.floor((panel.width - (panel.horizontalPadding * 2)) * panel.textWidthSafetyRatio)
  );
  return { panel, maxTextWidth };
};
