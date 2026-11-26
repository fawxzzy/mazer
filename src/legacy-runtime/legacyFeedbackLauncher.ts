/**
 * MAZER-FB-001: opens the in-game 1-5 star rating popup. No Phaser, no scene state: the scene hands in what it knows
 * (auth, level, mode) and a callback for when the popup is gone.
 *
 * Settled rules (owner, 2026-11-23/24/25): Feedback is a RATING, not a bug report. There is no Menu row any more
 * (2026-11-25): the only entry is the rating prompt on main-menu entry (legacyRatingPrompt.ts decides when). The popup
 * is for a signed-in player only (the RPC is signed-in only); it opens with no star picked; failures are an in-flow
 * notice, never red text, and never lose the draft.
 *
 * The popup, its CSS and the kit buttons load on demand (a dynamic import), so the boot bundle does not grow.
 */
import { buildFeedbackPayload, type FeedbackDraft, type FeedbackSource, type FeedbackSubmitResult } from '../ui/feedback/feedbackState';
import type { FeedbackMountHandle, FeedbackMountOptions } from '../ui/feedback/feedbackMount';
import { resolveLegacyBuildId } from './legacyBuildId';
import { submitLegacyFeedback } from './legacyFeedbackSubmit';
import type { LegacyAuthSessionSnapshot } from './legacyAuth';
import { resolveLegacyProgressionOrdinal } from './legacyProgression';

/** Mirrors the database check: level 0..1000000 (whole number), game_mode ^[a-z][a-z0-9_]{0,31}$. */
export const LEGACY_FEEDBACK_MAX_LEVEL = 1_000_000;
const GAME_MODE_PATTERN = /^[a-z][a-z0-9_]{0,31}$/;

export interface LegacyFeedbackContextInput {
  readonly source: FeedbackSource;
  /** The player-track level as the scene knows it (an ordinal string or number); anything unusable becomes null. */
  readonly level: unknown;
  readonly gameMode: string | null;
}

export const resolveLegacyFeedbackContext = (
  input: LegacyFeedbackContextInput
): { buildId: string | null; playerLevel: number | null; gameMode: string | null; source: FeedbackSource } => {
  // The raw (canonical, lossless) ordinal: never a display string, whose thousands separator ("1,234") would turn
  // every level from 1000 up into null. Junk becomes null here, never a silent 0.
  const ordinal = resolveLegacyProgressionOrdinal(typeof input.level === 'string' ? input.level.trim() : input.level);
  const level = ordinal !== null && ordinal.length <= 7 ? Number(ordinal) : Number.NaN;
  return {
    buildId: resolveLegacyBuildId(),
    gameMode: input.gameMode !== null && GAME_MODE_PATTERN.test(input.gameMode) ? input.gameMode : null,
    playerLevel: Number.isInteger(level) && level >= 0 && level <= LEGACY_FEEDBACK_MAX_LEVEL ? level : null,
    source: input.source
  };
};

/** The rating popup is offered only to a signed-in player. */
export const isLegacyFeedbackAvailable = (snapshot: Pick<LegacyAuthSessionSnapshot, 'status'>): boolean => (
  snapshot.status === 'authenticated'
);

export interface LegacyFeedbackLauncherDeps {
  getAuthSnapshot: () => Pick<LegacyAuthSessionSnapshot, 'status' | 'userId'>;
  /** Called after the popup is gone (the scene marks its UI dirty so a hidden dropdown comes back). */
  onClosed: () => void;
  isDarkTheme?: () => boolean;
  /** Test seam: replaces the dynamic import of the DOM mount. */
  loadMount?: () => Promise<{ mountFeedbackPopup: (options: FeedbackMountOptions) => FeedbackMountHandle }>;
  /** Test seam: replaces the RPC wrapper. */
  submit?: (payload: ReturnType<typeof buildFeedbackPayload>, auth: Pick<LegacyAuthSessionSnapshot, 'status' | 'userId'>) => Promise<FeedbackSubmitResult>;
}

/** Per-open hooks: the rating prompt records a saved rating and a close without one (legacyRatingPrompt.ts). */
export interface LegacyFeedbackOpenHooks {
  /** Every submit outcome, with the auth snapshot the submit went out under. */
  onSubmitResult?: (result: FeedbackSubmitResult, auth: Pick<LegacyAuthSessionSnapshot, 'status' | 'userId'>) => void;
  /** After the popup is gone (also on a scene shutdown). shown false = it never appeared (the chunk failed to load). */
  onClosed?: (info: { shown: boolean }) => void;
}

export interface LegacyFeedbackLauncher {
  /** True from the moment open() is accepted until the popup is gone. The scene hides what sits behind it. */
  isOpen: () => boolean;
  open: (context: LegacyFeedbackContextInput, hooks?: LegacyFeedbackOpenHooks) => boolean;
  /** Closes the popup if open (scene shutdown). Never calls onClosed after destroy. */
  destroy: () => void;
  /** Re-arms the launcher after a destroy: the scene calls it from create(), since a restarted scene keeps its fields. */
  activate: () => void;
}

export const createLegacyFeedbackLauncher = (deps: LegacyFeedbackLauncherDeps): LegacyFeedbackLauncher => {
  let open = false;
  let destroyed = false;
  let handle: FeedbackMountHandle | null = null;
  let hooks: LegacyFeedbackOpenHooks = {};
  let shown = false;

  const takeHooks = (): LegacyFeedbackOpenHooks => {
    const current = hooks;
    hooks = {};
    return current;
  };

  const finish = (): void => {
    if (!open) return;
    open = false;
    handle = null;
    takeHooks().onClosed?.({ shown });
    if (!destroyed) deps.onClosed();
  };

  const loadMount = deps.loadMount ?? (() => import('../ui/feedback/feedbackMount'));
  const send = deps.submit ?? ((payload, auth) => submitLegacyFeedback(payload, auth));

  return {
    activate: () => {
      destroyed = false;
    },
    destroy: () => {
      destroyed = true;
      const current = handle;
      const wasOpen = open;
      const currentHooks = takeHooks();
      open = false;
      handle = null;
      current?.close();
      // A scene shutdown with the popup up is a close without a rating (never a saved one).
      if (wasOpen) currentHooks.onClosed?.({ shown });
    },
    isOpen: () => open,
    open: (context, openHooks = {}) => {
      if (open || destroyed || !isLegacyFeedbackAvailable(deps.getAuthSnapshot())) {
        return false;
      }
      open = true;
      shown = false;
      hooks = openHooks;
      const onSubmitResult = openHooks.onSubmitResult;
      const resolved = resolveLegacyFeedbackContext(context);
      void loadMount().then(({ mountFeedbackPopup }) => {
        if (!open || destroyed) return;
        shown = true;
        handle = mountFeedbackPopup({
          onClose: finish,
          submit: (draft: FeedbackDraft) => {
            const auth = deps.getAuthSnapshot();
            return send(buildFeedbackPayload(draft, resolved), auth).then((result) => {
              onSubmitResult?.(result, auth);
              return result;
            });
          },
          theme: deps.isDarkTheme?.() === true ? 'dark' : 'default'
        });
      }).catch(() => {
        // A failed chunk load (offline) just means no popup (shown stays false): the game is untouched.
        finish();
      });
      return true;
    }
  };
};
