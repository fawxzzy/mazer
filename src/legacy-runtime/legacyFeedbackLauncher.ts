/**
 * MAZER-FB-001: opens the in-game feedback popup from the Menu's Feedback row. No Phaser, no scene state: the scene
 * hands in what it knows (auth, level, mode) and a callback for when the popup is gone.
 *
 * Settled rules (owner, 2026-11-23/24): the Menu row is the ONLY entry (no auto prompt); the row and the popup are for a
 * signed-in player only (the RPC is signed-in only); the popup opens with no star picked; failures are an in-flow
 * notice, never red text, and never lose the draft.
 *
 * The popup, its CSS and the kit buttons load on demand (a dynamic import), so the boot bundle does not grow.
 */
import { buildFeedbackPayload, type FeedbackDraft, type FeedbackSource, type FeedbackSubmitResult } from '../ui/feedback/feedbackState';
import type { FeedbackMountHandle, FeedbackMountOptions } from '../ui/feedback/feedbackMount';
import { resolveLegacyBuildId } from './legacyBuildId';
import { submitLegacyFeedback } from './legacyFeedbackSubmit';
import type { LegacyAuthSessionSnapshot } from './legacyAuth';

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
  const level = typeof input.level === 'string' && /^\d{1,7}$/.test(input.level.trim())
    ? Number(input.level.trim())
    : typeof input.level === 'number' ? input.level : Number.NaN;
  return {
    buildId: resolveLegacyBuildId(),
    gameMode: input.gameMode !== null && GAME_MODE_PATTERN.test(input.gameMode) ? input.gameMode : null,
    playerLevel: Number.isInteger(level) && level >= 0 && level <= LEGACY_FEEDBACK_MAX_LEVEL ? level : null,
    source: input.source
  };
};

/** The Feedback row shows only for a signed-in player (menu row only, no auto prompt). */
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

export interface LegacyFeedbackLauncher {
  /** True from the moment open() is accepted until the popup is gone. The scene hides what sits behind it. */
  isOpen: () => boolean;
  open: (context: LegacyFeedbackContextInput) => boolean;
  /** Closes the popup if open (scene shutdown). Never calls onClosed after destroy. */
  destroy: () => void;
}

export const createLegacyFeedbackLauncher = (deps: LegacyFeedbackLauncherDeps): LegacyFeedbackLauncher => {
  let open = false;
  let destroyed = false;
  let handle: FeedbackMountHandle | null = null;

  const finish = (): void => {
    if (!open) return;
    open = false;
    handle = null;
    if (!destroyed) deps.onClosed();
  };

  const loadMount = deps.loadMount ?? (() => import('../ui/feedback/feedbackMount'));
  const send = deps.submit ?? ((payload, auth) => submitLegacyFeedback(payload, auth));

  return {
    destroy: () => {
      destroyed = true;
      const current = handle;
      open = false;
      handle = null;
      current?.close();
    },
    isOpen: () => open,
    open: (context) => {
      if (open || destroyed || !isLegacyFeedbackAvailable(deps.getAuthSnapshot())) {
        return false;
      }
      open = true;
      const resolved = resolveLegacyFeedbackContext(context);
      void loadMount().then(({ mountFeedbackPopup }) => {
        if (!open || destroyed) return;
        handle = mountFeedbackPopup({
          onClose: finish,
          submit: (draft: FeedbackDraft) => send(buildFeedbackPayload(draft, resolved), deps.getAuthSnapshot()),
          theme: deps.isDarkTheme?.() === true ? 'dark' : 'default'
        });
      }).catch(() => {
        // A failed chunk load (offline) just means no popup: the row stays, the game is untouched.
        finish();
      });
      return true;
    }
  };
};
