/**
 * Help screen (MAZER-ONB-001 family): opens the Help sheet from the Menu's Help row. No Phaser, no scene state: the
 * scene hands in what it knows (level, mode, whether "All tips" has anything to show) and callbacks.
 *
 * Help is for every player, signed in or not (the RPC takes the anon key too), so there is no auth gate here. The row
 * only exists while the Help flag is on (legacyHelpFlag.ts: `?lab=help`, build default off); isEnabled() answers that
 * once per scene life. The sheet, its CSS and the kit load on demand (a dynamic import): nothing joins the boot bundle.
 */
import { buildHelpPayload, type HelpDraft, type HelpSubmitResult } from '../ui/help/helpState';
import type { HelpMountHandle, HelpMountOptions } from '../ui/help/helpMount';
import { resolveLegacyFeedbackContext } from './legacyFeedbackLauncher';
import { resolveHelpScreenEnabled } from './legacyHelpFlag';
import { submitLegacyHelpRequest } from './legacyHelpSubmit';

export interface LegacyHelpContextInput {
  /** The player-track level as the scene knows it (an ordinal string or number); anything unusable becomes null. */
  readonly level: unknown;
  readonly gameMode: string | null;
}

export interface LegacyHelpOpenHooks {
  /** "All tips" label when the first-time Guide hides tips right now; null = no All tips block. */
  allTipsLabel?: string | null;
  /** Pressed "All tips": the sheet is already gone; the scene opens the Guide showing every tip. */
  onAllTips?: () => void;
  /** The shard answer shows only while shards can appear (the hazard layer). */
  includeShards?: boolean;
}

export interface LegacyHelpLauncherDeps {
  /** Called after the sheet is gone (the scene marks its UI dirty so what it hid comes back). */
  onClosed: () => void;
  isDarkTheme?: () => boolean;
  /** Test seam: the flag (defaults to resolveHelpScreenEnabled() on the live URL and storage). */
  isEnabled?: () => boolean;
  /** Test seam: replaces the dynamic import of the DOM mount. */
  loadMount?: () => Promise<{ mountHelpPopup: (options: HelpMountOptions) => HelpMountHandle }>;
  /** Test seam: replaces the RPC wrapper. */
  submit?: (payload: ReturnType<typeof buildHelpPayload>) => Promise<HelpSubmitResult>;
}

export interface LegacyHelpLauncher {
  /** The Help flag (cached for this launcher's life). */
  isEnabled: () => boolean;
  /** True from the moment open() is accepted until the sheet is gone. The scene hides what sits behind it. */
  isOpen: () => boolean;
  open: (context: LegacyHelpContextInput, hooks?: LegacyHelpOpenHooks) => boolean;
  /** Closes the sheet if open (scene shutdown). Never calls onClosed after destroy. */
  destroy: () => void;
  /** Re-arms the launcher after a destroy (a restarted scene keeps its fields). */
  activate: () => void;
}

export const createLegacyHelpLauncher = (deps: LegacyHelpLauncherDeps): LegacyHelpLauncher => {
  let open = false;
  let destroyed = false;
  let handle: HelpMountHandle | null = null;
  let enabled: boolean | null = null;

  const finish = (): void => {
    if (!open) return;
    open = false;
    handle = null;
    if (!destroyed) deps.onClosed();
  };

  const isEnabled = (): boolean => {
    if (enabled === null) {
      try {
        enabled = (deps.isEnabled ?? (() => resolveHelpScreenEnabled()))();
      } catch {
        enabled = false;
      }
    }
    return enabled;
  };

  const loadMount = deps.loadMount ?? (() => import('../ui/help/helpMount'));
  const send = deps.submit ?? ((payload) => submitLegacyHelpRequest(payload));

  return {
    activate: () => {
      destroyed = false;
    },
    destroy: () => {
      destroyed = true;
      const current = handle;
      open = false;
      handle = null;
      current?.close();
    },
    isEnabled,
    isOpen: () => open,
    open: (context, hooks = {}) => {
      if (open || destroyed || !isEnabled()) return false;
      open = true;
      // Same validated context as the rating popup (raw ordinal level, mode shape, build id): junk becomes null.
      const resolved = resolveLegacyFeedbackContext({ gameMode: context.gameMode, level: context.level, source: 'menu' });
      void loadMount().then(({ mountHelpPopup }) => {
        if (!open || destroyed) return;
        handle = mountHelpPopup({
          allTipsLabel: hooks.allTipsLabel ?? null,
          includeShards: hooks.includeShards === true,
          onAllTips: hooks.onAllTips,
          onClose: finish,
          submit: (draft: HelpDraft) => send(buildHelpPayload(draft, resolved)),
          theme: deps.isDarkTheme?.() === true ? 'dark' : 'default'
        });
      }).catch(() => {
        // A failed chunk load (offline) just means no sheet: the game is untouched.
        finish();
      });
      return true;
    }
  };
};
