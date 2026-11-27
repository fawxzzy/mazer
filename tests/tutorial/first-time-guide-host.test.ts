/**
 * First-time cards slice 4 (spec section 7, section 8 item 5): the Guide with `?lab=firsttime` on. Rows stay hidden
 * until their card is met, a "New" pill shows until the Guide that showed it closes, "All tips" shows every row until
 * close, and "Show tips again" clears the seen record (the rows hide again). Flag off: the model is exactly today's.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LEGACY_FIRST_TIME_CARDS } from '../../src/legacy-runtime/legacyFirstTimeCards';
import { LEGACY_FIRST_TIME_GUIDE_LABELS } from '../../src/legacy-runtime/legacyFirstTimeGuide';
import {
  noteLegacyFirstTimeGuideClosed,
  resolveLegacyFirstTimeGuideFootActions,
  resolveLegacyFirstTimeGuideSheetOptions,
  runLegacyFirstTimeGuideFootAction
} from '../../src/legacy-runtime/legacyFirstTimeGuideHost';
import { resolveLegacyFirstTimeSceneSession } from '../../src/legacy-runtime/legacyFirstTimeSceneSession';
import { resolveFirstTimeSeenStorageKey } from '../../src/legacy-runtime/legacyFirstTimeStore';
import { LEGACY_GUIDE_ROWS, buildLegacyGuideSheetModel } from '../../src/legacy-runtime/legacyGuideContent';
import type { TutorialStorage } from '../../src/tutorial/index.ts';

class MemoryStorage implements TutorialStorage {
  readonly data = new Map<string, string>();
  getItem(key: string): string | null { return this.data.get(key) ?? null; }
  setItem(key: string, value: string): void { this.data.set(key, value); }
  removeItem(key: string): void { this.data.delete(key); }
}

/** A scene with the members the session reads, and a window with the query and device storage. */
const sceneWith = (search: string, storage = new MemoryStorage()) => {
  vi.stubGlobal('window', { location: { search }, localStorage: storage });
  const scene = { authSnapshot: null, uiDirty: false, resolveBrowserLocalStorage: () => storage };
  const model = () => buildLegacyGuideSheetModel('menu', { firstTime: resolveLegacyFirstTimeGuideSheetOptions(scene) });
  const meet = (cardId: string) => {
    const card = LEGACY_FIRST_TIME_CARDS.find((entry) => entry.id === cardId)!;
    resolveLegacyFirstTimeSceneSession(scene).store()!.markSeen(card.token);
  };
  return { scene, storage, model, meet };
};

