import { describe, expect, test } from 'vitest';
import { createLegacyAuthSessionSnapshot, LEGACY_USERNAME_PATTERN } from '../../src/legacy-runtime/legacyAuth';
import {
  isInvalidStoredLegacyUsername,
  LEGACY_STORED_USERNAME_PATTERN,
  sanitizeStoredLegacyUsername
} from '../../src/legacy-runtime/legacyStoredUsername';

const env = { VITE_SUPABASE_ANON_KEY: 'anon-key', VITE_SUPABASE_URL: 'https://example.supabase.co' };
const snapshotFor = (metadata: Record<string, unknown>, email = 'player@example.test') =>
  createLegacyAuthSessionSnapshot({ user: { email, id: 'u1', user_metadata: metadata } } as Parameters<typeof createLegacyAuthSessionSnapshot>[0], env);

describe('MAZER-ACCT-020/030 stored username over the limit', () => {
  test('one pattern: the stored-name check is the same as the rename/editor check', () => {
    expect(LEGACY_USERNAME_PATTERN).toBe(LEGACY_STORED_USERNAME_PATTERN);
  });

  test('accepts 15 characters and refuses 16, short, and bad-character names', () => {
    expect(sanitizeStoredLegacyUsername('a'.repeat(15))).toBe('a'.repeat(15));
    expect(sanitizeStoredLegacyUsername('  ok_name  ')).toBe('ok_name');
    expect(sanitizeStoredLegacyUsername('a'.repeat(16))).toBeNull();
    expect(sanitizeStoredLegacyUsername('x')).toBeNull();
    expect(sanitizeStoredLegacyUsername('has space')).toBeNull();
    expect(sanitizeStoredLegacyUsername(42)).toBeNull();
    expect(sanitizeStoredLegacyUsername(undefined)).toBeNull();
  });

  test('flags a non-empty invalid stored value, not an empty or valid one', () => {
    expect(isInvalidStoredLegacyUsername('a'.repeat(16))).toBe(true);
    expect(isInvalidStoredLegacyUsername('fine_name')).toBe(false);
    expect(isInvalidStoredLegacyUsername('')).toBe(false);
    expect(isInvalidStoredLegacyUsername(null)).toBe(false);
  });

  test('a stored username over 15 characters is not presented as the canonical username', () => {
    const long = 'averyveryverylongname';
    const snapshot = snapshotFor({ username: long, display_name: 'Short Name' });
    expect(snapshot.status).toBe('authenticated');
    expect(snapshot.canonicalUsername).toBeNull();
    expect(snapshot.displayName).toBe('Short Name');
    expect(JSON.stringify(snapshot)).not.toContain(long);
  });

  test('with nothing else stored the display name falls back to the account address name', () => {
    const snapshot = snapshotFor({ username: 'a'.repeat(30) }, 'fallback@example.test');
    expect(snapshot.canonicalUsername).toBeNull();
    expect(snapshot.displayName).toBe('fallback');
  });

  test('a valid stored username is unchanged', () => {
    const snapshot = snapshotFor({ username: 'canonical-owner' });
    expect(snapshot.canonicalUsername).toBe('canonical-owner');
    expect(snapshot.displayName).toBe('canonical-owner');
  });
});
