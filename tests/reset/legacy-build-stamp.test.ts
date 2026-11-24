import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import {
  LEGACY_BUILD_STAMP_SHA_CHARS,
  formatLegacyBuildStamp,
  readLegacyBuildStamp,
  resolveLegacyMainBundleId,
  toLegacyShortSha
} from '../../src/legacy-runtime/legacyBuildStamp';
import {
  LEGACY_SETTINGS_SIZES,
  buildLegacySettingsSheetModel,
  buildLegacySettingsSheetPlan
} from '../../src/legacy-runtime/legacySettingsSheetPlan';

/**
 * MAZER-FLOW-019: Settings shows the build id and the short sha, both from the build (no network call), with no
 * layout shift (the row is in the plan from the first paint, never added later).
 */
const read = (path: string): string => readFileSync(resolve(__dirname, '../..', path), 'utf8');

const fakeDocument = (srcs: readonly string[]) => ({
  querySelectorAll: () => srcs.map((src) => ({ getAttribute: (name: string) => (name === 'src' ? src : null) }))
});

describe('build stamp values', () => {
  test('the build id is the hashed main bundle name the page loaded', () => {
    expect(resolveLegacyMainBundleId(['/assets/vendor-AbC123.js', '/assets/main-D4otmjLQ.js'])).toBe('main-D4otmjLQ');
    expect(resolveLegacyMainBundleId(['https://mazer.fawxzzy.com/assets/main-x_Y-9zQ1.js?v=2'])).toBe('main-x_Y-9zQ1');
    expect(resolveLegacyMainBundleId(['./assets/main-Q1w2E3r4.js'])).toBe('main-Q1w2E3r4');
  });

  test('a dev server page (/src/main.ts) or an unrelated page has no bundle id', () => {
    expect(resolveLegacyMainBundleId(['/src/main.ts', '/@vite/client'])).toBeNull();
    expect(resolveLegacyMainBundleId(['/assets/proof-surfaces-AbCd1234.js', null, undefined])).toBeNull();
    expect(resolveLegacyMainBundleId([])).toBeNull();
  });

  test('the short sha is the first 8 hex characters of the build-time sha, else null', () => {
    expect(LEGACY_BUILD_STAMP_SHA_CHARS).toBe(8);
    expect(toLegacyShortSha('71757912ABCD')).toBe('71757912');
    expect(toLegacyShortSha('abc1234')).toBe('abc1234');
    expect(toLegacyShortSha(null)).toBeNull();
    expect(toLegacyShortSha('not-a-sha')).toBeNull();
  });

  test('the line reads Build <bundle> · <sha>, with plain fallbacks', () => {
    expect(formatLegacyBuildStamp({ bundleId: 'main-D4otmjLQ', shortSha: '71757912' })).toBe('Build main-D4otmjLQ · 71757912');
    expect(formatLegacyBuildStamp({ bundleId: null, shortSha: '71757912' })).toBe('Build dev · 71757912');
    expect(formatLegacyBuildStamp({ bundleId: 'main-D4otmjLQ', shortSha: null })).toBe('Build main-D4otmjLQ · no sha');
  });

  test('reads the page script tags and the build-time sha, and survives no document', () => {
    expect(readLegacyBuildStamp(fakeDocument(['/assets/main-D4otmjLQ.js']), '71757912abcd'))
      .toEqual({ bundleId: 'main-D4otmjLQ', shortSha: '71757912' });
    expect(readLegacyBuildStamp(null, null)).toEqual({ bundleId: null, shortSha: null });
  });

  test('both values come from the build, never a network call', () => {
    const source = read('src/legacy-runtime/legacyBuildStamp.ts');
    expect(source).not.toMatch(/fetch\(|XMLHttpRequest|navigator\.sendBeacon|supabase/i);
    expect(source).toContain("from './legacyBuildId'");
    expect(read('vite.config.ts')).toContain('__MAZER_BUILD_ID__: JSON.stringify(resolveBuildId())');
  });
});

describe('build stamp row in both Settings sheets', () => {
  const stamp = 'Build main-D4otmjLQ · 71757912';

  test('both sheets end with one non-interactive note row carrying the stamp', () => {
    for (const context of ['menu', 'pause'] as const) {
      const model = buildLegacySettingsSheetModel(context, { buildStamp: stamp });
      const last = model.sections[model.sections.length - 1]!;
      expect(last.id).toBe('build-stamp');
      expect(last.rows.map((r) => [r.id, r.kind, r.label, r.role, r.command])).toEqual([
        ['build-stamp', 'note', stamp, 'chrome', null]
      ]);
      const plan = buildLegacySettingsSheetPlan({ context, height: 844, width: 390, buildStamp: stamp });
      const item = plan.items[plan.items.length - 1]!;
      expect(item.model.id).toBe('build-stamp');
      expect(item.interactive).toBe(false);
      expect(item.rect.height).toBe(LEGACY_SETTINGS_SIZES.noteHeight);
      expect(item.labelMaxLines).toBe(1);
    }
  });

  test('no stamp, no row: the sheet is unchanged without it', () => {
    for (const context of ['menu', 'pause'] as const) {
      const ids = buildLegacySettingsSheetModel(context, { buildStamp: '  ' }).sections.map((s) => s.id);
      expect(ids).not.toContain('build-stamp');
      expect(buildLegacySettingsSheetModel(context).sections.map((s) => s.id)).not.toContain('build-stamp');
    }
  });

  test('the stamp fits the phone sheet without scrolling and on one line', () => {
    for (const context of ['menu', 'pause'] as const) {
      const plan = buildLegacySettingsSheetPlan({ context, height: 844, width: 390, buildStamp: stamp });
      expect(plan.scrollable).toBe(false);
      const item = plan.items[plan.items.length - 1]!;
      // 13 px text averages well under 7 px a glyph; the line must fit the row width minus the 16 px text padding.
      expect(stamp.length * LEGACY_SETTINGS_SIZES.descriptionCharWidth).toBeLessThanOrEqual(item.rect.width - 16);
    }
  });

  test('no layout shift: the scene passes the stamp into the very plan it paints, computed once', () => {
    const scene = read('src/scenes/MenuScene.ts');
    expect(scene).toContain('buildStamp: resolveLegacyBuildStampText()');
    expect(scene).toMatch(/case 'note':\s*\n\s*\/\/ MAZER-FLOW-019/);
    expect(read('src/legacy-runtime/legacyBuildStamp.ts')).toContain('cachedLegacyBuildStampText ??=');
  });
});