const ids = (rows: readonly { id: string }[]) => rows.map((row) => row.id);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('first-time Guide (slice 4)', () => {
  it('flag off: no options, and the model is the same object shape as today (no new keys)', () => {
    const { scene, model } = sceneWith('');
    expect(resolveLegacyFirstTimeGuideSheetOptions(scene)).toBeUndefined();
    const sheet = model();
    expect(sheet.rows).toBe(LEGACY_GUIDE_ROWS);
    expect(Object.keys(sheet).sort()).toEqual(['closeLabel', 'context', 'keyboardLine', 'rows', 'title']);
  });

  it('a new account: Wrap and Switch hidden, no pill, "All tips" and "Show tips again" at the foot', () => {
    const { model } = sceneWith('?lab=firsttime');
    const sheet = model();
    expect(ids(sheet.rows)).toEqual(ids(LEGACY_GUIDE_ROWS).filter((id) => id !== 'wrap' && id !== 'bleed-gate'));
    expect([...(sheet.newRowIds ?? [])]).toEqual([]);
    expect(sheet.newPillLabel).toBe('New');
    expect(sheet.footActions).toEqual([
      { id: 'all-tips', label: 'All tips' },
      { id: 'show-tips-again', label: 'Show tips again' }
    ]);
  });

  it('meeting Wrap shows its row with a "New" pill until the Guide that showed it closes', () => {
    const { scene, model, meet } = sceneWith('?lab=firsttime');
    meet('mechanic.wrap');
    const sheet = model();
    expect(ids(sheet.rows)).toContain('wrap');
    expect(ids(sheet.rows)).not.toContain('bleed-gate');
    expect([...(sheet.newRowIds ?? [])]).toEqual(['wrap']);
    noteLegacyFirstTimeGuideClosed(scene);
    const reopened = model();
    expect(ids(reopened.rows)).toContain('wrap');
    expect([...(reopened.newRowIds ?? [])]).toEqual([]);
  });

  it('both met: every row shows, and "All tips" leaves the foot', () => {
    const { model, meet } = sceneWith('?lab=firsttime');
    meet('mechanic.wrap');
    meet('mechanic.switch');
    const sheet = model();
    expect(ids(sheet.rows)).toEqual(ids(LEGACY_GUIDE_ROWS));
    expect(sheet.footActions?.map((action) => action.id)).toEqual(['show-tips-again']);
  });

  it('"All tips" shows every row until the Guide closes, without a pill or a write', () => {
    const { scene, storage, model } = sceneWith('?lab=firsttime');
    runLegacyFirstTimeGuideFootAction(scene, 'all-tips');
    // Not open yet: the action needs the Guide's state, so nothing happens.
    expect(scene.uiDirty).toBe(false);
    model();
    runLegacyFirstTimeGuideFootAction(scene, 'all-tips');
    expect(scene.uiDirty).toBe(true);
    const sheet = model();
    expect(ids(sheet.rows)).toEqual(ids(LEGACY_GUIDE_ROWS));
    expect([...(sheet.newRowIds ?? [])]).toEqual([]);
    expect(sheet.footActions?.map((action) => action.id)).toEqual(['show-tips-again']);
    noteLegacyFirstTimeGuideClosed(scene);
    expect(ids(model().rows)).not.toContain('wrap');
    expect(storage.data.get(resolveFirstTimeSeenStorageKey('guest'))).toBeUndefined();
  });

  it('"Show tips again" clears the seen record: the rows hide again and the device hint key is untouched', () => {
    const { scene, storage, model, meet } = sceneWith('?lab=firsttime');
    storage.setItem('mazer.tutorial.acks:device', 'kept');
    meet('mechanic.wrap');
    model();
    noteLegacyFirstTimeGuideClosed(scene);
    expect(storage.data.has(resolveFirstTimeSeenStorageKey('guest'))).toBe(true);
    model();
    runLegacyFirstTimeGuideFootAction(scene, 'show-tips-again');
    expect(storage.data.has(resolveFirstTimeSeenStorageKey('guest'))).toBe(false);
    expect(storage.data.get('mazer.tutorial.acks:device')).toBe('kept');
    expect(ids(model().rows)).not.toContain('wrap');
    // Closing after the reset marks nothing viewed (the pill state went with the record).
    noteLegacyFirstTimeGuideClosed(scene);
    expect(storage.data.has(resolveFirstTimeSeenStorageKey('guest'))).toBe(false);
  });

  it('Level Preview: the Guide reads the in-memory record and writes nothing', () => {
    const { scene, storage, model, meet } = sceneWith('?lab=firsttime&previewLevel=22');
    meet('mechanic.wrap');
    expect(ids(model().rows)).toContain('wrap');
    noteLegacyFirstTimeGuideClosed(scene);
    expect(storage.data.size).toBe(0);
  });

  it('the foot actions are pure: "All tips" only while something is hidden', () => {
    expect(resolveLegacyFirstTimeGuideFootActions(0).map((action) => action.label)).toEqual([LEGACY_FIRST_TIME_GUIDE_LABELS.showTipsAgain]);
    expect(resolveLegacyFirstTimeGuideFootActions(2).map((action) => action.label))
      .toEqual([LEGACY_FIRST_TIME_GUIDE_LABELS.allTips, LEGACY_FIRST_TIME_GUIDE_LABELS.showTipsAgain]);
  });
});
