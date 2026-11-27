import { describe, expect, it } from 'vitest';

import { LEGACY_AUTH_GUEST_SCOPE } from '../../src/legacy-runtime/legacyAuth';
import { resolveFirstTimeCard, type FirstTimeCardId } from '../../src/legacy-runtime/legacyFirstTimeCards';
import {
  FIRST_TIME_CARDS_BUILD_DEFAULT,
  FIRST_TIME_LAB_STORAGE_KEY,
  resolveFirstTimeCardsEnabled,
  resolveFirstTimeCardsState
} from '../../src/legacy-runtime/legacyFirstTimeFlag';
import { FIRST_TIME_GATED_GUIDE_ROWS, resolveLegacyFirstTimeGuideView } from '../../src/legacy-runtime/legacyFirstTimeGuide';
import { createLegacyFirstTimeSession } from '../../src/legacy-runtime/legacyFirstTimeSession';
import {
  FIRST_TIME_GUEST_SCOPE,
  FIRST_TIME_SEEN_STORAGE_KEY_BASE,
  createLegacyFirstTimeStore,
  mergeLegacyFirstTimeGuestRecord,
  resolveFirstTimeSeenStorageKey
} from '../../src/legacy-runtime/legacyFirstTimeStore';
import { applyLegacyProgressionResetLocalEffects } from '../../src/legacy-runtime/legacyProgressionResetFlow';
import { HAZARD_LAB_STORAGE_KEY, resolveHazardLayerState } from '../../src/legacy-runtime/legacyHazardLayerFlag';
import type { TutorialStorage } from '../../src/tutorial/index.ts';

/** A spy Storage: records every call so a test can prove what was (not) read or written. */
class SpyStorage implements TutorialStorage {
  readonly data = new Map<string, string>();
  readonly calls: string[] = [];
  getItem(key: string): string | null { this.calls.push(`get:${key}`); return this.data.get(key) ?? null; }
  setItem(key: string, value: string): void { this.calls.push(`set:${key}`); this.data.set(key, value); }
  removeItem(key: string): void { this.calls.push(`remove:${key}`); this.data.delete(key); }
  writes(): string[] { return this.calls.filter((call) => !call.startsWith('get:')); }
}

class ThrowingStorage implements TutorialStorage {
  getItem(): string | null { throw new Error('blocked'); }
  setItem(): void { throw new Error('blocked'); }
  removeItem(): void { throw new Error('blocked'); }
}

const NOW = () => '2026-11-27T00:00:00.000Z';
const ALL_TOUCH_CARDS: FirstTimeCardId[] = ['mechanic.locked-gate', 'mechanic.pulse-gate', 'mechanic.switch', 'mechanic.wrap', 'tip.trail', 'level-1.goal'];
const wrap = resolveFirstTimeCard('mechanic.wrap');
const sw = resolveFirstTimeCard('mechanic.switch');

describe('?lab=firsttime flag', () => {
  it('is off by default in the build, in node, and with no lab switch', () => {
    expect(FIRST_TIME_CARDS_BUILD_DEFAULT).toBe(false);
    expect(resolveFirstTimeCardsEnabled()).toBe(false);
    expect(resolveFirstTimeCardsState({ search: '', storage: new SpyStorage() })).toEqual({ enabled: false, source: 'off', preview: false });
  });

  it('turns on with ?lab=firsttime, remembers it, and ?lab=off forgets it', () => {
    const storage = new SpyStorage();
    expect(resolveFirstTimeCardsState({ search: '?lab=firsttime', storage })).toEqual({ enabled: true, source: 'lab', preview: false });
    expect(storage.data.get(FIRST_TIME_LAB_STORAGE_KEY)).toBe('1');
    expect(resolveFirstTimeCardsEnabled({ search: '', storage })).toBe(true);
    expect(resolveFirstTimeCardsEnabled({ search: '?lab=off', storage })).toBe(false);
    expect(storage.data.has(FIRST_TIME_LAB_STORAGE_KEY)).toBe(false);
    expect(resolveFirstTimeCardsEnabled({ search: '', storage })).toBe(false);
  });

  it('combines with the hazard lab in one URL (?lab=hazards&lab=firsttime)', () => {
    const storage = new SpyStorage();
    const search = '?lab=hazards&lab=firsttime';
    expect(resolveFirstTimeCardsEnabled({ search, storage })).toBe(true);
    expect(resolveHazardLayerState({ search, storage }).enabled).toBe(true);
    expect(storage.data.get(FIRST_TIME_LAB_STORAGE_KEY)).toBe('1');
    expect(storage.data.has(HAZARD_LAB_STORAGE_KEY)).toBe(true);
  });

  it('never writes its key on a Level Preview route, but still honours the query for that load', () => {
    const storage = new SpyStorage();
    expect(resolveFirstTimeCardsState({ search: '?previewLevel=12&lab=firsttime', storage })).toEqual({ enabled: true, source: 'lab', preview: true });
    expect(resolveFirstTimeCardsState({ search: '?previewLevel=12&lab=off', storage }).enabled).toBe(false);
    expect(storage.writes()).toEqual([]);
  });

  it('survives storage that throws', () => {
    expect(resolveFirstTimeCardsState({ search: '?lab=firsttime', storage: new ThrowingStorage() }).enabled).toBe(true);
    expect(resolveFirstTimeCardsState({ search: '', storage: new ThrowingStorage() }).enabled).toBe(false);
  });
});

