import { Buffer } from 'node:buffer';
import { describe, expect, test } from 'vitest';
import {
  extractWorkboxPrecacheEntries,
  normalizeSameOriginPrecacheKey,
  verifyDeliveredAssetBytes,
  verifyWorkboxPrecacheCoverage
} from '../../scripts/brand/verify-mazer-icon-delivery.mjs';

const BASE_URL = 'https://mazer.fawxzzy.com/';
const revision = '0123456789abcdef0123456789abcdef';
const entry = (url) => ({ revision, url });

describe('Mazer icon-delivery verifier', () => {
  test('normalizes only equivalent same-origin path forms', () => {
    expect(normalizeSameOriginPrecacheKey('favicon.ico', BASE_URL)).toBe('favicon.ico');
    expect(normalizeSameOriginPrecacheKey('/favicon.ico', BASE_URL)).toBe('favicon.ico');
    expect(normalizeSameOriginPrecacheKey('https://mazer.fawxzzy.com/favicon.ico', BASE_URL)).toBe('favicon.ico');
  });

  test.each([
    ['foreign origin', 'https://evil.example/favicon.ico'],
    ['protocol-relative origin', '//evil.example/favicon.ico'],
    ['parent traversal', 'icons/../favicon.ico'],
    ['dot traversal', 'icons/./favicon.ico'],
    ['encoded traversal', 'icons/%2e%2e/favicon.ico'],
    ['query', 'favicon.ico?v=mazer-final-icon-v2'],
    ['hash', 'favicon.ico#icon'],
    ['backslash', 'icons\\favicon.ico'],
    ['empty segment', 'icons//favicon.ico'],
    ['directory', 'icons/'],
    ['padded path', ' favicon.ico']
  ])('rejects hostile or ambiguous %s input', (_label, value) => {
    expect(() => normalizeSameOriginPrecacheKey(value, BASE_URL)).toThrow();
  });

  test('extracts the complete generated Workbox entry shape without evaluating it', () => {
    const source = 'self.workbox.precacheAndRoute([{url:"favicon.ico",revision:"abc"},{url:"assets/main.js",revision:null}],{});';
    expect(extractWorkboxPrecacheEntries(source)).toEqual([
      { revision: 'abc', url: 'favicon.ico' },
      { revision: null, url: 'assets/main.js' }
    ]);
  });

  test.each([
    'self.workbox.precacheAndRoute([{url:"favicon.ico"}],{});',
    'self.workbox.precacheAndRoute(dynamicEntries,{});',
    'self.workbox.precacheAndRoute([{url:"favicon.ico",revision:"abc"}],{});self.workbox.precacheAndRoute([],{});'
  ])('rejects incomplete or ambiguous Workbox source', (source) => {
    expect(() => extractWorkboxPrecacheEntries(source)).toThrow();
  });

  test('accepts slash and non-slash forms while requiring content revisions', () => {
    const result = verifyWorkboxPrecacheCoverage({
      baseUrl: BASE_URL,
      entries: [entry('favicon.ico'), entry('/icons/icon-192.png')],
      expectedPaths: ['/favicon.ico', 'icons/icon-192.png']
    });
    expect(result.normalizedIconKeys).toEqual(['favicon.ico', 'icons/icon-192.png']);
  });

  test('rejects duplicate normalized entries before coverage succeeds', () => {
    expect(() => verifyWorkboxPrecacheCoverage({
      baseUrl: BASE_URL,
      entries: [entry('favicon.ico'), entry('/favicon.ico')],
      expectedPaths: ['favicon.ico']
    })).toThrow(/Duplicate normalized Workbox precache entry/u);
  });

  test('rejects missing and unrevisioned icon entries', () => {
    expect(() => verifyWorkboxPrecacheCoverage({
      baseUrl: BASE_URL,
      entries: [entry('favicon.ico')],
      expectedPaths: ['favicon.ico', 'icons/icon-192.png']
    })).toThrow(/Missing Workbox precache entry/u);
    expect(() => verifyWorkboxPrecacheCoverage({
      baseUrl: BASE_URL,
      entries: [{ revision: null, url: 'favicon.ico' }],
      expectedPaths: ['favicon.ico']
    })).toThrow(/requires a content revision/u);
  });

  test('rejects a hostile non-icon entry instead of ignoring it', () => {
    expect(() => verifyWorkboxPrecacheCoverage({
      baseUrl: BASE_URL,
      entries: [entry('favicon.ico'), entry('https://evil.example/foreign.js')],
      expectedPaths: ['favicon.ico']
    })).toThrow(/Foreign-origin/u);
  });

  test('compares delivered icon payloads byte-for-byte', () => {
    const payload = Buffer.from('exact-icon-bytes');
    expect(verifyDeliveredAssetBytes({
      actualAssets: [{ payload, url: '/favicon.ico' }],
      baseUrl: BASE_URL,
      expectedAssets: [{ payload, url: 'favicon.ico' }]
    })).toEqual([
      expect.objectContaining({ bytes: payload.length, url: 'favicon.ico' })
    ]);
    expect(() => verifyDeliveredAssetBytes({
      actualAssets: [{ payload: Buffer.from('changed'), url: '/favicon.ico' }],
      baseUrl: BASE_URL,
      expectedAssets: [{ payload, url: 'favicon.ico' }]
    })).toThrow(/byte identity mismatch/u);
  });

  test('rejects missing and duplicate delivered payloads', () => {
    const payload = Buffer.from('exact-icon-bytes');
    expect(() => verifyDeliveredAssetBytes({
      actualAssets: [{ payload, url: 'icons/icon-192.png' }],
      baseUrl: BASE_URL,
      expectedAssets: [{ payload, url: 'favicon.ico' }]
    })).toThrow(/Missing delivered icon asset/u);
    expect(() => verifyDeliveredAssetBytes({
      actualAssets: [{ payload, url: 'favicon.ico' }, { payload, url: '/favicon.ico' }],
      baseUrl: BASE_URL,
      expectedAssets: [{ payload, url: 'favicon.ico' }]
    })).toThrow(/Duplicate normalized actual asset/u);
  });
});
