import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

export const MAZER_ICON_CACHE_VERSION = 'mazer-final-icon-v2';
export const MAZER_ICON_DELIVERY_PATHS = Object.freeze([
  'favicon.ico',
  'icons/mazer-app-icon.ico',
  'icons/mazer-app-icon.png',
  'icons/apple-touch-icon.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-192-maskable.png',
  'icons/icon-512-maskable.png'
]);

const sha256 = (payload) => createHash('sha256').update(payload).digest('hex');
const workboxRevision = (payload) => createHash('md5').update(payload).digest('hex');

const parseBaseUrl = (value) => {
  const parsed = new URL(value);
  if (
    parsed.protocol !== 'https:'
    || parsed.username
    || parsed.password
    || parsed.pathname !== '/'
    || parsed.search
    || parsed.hash
  ) {
    throw new Error(`Base URL must be one exact HTTPS origin root: ${value}`);
  }
  return parsed;
};

const rejectAmbiguousPathSyntax = (rawValue, base) => {
  if (!rawValue || rawValue.trim() !== rawValue) {
    throw new Error(`Precache URL must be nonempty and unpadded: ${JSON.stringify(rawValue)}`);
  }
  if (/[\p{Cc}\p{Cf}\p{White_Space}\\]/u.test(rawValue)) {
    throw new Error(`Precache URL contains whitespace, a control character, or backslash: ${JSON.stringify(rawValue)}`);
  }
  if (rawValue.includes('?') || rawValue.includes('#')) {
    throw new Error(`Precache URL must not contain a query or hash: ${rawValue}`);
  }
  if (rawValue.startsWith('//')) {
    throw new Error(`Protocol-relative precache URL is forbidden: ${rawValue}`);
  }
  if (rawValue.includes('%')) {
    throw new Error(`Percent-encoded precache URL is forbidden: ${rawValue}`);
  }

  let rawPath = rawValue;
  const schemeMatch = rawValue.match(/^[a-z][a-z0-9+.-]*:/iu);
  if (schemeMatch) {
    let absolute;
    try {
      absolute = new URL(rawValue);
    } catch {
      throw new Error(`Absolute precache URL is invalid: ${rawValue}`);
    }
    if (absolute.origin !== base.origin) {
      throw new Error(`Foreign-origin precache URL is forbidden: ${rawValue}`);
    }
    const canonicalPrefix = `${base.origin}/`;
    if (!rawValue.startsWith(canonicalPrefix)) {
      throw new Error(`Absolute precache URL must use the exact canonical origin form: ${rawValue}`);
    }
    rawPath = rawValue.slice(base.origin.length);
  }
  if (!/^\/?[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/u.test(rawPath)) {
    throw new Error(`Precache URL does not match the exact path grammar: ${rawValue}`);
  }
  if (rawPath.includes('//')) {
    throw new Error(`Precache URL contains an ambiguous empty segment: ${rawValue}`);
  }
  const segments = rawPath.split('/');
  if (segments.some((segment) => segment === '.' || segment === '..')) {
    throw new Error(`Precache URL contains traversal: ${rawValue}`);
  }
};

export const normalizeSameOriginPrecacheKey = (value, baseUrl) => {
  if (typeof value !== 'string') {
    throw new Error('Precache URL must be a string.');
  }
  const base = parseBaseUrl(baseUrl);
  rejectAmbiguousPathSyntax(value, base);

  let parsed;
  try {
    parsed = new URL(value, base);
  } catch {
    throw new Error(`Precache URL is invalid: ${value}`);
  }
  if (parsed.origin !== base.origin) {
    throw new Error(`Foreign-origin precache URL is forbidden: ${value}`);
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error(`Precache URL contains forbidden authority, query, or hash state: ${value}`);
  }
  if (!parsed.pathname.startsWith('/') || parsed.pathname === '/' || parsed.pathname.endsWith('/')) {
    throw new Error(`Precache URL must identify one file path: ${value}`);
  }

  return parsed.pathname.slice(1);
};

const findSinglePrecacheArray = (serviceWorkerSource) => {
  const marker = 'precacheAndRoute(';
  const firstMarker = serviceWorkerSource.indexOf(marker);
  if (firstMarker < 0) throw new Error('Workbox precacheAndRoute call is missing.');
  if (serviceWorkerSource.indexOf(marker, firstMarker + marker.length) >= 0) {
    throw new Error('Multiple Workbox precacheAndRoute calls are forbidden.');
  }

  let index = firstMarker + marker.length;
  while (/\s/u.test(serviceWorkerSource[index] ?? '')) index += 1;
  if (serviceWorkerSource[index] !== '[') {
    throw new Error('Workbox precacheAndRoute must receive a literal entry array.');
  }

  const arrayStart = index;
  let depth = 0;
  let quote = null;
  let escaped = false;
  for (; index < serviceWorkerSource.length; index += 1) {
    const character = serviceWorkerSource[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === quote) quote = null;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === '[') depth += 1;
    if (character === ']') {
      depth -= 1;
      if (depth === 0) return serviceWorkerSource.slice(arrayStart, index + 1);
    }
  }

  throw new Error('Workbox precache entry array is unterminated.');
};

