import type { LegacyAuthSessionSnapshot } from './legacyAuth';
import { liftLegacyMenuDemoTrackToPlayer, seedLegacyMenuDemoTrackFromPlayer } from './legacyMenuDemoTrack';
import {
  createEmptyLegacyProgressionState,
  LEGACY_PROGRESSION_MAX_COMPLEXITY,
  LEGACY_PROGRESSION_MIN_COMPLEXITY,
  type LegacyProgressionState,
  type LegacyProgressionTrack
} from './legacyProgression';

/**
 * L4 (2026-11-19, Zac): the main-menu demo follows the SIGNED-IN player's level.
 *
 * Signed in: each app open (and each sign-in) starts the demo on the player's
 * current level; the demo then climbs one level per completed demo maze for the
 * rest of the session, in memory only. The demo's level is never written, not
 * to local storage (see createLegacyMenuDemoSessionProgressionStorage) and not
 * to the account (no completion RPC, no outbox entry), so the next open (or a
 * sign-out and sign-in) starts on the player's level again. The local cycle
 * telemetry receipt for a demo maze is still recorded, exactly as today.
 *
 * Signed out or unknown: exactly today's demo (`seedLegacyMenuDemoTrackFromPlayer`
 * on load, the persisted, climbing `ai-runner` track, recorded as before).
 *
 * The session track rides in the in-memory progression state's `ai-runner` slot,
 * so every reader (generation scale/profile/target, seed salt, walker skill and
 * rank, level announcer, palette, diagnostics) follows it with no extra wiring.
 * Everything here is pure: no storage, no network, no clock.
 */
export interface LegacyMenuDemoSession {
  readonly userId: string;
  readonly track: LegacyProgressionTrack;
}

export interface LegacyMenuDemoSessionResolution<T> {
  readonly session: LegacyMenuDemoSession | null;
  readonly state: T;
}

/** The account a session demo belongs to, or null for today's (signed-out) demo. */
export const resolveLegacyMenuDemoSessionUserId = (
  snapshot: Pick<LegacyAuthSessionSnapshot, 'status' | 'userId'> | null | undefined,
  options: { levelPreview?: boolean } = {}
): string | null => {
  if (options.levelPreview === true || !snapshot || snapshot.status !== 'authenticated') {
    return null;
  }
  return typeof snapshot.userId === 'string' && snapshot.userId.length > 0 ? snapshot.userId : null;
};

const clampComplexity = (value: number): number => {
  if (!Number.isFinite(value)) {
    return LEGACY_PROGRESSION_MIN_COMPLEXITY;
  }
  return Math.min(LEGACY_PROGRESSION_MAX_COMPLEXITY, Math.max(LEGACY_PROGRESSION_MIN_COMPLEXITY, Math.round(value)));
};

/**
 * A fresh session demo track: the player's level, rank, colour tier and target
 * complexity (clamped to the ladder's own complexity bounds, so the demo is never
 * bigger than a board the player can already get), keeping the demo's own pace
 * history and receipt cursor so the climb behaves exactly like today's demo.
 */
export const startLegacyMenuDemoSessionTrack = (
  player: LegacyProgressionTrack,
  aiRunner: LegacyProgressionTrack
): LegacyProgressionTrack => {
  const targetComplexity = clampComplexity(player.targetComplexity);
  return {
    ...aiRunner,
    colorTier: player.colorTier,
    level: player.level,
    peakComplexity: targetComplexity,
    rank: player.rank,
    targetComplexity
  };
};

const withAiRunnerTrack = <T extends Pick<LegacyProgressionState, 'tracks'>>(
  state: T,
  track: LegacyProgressionTrack
): T => (
  state.tracks['ai-runner'] === track
    ? state
    : { ...state, tracks: { ...state.tracks, 'ai-runner': track } }
);

