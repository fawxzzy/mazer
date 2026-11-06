/**
 * Reset progress: pure flow for the main-menu Settings > Account button.
 *
 * Scope (owner decision, Zac 2026-11-06): resets the account's full maze
 * progression ONLY (levels and maze progress). It never touches the
 * account, profile, credentials, username, leaderboard identity or device
 * settings (game toggles, zoom). The server operation already exists and is
 * the one the Account screen's existing "Reset progress" uses:
 * `mazer_reset_progression(p_expected_revision, p_expected_user_id)` via
 * writeLegacyRemoteProgressionState(..., 'replace'). It resets BOTH the
 * player track and the menu-AI track (`menu-runner`) atomically, so the
 * client reset MUST cover both tracks too (a local-only player reset would be
 * re-inflated by the monotonic merge on the next load).
 *
 * This module holds only pure pieces: the state machine, the strategy
 * decision, the baseline state function and the local-effects plan. Nothing
 * here is wired; no Phaser, DOM, network or global storage. See
 * docs/ui/MAZER-SETTINGS-SHEET-SPEC-2026-11-06.md.
 */
import {
  compareLegacyProgressionOrdinals,
  createEmptyLegacyProgressionState,
  normalizeLegacyProgressionState,
  type LegacyProgressionState
} from './legacyProgression';

/* ------------------------------------------------------------------ */
/* Baseline state                                                      */
/* ------------------------------------------------------------------ */

const hasAnyProgress = (state: LegacyProgressionState): boolean => (
  Object.values(state.tracks).some((track) => compareLegacyProgressionOrdinals(track.completedCycles, '0') > 0
      || compareLegacyProgressionOrdinals(track.level, '1') > 0)
);

/**
 * Pure: the progression state after a reset. Both tracks (player and
 * menu-AI) go to the baseline, matching mazer_reset_progression. Built from
 * createEmptyLegacyProgressionState so the browser-only provenance sentinel
 * and baseline versions are the current ones (otherwise the read path would
 * fail the save closed).
 *
 * Idempotent and side-effect free: an already-baseline state is returned
 * (normalized) UNCHANGED, including `updatedAt`, so a second reset cannot
 * look like new unsynced local progress to the account-bootstrap merge.
 * Otherwise `updatedAt` is the supplied clock reading, never Date.now().
 */
export const resetLegacyProgressionState = (
  state: LegacyProgressionState,
  nowIso: string
): LegacyProgressionState => {
  const normalized = normalizeLegacyProgressionState(state);
  if (!hasAnyProgress(normalized)) {
    return normalized;
  }
  return normalizeLegacyProgressionState({
    ...createEmptyLegacyProgressionState(),
    updatedAt: nowIso
  });
};

/* ------------------------------------------------------------------ */
/* Strategy                                                            */
/* ------------------------------------------------------------------ */

export type LegacyProgressionResetScope = 'account' | 'device';

export type LegacyProgressionResetStrategy =
  /** Signed in with remote progression on: server first, then local. Local is untouched until the RPC succeeds. */
  | { kind: 'server-first'; scope: 'account' }
  /** Guest, or remote progression disabled: this device's per-user (or guest) key only. */
  | { kind: 'local-only'; scope: 'device' }
  /** Cannot reset right now; the confirm sheet must say why and offer only Cancel. */
  | { kind: 'blocked'; reason: 'offline' | 'session-pending' };

export interface LegacyProgressionResetStrategyInput {
  online: boolean;
  remoteProgressionEnabled: boolean;
  /** True while the auth session is still resolving (account not yet known). */
  sessionPending?: boolean;
  userId: string | null;
}

/**
 * Why server-first and not "reset local, sync later": the load-time merge
 * (mergeLegacyProgressionStateAdvancements) takes the per-track MAX of local
 * and remote. A local reset whose RPC never landed (offline, revision
 * conflict, tab closed) is silently undone by the next bootstrap. So an
 * account reset is refused offline instead of being faked.
 */
