import { describe, expect, it } from 'vitest';
import {
  clearLegacyAttemptSeed,
  LEGACY_ATTEMPT_SEED_STORAGE_KEY as KEY,
  clearScopedLegacyAttemptSeed,
  createLegacyAttemptSeedContext,
  readLegacyAttemptSeed,
  readScopedLegacyAttemptSeed,
  writeLegacyAttemptSeed,
  writeScopedLegacyAttemptSeed
} from '../../src/legacy-runtime/legacyAttemptSeed';

const makeStorage = () => {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    removeItem: (k: string) => { map.delete(k); },
    setItem: (k: string, v: string) => { map.set(k, v); }
  };
};
const ctx = { aspectRatio: 0.4902, completedCycles: 2, level: 5 };

describe('legacyAttemptSeed', () => {
  it('restores the saved seed for the same level, cycles and aspect, across a reload (fresh reads)', () => {
    const storage = makeStorage();
    writeLegacyAttemptSeed(storage, KEY, ctx, 123456);
    expect(readLegacyAttemptSeed(storage, KEY, { ...ctx })).toBe(123456);
    expect(readLegacyAttemptSeed(storage, KEY, { ...ctx })).toBe(123456);
  });
  it('returns null when level, cycles or aspect differ (rotated phone gets a fresh maze)', () => {
    const storage = makeStorage();
    writeLegacyAttemptSeed(storage, KEY, ctx, 99);
    expect(readLegacyAttemptSeed(storage, KEY, { ...ctx, level: 6 })).toBeNull();
    expect(readLegacyAttemptSeed(storage, KEY, { ...ctx, completedCycles: 3 })).toBeNull();
    expect(readLegacyAttemptSeed(storage, KEY, { ...ctx, aspectRatio: 2.04 })).toBeNull();
  });
  it('clear removes the attempt', () => {
    const storage = makeStorage();
    writeLegacyAttemptSeed(storage, KEY, ctx, 99);
    clearLegacyAttemptSeed(storage, KEY);
    expect(readLegacyAttemptSeed(storage, KEY, ctx)).toBeNull();
  });
  it('tolerates missing, corrupt and throwing storage', () => {
    expect(readLegacyAttemptSeed(undefined, KEY, ctx)).toBeNull();
    const storage = makeStorage();
    storage.setItem(KEY, '{nope');
    expect(readLegacyAttemptSeed(storage, KEY, ctx)).toBeNull();
    const throwing = { getItem: () => { throw new Error('x'); }, removeItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('x'); } };
    expect(() => writeLegacyAttemptSeed(throwing, KEY, ctx, 5)).not.toThrow();
    expect(readLegacyAttemptSeed(throwing, KEY, ctx)).toBeNull();
    expect(() => clearLegacyAttemptSeed(throwing, KEY)).not.toThrow();
  });
  it('ignores invalid seeds on write', () => {
    const storage = makeStorage();
    writeLegacyAttemptSeed(storage, KEY, ctx, 0);
    writeLegacyAttemptSeed(storage, KEY, ctx, Number.NaN);
    expect(storage.getItem(KEY)).toBeNull();
  });

  it('reload flow: a second session on the same storage resumes the seed; completion and reset clear it', () => {
    const storage = makeStorage();
    const user = { userId: 'user-1' };
    const c = createLegacyAttemptSeedContext(0.4902, { completedCycles: '0', level: '1' });
    writeScopedLegacyAttemptSeed(storage, user, c, 777);
    // "reload": new context object, same storage
    expect(readScopedLegacyAttemptSeed(storage, user, createLegacyAttemptSeedContext(0.4902, { completedCycles: '0', level: '1' }))).toBe(777);
    // another account does not see it
    expect(readScopedLegacyAttemptSeed(storage, { userId: 'user-2' }, c)).toBeNull();
    // completion / reset progress
    clearScopedLegacyAttemptSeed(storage, user);
    expect(readScopedLegacyAttemptSeed(storage, user, c)).toBeNull();
  });
});
