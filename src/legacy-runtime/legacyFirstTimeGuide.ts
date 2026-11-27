/**
 * First-time cards: the Guide's "met set" read (spec D9, section 7; Zac's Guide pick "E Full set", 2026-11-27).
 * Pure: it reads the seen/met record through the store it is given and returns what the Guide should hide and which
 * rows get a "New" pill. No drawing; the Guide call site wires it in a later slice (slice 4).
 *
 * - Flag off (no store): returns null, and the Guide is built exactly as today (byte-identical sheet).
 * - Flag on: the Wrap and Switch rows stay hidden until their card was seen or the mechanic touched (met), so the Guide
 *   never spoils. The hazard rows already hide until met (legacyHazardOnboarding.ts) and are not filtered here.
 * - "All tips" (`showAll`) hides nothing. "Show tips again" clears the record (session.showTipsAgain), so the rows
 *   hide again, as after a progress reset (D7).
 * - "New" pill: a mechanic row that is met (or seen) and that the Guide has not shown with a pill yet. The Guide marks
 *   the rows it showed (`store.markGuideRowsViewed`) when it closes.
 */
import { LEGACY_FIRST_TIME_CARDS, type FirstTimeCardId } from './legacyFirstTimeCards';
import type { LegacyGuideRow } from './legacyGuideContent';
import type { LegacyFirstTimeStore } from './legacyFirstTimeStore';

type GuideRowId = LegacyGuideRow['id'];

/** Guide rows hidden until met, and the card whose mechanic unlocks each. */
export const FIRST_TIME_GATED_GUIDE_ROWS: Readonly<Partial<Record<GuideRowId, FirstTimeCardId>>> = Object.freeze({
  wrap: 'mechanic.wrap',
  'bleed-gate': 'mechanic.switch'
});

/** Rows that can carry a "New" pill: every mechanic card's row. */
const PILL_CARDS = LEGACY_FIRST_TIME_CARDS.filter((card) => card.id.startsWith('mechanic.'));

/** Guide foot actions and the row pill (Zac's pick E: "All tips" and "Show tips again" at the Guide foot). */
export const LEGACY_FIRST_TIME_GUIDE_LABELS = Object.freeze({
  newPill: 'New',
  allTips: 'All tips',
  showTipsAgain: 'Show tips again'
});

export interface LegacyFirstTimeGuideView {
  readonly hiddenRowIds: ReadonlySet<GuideRowId>;
  readonly newRowIds: ReadonlySet<GuideRowId>;
}

export interface LegacyFirstTimeGuideViewOptions {
  /** The session's record; null while the flag is off. */
  readonly store: Pick<LegacyFirstTimeStore, 'isSeen' | 'isMet' | 'isGuideRowViewed'> | null;
  readonly showAll?: boolean;
}

export const resolveLegacyFirstTimeGuideView = (options: LegacyFirstTimeGuideViewOptions): LegacyFirstTimeGuideView | null => {
  const store = options.store;
  if (store === null) return null;
  const known = (cardId: FirstTimeCardId): boolean => {
    const card = LEGACY_FIRST_TIME_CARDS.find((entry) => entry.id === cardId)!;
    return store.isSeen(card.token) || store.isMet(cardId);
  };
  const hiddenRowIds = new Set<GuideRowId>();
  if (options.showAll !== true) {
    for (const [rowId, cardId] of Object.entries(FIRST_TIME_GATED_GUIDE_ROWS) as [GuideRowId, FirstTimeCardId][]) {
      if (!known(cardId)) hiddenRowIds.add(rowId);
    }
  }
  const newRowIds = new Set<GuideRowId>();
  for (const card of PILL_CARDS) {
    if (known(card.id) && !store.isGuideRowViewed(card.guideRowId)) newRowIds.add(card.guideRowId);
  }
  return { hiddenRowIds, newRowIds };
};
