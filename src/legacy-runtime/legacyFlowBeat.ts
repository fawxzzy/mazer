/**
 * Level-complete and rank-up beats (cards MAZER-FLOW-002 / MAZER-FLOW-003).
 *
 * Pure model: decides WHAT caption a cleared maze shows and exactly how it
 * animates as a function of elapsed milliseconds. No Phaser, DOM, storage or
 * wall clock. MenuScene only feeds it the before/after progression track and
 * paints the returned frame (a centered caption over the board).
 *
 *  - Normal clear:  "Level N" (N = the displayed level ordinal, the same value
 *    the between-mazes numeral shows) for `motion.durationMs.reveal` (700 ms).
 *  - Rank crossing: "Rank D" style (the NEW rank letter, in that rank's own
 *    palette colour) for reveal + long (1100 ms), IN PLACE of the level caption.
 *  - Reduced motion: the same caption held static (no fade, no scale) for
 *    `motion.durationMs.long` (400 ms), then gone.
 *
 * Every duration is an existing motion token; nothing here adds a new one. The
 * beat runs CONCURRENTLY with the goal hold / deconstruct and never gates input
 * unlock, the maze rebuild or the perpetual play loop: it adds 0 ms to the
 * existing spawn timing. Rank letters and their order come from
 * legacyProgression.ts (E, D, C, B, A, S); no rank is invented here.
 */
import { designTokens } from '../theme/tokens';
import {
  formatLegacyProgressionOrdinal,
  type LegacyProgressionRank,
  type LegacyProgressionTrack
} from './legacyProgression';

/** Weakest to strongest, mirroring resolveLegacyProgressionRank's thresholds. */
export const LEGACY_FLOW_BEAT_RANK_ORDER: readonly LegacyProgressionRank[] = Object.freeze(['E', 'D', 'C', 'B', 'A', 'S']);

const MOTION = designTokens.motion.durationMs;

/** Level caption: the reveal token (700 ms). */
export const LEGACY_FLOW_BEAT_LEVEL_MS = MOTION.reveal;
/** Rank caption: the reveal token plus the long token (1100 ms). */
export const LEGACY_FLOW_BEAT_RANK_MS = MOTION.reveal + MOTION.long;
/** Reduced motion: static caption for the long token (400 ms). */
export const LEGACY_FLOW_BEAT_REDUCED_MS = MOTION.long;
/** Fade-in uses the fast token, fade-out the slow token. */
export const LEGACY_FLOW_BEAT_FADE_IN_MS = MOTION.fast;
export const LEGACY_FLOW_BEAT_FADE_OUT_MS = MOTION.slow;
/** The caption grows from this scale to 1 while it fades in (full motion only). */
export const LEGACY_FLOW_BEAT_START_SCALE = 0.9;

/** Level caption colour: the primary text token (rank captions use the rank's own palette colour). */
export const LEGACY_FLOW_BEAT_LEVEL_COLOR = designTokens.color['text.primary'];

/** `0xRRGGBB` palette colour to the `#rrggbb` CSS string Phaser text takes. */
export const formatLegacyFlowBeatColor = (color: number): string => (
  `#${Math.max(0, Math.min(0xffffff, Math.trunc(color))).toString(16).padStart(6, '0')}`
);

export type LegacyFlowBeatKind = 'level' | 'rank';

export interface LegacyFlowBeat {
  readonly kind: LegacyFlowBeatKind;
  /** Exact caption text: "Level 7" or "Rank D". */
  readonly text: string;
  /** Total time the caption is on screen, from the goal-reached instant. */
  readonly durationMs: number;
  /** The reduced-motion form is static (no fade, no scale). */
  readonly reducedMotion: boolean;
  /** Rank beats only: the new rank letter. */
  readonly rank: LegacyProgressionRank | null;
}

export interface LegacyFlowBeatFrame {
  readonly alpha: number;
  readonly scale: number;
  readonly visible: boolean;
  readonly done: boolean;
}

const clamp01 = (value: number): number => (Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0);

const smoothstep = (value: number): number => {
  const x = clamp01(value);
  return x * x * (3 - (2 * x));
};

const rankIndex = (rank: LegacyProgressionRank): number => LEGACY_FLOW_BEAT_RANK_ORDER.indexOf(rank);

/** True only when the rank got STRONGER (an ease signal never drops a rank into a beat). */
export const didLegacyRankAdvance = (
  previousRank: LegacyProgressionRank,
  nextRank: LegacyProgressionRank
): boolean => rankIndex(nextRank) > rankIndex(previousRank);

export interface ResolveLegacyFlowBeatInput {
  /** The player track BEFORE the completion was recorded. */
  readonly previousTrack: Pick<LegacyProgressionTrack, 'rank'>;
  /** The player track AFTER the completion was recorded. */
  readonly nextTrack: Pick<LegacyProgressionTrack, 'level' | 'rank'>;
  readonly reducedMotion: boolean;
}

/** The caption for one cleared maze: a rank beat when the rank advanced, otherwise the level beat. */
export const resolveLegacyFlowBeat = ({
  nextTrack,
  previousTrack,
  reducedMotion
}: ResolveLegacyFlowBeatInput): LegacyFlowBeat => {
  const rankUp = didLegacyRankAdvance(previousTrack.rank, nextTrack.rank);
  if (rankUp) {
    return {
      durationMs: reducedMotion ? LEGACY_FLOW_BEAT_REDUCED_MS : LEGACY_FLOW_BEAT_RANK_MS,
      kind: 'rank',
      rank: nextTrack.rank,
      reducedMotion,
      text: `Rank ${nextTrack.rank}`
    };
  }
  return {
    durationMs: reducedMotion ? LEGACY_FLOW_BEAT_REDUCED_MS : LEGACY_FLOW_BEAT_LEVEL_MS,
    kind: 'level',
    rank: null,
    reducedMotion,
    text: `Level ${formatLegacyProgressionOrdinal(nextTrack.level)}`
  };
};

const HIDDEN_FRAME: LegacyFlowBeatFrame = Object.freeze({ alpha: 0, done: true, scale: 1, visible: false });

/** The caption's look at `elapsedMs` since the goal-reached instant. */
export const resolveLegacyFlowBeatFrame = (beat: LegacyFlowBeat, elapsedMs: number): LegacyFlowBeatFrame => {
  const elapsed = Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) : 0;
  if (elapsed >= beat.durationMs) {
    return HIDDEN_FRAME;
  }
  if (beat.reducedMotion) {
    return { alpha: 1, done: false, scale: 1, visible: true };
  }
  const fadeIn = smoothstep(elapsed / LEGACY_FLOW_BEAT_FADE_IN_MS);
  const fadeOutStartMs = beat.durationMs - LEGACY_FLOW_BEAT_FADE_OUT_MS;
  const fadeOut = 1 - smoothstep((elapsed - fadeOutStartMs) / LEGACY_FLOW_BEAT_FADE_OUT_MS);
  const alpha = Math.min(fadeIn, fadeOut);
  return {
    alpha,
    done: false,
    scale: LEGACY_FLOW_BEAT_START_SCALE + ((1 - LEGACY_FLOW_BEAT_START_SCALE) * fadeIn),
    visible: alpha > 0
  };
};
