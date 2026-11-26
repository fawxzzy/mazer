import { describe, expect, test } from 'vitest';
import {
  LEGACY_RATING_PROMPT_SETTLE_MS,
  LEGACY_RATING_PROMPT_STEP_LEVELS,
  LEGACY_RATING_PROMPT_STORAGE_PREFIX,
  createLegacyRatingPromptGate,
  createLegacyRatingPromptRecord,
  normalizeLegacyRatingPromptRecord,
  readLegacyRatingPromptRecord,
  recordLegacyRatingPromptDismissed,
  recordLegacyRatingPromptSubmitted,
  resolveLegacyRatingPromptLevel,
  resolveLegacyRatingPromptNextLevel,
  shouldOfferLegacyRatingPrompt,
  writeLegacyRatingPromptRecord,
  type LegacyRatingPromptFrame,
  type LegacyRatingPromptStep
} from '../../src/legacy-runtime/legacyRatingPrompt';

// Rating prompt (Zac, 2026-11-25): offered on main-menu entry from level 50, "Not now" waits for the next 50, a saved
// rating ends it, per account, signed-in only, never during play.

const memoryStorage = () => {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    map,
    setItem: (key: string, value: string) => { map.set(key, value); }
  };
};

const SETTLE = LEGACY_RATING_PROMPT_SETTLE_MS;

/** Drives the gate like the scene does: one poll per frame. */
const harness = (storage = memoryStorage()) => {
  const gate = createLegacyRatingPromptGate({ storage: () => storage });
  let now = 0;
  const base: Omit<LegacyRatingPromptFrame, 'nowMs'> = {
    authResolved: true,
    level: '1',
    onMainMenu: true,
    sandbox: false,
    surfaceIdle: true,
    userId: 'user-a'
  };
  const frame = (patch: Partial<LegacyRatingPromptFrame> = {}): LegacyRatingPromptStep => {
    now += 16;
    return gate.poll({ ...base, nowMs: now, ...patch });
  };
  /** A main-menu entry held for long enough to settle; returns every offer seen. */
  const enterMenu = (patch: Partial<LegacyRatingPromptFrame> = {}): LegacyRatingPromptStep[] => {
    frame({ ...patch, onMainMenu: false });
    const offers: LegacyRatingPromptStep[] = [];
    for (let elapsed = 0; elapsed <= SETTLE * 3; elapsed += 16) {
      const step = frame(patch);
      if (step.action === 'offer') offers.push(step);
    }
    return offers;
  };
  const play = (patch: Partial<LegacyRatingPromptFrame> = {}): LegacyRatingPromptStep[] => {
    const offers: LegacyRatingPromptStep[] = [];
    for (let i = 0; i < 200; i += 1) {
      const step = frame({ ...patch, onMainMenu: false });
      if (step.action === 'offer') offers.push(step);
    }
    return offers;
  };
  return { enterMenu, frame, gate, play, storage };
};

