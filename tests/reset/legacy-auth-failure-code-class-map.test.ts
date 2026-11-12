import { describe, expect, test } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { LEGACY_AUTH_FAILURE_CODES } from '../../src/legacy-runtime/legacyAuthFailureCodes';
import {
  resolveLegacyOAuthFailureClass,
  resolveLegacyOAuthFailureTechnicalDetail
} from '../../src/legacy-runtime/legacyPlayerMessage';

// MAZER-PROG-017: every sign-in / boot failure code that src/ can emit must have
// an entry in the failure class map (LEGACY_OAUTH_FAILURE_CLASS_BY_CODE in
// legacyPlayerMessage.ts). An unmapped code is recorded as
// `oauth-failure:unmapped`, which hides what actually failed.
//
// The emitted set is derived by a static scan of the source, not from a list in
// this test, so a new code added anywhere below makes this test fail until it is
// mapped. The scan covers:
//   1. the MazerOAuthFailureCategory union and every `failed('x')` /
//      `category: 'x'` call in the OAuth portal (callback + pre-flight codes,
//      including provider_unreachable from MAZER-ACCT-036),
//   2. every value in LEGACY_AUTH_FAILURE_CODES (MAZER-ACCT-014: session_quarantined,
//      session_read_failed, portal_navigation_failed, provider_unreachable),
//   3. every string literal assigned to an `errorCode` anywhere in src/.

const ROOT = resolve(__dirname, '../..');
const SRC = join(ROOT, 'src');
const CODE_PATTERN = '[a-z]+(?:_[a-z]+)+|cancelled';

const readSource = (path: string): string => readFileSync(path, 'utf8');

const listSourceFiles = (dir: string): string[] => readdirSync(dir).flatMap((name) => {
  const full = join(dir, name);
  if (statSync(full).isDirectory()) {
    return listSourceFiles(full);
  }
  return /\.(ts|tsx|mjs|js)$/.test(name) ? [full] : [];
});

const matchAll = (source: string, pattern: RegExp): string[] => (
  [...source.matchAll(pattern)].map((match) => match[1] as string)
);

const PORTAL_PATH = 'src/legacy-runtime/legacyAccountPortal.ts';
const CODES_PATH = 'src/legacy-runtime/legacyAuthFailureCodes.ts';

/** Pure scanner so the test can prove it catches a code that has no mapping. */
const scanEmittedFailureCodes = (files: ReadonlyMap<string, string>): Map<string, Set<string>> => {
  const found = new Map<string, Set<string>>();
  const add = (code: string, where: string): void => {
    const places = found.get(code) ?? new Set<string>();
    places.add(where);
    found.set(code, places);
  };

  const portal = files.get(PORTAL_PATH) ?? '';
  const unionMatch = /export type MazerOAuthFailureCategory =([\s\S]*?);\r?\n/.exec(portal);
  for (const code of matchAll(unionMatch?.[1] ?? '', /'([a-z_]+)'/g)) {
    add(code, `${PORTAL_PATH} (MazerOAuthFailureCategory)`);
  }
  for (const code of matchAll(portal, new RegExp(`\\bfailed\\('(${CODE_PATTERN})'\\)`, 'g'))) {
    add(code, `${PORTAL_PATH} (failed())`);
  }
  for (const code of matchAll(portal, new RegExp(`category:\\s*'(${CODE_PATTERN})'`, 'g'))) {
    add(code, `${PORTAL_PATH} (category:)`);
  }

  const codesSource = files.get(CODES_PATH) ?? '';
  const objectMatch = /export const LEGACY_AUTH_FAILURE_CODES = \{([\s\S]*?)\} as const;/.exec(codesSource);
  for (const code of matchAll(objectMatch?.[1] ?? '', /:\s*'([a-z_]+)'/g)) {
    add(code, `${CODES_PATH} (LEGACY_AUTH_FAILURE_CODES)`);
  }

  for (const [path, text] of files) {
    for (const code of matchAll(text, /\berrorCode:\s*'([a-z_]+)'/g)) {
      add(code, `${path} (errorCode:)`);
    }
  }
  return found;
};

/** The codes in the source that have no class map entry (pure; used by the test and its self-check). */
const findUnmappedFailureCodes = (
  emitted: ReadonlyMap<string, ReadonlySet<string>>,
  isMapped: (code: string) => boolean
): string[] => [...emitted.keys()].filter((code) => !isMapped(code)).sort();

const loadRealSources = (): Map<string, string> => {
  const files = new Map<string, string>();
  for (const full of listSourceFiles(SRC)) {
    files.set(relative(ROOT, full).replace(/\\/g, '/'), readSource(full));
  }
  return files;
};

const isMappedInRealClassMap = (code: string): boolean => (
  resolveLegacyOAuthFailureTechnicalDetail(code) === `oauth-failure:${code}`
);

const readClassMapKeys = (): string[] => {
  const source = readSource(join(SRC, 'legacy-runtime/legacyPlayerMessage.ts'));
  const block = /const LEGACY_OAUTH_FAILURE_CLASS_BY_CODE[^=]*=\s*\{([\s\S]*?)\n\};/.exec(source);
  return matchAll(block?.[1] ?? '', /^\s{2}([a-z_]+):\s*'[A-Za-z]+',?\s*$/gm);
};