export const resolveLegacyProgressionResetStrategy = (
  input: LegacyProgressionResetStrategyInput
): LegacyProgressionResetStrategy => {
  if (input.sessionPending === true) {
    return { kind: 'blocked', reason: 'session-pending' };
  }
  if (input.userId === null || !input.remoteProgressionEnabled) {
    return { kind: 'local-only', scope: 'device' };
  }
  if (!input.online) {
    return { kind: 'blocked', reason: 'offline' };
  }
  return { kind: 'server-first', scope: 'account' };
};

/* ------------------------------------------------------------------ */
/* Local effects (what the wiring lane must apply after the server OK) */
/* ------------------------------------------------------------------ */

/**
 * Account-scoped storage key bases cleared/rewritten by a reset. They are the
 * literal values of LEGACY_PROGRESSION_STORAGE_KEY, LEGACY_REMOTE_COMPLETION_OUTBOX_STORAGE_KEY
 * and MAZE_CYCLE_TELEMETRY_STORAGE_KEY (a test pins equality). Each is read as
 * `<base>:<scope>` where scope is `user:<id>` or `guest`.
 *
 * NEVER in this list: mazer.game-toggles.v1 (device settings),
 * mazer.auth.* (credentials/identity), mazer.remote-account-sync.v1 (rewritten
 * by the RPC success path with the new revision, not cleared),
 * mazer.tutorial.acks.
 */
export const LEGACY_PROGRESSION_RESET_LOCAL_EFFECTS = Object.freeze([
  Object.freeze({ action: 'write-baseline' as const, keyBase: 'mazer.progression.v1' }),
  // Pending completions for the pre-reset levels must never replay into the freshly reset account.
  Object.freeze({ action: 'remove' as const, keyBase: 'mazer.remote-completion-outbox.v1' }),
  // Old run receipts would otherwise feed exact-gap recovery against the new baseline.
  Object.freeze({ action: 'remove' as const, keyBase: 'mazer.cycle-telemetry.v1' })
]);

export interface LegacyResetStorage {
  removeItem(key: string): void;
  setItem(key: string, value: string): void;
}

/**
 * Applies the local effects through an injected storage and key resolver
 * (the scene passes window.localStorage and resolveLegacyAuthScopedStorageKey
 * bound to the current auth snapshot). Returns the baseline state written.
 * Never throws: a failing storage reports `ok: false` so the caller can show
 * the failed state instead of claiming success.
 */
export const applyLegacyProgressionResetLocalEffects = (
  storage: LegacyResetStorage,
  resolveScopedKey: (keyBase: string) => string,
  nowIso: string
): { ok: boolean; state: LegacyProgressionState } => {
  const baseline = normalizeLegacyProgressionState({ ...createEmptyLegacyProgressionState(), updatedAt: nowIso });
  let ok = true;
  for (const effect of LEGACY_PROGRESSION_RESET_LOCAL_EFFECTS) {
    try {
      const key = resolveScopedKey(effect.keyBase);
      if (effect.action === 'write-baseline') {
        storage.setItem(key, JSON.stringify(baseline));
      } else {
        storage.removeItem(key);
      }
    } catch {
      ok = false;
    }
  }
  return { ok, state: baseline };
};

/* ------------------------------------------------------------------ */
/* Copy                                                                */
/* ------------------------------------------------------------------ */

/**
 * No rank vocabulary (rank letters are not shown anywhere; see the
 * rank-vocabulary guard) and no 'Skill'. The leaderboard sentence is accurate
 * because mazer_leaderboard_page orders by mazer_progression_states.player_level.
 */
export const LEGACY_PROGRESSION_RESET_COPY = Object.freeze({
  accountConsequence: 'Your level and leaderboard standing go back to Level 1. Your account, username and settings stay as they are. This can’t be undone.',
  blockedOffline: 'Connect to the internet to reset your account progress.',
  blockedSessionPending: 'Your account is still loading. Try again in a moment.',
  cancel: 'Cancel',
  close: 'Close',
  deviceConsequence: 'Your level on this device goes back to Level 1. Your settings stay as they are. This can’t be undone.',
  done: 'Progress reset. You are back at Level 1.',
  doneButton: 'Done',
  failedConflict: 'Progress changed on another device. Nothing was reset. Check your level and try again.',
  failedGeneric: 'Could not reset your progress. Nothing was changed.',
  menuButton: 'Reset progress',
  title: 'Reset progress?',
  working: 'Resetting…'
});