describe('flag off: holds nothing, reads no storage, draws nothing', () => {
  it('reads only the lab key, never resolves the scene storage, and every call is a no-op', () => {
    const device = new SpyStorage();
    let sceneResolved = 0;
    const session = createLegacyFirstTimeSession({
      search: '',
      deviceStorage: device,
      resolveSceneStorage: () => { sceneResolved += 1; return device; },
      scope: 'user:abc',
      liveCardIds: ALL_TOUCH_CARDS
    });
    expect(session.enabled).toBe(false);
    expect(session.startLevel(0)).toBeNull();
    expect(session.touch(['wrap-step', 'switch-trigger', 'trail-backstep'], 10)).toBeNull();
    expect(session.dismiss('action', 5000)).toBeNull();
    expect(session.activeCard()).toBeNull();
    expect(session.store()).toBeNull();
    session.showTipsAgain();
    expect(resolveLegacyFirstTimeGuideView({ store: session.store() })).toBeNull();
    expect(sceneResolved).toBe(0);
    expect(device.calls).toEqual([`get:${FIRST_TIME_LAB_STORAGE_KEY}`]);
  });
});

describe('Level Preview writes nothing', () => {
  it('a flag-on preview session never writes to the device, even when the device storage is offered as scene storage', () => {
    const device = new SpyStorage();
    device.data.set(FIRST_TIME_LAB_STORAGE_KEY, '1');
    const session = createLegacyFirstTimeSession({
      search: '?previewLevel=200',
      deviceStorage: device,
      resolveSceneStorage: () => device,
      scope: 'user:abc',
      liveCardIds: ALL_TOUCH_CARDS,
      now: NOW
    });
    expect(session.enabled).toBe(true);
    expect(session.preview).toBe(true);
    session.startLevel(0);
    expect(session.touch(['shard-pickup'], 0)?.id).toBe('mechanic.locked-gate');
    expect(session.dismiss('action', 1000)?.outcome).toBe('acked');
    session.startLevel(1000);
    session.touch(['switch-trigger', 'wrap-step'], 1100);
    session.dismiss('timeout', 6000);
    session.store()!.markGuideRowsViewed(['wrap']);
    session.showTipsAgain();
    expect(device.writes()).toEqual([]);
    expect(device.calls.filter((call) => call.includes(FIRST_TIME_SEEN_STORAGE_KEY_BASE))).toEqual([]);
  });

  it('a flag-on normal session does write its seen record (so the preview test above is not vacuous)', () => {
    const device = new SpyStorage();
    device.data.set(FIRST_TIME_LAB_STORAGE_KEY, '1');
    const session = createLegacyFirstTimeSession({
      search: '', deviceStorage: device, resolveSceneStorage: () => device, scope: 'user:abc', liveCardIds: ALL_TOUCH_CARDS, now: NOW
    });
    expect(session.touch(['wrap-step'], 0)?.id).toBe('mechanic.wrap');
    session.dismiss('action', 1000);
    expect(device.writes()).toContain(`set:${resolveFirstTimeSeenStorageKey('user:abc')}`);
    const reloaded = createLegacyFirstTimeSession({
      search: '', deviceStorage: device, resolveSceneStorage: () => device, scope: 'user:abc', liveCardIds: ALL_TOUCH_CARDS
    });
    expect(reloaded.touch(['wrap-step'], 0)).toBeNull();
  });

  it('falls back to memory when the scene has no storage', () => {
    const session = createLegacyFirstTimeSession({
      search: '?lab=firsttime', deviceStorage: null, resolveSceneStorage: () => null, scope: 'guest', liveCardIds: ALL_TOUCH_CARDS
    });
    expect(session.touch(['wrap-step'], 0)?.id).toBe('mechanic.wrap');
    expect(session.dismiss('action', 1000)?.outcome).toBe('acked');
    expect(session.store()!.isSeen(wrap.token)).toBe(true);
  });
});

