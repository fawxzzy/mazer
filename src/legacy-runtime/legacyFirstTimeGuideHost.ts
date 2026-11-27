/**
 * First-time cards slice 4 (spec D9 and section 7, section 8 item 5; Zac's Guide pick E "Full set", 2026-11-27): the
 * Guide's glue, behind `?lab=firsttime`. MenuScene (a Wave 5C file) calls three functions from here and nothing else:
 *
 * - `resolveLegacyFirstTimeGuideSheetOptions(scene)` when it builds the Guide model: undefined while the flag is off (the
 *   sheet is exactly today's), else the rows to hide (Wrap and Switch until met), the rows with a "New" pill, and the
 *   foot actions.
 * - `runLegacyFirstTimeGuideFootAction(scene, id)` from the foot buttons: "All tips" shows every row until the Guide
 *   closes (the Help tab is not on main, so the link sits at the Guide foot, spec section 7); "Show tips again" clears
 *   this account's seen record (session.showTipsAgain: the cards show again and the rows hide again, as after a
 *   progress reset; the level-1 device hint is untouched).
 * - `noteLegacyFirstTimeGuideClosed(scene)` when the Guide closes: the rows it showed with a pill count as viewed, and
 *   "All tips" resets.
 *
 * The session is the card host's own (legacyFirstTimeSceneSession.ts), so on a preview route the Guide sees what the
 * cards wrote to the in-memory record.
 */
import {
  LEGACY_FIRST_TIME_GUIDE_LABELS,
  resolveLegacyFirstTimeGuideView
} from './legacyFirstTimeGuide';
import { resolveLegacyFirstTimeSceneSession } from './legacyFirstTimeSceneSession';
import type {
  LegacyGuideFirstTimeSheetOptions,
  LegacyGuideFootAction,
  LegacyGuideFootActionId
} from './legacyGuideContent';

interface GuideState {
  showAll: boolean;
  /** The rows shown with a "New" pill since the Guide opened (marked viewed when it closes). */
  pilled: Set<string>;
}

const guideStates = new WeakMap<object, GuideState>();

/** Pure: the foot actions for this view. "All tips" only while something is hidden; "Show tips again" always. */
export const resolveLegacyFirstTimeGuideFootActions = (hiddenCount: number): readonly LegacyGuideFootAction[] => [
  ...(hiddenCount > 0 ? [{ id: 'all-tips' as const, label: LEGACY_FIRST_TIME_GUIDE_LABELS.allTips }] : []),
  { id: 'show-tips-again', label: LEGACY_FIRST_TIME_GUIDE_LABELS.showTipsAgain }
];

export const resolveLegacyFirstTimeGuideSheetOptions = (scene: object): LegacyGuideFirstTimeSheetOptions | undefined => {
  const session = resolveLegacyFirstTimeSceneSession(scene);
  const store = session.enabled ? session.store() : null;
  if (store === null) return undefined;
  let state = guideStates.get(scene);
  if (state === undefined) {
    state = { showAll: false, pilled: new Set() };
    guideStates.set(scene, state);
  }
  const view = resolveLegacyFirstTimeGuideView({ store, showAll: state.showAll });
  if (view === null) return undefined;
  for (const id of view.newRowIds) if (!view.hiddenRowIds.has(id)) state.pilled.add(id);
  return {
    hiddenRowIds: view.hiddenRowIds,
    newRowIds: view.newRowIds,
    newPillLabel: LEGACY_FIRST_TIME_GUIDE_LABELS.newPill,
    footActions: resolveLegacyFirstTimeGuideFootActions(view.hiddenRowIds.size)
  };
};

export const runLegacyFirstTimeGuideFootAction = (scene: object, id: LegacyGuideFootActionId): void => {
  const state = guideStates.get(scene);
  if (state === undefined) return;
  if (id === 'all-tips') {
    state.showAll = true;
  } else {
    resolveLegacyFirstTimeSceneSession(scene).showTipsAgain();
    state.showAll = false;
    state.pilled.clear();
  }
  (scene as { uiDirty?: boolean }).uiDirty = true;
};

export const noteLegacyFirstTimeGuideClosed = (scene: object): void => {
  const state = guideStates.get(scene);
  if (state === undefined) return;
  guideStates.delete(scene);
  if (state.pilled.size === 0) return;
  resolveLegacyFirstTimeSceneSession(scene).store()?.markGuideRowsViewed([...state.pilled]);
};
