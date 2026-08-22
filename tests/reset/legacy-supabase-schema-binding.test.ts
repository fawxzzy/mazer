import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import {
  LEGACY_SUPABASE_SCHEMA_BY_PROJECT_REF,
  resolveLegacySupabaseProjectRef,
  resolveLegacySupabaseSchemaForUrl
} from '../../src/legacy-runtime/legacySupabaseSchemaBinding';

describe('resolveLegacySupabaseProjectRef', () => {
  test('extracts the project ref from a well-formed Supabase URL', () => {
    expect(resolveLegacySupabaseProjectRef('https://geknvnrmktchljnyddwp.supabase.co'))
      .toBe('geknvnrmktchljnyddwp');
    expect(resolveLegacySupabaseProjectRef('https://bxtcuhkotumitoqtrcej.supabase.co'))
      .toBe('bxtcuhkotumitoqtrcej');
  });

  test('tolerates a single trailing slash and surrounding whitespace', () => {
    expect(resolveLegacySupabaseProjectRef('https://geknvnrmktchljnyddwp.supabase.co/'))
      .toBe('geknvnrmktchljnyddwp');
    expect(resolveLegacySupabaseProjectRef('  https://geknvnrmktchljnyddwp.supabase.co  '))
      .toBe('geknvnrmktchljnyddwp');
  });

  test('normalizes ref casing rather than rejecting on it', () => {
    expect(resolveLegacySupabaseProjectRef('https://GeknvnRmktchljnyddwp.supabase.co'))
      .toBe('geknvnrmktchljnyddwp');
  });

  test('rejects a URL with an extra path segment', () => {
    expect(resolveLegacySupabaseProjectRef('https://geknvnrmktchljnyddwp.supabase.co/rest/v1')).toBeNull();
  });

  test('rejects http (non-https)', () => {
    expect(resolveLegacySupabaseProjectRef('http://geknvnrmktchljnyddwp.supabase.co')).toBeNull();
  });

  test('rejects a different host entirely', () => {
    expect(resolveLegacySupabaseProjectRef('https://geknvnrmktchljnyddwp.evil.example.com')).toBeNull();
    expect(resolveLegacySupabaseProjectRef('https://supabase.co')).toBeNull();
  });

  test('rejects malformed or empty input', () => {
    expect(resolveLegacySupabaseProjectRef('')).toBeNull();
    expect(resolveLegacySupabaseProjectRef('not-a-url')).toBeNull();
    expect(resolveLegacySupabaseProjectRef('https://')).toBeNull();
  });
});

describe('resolveLegacySupabaseSchemaForUrl', () => {
  test('binds the legacy/rollback project to the public schema', () => {
    expect(resolveLegacySupabaseSchemaForUrl('https://geknvnrmktchljnyddwp.supabase.co')).toBe('public');
  });

  test('binds the shared consolidation-target project to the mazer schema', () => {
    expect(resolveLegacySupabaseSchemaForUrl('https://bxtcuhkotumitoqtrcej.supabase.co')).toBe('mazer');
  });

  test('fails closed (returns null, never a default schema) for an unrecognized project', () => {
    expect(resolveLegacySupabaseSchemaForUrl('https://some-other-project.supabase.co')).toBeNull();
  });

  test('fails closed for a URL that does not parse as a Supabase project URL at all', () => {
    expect(resolveLegacySupabaseSchemaForUrl('https://geknvnrmktchljnyddwp.supabase.co/extra/path')).toBeNull();
    expect(resolveLegacySupabaseSchemaForUrl('not-a-url')).toBeNull();
    expect(resolveLegacySupabaseSchemaForUrl('')).toBeNull();
  });

  test('never returns an empty string in place of null', () => {
    // A falsy-but-truthy-looking empty string would be an easy way for a
    // caller's `if (!schema)` check to silently do the wrong thing compared
    // to `=== null` -- assert the actual sentinel value, not just falsiness.
    const result = resolveLegacySupabaseSchemaForUrl('https://unknown-project.supabase.co');
    expect(result).toBe(null);
    expect(result).not.toBe('');
  });
});

describe('LEGACY_SUPABASE_SCHEMA_BY_PROJECT_REF', () => {
  test('is the exhaustive, exact allowlist this module documents', () => {
    // Locks the allowlist's actual contents, not just its behavior through
    // the resolver functions -- a change here should be a deliberate,
    // reviewed edit to this test, not a silent side effect of some other
    // change.
    expect(LEGACY_SUPABASE_SCHEMA_BY_PROJECT_REF).toEqual({
      geknvnrmktchljnyddwp: 'public',
      bxtcuhkotumitoqtrcej: 'mazer'
    });
  });

  test('is frozen so a caller cannot mutate the shared allowlist at runtime', () => {
    expect(Object.isFrozen(LEGACY_SUPABASE_SCHEMA_BY_PROJECT_REF)).toBe(true);
  });
});

describe('getLegacyAuthClient wiring', () => {
  // getLegacyAuthClient itself is awkward to exercise end-to-end in a unit
  // test (dynamic `import('@supabase/supabase-js')`, a module-level client
  // singleton that survives across calls, and no env-override parameter of
  // its own -- unlike resolveLegacyAuthConfig in this same file, which
  // already takes one for exactly this reason). Since the fail-closed
  // behavior itself is exhaustively covered above at the resolver level,
  // this asserts the *wiring* is actually in place -- that the client
  // construction path really does gate on resolveLegacySupabaseSchemaForUrl
  // and bail out on a null schema -- by reading the source rather than
  // re-implementing a second copy of the singleton/dynamic-import test
  // harness just to reach the same two lines.
  test('gates client construction on resolveLegacySupabaseSchemaForUrl and fails closed on a null schema', () => {
    const authSource = readFileSync(resolve(process.cwd(), 'src/legacy-runtime/legacyAuth.ts'), 'utf8');

    expect(authSource).toContain(
      "import { resolveLegacySupabaseSchemaForUrl } from './legacySupabaseSchemaBinding';"
    );
    expect(authSource).toContain('const schema = resolveLegacySupabaseSchemaForUrl(config.url);');
    expect(authSource).toContain('if (schema === null) {');
    // The old unconditional binding must be gone, not just supplemented.
    expect(authSource).not.toContain("schema: 'mazer'");
    expect(authSource).toMatch(/db:\s*\{\s*schema\s*\}/);
  });
});