export const extractWorkboxPrecacheEntries = (serviceWorkerSource) => {
  if (typeof serviceWorkerSource !== 'string' || serviceWorkerSource.length === 0) {
    throw new Error('Service-worker source must be a nonempty string.');
  }
  const arraySource = findSinglePrecacheArray(serviceWorkerSource);
  const content = arraySource.slice(1, -1);
  const entryPattern = /^\{\s*url\s*:\s*("(?:\\.|[^"\\])*")\s*,\s*revision\s*:\s*(null|"(?:\\.|[^"\\])*")\s*\}/u;
  const entries = [];
  let cursor = 0;
  const skipWhitespace = () => {
    while (/\s/u.test(content[cursor] ?? '')) cursor += 1;
  };
  skipWhitespace();
  while (cursor < content.length) {
    const match = content.slice(cursor).match(entryPattern);
    if (!match) {
      throw new Error(`Unable to parse complete Workbox precache array at offset ${cursor}.`);
    }
    entries.push({
      revision: match[2] === 'null' ? null : JSON.parse(match[2]),
      url: JSON.parse(match[1])
    });
    cursor += match[0].length;
    skipWhitespace();
    if (cursor === content.length) break;
    if (content[cursor] !== ',') {
      throw new Error(`Unexpected Workbox precache array syntax at offset ${cursor}.`);
    }
    cursor += 1;
    skipWhitespace();
    if (cursor === content.length) {
      throw new Error('Trailing comma in Workbox precache array is forbidden.');
    }
  }
  if (entries.length === 0) {
    throw new Error('Workbox precache entry array must not be empty.');
  }
  return entries;
};

const indexAssetRecords = (records, label, baseUrl) => {
  if (!Array.isArray(records) || records.length === 0) throw new Error(`${label} assets must be a nonempty array.`);
  const indexed = new Map();
  for (const record of records) {
    if (!record || !(record.payload instanceof Uint8Array)) {
      throw new Error(`${label} asset records require a URL and byte payload.`);
    }
    const key = normalizeSameOriginPrecacheKey(record.url, baseUrl);
    if (indexed.has(key)) throw new Error(`Duplicate normalized ${label} asset: ${key}`);
    indexed.set(key, Buffer.from(record.payload));
  }
  return indexed;
};

export const verifyWorkboxPrecacheCoverage = ({ baseUrl, entries, expectedAssets }) => {
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new Error('Workbox precache entries must be a nonempty array.');
  }
  const expected = indexAssetRecords(expectedAssets, 'expected', baseUrl);
  const normalizedEntries = new Map();
  for (const entry of entries) {
    if (!entry || (entry.revision !== null && (typeof entry.revision !== 'string' || !entry.revision))) {
      throw new Error('Every Workbox precache entry must have a string URL and a null or nonempty revision.');
    }
    const key = normalizeSameOriginPrecacheKey(entry.url, baseUrl);
    if (normalizedEntries.has(key)) {
      throw new Error(`Duplicate normalized Workbox precache entry: ${key}`);
    }
    normalizedEntries.set(key, entry);
  }

  for (const [key, expectedPayload] of expected) {
    const entry = normalizedEntries.get(key);
    if (!entry) throw new Error(`Missing Workbox precache entry: ${key}`);
    if (entry.revision === null) throw new Error(`Icon precache entry requires a content revision: ${key}`);
    const expectedRevision = workboxRevision(expectedPayload);
    if (entry.revision !== expectedRevision) {
      throw new Error(`Workbox content revision mismatch: ${key} expected ${expectedRevision} actual ${entry.revision}`);
    }
  }

  return {
    expectedIconCount: expected.size,
    normalizedEntryCount: normalizedEntries.size,
    normalizedIconKeys: [...expected.keys()]
  };
};

