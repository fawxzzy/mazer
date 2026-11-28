/**
 * First-time cards session (spec slice 1): wires the flag, the seen/met record and the pure state machine into the one
 * object the scene glue (a later slice, legacyFirstTimeHost.ts) talks to. No UI here.
 *
 * - Flag off (the build default): an inert session. It holds no record, never asks for storage, never reads or writes
 *   a key (the flag itself only reads its own lab key) and never returns a card, so nothing can be drawn.
 * - Flag on: storage comes from the scene (`resolveSceneStorage`, the scene's resolveBrowserLocalStorage, P3), and is
 *   asked for lazily, at the first call that needs it.
 * - Level Preview (`?previewLevel=N` or the hazard lab jump): the session ignores the scene storage and keeps its record
 *   in memory, so a preview run never writes to the device even if the caller passes the real storage (defence in
 *   depth on top of the scene's own preview sandbox). A preview at L200 plays as a brand-new account.
 */
import type { TutorialStorage } from '../tutorial/tutorialAckStore.ts';
import {
  LEGACY_FIRST_TIME_LIVE_CARD_IDS,
  beginFirstTimeLevel,
  createFirstTimeCardsState,
  decideFirstTimeTouch,
  resolveFirstTimeCard,
  resolveFirstTimeDismiss,
  type FirstTimeCard,
  type FirstTimeCardId,
  type FirstTimeDismissOutcome,
  type FirstTimeDismissReason,
  type FirstTimeTouchKind
} from './legacyFirstTimeCards';
import { resolveFirstTimeCardsState, type FirstTimeCardsSource, type FirstTimeFlagStorage } from './legacyFirstTimeFlag';
import { createLegacyFirstTimeStore, type LegacyFirstTimeStore } from './legacyFirstTimeStore';
import { createLegacyLevelPreviewStorage } from './legacyLevelPreview';

export interface LegacyFirstTimeSessionOptions {
  /** `window.location.search`. */
  readonly search?: string | URLSearchParams | null;
  /** The REAL device storage, used ONLY for the flag's own lab key. */
  readonly deviceStorage?: FirstTimeFlagStorage | null;
  /** The scene's storage resolver (MenuScene.resolveBrowserLocalStorage). Never called while the flag is off. */
  readonly resolveSceneStorage?: () => TutorialStorage | null | undefined;
  /** Auth scope of the record: `user:<id>` or `guest` (resolveLegacyAuthStorageScope). */
  readonly scope: string;
  readonly liveCardIds?: readonly FirstTimeCardId[];
  /**
   * Another record that also counts a card as seen (R5): the host passes the hazard exposure record's `introsShown`, so
   * a player who already had the old shard hint or Pulse Gate intro card never sees that mechanic's card again.
   */
  readonly isSeenElsewhere?: (card: FirstTimeCard) => boolean;
  readonly buildDefault?: boolean;
  readonly now?: () => string;
}

export interface LegacyFirstTimeDismissEvent {
  readonly card: FirstTimeCard;
  readonly outcome: FirstTimeDismissOutcome;
}

export interface LegacyFirstTimeSession {
  readonly enabled: boolean;
  readonly source: FirstTimeCardsSource;
  readonly preview: boolean;
  /** A level starts: a card still up ends as a level end (acked only if it was up 800 ms), the level slot frees. */
  startLevel(nowMs: number): LegacyFirstTimeDismissEvent | null;
  /** The player touched one or more mechanics on one step. Returns the card to show now, or null. */
  touch(touches: readonly FirstTimeTouchKind[], nowMs: number): FirstTimeCard | null;
  dismiss(reason: FirstTimeDismissReason, nowMs: number): LegacyFirstTimeDismissEvent | null;
  activeCard(): FirstTimeCard | null;
  /** The record for the Guide read (legacyFirstTimeGuide.ts). Null while the flag is off. */
  store(): LegacyFirstTimeStore | null;
  /** "Show tips again": remove this account's seen and met record. No-op while the flag is off. */
  showTipsAgain(): void;
}

const createInertSession = (source: FirstTimeCardsSource, preview: boolean): LegacyFirstTimeSession => ({
  enabled: false,
  source,
  preview,
  startLevel: () => null,
  touch: () => null,
  dismiss: () => null,
  activeCard: () => null,
  store: () => null,
  showTipsAgain: () => undefined
});

export const createLegacyFirstTimeSession = (options: LegacyFirstTimeSessionOptions): LegacyFirstTimeSession => {
  const flag = resolveFirstTimeCardsState({
    search: options.search,
    storage: options.deviceStorage,
    buildDefault: options.buildDefault
  });
  if (!flag.enabled) return createInertSession(flag.source, flag.preview);

  const liveCardIds = options.liveCardIds ?? LEGACY_FIRST_TIME_LIVE_CARD_IDS;
  let record: LegacyFirstTimeStore | null = null;
  const getStore = (): LegacyFirstTimeStore => {
    if (record === null) {
      const storage = flag.preview
        ? createLegacyLevelPreviewStorage()
        : (options.resolveSceneStorage?.() ?? createLegacyLevelPreviewStorage());
      record = createLegacyFirstTimeStore({ storage, scope: options.scope, now: options.now });
    }
    return record;
  };

  let state = createFirstTimeCardsState();
  const applyDismiss = (result: ReturnType<typeof resolveFirstTimeDismiss>): LegacyFirstTimeDismissEvent | null => {
    state = result.state;
    if (result.cardId === null || result.outcome === null) return null;
    const card = resolveFirstTimeCard(result.cardId);
    if (result.outcome === 'acked') getStore().markSeen(card.token);
    return { card, outcome: result.outcome };
  };

  return {
    enabled: true,
    source: flag.source,
    preview: flag.preview,
    startLevel: (nowMs) => applyDismiss(beginFirstTimeLevel(state, nowMs)),
    touch: (touches, nowMs) => {
      const store = getStore();
      const isSeen = (card: FirstTimeCard): boolean => store.isSeen(card.token) || options.isSeenElsewhere?.(card) === true;
      const result = decideFirstTimeTouch(state, { touches, nowMs, liveCardIds, isSeen });
      for (const id of result.met) store.markMet(id);
      state = result.state;
      return result.fire;
    },
    dismiss: (reason, nowMs) => applyDismiss(resolveFirstTimeDismiss(state, reason, nowMs)),
    activeCard: () => (state.active === null ? null : resolveFirstTimeCard(state.active.cardId)),
    store: () => getStore(),
    showTipsAgain: () => getStore().clear()
  };
};