export const formatLegacyProgressionResetConfirmLabel = (): string => 'Reset to Level 1';

/* ------------------------------------------------------------------ */
/* State machine                                                       */
/* ------------------------------------------------------------------ */

/** Taps on Confirm are ignored this long after the sheet opened or its level changed (ghost/double-tap guard). */
export const LEGACY_PROGRESSION_RESET_ARM_DELAY_MS = 600;

export type LegacyProgressionResetFailure = 'conflict' | 'network' | 'unknown';

export type LegacyProgressionResetState =
  | { phase: 'idle' }
  | { phase: 'blocked'; reason: Extract<LegacyProgressionResetStrategy, { kind: 'blocked' }>['reason'] | 'run-active' }
  | { phase: 'confirm'; level: string; openedAtMs: number; scope: LegacyProgressionResetScope }
  | { phase: 'working'; level: string; scope: LegacyProgressionResetScope }
  | { phase: 'done'; previousLevel: string; scope: LegacyProgressionResetScope }
  | { phase: 'failed'; failure: LegacyProgressionResetFailure; level: string; scope: LegacyProgressionResetScope }
  | { phase: 'cancelled' };

export type LegacyProgressionResetEvent =
  /** User tapped Reset progress. `level` is the live player level as a decimal string. */
  | {
    type: 'request';
    level: string;
    nowMs: number;
    /** True while a run/attempt is active (the button is menu-only; this guards QA/bridge entry). */
    runActive: boolean;
    strategy: LegacyProgressionResetStrategy;
  }
  /** User tapped Cancel, pressed Back/Escape, or tapped the scrim. */
  | { type: 'cancel' }
  /** User tapped the destructive button. Ignored until armed. */
  | { type: 'confirm'; nowMs: number }
  /** The displayed level changed while the sheet was open (menu-AI or another tab). Re-arms. */
  | { type: 'level-changed'; level: string; nowMs: number }
  | { type: 'succeeded' }
  | { type: 'failed'; failure: LegacyProgressionResetFailure }
  /** Acknowledge a terminal state (done/cancelled/failed/blocked) and return to idle. */
  | { type: 'dismiss' };

/**
 * Maps the outcome of the awaited mazer_reset_progression call to a failure
 * kind. `null` means the call threw (no response at all). The RPC raises
 * 'Progression changed on another device (expected revision X, found Y)'
 * with errcode 40001 when the expected revision is stale; the sync result
 * carries only the message, so the revision conflict is recognised by it.
 */
export const classifyLegacyProgressionResetFailure = (
  result: { error: string | null } | null
): LegacyProgressionResetFailure => {
  if (result === null) {
    return 'network';
  }
  return /changed on another device/i.test(result.error ?? '') ? 'conflict' : 'unknown';
};

export const INITIAL_LEGACY_PROGRESSION_RESET_STATE: LegacyProgressionResetState = Object.freeze({ phase: 'idle' });

/**
 * Total reducer: every (state, event) pair is defined; invalid pairs return
 * the SAME state reference. `done` is reachable only from `working`, and
 * `working` only from an armed `confirm`, so a single tap can never reset.
 * Cancel is the default exit from every non-terminal phase except `working`
 * (an in-flight server call cannot be cancelled by the UI).
 */