export const verifyDeliveredAssetBytes = ({ actualAssets, baseUrl, expectedAssets }) => {
  const expected = indexAssetRecords(expectedAssets, 'expected', baseUrl);
  const actual = indexAssetRecords(actualAssets, 'actual', baseUrl);
  const assets = [];
  for (const [key, expectedPayload] of expected) {
    const actualPayload = actual.get(key);
    if (!actualPayload) throw new Error(`Missing delivered icon asset: ${key}`);
    if (!actualPayload.equals(expectedPayload)) {
      throw new Error(
        `Delivered icon byte identity mismatch: ${key} expected ${expectedPayload.length}/${sha256(expectedPayload)} actual ${actualPayload.length}/${sha256(actualPayload)}`
      );
    }
    assets.push({ bytes: actualPayload.length, sha256: sha256(actualPayload), url: key });
  }
  return assets;
};

const resolveOptionPath = (value) => (isAbsolute(value) ? resolve(value) : resolve(process.cwd(), value));

const parseArguments = (arguments_) => {
  const options = {
    baseUrl: 'https://mazer.fawxzzy.com/',
    deliveryRoot: resolve(REPO_ROOT, 'dist'),
    expectedRoot: resolve(REPO_ROOT, 'public'),
    remote: false,
    serviceWorker: resolve(REPO_ROOT, 'dist', 'app-sw.js')
  };
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === '--remote') {
      options.remote = true;
      continue;
    }
    if (['--base-url', '--delivery-root', '--expected-root', '--service-worker'].includes(argument)) {
      const value = arguments_[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`${argument} requires a value.`);
      if (argument === '--base-url') options.baseUrl = value;
      else if (argument === '--delivery-root') options.deliveryRoot = resolveOptionPath(value);
      else if (argument === '--expected-root') options.expectedRoot = resolveOptionPath(value);
      else options.serviceWorker = resolveOptionPath(value);
      index += 1;
      continue;
    }
    throw new Error(`Unsupported argument: ${argument}`);
  }
  parseBaseUrl(options.baseUrl);
  if (options.remote && arguments_.some((argument) => argument === '--delivery-root' || argument === '--service-worker')) {
    throw new Error('--remote cannot be combined with --delivery-root or --service-worker.');
  }
  return options;
};

const readAssetRecords = async (root, paths) => Promise.all(paths.map(async (url) => ({
  payload: await readFile(resolve(root, url)),
  url
})));

const fetchSameOriginBytes = async (baseUrl, requestPath) => {
  const base = parseBaseUrl(baseUrl);
  const requestUrl = new URL(requestPath, base);
  if (requestUrl.origin !== base.origin) throw new Error(`Foreign-origin delivery request is forbidden: ${requestUrl}`);
  const response = await fetch(requestUrl, {
    cache: 'no-store',
    headers: { 'cache-control': 'no-cache' },
    redirect: 'manual'
  });
  if (response.status !== 200 || response.redirected || new URL(response.url).origin !== base.origin) {
    throw new Error(`Delivery request failed closed: ${requestUrl} status=${response.status} response=${response.url}`);
  }
  return Buffer.from(await response.arrayBuffer());
};

const main = async () => {
  const options = parseArguments(process.argv.slice(2));
  const expectedAssets = await readAssetRecords(options.expectedRoot, MAZER_ICON_DELIVERY_PATHS);
  const serviceWorkerSource = options.remote
    ? (await fetchSameOriginBytes(options.baseUrl, `app-sw.js?v=${MAZER_ICON_CACHE_VERSION}`)).toString('utf8')
    : await readFile(options.serviceWorker, 'utf8');
  const actualAssets = options.remote
    ? await Promise.all(MAZER_ICON_DELIVERY_PATHS.map(async (url) => ({
      payload: await fetchSameOriginBytes(options.baseUrl, `${url}?v=${MAZER_ICON_CACHE_VERSION}`),
      url
    })))
    : await readAssetRecords(options.deliveryRoot, MAZER_ICON_DELIVERY_PATHS);
  const entries = extractWorkboxPrecacheEntries(serviceWorkerSource);
  const precache = verifyWorkboxPrecacheCoverage({ baseUrl: options.baseUrl, entries, expectedAssets });
  const assets = verifyDeliveredAssetBytes({ actualAssets, baseUrl: options.baseUrl, expectedAssets });
  console.log(JSON.stringify({
    assets,
    baseUrl: options.baseUrl,
    cacheVersion: MAZER_ICON_CACHE_VERSION,
    mode: options.remote ? 'remote' : 'local-built-delivery',
    precache,
    result: 'PASS'
  }, null, 2));
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