describe('device-local seen store', () => {
  it('uses its own key per auth scope, apart from the tutorial ack key', () => {
    expect(FIRST_TIME_GUEST_SCOPE).toBe(LEGACY_AUTH_GUEST_SCOPE);
    expect(resolveFirstTimeSeenStorageKey('user:abc')).toBe('mazer.firsttime.seen.v1:user:abc');
    expect(() => resolveFirstTimeSeenStorageKey(' ')).toThrow();
    const storage = new SpyStorage();
    const a = createLegacyFirstTimeStore({ storage, scope: 'user:a', now: NOW });
    const b = createLegacyFirstTimeStore({ storage, scope: 'user:b', now: NOW });
    a.markSeen(wrap.token);
    a.markMet('mechanic.switch');
    expect(a.isSeen(wrap.token)).toBe(true);
    expect(b.isSeen(wrap.token)).toBe(false);
    expect(b.isMet('mechanic.switch')).toBe(false);
    expect(a.metCardIds()).toEqual(['mechanic.switch']);
    expect([...storage.data.keys()]).toEqual(['mazer.firsttime.seen.v1:user:a']);
  });

  it('re-shows a card when its revision is bumped', () => {
    const store = createLegacyFirstTimeStore({ storage: new SpyStorage(), scope: 'guest', now: NOW });
    store.markSeen(wrap.token);
    expect(store.isSeen({ ...wrap.token, revision: 2 })).toBe(false);
  });

  it('never throws on blocked or corrupt storage', () => {
    const blocked = createLegacyFirstTimeStore({ storage: new ThrowingStorage(), scope: 'guest', now: NOW });
    expect(() => blocked.markSeen(wrap.token)).not.toThrow();
    expect(blocked.isSeen(wrap.token)).toBe(true);
    const corrupt = new SpyStorage();
    corrupt.data.set(resolveFirstTimeSeenStorageKey('guest'), '{not json');
    const store = createLegacyFirstTimeStore({ storage: corrupt, scope: 'guest', now: NOW });
    expect(store.isSeen(wrap.token)).toBe(false);
    store.markSeen(wrap.token);
    expect(corrupt.data.get(`${resolveFirstTimeSeenStorageKey('guest')}.corrupt`)).toBe('{not json');
  });

  it('merges the guest record into the user record on sign-in, as a union, leaving the guest record', () => {
    const storage = new SpyStorage();
    const guest = createLegacyFirstTimeStore({ storage, scope: 'guest', now: () => '2026-11-01T00:00:00.000Z' });
    guest.markSeen(wrap.token);
    guest.markMet('mechanic.switch');
    const user = createLegacyFirstTimeStore({ storage, scope: 'user:abc', now: () => '2026-11-20T00:00:00.000Z' });
    user.markSeen(sw.token);
    expect(mergeLegacyFirstTimeGuestRecord(storage, 'user:abc')).toEqual({ changed: true });
    const merged = createLegacyFirstTimeStore({ storage, scope: 'user:abc', now: NOW });
    expect(merged.isSeen(wrap.token)).toBe(true);
    expect(merged.isSeen(sw.token)).toBe(true);
    expect(merged.isMet('mechanic.switch')).toBe(true);
    expect(guest.isSeen(wrap.token)).toBe(true);
    expect(mergeLegacyFirstTimeGuestRecord(storage, 'user:abc')).toEqual({ changed: false });
    expect(mergeLegacyFirstTimeGuestRecord(storage, 'guest')).toEqual({ changed: false });
    expect(mergeLegacyFirstTimeGuestRecord(new ThrowingStorage(), 'user:abc')).toEqual({ changed: false });
  });

  it('never overwrites a record a newer client wrote', () => {
    const storage = new SpyStorage();
    createLegacyFirstTimeStore({ storage, scope: 'guest', now: NOW }).markSeen(wrap.token);
    const future = '{"version":99,"acks":{}}';
    storage.data.set(resolveFirstTimeSeenStorageKey('user:abc'), future);
    expect(mergeLegacyFirstTimeGuestRecord(storage, 'user:abc')).toEqual({ changed: false });
    expect(storage.data.get(resolveFirstTimeSeenStorageKey('user:abc'))).toBe(future);
  });

  it('a progress reset removes the seen record, so the cards show again', () => {
    const storage = new SpyStorage();
    const before = createLegacyFirstTimeSession({
      search: '', deviceStorage: { getItem: () => '1', setItem: () => undefined, removeItem: () => undefined },
      resolveSceneStorage: () => storage, scope: 'user:abc', liveCardIds: ALL_TOUCH_CARDS, now: NOW
    });
    before.touch(['wrap-step'], 0);
    before.dismiss('action', 1000);
    expect(before.store()!.isSeen(wrap.token)).toBe(true);
    const reset = applyLegacyProgressionResetLocalEffects(
      { removeItem: (key) => storage.removeItem(key), setItem: (key, value) => storage.setItem(key, value) },
      (base) => `${base}:user:abc`,
      Date.parse('2026-11-27T00:00:00.000Z')
    );
    expect(reset.ok).toBe(true);
    expect(storage.data.has(resolveFirstTimeSeenStorageKey('user:abc'))).toBe(false);
    const after = createLegacyFirstTimeSession({
      search: '', deviceStorage: { getItem: () => '1', setItem: () => undefined, removeItem: () => undefined },
      resolveSceneStorage: () => storage, scope: 'user:abc', liveCardIds: ALL_TOUCH_CARDS, now: NOW
    });
    expect(after.touch(['wrap-step'], 0)?.id).toBe('mechanic.wrap');
  });
});