describe('rating prompt thresholds (pure)', () => {
  test('first offer at level 50: 49 never, 50 and 51 yes', () => {
    const fresh = createLegacyRatingPromptRecord();
    expect(LEGACY_RATING_PROMPT_STEP_LEVELS).toBe(50);
    expect(shouldOfferLegacyRatingPrompt(fresh, '49')).toBe(false);
    expect(shouldOfferLegacyRatingPrompt(fresh, '50')).toBe(true);
    expect(shouldOfferLegacyRatingPrompt(fresh, '51')).toBe(true);
    expect(shouldOfferLegacyRatingPrompt(fresh, 50)).toBe(true);
    expect(shouldOfferLegacyRatingPrompt(fresh, '1')).toBe(false);
  });

  test('"Not now" at 50 waits for 100 (99 no, 100 yes), then 150; dismissed at 73 waits for 100 too', () => {
    const at50 = recordLegacyRatingPromptDismissed(createLegacyRatingPromptRecord(), 50);
    expect(resolveLegacyRatingPromptNextLevel(at50)).toBe(100);
    expect(shouldOfferLegacyRatingPrompt(at50, '50')).toBe(false);
    expect(shouldOfferLegacyRatingPrompt(at50, '99')).toBe(false);
    expect(shouldOfferLegacyRatingPrompt(at50, '100')).toBe(true);
    const at100 = recordLegacyRatingPromptDismissed(at50, 100);
    expect(resolveLegacyRatingPromptNextLevel(at100)).toBe(150);
    expect(shouldOfferLegacyRatingPrompt(at100, '149')).toBe(false);
    expect(shouldOfferLegacyRatingPrompt(at100, '150')).toBe(true);
    expect(resolveLegacyRatingPromptNextLevel(recordLegacyRatingPromptDismissed(createLegacyRatingPromptRecord(), 73))).toBe(100);
    // A jump past several steps is one offer, and the next one is the step after where it closed.
    expect(resolveLegacyRatingPromptNextLevel(recordLegacyRatingPromptDismissed(at50, 260))).toBe(300);
  });

  test('a saved rating ends it: never again (level 500, 10 000)', () => {
    const rated = recordLegacyRatingPromptSubmitted(recordLegacyRatingPromptDismissed(createLegacyRatingPromptRecord(), 50));
    expect(resolveLegacyRatingPromptNextLevel(rated)).toBeNull();
    for (const level of ['50', '100', '500', '10000']) {
      expect(shouldOfferLegacyRatingPrompt(rated, level), level).toBe(false);
    }
    // A later dismissal cannot un-rate it.
    expect(recordLegacyRatingPromptDismissed(rated, 600)).toBe(rated);
  });

  test('highest level reached: a progress reset (level back to 1) does not lower the bar already reached', () => {
    const peaked = { ...createLegacyRatingPromptRecord(), peakLevel: 60 };
    expect(shouldOfferLegacyRatingPrompt(peaked, '1')).toBe(true);
  });

  test('levels read from the raw ordinal; junk is 0, display strings are junk, huge values are capped', () => {
    expect(resolveLegacyRatingPromptLevel('50')).toBe(50);
    expect(resolveLegacyRatingPromptLevel(' 51 ')).toBe(51);
    expect(resolveLegacyRatingPromptLevel('1,234')).toBe(0);
    expect(resolveLegacyRatingPromptLevel(null)).toBe(0);
    expect(resolveLegacyRatingPromptLevel('abc')).toBe(0);
    expect(resolveLegacyRatingPromptLevel('99999999999999999999')).toBe(Number.MAX_SAFE_INTEGER);
  });

  test('stored records are normalised; junk reads as a fresh record', () => {
    expect(normalizeLegacyRatingPromptRecord(null)).toEqual(createLegacyRatingPromptRecord());
    expect(normalizeLegacyRatingPromptRecord({ dismissedAtLevel: -4, peakLevel: 'x', submitted: 'yes' })).toEqual(createLegacyRatingPromptRecord());
    expect(normalizeLegacyRatingPromptRecord({ dismissedAtLevel: 50, peakLevel: 70, submitted: true }))
      .toEqual({ dismissedAtLevel: 50, peakLevel: 70, submitted: true });
    const storage = memoryStorage();
    storage.setItem(`${LEGACY_RATING_PROMPT_STORAGE_PREFIX}user-a`, '{not json');
    expect(readLegacyRatingPromptRecord(storage, 'user-a')).toEqual(createLegacyRatingPromptRecord());
  });

  test('storage is per account and refuses a missing account; a throwing storage is survived', () => {
    const storage = memoryStorage();
    expect(writeLegacyRatingPromptRecord(storage, 'user-a', recordLegacyRatingPromptSubmitted(createLegacyRatingPromptRecord()))).toBe(true);
    expect(readLegacyRatingPromptRecord(storage, 'user-a').submitted).toBe(true);
    expect(readLegacyRatingPromptRecord(storage, 'user-b').submitted).toBe(false);
    expect(writeLegacyRatingPromptRecord(storage, null, createLegacyRatingPromptRecord())).toBe(false);
    expect(writeLegacyRatingPromptRecord(storage, '  ', createLegacyRatingPromptRecord())).toBe(false);
    const broken = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('quota'); } };
    expect(readLegacyRatingPromptRecord(broken, 'user-a')).toEqual(createLegacyRatingPromptRecord());
    expect(writeLegacyRatingPromptRecord(broken, 'user-a', createLegacyRatingPromptRecord())).toBe(false);
  });
});

