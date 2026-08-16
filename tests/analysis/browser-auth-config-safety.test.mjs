import { describe, expect, test } from 'vitest';
import {
  classifyBrowserSupabaseConfig,
  inspectBrowserAuthBundle
} from '../../scripts/analysis/browser-auth-config-safety.mjs';

const anonToken = [
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',
  'eyJyb2xlIjoiYW5vbiJ9',
  'signature'
].join('.');

describe('browser auth configuration safety', () => {
  test('accepts an anon browser key without exposing its value', () => {
    expect(classifyBrowserSupabaseConfig({
      anonKey: anonToken,
      url: 'https://example-project.supabase.co'
    })).toMatchObject({
      configured: true,
      pass: true,
      reasonCodes: []
    });
  });

  test('rejects secret-shaped client values and non-anon JWTs', () => {
    expect(classifyBrowserSupabaseConfig({
      anonKey: 'sb_secret_not-for-browser',
      url: 'https://example-project.supabase.co'
    }).reasonCodes).toContain('browser_supabase_key_forbidden_kind');

    const serviceToken = [
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',
      'eyJyb2xlIjoic2VydmljZV9yb2xlIn0',
      'signature'
    ].join('.');
    expect(inspectBrowserAuthBundle(`const key = '${serviceToken}';`).reasonCodes)
      .toContain('browser_bundle_contains_non_anon_supabase_jwt');
  });
});