describe('Guide met set', () => {
  const freshStore = () => createLegacyFirstTimeStore({ storage: new SpyStorage(), scope: 'guest', now: NOW });

  it('is null with the flag off, so the Guide is built exactly as today', () => {
    expect(resolveLegacyFirstTimeGuideView({ store: null })).toBeNull();
    expect(resolveLegacyFirstTimeGuideView({ store: null, showAll: true })).toBeNull();
  });

  it('hides the Wrap and Switch rows until met or seen; All tips shows everything', () => {
    expect(FIRST_TIME_GATED_GUIDE_ROWS).toEqual({ wrap: 'mechanic.wrap', 'bleed-gate': 'mechanic.switch' });
    const store = freshStore();
    expect([...resolveLegacyFirstTimeGuideView({ store })!.hiddenRowIds].sort()).toEqual(['bleed-gate', 'wrap']);
    expect([...resolveLegacyFirstTimeGuideView({ store, showAll: true })!.hiddenRowIds]).toEqual([]);
    store.markMet('mechanic.switch');
    expect([...resolveLegacyFirstTimeGuideView({ store })!.hiddenRowIds]).toEqual(['wrap']);
    store.markSeen(wrap.token);
    expect([...resolveLegacyFirstTimeGuideView({ store })!.hiddenRowIds]).toEqual([]);
  });

  it('puts a New pill on a met mechanic row until the Guide has shown it', () => {
    const store = freshStore();
    expect([...resolveLegacyFirstTimeGuideView({ store })!.newRowIds]).toEqual([]);
    store.markMet('mechanic.pulse-gate');
    store.markMet('mechanic.switch');
    expect([...resolveLegacyFirstTimeGuideView({ store })!.newRowIds].sort()).toEqual(['bleed-gate', 'hazard-gate']);
    store.markGuideRowsViewed(['bleed-gate', 'hazard-gate']);
    expect([...resolveLegacyFirstTimeGuideView({ store })!.newRowIds]).toEqual([]);
  });

  it('Show tips again hides the rows again and re-arms the cards', () => {
    const storage = new SpyStorage();
    storage.data.set(FIRST_TIME_LAB_STORAGE_KEY, '1');
    const session = createLegacyFirstTimeSession({
      search: '', deviceStorage: storage, resolveSceneStorage: () => storage, scope: 'guest', liveCardIds: ALL_TOUCH_CARDS, now: NOW
    });
    session.touch(['wrap-step'], 0);
    session.dismiss('action', 1000);
    expect(resolveLegacyFirstTimeGuideView({ store: session.store() })!.hiddenRowIds.has('wrap')).toBe(false);
    session.showTipsAgain();
    expect(resolveLegacyFirstTimeGuideView({ store: session.store() })!.hiddenRowIds.has('wrap')).toBe(true);
    session.startLevel(2000);
    expect(session.touch(['wrap-step'], 2100)?.id).toBe('mechanic.wrap');
    expect(storage.data.get(FIRST_TIME_LAB_STORAGE_KEY)).toBe('1');
  });
});
