import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import {
  buildMazerLegacyOriginAnalyticsPayload,
  consumeMazerLegacyOriginMarker
} from '../../src/telemetry/legacyOriginAnalytics';

describe('Mazer legacy origin analytics', () => {
  test('uses one closed anonymous compatibility payload', () => {
    expect(buildMazerLegacyOriginAnalyticsPayload()).toEqual({
      compatibility: 'mazer_legacy_origin',
      event: 'compatibility_visit',
      product: 'mazer',
      route: 'app'
    });
  });

  test('uses only explicit credentialless transport', () => {
    const client = readFileSync(
      resolve(process.cwd(), 'src/telemetry/legacyOriginAnalytics.ts'),
      'utf8'
    );
    expect(client).toMatch(/credentials:\s*['"]omit['"]/);
    expect(client).not.toContain('sendBeacon');
  });

  test('consumes the exact marker once while preserving other URL state', () => {
    expect(
      consumeMazerLegacyOriginMarker(
        'https://mazer.fawxzzy.com/play?level=2&compatibility=mazer_legacy_origin#game'
      )
    ).toEqual({ matched: true, replacement: '/play?level=2#game' });
    expect(consumeMazerLegacyOriginMarker('https://mazer.fawxzzy.com/play?level=2').matched)
      .toBe(false);
  });
});