const KNOWN_CODES = [
  // OAuth callback and sign-in start
  'authorization_unavailable',
  'cancelled',
  'exchange_unavailable',
  'expired_or_missing_state',
  'invalid_state',
  'pending_expired',
  'session_invalid',
  'storage_unavailable',
  // MAZER-ACCT-036
  'provider_unreachable',
  // MAZER-ACCT-014
  'portal_navigation_failed',
  'session_quarantined',
  'session_read_failed'
];

describe('sign-in failure codes are pinned to the class map (MAZER-PROG-017)', () => {
  const emitted = scanEmittedFailureCodes(loadRealSources());

  test('the static scan finds every known code (guards the scan against rotting)', () => {
    for (const code of KNOWN_CODES) {
      expect(emitted.has(code), `scan did not find "${code}"`).toBe(true);
    }
  });

  test('the scan includes provider_unreachable and the three boot codes from every place they are emitted', () => {
    expect([...(emitted.get('provider_unreachable') ?? [])].some((place) => place.includes('legacyAccountPortal.ts'))).toBe(true);
    expect([...(emitted.get('provider_unreachable') ?? [])].some((place) => place.includes('legacyAuthFailureCodes.ts'))).toBe(true);
    for (const value of Object.values(LEGACY_AUTH_FAILURE_CODES)) {
      expect(emitted.has(value), `LEGACY_AUTH_FAILURE_CODES value "${value}" not found by the scan`).toBe(true);
    }
  });

  test('every emitted code is a plain snake_case token', () => {
    for (const code of emitted.keys()) {
      expect(code, code).toMatch(/^(?:[a-z]+(?:_[a-z]+)+|cancelled)$/);
    }
  });

  test('every code emitted anywhere in src/ has a class map entry', () => {
    const unmapped = findUnmappedFailureCodes(emitted, isMappedInRealClassMap);
    expect(unmapped, `emitted without a class map entry: ${unmapped.join(', ')}`).toEqual([]);
    for (const code of emitted.keys()) {
      expect(resolveLegacyOAuthFailureTechnicalDetail(code)).toBe(`oauth-failure:${code}`);
      expect(resolveLegacyOAuthFailureClass(code)).toBeTypeOf('string');
    }
  });

  test('provider_unreachable records oauth-failure:provider_unreachable and its own class', () => {
    expect(resolveLegacyOAuthFailureTechnicalDetail('provider_unreachable')).toBe('oauth-failure:provider_unreachable');
    expect(resolveLegacyOAuthFailureClass('provider_unreachable')).toBe('providerUnreachable');
  });

  test('the class map has no entry that nothing emits (a dead mapping is a stale pin)', () => {
    const keys = readClassMapKeys();
    expect(keys.length).toBeGreaterThanOrEqual(KNOWN_CODES.length);
    const dead = keys.filter((key) => !emitted.has(key));
    expect(dead, `mapped but never emitted: ${dead.join(', ')}`).toEqual([]);
    expect([...keys].sort()).toEqual([...emitted.keys()].sort());
  });

  describe('the check really fails when a code is emitted without a mapping', () => {
    const real = loadRealSources();

    test('a new failed("...") call in the portal is picked up and reported unmapped', () => {
      const files = new Map(real);
      files.set(PORTAL_PATH, `${real.get(PORTAL_PATH)}\nconst example = () => failed('brand_new_failure');\n`);
      const scanned = scanEmittedFailureCodes(files);
      expect(scanned.has('brand_new_failure')).toBe(true);
      expect(findUnmappedFailureCodes(scanned, isMappedInRealClassMap)).toEqual(['brand_new_failure']);
    });

    test('a new LEGACY_AUTH_FAILURE_CODES value is picked up and reported unmapped', () => {
      const files = new Map(real);
      files.set(
        CODES_PATH,
        (real.get(CODES_PATH) as string).replace(
          "sessionReadFailed: 'session_read_failed'",
          "sessionReadFailed: 'session_read_failed',\n  brandNew: 'brand_new_boot_failure'"
        )
      );
      expect(findUnmappedFailureCodes(scanEmittedFailureCodes(files), isMappedInRealClassMap)).toEqual(['brand_new_boot_failure']);
    });

    test('a new member of the MazerOAuthFailureCategory union is picked up and reported unmapped', () => {
      const files = new Map(real);
      files.set(
        PORTAL_PATH,
        (real.get(PORTAL_PATH) as string).replace("| 'storage_unavailable';", "| 'storage_unavailable'\n  | 'brand_new_category';")
      );
      expect(findUnmappedFailureCodes(scanEmittedFailureCodes(files), isMappedInRealClassMap)).toEqual(['brand_new_category']);
    });

    test('an errorCode literal anywhere in src/ is picked up and reported unmapped', () => {
      const files = new Map(real);
      files.set('src/scenes/Example.ts', "const snapshot = { errorCode: 'brand_new_scene_failure' };\n");
      expect(findUnmappedFailureCodes(scanEmittedFailureCodes(files), isMappedInRealClassMap)).toEqual(['brand_new_scene_failure']);
    });
  });
});
