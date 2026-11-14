import { describe, expect, test } from 'vitest';
import {
  MAZER_PRESENCE_CHANNEL,
  MAZER_PRESENCE_ORIGINS,
  MAZER_PRESENCE_TRACK_PAYLOAD,
  countPresence,
  formatOnline,
  formatOnlineGlyph,
  isBrowserSafePresenceKey,
  isMazerPresenceOrigin,
  resolvePresenceRealtimeUrl
} from '../../src/legacy-runtime/legacyPresenceContract';
import { isLegacyGlyphWordRenderable } from '../../src/legacy-runtime/legacyMenuTitle';

const jwt = (role: string): string => {
  const encode = (value: object): string => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ role })}.signaturesignaturesignature`;
};

describe('MAZER-UI-024 presence contract', () => {
  test('uses its own channel, never the website channel, and runs only on the production Mazer origin', () => {
    expect(MAZER_PRESENCE_CHANNEL).toBe('mazer-presence-v1');
    expect(MAZER_PRESENCE_CHANNEL).not.toBe('web-presence-v1');
    expect(MAZER_PRESENCE_ORIGINS).toEqual(['https://mazer.fawxzzy.com']);
    expect(isMazerPresenceOrigin('https://mazer.fawxzzy.com')).toBe(true);
    for (const origin of ['http://localhost:5173', 'https://mazer-git-x.vercel.app', 'https://www.mazer.fawxzzy.com', 'https://fawxzzy.com', '', null, undefined]) {
      expect(isMazerPresenceOrigin(origin)).toBe(false);
    }
  });

  test('countPresence recomputes from the snapshot: one per key with at least one entry', () => {
    expect(countPresence({})).toBe(0);
    expect(countPresence({ a: [{ v: 1 }], b: [{ v: 1 }, { v: 1 }], c: [] })).toBe(2);
    for (const bad of [null, undefined, 3, 'x', [], [{ v: 1 }], { a: 'nope' }]) {
      expect(countPresence(bad)).toBe(0);
    }
  });

  test('realtime URL only for an https <ref>.supabase.co project origin', () => {
    expect(resolvePresenceRealtimeUrl('https://abcdefghijklmnopqrst.supabase.co')).toBe('wss://abcdefghijklmnopqrst.supabase.co/realtime/v1');
    expect(resolvePresenceRealtimeUrl('https://abcdefghijklmnopqrst.supabase.co/')).toBe('wss://abcdefghijklmnopqrst.supabase.co/realtime/v1');
    for (const bad of [
      'http://abcdefghijklmnopqrst.supabase.co',
      'https://evil.example.com',
      'https://abcdefghijklmnopqrst.supabase.co/rest/v1',
      'https://abcdefghijklmnopqrst.supabase.co?x=1',
      'https://user:pw@abcdefghijklmnopqrst.supabase.co',
      'https://short.supabase.co',
      'not a url',
      '',
      null,
      undefined
    ]) {
      expect(resolvePresenceRealtimeUrl(bad)).toBeNull();
    }
  });

  test('refuses server-side secrets as the browser key', () => {
    expect(isBrowserSafePresenceKey(jwt('anon'))).toBe(true);
    expect(isBrowserSafePresenceKey('sb_publishable_abcdefghijklmnopqrstuvwxyz')).toBe(true);
    expect(isBrowserSafePresenceKey(jwt('service_role'))).toBe(false);
    expect(isBrowserSafePresenceKey('sb_secret_abcdefghijklmnopqrstuvwxyz')).toBe(false);
    for (const bad of ['', 'short', 'has space in it which is long enough', null, undefined]) {
      expect(isBrowserSafePresenceKey(bad)).toBe(false);
    }
  });

  test('the tracked payload carries a version and nothing else (no account, name, route or agent)', () => {
    expect(MAZER_PRESENCE_TRACK_PAYLOAD).toEqual({ v: 1 });
  });

  test('a zero, unknown or invalid count is never text (site style and glyph style)', () => {
    for (const bad of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, null, undefined]) {
      expect(formatOnline(bad)).toBeNull();
      expect(formatOnlineGlyph(bad)).toBeNull();
    }
  });

  test('site-style text matches the website: 7, 999, 1.2k, 12k', () => {
    expect([1, 7, 999, 1000, 1234, 9999, 10000, 12345].map(formatOnline)).toEqual(['1', '7', '999', '1k', '1.2k', '9.9k', '10k', '12k']);
  });

  test('glyph text is letters and digits only, so the tile font can draw it: 1,234 reads 1K, capped at 99K', () => {
    expect([1, 7, 999, 1000, 1234, 9999, 12345, 98765, 5000000].map(formatOnlineGlyph)).toEqual(['1', '7', '999', '1K', '1K', '9K', '12K', '98K', '99K']);
    for (const count of [1, 7, 42, 999, 1000, 1234, 99999, 5000000]) {
      expect(isLegacyGlyphWordRenderable(formatOnlineGlyph(count) as string)).toBe(true);
    }
    expect(isLegacyGlyphWordRenderable('ONLINE')).toBe(true);
  });
});
