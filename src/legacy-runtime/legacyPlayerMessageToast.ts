import {
  resolveLegacyPlayerMessageColor,
  type LegacyQueuedPlayerMessage
} from './legacyPlayerMessage';

/**
 * Pure view-model for the player message toast (MAZER-UI-018).
 *
 * The scene owns the queue (legacyPlayerMessage.ts); this module only turns
 * the queue plus a clock into draw rows: tone colour, fade alpha and a
 * top-down stack position. It touches no Phaser API so it is unit-testable.
 */

export const LEGACY_PLAYER_MESSAGE_TOAST_FADE_IN_MS = 160;
export const LEGACY_PLAYER_MESSAGE_TOAST_FADE_OUT_MS = 320;
export const LEGACY_PLAYER_MESSAGE_TOAST_ROW_GAP = 8;
export const LEGACY_PLAYER_MESSAGE_TOAST_MARGIN_X = 16;
export const LEGACY_PLAYER_MESSAGE_TOAST_MAX_WIDTH = 420;

export interface LegacyPlayerMessageToastRow {
  alpha: number;
  color: string;
  copy: string;
  id: string;
  tone: LegacyQueuedPlayerMessage['message']['tone'];
}

export interface LegacyPlayerMessageToastFrame {
  maxWidth: number;
  rows: LegacyPlayerMessageToastRow[];
}

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

export const resolveLegacyPlayerMessageToastAlpha = (
  entry: Pick<LegacyQueuedPlayerMessage, 'expiresAtMs' | 'message'>,
  nowMs: number
): number => {
  const startedAtMs = entry.expiresAtMs - entry.message.durationMs;
  const fadeIn = clamp01((nowMs - startedAtMs) / LEGACY_PLAYER_MESSAGE_TOAST_FADE_IN_MS);
  const fadeOut = clamp01((entry.expiresAtMs - nowMs) / LEGACY_PLAYER_MESSAGE_TOAST_FADE_OUT_MS);
  return Math.min(fadeIn, fadeOut);
};

export const resolveLegacyPlayerMessageToastMaxWidth = (viewportWidth: number): number => Math.max(
  120,
  Math.min(LEGACY_PLAYER_MESSAGE_TOAST_MAX_WIDTH, viewportWidth - (LEGACY_PLAYER_MESSAGE_TOAST_MARGIN_X * 2))
);

/** Newest message first (top of the stack); fully faded rows are dropped. */
export const resolveLegacyPlayerMessageToastFrame = (
  queue: readonly LegacyQueuedPlayerMessage[],
  nowMs: number,
  viewportWidth: number
): LegacyPlayerMessageToastFrame => ({
  maxWidth: resolveLegacyPlayerMessageToastMaxWidth(viewportWidth),
  rows: [...queue]
    .sort((left, right) => right.sequence - left.sequence)
    .map((entry) => ({
      alpha: resolveLegacyPlayerMessageToastAlpha(entry, nowMs),
      color: resolveLegacyPlayerMessageColor(entry.message),
      copy: entry.message.copy,
      id: entry.message.id,
      tone: entry.message.tone
    }))
    .filter((row) => row.alpha > 0)
});
