/**
 * MAZER-MODE-002, look D: the controller for the DOM game-mode selector over the menu canvas. No Phaser, no scene
 * state: the scene says when the selector should be up (show / syncVisibility) and hands in callbacks.
 *
 * The selector, its CSS and the kit buttons load on demand (a dynamic import of src/ui/modeSelect/modeSelectMount.ts),
 * so the boot bundle does not grow; prefetch() warms that chunk while the menu idles, so the first Play opens at once.
 * Exactly one layer exists at a time: show() while up (or while the chunk loads) only refreshes the callbacks.
 */
import type { ModeSelectMountHandle, ModeSelectMountOptions } from '../ui/modeSelect/modeSelectMount';
import {
  LEGACY_MODE_SELECT_BACK_LABEL,
  LEGACY_MODE_SELECT_COMING_SOON_LABEL,
  LEGACY_MODE_SELECT_TITLE,
  resolveLegacyModeSelectPlayAction,
  type LegacyModeSelectItem
} from './legacyModeSelectPlan';

type MountModule = { mountModeSelect: (options: ModeSelectMountOptions) => ModeSelectMountHandle };

export interface LegacyModeSelectLayerShowOptions {
  readonly items: readonly LegacyModeSelectItem[];
  /** The entry the rail opens centred on (the current mode). */
  readonly initialIndex: number;
  readonly theme: 'default' | 'dark';
  readonly reducedMotion: boolean;
  readonly onPlay: (index: number) => void;
  readonly onBack: () => void;
  readonly onSelect: (index: number) => void;
}

export interface LegacyModeSelectLayerDeps {
  /** The chunk could not load (offline after an update): the scene falls back to starting the default mode. */
  onUnavailable: () => void;
  /** Test seam: replaces the dynamic import of the DOM mount. */
  loadMount?: () => Promise<MountModule>;
}

export interface LegacyModeSelectLayer {
  /** Puts the selector up (loading it first if needed). Idempotent while it is up or loading. */
  show: (options: LegacyModeSelectLayerShowOptions) => void;
  /** Takes the selector down, also cancelling a load in flight. */
  hide: () => void;
  /** visible false = hide (the scene calls this on every UI rebuild, like the menu dropdown). */
  syncVisibility: (visible: boolean) => void;
  /** True from show() until hide(). */
  isOpen: () => boolean;
  /** True while the DOM layer is actually on the page. */
  isMounted: () => boolean;
  /** Starts loading the chunk without showing anything (failures are silent; show() retries). */
  prefetch: () => void;
  /** Scene shutdown: hides, and ignores show() until activate(). */
  destroy: () => void;
  /** Re-arms after destroy (a restarted scene keeps its fields). */
  activate: () => void;
}

export const createLegacyModeSelectLayer = (deps: LegacyModeSelectLayerDeps): LegacyModeSelectLayer => {
  const load = deps.loadMount ?? (() => import('../ui/modeSelect/modeSelectMount'));
  let pending: Promise<MountModule> | null = null;
  let open = false;
  let destroyed = false;
  let handle: ModeSelectMountHandle | null = null;
  let current: LegacyModeSelectLayerShowOptions | null = null;
  let generation = 0;

  const loadOnce = (): Promise<MountModule> => {
    if (pending === null) {
      pending = load().catch((error: unknown) => {
        pending = null;
        throw error;
      });
    }
    return pending;
  };

  const hide = (): void => {
    open = false;
    generation += 1;
    current = null;
    const mounted = handle;
    handle = null;
    mounted?.close();
  };

  return {
    activate: () => {
      destroyed = false;
    },
    destroy: () => {
      destroyed = true;
      hide();
    },
    hide,
    isMounted: () => handle !== null,
    isOpen: () => open,
    prefetch: () => {
      void loadOnce().catch(() => undefined);
    },
    show: (options) => {
      if (destroyed) return;
      current = options;
      if (open) return;
      open = true;
      generation += 1;
      const ticket = generation;
      loadOnce().then(({ mountModeSelect }) => {
        if (!open || destroyed || ticket !== generation || current === null) return;
        const opts = current;
        handle = mountModeSelect({
          backLabel: LEGACY_MODE_SELECT_BACK_LABEL,
          comingSoonLabel: LEGACY_MODE_SELECT_COMING_SOON_LABEL,
          initialIndex: opts.initialIndex,
          items: opts.items,
          // The latest show() wins: callbacks are read at call time.
          onBack: () => current?.onBack(),
          onPlay: (index) => current?.onPlay(index),
          onSelect: (index) => current?.onSelect(index),
          reducedMotion: opts.reducedMotion,
          resolvePlay: (item) => resolveLegacyModeSelectPlayAction(item as LegacyModeSelectItem | undefined),
          theme: opts.theme,
          title: LEGACY_MODE_SELECT_TITLE
        });
      }).catch(() => {
        if (!open || destroyed || ticket !== generation) return;
        hide();
        deps.onUnavailable();
      });
    },
    syncVisibility: (visible) => {
      if (!visible && open) hide();
    }
  };
};