export const reduceLegacyProgressionReset = (
  state: LegacyProgressionResetState,
  event: LegacyProgressionResetEvent
): LegacyProgressionResetState => {
  switch (event.type) {
    case 'request': {
      if (state.phase === 'working' || state.phase === 'confirm') {
        return state;
      }
      if (event.runActive) {
        return { phase: 'blocked', reason: 'run-active' };
      }
      if (event.strategy.kind === 'blocked') {
        return { phase: 'blocked', reason: event.strategy.reason };
      }
      return {
        level: event.level,
        openedAtMs: event.nowMs,
        phase: 'confirm',
        scope: event.strategy.scope
      };
    }
    case 'cancel':
      return state.phase === 'confirm' || state.phase === 'failed' || state.phase === 'blocked'
        ? { phase: 'cancelled' }
        : state;
    case 'confirm':
      if (state.phase !== 'confirm' || event.nowMs - state.openedAtMs < LEGACY_PROGRESSION_RESET_ARM_DELAY_MS) {
        return state;
      }
      return { level: state.level, phase: 'working', scope: state.scope };
    case 'level-changed':
      if (state.phase !== 'confirm' || state.level === event.level) {
        return state;
      }
      return { ...state, level: event.level, openedAtMs: event.nowMs };
    case 'succeeded':
      return state.phase === 'working'
        ? { phase: 'done', previousLevel: state.level, scope: state.scope }
        : state;
    case 'failed':
      return state.phase === 'working'
        ? { failure: event.failure, level: state.level, phase: 'failed', scope: state.scope }
        : state;
    case 'dismiss':
      return state.phase === 'done' || state.phase === 'cancelled' || state.phase === 'failed' || state.phase === 'blocked'
        ? INITIAL_LEGACY_PROGRESSION_RESET_STATE
        : state;
    default:
      return event satisfies never;
  }
};

/* ------------------------------------------------------------------ */
/* Confirm view                                                        */
/* ------------------------------------------------------------------ */

export interface LegacyProgressionResetConfirmView {
  title: string;
  /** Always shows the level being lost, e.g. "Level 42 -> Level 1". */
  levelLine: string;
  consequence: string;
  /** Cancel is first, is the default focus, and carries the primary emphasis. */
  buttons: readonly [
    { id: 'cancel'; label: string; emphasis: 'primary'; isDefault: true; enabled: true },
    { id: 'confirm'; label: string; emphasis: 'danger'; isDefault: false; enabled: boolean }
  ];
}

/**
 * View for phase === 'confirm' (and 'working', where both buttons are
 * disabled). `nowMs` drives the armed flag so the destructive button visibly
 * enables only after the arm delay.
 */
export const buildLegacyProgressionResetConfirmView = (
  state: Extract<LegacyProgressionResetState, { phase: 'confirm' | 'working' }>,
  nowMs: number
): LegacyProgressionResetConfirmView => {
  const armed = state.phase === 'confirm' && nowMs - state.openedAtMs >= LEGACY_PROGRESSION_RESET_ARM_DELAY_MS;
  return {
    buttons: [
      { emphasis: 'primary', enabled: true, id: 'cancel', isDefault: true, label: LEGACY_PROGRESSION_RESET_COPY.cancel },
      { emphasis: 'danger', enabled: armed, id: 'confirm', isDefault: false, label: formatLegacyProgressionResetConfirmLabel() }
    ],
    consequence: state.scope === 'account'
      ? LEGACY_PROGRESSION_RESET_COPY.accountConsequence
      : LEGACY_PROGRESSION_RESET_COPY.deviceConsequence,
    levelLine: `Level ${state.level} → Level 1`,
    title: LEGACY_PROGRESSION_RESET_COPY.title
  };
};

/** Player-facing line for terminal / blocked phases. */
export const resolveLegacyProgressionResetStatusLine = (
  state: Extract<LegacyProgressionResetState, { phase: 'blocked' | 'done' | 'failed' }>
): string => {
  if (state.phase === 'done') {
    return LEGACY_PROGRESSION_RESET_COPY.done;
  }
  if (state.phase === 'failed') {
    return state.failure === 'conflict'
      ? LEGACY_PROGRESSION_RESET_COPY.failedConflict
      : LEGACY_PROGRESSION_RESET_COPY.failedGeneric;
  }
  return state.reason === 'offline'
    ? LEGACY_PROGRESSION_RESET_COPY.blockedOffline
    : state.reason === 'session-pending'
      ? LEGACY_PROGRESSION_RESET_COPY.blockedSessionPending
      : LEGACY_PROGRESSION_RESET_COPY.failedGeneric;
};