describe('rating prompt gate (main-menu entry, per frame)', () => {
  test('49 / 50 / 51 on main-menu entry; one entry is at most one offer, after the settle wait', () => {
    expect(harness().enterMenu({ level: '49' })).toEqual([]);
    expect(harness().enterMenu({ level: '50' })).toEqual([{ action: 'offer', highestLevel: 50, userId: 'user-a' }]);
    expect(harness().enterMenu({ level: '51' })).toEqual([{ action: 'offer', highestLevel: 51, userId: 'user-a' }]);

    const h = harness();
    h.frame({ level: '50', onMainMenu: false });
    expect(h.frame({ level: '50' }).action).toBe('none');
    // Still settling.
    for (let t = 16; t < SETTLE - 16; t += 16) expect(h.frame({ level: '50' }).action).toBe('none');
  });

  test('never during play, and reaching 50 mid-run offers only once back on the main menu', () => {
    const h = harness();
    expect(h.enterMenu({ level: '48' })).toEqual([]);
    expect(h.play({ level: '50' })).toEqual([]);
    expect(h.play({ level: '51' })).toEqual([]);
    expect(h.enterMenu({ level: '51' })).toHaveLength(1);
  });

  test('"Not now" at 50: nothing at 99, offered again at 100', () => {
    const h = harness();
    const [offer] = h.enterMenu({ level: '50' });
    expect(offer).toMatchObject({ action: 'offer', highestLevel: 50 });
    h.gate.markClosed({ highestLevel: 50, shown: true, userId: 'user-a' });
    expect(h.enterMenu({ level: '50' })).toEqual([]);
    expect(h.enterMenu({ level: '75' })).toEqual([]);
    expect(h.enterMenu({ level: '99' })).toEqual([]);
    expect(h.enterMenu({ level: '100' })).toEqual([{ action: 'offer', highestLevel: 100, userId: 'user-a' }]);
    h.gate.markClosed({ highestLevel: 100, shown: true, userId: 'user-a' });
    expect(h.enterMenu({ level: '149' })).toEqual([]);
    expect(h.enterMenu({ level: '150' })).toHaveLength(1);
  });

  test('submitted: never offered again, even at 500; and it survives a reload (a new gate on the same storage)', () => {
    const storage = memoryStorage();
    const h = harness(storage);
    expect(h.enterMenu({ level: '50' })).toHaveLength(1);
    h.gate.markSubmitted('user-a');
    h.gate.markClosed({ highestLevel: 50, shown: true, userId: 'user-a' });
    expect(h.enterMenu({ level: '500' })).toEqual([]);
    const reloaded = harness(storage);
    expect(reloaded.enterMenu({ level: '500' })).toEqual([]);
    expect(reloaded.enterMenu({ level: '1000' })).toEqual([]);
  });

  test('"Not now" survives a reload too', () => {
    const storage = memoryStorage();
    const h = harness(storage);
    h.enterMenu({ level: '50' });
    h.gate.markClosed({ highestLevel: 50, shown: true, userId: 'user-a' });
    expect(harness(storage).enterMenu({ level: '60' })).toEqual([]);
    expect(harness(storage).enterMenu({ level: '100' })).toHaveLength(1);
  });

  test('offline / failed / rate-limited submit is not a saved rating: only markSubmitted marks it, and a close without one waits for the next 50', () => {
    const storage = memoryStorage();
    const h = harness(storage);
    h.enterMenu({ level: '50' });
    // The scene calls markSubmitted ONLY for status 'saved' (pinned in legacy-feedback-launch.test.ts); here the send
    // failed, so only the close is recorded.
    h.gate.markClosed({ highestLevel: 50, shown: true, userId: 'user-a' });
    expect(readLegacyRatingPromptRecord(storage, 'user-a')).toMatchObject({ dismissedAtLevel: 50, submitted: false });
    expect(h.enterMenu({ level: '100' })).toHaveLength(1);
  });

  test('a popup that never appeared (offline chunk load) records nothing: the next entry offers again', () => {
    const h = harness();
    h.enterMenu({ level: '50' });
    h.gate.markClosed({ highestLevel: 50, shown: false, userId: 'user-a' });
    expect(h.enterMenu({ level: '50' })).toHaveLength(1);
  });

  test('account switch: one account rating or dismissing does not touch another; each keeps its own record', () => {
    const storage = memoryStorage();
    const h = harness(storage);
    expect(h.enterMenu({ level: '60', userId: 'user-a' })).toHaveLength(1);
    h.gate.markSubmitted('user-a');
    h.gate.markClosed({ highestLevel: 60, shown: true, userId: 'user-a' });
    expect(h.enterMenu({ level: '60', userId: 'user-b' })).toEqual([{ action: 'offer', highestLevel: 60, userId: 'user-b' }]);
    h.gate.markClosed({ highestLevel: 60, shown: true, userId: 'user-b' });
    expect(h.enterMenu({ level: '120', userId: 'user-a' })).toEqual([]);
    expect(h.enterMenu({ level: '99', userId: 'user-b' })).toEqual([]);
    expect(h.enterMenu({ level: '100', userId: 'user-b' })).toHaveLength(1);
    expect([...storage.map.keys()].sort()).toEqual([
      `${LEGACY_RATING_PROMPT_STORAGE_PREFIX}user-a`,
      `${LEGACY_RATING_PROMPT_STORAGE_PREFIX}user-b`
    ]);
  });

  test('an account change while sitting on the menu is not a new entry', () => {
    const h = harness();
    expect(h.enterMenu({ level: '60', userId: 'user-a' })).toHaveLength(1);
    for (let i = 0; i < 200; i += 1) expect(h.frame({ level: '60', userId: 'user-b' }).action).toBe('none');
  });

  test('signed out never sees it (and signing in later on the same menu screen is not an entry)', () => {
    const storage = memoryStorage();
    const h = harness(storage);
    expect(h.enterMenu({ level: '80', userId: null })).toEqual([]);
    for (let i = 0; i < 200; i += 1) expect(h.frame({ level: '80', userId: 'user-a' }).action).toBe('none');
    expect(storage.map.size).toBe(0);
    // The next real entry while signed in offers.
    expect(h.enterMenu({ level: '80', userId: 'user-a' })).toHaveLength(1);
  });

  test('waits for the sign-in check to finish on boot, then offers', () => {
    const h = harness();
    h.frame({ level: '50', onMainMenu: false });
    for (let i = 0; i < 200; i += 1) expect(h.frame({ authResolved: false, level: '50', userId: null }).action).toBe('none');
    const offers: LegacyRatingPromptStep[] = [];
    for (let i = 0; i < 200; i += 1) {
      const step = h.frame({ level: '50' });
      if (step.action === 'offer') offers.push(step);
    }
    expect(offers).toHaveLength(1);
  });

  test('waits while something sits on the menu (overlay, open dropdown) and re-settles once it is gone', () => {
    const h = harness();
    h.frame({ level: '50', onMainMenu: false });
    for (let i = 0; i < 200; i += 1) expect(h.frame({ level: '50', surfaceIdle: false }).action).toBe('none');
    // Idle again: not instantly, only after a fresh settle wait.
    expect(h.frame({ level: '50' }).action).toBe('none');
    let offered = 0;
    let frames = 1;
    while (offered === 0 && frames < 500) {
      if (h.frame({ level: '50' }).action === 'offer') offered += 1;
      frames += 1;
    }
    expect(offered).toBe(1);
    expect(frames * 16).toBeGreaterThanOrEqual(SETTLE);
  });

  test('never in the level preview sandbox', () => {
    expect(harness().enterMenu({ level: '500', sandbox: true })).toEqual([]);
  });

  test('reset() (scene re-create) makes the next menu frame a fresh entry', () => {
    const h = harness();
    expect(h.enterMenu({ level: '50' })).toHaveLength(1);
    h.gate.reset();
    const offers: LegacyRatingPromptStep[] = [];
    for (let i = 0; i < 200; i += 1) {
      const step = h.frame({ level: '50' });
      if (step.action === 'offer') offers.push(step);
    }
    expect(offers).toHaveLength(1);
  });

  test('the peak is kept at each entry, so a progress reset after 60 still offers', () => {
    const storage = memoryStorage();
    const h = harness(storage);
    expect(h.enterMenu({ level: '40' })).toEqual([]);
    expect(h.enterMenu({ level: '60', surfaceIdle: false })).toEqual([]);
    // That entry never settled, so the peak was not read there; the next one at 60 offers.
    expect(h.enterMenu({ level: '60' })).toHaveLength(1);
    h.gate.markClosed({ highestLevel: 60, shown: true, userId: 'user-a' });
    expect(readLegacyRatingPromptRecord(storage, 'user-a')).toMatchObject({ dismissedAtLevel: 60, peakLevel: 60 });
    expect(h.enterMenu({ level: '1' })).toEqual([]);
  });
});