/**
 * Apply at every point the progression state is (re)loaded: boot, account
 * change, bootstrapped account state, remote hydration.
 * - signed out: today's seed, session cleared;
 * - signed in, new account or no session yet: start a session on the player's level;
 * - signed in, same account: keep the session's climb, lifting it if the player's
 *   level arrived higher (a late account hydration), never dropping it.
 */
export const applyLegacyMenuDemoSession = <T extends Pick<LegacyProgressionState, 'tracks'>>(
  state: T,
  session: LegacyMenuDemoSession | null | undefined,
  userId: string | null
): LegacyMenuDemoSessionResolution<T> => {
  if (userId === null) {
    return { session: null, state: seedLegacyMenuDemoTrackFromPlayer(state) };
  }
  const player = state.tracks.player;
  const sameAccount = session != null && session.userId === userId;
  const track = sameAccount
    ? liftLegacyMenuDemoTrackToPlayer(session.track, player)
    : startLegacyMenuDemoSessionTrack(player, state.tracks['ai-runner']);
  const nextSession = sameAccount && session.track === track ? session : { track, userId };
  return { session: nextSession, state: withAiRunnerTrack(state, track) };
};

/**
 * Put the session demo track back over a state that came from storage or a sync
 * result (which carries the persisted ai-runner). No session: the state is
 * returned untouched, so the signed-out path is unchanged.
 */
export const overlayLegacyMenuDemoSession = <T extends Pick<LegacyProgressionState, 'tracks'>>(
  state: T,
  session: LegacyMenuDemoSession | null | undefined
): T => (session == null ? state : withAiRunnerTrack(state, session.track));

/** True when a completed demo maze must stay in memory (a signed-in session demo). */
export const isLegacyMenuDemoSessionActive = (
  session: LegacyMenuDemoSession | null | undefined
): session is LegacyMenuDemoSession => session != null;

type LegacyProgressionStorage = Pick<Storage, 'getItem' | 'setItem'>;

const readStoredAiRunnerTrack = (raw: string | null): unknown => {
  if (raw === null) {
    return undefined;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && 'tracks' in parsed) {
      const tracks = (parsed as { tracks?: unknown }).tracks;
      if (tracks && typeof tracks === 'object' && 'ai-runner' in tracks) {
        return (tracks as Record<string, unknown>)['ai-runner'];
      }
    }
  } catch {
    // Unreadable stored state: fall through to the empty demo track.
  }
  return undefined;
};

/**
 * Wraps the account's progression storage while a session demo is active: any
 * progression write (a play completion, a sync result) keeps the ai-runner track
 * that was already stored, so the session demo's climb never reaches storage.
 * Reads and every other key pass straight through.
 */
export const createLegacyMenuDemoSessionProgressionStorage = (
  storage: LegacyProgressionStorage | undefined,
  progressionStorageKey: string
): LegacyProgressionStorage | undefined => {
  if (!storage) {
    return undefined;
  }
  return {
    getItem: (key: string) => storage.getItem(key),
    setItem: (key: string, value: string) => {
      if (key !== progressionStorageKey) {
        storage.setItem(key, value);
        return;
      }
      let next = value;
      try {
        const parsed: unknown = JSON.parse(value);
        if (parsed && typeof parsed === 'object' && 'tracks' in parsed) {
          const state = parsed as { tracks: Record<string, unknown> };
          const storedAi = readStoredAiRunnerTrack(storage.getItem(key))
            ?? createEmptyLegacyProgressionState().tracks['ai-runner'];
          next = JSON.stringify({ ...state, tracks: { ...state.tracks, 'ai-runner': storedAi } });
        }
      } catch {
        // Not a progression state we can read: write it as given.
      }
      storage.setItem(key, next);
    }
  };
};

/** After an in-memory demo completion, the session follows the advanced ai-runner track. */
export const advanceLegacyMenuDemoSession = (
  session: LegacyMenuDemoSession,
  state: Pick<LegacyProgressionState, 'tracks'>
): LegacyMenuDemoSession => (
  session.track === state.tracks['ai-runner'] ? session : { track: state.tracks['ai-runner'], userId: session.userId }
);
