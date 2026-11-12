/**
 * Pure rules for the signed-in player's username as the menu scene holds it
 * (MAZER-ACCT-019 and MAZER-ACCT-021). No Phaser, no DOM, no network.
 *
 * Two facts the scene has to reconcile:
 *
 * 1. The username the scene reads (`readLegacyAccountUsername`) is read ONCE per
 *    signed-in user. During an in-session sign-in that read can run before the
 *    profile row exists (the profile is created a moment later by the sign-in
 *    bootstrap through mazer_ensure_profile). The empty answer then stuck, and
 *    the Leaderboard stayed on the `Choose a username` gate until a reload.
 *    `shouldRereadLegacyUsernameAfterProfileCreate` says when ONE more read is due.
 *
 * 2. The header label shows the auth snapshot's `canonicalUsername` (the sign-in
 *    metadata name), which a rename never updates. `applyLegacyUsernameRenameToSnapshot`
 *    carries a saved rename into the snapshot so the header follows it at once, and
 *    keeps it there when the auth layer later hands the scene a fresh snapshot.
 */
import type { LegacyAuthSessionSnapshot } from './legacyAuth';

export interface LegacyUsernameRereadInput {
  /** The signed-in user the profile bootstrap just finished for. */
  userId: string | null;
  /** The user the scene last started a username read for (null when none has started). */
  loadedForUserId: string | null;
  /** The username the scene holds right now ('' when the read found none). */
  savedValue: string;
  /** The user a re-read was already done for in this session (one re-read per user). */
  rereadForUserId: string | null;
}

/**
 * True when the username read that already ran may have seen no profile yet:
 * a read was started for this user, it left no name, and no re-read was done.
 * A user who already has a name, a user whose first read has not started (it will
 * run after the profile exists anyway) and a user who was already re-read are all
 * left alone, so signed-out and already-named paths are unchanged and a
 * persistently empty answer can never become a request loop.
 */
export const shouldRereadLegacyUsernameAfterProfileCreate = (
  input: LegacyUsernameRereadInput
): boolean => (
  input.userId !== null
  && input.loadedForUserId === input.userId
  && input.savedValue.trim().length === 0
  && input.rereadForUserId !== input.userId
);

export interface LegacyUsernameRename {
  userId: string;
  username: string;
}

/**
 * The snapshot with a rename saved this session applied to its canonical username.
 * Only an authenticated snapshot of the same user is touched; anything else (no rename,
 * signed out, another account) is returned as is, so those paths are unchanged.
 */
export const applyLegacyUsernameRenameToSnapshot = (
  snapshot: LegacyAuthSessionSnapshot,
  rename: LegacyUsernameRename | null
): LegacyAuthSessionSnapshot => {
  const username = rename?.username.trim() ?? '';
  if (
    rename === null
    || username.length === 0
    || snapshot.status !== 'authenticated'
    || snapshot.userId !== rename.userId
    || snapshot.canonicalUsername === username
  ) {
    return snapshot;
  }
  return { ...snapshot, canonicalUsername: username };
};
